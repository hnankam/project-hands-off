"""Graph lifecycle actions for multi-agent orchestration.

This module provides actions for:
- Creating new graph instances with execution plans
- Resuming paused/waiting graphs after user interaction
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING
import uuid
import json
from datetime import datetime

from ag_ui.core import RunAgentInput, EventType, StateSnapshotEvent, StateDeltaEvent, ActivitySnapshotEvent
from ag_ui.encoder import EventEncoder
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE

from config import logger
from core.models import JSONPatchOp
from .types import QueryState, RoutingDecision
from .state import sync_to_shared_state, build_graph_agent_state
from .agents import create_agents

if TYPE_CHECKING:
    from anyio.streams.memory import MemoryObjectSendStream


async def create_graph(
    query: str,
    max_iterations: int,
    user_id: str | None,
    graph_id: str | None = None,
    graph_name: str | None = None,
    shared_state: Any = None,
    send_stream: MemoryObjectSendStream[str] | None = None,
    session_id: str | None = None,
    mermaid_diagram: str = "",
    orchestrator_model: Any = None,
    organization_id: str | None = None,
    team_id: str | None = None,
    agent_type: str | None = None,
    agent_info: dict | None = None,
) -> tuple[QueryState, str, str]:
    """Create a new graph instance with execution plan.
    
    Initializes a new QueryState, calls orchestrator to determine execution plan,
    and syncs to shared state with planned steps.
    Events are sent by the external wrapper tool via ToolReturn metadata.
    
    Args:
        query: The user query to process
        max_iterations: Maximum number of routing iterations
        user_id: User ID for workspace integration
        graph_id: Optional graph ID (will be generated if not provided)
        graph_name: Optional graph name (will be generated from query if not provided)
        shared_state: Optional AgentState for syncing
        send_stream: Optional stream for sending events
        session_id: Session ID for state events
        mermaid_diagram: Optional mermaid diagram to include
        orchestrator_model: Model to use for orchestrator (required to get execution plan)
        organization_id: Organization ID for loading auxiliary agents
        team_id: Team ID for loading auxiliary agents
        agent_type: Main agent type for auxiliary agent lookup
        agent_info: Main agent info/metadata containing auxiliary agent configuration
        
    Returns:
        Tuple of (QueryState, graph_id, graph_name)
    """
    logger.info(f"🆕 Creating NEW graph with execution planning")
    
    # Initialize internal graph state
    state = QueryState(query=query, max_iterations=max_iterations, user_id=user_id)
    
    # Generate graph_id if not provided
    if not graph_id:
        graph_id = uuid.uuid4().hex[:12]
    
    # Generate graph_name from query if not provided
    if not graph_name:
        graph_name = query[:50] + ("..." if len(query) > 50 else "")
    
    logger.info(f"   Graph ID: {graph_id}")
    logger.info(f"   Graph Name: {graph_name}")
    
    # Call orchestrator to get execution plan
    if orchestrator_model:
        try:
            logger.info("📋 Calling orchestrator to determine execution plan...")
            agents = await create_agents(
                orchestrator_model=orchestrator_model,
                organization_id=organization_id,
                team_id=team_id,
                agent_type=agent_type,
                agent_info=agent_info,
            )
            orchestrator = agents['orchestrator']
            
            # Create context for orchestrator
            context = (
                f"Query: {query}\n\n"
                f"This is the FIRST iteration. Analyze the query and provide a planned_sequence "
                f"with all the steps you will execute.\n"
                f"Current execution history: []\n"
                f"Previous results: {{}}"
            )
            
            result = await orchestrator.run(context)
            decision: RoutingDecision = result.output
            
            if decision and hasattr(decision, 'planned_sequence') and decision.planned_sequence:
                state.planned_steps = list(decision.planned_sequence)
                logger.info(f"   ✅ Execution plan created: {' → '.join(state.planned_steps)}")
            else:
                logger.warning("   ⚠️  Orchestrator did not provide planned_sequence, graph will have empty plan")
        except Exception as e:
            logger.warning(f"   ⚠️  Failed to get execution plan from orchestrator: {e}")
            # Continue without plan - orchestrator will create it during execution
    else:
        logger.warning("   ⚠️  No orchestrator_model provided, skipping execution planning")
    
    # Sync to shared state (creates the GraphInstance)
    # Events are sent by the external wrapper via ToolReturn metadata
    if shared_state:
        sync_to_shared_state(state, shared_state, "", graph_id, graph_name)
        
        # Update mermaid diagram if available
        if mermaid_diagram and graph_id in shared_state.graphs:
            shared_state.graphs[graph_id].mermaid_diagram = mermaid_diagram
    
    return state, graph_id, graph_name


async def resume_graph(
    graph_id: str,
    shared_state: Any,
    run_input: RunAgentInput,
    query: str,
    max_iterations: int,
    user_id: str | None = None,
    graph_name: str | None = None,
    send_stream: MemoryObjectSendStream[str] | None = None,
) -> tuple[QueryState, bool]:
    """Resume a paused/waiting graph after user interaction.
    
    Reconstructs QueryState from shared_state, processes user confirmation,
    and updates the Confirmation step status.
    
    Args:
        graph_id: The graph ID to resume
        shared_state: AgentState containing graph instances
        run_input: RunAgentInput with messages (including confirmation result)
        query: The original query (fallback if not in graph)
        max_iterations: Maximum iterations (fallback if not in graph)
        user_id: User ID for workspace integration
        graph_name: Optional graph name
        send_stream: Optional stream for sending events
        
    Returns:
        Tuple of (QueryState, user_confirmed)
        - QueryState: Reconstructed state ready for graph execution
        - user_confirmed: Whether user confirmed the action
    """
    if not shared_state or not hasattr(shared_state, 'graphs') or graph_id not in shared_state.graphs:
        raise ValueError(f"Graph {graph_id} not found in shared state")
    
    graph_instance = shared_state.graphs[graph_id]
    
    logger.info(f"🔄 RESUMING graph {graph_id} from previous state")
    logger.info(f"   Execution history: {graph_instance.execution_history}")
    logger.info(f"   Planned steps: {graph_instance.planned_steps}")
    
    # Check if user confirmed or cancelled by looking at message content
    # The frontend sends: "Run graph `@[Graph]...` with confirmation result: {\"confirmed\": true/false}"
    user_confirmed = True  # Default to confirmed
    for msg in run_input.messages:
        # Check message content for confirmation result
        content = getattr(msg, 'content', '')
        if isinstance(content, str):
            # Look for "confirmation result: {...}" pattern
            if 'confirmation result:' in content.lower():
                try:
                    # Extract JSON from message content
                    import re
                    match = re.search(r'confirmation result:\s*(\{[^}]+\})', content, re.IGNORECASE)
                    if match:
                        result_json = match.group(1)
                        result_data = json.loads(result_json)
                        if isinstance(result_data, dict) and 'confirmed' in result_data:
                            user_confirmed = result_data['confirmed']
                            logger.info(f"   Found confirmation result in message: confirmed={user_confirmed}")
                            break
                except (json.JSONDecodeError, TypeError, AttributeError):
                    pass
            # Also check if content contains JSON with confirmed field
            elif 'confirmed' in content.lower():
                try:
                    # Try to parse entire content as JSON
                    result_data = json.loads(content)
                    if isinstance(result_data, dict) and 'confirmed' in result_data:
                        user_confirmed = result_data['confirmed']
                        logger.info(f"   Found confirmation result in JSON: confirmed={user_confirmed}")
                        break
                except (json.JSONDecodeError, TypeError):
                    pass
        # Check for tool result message
        if hasattr(msg, 'role') and msg.role == 'tool':
            result_content = getattr(msg, 'content', '')
            if isinstance(result_content, str) and 'confirmed' in result_content.lower():
                try:
                    result_data = json.loads(result_content)
                    if isinstance(result_data, dict) and 'confirmed' in result_data:
                        user_confirmed = result_data['confirmed']
                        logger.info(f"   Found confirmAction result: confirmed={user_confirmed}")
                        break
                except (json.JSONDecodeError, TypeError):
                    pass
        # Also check for ToolResultMessage type
        elif hasattr(msg, 'result'):
            result_content = msg.result
            if isinstance(result_content, str) and 'confirmed' in result_content.lower():
                try:
                    result_data = json.loads(result_content)
                    if isinstance(result_data, dict) and 'confirmed' in result_data:
                        user_confirmed = result_data['confirmed']
                        logger.info(f"   Found confirmAction result: confirmed={user_confirmed}")
                        break
                except (json.JSONDecodeError, TypeError):
                    pass
            elif isinstance(result_content, dict) and 'confirmed' in result_content:
                user_confirmed = result_content['confirmed']
                logger.info(f"   Found confirmAction result: confirmed={user_confirmed}")
                break
    
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
        if send_stream:
            encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
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
    
    return state, user_confirmed

