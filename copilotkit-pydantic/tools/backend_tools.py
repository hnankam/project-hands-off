"""Backend tool definitions for agents.

This module contains all backend tools that agents can use. Backend tools are
Python functions that run on the server and have access to the agent's state.

## Adding a New Backend Tool

1. Define your tool function in this file:
   - Function can be sync or async
   - First parameter must be `ctx: RunContext[UnifiedDeps]`
   - Add clear docstring with Args and Returns
   - Add type hints for all parameters

2. Add the tool to the BACKEND_TOOLS dictionary at the bottom

3. Add the tool to your database with tool_type='backend'

## Auxiliary Agents

Tools like generate_images, web_search, code_execution, and url_context use
auxiliary agents that are configured in the main agent's metadata:

{
    "auxiliary_agents": {
        "image_generation": { "agent_type": "my-image-agent" },
        "web_search": { "agent_type": "my-search-agent" },
        "code_execution": { "agent_type": "my-code-agent" },
        "url_context": { "agent_type": "my-url-agent" }
    }
}

"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext, BinaryImage, ToolReturn
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE, AGUIAdapter
from ag_ui.core import EventType, StateSnapshotEvent, StateDeltaEvent, CustomEvent, RunAgentInput, UserMessage, BaseEvent, ActivitySnapshotEvent, ActivityDeltaEvent

from core.models import AgentState, Step, StepStatus, UnifiedDeps, PlanInstance, GraphInstance

from pydantic_ai import ModelSettings
from core.models import JSONPatchOp
from config import logger

# Import Firebase Storage utility
from utils.firebase_storage import upload_binary_image_to_storage

# Import auxiliary agent factory
from tools.auxiliary_agents import get_auxiliary_agent

# Multi-agent graph tools moved to graph_tools.py

import os
import uuid
from datetime import datetime

# ========== Name Resolution Helpers ==========

def resolve_plan_identifier(state: AgentState, identifier: str) -> str | None:
    """Resolve a plan by name or ID.
    
    Resolution order:
    1. Exact plan_id match
    2. Exact name match (case-sensitive)
    3. Case-insensitive name match
    4. Partial name match (starts with)
    
    Args:
        state: Current agent state
        identifier: Either plan_id or plan name
        
    Returns:
        plan_id if found, None otherwise
    """
    # 1. Direct ID match
    if identifier in state.plans:
        return identifier
    
    # 2. Exact name match (case-sensitive)
    for plan_id, plan in state.plans.items():
        if plan.name == identifier:
            return plan_id
    
    # 3. Case-insensitive name match
    identifier_lower = identifier.lower()
    for plan_id, plan in state.plans.items():
        if plan.name.lower() == identifier_lower:
            return plan_id
    
    # 4. Partial match (starts with)
    for plan_id, plan in state.plans.items():
        if plan.name.lower().startswith(identifier_lower):
            return plan_id
    
    return None


def resolve_graph_identifier(state: AgentState, identifier: str) -> str | None:
    """Resolve a graph by name or ID (same logic as resolve_plan_identifier)."""
    # 1. Direct ID match
    if identifier in state.graphs:
        return identifier
    
    # 2. Exact name match (case-sensitive)
    for graph_id, graph in state.graphs.items():
        if graph.name == identifier:
            return graph_id
    
    # 3. Case-insensitive name match
    identifier_lower = identifier.lower()
    for graph_id, graph in state.graphs.items():
        if graph.name.lower() == identifier_lower:
            return graph_id
    
    # 4. Partial match (starts with)
    for graph_id, graph in state.graphs.items():
        if graph.name.lower().startswith(identifier_lower):
            return graph_id
    
    return None


# ========== Plan Management Tools ==========

async def create_plan(
    ctx: RunContext[UnifiedDeps],
    name: str,
    steps: list[str],
    status: str = "active"
) -> ToolReturn:
    """Create a new plan with a descriptive name.
    
    Multiple plans can be active simultaneously. Each plan has a unique ID and
    a human-readable name. Users can reference plans by name (e.g., @"Build House Plan").
    
    Uses hybrid snapshot/delta approach:
    - State updates: First plan sends StateSnapshotEvent, subsequent use StateDeltaEvent
    - Activity messages: Always sends ActivitySnapshotEvent to create new chat message
    
    Args:
        ctx: The run context with agent state
        name: Human-readable name for this plan (max 50 chars, e.g., "Build Dream House", "Research ML")
        steps: List of step descriptions
        status: Initial status, default "active" (can be "active", "paused")
        
    Returns:
        Confirmation message with plan name and ID
        
    Example:
        create_plan(
            name="Research Machine Learning",
            steps=["Read papers", "Summarize findings", "Draft report"]
        )
    """
    # Generate unique plan ID
    plan_id = f"{uuid.uuid4().hex[:12]}"
    
    # Check if this is the first plan (before adding it)
    is_first_plan = len(ctx.deps.state.plans) == 0
    
    # Create plan instance
    plan_instance = PlanInstance(
        plan_id=plan_id,
        name=name,
        steps=[Step(description=step) for step in steps],
        status=status,  # type: ignore
        created_at=datetime.now().isoformat(),
        updated_at=datetime.now().isoformat(),
    )
    
    # Add to state
    ctx.deps.state.plans[plan_id] = plan_instance
    
    # Get sessionId, handle None case
    session_id = ctx.deps.state.sessionId or ctx.deps.session_id or "default"
    
    # Update state with session_id if it was None
    if not ctx.deps.state.sessionId:
        ctx.deps.state.sessionId = session_id
    
    # Activity message for this specific plan
    activity_message_id = f"plan-{plan_id}"
    
    # Choose between full snapshot (first plan) or delta (subsequent plans)
    if is_first_plan:
        # Send full snapshot to establish state structure
        state_dict = ctx.deps.state.model_dump()
        
        # For first plan, use ActivitySnapshotEvent to establish activity structure
        activity_content = {
            "plans": {plan_id: plan_instance.model_dump()},
            "sessionId": session_id,
        }

        result = ToolReturn(
            return_value=f'Plan "{name}" (ID: {plan_id}) created with {len(steps)} steps',
            metadata=[
                StateSnapshotEvent(
                    type=EventType.STATE_SNAPSHOT,
                    snapshot=state_dict,
                ),
                ActivitySnapshotEvent(
                    messageId=activity_message_id,
                    activityType="task_progress",
                    content=activity_content,
                ),
            ],
        )
    else:
        # Send delta for efficient incremental update
        state_patch_ops: list[JSONPatchOp] = [
            JSONPatchOp(
                op='add',
                path=f'/plans/{plan_id}',
                value=plan_instance.model_dump()
            )
        ]
        
        # Always send ActivitySnapshotEvent to create a new chat message for each plan
        activity_content = {
            "plans": {plan_id: plan_instance.model_dump()},
            "sessionId": session_id,
        }
        
        result = ToolReturn(
            return_value=f'Plan "{name}" (ID: {plan_id}) created with {len(steps)} steps',
            metadata=[
                StateDeltaEvent(
                    type=EventType.STATE_DELTA,
                    delta=[op.model_dump(by_alias=True) for op in state_patch_ops],
                ),
                ActivitySnapshotEvent(
                    messageId=activity_message_id,
                    activityType="task_progress",
                    content=activity_content,
                ),
            ],
        )
    
    return result

async def update_plan_step(
    ctx: RunContext[UnifiedDeps],
    plan_identifier: str,
    step_index: int,
    description: str | None = None,
    status: StepStatus | None = None
) -> ToolReturn:
    """Update a specific plan's step.
    
    Uses StateDeltaEvent with JSON Patch operations for efficient incremental updates.
    
    Args:
        ctx: The run context with agent state
        plan_identifier: Plan name OR plan_id (e.g., "Build House Plan" or "abc123")
        step_index: Index of step to update (0-based)
        description: New description (optional)
        status: New status (optional)
        
    Returns:
        Confirmation message
        
    Raises:
        ValueError: If plan or step not found
        
    Example:
        update_plan_step("Build Dream House", 0, status="completed")
        # or
        update_plan_step("abc123def456", 0, status="completed")
    """
    # Resolve name/ID to actual plan_id
    plan_id = resolve_plan_identifier(ctx.deps.state, plan_identifier)
    
    if not plan_id:
        available = [f'"{p.name}" ({pid})' for pid, p in ctx.deps.state.plans.items()]
        error_msg = (
            f'Plan "{plan_identifier}" not found. Available plans:\n' +
            ('\n'.join(available) if available else 'No plans available')
        )
        return ToolReturn(return_value=error_msg)
    
    plan = ctx.deps.state.plans[plan_id]
    
    # Validate step index
    if not plan.steps or step_index >= len(plan.steps):
        error_msg = (
            f"Step {step_index} doesn't exist in plan '{plan.name}'. "
            f"Current steps count: {len(plan.steps)}"
        )
        return ToolReturn(return_value=error_msg)

    # Validate status if provided
    valid_statuses = ['pending', 'running', 'completed', 'failed', 'deleted']
    if status is not None:
        status_str = str(status).lower().strip()
        # Find matching valid status (case-insensitive check)
        matched_status = None
        for valid_status in valid_statuses:
            if status_str == valid_status.lower():
                matched_status = valid_status
                break
        
        if matched_status is None:
            error_msg = (
                f"Invalid step status '{status}'. "
                f"Accepted values are: {', '.join(valid_statuses)}. "
                f"Please use one of these exact values."
            )
            return ToolReturn(return_value=error_msg)
        
        # Use the exact valid status value (normalize case)
        status = matched_status  # type: ignore

    # Build JSON Patch operations for delta update
    patch_ops: list[JSONPatchOp] = []
    
    # Update step fields
    if description is not None:
        plan.steps[step_index].description = description
        patch_ops.append(JSONPatchOp(
            op='replace',
            path=f'/plans/{plan_id}/steps/{step_index}/description',
            value=description
        ))
    
    if status is not None:
        plan.steps[step_index].status = status  # type: ignore
        patch_ops.append(JSONPatchOp(
            op='replace',
            path=f'/plans/{plan_id}/steps/{step_index}/status',
            value=status
        ))
    
    # Update plan timestamp
    new_timestamp = datetime.now().isoformat()
    plan.updated_at = new_timestamp
    patch_ops.append(JSONPatchOp(
        op='replace',
        path=f'/plans/{plan_id}/updated_at',
        value=new_timestamp
    ))
    
    # Get sessionId, handle None case
    session_id = ctx.deps.state.sessionId or ctx.deps.session_id or "default"
    
    # Update state with session_id if it was None
    if not ctx.deps.state.sessionId:
        ctx.deps.state.sessionId = session_id
    
    # Activity delta operations - update only the changed step
    activity_message_id = f"plan-{plan_id}"
    activity_delta_ops: list[JSONPatchOp] = []
    
    # Update the changed step in activity content
    changed_step = plan.steps[step_index]
    if description is not None:
        activity_delta_ops.append(JSONPatchOp(
            op='replace',
            path=f'/plans/{plan_id}/steps/{step_index}/description',
            value=description
        ))
    
    if status is not None:
        activity_delta_ops.append(JSONPatchOp(
            op='replace',
            path=f'/plans/{plan_id}/steps/{step_index}/status',
            value=status
        ))
    
    # Update timestamp
    activity_delta_ops.append(JSONPatchOp(
        op='replace',
        path=f'/plans/{plan_id}/updated_at',
        value=new_timestamp
    ))
    
    return ToolReturn(
        return_value=f'Updated step {step_index} in plan "{plan.name}"',
        metadata=[
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[op.model_dump(by_alias=True) for op in patch_ops],
            ),
            ActivityDeltaEvent(
                messageId=activity_message_id,
                activityType="task_progress",
                patch=[op.model_dump(by_alias=True) for op in activity_delta_ops],
            ),
        ],
    )


async def update_plan_steps(
    ctx: RunContext[UnifiedDeps],
    plan_identifier: str,
    updates: list[dict[str, Any]]
) -> ToolReturn:
    """Update multiple plan steps in a single operation.
    
    More efficient than calling update_plan_step multiple times. Useful for
    updating step sequences (e.g., mark step 1 completed and step 2 running).
    
    Uses StateDeltaEvent with JSON Patch operations for efficient incremental updates.
    
    Args:
        ctx: The run context with agent state
        plan_identifier: Plan name OR plan_id (e.g., "Build House Plan" or "abc123")
        updates: List of step updates, each with:
            - step_index (int, required): Index of step to update
            - description (str, optional): New description
            - status (str, optional): New status
            
    Returns:
        Confirmation message with count of updated steps
        
    Example:
        update_plan_steps("Build Dream House", [
            {"step_index": 0, "status": "completed"},
            {"step_index": 1, "status": "running"},
            {"step_index": 2, "description": "Updated task description"}
        ])
    """
    # Resolve name/ID to actual plan_id
    plan_id = resolve_plan_identifier(ctx.deps.state, plan_identifier)
    
    if not plan_id:
        available = [f'"{p.name}" ({pid})' for pid, p in ctx.deps.state.plans.items()]
        error_msg = (
            f'Plan "{plan_identifier}" not found. Available plans:\n' +
            ('\n'.join(available) if available else 'No plans available')
        )
        return ToolReturn(return_value=error_msg)
    
    plan = ctx.deps.state.plans[plan_id]
    
    # Build JSON Patch operations for delta update
    patch_ops: list[JSONPatchOp] = []
    updated_indices = []
    errors = []
    
    for i, update in enumerate(updates):
        step_index = update.get('step_index')
        
        if step_index is None:
            errors.append(f"Update {i}: Missing step_index")
            continue
        
        # Validate step index
        if not plan.steps or step_index >= len(plan.steps) or step_index < 0:
            errors.append(
                f"Update {i}: Step {step_index} doesn't exist (plan has {len(plan.steps)} steps)"
            )
            continue
        
        # Create JSON Patch operations for each field change
        description = update.get('description')
        status = update.get('status')
        
        # Validate status if provided
        valid_statuses = ['pending', 'running', 'completed', 'failed', 'deleted']
        if status is not None:
            status_str = str(status).lower().strip()
            # Find matching valid status (case-insensitive check)
            matched_status = None
            for valid_status in valid_statuses:
                if status_str == valid_status.lower():
                    matched_status = valid_status
                    break
            
            if matched_status is None:
                errors.append(
                    f"Update {i}: Invalid step status '{status}'. "
                    f"Accepted values are: {', '.join(valid_statuses)}"
                )
                continue
            
            # Use the exact valid status value (normalize case)
            status = matched_status
        
        if description is not None:
            plan.steps[step_index].description = description
            # JSON Pointer path: /plans/{plan_id}/steps/{step_index}/description
            patch_ops.append(JSONPatchOp(
                op='replace',
                path=f'/plans/{plan_id}/steps/{step_index}/description',
                value=description
            ))
        
        if status is not None:
            plan.steps[step_index].status = status  # type: ignore
            # JSON Pointer path: /plans/{plan_id}/steps/{step_index}/status
            patch_ops.append(JSONPatchOp(
                op='replace',
                path=f'/plans/{plan_id}/steps/{step_index}/status',
                value=status
            ))
        
        updated_indices.append(step_index)
    
    # If no updates succeeded, return error
    if not updated_indices:
        error_msg = f'No steps were updated in plan "{plan.name}"'
        if errors:
            error_msg += f'\nErrors:\n' + '\n'.join(f'  - {e}' for e in errors)
        return ToolReturn(return_value=error_msg)
    
    # Update plan timestamp (both in memory and as a patch operation)
    new_timestamp = datetime.now().isoformat()
    plan.updated_at = new_timestamp
    patch_ops.append(JSONPatchOp(
        op='replace',
        path=f'/plans/{plan_id}/updated_at',
        value=new_timestamp
    ))
    
    # Get sessionId, handle None case
    session_id = ctx.deps.state.sessionId or ctx.deps.session_id or "default"
    
    # Update state with session_id if it was None
    if not ctx.deps.state.sessionId:
        ctx.deps.state.sessionId = session_id
    
    # Activity delta operations - update only the changed steps
    activity_message_id = f"plan-{plan_id}"
    activity_delta_ops: list[JSONPatchOp] = []
    
    # Add delta operations for each changed step
    for step_index in updated_indices:
        step = plan.steps[step_index]
        # The patch_ops already contain the step updates, reuse them for activity delta
        # Filter to get only the step-related operations
        for op in patch_ops:
            if f'/plans/{plan_id}/steps/{step_index}' in op.path:
                activity_delta_ops.append(op)
    
    # Add timestamp update
    activity_delta_ops.append(JSONPatchOp(
        op='replace',
        path=f'/plans/{plan_id}/updated_at',
        value=new_timestamp
    ))
    
    # Build result message
    result_msg = f'Updated {len(updated_indices)} step(s) in plan "{plan.name}": {sorted(updated_indices)}'
    if errors:
        result_msg += f'\n{len(errors)} error(s) occurred:\n' + '\n'.join(f'  - {e}' for e in errors)
    
    return ToolReturn(
        return_value=result_msg,
        metadata=[
            # Use StateDeltaEvent for efficient incremental updates
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[op.model_dump(by_alias=True) for op in patch_ops],
            ),
            ActivityDeltaEvent(
                messageId=activity_message_id,
                activityType="task_progress",
                patch=[op.model_dump(by_alias=True) for op in activity_delta_ops],
            ),
        ],
    )


async def update_plan_status(
    ctx: RunContext[UnifiedDeps],
    plan_identifier: str,
    status: str
) -> ToolReturn:
    """Change a plan's status (pause, resume, complete, cancel).
    
    Uses StateDeltaEvent with JSON Patch operations for efficient incremental updates.
    
    Args:
        ctx: The run context with agent state
        plan_identifier: Plan name OR plan_id
        status: New status ("active", "paused", "completed", "cancelled")
        
    Returns:
        Confirmation message
        
    Example:
        update_plan_status("Build Dream House", "paused")
    """
    # Resolve to plan_id
    plan_id = resolve_plan_identifier(ctx.deps.state, plan_identifier)
    if not plan_id:
        return ToolReturn(return_value=f'Plan "{plan_identifier}" not found')
    
    plan = ctx.deps.state.plans[plan_id]
    old_status = plan.status
    
    # Build JSON Patch operations
    patch_ops: list[JSONPatchOp] = []
    
    # Update status
    plan.status = status  # type: ignore
    patch_ops.append(JSONPatchOp(
        op='replace',
        path=f'/plans/{plan_id}/status',
        value=status
    ))
    
    # Update timestamp
    new_timestamp = datetime.now().isoformat()
    plan.updated_at = new_timestamp
    patch_ops.append(JSONPatchOp(
        op='replace',
        path=f'/plans/{plan_id}/updated_at',
        value=new_timestamp
    ))
    
    # Get sessionId
    session_id = ctx.deps.state.sessionId or ctx.deps.session_id or "default"
    
    # Activity delta operations - update only the changed status
    activity_message_id = f"plan-{plan_id}"
    activity_delta_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='replace',
            path=f'/plans/{plan_id}/status',
            value=status
        ),
        JSONPatchOp(
            op='replace',
            path=f'/plans/{plan_id}/updated_at',
            value=new_timestamp
        ),
    ]
    
    return ToolReturn(
        return_value=f'Plan "{plan.name}" status: {old_status} → {status}',
        metadata=[
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[op.model_dump(by_alias=True) for op in patch_ops],
            ),
            ActivityDeltaEvent(
                messageId=activity_message_id,
                activityType="task_progress",
                patch=[op.model_dump(by_alias=True) for op in activity_delta_ops],
            ),
        ],
    )


async def rename_plan(
    ctx: RunContext[UnifiedDeps],
    plan_identifier: str,
    new_name: str
) -> ToolReturn:
    """Rename a plan.
    
    Uses StateDeltaEvent with JSON Patch operations for efficient incremental updates.
    
    Args:
        ctx: The run context with agent state
        plan_identifier: Current name or ID
        new_name: New human-readable name
        
    Example:
        rename_plan("Build House", "Build Eco-Friendly House")
    """
    plan_id = resolve_plan_identifier(ctx.deps.state, plan_identifier)
    if not plan_id:
        return ToolReturn(return_value=f'Plan "{plan_identifier}" not found')
    
    plan = ctx.deps.state.plans[plan_id]
    old_name = plan.name
    
    # Build JSON Patch operations
    patch_ops: list[JSONPatchOp] = []
    
    # Update name
    plan.name = new_name
    patch_ops.append(JSONPatchOp(
        op='replace',
        path=f'/plans/{plan_id}/name',
        value=new_name
    ))
    
    # Update timestamp
    new_timestamp = datetime.now().isoformat()
    plan.updated_at = new_timestamp
    patch_ops.append(JSONPatchOp(
        op='replace',
        path=f'/plans/{plan_id}/updated_at',
        value=new_timestamp
    ))

    # Get sessionId
    session_id = ctx.deps.state.sessionId or ctx.deps.session_id or "default"
    
    # Activity delta operations - update only the changed name
    activity_message_id = f"plan-{plan_id}"
    activity_delta_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='replace',
            path=f'/plans/{plan_id}/name',
            value=new_name
        ),
        JSONPatchOp(
            op='replace',
            path=f'/plans/{plan_id}/updated_at',
            value=new_timestamp
        ),
    ]

    return ToolReturn(
        return_value=f'Plan renamed: "{old_name}" → "{new_name}"',
        metadata=[
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[op.model_dump(by_alias=True) for op in patch_ops],
            ),
            ActivityDeltaEvent(
                messageId=activity_message_id,
                activityType="task_progress",
                patch=[op.model_dump(by_alias=True) for op in activity_delta_ops],
            ),
        ],
    )


async def list_plans(ctx: RunContext[UnifiedDeps]) -> ToolReturn:
    """List all plans in the session with their complete data.
    
    Returns all plan instances with their complete data as JSON.
    
    Returns:
        ToolReturn with JSON string containing all plans from state
    """
    import json
    
    plans = ctx.deps.state.plans
    
    if not plans:
        return ToolReturn(return_value=json.dumps({"plans": {}}, indent=2))
    
    # Get JSON dump of all plans
    plans_data = {
        plan_id: plan.model_dump()
        for plan_id, plan in plans.items()
    }
    
    # Return JSON string
    return ToolReturn(return_value=json.dumps({"plans": plans_data}, indent=2))


async def get_plan_details(
    ctx: RunContext[UnifiedDeps],
    plan_identifier: str
) -> str:
    """Get detailed information about a plan including all steps.
    
    Returns the plan's complete step list with descriptions and statuses,
    useful for reviewing progress or debugging.
    
    Args:
        plan_identifier: Plan name or ID
        
    Returns:
        Detailed plan information with all steps
        
    Example:
        get_plan_details("Build House Plan")
    """
    plan_id = resolve_plan_identifier(ctx.deps.state, plan_identifier)
    if not plan_id:
        available = [f'"{p.name}" ({pid})' for pid, p in ctx.deps.state.plans.items()]
        error_msg = (
            f'Plan "{plan_identifier}" not found. Available plans:\n' +
            ('\n'.join(available) if available else 'No plans available')
        )
        return error_msg
    
    plan = ctx.deps.state.plans[plan_id]
    
    # Build detailed output
    result = f'**{plan.name}**\n'
    result += f'ID: {plan_id}\n'
    result += f'Status: {plan.status}\n'
    result += f'Created: {plan.created_at}\n'
    result += f'Updated: {plan.updated_at}\n'
    result += f'\nSteps ({len(plan.steps)}):\n\n'
    
    for i, step in enumerate(plan.steps):
        result += f'{i}. [{step.status}] {step.description}\n'
    
    if plan.metadata:
        result += f'\nMetadata: {plan.metadata}\n'
    
    return result


async def delete_plan(
    ctx: RunContext[UnifiedDeps],
    plan_identifier: str
) -> ToolReturn:
    """Remove a plan from the session.
    
    Uses StateDeltaEvent with JSON Patch 'remove' operation for efficient deletion.
    
    Args:
        ctx: The run context with agent state
        plan_identifier: Plan name OR plan_id
        
    Returns:
        Confirmation message
    """
    plan_id = resolve_plan_identifier(ctx.deps.state, plan_identifier)
    if not plan_id:
        return ToolReturn(return_value=f'Plan "{plan_identifier}" not found')
    
    plan_name = ctx.deps.state.plans[plan_id].name
    
    # Build JSON Patch operation for deletion
    patch_ops: list[JSONPatchOp] = [
        JSONPatchOp(
            op='remove',
            path=f'/plans/{plan_id}'
        )
    ]
    
    # Delete from in-memory state
    del ctx.deps.state.plans[plan_id]
    
    return ToolReturn(
        return_value=f'Plan "{plan_name}" deleted',
        metadata=[
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[op.model_dump(by_alias=True) for op in patch_ops],
            ),
        ],
    )


# ========== Helper Functions ==========

def _get_agent_context(ctx: RunContext[Any]) -> tuple[str | None, str | None, str | None, dict]:
    """Extract agent context from RunContext deps.
    
    Args:
        ctx: The run context
        
    Returns:
        Tuple of (organization_id, team_id, agent_type, agent_info)
    """
    deps = ctx.deps
    return (
        getattr(deps, 'organization_id', None),
        getattr(deps, 'team_id', None),
        getattr(deps, 'agent_type', None),
        getattr(deps, 'agent_info', {}) or {},
    )


# ========== Image Generation Tools ==========

async def generate_images(
    ctx: RunContext[UnifiedDeps], 
    prompt: str, 
    num_images: int = 1
) -> list[str]:
    """Generate images based on a text prompt using AI and upload to Firebase Storage.
    
    This function uses a configured auxiliary agent for image generation.
    The auxiliary agent must be configured in the main agent's metadata:
    
    {
        "auxiliary_agents": {
            "image_generation": { "agent_type": "your-image-agent" }
        }
    }
    
    Args:
        ctx: The run context with agent state and context
        prompt: Text description of the images to generate
        num_images: Number of images to generate (default: 1)
        
    Returns:
        List of public URLs pointing to the uploaded images in Firebase Storage
        
    Raises:
        ValueError: If no auxiliary agent is configured for image_generation
    """
    # Get agent context
    organization_id, team_id, agent_type, agent_info = _get_agent_context(ctx)
    
    # Get the auxiliary agent for image generation
    aux_agent = await get_auxiliary_agent(
        aux_type='image_generation',
        main_agent_type=agent_type or 'unknown',
        main_agent_metadata=agent_info.get('metadata', {}),
        organization_id=organization_id,
        team_id=team_id,
    )
    
    if aux_agent is None:
        error_msg = (
            f"No auxiliary agent configured for 'image_generation' in agent '{agent_type}'. "
            "Configure it in the agent's metadata: "
            '{"auxiliary_agents": {"image_generation": {"agent_type": "your-image-agent"}}}'
        )
        logger.error(error_msg)
        return [error_msg]  # Return list since this function returns list[str]
    
    try:
        # Use the auxiliary agent to generate images
        user_message = f"Generate {num_images} image(s) based on this prompt: {prompt}"
        
        logger.info("Running auxiliary agent for image generation with prompt: %s", prompt[:100])
        
        result = await aux_agent.run(user_message)
                
        # Upload each BinaryImage to Firebase Storage
        uploaded_urls = []
        
        # Check if response has images - images might be a method or property
        images = None
        if hasattr(result.response, 'images'):
            images_attr = getattr(result.response, 'images')
            if callable(images_attr):
                images = images_attr()
            else:
                images = images_attr
        
        if not images:
            logger.warning(
                "Auxiliary agent response has no images. "
                "Make sure the auxiliary agent has 'builtin_image_generation' tool configured and uses it. "
                "Response type: %s, Response text: %s",
                type(result.response),
                getattr(result.response, 'text', str(result.response))[:500] if result.response else 'None'
            )
            return []
        
        # Ensure images is iterable
        if not hasattr(images, '__iter__'):
            logger.warning("Images attribute is not iterable: %s", type(images))
            return []
        
        images_list = list(images) if images else []
        
        if not images_list:
            logger.warning("Auxiliary agent returned empty images list")
            return []
        
        logger.info("Received %d images from auxiliary agent", len(images_list))
        
        # Get user_id from deps for workspace integration
        deps = ctx.deps
        user_id = getattr(deps, 'user_id', None) if deps else None
        
        if not user_id:
            logger.error("Cannot generate images: user_id is required for workspace storage")
            return ["Error: User authentication required for image generation"]
        
        for idx, image in enumerate(images_list):
            if isinstance(image, BinaryImage):
                logger.info("Uploading image %d/%d to Firebase Storage...", idx + 1, len(images_list))
                
                # Get the binary data from BinaryImage
                image_data = image.data
                
                # Determine content type from media type
                content_type = image.media_type or "image/png"
                
                # Always store in user's workspace/generations folder
                folder = f"workspace/{user_id}/generations"
                
                # Upload to Firebase Storage
                url = await upload_binary_image_to_storage(
                    image_data,
                    folder=folder,
                    content_type=content_type
                )
                
                if url:
                    uploaded_urls.append(url)
                    logger.info("Uploaded: %s", url)
                    
                    # Register in workspace if user_id is available
                    if user_id:
                        try:
                            from services.workspace_manager import register_workspace_file
                            
                            # Extract file extension from content type
                            extension = content_type.split('/')[-1] if '/' in content_type else 'png'
                            file_name = f"generated-{idx + 1}.{extension}"
                            file_size = len(image_data)
                            
                            await register_workspace_file(
                                user_id=user_id,
                                file_name=file_name,
                                file_type=content_type,
                                file_size=file_size,
                                storage_url=url,
                                folder='generated',
                                tags=['ai-generated', 'image'],
                                description=f"Generated from prompt: {prompt[:100]}"
                            )
                            
                            logger.info("Registered generated image in workspace for user %s", user_id)
                        except Exception as workspace_error:
                            logger.warning("Failed to register image in workspace: %s", workspace_error)
                            # Don't fail the whole operation if workspace registration fails
                else:
                    logger.warning("Failed to upload image %d", idx + 1)
            else:
                logger.warning("Unexpected image type: %s", type(image))
        
        if not uploaded_urls:
            return []
        
        return uploaded_urls
        
    except Exception as e:
        error_msg = f"Image generation failed: {str(e)}"
        logger.exception("Image generation failed: %s", e)
        return [error_msg]  # Return list since this function returns list[str]


async def web_search(ctx: RunContext[UnifiedDeps], prompt: str) -> str:
    """Search the web for information using a configured auxiliary agent.
    
    The auxiliary agent must be configured in the main agent's metadata:
    
    {
        "auxiliary_agents": {
            "web_search": { "agent_type": "your-search-agent" }
        }
    }
    
    Args:
        ctx: The run context with agent state and context
        prompt: Search query
        
    Returns:
        Search results as text
        
    Raises:
        ValueError: If no auxiliary agent is configured for web_search
    """
    # Get agent context
    organization_id, team_id, agent_type, agent_info = _get_agent_context(ctx)
    
    # Get the auxiliary agent for web search
    aux_agent = await get_auxiliary_agent(
        aux_type='web_search',
        main_agent_type=agent_type or 'unknown',
        main_agent_metadata=agent_info.get('metadata', {}),
        organization_id=organization_id,
        team_id=team_id,
    )
    
    if aux_agent is None:
        error_msg = (
            f"No auxiliary agent configured for 'web_search' in agent '{agent_type}'. "
            "Configure it in the agent's metadata: "
            '{"auxiliary_agents": {"web_search": {"agent_type": "your-search-agent"}}}'
        )
        logger.error(error_msg)
        return error_msg  # Return string since this function returns str
    
    try:
        result = await aux_agent.run(prompt)
        return result.response.text
    except Exception as e:
        error_msg = f"Web search failed: {str(e)}"
        logger.exception("Web search failed: %s", e)
        return error_msg  # Return string since this function returns str


async def code_execution(ctx: RunContext[UnifiedDeps], prompt: str) -> str:
    """Execute code using a configured auxiliary agent.
    
    The auxiliary agent must be configured in the main agent's metadata:
    
    {
        "auxiliary_agents": {
            "code_execution": { "agent_type": "your-code-agent" }
        }
    }
    
    Args:
        ctx: The run context with agent state and context
        prompt: Code execution prompt
        
    Returns:
        Execution results as text
        
    Raises:
        ValueError: If no auxiliary agent is configured for code_execution
    """
    # Get agent context
    organization_id, team_id, agent_type, agent_info = _get_agent_context(ctx)
    
    # Get the auxiliary agent for code execution
    aux_agent = await get_auxiliary_agent(
        aux_type='code_execution',
        main_agent_type=agent_type or 'unknown',
        main_agent_metadata=agent_info.get('metadata', {}),
        organization_id=organization_id,
        team_id=team_id,
    )
    
    if aux_agent is None:
        error_msg = (
            f"No auxiliary agent configured for 'code_execution' in agent '{agent_type}'. "
            "Configure it in the agent's metadata: "
            '{"auxiliary_agents": {"code_execution": {"agent_type": "your-code-agent"}}}'
        )
        logger.error(error_msg)
        return error_msg  # Return string since this function returns str
    
    try:
        result = await aux_agent.run(f"Execute this code and return the result: {prompt}")
        return result.response.text
    except Exception as e:
        error_msg = f"Code execution failed: {str(e)}"
        logger.exception("Code execution failed: %s", e)
        return error_msg  # Return string since this function returns str


async def url_context(ctx: RunContext[UnifiedDeps], urls: list[str]) -> str:
    """Load content from URLs using a configured auxiliary agent.
    
    The auxiliary agent must be configured in the main agent's metadata:
    
    {
        "auxiliary_agents": {
            "url_context": { "agent_type": "your-url-agent" }
        }
    }
    
    Args:
        ctx: The run context with agent state and context
        urls: List of URLs to load content from
        
    Returns:
        URL content as text
        
    Raises:
        ValueError: If no auxiliary agent is configured for url_context
    """
    # Get agent context
    organization_id, team_id, agent_type, agent_info = _get_agent_context(ctx)
    
    # Get the auxiliary agent for URL context
    aux_agent = await get_auxiliary_agent(
        aux_type='url_context',
        main_agent_type=agent_type or 'unknown',
        main_agent_metadata=agent_info.get('metadata', {}),
        organization_id=organization_id,
        team_id=team_id,
    )
    
    if aux_agent is None:
        error_msg = (
            f"No auxiliary agent configured for 'url_context' in agent '{agent_type}'. "
            "Configure it in the agent's metadata: "
            '{"auxiliary_agents": {"url_context": {"agent_type": "your-url-agent"}}}'
        )
        logger.error(error_msg)
        return error_msg  # Return string since this function returns str
    
    try:
        # Format URLs as a prompt
        urls_text = "\n".join(urls)
        result = await aux_agent.run(f"Load content from these URLs:\n{urls_text}")
        return result.response.text
    except Exception as e:
        error_msg = f"URL context failed: {str(e)}"
        logger.exception("URL context failed: %s", e)
        return error_msg  # Return string since this function returns str


# Multi-agent graph tools moved to graph_tools.py


# ========== Tool Registry ==========
# Maps tool keys to their function implementations

from .graph_tools import GRAPH_TOOLS

BACKEND_TOOLS = {
    # Plan management (multi-instance with names)
    'create_plan': create_plan,
    'update_plan_step': update_plan_step,
    'update_plan_steps': update_plan_steps,
    'update_plan_status': update_plan_status,
    'rename_plan': rename_plan,
    'list_plans': list_plans,
    'get_plan_details': get_plan_details,
    'delete_plan': delete_plan,
    # Graph management (multi-instance with names)
    **GRAPH_TOOLS,
    # Auxiliary agents
    'generate_images': generate_images,
    'web_search': web_search,
    'code_execution': code_execution,
    'url_context': url_context,
    # Workspace tools (personal resources) - lazy loaded
    'search_workspace_files': None,
    'get_file_content': None,
    'search_workspace_notes': None,
    'get_note_content': None,
    'get_file_metadata': None,
    'list_folders': None,
    'create_folder': None,
    'rename_folder': None,
    'delete_folder': None,
    'list_files': None,
    'delete_file': None,
    'rename_file': None,
    'move_file': None,
    'create_text_file': None,
    'update_file_content': None,
}


def get_backend_tool(tool_key: str):
    """Get a backend tool by its key.
    
    Args:
        tool_key: The tool identifier (e.g., 'create_plan')
        
    Returns:
        The tool function, or None if not found
    """
    # Lazy load workspace tools
    workspace_tools = (
        'search_workspace_files', 'get_file_content', 'search_workspace_notes', 
        'get_note_content', 'get_file_metadata', 'list_folders', 'create_folder',
        'rename_folder', 'delete_folder', 'list_files', 'delete_file', 
        'rename_file', 'move_file', 'create_text_file', 'update_file_content'
    )
    
    if tool_key in workspace_tools:
        if BACKEND_TOOLS.get(tool_key) is None:
            from tools.workspace_tools import (
                search_workspace_files,
                get_file_content,
                search_workspace_notes,
                get_note_content,
                get_file_metadata,
                list_folders,
                create_folder,
                rename_folder,
                delete_folder,
                list_files,
                delete_file,
                rename_file,
                move_file,
                create_text_file,
                update_file_content
            )
            BACKEND_TOOLS['search_workspace_files'] = search_workspace_files
            BACKEND_TOOLS['get_file_content'] = get_file_content
            BACKEND_TOOLS['search_workspace_notes'] = search_workspace_notes
            BACKEND_TOOLS['get_note_content'] = get_note_content
            BACKEND_TOOLS['get_file_metadata'] = get_file_metadata
            BACKEND_TOOLS['list_folders'] = list_folders
            BACKEND_TOOLS['create_folder'] = create_folder
            BACKEND_TOOLS['rename_folder'] = rename_folder
            BACKEND_TOOLS['delete_folder'] = delete_folder
            BACKEND_TOOLS['list_files'] = list_files
            BACKEND_TOOLS['delete_file'] = delete_file
            BACKEND_TOOLS['rename_file'] = rename_file
            BACKEND_TOOLS['move_file'] = move_file
            BACKEND_TOOLS['create_text_file'] = create_text_file
            BACKEND_TOOLS['update_file_content'] = update_file_content
    
    return BACKEND_TOOLS.get(tool_key)


def list_backend_tools() -> list[str]:
    """List all available backend tool keys.
    
    Returns:
        List of tool key strings
    """
    return list(BACKEND_TOOLS.keys())
