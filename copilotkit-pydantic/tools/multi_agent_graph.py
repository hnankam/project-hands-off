"""Multi-agent graph orchestration for complex queries.

This module implements a multi-agent graph that routes queries to specialized agents
(image generation, web search, code execution) based on the query type.

The graph uses an orchestrator agent to analyze queries and route them to appropriate
worker agents, with support for multi-step workflows.
"""

from __future__ import annotations

from typing import Literal
from dataclasses import dataclass, field
from datetime import datetime
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai import ImageGenerationTool, WebSearchTool, CodeExecutionTool
from pydantic_graph.beta import GraphBuilder, StepContext, TypeExpression
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE, AGUIAdapter

import uuid
from ag_ui.core import CustomEvent, RunAgentInput, UserMessage, EventType, StateSnapshotEvent
from ag_ui.encoder import EventEncoder

from anyio import create_memory_object_stream, create_task_group
from anyio.streams.memory import MemoryObjectSendStream

# Import Firebase Storage utility for image uploads
from utils.firebase_storage import upload_binary_image_to_storage
from pydantic_ai.messages import BinaryImage

# Import usage tracking for sub-agent statistics
from services.usage_tracker import create_usage_tracking_callback

# Event types to skip when forwarding sub-agent events to parent stream
# These lifecycle events conflict with the parent agent's run
SKIP_SUB_AGENT_EVENT_TYPES = {
    EventType.RUN_STARTED,
    EventType.RUN_FINISHED,
}

# String patterns to detect encoded lifecycle events (SSE format)
# The encoder produces JSON like: {"type":"RUN_STARTED",...}
SKIP_EVENT_PATTERNS = [
    '"type":"RUN_STARTED"',
    '"type":"RUN_FINISHED"',
    '"type": "RUN_STARTED"',
    '"type": "RUN_FINISHED"',
    "'type':'RUN_STARTED'",
    "'type':'RUN_FINISHED'",
    "RUN_STARTED",  # Catch any format
    "RUN_FINISHED",  # Catch any format
]


def _should_skip_sub_agent_event(event, step_name: str = "") -> bool:
    """Check if a sub-agent event should be skipped (not forwarded to parent).
    
    RUN_STARTED and RUN_FINISHED events from sub-agents conflict with the
    parent agent's run lifecycle and cause frontend errors.
    
    Handles both raw event objects and encoded string events.
    """
    from config import logger
    
    # Check if it's a raw event object with a type attribute
    if hasattr(event, 'type'):
        event_type = event.type
        event_type_str = str(event_type) if event_type else ""
        
        # Check against EventType enum values
        if event_type in SKIP_SUB_AGENT_EVENT_TYPES:
            logger.info(f"   [{step_name}] 🚫 SKIPPING raw event type: {event_type}")
            return True
        
        # Also check string representation
        if "RUN_STARTED" in event_type_str or "RUN_FINISHED" in event_type_str:
            logger.info(f"   [{step_name}] 🚫 SKIPPING event (string match): {event_type_str}")
            return True
        
        return False
    
    # Check if it's an encoded string containing lifecycle event types
    if isinstance(event, str):
        # Log first event for debugging
        if "RUN_" in event:
            logger.info(f"   [{step_name}] Checking encoded event: {event[:100]}...")
        
        for pattern in SKIP_EVENT_PATTERNS:
            if pattern in event:
                logger.info(f"   [{step_name}] 🚫 SKIPPING encoded event with pattern: {pattern}")
                return True
    
    return False

from config import logger
from config.environment import GOOGLE_API_KEY


# ========== Coagent Name ==========
# This name is used by the frontend to render the graph state
# Must match the agent name used in CopilotKit setup (dynamic_agent)
GRAPH_COAGENT_NAME = "dynamic_agent"


# ========== Models and Types ==========

# Define action types for routing
ActionType = Literal["image_generation", "web_search", "code_execution", "result_aggregator", "end"]
WorkerResult = Literal["continue", "end", "error"]


class RoutingDecision(BaseModel):
    """Structured output for the orchestrator's routing decision."""
    should_continue: bool  # Whether to continue processing or end
    next_task_type: str  # "image_generation", "web_search", "code_execution", "result_aggregator", or "end"
    task_prompt: str  # Specific, focused prompt for the next sub-agent (not the original query)
    reasoning: str  # Explanation of why this decision was made
    confidence: float  # Confidence score between 0 and 1
    needs_followup: bool  # Whether additional processing is needed after this task
    planned_sequence: list[str] = []  # Full planned execution sequence (on first iteration)


class ErrorRecoveryDecision(BaseModel):
    """Structured output for error handler's recovery decision."""
    should_retry: bool  # Whether to retry the failed operation
    should_try_alternative: bool  # Whether to try an alternative approach
    alternative_task_type: str = ""  # Alternative task type if should_try_alternative is True
    should_end: bool  # Whether to end execution due to unrecoverable error
    reasoning: str  # Explanation of the recovery decision
    error_message: str  # User-friendly error message


class CodeExecutionOutput(BaseModel):
    """Structured output for the code execution agent."""
    language: str  # Programming language used (e.g., "python", "javascript")
    code: str  # The source code that was executed
    output: str  # The output/result from executing the code
    success: bool = True  # Whether the execution was successful
    error_message: str = ""  # Error message if execution failed


# ========== Graph State and Dependencies ==========

@dataclass
class GraphDeps:
    """Dependencies passed to all graph nodes."""
    send_stream: MemoryObjectSendStream[str] | None = None
    ag_ui_adapter: AGUIAdapter | None = None
    shared_state: Any = None  # Optional AgentState for syncing with session
    # Usage tracking context (from parent agent context)
    session_id: str | None = None
    user_id: str | None = None
    organization_id: str | None = None
    team_id: str | None = None
    auth_session_id: str | None = None
    broadcast_func: Any = None  # Async function to broadcast usage
    # Database IDs for usage tracking (use parent agent's IDs for sub-agents)
    agent_id: str | None = None  # DB UUID of the parent agent
    model_id: str | None = None  # DB UUID of the model


def _create_sub_agent_usage_callback(
    deps: GraphDeps,
    agent_label: str,
    model_label: str = "gemini-2.5-flash",
):
    """Create a usage tracking callback for a sub-agent.
    
    Args:
        deps: GraphDeps containing usage tracking context
        agent_label: Human-readable label for the sub-agent (e.g., "ImageGeneration")
        model_label: Model identifier (default: gemini-2.5-flash)
    
    Returns:
        A tuple of (on_complete_callback, result_capture_callback) where:
        - on_complete_callback: Tracks usage (can be None if no tracking context)
        - result_capture_callback: Captures the result for local use
    """
    # Variable to capture the final result (always needed)
    final_result_holder = [None]
    
    def capture_result(result):
        """Callback to capture the final result."""
        final_result_holder[0] = result
    
    # Check if we have usage tracking context
    if not deps.session_id or not deps.broadcast_func:
        # No usage tracking - just return result capture
        return capture_result, final_result_holder
    
    # Create usage tracking callback
    # Use parent agent's DB IDs for sub-agents (they don't have their own DB records)
    # The labels identify the sub-agent for display purposes
    usage_callback = create_usage_tracking_callback(
        session_id=deps.session_id,
        agent_id=deps.agent_id,  # Use parent agent's DB UUID
        model_id=deps.model_id,  # Use parent model's DB UUID
        agent_label=f"graph:{agent_label}",  # Prefix to identify graph sub-agents
        model_label=model_label,
        broadcast_func=deps.broadcast_func,
        auth_session_id=deps.auth_session_id,
        user_id=deps.user_id,
        organization_id=deps.organization_id,
        team_id=deps.team_id,
    )
    
    async def combined_callback(result):
        """Callback that captures result AND tracks usage."""
        # Capture result first
        final_result_holder[0] = result
        # Then track usage
        try:
            await usage_callback(result)
        except Exception as e:
            logger.warning(f"Failed to track usage for {agent_label}: {e}")
    
    return combined_callback, final_result_holder


def _create_sub_agent_run_input(parent_run_input: RunAgentInput, query: str) -> RunAgentInput:
    """Create a new RunAgentInput for worker sub-agents without state or tools.
    
    This is needed because:
    1. The parent run_input may have state that requires deps implementing StateHandler protocol
    2. The parent's tools (MCP tools) can interfere with sub-agents' built-in tools
    3. The forwarded_props may contain tool definitions that override built-in tools
    
    Worker sub-agents use their own built-in tools (WebSearchTool, ImageGenerationTool, etc.),
    so we create a clean run_input without any parent tools.
    
    Args:
        parent_run_input: The parent's RunAgentInput (for thread_id only)
        query: The query/prompt for the sub-agent
        
    Returns:
        A new RunAgentInput suitable for worker sub-agents with built-in tools
    """
    return RunAgentInput(
        thread_id=parent_run_input.thread_id,
        run_id=uuid.uuid4().hex,  # New run_id for sub-agent
        messages=[
            UserMessage(
                id=f'msg_{uuid.uuid4().hex[:8]}',
                content=query,
            )
        ],
        state={},  # Empty state - no deps required
        context=[],  # Empty context - sub-agents use their own context
        tools=[],  # IMPORTANT: Empty tools - sub-agents use built-in tools only
        forwarded_props=None,  # IMPORTANT: No forwarded_props - prevents tool interference
    )


def _create_orchestrator_run_input(parent_run_input: RunAgentInput, query: str) -> RunAgentInput:
    """Create a new RunAgentInput for the orchestrator that inherits parent tools.
    
    Unlike worker sub-agents, the orchestrator should have access to:
    1. Frontend tools (defined in parent run_input.tools)
    2. Parent context (for any shared context)
    3. Forwarded props (for MCP tools and other configurations)
    
    This allows the orchestrator to potentially use frontend tools directly
    instead of only routing to specialized sub-agents.
    
    Args:
        parent_run_input: The parent's RunAgentInput with tools and context
        query: The query/prompt for the orchestrator
        
    Returns:
        A new RunAgentInput that inherits parent tools and context
    """
    return RunAgentInput(
        thread_id=parent_run_input.thread_id,
        run_id=uuid.uuid4().hex,  # New run_id for this orchestrator call
        messages=[
            UserMessage(
                id=f'msg_{uuid.uuid4().hex[:8]}',
                content=query,
            )
        ],
        state={},  # Empty state - orchestrator doesn't need parent state
        context=parent_run_input.context or [],  # Inherit parent context
        tools=parent_run_input.tools or [],  # INHERIT frontend tools!
        forwarded_props=parent_run_input.forwarded_props,  # Inherit forwarded props (MCP tools)
    )


@dataclass
class ToolCallInfo:
    """Information about a tool call made by a sub-agent."""
    tool_name: str
    args: str = ""
    result: str = ""
    status: str = "in_progress"  # "in_progress", "completed", "error"


@dataclass
class QueryState:
    """State maintained throughout the graph execution."""
    query: str
    original_query: str = ""  # Store the original user query
    current_task_prompt: str = ""  # Task-specific prompt from orchestrator for current step
    result: str = ""
    query_type: str = ""  # "image_generation", "web_search", "code_execution", or "unknown"
    execution_history: list[str] = field(default_factory=list)  # Track which nodes have been executed
    intermediate_results: dict[str, str] = field(default_factory=dict)  # Track results from each node
    streaming_text: dict[str, str] = field(default_factory=dict)  # Track streaming text per node
    prompts: dict[str, str] = field(default_factory=dict)  # Track prompts sent to each node
    tool_calls: dict[str, list] = field(default_factory=dict)  # Track tool calls per node: {node: [ToolCallInfo]}
    errors: list[dict[str, str]] = field(default_factory=list)  # Track errors: [{node, error, timestamp}]
    last_error_node: str = ""  # Track which node last encountered an error
    retry_count: int = 0  # Track retry attempts for error recovery
    max_retries: int = 2  # Maximum retry attempts
    iteration_count: int = 0  # Prevent infinite loops
    max_iterations: int = 5  # Maximum number of routing iterations
    should_continue: bool = True  # Control flag for orchestrator loop
    next_action: str = ""  # Next action to take
    planned_steps: list[str] = field(default_factory=list)  # Planned execution sequence from orchestrator


class GraphToolCall(BaseModel):
    """A tool call made by a sub-agent."""
    tool_name: str
    args: str = ""
    result: str = ""
    status: str = "in_progress"  # "in_progress", "completed", "error"


class GraphStep(BaseModel):
    """A step in the graph execution - rendered on the frontend."""
    node: str  # Node name (e.g., "WebSearch", "ImageGeneration")
    status: str  # "pending", "in_progress", "completed", "error", "cancelled"
    result: str = ""  # Result or error message
    prompt: str = ""  # Prompt sent to the sub-agent
    streaming_text: str = ""  # Live streaming text during execution
    tool_calls: list[GraphToolCall] = []  # Tool calls made during this step
    timestamp: str = ""  # ISO timestamp


class GraphAgentState(BaseModel):
    """State for the multi_agent_graph coagent - sent to frontend for rendering."""
    query: str = ""
    original_query: str = ""
    current_node: str = ""  # Currently executing node
    iteration: int = 0
    max_iterations: int = 5
    steps: list[GraphStep] = []  # Execution steps with status
    final_result: str = ""
    status: str = "pending"  # "pending", "running", "completed", "error"


def _build_graph_agent_state(state: QueryState, current_node: str = "", step_status: str = "in_progress") -> dict:
    """Build a GraphAgentState dict from QueryState for sending to frontend.
    
    Args:
        state: The current QueryState
        current_node: The node currently being executed
        step_status: Status of the current step
        
    Returns:
        Dict representation of GraphAgentState
    """
    # Map action types to CamelCase node names
    action_to_node = {
        "web_search": "WebSearch",
        "image_generation": "ImageGeneration", 
        "code_execution": "CodeExecution",
        "result_aggregator": "ResultAggregator",
    }
    
    # Build steps from execution_history which now includes Orchestrator:N entries
    # This allows proper interleaving of orchestrator and sub-agent steps
    steps = []
    
    # Helper to check if a history entry is an orchestrator entry
    def is_orchestrator_entry(entry: str) -> bool:
        return entry.startswith("Orchestrator:")
    
    # Helper to extract base node name from indexed key (e.g., "WebSearch:0" -> "WebSearch", "ImageGeneration:1" -> "ImageGeneration")
    def get_base_node(entry: str) -> str:
        if ":" in entry:
            return entry.split(":")[0]
        return entry
    
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
        if is_orchestrator_entry(history_entry):
            # This is an orchestrator iteration (e.g., "Orchestrator:0", "Orchestrator:1")
            orchestrator_streaming = state.streaming_text.get(history_entry, "")
            
            # Determine iteration number for display
            iteration_num = int(history_entry.split(":")[1]) if ":" in history_entry else 0
            
            steps.append({
                "node": "Orchestrator",
                "status": "completed",  # If in history, it's completed
                "result": orchestrator_streaming,
                "prompt": state.original_query or state.query if iteration_num == 0 else f"Re-evaluating after iteration {iteration_num}",
                "streaming_text": orchestrator_streaming,
                "tool_calls": [],
                "timestamp": datetime.now().isoformat(),
            })
        else:
            # This is a sub-agent step (e.g., "ImageGeneration:0", "WebSearch:1")
            # Use indexed key for lookups, base node name for display
            indexed_key = history_entry
            base_node = get_base_node(history_entry)
            
            # Look up results using the indexed key to get the specific run's data
            result = state.intermediate_results.get(indexed_key, state.intermediate_results.get(base_node, ""))
            node_errors = [e for e in state.errors if e.get("node") == base_node or e.get("node") == indexed_key]
            
            if node_errors:
                status = "error"
                result = node_errors[-1].get("error", "Unknown error")
            elif base_node == current_node and step_status == "in_progress":
                status = "in_progress"
            else:
                status = "completed"
            
            # Convert tool calls to serializable format - use indexed key for lookup
            node_tool_calls = state.tool_calls.get(indexed_key, state.tool_calls.get(base_node, []))
            tool_calls_list = [
                {"tool_name": tc.tool_name, "args": tc.args, "result": tc.result, "status": tc.status}
                for tc in node_tool_calls
            ] if node_tool_calls else []
            
            steps.append({
                "node": base_node,  # Display the base node name
                "status": status,
                "result": result,
                "prompt": state.prompts.get(indexed_key, state.prompts.get(base_node, "")),
                "streaming_text": state.streaming_text.get(indexed_key, state.streaming_text.get(base_node, "")),
                "tool_calls": tool_calls_list,
                "timestamp": datetime.now().isoformat(),
            })
        
    # Add current node if not in history yet (and it's not the orchestrator which we handled above)
    # Check if any entry in history matches the current node (base name or indexed)
    current_node_in_history = any(
        get_base_node(entry) == current_node or entry == current_node
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
        # Count executed sub-agents by base node name (exclude orchestrator entries)
        # e.g., ["ImageGeneration:0", "ImageGeneration:1"] -> {"ImageGeneration": 2}
        execution_counts: dict[str, int] = {}
        for entry in state.execution_history:
            if not is_orchestrator_entry(entry):
                base_node = get_base_node(entry)
                execution_counts[base_node] = execution_counts.get(base_node, 0) + 1
        
        # Track how many times each planned step has been accounted for
        planned_counts: dict[str, int] = {}
        
        for planned_action in state.planned_steps:
            node = action_to_node.get(planned_action, planned_action)
            
            # Count this occurrence in planned steps
            run_index = planned_counts.get(node, 0)
            planned_counts[node] = run_index + 1
            
            # Check if this occurrence has been executed
            runs_executed = execution_counts.get(node, 0)
            
            if run_index >= runs_executed:
                # This planned step hasn't been executed yet
                # (Unless it's the current node being executed)
                if node == current_node and run_index == runs_executed:
                    # Currently executing - already added above, skip
                    continue
                
                # Mark as "cancelled" if graph is completing early, otherwise "pending"
                step_status = "cancelled" if is_completing else "pending"
                
                steps.append({
                    "node": node,
                    "status": step_status,
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
        "planned_steps": state.planned_steps,  # Include planned steps for frontend
        "final_result": state.result,
        "status": overall_status,
        # mermaid_diagram will be added by _send_graph_state_snapshot if available
    }


def _sync_to_shared_state(state: QueryState, shared_state: Any, current_node: str = "") -> None:
    """Sync internal QueryState to the shared AgentState.graph.
    
    Args:
        state: The internal QueryState
        shared_state: The shared AgentState from session
        current_node: Currently executing node
    """
    if not shared_state or not hasattr(shared_state, 'graph'):
        return
    
    # Sync all relevant fields
    shared_state.graph.query = state.query
    shared_state.graph.original_query = state.original_query
    shared_state.graph.result = state.result
    shared_state.graph.query_type = state.query_type
    shared_state.graph.execution_history = list(state.execution_history)
    shared_state.graph.intermediate_results = dict(state.intermediate_results)
    shared_state.graph.streaming_text = dict(state.streaming_text)  # Preserve streaming text
    shared_state.graph.prompts = dict(state.prompts)  # Preserve prompts sent to each node
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


async def _send_graph_state_snapshot(
    send_stream: MemoryObjectSendStream[str] | None,
    state: QueryState,
    current_node: str = "",
    step_status: str = "in_progress",
    shared_state: Any = None,
) -> bool:
    """Send a StateSnapshotEvent for the graph state to the frontend.
    
    If shared_state is provided, syncs internal state to it and sends the full
    AgentState snapshot (like create_plan does). Otherwise sends GraphAgentState.
    
    Args:
        send_stream: The stream to send events to
        state: Current QueryState
        current_node: Node currently being executed
        step_status: Status of current step ("in_progress", "completed", "error")
        shared_state: Optional AgentState for syncing with session
    """
    logger.debug(f"   [StateSnapshot] Called for node={current_node}, status={step_status}, send_stream={send_stream is not None}, shared_state={shared_state is not None}")
    
    if not send_stream:
        logger.warning(f"   [StateSnapshot] No send_stream available - cannot send state update for {current_node}")
        return False
    
    try:
        encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
        
        # Sync to shared state if available (for persistence)
        if shared_state and hasattr(shared_state, 'graph'):
            _sync_to_shared_state(state, shared_state, current_node)
        
        # ALWAYS send GraphAgentState format - this is what the frontend expects
        # The frontend's GraphAgentState expects: query, original_query, current_node, 
        # iteration, max_iterations, steps, final_result, status (at top level)
        snapshot = _build_graph_agent_state(state, current_node, step_status)
        
        # Include mermaid_diagram from shared_state if available
        if shared_state and hasattr(shared_state, 'graph') and hasattr(shared_state.graph, 'mermaid_diagram'):
            snapshot["mermaid_diagram"] = shared_state.graph.mermaid_diagram
        
        logger.info(f"   [StateSnapshot] Sending GraphAgentState for {current_node} ({step_status})")
        
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


def _strip_thinking_content(text: str) -> str:
    """Strip <think>...</think> and <thinking>...</thinking> blocks from text.
    
    Args:
        text: Text that may contain thinking blocks
        
    Returns:
        Text with thinking blocks removed
    """
    import re
    # Remove complete <think>...</think> and <thinking>...</thinking> blocks
    cleaned = re.sub(r'<think(?:ing)?>.*?</think(?:ing)?>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Also remove orphan tags
    cleaned = re.sub(r'</?think(?:ing)?>', '', cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _build_context_with_previous_results(state: QueryState, task_prompt: str) -> str:
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
    
    # Build context with previous results
    context_parts = [task_prompt]
    
    # Add previous results as context
    if state.intermediate_results:
        context_parts.append("\n\n--- PREVIOUS RESULTS FROM EARLIER STEPS ---\n")
        for node, result in state.intermediate_results.items():
            # Skip indexed keys (e.g., "WebSearch:0") - use the base node results
            if ':' in node:
                continue
            # Strip thinking content from previous results
            clean_result = _strip_thinking_content(str(result))
            context_parts.append(f"\n[{node}]:\n{clean_result}\n")
    
    return "".join(context_parts)


async def _process_sub_agent_events(
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
    import time
    
    # Use indexed key to distinguish multiple runs of the same step
    indexed_key = f"{node_name}:{run_index}"
    
    # Initialize streaming state for this node run
    state.streaming_text[indexed_key] = ""
    state.tool_calls[indexed_key] = []
    state.prompts[indexed_key] = prompt  # Store the prompt sent to sub-agent
    
    # Also keep non-indexed versions for backwards compatibility
    state.streaming_text[node_name] = ""
    state.tool_calls[node_name] = []
    state.prompts[node_name] = prompt
    
    # Track current tool call being built
    current_tool_call: ToolCallInfo | None = None
    
    event_count = 0
    last_snapshot_time = 0
    consecutive_failures = 0
    max_consecutive_failures = 3  # After this many failures, stop trying to send snapshots
    snapshot_disabled = False
    
    async for event in event_stream:
        event_count += 1
        should_send_snapshot = False

        logger.info(f"   [{node_name}] [EVENT] {str(event)}")
        
        # Extract event type - AG-UI uses EventType enum
        if hasattr(event, 'type'):
            event_type = event.type.value if hasattr(event.type, 'value') else str(event.type)
            
            # Note: pydantic-ai built-in tools (CodeExecutionTool, WebSearchTool, etc.) 
            # execute internally and only emit TEXT_MESSAGE_* events, not TOOL_CALL_* events.
            # Tool call events are only emitted for custom MCP tools or frontend-defined tools.
            
            # Handle TEXT_MESSAGE_CONTENT events (streaming text)
            if 'TEXT_MESSAGE_CONTENT' in event_type:
                if hasattr(event, 'delta') and event.delta:
                    # Update both indexed and non-indexed versions
                    state.streaming_text[indexed_key] += event.delta
                    state.streaming_text[node_name] = state.streaming_text[indexed_key]
                    
                    # Log when thinking tags are detected in streaming text
                    current_text = state.streaming_text[indexed_key]
                    if '<think' in current_text.lower() and '<think' in event.delta.lower():
                        logger.debug(f"   [{node_name}] Detected <think> tag in streaming text")
                    
                    current_time = time.time()
                    if current_time - last_snapshot_time > snapshot_interval:
                        should_send_snapshot = True
                        last_snapshot_time = current_time
            
            # Handle TOOL_CALL_START - new tool call begins
            elif 'TOOL_CALL_START' in event_type:
                tool_name = getattr(event, 'tool_call_name', 'unknown')
                current_tool_call = ToolCallInfo(tool_name=tool_name, status="in_progress")
                # Add to both indexed and non-indexed versions
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
                
                # Mark the last in_progress tool call as completed (using indexed key)
                for tc in state.tool_calls[indexed_key]:
                    if tc.status == "in_progress":
                        tc.result = result_str
                        tc.status = "completed"
                        break
                # Keep non-indexed in sync
                state.tool_calls[node_name] = state.tool_calls[indexed_key]
                
                should_send_snapshot = True
                logger.debug(f"   [{node_name}] Tool result received: {result_str[:50]}...")
            
            # Send snapshot if needed (with failure protection)
            if should_send_snapshot and not snapshot_disabled:
                success = await _send_graph_state_snapshot(
                    send_stream, state, node_name, "in_progress", shared_state
                )
                if success:
                    consecutive_failures = 0  # Reset on success
                else:
                    consecutive_failures += 1
                    if consecutive_failures >= max_consecutive_failures:
                        logger.warning(f"   [{node_name}] Disabling snapshots after {consecutive_failures} consecutive failures")
                        snapshot_disabled = True
    
    # Ensure all tool calls are marked as completed or failed (not left in_progress)
    # This handles cases where the sub-agent completes without sending TOOL_CALL_RESULT
    for tc in state.tool_calls.get(node_name, []):
        if tc.status == "in_progress":
            tc.status = "completed"
            if not tc.result:
                tc.result = "(completed - no output)"
            logger.debug(f"   [{node_name}] Finalized in-progress tool call: {tc.tool_name}")
    
    return event_count


# ========== Agent Factory ==========

def _create_agents(
    orchestrator_model: Any,
    api_key: str | None = None,
):
    """Create all agents needed for the multi-agent graph.
    
    Args:
        orchestrator_model: The model to use for the orchestrator agent (from ctx.model).
                           This is REQUIRED - never create a new model for orchestrator.
        api_key: Google API key. If None, uses GOOGLE_API_KEY from environment.
        
    Returns:
        Dict with all agent instances
    """
    key = api_key or GOOGLE_API_KEY
    if not key:
        raise ValueError("Google API key is required. Set GOOGLE_API_KEY environment variable.")
    
    google_provider = GoogleProvider(api_key=key)
    image_generation_model = GoogleModel(model_name='gemini-2.5-flash-image', provider=google_provider)
    general_model = GoogleModel(model_name='gemini-2.5-flash', provider=google_provider)

    # Common thinking instruction for all sub-agents
    # Note: Some models may not output thinking when using tools or structured output
    THINKING_INSTRUCTION = (
        "\n\n## THINKING REQUIREMENT\n"
        "ALWAYS return your thinking within <think>...</think> tags. Be sure to close the <think> tag with </think>."
    )
    # Build orchestrator agent with the provided model
    # Note: The orchestrator routes to specialized sub-agents instead of using external tools
    orchestrator_agent = Agent(
        model=orchestrator_model,
        output_type=RoutingDecision,
        instructions=(
            "You are an intelligent query routing orchestrator. Analyze the current context and determine "
            "the next action. You have access to four types of specialized agents:\n\n"
            "1. image_generation: For creating, generating, or drawing images, pictures, or visual content\n"
            "2. web_search: For finding information online, looking up facts, news, or current events\n"
            "3. code_execution: For performing calculations, running code, solving math problems\n"
            "4. result_aggregator: For synthesizing results from multiple previous steps into a final answer\n\n"
            "EXECUTION PLANNING:\n"
            "On the FIRST iteration (when execution_history is empty), you MUST provide a planned_sequence "
            "with the full list of tasks you plan to execute IN ORDER. This helps the user understand "
            "what will happen before execution starts.\n\n"
            "Example planned_sequence for 'Search for SpaceX launch and create an image of it':\n"
            '  planned_sequence: ["web_search", "image_generation", "result_aggregator"]\n\n'
            "TASK-SPECIFIC PROMPTS (task_prompt field):\n"
            "For EACH decision, you MUST provide a clear, focused task_prompt that tells the sub-agent "
            "EXACTLY what to do. Do NOT just repeat the original query - be SPECIFIC to what this step needs.\n\n"
            "Examples of GOOD task_prompts:\n"
            "- For code_execution: 'Calculate the first 10 Fibonacci numbers and return them as a list'\n"
            "- For image_generation: 'Create a bar chart with x-axis showing positions 1-10 and y-axis showing "
            "  the Fibonacci values [1,1,2,3,5,8,13,21,34,55]'\n"
            "- For web_search: 'Find the latest SpaceX Starship launch date and key details'\n"
            "- For result_aggregator: 'Summarize the Fibonacci calculation results and the generated chart'\n\n"
            "Examples of BAD task_prompts (too vague, just repeats original query):\n"
            "- 'Find the Fibonacci sequence formula, calculate...and generate a visual chart' (this is original query!)\n\n"
            "INCLUDE CONTEXT IN task_prompt:\n"
            "When previous steps have completed, REFERENCE their results in your task_prompt:\n"
            "- 'Based on the Fibonacci sequence [1,1,2,3,5,8,13,21,34,55] from the previous calculation, "
            "  create a bar chart showing these values'\n\n"
            "USER CONFIRMATION FOR CODE EXECUTION:\n"
            "Before executing code (code_execution step), you SHOULD use the 'confirmAction' tool to get "
            "user confirmation. This allows the user to review the planned code execution before it runs.\n"
            "Example: Use confirmAction with a message like 'I will execute Python code to calculate "
            "the Fibonacci sequence. Do you want to proceed?'\n"
            "If the user declines, skip the code_execution step and proceed to the next step or "
            "explain what would have been done.\n\n"
            "CRITICAL RULES:\n"
            "1. STRICTLY FOLLOW your planned_sequence - execute each step in ORDER, do not skip steps!\n"
            "2. DO NOT skip to result_aggregator until ALL planned steps are complete.\n"
            "3. Compare execution_history with planned_sequence to find the NEXT unexecuted step.\n"
            "4. Each task type should typically run ONCE per execution. Multiple runs waste resources.\n"
            "5. Use confirmAction before code_execution to get user approval for running code.\n\n"
            "STEP SELECTION LOGIC:\n"
            "  - Look at your planned_sequence (e.g., ['web_search', 'code_execution', 'image_generation', 'result_aggregator'])\n"
            "  - Look at execution_history (e.g., ['WebSearch', 'CodeExecution'])\n"
            "  - The next step is the first item in planned_sequence NOT in execution_history\n"
            "  - In this example: image_generation should be next, NOT result_aggregator!\n\n"
            "IMPORTANT: You MUST explicitly set the needs_followup field for EVERY routing decision:\n"
            "- needs_followup=True: If there are more steps in planned_sequence to execute\n"
            "- needs_followup=False: Only if this is the LAST step (result_aggregator)\n\n"
            "Decision Guidelines:\n"
            "- Follow your planned_sequence STRICTLY - do not skip steps\n"
            "- If user asked for a visual/chart/image, image_generation MUST run before result_aggregator\n"
            "- When in doubt, execute the next planned step rather than jumping to aggregator\n"
            "- Set should_continue=True if more steps remain, False only after result_aggregator\n"
            "- Set next_task_type to the next agent in your planned sequence, or 'end' if truly done\n\n"
            "Analyze the query semantically and return your routing decision with clear reasoning."
            + THINKING_INSTRUCTION
        ),
    )
    
    image_generation_agent = Agent(
        model=image_generation_model,
        builtin_tools=[ImageGenerationTool()],
        output_type=str,
        instructions=(
            "You are an image generation assistant. Based on the user's prompt, "
            "generate an image based on the description provided. "
            "Use the image generation tool to create the image."
            + THINKING_INSTRUCTION
        ),
    )
    
    web_search_agent = Agent(
        model=general_model,
        builtin_tools=[WebSearchTool()],
        output_type=str,
        instructions=(
            "You are a web search assistant. Search the web for relevant information."
            + THINKING_INSTRUCTION
        ),
    )
    
    code_execution_agent = Agent(
        model=general_model,
        builtin_tools=[CodeExecutionTool()],
        output_type=str,  # Using output type CodeExecutionOutput causes issues with model response. Return str and format or ask agent to format response. 
        instructions=(
            "You are a code execution assistant. Execute code to solve problems.\n\n"
            "When responding, you MUST return a structured JSON object with the following fields:\n"
            "- language: The programming language used (e.g., 'python', 'javascript')\n"
            "- code: The exact source code you executed\n"
            "- output: The result/output from running the code\n"
            "- success: True if execution succeeded, False if it failed\n"
            "- error_message: Any error message if execution failed (empty if successful)"
            + THINKING_INSTRUCTION
        ),
    )
    
    result_aggregator_agent = Agent(
        model=general_model,
        output_type=str,
        instructions=(
            "You are a result aggregator. Your job is to synthesize and summarize results from multiple "
            "specialized agents into a coherent, comprehensive final response. Consider all intermediate results "
            "and the original user query to create a complete answer that addresses what the user asked for."
            + THINKING_INSTRUCTION
        ),
    )
    
    error_handler_agent = Agent(
        model=general_model,
        output_type=ErrorRecoveryDecision,
        instructions=(
            "You are an intelligent error recovery agent. When an agent fails, analyze the error and determine "
            "the best recovery strategy. You have several options:\n\n"
            "1. RETRY: Retry the same operation (if the error seems transient)\n"
            "2. ALTERNATIVE: Try a different approach (e.g., if image generation fails, maybe describe it in text)\n"
            "3. END: End execution with a clear error message (if error is unrecoverable)\n\n"
            "Consider:\n"
            "- The type of error that occurred\n"
            "- How many retries have already been attempted\n"
            "- Whether there's a reasonable alternative approach\n"
            "- The original user's intent\n"
            "- Previous successful steps (check intermediate_results)\n\n"
            "Provide a clear, actionable recovery decision with user-friendly error messaging."
            + THINKING_INSTRUCTION
        ),
    )
    
    return {
        'general_model': general_model,
        'orchestrator': orchestrator_agent,
        'image_generation': image_generation_agent,
        'web_search': web_search_agent,
        'code_execution': code_execution_agent,
        'result_aggregator': result_aggregator_agent,
        'error_handler': error_handler_agent,
    }


# ========== Graph Builder ==========

def create_multi_agent_graph(
    orchestrator_model: Any,
    api_key: str | None = None,
):
    """Create a multi-agent graph using the beta API builder pattern.
    
    Args:
        orchestrator_model: The model from ctx.model to use for orchestrator (REQUIRED).
        api_key: Optional Google API key. If None, uses environment variable.
        
    Returns:
        Built graph ready for execution
    """
    agents = _create_agents(
        orchestrator_model=orchestrator_model,
        api_key=api_key,
    )
    
    g = GraphBuilder(
        state_type=QueryState,
        input_type=str,  # User query string
        output_type=str,  # Final result string
        deps_type=GraphDeps,  # Graph dependencies (stream and AG-UI adapter)
    )
    
    # ==================== ORCHESTRATOR STEP ====================
    @g.step
    async def orchestrator_step(ctx: StepContext[QueryState, None, None | WorkerResult]) -> ActionType:
        """Orchestrator that analyzes context and determines next action."""
        # Initialize original query
        if not ctx.state.original_query:
            ctx.state.original_query = ctx.state.query
        
        # Increment iteration count
        ctx.state.iteration_count += 1
        
        logger.info(f"🤖 Orchestrator (Iteration {ctx.state.iteration_count})")
        logger.info(f"Query: {ctx.state.query}")
        if ctx.state.execution_history:
            logger.info(f"History: {' → '.join(ctx.state.execution_history)}")
        
        # Send graph state snapshot to frontend
        send_stream = ctx.deps.send_stream if ctx.deps else None
        shared_state = ctx.deps.shared_state if ctx.deps else None
        await _send_graph_state_snapshot(send_stream, ctx.state, "Orchestrator", "in_progress", shared_state)
        
        # Check iteration limit
        if ctx.state.iteration_count > ctx.state.max_iterations:
            logger.warning("Max iterations reached")
            ctx.state.errors.append({
                "node": "Orchestrator",
                "error": f"Max iterations ({ctx.state.max_iterations}) reached",
                "timestamp": datetime.now().isoformat()
            })
            await _send_graph_state_snapshot(send_stream, ctx.state, "Orchestrator", "error", shared_state)
            return "end"
        
        # Build context
        context = f"Original Query: {ctx.state.original_query}\n"
        if ctx.state.execution_history:
            context += f"Executed: {', '.join(ctx.state.execution_history)}\n"
        if ctx.state.intermediate_results:
            context += "\nResults:\n"
            for node, result in ctx.state.intermediate_results.items():
                context += f"  - {node}: {result[:100]}...\n"
        
        # Get decision - run through AGUIAdapter to access frontend tools
        try:
            # Create orchestrator run_input that inherits parent tools
            orchestrator_run_input = _create_orchestrator_run_input(
                ctx.deps.ag_ui_adapter.run_input,
                context
            )
            
            # Create AGUIAdapter for orchestrator with inherited tools
            orchestrator_adapter = AGUIAdapter(
                agent=agents['orchestrator'],
                run_input=orchestrator_run_input,
                accept=SSE_CONTENT_TYPE
            )
            
            # Create a simple callback to capture the result
            result_holder = [None]
            orchestrator_streaming_text = []
            
            def capture_result(result):
                result_holder[0] = result
            
            # Run orchestrator through adapter and capture streaming content
            async for event in orchestrator_adapter.run_stream(on_complete=capture_result):
                # Capture text content for thinking display
                if isinstance(event, str) and 'TEXT_MESSAGE_CONTENT' in event:
                    try:
                        import json
                        # Parse SSE format: data: {...}
                        for line in event.split('\n'):
                            if line.startswith('data:'):
                                data = json.loads(line[5:].strip())
                                if data.get('type') == 'TEXT_MESSAGE_CONTENT' and data.get('delta'):
                                    orchestrator_streaming_text.append(data['delta'])
                    except:
                        pass
            
            # Store orchestrator streaming text if captured
            if orchestrator_streaming_text:
                ctx.state.streaming_text["Orchestrator"] = ''.join(orchestrator_streaming_text)
                logger.debug(f"   [Orchestrator] Captured streaming text: {len(ctx.state.streaming_text.get('Orchestrator', ''))} chars")
            
            # Get the captured result
            final_result = result_holder[0]
            decision: RoutingDecision | None = None
            
            if final_result:
                # Check if it's a DeferredToolRequests (frontend tool needs user interaction)
                if hasattr(final_result, 'calls') or type(final_result).__name__ == 'DeferredToolRequests':
                    logger.info("   Orchestrator returned DeferredToolRequests - frontend tool awaiting user action")
                    # For now, skip to direct run without frontend tools
                    # This happens when confirmAction or other frontend tools need user interaction
                    logger.warning("   Falling back to direct run without frontend tools")
                    result = await agents['orchestrator'].run(context)
                    decision = result.output
                elif hasattr(final_result, 'output'):
                    output = final_result.output
                    # Check if output is a RoutingDecision
                    if hasattr(output, 'next_task_type'):
                        decision = output
                    else:
                        logger.warning(f"   Orchestrator output is not RoutingDecision: {type(output)}")
                        result = await agents['orchestrator'].run(context)
                        decision = result.output
            
            if not decision:
                # Fallback to direct run if adapter didn't return expected result
                logger.warning("Orchestrator adapter didn't return expected result, falling back to direct run")
                result = await agents['orchestrator'].run(context)
                decision = result.output
            
            logger.info(f"📊 Decision: {decision.next_task_type.upper()}")
            logger.info(f"   Reasoning: {decision.reasoning[:100]}...")
            
            # Store orchestrator reasoning for frontend display with iteration index
            # Each orchestrator run gets its own indexed key (Orchestrator:0, Orchestrator:1, etc.)
            orchestrator_iteration = ctx.state.iteration_count - 1  # 0-indexed
            indexed_key = f"Orchestrator:{orchestrator_iteration}"
            
            if decision.reasoning:
                thinking_content = f"<think>\n{decision.reasoning}\n</think>"
                ctx.state.streaming_text[indexed_key] = thinking_content
                # Also update the base key with latest (for backward compatibility)
                ctx.state.streaming_text["Orchestrator"] = thinking_content
            
            # Track orchestrator in execution history with iteration marker
            # This allows _build_graph_agent_state to interleave orchestrator steps properly
            ctx.state.execution_history.append(indexed_key)
            
            # Handle execution plan:
            # 1. On first iteration, set the planned sequence from orchestrator (preserve duplicates)
            # 2. On subsequent iterations, if orchestrator decides to add more steps, append them
            if decision.planned_sequence and not ctx.state.planned_steps:
                # First iteration - set initial plan (keep duplicates to show multiple runs)
                ctx.state.planned_steps = list(decision.planned_sequence)
                logger.info(f"   Planned: {' → '.join(ctx.state.planned_steps)}")
            elif ctx.state.planned_steps and decision.next_task_type.lower() != "end":
                # Subsequent iterations - check if this is an additional run beyond the plan
                next_step = decision.next_task_type.lower()
                action_to_step = {
                    "image_generation": "image_generation",
                    "web_search": "web_search", 
                    "code_execution": "code_execution",
                    "result_aggregator": "result_aggregator",
                }
                step_name = action_to_step.get(next_step, next_step)
                
                # Count how many times this step has been executed (excluding orchestrator)
                step_to_history = {
                    "image_generation": "ImageGeneration",
                    "web_search": "WebSearch",
                    "code_execution": "CodeExecution",
                    "result_aggregator": "ResultAggregator",
                }
                history_name = step_to_history.get(step_name, step_name)
                # Only count actual sub-agent executions, not orchestrator entries
                executed_count = len([h for h in ctx.state.execution_history 
                                     if h == history_name or h.startswith(f"{history_name}:")])
                
                # Count how many times this step appears in planned_steps
                planned_count = ctx.state.planned_steps.count(step_name)
                
                # If we're about to execute more times than planned, append to the end
                # The frontend will merge actual execution order with remaining planned steps
                if executed_count >= planned_count and step_name in action_to_step.values():
                    ctx.state.planned_steps.append(step_name)
                    logger.info(f"   Updated plan (added {step_name}): {' → '.join(ctx.state.planned_steps)}")
            
            # Store task-specific prompt for next worker (fallback to original query if empty)
            ctx.state.current_task_prompt = decision.task_prompt if decision.task_prompt else ctx.state.query
            logger.info(f"   Task prompt: {ctx.state.current_task_prompt[:100]}...")
            
            # Store for worker nodes
            ctx.state.should_continue = decision.needs_followup
            ctx.state.next_action = decision.next_task_type.lower()
            
            # Send updated state snapshot with decision (includes planned_steps)
            await _send_graph_state_snapshot(send_stream, ctx.state, "Orchestrator", "completed", shared_state)
            
            return decision.next_task_type.lower()  # type: ignore
            
        except Exception as e:
            logger.exception(f"Orchestrator failed: {e}")
            ctx.state.errors.append({
                "node": "Orchestrator",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })
            await _send_graph_state_snapshot(send_stream, ctx.state, "Orchestrator", "error", shared_state)
            return "end"
    
    # ==================== WORKER STEPS ====================
    @g.step
    async def image_generation_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Generate an image using AGUIAdapter for streaming and upload to Firebase."""
        logger.info("🎨 ImageGeneration processing...")
        
        # Calculate run index BEFORE appending to history (count base name entries)
        run_index = len([h for h in ctx.state.execution_history if h == "ImageGeneration" or h.startswith("ImageGeneration:")])
        indexed_key = f"ImageGeneration:{run_index}"
        
        # Append indexed key to preserve unique results for each run
        ctx.state.execution_history.append(indexed_key)
        
        send_stream = ctx.deps.send_stream if ctx.deps else None
        shared_state = ctx.deps.shared_state if ctx.deps else None
        
        # Send state snapshot - step started
        await _send_graph_state_snapshot(send_stream, ctx.state, "ImageGeneration", "in_progress", shared_state)
        
        try:
            # Use task-specific prompt from orchestrator, fallback to original query
            task_prompt = ctx.state.current_task_prompt or ctx.state.query
            
            # Build context with previous results so this step can access earlier data
            context_with_results = _build_context_with_previous_results(ctx.state, task_prompt)
            
            # Create a new RunAgentInput without state for the sub-agent
            sub_run_input = _create_sub_agent_run_input(
                ctx.deps.ag_ui_adapter.run_input,
                context_with_results  # Include previous results in context
            )
            
            # Create a new AGUIAdapter instance for this specific run
            adapter = AGUIAdapter(
                agent=agents['image_generation'],
                run_input=sub_run_input,
                accept=SSE_CONTENT_TYPE
            )
            
            # Create usage tracking callback for this sub-agent
            on_complete, result_holder = _create_sub_agent_usage_callback(
                ctx.deps, "ImageGeneration", "gemini-2.5-flash-image"
            )
            
            # Run the agent and capture streaming text + tool calls via StateSnapshot
            event_stream = adapter.run_stream(on_complete=on_complete)
            
            # Process all events using helper function
            event_count = await _process_sub_agent_events(
                event_stream, ctx.state, "ImageGeneration", send_stream, shared_state,
                prompt=task_prompt, run_index=run_index  # Keep original task_prompt for display
            )
            
            logger.info(f"   [ImageGeneration] Processed {event_count} events (streamed via snapshots)")
            
            # Log streaming text for debugging thinking blocks
            streaming_text = ctx.state.streaming_text.get(indexed_key, ctx.state.streaming_text.get("ImageGeneration", ""))
            has_think_tag = '<think' in streaming_text.lower()
            logger.debug(f"   [ImageGeneration] Streaming text: {len(streaming_text)} chars, has <think>: {has_think_tag}")
            
            # Extract and upload images to Firebase Storage
            uploaded_urls = []
            final_result = result_holder[0]  # Get captured result
            if final_result and hasattr(final_result, 'response') and final_result.response:
                # Get images from the response
                images = None
                if hasattr(final_result.response, 'images'):
                    images_attr = getattr(final_result.response, 'images')
                    if callable(images_attr):
                        images = images_attr()
                    else:
                        images = images_attr
                
                if images:
                    # Convert to list if needed
                    images_list = list(images) if hasattr(images, '__iter__') and not isinstance(images, (str, bytes)) else [images]
                    logger.info(f"   [ImageGeneration] Found {len(images_list)} images to upload")
                    
                    for idx, image in enumerate(images_list):
                        if isinstance(image, BinaryImage):
                            logger.info(f"   [ImageGeneration] Uploading image {idx + 1}/{len(images_list)} to Firebase...")
                            
                            # Get the binary data and content type
                            image_data = image.data
                            content_type = image.media_type or "image/png"
                            
                            # Upload to Firebase Storage
                            url = await upload_binary_image_to_storage(
                                image_data,
                                folder="graph-generations",
                                content_type=content_type
                            )
                            
                            if url:
                                uploaded_urls.append(url)
                                logger.info(f"   [ImageGeneration] ✓ Uploaded: {url[:80]}...")
                            else:
                                logger.warning(f"   [ImageGeneration] Failed to upload image {idx + 1}")
                        else:
                            logger.warning(f"   [ImageGeneration] Unexpected image type: {type(image)}")
            
            # Build the result message with image URLs only (no extra text)
            if uploaded_urls:
                # Format with markdown image links for rendering - just the images
                node_result = "\n\n".join([f"![Generated Image]({url})" for url in uploaded_urls])
            elif final_result:
                try:
                    num_images = len(final_result.response.images) if final_result.response.images else 0
                    node_result = f"✅ Image: {num_images} image(s) created (upload pending)"
                except Exception:
                    node_result = str(final_result.output) if hasattr(final_result, 'output') else "Image generation completed"
            else:
                node_result = "Image generation completed"
            
            # Store with indexed key and non-indexed for backwards compatibility
            ctx.state.intermediate_results[indexed_key] = str(node_result)
            ctx.state.intermediate_results["ImageGeneration"] = str(node_result)
            ctx.state.result = str(node_result)
            logger.info(f"   ✓ Complete")
            
            # Send state snapshot - step completed
            await _send_graph_state_snapshot(send_stream, ctx.state, "ImageGeneration", "completed", shared_state)
            
            return "continue" if ctx.state.should_continue else "end"
        except Exception as e:
            ctx.state.errors.append({"node": "ImageGeneration", "error": str(e), "timestamp": datetime.now().isoformat()})
            logger.exception(f"ImageGeneration error: {e}")
            
            # Send state snapshot - step error
            await _send_graph_state_snapshot(send_stream, ctx.state, "ImageGeneration", "error", shared_state)
            
            return "error"
    
    @g.step
    async def web_search_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Perform web search using AGUIAdapter for streaming."""
        logger.info("🔍 WebSearch processing...")
        
        # Calculate run index BEFORE appending to history (count base name entries)
        run_index = len([h for h in ctx.state.execution_history if h == "WebSearch" or h.startswith("WebSearch:")])
        indexed_key = f"WebSearch:{run_index}"
        
        # Append indexed key to preserve unique results for each run
        ctx.state.execution_history.append(indexed_key)
        
        send_stream = ctx.deps.send_stream if ctx.deps else None
        shared_state = ctx.deps.shared_state if ctx.deps else None
        
        # Send state snapshot - step started
        await _send_graph_state_snapshot(send_stream, ctx.state, "WebSearch", "in_progress", shared_state)
        
        try:
            # Use task-specific prompt from orchestrator, fallback to original query
            task_prompt = ctx.state.current_task_prompt or ctx.state.query
            
            # Build context with previous results (useful when web search runs after other steps)
            context_with_results = _build_context_with_previous_results(ctx.state, task_prompt)
            
            # Create a new RunAgentInput without state for the sub-agent
            sub_run_input = _create_sub_agent_run_input(
                ctx.deps.ag_ui_adapter.run_input,
                context_with_results  # Include previous results in context
            )
            
            # Create a new AGUIAdapter instance for this specific run
            adapter = AGUIAdapter(
                agent=agents['web_search'],
                run_input=sub_run_input,
                accept=SSE_CONTENT_TYPE
            )
            
            # Create usage tracking callback for this sub-agent
            on_complete, result_holder = _create_sub_agent_usage_callback(
                ctx.deps, "WebSearch", "gemini-2.5-flash"
            )
            
            # Run the agent and capture streaming text + tool calls via StateSnapshot
            event_stream = adapter.run_stream(on_complete=on_complete)
            
            # Process all events using helper function
            event_count = await _process_sub_agent_events(
                event_stream, ctx.state, "WebSearch", send_stream, shared_state,
                prompt=task_prompt, run_index=run_index
            )
            
            logger.info(f"   [WebSearch] Processed {event_count} events (streamed via snapshots)")
            
            # Log streaming text for debugging thinking blocks
            streaming_text = ctx.state.streaming_text.get(indexed_key, ctx.state.streaming_text.get("WebSearch", ""))
            has_think_tag = '<think' in streaming_text.lower()
            logger.debug(f"   [WebSearch] Streaming text: {len(streaming_text)} chars, has <think>: {has_think_tag}")
            
            # Extract result from the completed run
            # IMPORTANT: Always convert to string - results can be complex objects like DeferredToolRequests
            final_result = result_holder[0]  # Get captured result
            if final_result:
                raw_output = final_result.output if hasattr(final_result, 'output') else final_result.data
                node_result = str(raw_output) if raw_output else "Web search completed"
            else:
                node_result = "Web search completed"
            
            # Store with indexed key and non-indexed for backwards compatibility
            ctx.state.intermediate_results[indexed_key] = str(node_result)
            ctx.state.intermediate_results["WebSearch"] = str(node_result)
            ctx.state.result = str(node_result)
            logger.info("   ✓ Complete")
            
            # Send state snapshot - step completed
            await _send_graph_state_snapshot(send_stream, ctx.state, "WebSearch", "completed", shared_state)
            
            return "continue" if ctx.state.should_continue else "end"
        except Exception as e:
            ctx.state.errors.append({"node": "WebSearch", "error": str(e), "timestamp": datetime.now().isoformat()})
            logger.exception(f"WebSearch error: {e}")
            
            # Send state snapshot - step error
            await _send_graph_state_snapshot(send_stream, ctx.state, "WebSearch", "error", shared_state)
            
            return "error"
    
    @g.step
    async def code_execution_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Execute code using AGUIAdapter for streaming."""
        logger.info("💻 CodeExecution processing...")
        
        # Calculate run index BEFORE appending to history (count base name entries)
        run_index = len([h for h in ctx.state.execution_history if h == "CodeExecution" or h.startswith("CodeExecution:")])
        indexed_key = f"CodeExecution:{run_index}"
        
        # Append indexed key to preserve unique results for each run
        ctx.state.execution_history.append(indexed_key)
        
        send_stream = ctx.deps.send_stream if ctx.deps else None
        shared_state = ctx.deps.shared_state if ctx.deps else None
        
        # Send state snapshot - step started
        await _send_graph_state_snapshot(send_stream, ctx.state, "CodeExecution", "in_progress", shared_state)
        
        try:
            # Use task-specific prompt from orchestrator, fallback to original query
            task_prompt = ctx.state.current_task_prompt or ctx.state.query
            
            # Build context with previous results so this step can access earlier data
            context_with_results = _build_context_with_previous_results(ctx.state, task_prompt)
            
            # Create a new RunAgentInput without state for the sub-agent
            sub_run_input = _create_sub_agent_run_input(
                ctx.deps.ag_ui_adapter.run_input,
                context_with_results  # Include previous results in context
            )
            
            # Create a new adapter with the code_execution_agent
            adapter = AGUIAdapter(
                agent=agents['code_execution'],
                run_input=sub_run_input,
                accept=SSE_CONTENT_TYPE
            )
            
            # Create usage tracking callback for this sub-agent
            on_complete, result_holder = _create_sub_agent_usage_callback(
                ctx.deps, "CodeExecution", "gemini-2.5-flash"
            )
            
            # Run the agent and capture streaming text + tool calls via StateSnapshot
            event_stream = adapter.run_stream(on_complete=on_complete)
            
            # Process all events using helper function
            event_count = await _process_sub_agent_events(
                event_stream, ctx.state, "CodeExecution", send_stream, shared_state,
                prompt=task_prompt, run_index=run_index
            )
            
            logger.info(f"   [CodeExecution] Processed {event_count} events (streamed via snapshots)")
            
            # Log streaming text for debugging thinking blocks
            streaming_text = ctx.state.streaming_text.get(indexed_key, ctx.state.streaming_text.get("CodeExecution", ""))
            has_think_tag = '<think' in streaming_text.lower()
            logger.debug(f"   [CodeExecution] Streaming text: {len(streaming_text)} chars, has <think>: {has_think_tag}")
            
            # Extract result from the completed run
            final_result = result_holder[0]  # Get captured result
            node_result = None
            
            if final_result:
                raw_output = final_result.output if hasattr(final_result, 'output') else final_result.data
                
                # Handle CodeExecutionOutput structured response
                if isinstance(raw_output, CodeExecutionOutput):
                    # Format as JSON with language, code, and output for frontend parsing
                    node_result = raw_output.model_dump_json()
                elif hasattr(raw_output, 'language') and hasattr(raw_output, 'code'):
                    # Duck typing for structured output
                    node_result = f'{{"language": "{getattr(raw_output, "language", "python")}", "code": {repr(getattr(raw_output, "code", ""))}, "output": {repr(getattr(raw_output, "output", ""))}}}'
                elif raw_output:
                    node_result = str(raw_output)
            
            # Fallback to streaming text if no structured output
            if not node_result:
                streaming_text = ctx.state.streaming_text.get(indexed_key, ctx.state.streaming_text.get("CodeExecution", ""))
                if streaming_text:
                    # Use streaming text as the result (includes thinking + reasoning)
                    node_result = streaming_text
                else:
                    node_result = "Code execution completed but no output available"
            
            # Store with indexed key and non-indexed for backwards compatibility
            ctx.state.intermediate_results[indexed_key] = str(node_result)
            ctx.state.intermediate_results["CodeExecution"] = str(node_result)
            ctx.state.result = str(node_result)
            logger.info("   ✓ Complete")
            
            # Send state snapshot - step completed
            await _send_graph_state_snapshot(send_stream, ctx.state, "CodeExecution", "completed", shared_state)
            
            return "continue" if ctx.state.should_continue else "end"
        except Exception as e:
            ctx.state.errors.append({"node": "CodeExecution", "error": str(e), "timestamp": datetime.now().isoformat()})
            logger.exception(f"CodeExecution error: {e}")
            
            # Send state snapshot - step error
            await _send_graph_state_snapshot(send_stream, ctx.state, "CodeExecution", "error", shared_state)
            
            return "error"
    
    @g.step
    async def result_aggregator_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Aggregate results using AGUIAdapter for streaming."""
        logger.info("📋 ResultAggregator processing...")
        # Calculate run index BEFORE appending to history (count base name entries)
        run_index = len([h for h in ctx.state.execution_history if h == "ResultAggregator" or h.startswith("ResultAggregator:")])
        indexed_key = f"ResultAggregator:{run_index}"
        
        # Append indexed key to preserve unique results for each run
        ctx.state.execution_history.append(indexed_key)
        
        send_stream = ctx.deps.send_stream if ctx.deps else None
        shared_state = ctx.deps.shared_state if ctx.deps else None
        
        # Send state snapshot - step started
        await _send_graph_state_snapshot(send_stream, ctx.state, "ResultAggregator", "in_progress", shared_state)
        
        context = f"Original Query: {ctx.state.original_query}\n\nResults:\n"
        for node, result in ctx.state.intermediate_results.items():
            context += f"\n{node}: {result}\n"
        
        try:
            # Create a new RunAgentInput without state for the sub-agent
            # Include the context with all intermediate results
            sub_run_input = _create_sub_agent_run_input(
                ctx.deps.ag_ui_adapter.run_input,
                context  # Use the aggregated context, not just the query
            )
            
            # Create a new AGUIAdapter instance for this specific run            
            adapter = AGUIAdapter(
                agent=agents['result_aggregator'],
                run_input=sub_run_input,
                accept=SSE_CONTENT_TYPE
            )
            
            # Create usage tracking callback for this sub-agent
            on_complete, result_holder = _create_sub_agent_usage_callback(
                ctx.deps, "ResultAggregator", "gemini-2.5-flash"
            )
            
            # Run the agent and capture streaming text + tool calls via StateSnapshot
            event_stream = adapter.run_stream(on_complete=on_complete)
            
            # Process all events using helper function
            event_count = await _process_sub_agent_events(
                event_stream, ctx.state, "ResultAggregator", send_stream, shared_state,
                prompt=context, run_index=run_index  # Use the aggregated context as prompt
            )
            
            logger.info(f"   [ResultAggregator] Processed {event_count} events (streamed via snapshots)")
            
            # Log streaming text for debugging thinking blocks
            streaming_text = ctx.state.streaming_text.get(indexed_key, ctx.state.streaming_text.get("ResultAggregator", ""))
            has_think_tag = '<think' in streaming_text.lower()
            logger.debug(f"   [ResultAggregator] Streaming text: {len(streaming_text)} chars, has <think>: {has_think_tag}")
            
            # Extract result from the completed run
            # IMPORTANT: Always convert to string - results can be complex objects like DeferredToolRequests
            final_result = result_holder[0]  # Get captured result
            if final_result:
                raw_output = final_result.output if hasattr(final_result, 'output') else final_result.data
                ctx.state.result = str(raw_output) if raw_output else "Result aggregation completed"
            else:
                ctx.state.result = "Result aggregation completed"
            
            # Store with indexed key and non-indexed for backwards compatibility
            ctx.state.intermediate_results[indexed_key] = str(ctx.state.result)
            ctx.state.intermediate_results["ResultAggregator"] = str(ctx.state.result)
            logger.info("   ✓ Complete")
            
            # Send state snapshot - step completed
            await _send_graph_state_snapshot(send_stream, ctx.state, "ResultAggregator", "completed", shared_state)
            
            return "end"
        except Exception as e:
            ctx.state.result = f"Aggregation failed: {str(e)}"
            ctx.state.errors.append({"node": "ResultAggregator", "error": str(e), "timestamp": datetime.now().isoformat()})
            logger.exception(f"ResultAggregator error: {e}")
            
            # Send state snapshot - step error
            await _send_graph_state_snapshot(send_stream, ctx.state, "ResultAggregator", "error", shared_state)
            
            return "end"
    
    # ==================== FINALIZE STEP ====================
    @g.step
    async def finalize_result(ctx: StepContext[QueryState, None, WorkerResult | ActionType]) -> str:
        """Extract final result from state."""
        logger.info("✅ Finalizing result")
        
        send_stream = ctx.deps.send_stream if ctx.deps else None
        shared_state = ctx.deps.shared_state if ctx.deps else None
        
        final_result = ctx.state.result if ctx.state.result else "Task completed."
        
        # Add summary
        if ctx.state.execution_history:
            final_result = f"{final_result}\n\n[Executed: {' → '.join(ctx.state.execution_history)}]"
        
        # Update state with final result
        ctx.state.result = final_result
        
        # Mark should_continue as False to indicate graph is complete
        ctx.state.should_continue = False
        
        # Send final state snapshot - graph completed
        # Use empty current_node and "completed" status to mark all steps as done
        logger.info(f"   [Finalize] Sending final snapshot with result length={len(final_result)}")
        await _send_graph_state_snapshot(send_stream, ctx.state, "", "completed", shared_state)
        
        return final_result
    
    # ==================== BUILD GRAPH WITH DECISION NODES ====================
    # Start -> Orchestrator
    g.add(g.edge_from(g.start_node).to(orchestrator_step))
    
    # Orchestrator -> Decision (route to workers or finalize)
    g.add(
        g.edge_from(orchestrator_step).to(
            g.decision()
            .branch(g.match(TypeExpression[Literal["image_generation"]]).to(image_generation_step))
            .branch(g.match(TypeExpression[Literal["web_search"]]).to(web_search_step))
            .branch(g.match(TypeExpression[Literal["code_execution"]]).to(code_execution_step))
            .branch(g.match(TypeExpression[Literal["result_aggregator"]]).to(result_aggregator_step))
            .branch(g.match(TypeExpression[Literal["end"]]).to(finalize_result))
        )
    )
    
    # Workers -> Decision (continue to orchestrator or finalize)
    for worker_step in [image_generation_step, web_search_step, code_execution_step, result_aggregator_step]:
        g.add(
            g.edge_from(worker_step).to(
                g.decision()
                .branch(g.match(TypeExpression[Literal["continue"]]).to(orchestrator_step))
                .branch(g.match(TypeExpression[Literal["end"]]).to(finalize_result))
                .branch(g.match(TypeExpression[Literal["error"]]).to(finalize_result))
            )
        )
    
    # Finalize -> End
    g.add(g.edge_from(finalize_result).to(g.end_node))
    
    return g.build()


# ========== Graph Runner ==========

async def run_multi_agent_graph(
    query: str,
    orchestrator_model: Any,
    run_input: RunAgentInput | None = None,
    send_stream: MemoryObjectSendStream[str] | None = None,
    api_key: str | None = None,
    max_iterations: int = 5,
    shared_state: Any = None,  # Optional AgentState from ctx.deps.state
    # Usage tracking context (for sub-agent statistics)
    session_id: str | None = None,
    user_id: str | None = None,
    organization_id: str | None = None,
    team_id: str | None = None,
    auth_session_id: str | None = None,
    broadcast_func: Any = None,  # Async function to broadcast usage
    # Database IDs for usage tracking (use parent agent's IDs for sub-agents)
    agent_id: str | None = None,  # DB UUID of the parent agent
    model_id: str | None = None,  # DB UUID of the model
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
    agents = _create_agents(api_key)
    dummy_agent = Agent(model=agents['general_model'])
    
    # Create AGUIAdapter instance with the dummy agent
    ag_ui_adapter = AGUIAdapter(
        agent=dummy_agent,
        run_input=run_input,
        accept=SSE_CONTENT_TYPE
    )
    
    # Initialize internal graph state
    state = QueryState(query=query, max_iterations=max_iterations)
    
    # Create GraphDeps with send_stream, ag_ui_adapter, shared_state, and usage tracking
    deps = GraphDeps(
        send_stream=send_stream,
        ag_ui_adapter=ag_ui_adapter,
        shared_state=shared_state,  # Pass shared state for syncing
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
        # Note: The finalize_result step already sends the final GraphAgentState snapshot
        # with streaming_text and tool_calls preserved. We sync here for data persistence
        # but do NOT send another state snapshot as it would overwrite the GraphAgentState
        # format with AgentState format, causing the frontend to lose intermediate process data.
        if shared_state:
            _sync_to_shared_state(state, shared_state)
        
        logger.info(f"✅ FINAL RESULT: {result[:200]}..." if len(result) > 200 else f"✅ FINAL RESULT: {result}")
        
        return result
        
    except Exception as e:
        error_msg = f"Graph execution failed: {str(e)}"
        logger.exception(error_msg)
        
        # Sync error to shared state
        if shared_state:
            shared_state.graph.errors.append({
                "node": "graph_execution",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })
            # Sync the current state so streaming data is preserved even on error
            _sync_to_shared_state(state, shared_state)
        
        raise

