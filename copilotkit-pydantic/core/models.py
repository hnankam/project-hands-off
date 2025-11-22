"""Pydantic models for agent state and data structures."""

from typing import Any, Literal
from pydantic import BaseModel, Field

# Type definitions
StepStatus = Literal['pending', 'running', 'completed', 'failed', 'deleted']


class Step(BaseModel):
    """Represents a step in a plan."""

    description: str = Field(description='The description of the step')
    status: StepStatus = Field(
        default='pending',
        description='The status of the step (e.g. pending, running, completed, failed, deleted)',
    )


class Plan(BaseModel):
    """Represents a plan with multiple steps."""

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


class GraphState(BaseModel):
    """State for multi-agent graph execution."""
    
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
    execution_history: list[str] = Field(
        default_factory=list,
        description='Track which nodes have been executed'
    )
    intermediate_results: dict[str, str] = Field(
        default_factory=dict,
        description='Track results from each node'
    )
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


class AgentState(BaseModel):
    """Shared agent state including multi-agent graph state."""
    
    # Original agent state fields
    steps: list[Step] = Field(
        default_factory=list,
        description='The steps in the plan'
    )
    
    # Multi-agent graph state
    graph: GraphState = Field(
        default_factory=GraphState,
        description='Multi-agent graph execution state'
    )

