"""Pydantic models for agent state and data structures."""

from typing import Any, Literal, Union
from pydantic import BaseModel, Field
from dataclasses import dataclass

# Type definitions
StepStatus = Literal['pending', 'running', 'completed', 'failed', 'deleted']


# ============================================================================
# UNIFIED DEPENDENCIES
# ============================================================================

@dataclass
class UnifiedDeps:
    """Unified dependencies for both regular agents and multi-agent graph nodes.
    
    Fields are organized by category:
    - Core state: Required for agent tools, optional for graph nodes
    - Streaming and adapter: For AGUI event streaming
    - Agent context: Organization/team/agent metadata
    - Usage tracking: Session and user identification
    - AGUI context: Frontend context from useCopilotReadableData
    """
    # Core state (required for regular agent tools, optional for graph nodes)
    state: Any = None  # AgentState for regular agents, None for graph nodes
    
    # Streaming and adapter
    send_stream: Any = None  # MemoryObjectSendStream[str]
    adapter: Any = None  # AGUIAdapter
    
    # Agent context for auxiliary agents
    organization_id: str | None = None
    team_id: str | None = None
    agent_type: str | None = None
    agent_info: dict | None = None
    
    # Usage tracking context
    session_id: str | None = None
    user_id: str | None = None
    auth_session_id: str | None = None
    broadcast_func: Any = None  # Async function to broadcast usage
    
    # Database IDs for usage tracking (resolved UUIDs)
    agent_id: str | None = None  # DB UUID of the parent agent
    model_id: str | None = None  # DB UUID of the model
    
    # AGUI context from frontend (useCopilotReadableData / useAgentContext)
    agui_context: list[dict] | None = None


class Step(BaseModel):
    """Represents a step in a plan."""

    description: str = Field(description='The description of the step')
    status: StepStatus = Field(
        default='pending',
        description='The status of the step (e.g. pending, running, completed, failed, deleted)',
    )


class PlanInstance(BaseModel):
    """A single plan instance - fully self-contained.
    
    Each plan has its own unique ID, human-readable name, steps, and status.
    Multiple plans can be active simultaneously within a session.
    """
    
    # Identity
    plan_id: str = Field(
        description='Unique ID for this plan (e.g., "a1b2c3d4e5f6")'
    )
    name: str = Field(
        description='Human-readable name for this plan (e.g., "Build Dream House", "Research ML")'
    )
    status: Literal['active', 'paused', 'completed', 'cancelled'] = Field(
        default='active',
        description='Current status of the plan'
    )
    
    # Steps
    steps: list[Step] = Field(
        default_factory=list,
        description='The steps in the plan'
    )
    
    # Timestamps
    created_at: str = Field(
        description='ISO 8601 timestamp when plan was created'
    )
    updated_at: str = Field(
        description='ISO 8601 timestamp when plan was last updated'
    )
    
    # Custom metadata (tags, priority, etc.)
    metadata: dict = Field(
        default_factory=dict,
        description='Custom metadata for this plan'
    )


class Plan(BaseModel):
    """Represents a plan with multiple steps.
    
    NOTE: This is kept for backward compatibility with create_plan tool.
    New code should use PlanState instead.
    """

    steps: list[Step] = Field(default_factory=list, description='The steps in the plan')


class JSONPatchOp(BaseModel):
    """A class representing a JSON Patch operation (RFC 6902)."""

    op: Literal['add', 'remove', 'replace', 'move', 'copy', 'test'] = Field(
        description='The operation to perform (e.g. add, remove, replace, move, copy, test)',
    )
    path: str = Field(description='JSON Pointer (RFC 6901) to the target location')
    value: Any = Field(
        default=None,
        description='The value to apply (for add, replace operations)',
    )
    from_: str | None = Field(
        default=None,
        alias='from',
        description='Source path (for move, copy operations)',
    )


class GraphStep(BaseModel):
    """Represents a step in a graph execution (different from plan Step)."""
    
    node: str = Field(description='The node name (e.g., WebSearch, CodeExecution)')
    status: str = Field(default='pending', description='Status: pending, in_progress, completed, error')
    result: str = Field(default='', description='Result or error message')
    prompt: str = Field(default='', description='Prompt sent to the sub-agent')
    streaming_text: str = Field(default='', description='Live streaming text during execution')
    tool_calls: list[dict] = Field(default_factory=list, description='Tool calls made during this step')
    timestamp: str = Field(default='', description='ISO timestamp')


class GraphInstance(BaseModel):
    """A single graph execution instance - fully self-contained.
    
    Each graph has its own unique ID, human-readable name, query state, and execution history.
    Multiple graphs can be active simultaneously within a session.
    """
    
    # ========== Identity & Status ==========
    graph_id: str = Field(
        description='Unique ID for this graph execution (e.g., "xyz789abc123")'
    )
    name: str = Field(
        description='Human-readable name for this graph (e.g., "Generate Sunset Image", "Web Research")'
    )
    status: Literal['active', 'running', 'paused', 'completed', 'cancelled', 'waiting'] = Field(
        default='active',
        description='Current status of the graph execution. "running" and "active" are equivalent.'
    )
    
    # ========== Steps ==========
    steps: list[GraphStep] = Field(
        default_factory=list,
        description='The steps in the graph execution'
    )
    
    # ========== Core Query State ==========
    query: str = Field(
        default="",
        description='The current query being processed'
    )
    original_query: str = Field(
        default="",
        description='The original user query'
    )
    result: str = Field(
        default="",
        description='The result of the query execution'
    )
    query_type: str = Field(
        default="",
        description='Type of query: image_generation, web_search, code_execution, result_aggregator, or unknown'
    )
    
    # ========== Execution Tracking ==========
    execution_history: list[str] = Field(
        default_factory=list,
        description='Track which nodes have been executed'
    )
    intermediate_results: dict[str, str] = Field(
        default_factory=dict,
        description='Track results from each node'
    )
    streaming_text: dict[str, str] = Field(
        default_factory=dict,
        description='Track streaming text per node during execution'
    )
    prompts: dict[str, str] = Field(
        default_factory=dict,
        description='Track prompts sent to each node'
    )
    tool_calls: dict[str, list] = Field(
        default_factory=dict,
        description='Track tool calls per node: {node: [ToolCallInfo]}'
    )
    
    # ========== Error Handling ==========
    errors: list[dict[str, str]] = Field(
        default_factory=list,
        description='Track errors: [{node, error, timestamp}]'
    )
    last_error_node: str = Field(
        default="",
        description='Track which node last encountered an error'
    )
    retry_count: int = Field(
        default=0,
        description='Track retry attempts for error recovery'
    )
    max_retries: int = Field(
        default=2,
        description='Maximum retry attempts'
    )
    
    # ========== Control Flow ==========
    iteration_count: int = Field(
        default=0,
        description='Prevent infinite loops'
    )
    max_iterations: int = Field(
        default=5,
        description='Maximum number of routing iterations'
    )
    should_continue: bool = Field(
        default=True,
        description='Control flag for orchestrator loop'
    )
    next_action: str = Field(
        default="",
        description='Next action to take'
    )
    planned_steps: list[str] = Field(
        default_factory=list,
        description='Planned execution sequence from orchestrator'
    )
    
    # ========== Visualization (Per-Instance) ==========
    mermaid_diagram: str = Field(
        default="",
        description='Mermaid diagram showing the graph structure for this specific execution'
    )
    
    # ========== Human-in-the-Loop (Per-Instance) ==========
    deferred_tool_requests: Any = Field(
        default=None,
        description='DeferredToolRequests when waiting for user interaction'
    )
    
    # ========== Timestamps ==========
    created_at: str = Field(
        description='ISO 8601 timestamp when graph was created'
    )
    updated_at: str = Field(
        description='ISO 8601 timestamp when graph was last updated'
    )


class AgentState(BaseModel):
    """Unified agent state with flat structure for multi-instance support.
    
    Key Features:
    - Flat structure: plans and graphs are dictionaries at root level
    - Multi-active: Multiple plans/graphs can be active simultaneously
    - Self-contained: Each instance has all its data
    - Named: Each instance has a human-readable name
    - Status-based: No active pointers needed
    
    Each plan and graph instance is identified by:
    - Unique ID (e.g., "a1b2c3d4e5f6") for programmatic access
    - Human name (e.g., "Build Dream House") for user-friendly references
    
    Users can reference instances by name (e.g., @"Build Dream House") 
    and tools accept either name or ID.
    """
    
    # ========== Plan Instances ==========
    plans: dict[str, PlanInstance] = Field(
        default_factory=dict,
        description='All plan instances in this session, keyed by plan_id. Multiple can be active simultaneously.'
    )
    
    # ========== Graph Instances ==========
    graphs: dict[str, GraphInstance] = Field(
        default_factory=dict,
        description='All graph execution instances in this session, keyed by graph_id. Multiple can be active simultaneously.'
    )
    
    # ========== Session Metadata ==========
    sessionId: str | None = Field(
        default=None,
        description='Session identifier for scoping state'
    )
    
    # ========== Session-Level HITL (Optional) ==========
    deferred_tool_requests: Any = Field(
        default=None,
        description='Session-level deferred tool requests (per-instance requests are stored in the instance itself)'
    )

