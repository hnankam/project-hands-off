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


async def get_model_config_from_agent(ctx: RunContext) -> tuple[dict, ModelRequestParameters]:
    """Extract model settings and tools from agent for accurate token counting.
    
    Args:
        ctx: RunContext with access to agent via ctx.deps.adapter.agent
        
    Returns:
        Tuple of (model_settings dict, ModelRequestParameters with function_tools)
    """
    model_settings = {}
    function_tools = []
    
    if hasattr(ctx.deps, 'adapter') and ctx.deps.adapter is not None:
        agent = getattr(ctx.deps.adapter, 'agent', None)
        if agent is not None:
            # Extract model settings from agent
            model_settings = getattr(agent, 'model_settings', {}) or {}
            
            # Extract tools from agent using _get_toolset and get_tools(ctx)
            try:
                # Get the combined toolset from agent
                toolset = agent._get_toolset()
                
                # Get tools dict using the current context (async call)
                tools_dict = await toolset.get_tools(ctx)
                # logger.debug(f"Got {len(tools_dict)} tools from agent")
                
                # Extract ToolDefinition from each tool object
                # _CombinedToolsetTool stores the ToolDefinition in its constructor
                for tool_name, tool in tools_dict.items():
                    try:
                        # Check for common attribute names where ToolDefinition might be stored
                        tool_def = None
                        
                        # Try various attribute names
                        for attr_name in ['tool_def', '_tool_def', 'definition', '_definition']:
                            if hasattr(tool, attr_name):
                                tool_def = getattr(tool, attr_name)
                                break
                        
                        if tool_def is not None:
                            function_tools.append(tool_def)
                        else:
                            # Debug: Log first tool's attributes to understand structure
                            if len(function_tools) == 0:
                                attrs = [a for a in dir(tool) if not a.startswith('__')]
                                # logger.debug(f"First tool '{tool_name}' attributes: {attrs[:20]}")
                    except Exception as e:
                        logger.debug(f"Could not extract tool definition for {tool_name}: {e}")
                
                # logger.info(f"Extracted {len(function_tools)} function tools from agent")
            except Exception as e:
                logger.debug(f"Could not extract tools from agent: {e}")
                # It's okay if we can't get tools - token counting will still work
    
    # Create ModelRequestParameters with extracted tools
    model_request_params = ModelRequestParameters(function_tools=function_tools)
    
    return model_settings, model_request_params


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

    # Get model settings and tools from agent (via adapter) for accurate token counting
    model_settings, model_request_params = await get_model_config_from_agent(ctx)
    
    try:
        # logger.info(f"Model Settings: {model_settings}")
        # logger.info(f"Model Request Parameters: {model_request_params}")
        current_tokens = await ctx.model.count_tokens(messages, model_settings=model_settings, model_request_parameters=model_request_params)
        logger.info(f"Current Tokens: {current_tokens}")
    except Exception as e:
        logger.debug(f"Token counting not supported or failed: {e}")
    # Note: AsyncAnthropicBedrock client does not support `count_tokens` api.
    # We rely on ctx.usage from actual API responses instead.

    logger.info(f"Message History Usage: {ctx.usage.total_tokens} = {ctx.usage.input_tokens} + {ctx.usage.output_tokens}")

    # --- Pre-sanitization: drop duplicates within a message ---
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
                    # For older messages, also apply cross-message dedup
                    if idx < keep_full_after_index:
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
                        # Don't drop tool_use blocks yet - we'll validate after re-indexing
                        # The indices in tool_return_occurrences become stale after skipping empty messages
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

    # --- Re-validate tool_use/tool_result pairs after skipping empty messages ---
    # Now that we have the actual message list (with empty messages skipped),
    # we need to validate that each tool_use has a tool_result immediately after
    # using the NEW indices
    
    # Rebuild tool_return_occurrences with correct indices
    tool_return_occurrences_reindexed: dict[str, list[int]] = defaultdict(list)
    for _idx, _msg in enumerate(sanitized_messages):
        for part in getattr(_msg, 'parts', []) or []:
            if _is_tool_result_part(part):
                tool_call_id = _get_tool_return_id(part)
                if tool_call_id:
                    tool_return_occurrences_reindexed[tool_call_id].append(_idx)
    
    # Validate tool_use blocks have tool_result immediately after
    revalidated_messages: list[ModelMessage] = []
    for idx, msg in enumerate(sanitized_messages):
        try:
            original_parts = (getattr(msg, 'parts', []) or [])
            filtered_parts: list[Any] = []
            
            for part in original_parts:
                # Check tool_use blocks
                if isinstance(part, ToolCallPart):
                    cid = None
                    try:
                        cid = getattr(part, 'tool_call_id', None)
                        if isinstance(cid, (str, int)):
                            cid = str(cid)
                    except Exception:
                        pass
                    
                    if cid is not None:
                        # CRITICAL: Every tool_use must have tool_result immediately after
                        occurrences = tool_return_occurrences_reindexed.get(cid, [])
                        immediate_next_idx = idx + 1
                        
                        if not occurrences:
                            # Only drop if we're NOT in the last message
                            # (last message may be mid-execution, waiting for tool result)
                            if idx < len(sanitized_messages) - 1:
                                logger.warning(
                                    f"Dropping orphaned tool_use with id={cid} at message {idx} "
                                    "(no corresponding tool_result found)"
                                )
                                continue
                        elif immediate_next_idx not in occurrences:
                            # Only drop if we're NOT in the last message
                            if idx < len(sanitized_messages) - 1:
                                next_occurrence = next((pos for pos in occurrences if pos > idx), None)
                                if next_occurrence is None:
                                    logger.warning(
                                        f"Dropping tool_use with id={cid} at message {idx} "
                                        "(tool_result missing after this call)"
                                    )
                                else:
                                    logger.warning(
                                        f"Dropping tool_use with id={cid} at message {idx} "
                                        f"(tool_result appears at message {next_occurrence}, not immediately after)"
                                    )
                                continue
                
                filtered_parts.append(part)
            
            # Skip messages that have no parts after revalidation
            if not filtered_parts:
                logger.warning(f"Skipping message {idx} - all parts removed during revalidation")
                continue
            
            if hasattr(msg, 'parts'):
                try:
                    msg.parts = filtered_parts
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Error revalidating message {idx}: {e}")
        
        revalidated_messages.append(msg)
    
    sanitized_messages = revalidated_messages

    # Continue with compaction on sanitized list
    # --- Final validation: ensure tool results have matching tool uses in previous message ---
    def _collect_prev_call_ids(msg_list: list[ModelMessage], index: int) -> set[str]:
        """Collect tool call IDs from the previous message."""
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
                    # Tool result must have matching tool_use in immediately previous message
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

    # Dynamic message window based on token usage
    # Aggressive cutting when over 1.2M tokens, gentle cutting when over 200k
    skip_safe_cut_search = False  # Flag to skip safe cut search (used for first message)
    
    if ctx.usage.input_tokens > 1_000_000:
        # High token usage: Keep 90% of messages (cut 10% from the beginning)
        target_messages_to_keep = int(len(messages) * 0.90)
        logger.info(f"Token usage {ctx.usage.input_tokens} > 1M, targeting 90% of messages ({target_messages_to_keep}/{len(messages)})")
        
        if len(messages) <= target_messages_to_keep:
            logger.info(f"Returning {len(messages)} messages (<={target_messages_to_keep})")
            return _ensure_ends_with_request(messages)
    elif ctx.usage.input_tokens > 200_000:
        # Moderate token usage: Keep 99.5% of messages (cut 0.5% from the beginning)
        target_messages_to_keep = int(len(messages) * 0.995)
        logger.info(f"Token usage {ctx.usage.input_tokens} > 200k, targeting 99.5% of messages ({target_messages_to_keep}/{len(messages)})")
        
        if len(messages) <= target_messages_to_keep:
            logger.info(f"Returning {len(messages)} messages (<={target_messages_to_keep})")
            return _ensure_ends_with_request(messages)
    else:
        # Under token limit - return all messages without cutting
        # Special case: first message (token usage = 0) - limit to 200 messages max
        if ctx.usage.input_tokens == 0 and len(messages) > 150:
            logger.info(f"First message with {len(messages)} messages, forcing cut to 150")
            # For first message, skip safe cut search and go directly to forced cut
            skip_safe_cut_search = True
            target_messages_to_keep = 150
        else:
            logger.info(f"Token usage {ctx.usage.input_tokens} <= 200k, returning all {len(messages)} messages")
            return _ensure_ends_with_request(messages)
    
    # Find system prompt if it exists
    system_prompt = None
    system_prompt_index = None
    for i, msg in enumerate(messages):
        if isinstance(msg, ModelRequest) and any(isinstance(part, SystemPromptPart) for part in msg.parts):
            system_prompt = msg
            system_prompt_index = i
            break
    
    # Calculate target cut point (remove oldest messages)
    target_cut = len(messages) - target_messages_to_keep
    
    # Try to find a safe cut in the messages that will be removed
    # (skip this for first message - go directly to forced cut)
    if not skip_safe_cut_search:
        # Search only within messages before target_cut, but EXCLUDE index 0
        # (index 0 would keep all messages, defeating the purpose of cutting)
        logger.info(f"Searching for safe cut point in messages [1:{target_cut}]")
        
        safe_cut_found = None
        for cut_index in range(target_cut, 0, -1):  # Stop at 1, not 0
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
            safe_cut_found = cut_index
            logger.info(f"Found safe cut at index={cut_index}, will keep {len(messages) - cut_index} messages")
            break
        
        # If safe cut found (and it's not index 0), use it
        if safe_cut_found is not None and safe_cut_found > 0:
            result = messages[safe_cut_found:]
            
            # If we cut off the system prompt, prepend it back
            if system_prompt is not None and system_prompt_index is not None and safe_cut_found > system_prompt_index:
                result = [system_prompt] + result
            
            logger.info(f"Returning {len(result)} messages after safe cut")
            return _ensure_ends_with_request(result)
        
        # No safe cut found - force cut at target_cut and clean up orphaned tool returns
        logger.warning(f"No safe cut found, forcing cut at index={target_cut} and cleaning orphaned tool returns")
    
    # Collect all tool_call_ids that exist in the messages being removed
    removed_messages = messages[:target_cut]
    removed_tool_call_ids = set()
    for msg in removed_messages:
        for part in getattr(msg, 'parts', []) or []:
            if isinstance(part, ToolCallPart):
                try:
                    call_id = getattr(part, 'tool_call_id', None)
                    if isinstance(call_id, (str, int)):
                        removed_tool_call_ids.add(str(call_id))
                except Exception:
                    pass
    
    logger.info(f"Found {len(removed_tool_call_ids)} tool call IDs in removed messages")
    
    # Keep messages from target_cut onward, but remove orphaned tool returns
    kept_messages = messages[target_cut:]
    cleaned_messages = []
    
    for idx, msg in enumerate(kept_messages):
        original_parts = getattr(msg, 'parts', []) or []
        cleaned_parts = []
        
        for part in original_parts:
            # Check if this is a tool return for a removed tool call
            if _is_tool_result_part(part):
                tool_call_id = _get_tool_return_id(part)
                if tool_call_id and tool_call_id in removed_tool_call_ids:
                    logger.info(f"Removing orphaned tool return with id={tool_call_id} at message {idx}")
                    continue
            
            cleaned_parts.append(part)
        
        # Only keep message if it has parts after cleaning
        if cleaned_parts:
            if hasattr(msg, 'parts'):
                try:
                    msg.parts = cleaned_parts
                except Exception:
                    pass
            cleaned_messages.append(msg)
        else:
            logger.info(f"Skipping message {idx} - all parts were orphaned tool returns")
    
    # If we cut off the system prompt, prepend it back
    if system_prompt is not None and system_prompt_index is not None and target_cut > system_prompt_index:
        cleaned_messages = [system_prompt] + cleaned_messages
    
    logger.info(f"Returning {len(cleaned_messages)} messages after forced cut and cleanup")
    return _ensure_ends_with_request(cleaned_messages)

