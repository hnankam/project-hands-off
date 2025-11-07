"""Message history processing and compaction utilities."""

import json
import re
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
    UserPromptPart,
)
from pydantic_ai.ag_ui import StateDeps

from config import logger
from core.models import AgentState


async def process_message_attachments(
    ctx: RunContext[StateDeps[AgentState]], 
    messages: list[ModelMessage]
) -> list[ModelMessage]:
    """Process user messages with attachment manifests.
    
    This history processor runs before messages are sent to the model.
    It transforms user messages that contain attachment manifests into
    Claude's structured content format with text, image, and document parts.
    
    Processes both UserPromptPart and ToolReturnPart (for screenshots) within ModelRequest messages.
    
    Only processes attachments in the MOST RECENT user message to avoid
    re-processing historical attachments that have already been sent to the API.
    
    Args:
        ctx: The run context (not used but required by history processor signature)
        messages: List of messages to process
        
    Returns:
        List of messages with attachments transformed
    """
    processed_messages: list[ModelMessage] = []
    
    # Find the index of the last ModelRequest (most recent user message)
    last_request_idx = -1
    for idx, message in enumerate(messages):
        if isinstance(message, ModelRequest):
            last_request_idx = idx
    
    logger.debug(f"[process_message_attachments] Last ModelRequest index: {last_request_idx} out of {len(messages)} messages")
    
    for idx, message in enumerate(messages):
        # Only process ModelRequest messages (user messages)
        if not isinstance(message, ModelRequest):
            processed_messages.append(message)
            continue
        
        is_last_request = (idx == last_request_idx)
        
        # Check if any parts contain attachment manifest
        new_parts = []
        has_attachments = False
        
        for part in message.parts:
            # Process both UserPromptPart and ToolReturnPart
            if isinstance(part, UserPromptPart) and isinstance(part.content, str):
                content = part.content
                # Parse manifest (only log for latest message)
                clean_text, attachments = parse_attachment_manifest(content, log_parse=is_last_request)
                
                if not attachments:
                    # No attachments, keep original part
                    new_parts.append(part)
                    continue
                
                # Only process attachments for the most recent user message
                # For historical messages, remove manifest but don't re-create attachment references
                if not is_last_request:
                    # Historical message - attachments already processed, just keep clean text
                    if clean_text.strip():
                        new_parts.append(UserPromptPart(content=clean_text))
                    logger.debug(f"Skipping {len(attachments)} historical attachment(s) in manifest (already processed)")
                    continue
                
                has_attachments = True
                
                # Create new UserPromptPart with just the clean text
                if clean_text.strip():
                    new_parts.append(UserPromptPart(content=clean_text))
                
                # Add attachment parts
                for attachment in attachments:
                    name = attachment.get('name', 'attachment')
                    mime_type = attachment.get('type', 'application/octet-stream')
                    url = attachment.get('url', '')
                    
                    if not url:
                        logger.warning(f"Skipping attachment '{name}' with no URL")
                        continue
                    
                    # Create a descriptive text block about the attachment
                    if mime_type.startswith('image/'):
                        desc = f"[Image: {name} - {url}]"
                    else:
                        desc = f"[Document: {name} ({mime_type}) - {url}]"
                    
                    new_parts.append(UserPromptPart(content=desc))
                    logger.info(f"Processed NEW attachment: {name} ({mime_type})")
                    
            elif isinstance(part, ToolReturnPart) and isinstance(part.content, str):
                content = part.content
                logger.debug(f"[ToolReturnPart] tool={part.tool_name}, content_length={len(content)}, has_manifest={'<!--ATTACHMENTS:' in content}")
                # Parse manifest (only log for latest message)
                clean_text, attachments = parse_attachment_manifest(content, log_parse=is_last_request)
                
                logger.debug(f"[ToolReturnPart] Found {len(attachments)} attachments after parsing")
                
                if not attachments:
                    # No attachments, keep original part
                    new_parts.append(part)
                    continue
                
                # Only process attachments for the most recent message
                if not is_last_request:
                    # Historical message - attachments already processed, just keep clean text
                    new_parts.append(ToolReturnPart(
                        tool_name=part.tool_name,
                        content=clean_text,
                        tool_call_id=part.tool_call_id,
                        timestamp=part.timestamp
                    ))
                    logger.debug(f"Skipping {len(attachments)} historical attachment(s) in tool return (already processed)")
                    continue
                
                has_attachments = True
                
                # Keep the cleaned tool return
                new_parts.append(ToolReturnPart(
                    tool_name=part.tool_name,
                    content=clean_text,
                    tool_call_id=part.tool_call_id,
                    timestamp=part.timestamp
                ))
                
                # Add attachment references as UserPromptPart
                for attachment in attachments:
                    name = attachment.get('name', 'attachment')
                    mime_type = attachment.get('type', 'application/octet-stream')
                    url = attachment.get('url', '')
                    
                    if not url:
                        logger.warning(f"Skipping attachment '{name}' with no URL in tool return")
                        continue
                    
                    # Create a descriptive text block about the attachment
                    if mime_type.startswith('image/'):
                        desc = f"[Image: {name} - {url}]"
                    else:
                        desc = f"[Document: {name} ({mime_type}) - {url}]"
                    
                    new_parts.append(UserPromptPart(content=desc))
                    logger.info(f"Processed NEW tool return attachment: {name} ({mime_type})")
                    logger.debug(f"  Image reference created: {desc[:100]}...")
            else:
                new_parts.append(part)
        
        # If we modified any parts (either new attachments or cleaned historical ones), create new message
        if new_parts and new_parts != list(message.parts):
            new_message = ModelRequest(
                parts=new_parts,
                instructions=message.instructions,
            )
            processed_messages.append(new_message)
            if has_attachments:
                logger.info(f"Transformed message with NEW attachments into {len(new_parts)} parts")
                # Log the parts for debugging
                for i, part in enumerate(new_parts):
                    part_type = type(part).__name__
                    if isinstance(part, UserPromptPart):
                        content_preview = part.content[:100] if isinstance(part.content, str) else str(part.content)[:100]
                        logger.debug(f"  Part {i}: {part_type} - content: {content_preview}...")
                    elif isinstance(part, ToolReturnPart):
                        content_preview = part.content[:100] if isinstance(part.content, str) else str(part.content)[:100]
                        logger.debug(f"  Part {i}: {part_type} ({part.tool_name}) - content: {content_preview}...")
                    else:
                        logger.debug(f"  Part {i}: {part_type}")
        else:
            processed_messages.append(message)
    
    logger.info(f"[process_message_attachments] Completed. Returning {len(processed_messages)} messages")
    return processed_messages


def parse_attachment_manifest(content: str, log_parse: bool = False) -> tuple[str, list[dict[str, Any]]]:
    """Parse attachment manifest from user message content.
    
    Extracts the <!--ATTACHMENTS: [...] --> block from message content,
    parses the JSON manifest, and returns the clean text and attachments list.
    
    Handles both plain text and JSON-escaped content (from tool returns).
    
    Args:
        content: The raw user message content (may include manifest)
        log_parse: Whether to log the parsing (only for new attachments, not historical)
        
    Returns:
        Tuple of (clean_text, attachments_list)
        - clean_text: Message content with manifest removed
        - attachments_list: List of attachment dicts with name, type, size, url
        
    Example manifest format:
        <!--ATTACHMENTS:
        [
            {
                "name": "document.pdf",
                "type": "application/pdf",
                "size": 1024000,
                "url": "https://firebase.storage.url/..."
            }
        ]
        -->
    """
    logger.debug(f"[parse_manifest] Parsing content (length={len(content)}), starts_with_brace={content.startswith('{')}")
    
    # If content looks like a JSON string (from tool return), try to decode it first
    decoded_content = content
    if content.startswith('{'):
        try:
            # Try to parse as JSON object (tool returns are JSON strings)
            json_obj = json.loads(content)
            # If it's a JSON object with a 'message' field, extract it
            if isinstance(json_obj, dict) and 'message' in json_obj:
                decoded_content = json_obj['message']
                logger.debug(f"[parse_manifest] Decoded JSON tool return, extracted message field")
            else:
                decoded_content = content
        except (json.JSONDecodeError, ValueError):
            # Not JSON, use original
            decoded_content = content
    
    # Pattern to match the attachment manifest block
    manifest_pattern = r'<!--ATTACHMENTS:\s*(\[.*?\])\s*-->'
    
    match = re.search(manifest_pattern, decoded_content, re.DOTALL)
    if not match:
        if '<!--ATTACHMENTS:' in decoded_content:
            logger.debug(f"[parse_manifest] Found ATTACHMENTS marker but regex didn't match. Content preview: {decoded_content[:200]}")
        return content, []
    
    try:
        # Parse the JSON manifest
        manifest_json = match.group(1)
        logger.debug(f"[parse_manifest] Extracted manifest JSON: {manifest_json[:200]}...")
        attachments = json.loads(manifest_json)
        
        # Remove the manifest block from decoded content
        clean_decoded = re.sub(manifest_pattern, '', decoded_content, flags=re.DOTALL).strip()
        
        # If original content was JSON, reconstruct it with cleaned message
        if content.startswith('{') and decoded_content != content:
            try:
                json_obj = json.loads(content)
                if isinstance(json_obj, dict) and 'message' in json_obj:
                    json_obj['message'] = clean_decoded
                    clean_text = json.dumps(json_obj)
                else:
                    clean_text = clean_decoded
            except (json.JSONDecodeError, ValueError):
                clean_text = clean_decoded
        else:
            clean_text = clean_decoded
        
        if log_parse:
            logger.info(f"Parsed attachment manifest: {len(attachments)} attachments")
        logger.debug(f"[parse_manifest] Successfully parsed {len(attachments)} attachments")
        return clean_text, attachments
        
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse attachment manifest: {e}")
        # Return original content if parsing fails
        return content, []


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

    CRITICAL FIX: This function also removes orphaned tool_use blocks (ToolCallPart)
    that don't have corresponding tool_result blocks (ToolReturnPart) in subsequent messages.
    This prevents Anthropic API errors like:
    "messages.X: `tool_use` ids were found without `tool_result` blocks immediately after"

    The fix applies ONLY to older messages (not the last message) to preserve the
    ability for the current turn to complete tool execution.

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
    keep_full_after_index = max(0, total_msgs - 1)  # keep only the last message untouched
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
        return result

    # No safe cut point found, keep all messages
    logger.info(f"Returning {len(messages)} messages (no safe cut)")
    return messages

