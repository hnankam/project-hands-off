"""
Graph Management Tools

Similar to plan management tools, these provide CRUD operations for GraphInstance objects.
Graphs can be referenced by name or ID, supporting multi-instance graph execution.

Also includes run_graph() for executing multi-agent graphs.
"""

from __future__ import annotations
from typing import Any
import uuid
import logging

from pydantic_ai.tools import ToolReturn
from pydantic_ai import RunContext
from ag_ui.core import RunAgentInput, UserMessage

from core.models import UnifiedDeps, GraphInstance
from tools.multi_agent_graph import run_multi_agent_graph, QueryState
from datetime import datetime

logger = logging.getLogger(__name__)


# ========== Helper Functions ==========

def resolve_graph_identifier(state, graph_identifier: str) -> str | None:
    """
    Resolve graph identifier (name or ID) to actual graph_id.
    Supports case-insensitive and partial name matching.
    
    Args:
        state: AgentState containing graphs dictionary
        graph_identifier: Either graph_id or graph name
        
    Returns:
        graph_id if found, None otherwise
    """
    graphs = state.graphs
    
    # Direct ID match
    if graph_identifier in graphs:
        return graph_identifier
    
    # Case-insensitive exact name match
    for gid, graph in graphs.items():
        if graph.name.lower() == graph_identifier.lower():
            return gid
    
    # Partial name match (case-insensitive)
    matches = []
    search_lower = graph_identifier.lower()
    for gid, graph in graphs.items():
        if search_lower in graph.name.lower():
            matches.append((gid, graph.name))
    
    if len(matches) == 1:
        return matches[0][0]
    elif len(matches) > 1:
        logger.warning(f"Multiple graphs match '{graph_identifier}': {[m[1] for m in matches]}")
        return None  # Ambiguous
    
    return None


# ========== Graph Management Tools ==========

async def update_graph_status(
    ctx: RunContext[UnifiedDeps],
    graph_identifier: str,
    status: str
) -> ToolReturn:
    """
    Update the status of a graph execution.
    
    Use this to pause, resume, complete, or cancel graph executions.
    
    Args:
        ctx: The run context
        graph_identifier: Graph name or ID
        status: New status - 'active', 'paused', 'completed', 'cancelled', 'waiting'
        
    Returns:
        Success or error message
        
    Examples:
        # Pause a running graph
        update_graph_status("Research ML Topics", "paused")
        
        # Resume a paused graph
        update_graph_status("Research ML Topics", "active")
        
        # Mark as completed
        update_graph_status("abc123def456", "completed")
    """
    graph_id = resolve_graph_identifier(ctx.deps.state, graph_identifier)
    if not graph_id:
        return ToolReturn(return_value=f'Graph "{graph_identifier}" not found')
    
    graph = ctx.deps.state.graphs[graph_id]
    old_status = graph.status
    graph.status = status
    graph.updated_at = datetime.now().isoformat()
    
    return ToolReturn(
        return_value=f'Graph "{graph.name}" status changed from {old_status} to {status}',
        metadata=[{
            "type": "agent_state",
            "activity_content": ctx.deps.state.model_dump()
        }]
    )


async def rename_graph(
    ctx: RunContext[UnifiedDeps],
    graph_identifier: str,
    new_name: str
) -> ToolReturn:
    """
    Rename a graph execution for easier reference.
    
    Args:
        ctx: The run context
        graph_identifier: Current graph name or ID
        new_name: New name for the graph
        
    Returns:
        Success or error message
        
    Example:
        rename_graph("Research ML", "Research Machine Learning Topics")
    """
    graph_id = resolve_graph_identifier(ctx.deps.state, graph_identifier)
    if not graph_id:
        return ToolReturn(return_value=f'Graph "{graph_identifier}" not found')
    
    graph = ctx.deps.state.graphs[graph_id]
    old_name = graph.name
    graph.name = new_name
    graph.updated_at = datetime.now().isoformat()
    
    return ToolReturn(
        return_value=f'Graph renamed from "{old_name}" to "{new_name}"',
        metadata=[{
            "type": "agent_state",
            "activity_content": ctx.deps.state.model_dump()
        }]
    )


async def list_graphs(ctx: RunContext[UnifiedDeps]) -> ToolReturn:
    """
    List all graph executions in the current session.
    
    Shows graph names, IDs, status, and queries for easy reference.
    
    Returns:
        Formatted list of all graphs
        
    Example:
        list_graphs()
    """
    graphs = ctx.deps.state.graphs
    
    if not graphs:
        return ToolReturn(return_value="No graph executions in this session.")
    
    # Group by status
    active = [g for g in graphs.values() if g.status == 'active']
    paused = [g for g in graphs.values() if g.status == 'paused']
    completed = [g for g in graphs.values() if g.status == 'completed']
    cancelled = [g for g in graphs.values() if g.status == 'cancelled']
    waiting = [g for g in graphs.values() if g.status == 'waiting']
    
    result = []
    
    if active:
        result.append(f"Active Graphs ({len(active)}):")
        for g in active:
            result.append(f'  - "{g.name}" (ID: {g.graph_id})')
            result.append(f'    Query: {g.query[:60]}{"..." if len(g.query) > 60 else ""}')
            result.append(f'    Steps: {len(g.steps)} | Iterations: {g.iteration_count}/{g.max_iterations}')
    
    if paused:
        result.append(f"\nPaused Graphs ({len(paused)}):")
        for g in paused:
            result.append(f'  - "{g.name}" (ID: {g.graph_id})')
    
    if waiting:
        result.append(f"\nWaiting Graphs ({len(waiting)}):")
        for g in waiting:
            result.append(f'  - "{g.name}" (ID: {g.graph_id})')
    
    if completed:
        result.append(f"\nCompleted Graphs ({len(completed)}):")
        for g in completed:
            result.append(f'  - "{g.name}" (ID: {g.graph_id})')
    
    if cancelled:
        result.append(f"\nCancelled Graphs ({len(cancelled)}):")
        for g in cancelled:
            result.append(f'  - "{g.name}" (ID: {g.graph_id})')
    
    return ToolReturn(return_value="\n".join(result))


async def get_graph_details(
    ctx: RunContext[UnifiedDeps],
    graph_identifier: str
) -> str:
    """Get detailed information about a graph execution including all steps.
    
    Returns the graph's complete step list with node names, statuses, and results,
    useful for reviewing execution flow or debugging.
    
    Args:
        graph_identifier: Graph name or ID
        
    Returns:
        Detailed graph information with all steps
        
    Example:
        get_graph_details("Image Generation Task")
    """
    graph_id = resolve_graph_identifier(ctx.deps.state, graph_identifier)
    if not graph_id:
        available = [f'"{g.name}" ({gid})' for gid, g in ctx.deps.state.graphs.items()]
        error_msg = (
            f'Graph "{graph_identifier}" not found. Available graphs:\n' +
            ('\n'.join(available) if available else 'No graphs available')
        )
        return error_msg
    
    graph = ctx.deps.state.graphs[graph_id]
    
    # Build detailed output
    result = f'**{graph.name}**\n'
    result += f'ID: {graph_id}\n'
    result += f'Status: {graph.status}\n'
    result += f'Query Type: {graph.query_type}\n'
    result += f'Original Query: {graph.original_query}\n'
    result += f'Iterations: {graph.iteration_count}/{graph.max_iterations}\n'
    result += f'Created: {graph.created_at}\n'
    result += f'Updated: {graph.updated_at}\n'
    
    if graph.result:
        result += f'\nFinal Result:\n{graph.result[:200]}{"..." if len(graph.result) > 200 else ""}\n'
    
    # Show execution history
    if graph.execution_history:
        result += f'\nExecution History:\n'
        result += ' → '.join(graph.execution_history)
        result += '\n'
    
    # Show steps with details
    if graph.steps:
        result += f'\nSteps ({len(graph.steps)}):\n\n'
        
        for i, step in enumerate(graph.steps):
            result += f'{i}. [{step.status}] Node: {step.node}\n'
            
            if step.prompt:
                result += f'   Prompt: {step.prompt[:100]}{"..." if len(step.prompt) > 100 else ""}\n'
            
            if step.result:
                result += f'   Result: {step.result[:150]}{"..." if len(step.result) > 150 else ""}\n'
            
            if step.tool_calls:
                result += f'   Tools used: {len(step.tool_calls)} call(s)\n'
            
            if step.timestamp:
                result += f'   Time: {step.timestamp}\n'
            
            result += '\n'
    
    # Show errors if any
    if graph.errors:
        result += f'Errors ({len(graph.errors)}):\n'
        for err in graph.errors[-3:]:  # Show last 3 errors
            result += f'  - Node: {err.get("node", "unknown")}\n'
            result += f'    Error: {err.get("error", "")[:100]}\n'
            if err.get("timestamp"):
                result += f'    Time: {err.get("timestamp")}\n'
    
    return result


async def delete_graph(
    ctx: RunContext[UnifiedDeps],
    graph_identifier: str
) -> ToolReturn:
    """
    Delete a graph execution from the session.
    
    This permanently removes the graph and all its execution history.
    Use with caution!
    
    Args:
        ctx: The run context
        graph_identifier: Graph name or ID to delete
        
    Returns:
        Success or error message
        
    Example:
        delete_graph("Old Research Graph")
    """
    graph_id = resolve_graph_identifier(ctx.deps.state, graph_identifier)
    if not graph_id:
        return ToolReturn(return_value=f'Graph "{graph_identifier}" not found')
    
    graph_name = ctx.deps.state.graphs[graph_id].name
    del ctx.deps.state.graphs[graph_id]
    
    return ToolReturn(
        return_value=f'Graph "{graph_name}" (ID: {graph_id}) deleted',
        metadata=[{
            "type": "agent_state",
            "activity_content": ctx.deps.state.model_dump()
        }]
    )


# ========== Graph Execution Tool ==========

async def run_graph(
    ctx: RunContext[UnifiedDeps], 
    query: str,
    name: str | None = None,
    max_iterations: int = 5
) -> ToolReturn:
    """Run a multi-agent graph to process complex queries.
    
    This tool orchestrates multiple specialized agents (image generation, web search,
    code execution) to handle complex, multi-step queries. The graph uses an orchestrator
    agent to analyze the query and route it to the appropriate worker agents.
    
    State updates are sent via StateSnapshotEvent, using the flat AgentState.graphs structure.
    Each graph execution is a named instance that can coexist with other graphs and plans.
    
    Use cases:
    - Complex queries requiring multiple steps (e.g., "Search for X and create an image of it")
    - Queries that need specialized processing (calculations, image generation, web search)
    - Multi-modal tasks that combine different capabilities
    
    Args:
        ctx: The run context with agent state and context
        query: The user query to process through the multi-agent graph
        name: Human-readable name for this graph execution (max 50 chars, auto-generated from query if not provided)
        max_iterations: Maximum number of orchestrator iterations (default: 5)
        
    Returns:
        ToolReturn with the final result and StateSnapshotEvent for state sync
        
    Example:
        run_graph(ctx, "Search for the latest SpaceX launch and create an image visualizing it",
                  name="SpaceX Launch Research")
    """
    logger.info(f"🚀 run_graph tool invoked with query: {query[:100]}...")
    
    # Get context from deps
    deps = ctx.deps
    send_stream = getattr(deps, 'send_stream', None)
    adapter = getattr(deps, 'adapter', None)
    
    # Auto-generate name from query if not provided
    if not name:
        name = query[:50] + ("..." if len(query) > 50 else "")
    
    # Check if there's an existing graph in "waiting" status (e.g., after confirmation)
    # Look for a graph with matching query and "waiting" status
    waiting_graph_id = None
    for gid, graph in ctx.deps.state.graphs.items():
        if graph.status == 'waiting' and graph.query == query:
            waiting_graph_id = gid
            logger.info(f"🔄 Found waiting graph: {gid}")
            break
    
    if waiting_graph_id:
        # RESUME existing graph
        logger.info(f"   [run_graph] RESUMING graph {waiting_graph_id} from waiting state")
        graph_id = waiting_graph_id
        graph_instance = ctx.deps.state.graphs[graph_id]
        
        # Update status to resume execution
        graph_instance.status = 'active'
        graph_instance.should_continue = True
        graph_instance.updated_at = datetime.now().isoformat()
        
        # Clear deferred_tool_requests
        if graph_instance.deferred_tool_requests:
            graph_instance.deferred_tool_requests = None
    else:
        # CREATE new graph instance
        logger.info(f"   [run_graph] Starting NEW graph execution")
        
        # Generate unique graph_id
        graph_id = uuid.uuid4().hex[:12]
        
        # Create new GraphInstance
        graph_instance = GraphInstance(
            graph_id=graph_id,
            name=name,
            status='active',
            steps=[],
            query=query,
            original_query=query,
            result="",
            query_type="",
            execution_history=[],
            intermediate_results={},
            streaming_text={},
            prompts={},
            tool_calls={},
            errors=[],
            last_error_node="",
            retry_count=0,
            max_retries=2,
            iteration_count=0,
            max_iterations=max_iterations,
            should_continue=True,
            next_action="",
            planned_steps=[],
            mermaid_diagram="",
            deferred_tool_requests=None,
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat()
        )
        
        # Store in state.graphs
        ctx.deps.state.graphs[graph_id] = graph_instance
        logger.info(f"   [run_graph] Created GraphInstance: {graph_id}")
    
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
            # Graph instance metadata (NEW: pass graph_id and name)
            graph_id=graph_id,
            graph_name=name,
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
        )
        
        # Update the graph instance with the final result
        ctx.deps.state.graphs[graph_id].result = result
        ctx.deps.state.graphs[graph_id].status = 'completed'
        ctx.deps.state.graphs[graph_id].updated_at = datetime.now().isoformat()
        
        logger.info(f"run_graph completed successfully for graph {graph_id}")
        
        # NOTE: Do NOT send StateSnapshotEvent here!
        # The graph already sends GraphAgentState format during execution.
        # Sending AgentState format here would overwrite the graph progress
        # with { steps: [], graph: {...} } which causes the UI to hide progress.
        # The final GraphAgentState is sent by the finalize_result step.
        
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


# ========== Tool Registry ==========

GRAPH_TOOLS = {
    # Graph management
    'update_graph_status': update_graph_status,
    'rename_graph': rename_graph,
    'list_graphs': list_graphs,
    'get_graph_details': get_graph_details,
    'delete_graph': delete_graph,
    # Graph execution
    'run_graph': run_graph,
}

