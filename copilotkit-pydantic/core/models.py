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


class AgentState(BaseModel):
    """Shared agent state."""
    
    steps: list[Step] = Field(
        default_factory=list,
        description='The steps in the plan'
    )

