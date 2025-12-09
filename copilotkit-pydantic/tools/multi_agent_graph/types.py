"""Type definitions for multi-agent graph orchestration.

This module contains all dataclasses, BaseModels, and type aliases used
across the multi-agent graph components.
"""

from __future__ import annotations

from typing import Literal, Any, TYPE_CHECKING
from dataclasses import dataclass, field
from pydantic import BaseModel

if TYPE_CHECKING:
    from anyio.streams.memory import MemoryObjectSendStream
    from pydantic_ai.ag_ui import AGUIAdapter

# ========== Action Types ==========

ActionType = Literal["image_generation", "web_search", "code_execution", "result_aggregator", "confirmation", "deferred", "end"]
WorkerResult = Literal["continue", "end", "error", "deferred"]


# ========== Orchestrator Output Types ==========

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


# ========== Graph Dependencies ==========

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


# ========== Tool Call Tracking ==========

@dataclass
class ToolCallInfo:
    """Information about a tool call made by a sub-agent."""
    tool_name: str
    args: str = ""
    result: str = ""
    status: str = "in_progress"  # "in_progress", "completed", "error"


# ========== Query State ==========

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
    deferred_tool_requests: Any = None  # DeferredToolRequests when waiting for user interaction


# ========== Frontend State Types ==========

class GraphToolCall(BaseModel):
    """A tool call made by a sub-agent - for frontend rendering."""
    tool_name: str
    args: str = ""
    result: str = ""
    status: str = "in_progress"  # "in_progress", "completed", "error"


class GraphStep(BaseModel):
    """A step in the graph execution - rendered on the frontend."""
    node: str  # Node name (e.g., "WebSearch", "ImageGeneration")
    status: str  # "pending", "in_progress", "completed", "error", "cancelled", "waiting"
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
    status: str = "pending"  # "pending", "running", "completed", "error", "waiting"


# ========== Node Name Mapping ==========

# Map action types to CamelCase node names
ACTION_TO_NODE = {
    "web_search": "WebSearch",
    "image_generation": "ImageGeneration",
    "code_execution": "CodeExecution",
    "result_aggregator": "ResultAggregator",
    "confirmation": "Confirmation",
}

# Map history node names back to action types
NODE_TO_ACTION = {v: k for k, v in ACTION_TO_NODE.items()}

