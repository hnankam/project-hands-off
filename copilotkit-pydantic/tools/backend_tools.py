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

from pydantic import BaseModel
from pydantic_ai import Agent, RunContext, BinaryImage, ToolReturn
from pydantic_ai.ag_ui import StateDeps
from ag_ui.core import EventType, StateSnapshotEvent, StateDeltaEvent, CustomEvent

from core.models import AgentState, Step, StepStatus

from pydantic_ai import ModelSettings
from core.models import JSONPatchOp
from config import logger

# Import Firebase Storage utility
from utils.firebase_storage import upload_binary_image_to_storage

# Import auxiliary agent factory
from tools.auxiliary_agents import get_auxiliary_agent

import os

# ========== State Management Tools ==========

async def create_plan(ctx: RunContext[StateDeps[AgentState]], steps: list[str]) -> ToolReturn:
    """Create a plan with multiple steps.
    
    Args:
        ctx: The run context with agent state
        steps: List of step descriptions to create
        
    Returns:
        StateSnapshotEvent with updated state
    """
    ctx.deps.state.steps = [Step(description=step) for step in steps]
    state_dict = ctx.deps.state.model_dump()

    return ToolReturn(
        return_value='Plan Created',
        metadata=[
            StateSnapshotEvent(
                type=EventType.STATE_SNAPSHOT,
                snapshot=state_dict,
            ),
        ],
    )


async def update_plan_step(
    ctx: RunContext[StateDeps[AgentState]],
    index: int,
    description: str | None = None,
    status: StepStatus | None = None
) -> ToolReturn:
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

    if not ctx.deps.state.steps or index >= len(ctx.deps.state.steps):
        error_msg = f"Step at index {index} does not exist. Current steps count: {len(ctx.deps.state.steps)}"
        raise ValueError(error_msg)

    if description is not None:
        ctx.deps.state.steps[index].description = description
    if status is not None:
        ctx.deps.state.steps[index].status = status

    state_dict = ctx.deps.state.model_dump()

    return ToolReturn(
        return_value='Plan Step Updated',
        metadata=[
            StateSnapshotEvent(
                type=EventType.STATE_SNAPSHOT,
                snapshot=state_dict,
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
    ctx: RunContext[StateDeps[AgentState]], 
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
        raise ValueError(error_msg)
    
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
        
        for idx, image in enumerate(images_list):
            if isinstance(image, BinaryImage):
                logger.info("Uploading image %d/%d to Firebase Storage...", idx + 1, len(images_list))
                
                # Get the binary data from BinaryImage
                image_data = image.data
                
                # Determine content type from media type
                content_type = image.media_type or "image/png"
                
                # Upload to Firebase Storage in 'generations' folder
                url = await upload_binary_image_to_storage(
                    image_data,
                    folder="generations",
                    content_type=content_type
                )
                
                if url:
                    uploaded_urls.append(url)
                    logger.info("Uploaded: %s", url)
                else:
                    logger.warning("Failed to upload image %d", idx + 1)
            else:
                logger.warning("Unexpected image type: %s", type(image))
        
        if not uploaded_urls:
            return []
        
        return uploaded_urls
        
    except Exception as e:
        logger.exception("Image generation failed: %s", e)
        raise


async def web_search(ctx: RunContext[StateDeps[AgentState]], prompt: str) -> str:
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
        raise ValueError(error_msg)
    
    try:
        result = await aux_agent.run(prompt)
        return result.response.text
    except Exception as e:
        logger.exception("Web search failed: %s", e)
        raise


async def code_execution(ctx: RunContext[StateDeps[AgentState]], prompt: str) -> str:
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
        raise ValueError(error_msg)
    
    try:
        result = await aux_agent.run(f"Execute this code and return the result: {prompt}")
        return result.response.text
    except Exception as e:
        logger.exception("Code execution failed: %s", e)
        raise


async def url_context(ctx: RunContext[StateDeps[AgentState]], urls: list[str]) -> str:
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
        raise ValueError(error_msg)
    
    try:
        # Format URLs as a prompt
        urls_text = "\n".join(urls)
        result = await aux_agent.run(f"Load content from these URLs:\n{urls_text}")
        return result.response.text
    except Exception as e:
        logger.exception("URL context failed: %s", e)
        raise


# ========== Tool Registry ==========
# Maps tool keys to their function implementations

BACKEND_TOOLS = {
    'create_plan': create_plan,
    'update_plan_step': update_plan_step,
    'generate_images': generate_images,
    'web_search': web_search,
    'code_execution': code_execution,
    'url_context': url_context,
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
