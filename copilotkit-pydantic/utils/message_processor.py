"""Message history processing and compaction utilities."""

import json
from collections import defaultdict
from typing import Any
from pydantic_ai import RunContext
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    SystemPromptPart,
    ToolCallPart,
    ToolReturnPart,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.ag_ui import StateDeps
from ag_ui.core import AssistantMessage, UserMessage, ToolMessage, ToolCall, FunctionCall, TextInputContent

from config import logger
from core.models import AgentState, UnifiedDeps
from pydantic_ai.models import ModelRequestParameters


def pydantic_to_agui_messages(pydantic_messages: list[ModelMessage]) -> list:
    """Convert Pydantic AI ModelMessages to AG-UI messages.
    
    Converts ModelRequest/ModelResponse to UserMessage/AssistantMessage/ToolMessage
    while preserving tool calls and returns. This conversion is needed because
    RunAgentInput.messages expects AG-UI format messages.
    
    Args:
        pydantic_messages: List of ModelMessage objects (ModelRequest, ModelResponse)
        
    Returns:
        List of AG-UI messages (UserMessage, AssistantMessage, ToolMessage)
        
    Note:
        - UserPromptPart in ModelRequest → UserMessage with TextInputContent
        - TextPart and ToolCallPart in ModelResponse → AssistantMessage with content and toolCalls
        - ToolReturnPart in ModelRequest → ToolMessage
        - No IDs are created - lets AG-UI handle message IDs
    """
    import uuid
    
    agui_messages = []
    
    for msg in pydantic_messages:
        # 1. USER MESSAGES & TOOL RETURNS (both in ModelRequest)
        if isinstance(msg, ModelRequest):
            # Extract text content from UserPromptPart and TextPart
            text_contents = []
            tool_returns = []
            
            for part in msg.parts:
                if isinstance(part, UserPromptPart):
                    text_contents.append(TextInputContent(text=part.content))
                elif isinstance(part, TextPart):
                    text_contents.append(TextInputContent(text=part.content))
                elif isinstance(part, ToolReturnPart):
                    # Tool returns become separate ToolMessage
                    tool_returns.append(part)
            
            # Add UserMessage if there's text content
            if text_contents:
                agui_messages.append(UserMessage(
                    id=str(uuid.uuid4()),
                    content=text_contents
                ))
            
            # Add ToolMessages for tool returns
            for tool_return in tool_returns:
                agui_messages.append(ToolMessage(
                    id=str(uuid.uuid4()),
                    toolCallId=str(tool_return.tool_call_id),
                    content=str(tool_return.content)
                ))
        
        # 2. ASSISTANT MESSAGES (Text & Tool Calls)
        elif isinstance(msg, ModelResponse):
            # Extract text content and tool calls
            text_parts = []
            tool_calls = []
            
            for part in msg.parts:
                if isinstance(part, TextPart):
                    text_parts.append(part.content)
                elif isinstance(part, ToolCallPart):
                    # Convert ToolCallPart to AG-UI ToolCall
                    tool_calls.append(ToolCall(
                        id=str(part.tool_call_id),
                        function=FunctionCall(
                            name=part.tool_name,
                            arguments=str(part.args) if isinstance(part.args, dict) else part.args
                        )
                    ))
            
            # Create AssistantMessage if there's content or tool calls
            if text_parts or tool_calls:
                content = ' '.join(text_parts) if text_parts else None
                agui_messages.append(AssistantMessage(
                    id=str(uuid.uuid4()),
                    content=content,
                    toolCalls=tool_calls if tool_calls else None
                ))
    
    return agui_messages


async def keep_recent_messages(
    ctx: RunContext[UnifiedDeps], 
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

    This function also removes orphaned tool_use blocks (ToolCallPart)
    that don't have corresponding tool_result blocks (ToolReturnPart) in subsequent messages.
    This prevents Anthropic API errors like:
    "messages.X: `tool_use` ids were found without `tool_result` blocks immediately after"

    The fix applies ONLY to older messages (not the last message) to preserve the
    ability for the current turn to complete tool execution.

    Reference: https://github.com/pydantic/pydantic-ai/issues/2050
    """

    # current_tokens = await ctx.model.count_tokens(messages, model_settings={}, model_request_parameters=ModelRequestParameters())
    # Error: AsyncAnthropicBedrock client does not support `count_tokens` api.

    logger.info(f"Message History Usage: {ctx.usage.total_tokens} = {ctx.usage.input_tokens} + {ctx.usage.output_tokens}")
    # logger.info(f"Current Tokens: {current_tokens.input_tokens} + {current_tokens.output_tokens}")

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

    def _normalize_content_for_signature(value: Any) -> str:
        try:
            if isinstance(value, (dict, list)):
                return json.dumps(value, sort_keys=True)[:256]
            return str(value)[:256]
        except Exception:
            return str(value)[:256]

    def _part_signature(part: Any) -> str:
        # Signature for duplicate detection; prefer id-based
        try:
            if isinstance(part, ToolReturnPart):
                tool_id = _get_tool_return_id(part)
                if tool_id:
                    return f"tool_return_id:{tool_id}"
                tool_name = getattr(part, 'tool_name', getattr(part, 'name', 'tool'))
                content = getattr(part, 'content', getattr(part, 'result', ''))
                content_str = _normalize_content_for_signature(content)
                return f"tool_return_sig:{tool_name}:{content_str}"
            if isinstance(part, RetryPromptPart) and getattr(part, 'tool_name', None):
                tool_id = _get_tool_return_id(part)
                if tool_id:
                    return f"retry_return_id:{tool_id}"
                tool_name = getattr(part, 'tool_name', 'tool')
                content = getattr(part, 'content', '')
                content_str = _normalize_content_for_signature(content)
                return f"retry_return_sig:{tool_name}:{content_str}"
            return part.__class__.__name__
        except Exception:
            return part.__class__.__name__

    def _is_tool_result_part(part: Any) -> bool:
        if isinstance(part, ToolReturnPart):
            return True
        if isinstance(part, RetryPromptPart):
            return getattr(part, 'tool_name', None) is not None
        return False

    # Build last occurrence maps using tool_call_id for both calls and returns
    def _iter_tool_return_sigs(msg: ModelMessage) -> list[str]:
        sigs: list[str] = []
        for part in getattr(msg, 'parts', []) or []:
            if _is_tool_result_part(part):
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
    keep_full_after_index = max(0, total_msgs - 2)  # keep only the last 2 messages untouched
    last_return_occurrence: dict[str, int] = {}
    last_call_occurrence: dict[str, int] = {}
    
    # Build map of tool_call_id -> message index where the corresponding tool return exists
    tool_return_exists: dict[str, int] = {}
    tool_return_occurrences: dict[str, list[int]] = defaultdict(list)
    
    for _idx, _msg in enumerate(messages):
        for part in getattr(_msg, 'parts', []) or []:
            if _is_tool_result_part(part):
                tool_call_id = _get_tool_return_id(part)
                if tool_call_id:
                    tool_return_exists[tool_call_id] = _idx
                    tool_return_occurrences[tool_call_id].append(_idx)
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
                if _is_tool_result_part(part):
                    # Per-message dedup ALWAYS enforced: keep only the latest return per tool_call_id
                    rid = _get_tool_return_id(part)
                    if rid is not None:
                        if rid in seen_return_ids_in_msg:
                            continue
                        seen_return_ids_in_msg.add(rid)
                    # For older messages, also truncate and apply cross-message dedup
                    if idx < keep_full_after_index:
                        if isinstance(part, ToolReturnPart):
                            # Only truncate for select tools
                            tool_name = getattr(part, 'tool_name', None)
                            
                            TRUNCATE_TOOL_NAMES = {
                                # Browser extension tools
                                'searchPageContent',
                                'searchFormData',
                                'searchDOMUpdates',
                                'searchClickableElements',
                                'takeScreenshot',
                                # Workspace tools - High Priority (large content)
                                'get_file_content',
                                'read_file',
                                'get_note_content',
                                'grep_files',
                                'update_file_content',
                                # Workspace tools - Medium Priority (large lists)
                                'search_workspace_files',
                                'search_workspace_notes',
                                'list_files',
                                'glob_files',
                                # Databricks - High Priority (large content)
                                'get_notebook',
                                'get_notebook_cells',
                                'execute_statement',
                                'get_statement',
                                'get_statement_result_chunk',
                                'execute_command',
                                'get_command_status',
                                'get_run_output',
                                'export_run',
                                # Databricks - Medium Priority (large lists/metadata)
                                'list_notebooks',
                                'list_directories',
                                'list_query_history',
                                'list_jobs',
                                'list_runs',
                                'list_clusters',
                                'get_job',
                                'get_run',
                                # Unity Catalog tools
                                'list_tables',
                                'list_table_summaries',
                                'list_schemas',
                                'list_catalogs',
                                'list_functions',
                                'list_volumes',
                                # Machine Learning tools
                                'search_runs',
                                'list_experiments',
                                'list_models',
                                'list_model_versions',
                                # Pipeline tools
                                'list_pipelines',
                                'list_pipeline_updates',
                            }
                            
                            # Check if any truncate tool name appears in the full tool name
                            # This handles MCP prefixed names like "databricks_list_query_history"
                            should_truncate = tool_name and any(
                                truncate_name in tool_name for truncate_name in TRUNCATE_TOOL_NAMES
                            )
                            
                            if hasattr(part, 'content') and should_truncate:
                                try:
                                    if isinstance(part.content, (dict, list)):
                                        text = json.dumps(part.content)
                                        part.content = _truncate_text(text, limit=100, keep=90)
                                    else:
                                        part.content = _truncate_text(str(part.content), limit=100, keep=90)
                                except Exception:
                                    pass
                            elif hasattr(part, 'result') and should_truncate:
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
                    if cid is not None:
                        if idx < keep_full_after_index:
                            if last_call_occurrence.get(cid, idx) != idx:
                                continue
                        # CRITICAL FIX: Drop tool_use blocks without corresponding tool_result immediately after
                        # This prevents Anthropic API rejection for orphaned or misordered tool_use blocks
                        occurrences = tool_return_occurrences.get(cid, [])
                        if not occurrences:
                            logger.warning(
                                f"Dropping orphaned tool_use with id={cid} at message {idx} (no corresponding tool_result found)"
                            )
                            continue
                        immediate_next_idx = idx + 1
                        if immediate_next_idx not in occurrences:
                            next_occurrence = next((pos for pos in occurrences if pos > idx), None)
                            if next_occurrence is None:
                                logger.warning(
                                    f"Dropping tool_use with id={cid} at message {idx} (tool_result missing after this call)"
                                )
                            else:
                                logger.warning(
                                    f"Dropping tool_use with id={cid} at message {idx} (tool_result appears at message {next_occurrence}, not immediately after)"
                                )
                            continue
                    new_parts_rev.append(part)
                    continue

                # Non-tool parts: include as-is
                new_parts_rev.append(part)

            new_parts = list(reversed(new_parts_rev))

            # Skip messages that have no parts after sanitization (e.g., all tool calls were orphaned)
            if not new_parts:
                logger.warning(f"Skipping message {idx} - all parts were removed during sanitization")
                continue

            if hasattr(msg, 'parts'):
                try:
                    msg.parts = new_parts
                except Exception:
                    # If parts is read-only, create a shallow copy with updated parts when possible
                    pass
        except Exception as e:
            # On any error, keep the message as-is
            logger.warning(f"Error sanitizing message {idx}: {e}")
            pass
        sanitized_messages.append(msg)

    # Continue with compaction on sanitized list
    # --- Post-sanitization: ensure tool results still have matching tool uses ---
    def _collect_prev_call_ids(msg_list: list[ModelMessage], index: int) -> set[str]:
        if index <= 0:
            return set()
        return set(_iter_tool_call_ids(msg_list[index - 1]))

    post_validated_messages: list[ModelMessage] = []
    for idx, msg in enumerate(sanitized_messages):
        prev_call_ids = _collect_prev_call_ids(sanitized_messages, idx)
        try:
            original_parts = (getattr(msg, 'parts', []) or [])
            filtered_parts: list[Any] = []
            for part in original_parts:
                if _is_tool_result_part(part):
                    rid = _get_tool_return_id(part)
                    if rid is None:
                        logger.warning(
                            f"Dropping {type(part).__name__} without tool_call_id at message {idx}"
                        )
                        continue
                    if rid not in prev_call_ids:
                        logger.warning(
                            f"Dropping {type(part).__name__} with id={rid} at message {idx} "
                            "(no matching tool_use in previous message)"
                        )
                        continue
                filtered_parts.append(part)

            if not filtered_parts:
                logger.warning(
                    f"Skipping message {idx} - all parts removed during tool_result validation"
                )
                continue

            if hasattr(msg, 'parts'):
                try:
                    msg.parts = filtered_parts
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Error validating tool results for message {idx}: {e}")
        post_validated_messages.append(msg)

    messages = post_validated_messages

    # Ensure history ends with ModelRequest (workaround for pydantic-ai issue #2778)
    def _ensure_ends_with_request(msgs: list[ModelMessage]) -> list[ModelMessage]:
        """Ensure the message history ends with a ModelRequest.
        
        Reference: https://github.com/pydantic/pydantic-ai/issues/2778#issuecomment-3249642627
        """
        if not msgs:
            return [ModelRequest(parts=[])]
        if not isinstance(msgs[-1], ModelRequest):
            logger.info("Appending synthetic ModelRequest(parts=[]) to ensure history ends with ModelRequest")
            return msgs + [ModelRequest(parts=[])]
        return msgs

    message_window = 150

    if len(messages) <= message_window:
        logger.info(f"Returning {len(messages)} messages (<={message_window})")
        return _ensure_ends_with_request(messages)

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
        if any(_is_tool_result_part(part) for part in first_message.parts):
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
        return _ensure_ends_with_request(result)

    # No safe cut point found, keep all messages
    logger.info(f"Returning {len(messages)} messages (no safe cut)")
    return _ensure_ends_with_request(messages)

