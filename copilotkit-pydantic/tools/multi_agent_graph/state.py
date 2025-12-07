"""State management functions for multi-agent graph.

This module handles building, syncing, and sending graph state snapshots
to the frontend for visualization.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, TYPE_CHECKING

from ag_ui.core import EventType, StateSnapshotEvent
from ag_ui.encoder import EventEncoder
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE

from config import logger
from .types import (
    QueryState,
    GraphAgentState,
    ACTION_TO_NODE,
)

if TYPE_CHECKING:
    from anyio.streams.memory import MemoryObjectSendStream


def _is_orchestrator_entry(entry: str) -> bool:
    """Check if a history entry is an orchestrator entry."""
    return entry.startswith("Orchestrator:")


def _get_base_node(entry: str) -> str:
    """Extract base node name from indexed key (e.g., 'WebSearch:0' -> 'WebSearch')."""
    if ":" in entry:
        return entry.split(":")[0]
    return entry


def build_graph_agent_state(
    state: QueryState,
    current_node: str = "",
    step_status: str = "in_progress"
) -> dict:
    """Build a GraphAgentState dict from QueryState for sending to frontend.
    
    Args:
        state: The current QueryState
        current_node: The node currently being executed
        step_status: Status of the current step
        
    Returns:
        Dict representation of GraphAgentState
    """
    steps = []
    
    # First, add orchestrator step if it's currently running but not yet in history
    if current_node == "Orchestrator":
        orchestrator_iteration = state.iteration_count - 1 if state.iteration_count > 0 else 0
        indexed_key = f"Orchestrator:{orchestrator_iteration}"
        orchestrator_streaming = state.streaming_text.get(indexed_key, state.streaming_text.get("Orchestrator", ""))
        
        steps.append({
            "node": "Orchestrator",
            "status": "in_progress",
            "result": orchestrator_streaming,
            "prompt": state.original_query or state.query,
            "streaming_text": orchestrator_streaming,
            "tool_calls": [],
            "timestamp": datetime.now().isoformat(),
        })
    
    # Build steps from execution_history - includes both Orchestrator:N and sub-agent entries
    for history_entry in state.execution_history:
        if _is_orchestrator_entry(history_entry):
            # This is an orchestrator iteration (e.g., "Orchestrator:0", "Orchestrator:1")
            orchestrator_streaming = state.streaming_text.get(history_entry, "")
            iteration_num = int(history_entry.split(":")[1]) if ":" in history_entry else 0
            
            steps.append({
                "node": "Orchestrator",
                "status": "completed",
                "result": orchestrator_streaming,
                "prompt": state.original_query or state.query if iteration_num == 0 else f"Re-evaluating after iteration {iteration_num}",
                "streaming_text": orchestrator_streaming,
                "tool_calls": [],
                "timestamp": datetime.now().isoformat(),
            })
        else:
            # This is a sub-agent step (e.g., "ImageGeneration:0", "WebSearch:1")
            indexed_key = history_entry
            base_node = _get_base_node(history_entry)
            
            # Look up results using the indexed key
            result = state.intermediate_results.get(indexed_key, state.intermediate_results.get(base_node, ""))
            node_errors = [e for e in state.errors if e.get("node") == base_node or e.get("node") == indexed_key]
            
            if node_errors:
                status = "error"
                result = node_errors[-1].get("error", "Unknown error")
            elif base_node == current_node and step_status == "in_progress":
                status = "in_progress"
            else:
                status = "completed"
            
            # Convert tool calls to serializable format
            node_tool_calls = state.tool_calls.get(indexed_key, state.tool_calls.get(base_node, []))
            tool_calls_list = [
                {"tool_name": tc.tool_name, "args": tc.args, "result": tc.result, "status": tc.status}
                for tc in node_tool_calls
            ] if node_tool_calls else []
            
            steps.append({
                "node": base_node,
                "status": status,
                "result": result,
                "prompt": state.prompts.get(indexed_key, state.prompts.get(base_node, "")),
                "streaming_text": state.streaming_text.get(indexed_key, state.streaming_text.get(base_node, "")),
                "tool_calls": tool_calls_list,
                "timestamp": datetime.now().isoformat(),
            })
        
    # Add current node if not in history yet (and it's not the orchestrator which we handled above)
    current_node_in_history = any(
        _get_base_node(entry) == current_node or entry == current_node
        for entry in state.execution_history
    ) if current_node else False
    
    if current_node and current_node != "Orchestrator" and not current_node_in_history:
        node_tool_calls = state.tool_calls.get(current_node, [])
        tool_calls_list = [
            {"tool_name": tc.tool_name, "args": tc.args, "result": tc.result, "status": tc.status}
            for tc in node_tool_calls
        ] if node_tool_calls else []
        
        steps.append({
            "node": current_node,
            "status": step_status,
            "result": "",
            "prompt": state.prompts.get(current_node, ""),
            "streaming_text": state.streaming_text.get(current_node, ""),
            "tool_calls": tool_calls_list,
            "timestamp": datetime.now().isoformat(),
        })
    
    # Determine if graph is completing (has result and no current node executing)
    is_completing = bool(state.result) and not current_node
    
    # Add pending/cancelled steps from planned_steps that haven't been executed yet
    if state.planned_steps:
        execution_counts: dict[str, int] = {}
        for entry in state.execution_history:
            if not _is_orchestrator_entry(entry):
                base_node = _get_base_node(entry)
                execution_counts[base_node] = execution_counts.get(base_node, 0) + 1
        
        planned_counts: dict[str, int] = {}
        
        for planned_action in state.planned_steps:
            node = ACTION_TO_NODE.get(planned_action, planned_action)
            run_index = planned_counts.get(node, 0)
            planned_counts[node] = run_index + 1
            runs_executed = execution_counts.get(node, 0)
            
            if run_index >= runs_executed:
                if node == current_node and run_index == runs_executed:
                    continue
                
                step_stat = "cancelled" if is_completing else "pending"
                
                steps.append({
                    "node": node,
                    "status": step_stat,
                    "result": "Skipped - graph completed early" if is_completing else "",
                    "prompt": "",
                    "streaming_text": "",
                    "tool_calls": [],
                    "timestamp": datetime.now().isoformat(),
                })
    
    # Determine overall status
    if state.errors:
        overall_status = "error"
    elif state.result:
        overall_status = "completed"
    elif current_node:
        overall_status = "running"
    else:
        overall_status = "pending"
    
    return {
        "query": state.query,
        "original_query": state.original_query or state.query,
        "current_node": current_node,
        "iteration": state.iteration_count,
        "max_iterations": state.max_iterations,
        "steps": steps,
        "planned_steps": state.planned_steps,
        "final_result": state.result,
        "status": overall_status,
    }


def sync_to_shared_state(state: QueryState, shared_state: Any, current_node: str = "") -> None:
    """Sync internal QueryState to the shared AgentState.graph.
    
    Args:
        state: The internal QueryState
        shared_state: The shared AgentState from session
        current_node: Currently executing node
    """
    if not shared_state or not hasattr(shared_state, 'graph'):
        return
    
    shared_state.graph.query = state.query
    shared_state.graph.original_query = state.original_query
    shared_state.graph.result = state.result
    shared_state.graph.query_type = state.query_type
    shared_state.graph.execution_history = list(state.execution_history)
    shared_state.graph.intermediate_results = dict(state.intermediate_results)
    shared_state.graph.streaming_text = dict(state.streaming_text)
    shared_state.graph.prompts = dict(state.prompts)
    # Convert ToolCallInfo dataclass instances to dicts for serialization
    shared_state.graph.tool_calls = {
        node: [
            {"tool_name": tc.tool_name, "args": tc.args, "result": tc.result, "status": tc.status}
            for tc in calls
        ] if calls else []
        for node, calls in state.tool_calls.items()
    }
    shared_state.graph.errors = list(state.errors)
    shared_state.graph.last_error_node = state.last_error_node
    shared_state.graph.retry_count = state.retry_count
    shared_state.graph.iteration_count = state.iteration_count
    shared_state.graph.should_continue = state.should_continue
    shared_state.graph.next_action = current_node or state.next_action


async def send_graph_state_snapshot(
    send_stream: MemoryObjectSendStream[str] | None,
    state: QueryState,
    current_node: str = "",
    step_status: str = "in_progress",
    shared_state: Any = None,
) -> bool:
    """Send a StateSnapshotEvent for the graph state to the frontend.
    
    Args:
        send_stream: The stream to send events to
        state: Current QueryState
        current_node: Node currently being executed
        step_status: Status of current step ("in_progress", "completed", "error")
        shared_state: Optional AgentState for syncing with session
        
    Returns:
        True if snapshot was sent successfully, False otherwise
    """
    logger.debug(f"   [StateSnapshot] Called for node={current_node}, status={step_status}")
    
    if not send_stream:
        logger.warning(f"   [StateSnapshot] No send_stream available for {current_node}")
        return False
    
    try:
        encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
        
        # Sync to shared state if available (for persistence)
        if shared_state and hasattr(shared_state, 'graph'):
            sync_to_shared_state(state, shared_state, current_node)
        
        # Build GraphAgentState format
        snapshot = build_graph_agent_state(state, current_node, step_status)
        
        # Include mermaid_diagram from shared_state if available
        if shared_state and hasattr(shared_state, 'graph') and hasattr(shared_state.graph, 'mermaid_diagram'):
            snapshot["mermaid_diagram"] = shared_state.graph.mermaid_diagram
        
        logger.info(f"   [StateSnapshot] Sending for {current_node} ({step_status})")
        
        await send_stream.send(
            encoder.encode(
                StateSnapshotEvent(
                    type=EventType.STATE_SNAPSHOT,
                    snapshot=snapshot,
                )
            )
        )
        logger.info(f"   [StateSnapshot] ✓ Sent successfully for {current_node}")
        return True
    except Exception as e:
        logger.warning(f"Failed to send graph state snapshot: {type(e).__name__}: {e}")
        return False


def strip_thinking_content(text: str) -> str:
    """Strip <think>...</think> and <thinking>...</thinking> blocks from text.
    
    Args:
        text: Text that may contain thinking blocks
        
    Returns:
        Text with thinking blocks removed
    """
    import re
    cleaned = re.sub(r'<think(?:ing)?>.*?</think(?:ing)?>', '', text, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'</?think(?:ing)?>', '', cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def build_context_with_previous_results(state: QueryState, task_prompt: str) -> str:
    """Build a context string that includes the task prompt and relevant previous results.
    
    This allows downstream worker steps to access data from earlier steps.
    Thinking content is stripped from previous results to avoid confusion.
    
    Args:
        state: Current QueryState with intermediate_results
        task_prompt: The task-specific prompt from orchestrator
        
    Returns:
        A context string with task prompt and previous results (without thinking blocks)
    """
    if not state.intermediate_results:
        return task_prompt
    
    context_parts = [task_prompt]
    
    if state.intermediate_results:
        context_parts.append("\n\n--- PREVIOUS RESULTS FROM EARLIER STEPS ---\n")
        for node, result in state.intermediate_results.items():
            # Skip indexed keys (e.g., "WebSearch:0") - use the base node results
            if ':' in node:
                continue
            clean_result = strip_thinking_content(str(result))
            context_parts.append(f"\n[{node}]:\n{clean_result}\n")
    
    return "".join(context_parts)

