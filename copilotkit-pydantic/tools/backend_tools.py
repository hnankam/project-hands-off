"""Backend tool definitions for agents.

This module contains all backend tools that agents can use. Backend tools are
Python functions that run on the server and have access to the agent's state.

## Adding a New Backend Tool

1. Define your tool function in this file:
   - Function can be sync or async
   - First parameter must be `ctx: RunContext[StateDeps[AgentState]]`
   - Add clear docstring with Args and Returns
   - Add type hints for all parameters

2. Add the tool to the BACKEND_TOOLS dictionary at the bottom

3. Add the tool to your database with tool_type='backend'

Example:
    def my_new_tool(ctx: RunContext[StateDeps[AgentState]], param1: str, param2: int = 5) -> str:
        '''Description of what this tool does.
        
        Args:
            ctx: The run context with agent state
            param1: Description of param1
            param2: Description of param2 (optional, default 5)
            
        Returns:
            Description of return value
        '''
        # Tool implementation
        return "result"
    
    # Then add to BACKEND_TOOLS:
    BACKEND_TOOLS = {
        'my_new_tool': my_new_tool,
        # ... other tools
    }
"""

from __future__ import annotations

from pydantic_ai import RunContext
from pydantic_ai.ag_ui import StateDeps
from ag_ui.core import EventType, StateSnapshotEvent

from core.models import AgentState, Step, StepStatus


# ========== State Management Tools ==========

async def create_plan(ctx: RunContext[StateDeps[AgentState]], steps: list[str]) -> StateSnapshotEvent:
    """Create a plan with multiple steps.
    
    Args:
        ctx: The run context with agent state
        steps: List of step descriptions to create
        
    Returns:
        StateSnapshotEvent with updated state
    """
    print(f"📝 Creating plan with {len(steps)} steps")
    print(f"   Current state before: steps={len(ctx.deps.state.steps)}")
    ctx.deps.state.steps = [Step(description=step) for step in steps]
    print(f"   State after: steps={len(ctx.deps.state.steps)}")
    state_dict = ctx.deps.state.model_dump()
    print(f"   Returning snapshot: {state_dict}")
    return StateSnapshotEvent(
        type=EventType.STATE_SNAPSHOT,
        snapshot=state_dict,
    )


async def update_plan_step(
    ctx: RunContext[StateDeps[AgentState]],
    index: int,
    description: str | None = None,
    status: StepStatus | None = None
) -> StateSnapshotEvent:
    """Update a specific step in the plan.
    
    Args:
        ctx: The run context with agent state
        index: Index of the step to update
        description: New description for the step (optional)
        status: New status for the step (optional)
        
    Returns:
        StateSnapshotEvent with updated state
        
    Raises:
        ValueError: If step index doesn't exist
    """
    print(f"🔄 Updating step {index}: description={description}, status={status}")
    print(f"   Current state: {len(ctx.deps.state.steps)} steps")

    if not ctx.deps.state.steps or index >= len(ctx.deps.state.steps):
        error_msg = f"Step at index {index} does not exist. Current steps count: {len(ctx.deps.state.steps)}"
        print(f"   ❌ ERROR: {error_msg}")
        print(f"   Current steps: {[s.description for s in ctx.deps.state.steps]}")
        raise ValueError(error_msg)

    if description is not None:
        ctx.deps.state.steps[index].description = description
    if status is not None:
        ctx.deps.state.steps[index].status = status

    state_dict = ctx.deps.state.model_dump()
    print(f"   ✅ Updated step {index}, returning full snapshot: {state_dict}")

    return StateSnapshotEvent(
        type=EventType.STATE_SNAPSHOT,
        snapshot=state_dict,
    )


# ========== Utility Tools ==========

def get_weather(_: RunContext[StateDeps[AgentState]], location: str) -> str:
    """Get the weather for a given location.
    
    Args:
        location: City or location name
        
    Returns:
        Weather description string
    """
    return f"The weather in {location} is sunny."


# ========== Tool Registry ==========
# Maps tool keys to their function implementations

BACKEND_TOOLS = {
    'create_plan': create_plan,
    'update_plan_step': update_plan_step,
    'get_weather': get_weather,
}


def get_backend_tool(tool_key: str):
    """Get a backend tool by its key.
    
    Args:
        tool_key: The tool identifier (e.g., 'create_plan')
        
    Returns:
        The tool function, or None if not found
    """
    return BACKEND_TOOLS.get(tool_key)


def list_backend_tools() -> list[str]:
    """List all available backend tool keys.
    
    Returns:
        List of tool key strings
    """
    return list(BACKEND_TOOLS.keys())

