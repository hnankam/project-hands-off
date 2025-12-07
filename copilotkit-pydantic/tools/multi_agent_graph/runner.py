"""Runner for multi-agent graph execution.

This module provides the main entry point for running the multi-agent graph
with AG-UI event streaming.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING
import uuid

from pydantic_ai import Agent
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE, AGUIAdapter
from ag_ui.core import RunAgentInput, UserMessage, EventType, StateSnapshotEvent
from ag_ui.encoder import EventEncoder

from config import logger
from config.environment import GOOGLE_API_KEY

from .types import QueryState, GraphDeps
from .graph import create_multi_agent_graph
from .agents import create_agents
from .state import sync_to_shared_state

if TYPE_CHECKING:
    from anyio.streams.memory import MemoryObjectSendStream


async def run_multi_agent_graph(
    query: str,
    orchestrator_model: Any,
    run_input: RunAgentInput | None = None,
    send_stream: MemoryObjectSendStream[str] | None = None,
    api_key: str | None = None,
    max_iterations: int = 5,
    shared_state: Any = None,
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
) -> str:
    """Run the multi-agent graph with AG UI event streaming.
    
    Args:
        query: The user query to process
        orchestrator_model: The model from ctx.model for orchestrator (REQUIRED)
        run_input: Optional RunAgentInput for AG-UI protocol. If None, creates a default one.
        send_stream: Optional MemoryObjectSendStream for custom event streaming
        api_key: Optional Google API key. If None, uses environment variable.
        max_iterations: Maximum number of routing iterations (default: 5)
        shared_state: Optional AgentState for syncing graph state with session state
        session_id: Session ID for usage tracking
        user_id: User ID for usage tracking
        organization_id: Organization ID for usage tracking
        team_id: Team ID for usage tracking
        auth_session_id: Auth session ID for usage tracking
        broadcast_func: Async function to broadcast usage stats
        agent_id: DB UUID of the parent agent (for sub-agent usage tracking)
        model_id: DB UUID of the model (for sub-agent usage tracking)
    
    Returns:
        Final result from the graph execution
    """
    # Create the graph with orchestrator model from context
    multi_agent_graph = create_multi_agent_graph(
        orchestrator_model=orchestrator_model,
        api_key=api_key,
    )
    
    # Generate mermaid diagram for the graph structure
    try:
        mermaid_diagram = multi_agent_graph.render(title='Multi-Agent Graph', direction='TB')
        logger.info(f"Generated mermaid diagram: {len(mermaid_diagram)} chars")
    except Exception as e:
        logger.warning(f"Failed to generate mermaid diagram: {e}")
        mermaid_diagram = ""
    
    # Store mermaid diagram in shared state if available
    if shared_state and hasattr(shared_state, 'graph'):
        shared_state.graph.mermaid_diagram = mermaid_diagram
    
    # Create default run_input if not provided
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
            state={},
            context=[],
            tools=[],
            forwarded_props=None,
        )
    
    logger.info(f"🚀 Running Multi-Agent Graph")
    logger.info(f"Thread ID: {run_input.thread_id}")
    logger.info(f"Run ID: {run_input.run_id}")
    logger.info(f"Query: {query}")
    
    # Initialize encoder if we have a send stream
    encoder = EventEncoder(accept=SSE_CONTENT_TYPE) if send_stream else None
    
    # Create agents to get the general model for the adapter
    # Note: We reuse the google_provider from agents instead of creating new model
    agents = create_agents(orchestrator_model, api_key)
    dummy_agent = Agent(model=agents['general_model'])
    
    # Create AGUIAdapter instance with the dummy agent
    ag_ui_adapter = AGUIAdapter(
        agent=dummy_agent,
        run_input=run_input,
        accept=SSE_CONTENT_TYPE
    )
    
    # Initialize internal graph state
    state = QueryState(query=query, max_iterations=max_iterations)
    
    # Create GraphDeps with all required context
    deps = GraphDeps(
        send_stream=send_stream,
        ag_ui_adapter=ag_ui_adapter,
        shared_state=shared_state,
        session_id=session_id,
        user_id=user_id,
        organization_id=organization_id,
        team_id=team_id,
        auth_session_id=auth_session_id,
        broadcast_func=broadcast_func,
        agent_id=agent_id,
        model_id=model_id,
    )
    
    # Send initial state snapshot if we have shared state
    if shared_state and send_stream and encoder:
        await send_stream.send(
            encoder.encode(
                StateSnapshotEvent(
                    type=EventType.STATE_SNAPSHOT,
                    snapshot=shared_state.model_dump(),
                )
            )
        )
    
    try:
        # Run the graph with GraphDeps
        result = await multi_agent_graph.run(state=state, inputs=query, deps=deps)
        
        # Sync final result to shared state (for persistence)
        if shared_state:
            sync_to_shared_state(state, shared_state)
        
        logger.info(f"✅ FINAL RESULT: {result[:200]}..." if len(result) > 200 else f"✅ FINAL RESULT: {result}")
        
        return result
        
    except Exception as e:
        error_msg = f"Graph execution failed: {str(e)}"
        logger.exception(error_msg)
        
        # Sync error to shared state
        if shared_state:
            from datetime import datetime
            shared_state.graph.errors.append({
                "node": "graph_execution",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })
            sync_to_shared_state(state, shared_state)
        
        raise

