"""Agent tool definitions and registration."""

from __future__ import annotations

from pydantic_ai import Agent, RunContext
from pydantic_ai.ag_ui import StateDeps
from ag_ui.core import EventType, StateSnapshotEvent

from core.models import AgentState, Step, StepStatus
from tools.mcp_loader import load_mcp_toolsets


def register_agent_tools(agent: Agent) -> None:
    """Register all tools for the given agent.
    
    Args:
        agent: The agent instance to register tools on
    """
    
    # Load and register MCP server toolsets
    for toolset in load_mcp_toolsets():
        agent._user_toolsets.append(toolset)

    @agent.tool(sequential=True, retries=0)
    async def create_plan(ctx: RunContext[StateDeps[AgentState]], steps: list[str]) -> StateSnapshotEvent:
        """Create a plan with multiple steps.
        
        After calling this tool, you MUST provide a text response to the user confirming 
        the plan was created and what you'll do next.

        Args:
            steps: List of step descriptions to create the plan.

        Returns:
            StateSnapshotEvent containing the initial state of the steps.
        """
        print(f"📝 Creating plan with {len(steps)} steps")
        print(f"   Current state before: steps={len(ctx.deps.state.steps)}")
        
        # Update the steps in the current state, preserving other fields
        ctx.deps.state.steps = [Step(description=step) for step in steps]
        
        print(f"   State after: steps={len(ctx.deps.state.steps)}")
        
        # Serialize state to dict for the snapshot
        state_dict = ctx.deps.state.model_dump()
        print(f"   Returning snapshot: {state_dict}")
        
        # Return state snapshot event
        return StateSnapshotEvent(
            type=EventType.STATE_SNAPSHOT,
            snapshot=state_dict,
        )

    @agent.tool(sequential=True, retries=0)
    async def update_plan_step(
        ctx: RunContext[StateDeps[AgentState]],
        index: int, 
        description: str | None = None, 
        status: StepStatus | None = None
    ) -> StateSnapshotEvent:
        """Update the plan with new steps or changes.
        
        After calling this tool, you MUST provide a text response to the user about 
        what you did and what's next.

        Args:
            index: The index of the step to update.
            description: The new description for the step.
            status: The new status for the step.

        Returns:
            StateSnapshotEvent containing the updated state.
        """
        print(f"🔄 Updating step {index}: description={description}, status={status}")
        print(f"   Current state: {len(ctx.deps.state.steps)} steps")
        
        # Validate that the step exists
        if not ctx.deps.state.steps or index >= len(ctx.deps.state.steps):
            error_msg = f"Step at index {index} does not exist. Current steps count: {len(ctx.deps.state.steps)}"
            print(f"   ❌ ERROR: {error_msg}")
            print(f"   Current steps: {[s.description for s in ctx.deps.state.steps]}")
            raise ValueError(error_msg)
        
        # Apply updates to the state object (this persists the changes)
        if description is not None:
            ctx.deps.state.steps[index].description = description
        if status is not None:
            ctx.deps.state.steps[index].status = status
        
        # Serialize state to dict for the snapshot
        state_dict = ctx.deps.state.model_dump()
        print(f"   ✅ Updated step {index}, returning full snapshot: {state_dict}")
        
        # Return full state snapshot
        return StateSnapshotEvent(
            type=EventType.STATE_SNAPSHOT,
            snapshot=state_dict,
        )

    @agent.tool(sequential=True, retries=0)
    def get_weather(_: RunContext[StateDeps[AgentState]], location: str) -> str:
        """Get the weather for a given location. 
        
        Ensure location is fully spelled out.
        
        Args:
            location: The location to get weather for
            
        Returns:
            Weather information as a string
        """
        return f"The weather in {location} is sunny."

