"""Runner for multi-agent graph execution.

This module provides the main entry point for running the multi-agent graph
with AG-UI event streaming.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING
import uuid

from pydantic_ai import Agent
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE, AGUIAdapter
from ag_ui.core import RunAgentInput, UserMessage, EventType, StateSnapshotEvent, StateDeltaEvent
from ag_ui.encoder import EventEncoder

from config import logger
from config.environment import GOOGLE_API_KEY

from .types import QueryState
from .graph import create_multi_agent_graph
from .agents import create_agents
from .state import sync_to_shared_state
from core.models import UnifiedDeps, JSONPatchOp

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
        agui_context: AGUI context from frontend (useCopilotReadableData / useAgentContext)
    
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
    if shared_state and graph_id and graph_id in shared_state.graphs:
        shared_state.graphs[graph_id].mermaid_diagram = mermaid_diagram
    
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
            state=shared_state.model_dump() if shared_state else {},
            context=agui_context or [],  # Include AGUI context from frontend
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
    
    # Check if we're resuming from a waiting state
    graph_instance = None
    if shared_state and graph_id and graph_id in shared_state.graphs:
        graph_instance = shared_state.graphs[graph_id]
    
    is_resuming = (
        graph_instance and 
        graph_instance.status == 'active' and
        graph_instance.execution_history and
        len(graph_instance.execution_history) > 0
    )
    
    if is_resuming:
        logger.info(f"🔄 RESUMING graph {graph_id} from previous state")
        logger.info(f"   Execution history: {graph_instance.execution_history}")
        logger.info(f"   Planned steps: {graph_instance.planned_steps}")
        
        # Check if user confirmed or cancelled by looking at tool result in messages
        user_confirmed = True  # Default to confirmed
        for msg in run_input.messages:
            # Check for tool result message
            if hasattr(msg, 'role') and msg.role == 'tool':
                # Tool result message
                result_content = getattr(msg, 'content', '')
                if isinstance(result_content, str) and 'confirmed' in result_content.lower():
                    try:
                        import json
                        result_data = json.loads(result_content)
                        if isinstance(result_data, dict) and 'confirmed' in result_data:
                            user_confirmed = result_data['confirmed']
                            logger.info(f"   Found confirmAction result: confirmed={user_confirmed}")
                    except (json.JSONDecodeError, TypeError):
                        pass
            # Also check for ToolResultMessage type
            elif hasattr(msg, 'result'):
                result_content = msg.result
                if isinstance(result_content, str) and 'confirmed' in result_content.lower():
                    try:
                        import json
                        result_data = json.loads(result_content)
                        if isinstance(result_data, dict) and 'confirmed' in result_data:
                            user_confirmed = result_data['confirmed']
                            logger.info(f"   Found confirmAction result: confirmed={user_confirmed}")
                    except (json.JSONDecodeError, TypeError):
                        pass
                elif isinstance(result_content, dict) and 'confirmed' in result_content:
                    user_confirmed = result_content['confirmed']
                    logger.info(f"   Found confirmAction result: confirmed={user_confirmed}")
        
        # Create QueryState from existing graph_instance
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
            should_continue=user_confirmed,  # Only continue if user confirmed
            planned_steps=list(graph_instance.planned_steps or []),
            user_id=user_id,  # For workspace integration
        )
        
        # Set result based on user's choice
        confirmation_result = '{"confirmed": true}' if user_confirmed else '{"confirmed": false}'
        confirmation_text = "User confirmed the action" if user_confirmed else "User cancelled the action"
        
        # Mark Confirmation step as completed with user's choice
        # Find any Confirmation steps in history and update their tool calls
        for entry in state.execution_history:
            if entry.startswith("Confirmation:") or entry == "Confirmation":
                confirmation_key = entry
                # Update the indexed key
                if confirmation_key in state.tool_calls:
                    for tc in state.tool_calls[confirmation_key]:
                        if isinstance(tc, dict):
                            tc["status"] = "completed"
                            tc["result"] = confirmation_result
                        elif hasattr(tc, 'status'):
                            tc.status = "completed"
                            tc.result = confirmation_result
                    logger.info(f"   Updated {confirmation_key} tool calls to completed (confirmed={user_confirmed})")
                # Also update the base "Confirmation" key
                if "Confirmation" in state.tool_calls:
                    for tc in state.tool_calls["Confirmation"]:
                        if isinstance(tc, dict):
                            tc["status"] = "completed"
                            tc["result"] = confirmation_result
                        elif hasattr(tc, 'status'):
                            tc.status = "completed"
                            tc.result = confirmation_result
                # Update streaming text
                if confirmation_key in state.streaming_text:
                    state.streaming_text[confirmation_key] = confirmation_text
                if "Confirmation" in state.streaming_text:
                    state.streaming_text["Confirmation"] = confirmation_text
        
        # Clear the result from waiting state since we're continuing
        if state.result and "Waiting for user interaction" in state.result:
            state.result = ""
        
        # If user cancelled, set appropriate result and stop
        if not user_confirmed:
            state.result = "User cancelled the action"
            state.should_continue = False
            logger.info(f"   User cancelled - graph will end")
        
        # Sync updated state to shared_state and send delta to show Confirmation completed
        if shared_state:
            sync_to_shared_state(state, shared_state, "", graph_id, graph_name)
            if send_stream and encoder:
                from .state import build_graph_agent_state
                graph_state = build_graph_agent_state(state, "", "completed")
                if graph_id in shared_state.graphs and shared_state.graphs[graph_id].mermaid_diagram:
                    graph_state["mermaid_diagram"] = shared_state.graphs[graph_id].mermaid_diagram
                
                # Use delta to update only this graph
                patch_ops = [
                    JSONPatchOp(
                        op='replace',
                        path=f'/graphs/{graph_id}',
                        value=shared_state.graphs[graph_id].model_dump()
                    )
                ]
                
                await send_stream.send(
                    encoder.encode(
                        StateDeltaEvent(
                            type=EventType.STATE_DELTA,
                            delta=[op.model_dump(by_alias=True) for op in patch_ops],
                        )
                    )
                )
                logger.info(f"   Sent delta with updated Confirmation step")
    else:
        logger.info(f"🆕 Starting NEW graph execution")
        # Initialize internal graph state (only for NEW executions)
        state = QueryState(query=query, max_iterations=max_iterations, user_id=user_id)
    
        # Generate graph_id if not provided
        if not graph_id:
            graph_id = uuid.uuid4().hex[:12]
        
        # Generate graph_name from query if not provided
        if not graph_name:
            graph_name = query[:50] + ("..." if len(query) > 50 else "")
    
    # Create UnifiedDeps with all required context
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
    
    # Send minimal initial state snapshot to establish state structure
    # This ensures the frontend has a base state object for delta operations
    if shared_state and send_stream and encoder:
        # Send a minimal snapshot to initialize the state structure
        initial_state = {
            "sessionId": shared_state.sessionId if hasattr(shared_state, 'sessionId') else session_id,
            "plans": {k: v.model_dump() for k, v in shared_state.plans.items()} if hasattr(shared_state, 'plans') else {},
            "graphs": {k: v.model_dump() for k, v in shared_state.graphs.items()} if hasattr(shared_state, 'graphs') else {},
        }
        
        await send_stream.send(
            encoder.encode(
                StateSnapshotEvent(
                    type=EventType.STATE_SNAPSHOT,
                    snapshot=initial_state,
                )
            )
        )
        logger.info(f"   [InitialState] Sent initial state snapshot with {len(initial_state.get('plans', {}))} plans and {len(initial_state.get('graphs', {}))} graphs")
    
    try:
        # Run the graph with UnifiedDeps
        result = await multi_agent_graph.run(state=state, inputs=query, deps=deps)
        
        # Sync final result to shared state (for persistence)
        if shared_state:
            graph_id = sync_to_shared_state(state, shared_state, "", graph_id, graph_name)
        
        logger.info(f"✅ FINAL RESULT: {result[:200]}..." if len(result) > 200 else f"✅ FINAL RESULT: {result}")
        
        return result
        
    except Exception as e:
        error_msg = f"Graph execution failed: {str(e)}"
        logger.exception(error_msg)
        
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

