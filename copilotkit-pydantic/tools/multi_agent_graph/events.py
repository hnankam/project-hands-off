"""Event processing for multi-agent graph sub-agents.

This module handles capturing and processing AG-UI events from sub-agent
executions, including streaming text and tool calls.
"""

from __future__ import annotations

import time
from typing import Any, TYPE_CHECKING

from config import logger
from .types import QueryState, ToolCallInfo
from .state import send_graph_state_snapshot

if TYPE_CHECKING:
    from anyio.streams.memory import MemoryObjectSendStream


async def process_sub_agent_events(
    event_stream,
    state: QueryState,
    node_name: str,
    send_stream: MemoryObjectSendStream[str] | None,
    shared_state: Any,
    prompt: str = "",
    snapshot_interval: float = 0.3,
    run_index: int = 0,
) -> int:
    """Process events from a sub-agent, capturing streaming text and tool calls.
    
    Handles AG-UI event types:
    - TEXT_MESSAGE_CONTENT: Streaming text deltas
    - TOOL_CALL_START: New tool call begins
    - TOOL_CALL_ARGS: Tool arguments streaming  
    - TOOL_CALL_END: Tool call arguments complete
    - TOOL_CALL_RESULT: Tool execution result
    
    Ref: https://docs.ag-ui.com/sdk/python/core/events
    
    Args:
        event_stream: Async iterator of AG-UI events
        state: Current QueryState to update
        node_name: Name of the current node (e.g., "WebSearch")
        send_stream: Stream to send StateSnapshot updates
        shared_state: Optional AgentState for syncing
        prompt: The prompt sent to the sub-agent
        snapshot_interval: Minimum seconds between snapshot sends
        run_index: The run index for this step (0 for first run, 1 for second, etc.)
        
    Returns:
        Number of events processed
    """
    # Use indexed key to distinguish multiple runs of the same step
    indexed_key = f"{node_name}:{run_index}"
    
    # Initialize streaming state for this node run
    state.streaming_text[indexed_key] = ""
    state.tool_calls[indexed_key] = []
    state.prompts[indexed_key] = prompt
    
    # Also keep non-indexed versions for backwards compatibility
    state.streaming_text[node_name] = ""
    state.tool_calls[node_name] = []
    state.prompts[node_name] = prompt
    
    # Track current tool call being built
    current_tool_call: ToolCallInfo | None = None
    
    event_count = 0
    last_snapshot_time = 0
    consecutive_failures = 0
    max_consecutive_failures = 3
    snapshot_disabled = False
    
    async for event in event_stream:
        event_count += 1
        should_send_snapshot = False

        logger.info(f"   [{node_name}] [EVENT] {str(event)}")
        
        # Extract event type - AG-UI uses EventType enum
        if hasattr(event, 'type'):
            event_type = event.type.value if hasattr(event.type, 'value') else str(event.type)
            
            # Handle TEXT_MESSAGE_CONTENT events (streaming text)
            if 'TEXT_MESSAGE_CONTENT' in event_type:
                if hasattr(event, 'delta') and event.delta:
                    state.streaming_text[indexed_key] += event.delta
                    state.streaming_text[node_name] = state.streaming_text[indexed_key]
                    
                    # Log when thinking tags are detected
                    if '<think' in event.delta.lower():
                        logger.debug(f"   [{node_name}] Detected <think> tag in streaming text")
                    
                    current_time = time.time()
                    if current_time - last_snapshot_time > snapshot_interval:
                        should_send_snapshot = True
                        last_snapshot_time = current_time
            
            # Handle TOOL_CALL_START - new tool call begins
            elif 'TOOL_CALL_START' in event_type:
                tool_name = getattr(event, 'tool_call_name', 'unknown')
                current_tool_call = ToolCallInfo(tool_name=tool_name, status="in_progress")
                state.tool_calls[indexed_key].append(current_tool_call)
                state.tool_calls[node_name] = state.tool_calls[indexed_key]
                should_send_snapshot = True
                logger.debug(f"   [{node_name}] Tool call started: {tool_name}")
            
            # Handle TOOL_CALL_ARGS - tool arguments streaming
            elif 'TOOL_CALL_ARGS' in event_type:
                if current_tool_call and hasattr(event, 'delta'):
                    current_tool_call.args += event.delta
            
            # Handle TOOL_CALL_END - tool call arguments complete
            elif 'TOOL_CALL_END' in event_type:
                if current_tool_call:
                    args_preview = current_tool_call.args[:50] if current_tool_call.args else "(no args)"
                    logger.debug(f"   [{node_name}] Tool call args complete: {args_preview}...")
                    should_send_snapshot = True
            
            # Handle TOOL_CALL_RESULT - tool execution result
            elif 'TOOL_CALL_RESULT' in event_type:
                result_content = getattr(event, 'content', '')
                if isinstance(result_content, str):
                    result_str = result_content
                else:
                    result_str = str(result_content)[:500]  # Truncate long results
                
                # Mark the last in_progress tool call as completed
                for tc in state.tool_calls[indexed_key]:
                    if tc.status == "in_progress":
                        tc.result = result_str
                        tc.status = "completed"
                        break
                state.tool_calls[node_name] = state.tool_calls[indexed_key]
                
                should_send_snapshot = True
                logger.debug(f"   [{node_name}] Tool result received: {result_str[:50]}...")
            
            # Send snapshot if needed (with failure protection)
            if should_send_snapshot and not snapshot_disabled:
                success = await send_graph_state_snapshot(
                    send_stream, state, node_name, "in_progress", shared_state
                )
                if success:
                    consecutive_failures = 0
                else:
                    consecutive_failures += 1
                    if consecutive_failures >= max_consecutive_failures:
                        logger.warning(f"   [{node_name}] Disabling snapshots after {consecutive_failures} failures")
                        snapshot_disabled = True
    
    # Ensure all tool calls are marked as completed
    for tc in state.tool_calls.get(node_name, []):
        if tc.status == "in_progress":
            tc.status = "completed"
            if not tc.result:
                tc.result = "(completed - no output)"
            logger.debug(f"   [{node_name}] Finalized in-progress tool call: {tc.tool_name}")
    
    return event_count

