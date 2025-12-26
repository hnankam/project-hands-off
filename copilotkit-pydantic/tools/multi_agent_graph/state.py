"""State management functions for multi-agent graph.

This module handles building, syncing, and sending graph state snapshots
to the frontend for visualization.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, TYPE_CHECKING

from pydantic import Field
from ag_ui.core import EventType, StateDeltaEvent, BaseEvent, ActivitySnapshotEvent, ActivityDeltaEvent
from ag_ui.encoder import EventEncoder
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE

from config import logger
from core.models import JSONPatchOp
from .types import (
    QueryState,
    GraphAgentState,
    ACTION_TO_NODE,
)

if TYPE_CHECKING:
    from anyio.streams.memory import MemoryObjectSendStream


def _serialize_tool_call(tc: Any) -> dict:
    """Convert ToolCallInfo or dict to serializable dict format.
    
    Handles both ToolCallInfo dataclass objects and already-serialized dicts
    (from resumed state).
    """
    if isinstance(tc, dict):
        return tc  # Already a dict
    return {"tool_name": tc.tool_name, "args": tc.args, "result": tc.result, "status": tc.status}


def _serialize_tool_calls(calls: list) -> list:
    """Convert a list of tool calls to serializable format."""
    return [_serialize_tool_call(tc) for tc in calls] if calls else []


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
        
        # Get orchestrator tool calls
        orchestrator_tool_calls = state.tool_calls.get(indexed_key, state.tool_calls.get("Orchestrator", []))
        tool_calls_list = _serialize_tool_calls(orchestrator_tool_calls)
        
        steps.append({
            "node": "Orchestrator",
            "status": "in_progress",
            "result": orchestrator_streaming,
            "prompt": state.original_query or state.query,
            "streaming_text": orchestrator_streaming,
            "tool_calls": tool_calls_list,
            "timestamp": datetime.now().isoformat(),
        })
    
    # Build steps from execution_history - includes both Orchestrator:N and sub-agent entries
    for history_entry in state.execution_history:
        if _is_orchestrator_entry(history_entry):
            # This is an orchestrator iteration (e.g., "Orchestrator:0", "Orchestrator:1")
            orchestrator_streaming = state.streaming_text.get(history_entry, "")
            iteration_num = int(history_entry.split(":")[1]) if ":" in history_entry else 0
            
            # Get orchestrator tool calls for this iteration
            orchestrator_tool_calls = state.tool_calls.get(history_entry, [])
            tool_calls_list = _serialize_tool_calls(orchestrator_tool_calls)
            
            steps.append({
                "node": "Orchestrator",
                "status": "completed",
                "result": orchestrator_streaming,
                "prompt": state.original_query or state.query if iteration_num == 0 else f"Re-evaluating after iteration {iteration_num}",
                "streaming_text": orchestrator_streaming,
                "tool_calls": tool_calls_list,
                "timestamp": datetime.now().isoformat(),
            })
        else:
            # This is a sub-agent step (e.g., "ImageGeneration:0", "WebSearch:1")
            indexed_key = history_entry
            base_node = _get_base_node(history_entry)
            
            # Look up results using the indexed key
            result = state.intermediate_results.get(indexed_key, state.intermediate_results.get(base_node, ""))
            node_errors = [e for e in state.errors if e.get("node") == base_node or e.get("node") == indexed_key]
            
            # Convert tool calls to serializable format
            node_tool_calls = state.tool_calls.get(indexed_key, state.tool_calls.get(base_node, []))
            tool_calls_list = _serialize_tool_calls(node_tool_calls)
            
            # Determine status
            if node_errors:
                status = "error"
                result = node_errors[-1].get("error", "Unknown error")
            elif base_node == current_node and step_status == "in_progress":
                status = "in_progress"
            elif base_node == "Confirmation":
                # Confirmation step: check if confirmAction tool is still waiting
                confirm_tool = next((tc for tc in tool_calls_list if tc.get("tool_name") == "confirmAction"), None)
                if confirm_tool:
                    if confirm_tool.get("status") == "in_progress":
                        status = "waiting"  # Tool is waiting for user response
                    elif confirm_tool.get("status") == "completed":
                        status = "completed"  # User responded
                    else:
                        status = "waiting"  # Default to waiting if no clear status
                else:
                    # No confirmAction tool call found, still waiting
                    status = "waiting"
            else:
                status = "completed"
            
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
        tool_calls_list = _serialize_tool_calls(node_tool_calls)
        
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
                
                # Determine step status based on graph state
                # If graph is waiting for confirmation, pending steps should show as "waiting"
                is_waiting_state = step_status == "waiting" or (state.result and "Waiting for user confirmation" in state.result)
                
                if is_completing and not is_waiting_state:
                    step_stat = "cancelled"
                    step_result = "Skipped - graph completed early"
                elif is_waiting_state:
                    step_stat = "waiting"
                    step_result = ""
                else:
                    step_stat = "pending"
                    step_result = ""
                
                steps.append({
                    "node": node,
                    "status": step_stat,
                    "result": step_result,
                    "prompt": "",
                    "streaming_text": "",
                    "tool_calls": [],
                    "timestamp": datetime.now().isoformat(),
                })
    
    # Determine overall status
    if state.errors:
        overall_status = "error"
    elif state.result and "Waiting for user confirmation" in state.result:
        overall_status = "waiting"  # Waiting for user interaction
    elif state.result and step_status == "waiting":
        overall_status = "waiting"  # Explicitly marked as waiting
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


def sync_to_shared_state(
    state: QueryState,
    shared_state: Any,
    current_node: str = "",
    graph_id: str | None = None,
    graph_name: str | None = None
) -> str:
    """Sync internal QueryState to shared AgentState.graphs[graph_id].
    
    Creates or updates a GraphInstance in the flat graphs dictionary.
    
    Args:
        state: The internal QueryState
        shared_state: The shared AgentState from session
        current_node: Currently executing node
        graph_id: Unique ID for this graph (will be generated if not provided)
        graph_name: Human-readable name for this graph (will be generated from query if not provided)
        
    Returns:
        The graph_id (generated if not provided)
    """
    from core.models import GraphInstance
    from datetime import datetime
    
    if not shared_state or not hasattr(shared_state, 'graphs'):
        return graph_id or uuid.uuid4().hex[:12]
    
    # Generate graph_id if not provided
    if not graph_id:
        graph_id = uuid.uuid4().hex[:12]
    
    # Generate graph_name from query if not provided
    if not graph_name:
        # Create a name from the first 50 chars of the query
        query_text = state.query or state.original_query or "Graph Execution"
        graph_name = query_text[:50] + ("..." if len(query_text) > 50 else "")
    
    # Create or update GraphInstance
    if graph_id not in shared_state.graphs:
        # Create new GraphInstance
        shared_state.graphs[graph_id] = GraphInstance(
            graph_id=graph_id,
            name=graph_name,
            status='active',
            steps=[],
            query=state.query,
            original_query=state.original_query or state.query,
            result="",
            query_type=state.query_type,
            execution_history=[],
            intermediate_results={},
            streaming_text={},
            prompts={},
            tool_calls={},
            errors=[],
            last_error_node="",
            retry_count=0,
            max_retries=state.max_retries,
            iteration_count=0,
            max_iterations=state.max_iterations,
            should_continue=True,
            next_action="",
            planned_steps=[],
            mermaid_diagram="",
            deferred_tool_requests=None,
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat(),
        )
    
    # Get the graph instance
    graph = shared_state.graphs[graph_id]
    
    # Update all fields
    graph.query = state.query
    graph.original_query = state.original_query or state.query
    graph.result = state.result
    graph.query_type = state.query_type
    graph.execution_history = list(state.execution_history)
    graph.intermediate_results = dict(state.intermediate_results)
    graph.streaming_text = dict(state.streaming_text)
    graph.prompts = dict(state.prompts)
    graph.tool_calls = {
        node: _serialize_tool_calls(calls)
        for node, calls in state.tool_calls.items()
    }
    graph.errors = list(state.errors)
    graph.last_error_node = state.last_error_node
    graph.retry_count = state.retry_count
    graph.iteration_count = state.iteration_count
    graph.should_continue = state.should_continue
    graph.next_action = current_node or state.next_action
    graph.planned_steps = list(state.planned_steps) if state.planned_steps else []
    graph.updated_at = datetime.now().isoformat()
    
    # ============================================================================
    # FIX: Build and update steps from current state
    # This was the missing piece causing completed graphs to have empty steps!
    # IMPORTANT: Preserve UI-modified steps (reordered, edited node types/prompts, deleted)
    # by merging execution-derived steps with existing UI-modified steps
    # ============================================================================
    graph_agent_state = build_graph_agent_state(state, current_node, "completed" if state.result else "in_progress")
    execution_steps = graph_agent_state.get("steps", [])
    
    # Preserve UI modifications: merge execution steps with existing steps
    # Strategy: Use execution steps as source of truth for status/result, but preserve:
    # - Step order from existing steps (if UI reordered)
    # - Node types and prompts from existing steps (if UI edited)
    # - Deleted steps (status='cancelled') from existing steps
    existing_steps = graph.steps if graph.steps else []
    
    if existing_steps:
        # Convert existing steps to dicts for easier manipulation
        # Handle both Pydantic models and dicts
        existing_steps_dicts = []
        for step in existing_steps:
            if hasattr(step, 'model_dump'):
                # Pydantic model
                existing_steps_dicts.append(step.model_dump())
            elif isinstance(step, dict):
                # Already a dict
                existing_steps_dicts.append(step)
            else:
                # Fallback: convert to dict
                existing_steps_dicts.append({
                    "node": getattr(step, "node", ""),
                    "status": getattr(step, "status", "pending"),
                    "result": getattr(step, "result", ""),
                    "prompt": getattr(step, "prompt", ""),
                    "streaming_text": getattr(step, "streaming_text", ""),
                    "tool_calls": getattr(step, "tool_calls", []),
                    "timestamp": getattr(step, "timestamp", ""),
                })
        
        # Create a map of execution steps by node+timestamp for quick lookup
        execution_map = {}
        for exec_step in execution_steps:
            key = (exec_step.get("node"), exec_step.get("timestamp", ""))
            execution_map[key] = exec_step
        
        # Merge: preserve order and UI edits from existing_steps, update with execution data
        merged_steps = []
        for existing_step in existing_steps_dicts:
            # Skip cancelled steps unless they're being re-executed
            if existing_step.get("status") == "cancelled":
                # Check if this step is being re-executed
                exec_key = (existing_step.get("node"), existing_step.get("timestamp", ""))
                if exec_key in execution_map:
                    # Step is being re-executed, use execution data but preserve node/prompt edits
                    exec_step = execution_map[exec_key]
                    merged_step = {
                        **exec_step,
                        "node": existing_step.get("node"),  # Preserve UI-edited node type
                        "prompt": existing_step.get("prompt"),  # Preserve UI-edited prompt
                    }
                    merged_steps.append(merged_step)
                else:
                    # Step is still cancelled, preserve it
                    merged_steps.append(existing_step)
            else:
                # Active step: merge execution data with UI edits
                exec_key = (existing_step.get("node"), existing_step.get("timestamp", ""))
                if exec_key in execution_map:
                    exec_step = execution_map[exec_key]
                    merged_step = {
                        **exec_step,
                        "node": existing_step.get("node"),  # Preserve UI-edited node type
                        "prompt": existing_step.get("prompt") or exec_step.get("prompt"),  # Preserve UI-edited prompt
                    }
                    merged_steps.append(merged_step)
                else:
                    # Step exists in UI but not in execution yet, preserve it
                    merged_steps.append(existing_step)
        
        # Add any new execution steps not in existing_steps
        for exec_step in execution_steps:
            exec_key = (exec_step.get("node"), exec_step.get("timestamp", ""))
            if not any(
                (s.get("node"), s.get("timestamp", "")) == exec_key 
                for s in merged_steps
            ):
                merged_steps.append(exec_step)
        
        # Convert merged steps back to GraphStep objects
        from core.models import GraphStep
        graph.steps = [
            GraphStep(**step) if isinstance(step, dict) else step
            for step in merged_steps
        ]
    else:
        # No existing steps, use execution steps as-is
        from core.models import GraphStep
        graph.steps = [
            GraphStep(**step) if isinstance(step, dict) else step
            for step in execution_steps
        ]
    
    # Update status based on state
    # Valid statuses: 'active', 'running', 'paused', 'completed', 'cancelled', 'waiting'
    try:
        # Check if graph is waiting for confirmation (no deferred_tool_requests anymore)
        if state.result and "Waiting for user confirmation" in state.result:
            graph.status = 'waiting'
        elif state.result:
            graph.status = 'completed'
        elif state.errors:
            # Graph stopped due to errors - mark as cancelled
            graph.status = 'cancelled'
        else:
            graph.status = 'active'
    except Exception as e:
        logger.error(f"Error setting graph status: {e}. Defaulting to 'active'")
        graph.status = 'active'
    
    return graph_id


async def send_graph_state_delta(
    send_stream: MemoryObjectSendStream[str] | None,
    state: QueryState,
    current_node: str = "",
    step_status: str = "in_progress",
    shared_state: Any = None,
) -> bool:
    """Send graph state updates to the frontend using delta approach.
    
    Strategy:
    - Sends StateDeltaEvent with JSON Patch operations for efficient incremental updates
    - Uses 'add' operation for new graphs, 'replace' for updates
    - ActivitySnapshotEvent is always sent to update activity messages
    
    Args:
        send_stream: The stream to send events to
        state: Current QueryState
        current_node: Node currently being executed
        step_status: Status of current step ("in_progress", "completed", "error")
        shared_state: Optional AgentState for syncing with session
        
    Returns:
        True if update was sent successfully, False otherwise
    """
    logger.debug(f"   [GraphState] Called for node={current_node}, status={step_status}")
    
    if not send_stream:
        logger.warning(f"   [StateDelta] No send_stream available for {current_node}")
        return False
    
    try:
        encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
        
        # Get or generate graph_id
        graph_id = None
        graph_name = None
        is_new_graph = True
        
        # Check if this is the first graph (before any syncing)
        is_first_graph = not shared_state or not hasattr(shared_state, 'graphs') or len(shared_state.graphs) == 0
        
        if shared_state and hasattr(shared_state, 'graphs'):
            # Try to find existing graph for this query
            for gid, graph in shared_state.graphs.items():
                if graph.original_query == (state.original_query or state.query):
                    graph_id = gid
                    graph_name = graph.name
                    is_new_graph = False
                    break
        
        # Remember if this was a new graph BEFORE sync
        # (sync will add it to shared_state, so we need to check before that)
        was_new_graph_before_sync = is_new_graph
        
        # Sync to shared state if available (for persistence)
        if shared_state and hasattr(shared_state, 'graphs'):
            graph_id = sync_to_shared_state(state, shared_state, current_node, graph_id, graph_name)
        
        # Use the "before sync" value to determine operation type
        # After sync, the graph will exist in shared_state, but we want to use 'add' on first call
        is_new_graph = was_new_graph_before_sync
        
        # Build GraphAgentState format for frontend rendering
        graph_agent_state = build_graph_agent_state(state, current_node, step_status)
        
        # Include mermaid_diagram from graph instance if available
        if shared_state and hasattr(shared_state, 'graphs') and graph_id and graph_id in shared_state.graphs:
            graph_agent_state["mermaid_diagram"] = shared_state.graphs[graph_id].mermaid_diagram
        
        # Build flat AgentState format for CopilotKit state persistence
        # Uses flat graphs dictionary structure
        graph_instance_data = {
            "graph_id": graph_id,
            "name": graph_name or state.query[:50],
            "status": graph_agent_state.get("status", "active"),
            "steps": graph_agent_state.get("steps", []),
                "query": state.query,
                "original_query": state.original_query or state.query,
                "result": state.result,
                "query_type": state.query_type,
                "execution_history": list(state.execution_history),
                "intermediate_results": dict(state.intermediate_results),
                "streaming_text": dict(state.streaming_text),
                "prompts": dict(state.prompts),
                "tool_calls": {
                    node: _serialize_tool_calls(calls)
                    for node, calls in state.tool_calls.items()
                },
                "errors": list(state.errors),
                "last_error_node": state.last_error_node,
                "retry_count": state.retry_count,
                "max_retries": state.max_retries,
                "iteration_count": state.iteration_count,
                "max_iterations": state.max_iterations,
                "should_continue": state.should_continue,
                "next_action": current_node or state.next_action,
                "planned_steps": list(state.planned_steps) if state.planned_steps else [],
                "mermaid_diagram": graph_agent_state.get("mermaid_diagram", ""),
            "deferred_tool_requests": getattr(state, 'deferred_tool_requests', None),
            "created_at": shared_state.graphs[graph_id].created_at if (shared_state and hasattr(shared_state, 'graphs') and graph_id in shared_state.graphs) else "",
            "updated_at": shared_state.graphs[graph_id].updated_at if (shared_state and hasattr(shared_state, 'graphs') and graph_id in shared_state.graphs) else "",
        }
        
        # Send delta for efficiency
        patch_ops: list[JSONPatchOp] = []
        
        # Use 'add' for new graphs, 'replace' for updates
        if is_new_graph:
            # New graph - use 'add' operation
            patch_ops.append(JSONPatchOp(
                op='add',
                path=f'/graphs/{graph_id}',
                value=graph_instance_data
            ))
            logger.info(f"   [StateDelta] Adding new graph {graph_id} for {current_node} ({step_status})")
        else:
            # Existing graph - use 'replace' operation for the entire graph
            patch_ops.append(JSONPatchOp(
                op='replace',
                path=f'/graphs/{graph_id}',
                value=graph_instance_data
            ))
            logger.info(f"   [StateDelta] Updating graph {graph_id} for {current_node} ({step_status})")
        
        # Send StateDeltaEvent for agent state persistence
        await send_stream.send(
            encoder.encode(
                StateDeltaEvent(
                    type=EventType.STATE_DELTA,
                    delta=[op.model_dump(by_alias=True) for op in patch_ops],
                )
            )
        )
        
        # Send ActivityDeltaEvent for UI updates (delta mode)
        activity_message_id = f"graph-{graph_id}"
        activity_patch_ops: list[JSONPatchOp] = []
        
        # Create patch for activity content (same path structure as state)
        if is_new_graph:
            activity_patch_ops.append(JSONPatchOp(
                op='add',
                path=f'/graphs/{graph_id}',
                value=graph_instance_data
            ))
        else:
            activity_patch_ops.append(JSONPatchOp(
                op='replace',
                path=f'/graphs/{graph_id}',
                value=graph_instance_data
            ))
        
        await send_stream.send(
            encoder.encode(
                ActivityDeltaEvent(
                    messageId=activity_message_id,
                    activityType="agent_state",
                    patch=[op.model_dump(by_alias=True) for op in activity_patch_ops],
                )
            )
        )
        
        # Log success message
        logger.info(f"   [StateDelta] ✓ Sent successfully for {current_node}")
        return True
    except Exception as e:
        logger.warning(f"Failed to send graph state delta: {type(e).__name__}: {e}")
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

