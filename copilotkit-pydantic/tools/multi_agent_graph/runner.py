"""Runner for multi-agent graph execution.

This module provides the main entry point for running the multi-agent graph
with AG-UI event streaming.

The runner focuses solely on graph execution. Graph creation and resume logic
are handled by the actions module.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING
import uuid
from datetime import datetime

from pydantic_ai import Agent
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE, AGUIAdapter
from ag_ui.core import RunAgentInput, UserMessage

from config import logger

from .types import QueryState
from .graph import create_multi_agent_graph
from .agents import create_agents
from .state import sync_to_shared_state
from .actions import create_graph, resume_graph
from core.models import UnifiedDeps

if TYPE_CHECKING:
    from anyio.streams.memory import MemoryObjectSendStream


async def run_multi_agent_graph(
    query: str,
    orchestrator_model: Any,
    run_input: RunAgentInput | None = None,
    send_stream: MemoryObjectSendStream[str] | None = None,
    max_iterations: int = 5,
    shared_state: Any = None,
    # Graph instance metadata
    graph_name: str | None = None,
    graph_id: str | None = None,
    # Usage tracking context
    session_id: str | None = None,
    user_id: str | None = None,
    organization_id: str | None = None,
    team_id: str | None = None,
    auth_session_id: str | None = None,
    broadcast_func: Any = None,
    # Database IDs for usage tracking
    agent_id: str | None = None,
    model_id: str | None = None,
    # AGUI context from frontend
    agui_context: list[dict] | None = None,
    # Auxiliary agent configuration
    agent_type: str | None = None,
    agent_info: dict | None = None,
) -> str:
    """Run the multi-agent graph with AG UI event streaming.
    
    This function orchestrates the full graph lifecycle:
    1. Determines if creating new or resuming existing graph
    2. Creates/resumes graph state using actions module
    3. Builds and executes the graph
    4. Returns final result
    
    Args:
        query: The user query to process
        orchestrator_model: The model from ctx.model for orchestrator and aggregator (REQUIRED)
        run_input: Optional RunAgentInput for AG-UI protocol. If None, creates a default one.
        send_stream: Optional MemoryObjectSendStream for custom event streaming
        max_iterations: Maximum number of routing iterations (default: 5)
        shared_state: Optional AgentState for syncing graph state with session state
        graph_name: Optional graph name (auto-generated if not provided)
        graph_id: Optional graph ID (auto-generated if not provided)
        session_id: Session ID for usage tracking
        user_id: User ID for usage tracking
        organization_id: Organization ID for usage tracking
        team_id: Team ID for usage tracking
        auth_session_id: Auth session ID for usage tracking
        broadcast_func: Async function to broadcast usage stats
        agent_id: DB UUID of the parent agent (for sub-agent usage tracking)
        model_id: DB UUID of the model (for sub-agent usage tracking)
        agui_context: AGUI context from frontend (useCopilotReadableData / useAgentContext)
        agent_type: Main agent type for auxiliary agent lookup
        agent_info: Main agent info/metadata containing auxiliary agent configuration
    
    Returns:
        Final result from the graph execution
    """
    logger.info(f"🚀 Running Multi-Agent Graph: {query[:100]}...")
    
    # ==================== STEP 1: Create the graph instance ====================
    multi_agent_graph = await create_multi_agent_graph(
        orchestrator_model=orchestrator_model,
        organization_id=organization_id,
        team_id=team_id,
        agent_type=agent_type,
        agent_info=agent_info,
    )
    
    # Generate mermaid diagram for the graph structure
    try:
        mermaid_diagram = multi_agent_graph.render(title='Multi-Agent Graph', direction='TB')
        logger.info(f"   Generated mermaid diagram: {len(mermaid_diagram)} chars")
    except Exception as e:
        logger.warning(f"   Failed to generate mermaid diagram: {e}")
        mermaid_diagram = ""
    
    # ==================== STEP 2: Create default run_input if needed ====================
    
    if run_input is None:
        run_input = RunAgentInput(
            thread_id=uuid.uuid4().hex,
            run_id=uuid.uuid4().hex,
            messages=[
                UserMessage(
                    id=f'msg_{uuid.uuid4().hex[:8]}',
                    content=query,
                )
            ],
            state=shared_state.model_dump() if shared_state else {},
            context=agui_context or [],  # Include AGUI context from frontend
            tools=[],
            forwarded_props=None,
        )
    
    logger.info(f"   Thread ID: {run_input.thread_id}")
    logger.info(f"   Run ID: {run_input.run_id}")
    
    # ==================== STEP 3: Create AGUIAdapter for sub-agents ====================
    
    # Create a general model agent for the AGUIAdapter
    # This adapter is passed to sub-agents via UnifiedDeps
    agents = await create_agents(
        orchestrator_model=orchestrator_model,
        organization_id=organization_id,
        team_id=team_id,
        agent_type=agent_type,
        agent_info=agent_info,
    )
    dummy_agent = Agent(model=agents['general_model'])
    
    ag_ui_adapter = AGUIAdapter(
        agent=dummy_agent,
        run_input=run_input,
        accept=SSE_CONTENT_TYPE
    )
    
    # ==================== STEP 4: Determine if creating new, resuming, or continuing ====================
    
    # Check if graph already exists (CRITICAL: run_graph should NEVER create a new graph)
    graph_exists = (
        shared_state and 
        graph_id and 
        graph_id in shared_state.graphs
    )
    
    # Check if graph already has execution history (already running/resumed)
    is_already_resumed = (
        graph_exists and
        shared_state.graphs[graph_id].execution_history and
        len(shared_state.graphs[graph_id].execution_history) > 0
    )
    
    # Check if graph is waiting for user interaction
    is_resuming = (
        graph_exists and
        shared_state.graphs[graph_id].status == 'waiting'
    )
    
    state: QueryState
    
    if graph_exists:
        # Graph exists - always resume it, never create a new one
        graph_instance = shared_state.graphs[graph_id]
        
        if is_resuming:
            # Resume existing graph from waiting state
            logger.info(f"   Resuming waiting graph {graph_id}")
            state, user_confirmed = await resume_graph(
                graph_id=graph_id,
                shared_state=shared_state,
                run_input=run_input,
                query=query,
                max_iterations=max_iterations,
                user_id=user_id,
                graph_name=graph_name,
                send_stream=send_stream,
            )
        elif is_already_resumed:
            # Graph was already resumed (e.g., by resume_graph tool), reconstruct state from shared_state
            logger.info(f"   Graph {graph_id} already resumed, reconstructing state...")
            state = QueryState(
                query=graph_instance.query or query,
                original_query=graph_instance.original_query or query,
                max_iterations=graph_instance.max_iterations or max_iterations,
                iteration_count=graph_instance.iteration_count or 0,
                execution_history=list(graph_instance.execution_history or []),
                intermediate_results=dict(graph_instance.intermediate_results or {}),
                streaming_text=dict(graph_instance.streaming_text or {}),
                prompts=dict(graph_instance.prompts or {}),
                tool_calls=dict(graph_instance.tool_calls or {}),
                errors=list(graph_instance.errors or []),
                result=graph_instance.result or "",
                should_continue=graph_instance.should_continue,
                planned_steps=list(graph_instance.planned_steps or []),
                user_id=user_id,
            )
        else:
            # Graph exists but hasn't started execution yet - initialize state from graph instance
            logger.info(f"   Resuming existing graph {graph_id} (status: {graph_instance.status})")
            state = QueryState(
                query=graph_instance.query or query,
                original_query=graph_instance.original_query or query,
                max_iterations=graph_instance.max_iterations or max_iterations,
                iteration_count=graph_instance.iteration_count or 0,
                execution_history=list(graph_instance.execution_history or []),
                intermediate_results=dict(graph_instance.intermediate_results or {}),
                streaming_text=dict(graph_instance.streaming_text or {}),
                prompts=dict(graph_instance.prompts or {}),
                tool_calls=dict(graph_instance.tool_calls or {}),
                errors=list(graph_instance.errors or []),
                result=graph_instance.result or "",
                should_continue=True,  # Reset to continue execution
                planned_steps=list(graph_instance.planned_steps or []),
                user_id=user_id,
            )
            # Reset graph status to active if it was completed/cancelled
            if graph_instance.status in ['completed', 'cancelled']:
                graph_instance.status = 'active'
                graph_instance.should_continue = True
                graph_instance.updated_at = datetime.now().isoformat()
    else:
        # Graph doesn't exist - only create new if graph_id was not provided
        # If graph_id was provided but graph doesn't exist, this is an error
        if graph_id:
            raise ValueError(f"Graph {graph_id} not found. Cannot create new graph when graph_id is specified.")
        
        # Create new graph instance (only when graph_id is None)
        logger.info(f"🆕 Creating NEW graph (no graph_id provided)")
        state, graph_id, graph_name = await create_graph(
            query=query,
            max_iterations=max_iterations,
            user_id=user_id,
            graph_id=graph_id,
            graph_name=graph_name,
            shared_state=shared_state,
            send_stream=send_stream,
            session_id=session_id,
            mermaid_diagram=mermaid_diagram,
        )
    
    # ==================== STEP 5: Create UnifiedDeps for graph execution ====================
    
    deps = UnifiedDeps(
        send_stream=send_stream,
        adapter=ag_ui_adapter,
        state=shared_state,
        session_id=session_id,
        user_id=user_id,
        organization_id=organization_id,
        team_id=team_id,
        auth_session_id=auth_session_id,
        broadcast_func=broadcast_func,
        agent_id=agent_id,
        model_id=model_id,
        agui_context=agui_context,
    )
    
    # ==================== STEP 6: Execute the graph ====================
    
    logger.info(f"   ▶️  Executing graph with state: {len(state.execution_history)} steps in history")
    
    try:
        # Run the graph with UnifiedDeps
        result = await multi_agent_graph.run(state=state, inputs=query, deps=deps)
        
        # ==================== STEP 7: Sync final result to shared state ====================
        
        if shared_state:
            graph_id = sync_to_shared_state(state, shared_state, "", graph_id, graph_name)
        
        logger.info(f"✅ GRAPH EXECUTION COMPLETE")
        logger.info(f"   Result: {result[:200]}..." if len(result) > 200 else f"   Result: {result}")
        
        return result
        
    except Exception as e:
        error_msg = f"Graph execution failed: {str(e)}"
        logger.exception(f"❌ {error_msg}")
        
        # Sync error to shared state
        if shared_state and graph_id and graph_id in shared_state.graphs:
            from datetime import datetime
            shared_state.graphs[graph_id].errors.append({
                "node": "graph_execution",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })
            sync_to_shared_state(state, shared_state, "", graph_id, graph_name)
        
        raise

