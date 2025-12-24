"""
Graph Management Tools

Provides comprehensive graph lifecycle management and execution tools:

**Lifecycle Tools:**
- create_graph: Initialize a new graph instance
- resume_graph: Resume a paused/waiting graph after user interaction

**Management Tools:**
- update_graph_status: Change graph status (active, paused, completed, etc.)
- rename_graph: Rename a graph for better organization
- list_graphs: View all graphs in the session
- get_graph_details: Get detailed information about a specific graph
- delete_graph: Remove a graph from the session

**Execution Tool:**
- run_graph: Execute multi-agent graphs for complex queries

Graphs can be referenced by name or ID, supporting multi-instance graph execution.
All tools integrate with the AG-UI protocol for real-time frontend updates.
"""

from __future__ import annotations
from typing import Any
import uuid
import logging

from pydantic_ai.tools import ToolReturn
from pydantic_ai import RunContext
from ag_ui.core import RunAgentInput, UserMessage, EventType, StateDeltaEvent, ActivityDeltaEvent, StateSnapshotEvent, ActivitySnapshotEvent

from core.models import UnifiedDeps, GraphInstance, JSONPatchOp
from tools.multi_agent_graph import run_multi_agent_graph, QueryState
from tools.multi_agent_graph.actions import (
    create_graph as create_graph_internal,
    resume_graph as resume_graph_internal
)
from tools.multi_agent_graph.state import build_graph_agent_state
from datetime import datetime

logger = logging.getLogger(__name__)


# ========== Graph Management Tools ==========

async def update_graph_status(
    ctx: RunContext[UnifiedDeps],
    graph_id: str,
    status: str
) -> ToolReturn:
    """Change a graph's execution status.
    
    Updates the status flag for a graph instance (active, paused, completed, cancelled, waiting).
    
    Args:
        graph_id: Graph ID (e.g., "abc123def456")
        status: New status ('active', 'paused', 'completed', 'cancelled', 'waiting')
        
    Returns:
        Confirmation message with old and new status
    """
    if graph_id not in ctx.deps.state.graphs:
        return ToolReturn(return_value=f'Graph "{graph_id}" not found')
    
    graph = ctx.deps.state.graphs[graph_id]
    old_status = graph.status
    graph.status = status
    new_timestamp = datetime.now().isoformat()
    graph.updated_at = new_timestamp
    
    # Create JSON Patch operations for state delta
    patch_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/status',
            value=status
        ),
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/updated_at',
            value=new_timestamp
        ),
    ]
    
    # Create activity delta operations
    activity_message_id = f"graph-{graph_id}"
    activity_delta_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/status',
            value=status
        ),
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/updated_at',
            value=new_timestamp
        ),
    ]
    
    return ToolReturn(
        return_value=f'Graph "{graph.name}" status changed from {old_status} to {status}',
        metadata=[
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[op.model_dump(by_alias=True) for op in patch_ops],
            ),
            ActivityDeltaEvent(
                messageId=activity_message_id,
                activityType="agent_state",
                patch=[op.model_dump(by_alias=True) for op in activity_delta_ops],
            ),
        ],
    )


async def pause_graph(
    ctx: RunContext[UnifiedDeps],
    graph_id: str
) -> ToolReturn:
    """Pause a running graph execution.
    
    Temporarily stops graph execution. Can be resumed later with resume_graph().
    
    Args:
        graph_id: Graph ID (e.g., "abc123def456")
        
    Returns:
        Confirmation message
    """
    if graph_id not in ctx.deps.state.graphs:
        return ToolReturn(return_value=f'Graph "{graph_id}" not found')
    
    graph = ctx.deps.state.graphs[graph_id]
    
    if graph.status == 'paused':
        return ToolReturn(return_value=f'Graph "{graph.name}" is already paused')
    
    old_status = graph.status
    graph.status = 'paused'
    graph.should_continue = False
    new_timestamp = datetime.now().isoformat()
    graph.updated_at = new_timestamp
    
    # Create JSON Patch operations for state delta
    patch_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/status',
            value='paused'
        ),
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/should_continue',
            value=False
        ),
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/updated_at',
            value=new_timestamp
        ),
    ]
    
    # Create activity delta operations
    activity_message_id = f"graph-{graph_id}"
    activity_delta_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/status',
            value='paused'
        ),
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/updated_at',
            value=new_timestamp
        ),
    ]
    
    return ToolReturn(
        return_value=f'Graph "{graph.name}" paused',
        metadata=[
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[op.model_dump(by_alias=True) for op in patch_ops],
            ),
            ActivityDeltaEvent(
                messageId=activity_message_id,
                activityType="agent_state",
                patch=[op.model_dump(by_alias=True) for op in activity_delta_ops],
            ),
        ],
    )


async def cancel_graph(
    ctx: RunContext[UnifiedDeps],
    graph_id: str
) -> ToolReturn:
    """Cancel a graph execution.
    
    Permanently stops graph execution. Cannot be resumed.
    
    Args:
        graph_id: Graph ID (e.g., "abc123def456")
        
    Returns:
        Confirmation message
    """
    if graph_id not in ctx.deps.state.graphs:
        return ToolReturn(return_value=f'Graph "{graph_id}" not found')
    
    graph = ctx.deps.state.graphs[graph_id]
    
    if graph.status == 'cancelled':
        return ToolReturn(return_value=f'Graph "{graph.name}" is already cancelled')
    
    old_status = graph.status
    graph.status = 'cancelled'
    graph.should_continue = False
    new_timestamp = datetime.now().isoformat()
    graph.updated_at = new_timestamp
    
    # Create JSON Patch operations for state delta
    patch_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/status',
            value='cancelled'
        ),
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/should_continue',
            value=False
        ),
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/updated_at',
            value=new_timestamp
        ),
    ]
    
    # Create activity delta operations
    activity_message_id = f"graph-{graph_id}"
    activity_delta_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/status',
            value='cancelled'
        ),
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/updated_at',
            value=new_timestamp
        ),
    ]
    
    return ToolReturn(
        return_value=f'Graph "{graph.name}" cancelled',
        metadata=[
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[op.model_dump(by_alias=True) for op in patch_ops],
            ),
            ActivityDeltaEvent(
                messageId=activity_message_id,
                activityType="agent_state",
                patch=[op.model_dump(by_alias=True) for op in activity_delta_ops],
            ),
        ],
    )


async def rename_graph(
    ctx: RunContext[UnifiedDeps],
    graph_id: str,
    new_name: str
) -> ToolReturn:
    """Rename a graph for easier reference.
    
    Changes the display name of a graph. Useful for organization and clarity.
    
    Args:
        graph_id: Graph ID (e.g., "abc123def456")
        new_name: New display name for the graph
        
    Returns:
        Confirmation message with old and new names
    """
    if graph_id not in ctx.deps.state.graphs:
        return ToolReturn(return_value=f'Graph "{graph_id}" not found')
    
    graph = ctx.deps.state.graphs[graph_id]
    old_name = graph.name
    graph.name = new_name
    new_timestamp = datetime.now().isoformat()
    graph.updated_at = new_timestamp
    
    # Create JSON Patch operations for state delta
    patch_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/name',
            value=new_name
        ),
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/updated_at',
            value=new_timestamp
        ),
    ]
    
    # Create activity delta operations
    activity_message_id = f"graph-{graph_id}"
    activity_delta_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/name',
            value=new_name
        ),
        JSONPatchOp(
            op='replace',
            path=f'/graphs/{graph_id}/updated_at',
            value=new_timestamp
        ),
    ]
    
    return ToolReturn(
        return_value=f'Graph renamed from "{old_name}" to "{new_name}"',
        metadata=[
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[op.model_dump(by_alias=True) for op in patch_ops],
            ),
            ActivityDeltaEvent(
                messageId=activity_message_id,
                activityType="agent_state",
                patch=[op.model_dump(by_alias=True) for op in activity_delta_ops],
            ),
        ],
    )


async def list_graphs(ctx: RunContext[UnifiedDeps]) -> ToolReturn:
    """List all graphs in the current session.
    
    Returns all graph instances with their complete data as JSON.
    
    Returns:
        ToolReturn with JSON string containing all graphs from state
    """
    import json
    
    graphs = ctx.deps.state.graphs
    
    if not graphs:
        return ToolReturn(return_value=json.dumps({"graphs": {}}, indent=2))
    
    # Get JSON dump of all graphs
    graphs_data = {
        graph_id: graph.model_dump()
        for graph_id, graph in graphs.items()
    }
    
    # Return JSON string
    return ToolReturn(return_value=json.dumps({"graphs": graphs_data}, indent=2))


async def get_graph_details(
    ctx: RunContext[UnifiedDeps],
    graph_id: str
) -> ToolReturn:
    """Get detailed information about a specific graph.
    
    Returns comprehensive details including status, query, execution steps, tool calls,
    results, and any errors as JSON.
    
    Args:
        graph_id: Graph ID (e.g., "abc123def456")
        
    Returns:
        ToolReturn with JSON string containing complete graph data
    """
    import json
    
    if graph_id not in ctx.deps.state.graphs:
        available = [f'"{g.name}" (ID: {gid})' for gid, g in ctx.deps.state.graphs.items()]
        error_msg = (
            f'Graph "{graph_id}" not found. Available graphs:\n' +
            ('\n'.join(available) if available else 'No graphs available')
        )
        return ToolReturn(return_value=error_msg)
    
    graph = ctx.deps.state.graphs[graph_id]
    
    # Get JSON dump of graph
    graph_data = graph.model_dump()
    
    # Return JSON string
    return ToolReturn(return_value=json.dumps({"graph": graph_data}, indent=2))


async def delete_graph(
    ctx: RunContext[UnifiedDeps],
    graph_id: str
) -> ToolReturn:
    """Delete a graph from the session.
    
    Permanently removes the graph and all its execution history. Cannot be undone.
    
    Args:
        graph_id: Graph ID to delete (e.g., "abc123def456")
        
    Returns:
        Confirmation message with deleted graph name and ID
    """
    if graph_id not in ctx.deps.state.graphs:
        return ToolReturn(return_value=f'Graph "{graph_id}" not found')
    
    graph_name = ctx.deps.state.graphs[graph_id].name
    
    # Create JSON Patch operations for removal (before deleting from state)
    patch_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='remove',
            path=f'/graphs/{graph_id}'
        ),
    ]
    
    # Create activity delta operations for removal
    activity_message_id = f"graph-{graph_id}"
    activity_delta_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='remove',
            path=f'/graphs/{graph_id}'
        ),
    ]
    
    # Delete from in-memory state
    del ctx.deps.state.graphs[graph_id]
    
    return ToolReturn(
        return_value=f'Graph "{graph_name}" (ID: {graph_id}) deleted',
        metadata=[
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[op.model_dump(by_alias=True) for op in patch_ops],
            ),
            ActivityDeltaEvent(
                messageId=activity_message_id,
                activityType="agent_state",
                patch=[op.model_dump(by_alias=True) for op in activity_delta_ops],
            ),
        ],
    )


# ========== Graph Execution Tool ==========

async def run_graph(
    ctx: RunContext[UnifiedDeps], 
    graph_id: str,
) -> ToolReturn:
    """Execute an existing multi-agent graph by ID.
    
    Runs the graph's query through specialized sub-agents (image generation, web search,
    code execution) and returns the final result. The graph must already exist - use
    create_graph() first if needed.
    
    When to use:
    - After creating a graph with create_graph()
    - To re-run a completed/failed graph
    - To resume a waiting graph after user confirmation
    
    Args:
        graph_id: Graph ID (e.g., "abc123def456")
        
    Returns:
        Final result from graph execution, or error if graph not found
    """
    logger.info(f"🚀 run_graph tool invoked for graph: {graph_id}")
    
    # Get context from deps
    deps = ctx.deps
    send_stream = getattr(deps, 'send_stream', None)
    adapter = getattr(deps, 'adapter', None)
    
    # Check if graph exists
    if graph_id not in ctx.deps.state.graphs:
        error_msg = (
            f'Graph "{graph_id}" not found.\n\n'
            f'To create a new graph:\n'
            f'1. Use create_graph(ctx, "your query", name="Graph Name")\n'
            f'2. Then execute it: run_graph(ctx, graph_id="<returned_id>")\n\n'
            f'Or use list_graphs() to see available graph IDs.'
        )
        logger.warning(f"   [run_graph] {error_msg}")
        return ToolReturn(return_value=error_msg)
    
    graph_instance = ctx.deps.state.graphs[graph_id]
    
    # Log current status
    logger.info(f"   [run_graph] Found graph: {graph_id} - '{graph_instance.name}' (status: {graph_instance.status})")
    
    # Validate graph can be executed
    if graph_instance.status == 'completed':
        logger.info(f"   [run_graph] Graph {graph_id} already completed, re-running")
    elif graph_instance.status == 'cancelled':
        logger.info(f"   [run_graph] Graph {graph_id} was cancelled, resetting to active")
    elif graph_instance.status == 'waiting':
        logger.info(f"   [run_graph] Resuming waiting graph {graph_id}")
        
    # Update status to active for execution
        graph_instance.status = 'active'
        graph_instance.should_continue = True
        graph_instance.updated_at = datetime.now().isoformat()
        
    # Clear deferred_tool_requests if any
        if graph_instance.deferred_tool_requests:
            graph_instance.deferred_tool_requests = None
    
    # Get query and other properties from the graph instance
    query = graph_instance.query
    
    # Get graph name and max_iterations from the existing graph instance
    graph_name = graph_instance.name
    max_iterations = graph_instance.max_iterations
    
    # Create RunAgentInput from adapter or create a new one
    if adapter and hasattr(adapter, 'run_input'):
        run_input = adapter.run_input
    else:
        # Create a minimal RunAgentInput with current state and context
        run_input = RunAgentInput(
            thread_id=uuid.uuid4().hex,
            run_id=uuid.uuid4().hex,
            messages=[
                UserMessage(
                    id=f'msg_{uuid.uuid4().hex[:8]}',
                    content=query,
                )
            ],
            state=ctx.deps.state.model_dump(),
            context=ctx.deps.agui_context or [],
            tools=[],
            forwarded_props=None,
        )
    
    try:
        # Extract usage tracking context from deps (direct access with UnifiedDeps)
        session_id = deps.session_id
        user_id = deps.user_id
        organization_id = deps.organization_id
        team_id = deps.team_id
        auth_session_id = deps.auth_session_id
        broadcast_func = deps.broadcast_func
        # Database UUIDs for usage tracking
        agent_id = deps.agent_id
        model_id = deps.model_id
        # AGUI context from frontend
        agui_context = deps.agui_context
        
        # Run the multi-agent graph, passing the model from context (REQUIRED)
        # Note: The orchestrator uses its built-in sub-agents (web_search_step, code_execution_step,
        # image_generation_step, result_aggregator_step) instead of external tools.
        result = await run_multi_agent_graph(
            query=query,
            orchestrator_model=ctx.model,  # Use model from RunContext (never create new)
            run_input=run_input,
            send_stream=send_stream,
            max_iterations=max_iterations,
            shared_state=ctx.deps.state,  # Pass shared state for updates
            # Graph instance metadata
            graph_id=graph_id,
            graph_name=graph_name,
            # Usage tracking context
            session_id=session_id,
            user_id=user_id,
            organization_id=organization_id,
            team_id=team_id,
            auth_session_id=auth_session_id,
            broadcast_func=broadcast_func,
            # Database IDs for sub-agent usage tracking (use parent agent's IDs)
            agent_id=agent_id,
            model_id=model_id,
            # AGUI context from frontend (useCopilotReadableData)
            agui_context=agui_context,
            # Auxiliary agent configuration
            agent_type=ctx.deps.agent_type,
            agent_info=ctx.deps.agent_info,
        )
        
        # Update the graph instance with the final result
        ctx.deps.state.graphs[graph_id].result = result
        ctx.deps.state.graphs[graph_id].status = 'completed'
        ctx.deps.state.graphs[graph_id].updated_at = datetime.now().isoformat()
        
        logger.info(f"✅ run_graph completed successfully for graph {graph_id} - '{graph_instance.name}'")
        
        return ToolReturn(
            return_value=result,
        )
        
    except Exception as e:
        error_msg = f"Multi-agent graph execution failed: {str(e)}"
        logger.exception(error_msg)
        
        # Update graph status to failed
        if graph_id in ctx.deps.state.graphs:
            ctx.deps.state.graphs[graph_id].status = 'cancelled'
            ctx.deps.state.graphs[graph_id].errors.append({
                "node": "run_graph",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })
            ctx.deps.state.graphs[graph_id].updated_at = datetime.now().isoformat()
        
        # Return error to agent instead of raising
        return ToolReturn(return_value=error_msg)


async def create_graph(
    ctx: RunContext[UnifiedDeps],
    query: str,
    name: str | None = None,
    max_iterations: int = 5,
) -> ToolReturn:
    """Create a new graph instance with execution plan.
    
    Initializes a graph with the given query and calls the orchestrator to determine
    the execution plan (sequence of steps). The graph is NOT executed - use run_graph()
    after creation to execute it.
    
    When to use:
    - To set up a graph with a clear execution plan before running it
    - To create multiple graphs for batch execution
    - When you need explicit control over execution timing
    - To preview what steps will be executed before running
    
    Args:
        query: The query for the graph to process
        name: Display name (auto-generated from query if not provided)
        max_iterations: Max orchestrator routing iterations (default: 5)
        
    Returns:
        Confirmation with graph ID, name, and planned execution steps
        
    Example:
        create_graph(
            query="Research latest electric cars and create comparison",
            name="Electric Cars Research"
        )
        # Returns: "Planned execution steps: Web Search → Result Aggregator"
    """
    logger.info(f"🆕 create_graph tool invoked with query: {query[:100]}...")
    
    # Auto-generate name from query if not provided
    if not name:
        name = query[:50] + ("..." if len(query) > 50 else "")
    
    # Generate unique graph_id
    graph_id = uuid.uuid4().hex[:12]
    
    # Check if this is the first graph (before adding it)
    is_first_graph = len(ctx.deps.state.graphs) == 0
    
    try:
        # Get context from deps
        send_stream = getattr(ctx.deps, 'send_stream', None)
        session_id = ctx.deps.state.sessionId or ctx.deps.session_id or "default"
        user_id = ctx.deps.user_id
        
        # Update state with session_id if it was None
        if not ctx.deps.state.sessionId:
            ctx.deps.state.sessionId = session_id
        
        # Call internal create_graph function with orchestrator model
        state, created_graph_id, created_graph_name = await create_graph_internal(
            query=query,
            max_iterations=max_iterations,
            user_id=user_id,
            graph_id=graph_id,
            graph_name=name,
            shared_state=ctx.deps.state,
            send_stream=send_stream,
            session_id=session_id,
            mermaid_diagram="",  # Will be generated when graph runs
            orchestrator_model=ctx.model,  # Pass model for execution planning
            organization_id=ctx.deps.organization_id,
            team_id=ctx.deps.team_id,
            agent_type=ctx.deps.agent_type,
            agent_info=ctx.deps.agent_info,
        )
        
        logger.info(f"✅ Graph created: {created_graph_id} - {created_graph_name}")
        
        # Get the graph instance that was created
        graph_instance = ctx.deps.state.graphs[created_graph_id]
        
        # Build result message with execution plan if available
        if graph_instance.planned_steps and len(graph_instance.planned_steps) > 0:
            # Map action types to friendly names
            action_names = {
                'web_search': 'Web Search',
                'image_generation': 'Image Generation',
                'code_execution': 'Code Execution',
                'confirmation': 'User Confirmation',
                'result_aggregator': 'Result Aggregator'
            }
            steps_list = [action_names.get(step, step.title()) for step in graph_instance.planned_steps]
            result_msg = (
                f'Created graph "{created_graph_name}" (ID: {created_graph_id})\n'
                f'Query: {query}\n'
                f'Planned execution steps: {" → ".join(steps_list)}\n'
                f'Status: Ready to execute\n'
                f'Max iterations: {max_iterations}'
            )
        else:
            result_msg = (
                f'Created graph "{created_graph_name}" (ID: {created_graph_id})\n'
                f'Query: {query}\n'
                f'Status: Initialized (execution plan will be determined during execution)\n'
                f'Max iterations: {max_iterations}'
            )
        
        # Activity message for this specific graph
        activity_message_id = f"graph-{created_graph_id}"
        
        # Choose between full snapshot (first graph) or delta (subsequent graphs)
        if is_first_graph:
            # Send full snapshot to establish state structure
            state_dict = ctx.deps.state.model_dump()
            
            # For first graph, use ActivitySnapshotEvent to establish activity structure
            activity_content = {
                "graphs": {created_graph_id: graph_instance.model_dump()},
                "sessionId": session_id,
            }
            
            return ToolReturn(
                return_value=result_msg,
                metadata=[
                    StateSnapshotEvent(
                        type=EventType.STATE_SNAPSHOT,
                        snapshot=state_dict,
                    ),
                    ActivitySnapshotEvent(
                        messageId=activity_message_id,
                        activityType="agent_state",
                        content=activity_content,
                    ),
                ],
            )
        else:
            # Send delta for efficient incremental update
            state_patch_ops: list[JSONPatchOp] = [
                JSONPatchOp(
                    op='add',
                    path=f'/graphs/{created_graph_id}',
                    value=graph_instance.model_dump()
                )
            ]
            
            # Always send ActivitySnapshotEvent to create a new chat message for each graph
            activity_content = {
                "graphs": {created_graph_id: graph_instance.model_dump()},
                "sessionId": session_id,
            }
            
            return ToolReturn(
                return_value=result_msg,
                metadata=[
                    StateDeltaEvent(
                        type=EventType.STATE_DELTA,
                        delta=[op.model_dump(by_alias=True) for op in state_patch_ops],
                    ),
                    ActivitySnapshotEvent(
                        messageId=activity_message_id,
                        activityType="agent_state",
                        content=activity_content,
                    ),
                ],
            )
        
    except Exception as e:
        error_msg = f"Failed to create graph: {str(e)}"
        logger.exception(error_msg)
        return ToolReturn(return_value=error_msg)


async def resume_graph(
    ctx: RunContext[UnifiedDeps],
    graph_id: str,
) -> ToolReturn:
    """Resume a paused or waiting graph and continue execution.
    
    Reconstructs the graph state and continues execution from where it left off.
    Used after user confirmation or when continuing a paused graph.
    
    When to use:
    - After user confirms an action (status: waiting)
    - To continue a paused graph
    - When resuming after an interruption
    
    Args:
        graph_id: Graph ID to resume (e.g., "abc123def456")
        
    Returns:
        Final result from continued graph execution
    """
    logger.info(f"🔄 resume_graph tool invoked for: {graph_id}")
    
    # Check if graph exists
    if graph_id not in ctx.deps.state.graphs:
        return ToolReturn(return_value=f'Graph "{graph_id}" not found')
    
    graph_instance = ctx.deps.state.graphs[graph_id]
    
    # Check if graph is in a resumable state
    if graph_instance.status not in ['waiting', 'paused', 'active']:
        return ToolReturn(
            return_value=f'Graph "{graph_instance.name}" is {graph_instance.status} and cannot be resumed. Only waiting/paused/active graphs can be resumed.'
        )
    
    try:
        # Get context from deps
        send_stream = getattr(ctx.deps, 'send_stream', None)
        adapter = getattr(ctx.deps, 'adapter', None)
        user_id = ctx.deps.user_id
        
        # Create a run_input from adapter or build a minimal one
        if adapter and hasattr(adapter, 'run_input'):
            run_input = adapter.run_input
        else:
            # Create minimal run_input
            run_input = RunAgentInput(
                thread_id=uuid.uuid4().hex,
                run_id=uuid.uuid4().hex,
                messages=[
                    UserMessage(
                        id=f'msg_{uuid.uuid4().hex[:8]}',
                        content=graph_instance.query,
                    )
                ],
                state=ctx.deps.state.model_dump(),
                context=ctx.deps.agui_context or [],
                tools=[],
                forwarded_props=None,
            )
        
        # Call internal resume_graph function to update state
        state, user_confirmed = await resume_graph_internal(
            graph_id=graph_id,
            shared_state=ctx.deps.state,
            run_input=run_input,
            query=graph_instance.query,
            max_iterations=graph_instance.max_iterations,
            user_id=user_id,
            graph_name=graph_instance.name,
            send_stream=send_stream,
        )
        
        logger.info(f"✅ Graph resumed: {graph_id} - confirmed={user_confirmed}")
        
        # If user cancelled, update status and return
        if not user_confirmed:
            ctx.deps.state.graphs[graph_id].status = 'cancelled'
            ctx.deps.state.graphs[graph_id].updated_at = datetime.now().isoformat()
            
            result_msg = (
                f'Graph "{graph_instance.name}" (ID: {graph_id}) was cancelled by user\n'
                f'Status: Cancelled\n'
                f'The graph will not continue execution.'
            )
            
            return ToolReturn(return_value=result_msg)
        
        # User confirmed - continue execution
        logger.info(f"   Continuing graph execution from step {len(state.execution_history)}")
        
        # Get execution context
        organization_id = ctx.deps.organization_id
        team_id = ctx.deps.team_id
        session_id = ctx.deps.state.sessionId or ctx.deps.session_id or "default"
        auth_session_id = ctx.deps.auth_session_id
        broadcast_func = ctx.deps.broadcast_func
        agent_id = ctx.deps.agent_id
        model_id = ctx.deps.model_id
        agui_context = ctx.deps.agui_context
        
        # Execute the graph from resumed state
        result = await run_multi_agent_graph(
            query=graph_instance.query,
            orchestrator_model=ctx.model,
            run_input=run_input,
            send_stream=send_stream,
            max_iterations=graph_instance.max_iterations,
            shared_state=ctx.deps.state,
            graph_id=graph_id,
            graph_name=graph_instance.name,
            session_id=session_id,
            user_id=user_id,
            organization_id=organization_id,
            team_id=team_id,
            auth_session_id=auth_session_id,
            broadcast_func=broadcast_func,
            agent_id=agent_id,
            model_id=model_id,
            agui_context=agui_context,
            agent_type=ctx.deps.agent_type,
            agent_info=ctx.deps.agent_info,
        )
        
        # Update the graph instance with the final result
        ctx.deps.state.graphs[graph_id].result = result
        ctx.deps.state.graphs[graph_id].status = 'completed'
        ctx.deps.state.graphs[graph_id].updated_at = datetime.now().isoformat()
        
        result_msg = (
            f'Graph "{graph_instance.name}" (ID: {graph_id}) completed successfully\n\n'
            f'Result: {result[:200]}{"..." if len(result) > 200 else ""}'
        )
        
        return ToolReturn(return_value=result_msg)
        
    except Exception as e:
        error_msg = f"Failed to resume graph: {str(e)}"
        logger.exception(error_msg)
        return ToolReturn(return_value=error_msg)


# ========== Tool Registry ==========

GRAPH_TOOLS = {
    # Graph lifecycle
    'create_graph': create_graph,
    'resume_graph': resume_graph,
    # Graph management
    'update_graph_status': update_graph_status,
    'pause_graph': pause_graph,
    'cancel_graph': cancel_graph,
    'rename_graph': rename_graph,
    'list_graphs': list_graphs,
    'get_graph_details': get_graph_details,
    'delete_graph': delete_graph,
    # Graph execution
    'run_graph': run_graph,
}

