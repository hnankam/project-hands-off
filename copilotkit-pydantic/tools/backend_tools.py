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
from ag_ui.core import EventType, StateSnapshotEvent, StateDeltaEvent, CustomEvent, RunAgentInput, UserMessage

from core.models import AgentState, Step, StepStatus

from pydantic_ai import ModelSettings
from core.models import JSONPatchOp
from config import logger

# Import Firebase Storage utility
from utils.firebase_storage import upload_binary_image_to_storage

# Import auxiliary agent factory
from tools.auxiliary_agents import get_auxiliary_agent

# Import multi-agent graph
from tools.multi_agent_graph import run_multi_agent_graph, GraphDeps, QueryState

import os
import uuid

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


# ========== Multi-Agent Graph Tools ==========

async def run_graph(
    ctx: RunContext[StateDeps[AgentState]], 
    query: str,
    max_iterations: int = 5
) -> ToolReturn:
    """Run a multi-agent graph to process complex queries.
    
    This tool orchestrates multiple specialized agents (image generation, web search,
    code execution) to handle complex, multi-step queries. The graph uses an orchestrator
    agent to analyze the query and route it to the appropriate worker agents.
    
    State updates are sent via StateSnapshotEvent, using the shared AgentState.graph field.
    This allows the frontend to render graph progress alongside task progress.
    
    Use cases:
    - Complex queries requiring multiple steps (e.g., "Search for X and create an image of it")
    - Queries that need specialized processing (calculations, image generation, web search)
    - Multi-modal tasks that combine different capabilities
    
    Args:
        ctx: The run context with agent state and context
        query: The user query to process through the multi-agent graph
        max_iterations: Maximum number of orchestrator iterations (default: 5)
        
    Returns:
        ToolReturn with the final result and StateSnapshotEvent for state sync
        
    Example:
        run_graph(ctx, "Search for the latest SpaceX launch and create an image visualizing it")
    """
    logger.info(f"🚀 run_graph tool invoked with query: {query[:100]}...")
    
    # Get context from deps
    deps = ctx.deps
    send_stream = getattr(deps, 'send_stream', None)
    adapter = getattr(deps, 'adapter', None)
    
    # Debug logging
    logger.info(f"   [run_graph] deps type: {type(deps).__name__}")
    logger.info(f"   [run_graph] send_stream available: {send_stream is not None}")
    logger.info(f"   [run_graph] adapter available: {adapter is not None}")
    
    # Check if there's existing graph state in "waiting" status (e.g., after confirmation)
    existing_graph = ctx.deps.state.graph
    
    # Debug logging to understand graph state
    logger.info(f"   [run_graph] Checking existing graph state:")
    logger.info(f"   [run_graph]   - graph exists: {existing_graph is not None}")
    if existing_graph:
        logger.info(f"   [run_graph]   - status: {getattr(existing_graph, 'status', 'NO STATUS')}")
        logger.info(f"   [run_graph]   - execution_history: {getattr(existing_graph, 'execution_history', [])}")
        logger.info(f"   [run_graph]   - planned_steps: {getattr(existing_graph, 'planned_steps', [])}")
    
    is_resuming = (
        existing_graph and 
        hasattr(existing_graph, 'status') and 
        existing_graph.status == 'waiting' and
        existing_graph.execution_history and
        len(existing_graph.execution_history) > 0
    )
    
    if is_resuming:
        logger.info(f"   [run_graph] RESUMING from waiting state")
        logger.info(f"   [run_graph] Execution history: {existing_graph.execution_history}")
        logger.info(f"   [run_graph] Planned steps: {existing_graph.planned_steps}")
        
        # Update only what's needed to continue
        ctx.deps.state.graph.should_continue = True
        ctx.deps.state.graph.status = 'running'
        
        # Clear the deferred_tool_requests since we're resuming
        if hasattr(ctx.deps.state.graph, 'deferred_tool_requests'):
            ctx.deps.state.graph.deferred_tool_requests = None
    else:
        logger.info(f"   [run_graph] Starting NEW graph execution")
        
        # Initialize the graph state in the shared AgentState (only for NEW executions)
        ctx.deps.state.graph.query = query
        ctx.deps.state.graph.original_query = query
        ctx.deps.state.graph.max_iterations = max_iterations
        ctx.deps.state.graph.iteration_count = 0
        ctx.deps.state.graph.execution_history = []
        ctx.deps.state.graph.intermediate_results = {}
        ctx.deps.state.graph.streaming_text = {}  # Track streaming text per node
        ctx.deps.state.graph.prompts = {}  # Track prompts sent to each node
        ctx.deps.state.graph.tool_calls = {}  # Track tool calls per node
        ctx.deps.state.graph.errors = []
        ctx.deps.state.graph.result = ""
        ctx.deps.state.graph.should_continue = True
        ctx.deps.state.graph.mermaid_diagram = ""  # Will be populated by run_multi_agent_graph
        ctx.deps.state.graph.planned_steps = []
        ctx.deps.state.graph.status = 'running'
    
    # Create RunAgentInput from adapter or create a new one
    if adapter and hasattr(adapter, 'run_input'):
        run_input = adapter.run_input
    else:
        # Create a minimal RunAgentInput
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
    
    try:
        # Extract usage tracking context from deps if available
        session_id = getattr(deps, 'session_id', None)
        user_id = getattr(deps, 'user_id', None)
        organization_id = getattr(deps, 'organization_id', None)
        team_id = getattr(deps, 'team_id', None)
        auth_session_id = getattr(deps, 'auth_session_id', None)
        broadcast_func = getattr(deps, 'broadcast_func', None)
        # Database UUIDs for usage tracking
        agent_id = getattr(deps, 'agent_id', None)
        model_id = getattr(deps, 'model_id', None)
        
        # Run the multi-agent graph, passing the model from context (REQUIRED)
        # Note: The orchestrator uses its built-in sub-agents (web_search_step, code_execution_step,
        # image_generation_step, result_aggregator_step) instead of external tools.
        result = await run_multi_agent_graph(
            query=query,
            orchestrator_model=ctx.model,  # Use model from RunContext (never create new)
            run_input=run_input,
            send_stream=send_stream,
            max_iterations=max_iterations,
            shared_state=ctx.deps.state,  # Pass shared state for updates
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
        
        # Update the shared state with the result
        ctx.deps.state.graph.result = result
        
        logger.info(f"✅ run_graph completed successfully")
        
        # NOTE: Do NOT send StateSnapshotEvent here!
        # The graph already sends GraphAgentState format during execution.
        # Sending AgentState format here would overwrite the graph progress
        # with { steps: [], graph: {...} } which causes the UI to hide progress.
        # The final GraphAgentState is sent by the finalize_result step.
        
        return ToolReturn(
            return_value=result,
        )
        
    except Exception as e:
        error_msg = f"Multi-agent graph execution failed: {str(e)}"
        logger.exception(error_msg)
        
        # Update state with error
        ctx.deps.state.graph.errors.append({
            "node": "run_graph",
            "error": str(e),
            "timestamp": ""
        })
        
        # On error, we also don't send StateSnapshotEvent to avoid format conflicts
        # The graph's error state is already sent during execution
        
        return ToolReturn(
            return_value=error_msg,
        )


# ========== Tool Registry ==========
# Maps tool keys to their function implementations

BACKEND_TOOLS = {
    'create_plan': create_plan,
    'update_plan_step': update_plan_step,
    'generate_images': generate_images,
    'web_search': web_search,
    'code_execution': code_execution,
    'url_context': url_context,
    'run_graph': run_graph,
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
