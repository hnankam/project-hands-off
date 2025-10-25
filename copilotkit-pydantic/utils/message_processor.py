"""Message history processing and compaction utilities."""

import json
from typing import Any
from pydantic_ai import RunContext
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    SystemPromptPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.ag_ui import StateDeps

from config import logger
from core.models import AgentState


async def keep_recent_messages(
    ctx: RunContext[StateDeps[AgentState]], 
    messages: list[ModelMessage]
) -> list[ModelMessage]:
    """Keep only recent messages while preserving AI model message ordering rules.

    Most AI models require proper sequencing of:
    - Tool/function calls and their corresponding returns
    - User messages and model responses
    - Multi-turn conversations with proper context

    This means we cannot cut conversation history in a way that:
    - Leaves tool calls without their corresponding returns
    - Separates paired messages inappropriately
    - Breaks the logical flow of multi-turn interactions

    Reference: https://github.com/pydantic/pydantic-ai/issues/2050
    """

    # for index, message in enumerate(messages):
    #     logger.info(f"Message {index}: {message}")

    logger.info(f"Message History Usage: {ctx.usage.total_tokens} = {ctx.usage.input_tokens} + {ctx.usage.output_tokens}")

    # --- Pre-sanitization: trim oversized tool results and drop duplicates within a message ---
    def _truncate_text(text: str, limit: int = 2000, keep: int = 1800) -> str:
        if not isinstance(text, str):
            return text
        if len(text) <= limit:
            return text
        return text[:keep] + f"... (truncated {len(text) - keep} chars)"

    def _get_tool_return_id(part: Any) -> str | None:
        """Return the canonical tool return identifier.
        According to Pydantic AI, BaseToolReturnPart exposes `tool_call_id`.
        """
        try:
            val = getattr(part, 'tool_call_id', None)
            if isinstance(val, (str, int)):
                return str(val)
        except Exception:
            pass
        return None

    def _part_signature(part: Any) -> str:
        # Signature for duplicate detection; prefer id-based
        try:
            if isinstance(part, ToolReturnPart):
                tool_id = _get_tool_return_id(part)
                if tool_id:
                    return f"tool_return_id:{tool_id}"
                tool_name = getattr(part, 'tool_name', getattr(part, 'name', 'tool'))
                content = getattr(part, 'content', getattr(part, 'result', ''))
                if isinstance(content, (dict, list)):
                    content_str = json.dumps(content)[:256]
                else:
                    content_str = str(content)[:256]
                return f"tool_return_sig:{tool_name}:{content_str}"
            return part.__class__.__name__
        except Exception:
            return part.__class__.__name__

    # Build last occurrence maps using tool_call_id for both calls and returns
    def _iter_tool_return_sigs(msg: ModelMessage) -> list[str]:
        sigs: list[str] = []
        for part in getattr(msg, 'parts', []) or []:
            if isinstance(part, ToolReturnPart):
                sigs.append(_part_signature(part))
        return sigs

    def _iter_tool_call_ids(msg: ModelMessage) -> list[str]:
        ids: list[str] = []
        for part in getattr(msg, 'parts', []) or []:
            if isinstance(part, ToolCallPart):
                try:
                    call_id = getattr(part, 'tool_call_id', None)
                    if isinstance(call_id, (str, int)):
                        ids.append(str(call_id))
                except Exception:
                    continue
        return ids

    total_msgs = len(messages)
    keep_full_after_index = max(0, total_msgs - 1)  # keep only the last message untouched
    last_return_occurrence: dict[str, int] = {}
    last_call_occurrence: dict[str, int] = {}
    for _idx, _msg in enumerate(messages):
        for sig in _iter_tool_return_sigs(_msg):
            last_return_occurrence[sig] = _idx
        for cid in _iter_tool_call_ids(_msg):
            last_call_occurrence[cid] = _idx

    sanitized_messages: list[ModelMessage] = []
    for idx, msg in enumerate(messages):
        try:
            # Build new parts with per-message de-duplication (by tool_call_id), while
            # keeping the most recent occurrence. Process in reverse and reverse back.
            original_parts = (getattr(msg, 'parts', []) or [])
            seen_return_ids_in_msg: set[str] = set()
            seen_call_ids_in_msg: set[str] = set()
            new_parts_rev: list[Any] = []
            for part in reversed(original_parts):
                if isinstance(part, ToolReturnPart):
                    # Per-message dedup ALWAYS enforced: keep only the latest return per tool_call_id
                    rid = _get_tool_return_id(part)
                    if rid is not None:
                        if rid in seen_return_ids_in_msg:
                            continue
                        seen_return_ids_in_msg.add(rid)
                    # For older messages, also truncate and apply cross-message dedup
                    if idx < keep_full_after_index:
                        # Only truncate for select tools (match frontend behavior)
                        tool_name = getattr(part, 'tool_name', None)
                        TRUNCATE_TOOL_NAMES = {
                            'searchPageContent',
                            'searchFormData',
                            'searchDOMUpdates',
                            'searchClickableElements',
                            'takeScreenshot',
                        }
                        if hasattr(part, 'content') and tool_name in TRUNCATE_TOOL_NAMES:
                            try:
                                if isinstance(part.content, (dict, list)):
                                    text = json.dumps(part.content)
                                    part.content = _truncate_text(text, limit=100, keep=90)
                                else:
                                    part.content = _truncate_text(str(part.content), limit=100, keep=90)
                            except Exception:
                                pass
                        elif hasattr(part, 'result') and tool_name in TRUNCATE_TOOL_NAMES:
                            try:
                                if isinstance(part.result, (dict, list)):
                                    text = json.dumps(part.result)
                                    part.result = _truncate_text(text, limit=100, keep=90)
                                else:
                                    part.result = _truncate_text(str(part.result), limit=100, keep=90)
                            except Exception:
                                pass
                        sig = _part_signature(part)
                        if last_return_occurrence.get(sig, idx) != idx:
                            continue
                    new_parts_rev.append(part)
                    continue

                if isinstance(part, ToolCallPart):
                    # Per-message dedup ALWAYS enforced: keep only the latest call per tool_call_id
                    cid = None
                    try:
                        cid = getattr(part, 'tool_call_id', None)
                        if isinstance(cid, (str, int)):
                            cid = str(cid)
                    except Exception:
                        cid = None
                    if cid is not None:
                        if cid in seen_call_ids_in_msg:
                            continue
                        seen_call_ids_in_msg.add(cid)
                    # For older messages, drop older duplicates across messages
                    if idx < keep_full_after_index and cid is not None:
                        if last_call_occurrence.get(cid, idx) != idx:
                            continue
                    new_parts_rev.append(part)
                    continue

                # Non-tool parts: include as-is
                new_parts_rev.append(part)

            new_parts = list(reversed(new_parts_rev))

            if hasattr(msg, 'parts'):
                try:
                    msg.parts = new_parts
                except Exception:
                    # If parts is read-only, create a shallow copy with updated parts when possible
                    pass
        except Exception:
            # On any error, keep the message as-is
            pass
        sanitized_messages.append(msg)

    # Continue with compaction on sanitized list
    messages = sanitized_messages

    message_window = 100

    if len(messages) <= message_window:
        logger.info(f"Returning {len(messages)} messages (<={message_window})")
        return messages

    logger.info(f"Compacting history with window={message_window}")

    # Find system prompt if it exists
    system_prompt = None
    system_prompt_index = None
    for i, msg in enumerate(messages):
        if isinstance(msg, ModelRequest) and any(isinstance(part, SystemPromptPart) for part in msg.parts):
            system_prompt = msg
            system_prompt_index = i
            break
    
    # Start at target cut point and search backward (upstream) for a safe cut
    target_cut = len(messages) - message_window

    for cut_index in range(target_cut, -1, -1):
        first_message = messages[cut_index]

        # Skip if first message has tool returns (orphaned without calls)
        if any(isinstance(part, ToolReturnPart) for part in first_message.parts):
            continue

        # Skip if first message has tool calls (violates AI model ordering rules)
        if isinstance(first_message, ModelResponse) and any(
            isinstance(part, ToolCallPart) for part in first_message.parts
        ):
            continue

        # Found a safe cut point
        logger.info(f"Found safe cut at index={cut_index}")
        result = messages[cut_index:]

        # If we cut off the system prompt, prepend it back
        if system_prompt is not None and system_prompt_index is not None and cut_index > system_prompt_index:
            result = [system_prompt] + result

        logger.info(f"Returning {len(result)} messages after cut")
        return result

    # No safe cut point found, keep all messages
    logger.info(f"Returning {len(messages)} messages (no safe cut)")
    return messages

