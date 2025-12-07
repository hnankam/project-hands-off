"""Worker step implementations for multi-agent graph.

This module contains the step implementations for worker agents:
- ImageGeneration
- WebSearch  
- CodeExecution
- ResultAggregator

Uses a common base pattern to eliminate code duplication.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Awaitable, Callable, TYPE_CHECKING, Union
import uuid

from pydantic_ai import Agent
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE, AGUIAdapter
from pydantic_ai.messages import BinaryImage
from ag_ui.core import RunAgentInput, UserMessage

from config import logger
from utils.firebase_storage import upload_binary_image_to_storage
from services.usage_tracker import create_usage_tracking_callback

from .types import (
    QueryState,
    GraphDeps,
    ActionType,
    WorkerResult,
    CodeExecutionOutput,
)
from .state import send_graph_state_snapshot, build_context_with_previous_results

if TYPE_CHECKING:
    from .events import process_sub_agent_events


# ========== Helper Functions ==========

def create_sub_agent_run_input(parent_run_input: RunAgentInput, query: str) -> RunAgentInput:
    """Create a new RunAgentInput for worker sub-agents without state or tools.
    
    Worker sub-agents use their own built-in tools (WebSearchTool, ImageGenerationTool, etc.),
    so we create a clean run_input without any parent tools.
    
    Args:
        parent_run_input: The parent's RunAgentInput (for thread_id only)
        query: The query/prompt for the sub-agent
        
    Returns:
        A new RunAgentInput suitable for worker sub-agents
    """
    return RunAgentInput(
        thread_id=parent_run_input.thread_id,
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


def create_orchestrator_run_input(parent_run_input: RunAgentInput, query: str) -> RunAgentInput:
    """Create a new RunAgentInput for the orchestrator that inherits parent tools.
    
    Unlike worker sub-agents, the orchestrator should have access to frontend tools.
    
    Args:
        parent_run_input: The parent's RunAgentInput with tools and context
        query: The query/prompt for the orchestrator
        
    Returns:
        A new RunAgentInput that inherits parent tools and context
    """
    return RunAgentInput(
        thread_id=parent_run_input.thread_id,
        run_id=uuid.uuid4().hex,
        messages=[
            UserMessage(
                id=f'msg_{uuid.uuid4().hex[:8]}',
                content=query,
            )
        ],
        state={},
        context=parent_run_input.context or [],
        tools=parent_run_input.tools or [],
        forwarded_props=parent_run_input.forwarded_props,
    )


def create_sub_agent_usage_callback(
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
    final_result_holder = [None]
    
    def capture_result(result):
        """Callback to capture the final result."""
        final_result_holder[0] = result
    
    # Check if we have usage tracking context
    if not deps.session_id or not deps.broadcast_func:
        return capture_result, final_result_holder
    
    # Create usage tracking callback
    usage_callback = create_usage_tracking_callback(
        session_id=deps.session_id,
        agent_id=deps.agent_id,
        model_id=deps.model_id,
        agent_label=f"graph:{agent_label}",
        model_label=model_label,
        broadcast_func=deps.broadcast_func,
        auth_session_id=deps.auth_session_id,
        user_id=deps.user_id,
        organization_id=deps.organization_id,
        team_id=deps.team_id,
    )
    
    async def combined_callback(result):
        """Callback that captures result AND tracks usage."""
        final_result_holder[0] = result
        try:
            await usage_callback(result)
        except Exception as e:
            logger.warning(f"Failed to track usage for {agent_label}: {e}")
    
    return combined_callback, final_result_holder


def calculate_run_index(execution_history: list[str], node_name: str) -> int:
    """Calculate the run index for a node (0 for first run, 1 for second, etc.)."""
    return len([
        h for h in execution_history 
        if h == node_name or h.startswith(f"{node_name}:")
    ])


# ========== Common Worker Step Logic ==========

async def run_worker_step(
    state: QueryState,
    deps: GraphDeps,
    node_name: str,
    agent: Agent,
    model_label: str,
    result_extractor: Callable[[Any, QueryState], Union[str, Awaitable[str]]] | None = None,
    prompt_builder: Callable[[QueryState], str] | None = None,
) -> WorkerResult:
    """Common implementation for all worker steps.
    
    This function encapsulates the shared logic for all worker steps:
    1. Calculate run index and indexed key
    2. Append to execution history
    3. Send initial state snapshot
    4. Build context with previous results
    5. Create sub-agent run input and adapter
    6. Process events and capture streaming text
    7. Extract result
    8. Store in intermediate results
    9. Send completion snapshot
    10. Return continue/end/error
    
    Args:
        state: Current QueryState
        deps: GraphDeps with streams and shared state
        node_name: Name of the node (e.g., "WebSearch")
        agent: The agent to run
        model_label: Model label for usage tracking
        result_extractor: Optional custom function to extract result from agent output
        prompt_builder: Optional custom function to build prompt (default uses task_prompt)
        
    Returns:
        WorkerResult ("continue", "end", or "error")
    """
    # Import here to avoid circular dependency
    from .events import process_sub_agent_events
    
    logger.info(f"🔄 {node_name} processing...")
    
    # Calculate run index BEFORE appending to history
    run_index = calculate_run_index(state.execution_history, node_name)
    indexed_key = f"{node_name}:{run_index}"
    
    # Append indexed key to preserve unique results for each run
    state.execution_history.append(indexed_key)
    
    send_stream = deps.send_stream
    shared_state = deps.shared_state
    
    # Send state snapshot - step started
    await send_graph_state_snapshot(send_stream, state, node_name, "in_progress", shared_state)
    
    try:
        # Build the prompt - use custom builder or default
        if prompt_builder:
            task_prompt = prompt_builder(state)
        else:
            task_prompt = state.current_task_prompt or state.query
        
        # Build context with previous results
        context_with_results = build_context_with_previous_results(state, task_prompt)
        
        # Create a new RunAgentInput for the sub-agent
        sub_run_input = create_sub_agent_run_input(
            deps.ag_ui_adapter.run_input,
            context_with_results
        )
        
        # Create a new AGUIAdapter instance for this specific run
        adapter = AGUIAdapter(
            agent=agent,
            run_input=sub_run_input,
            accept=SSE_CONTENT_TYPE
        )
        
        # Create usage tracking callback
        on_complete, result_holder = create_sub_agent_usage_callback(
            deps, node_name, model_label
        )
        
        # Run the agent and capture streaming text + tool calls
        event_stream = adapter.run_stream(on_complete=on_complete)
        
        # Process all events
        event_count = await process_sub_agent_events(
            event_stream, state, node_name, send_stream, shared_state,
            prompt=task_prompt, run_index=run_index
        )
        
        logger.info(f"   [{node_name}] Processed {event_count} events")
        
        # Log streaming text for debugging
        streaming_text = state.streaming_text.get(indexed_key, state.streaming_text.get(node_name, ""))
        has_think_tag = '<think' in streaming_text.lower()
        logger.debug(f"   [{node_name}] Streaming text: {len(streaming_text)} chars, has <think>: {has_think_tag}")
        
        # Extract result - use custom extractor or default
        final_result = result_holder[0]
        if result_extractor:
            # Check if extractor is async (coroutine function) or sync
            if asyncio.iscoroutinefunction(result_extractor):
                node_result = await result_extractor(final_result, state)
            else:
                node_result = result_extractor(final_result, state)
        else:
            node_result = _default_result_extractor(final_result, node_name)
        
        # Store with indexed key and non-indexed for backwards compatibility
        state.intermediate_results[indexed_key] = str(node_result)
        state.intermediate_results[node_name] = str(node_result)
        state.result = str(node_result)
        
        logger.info(f"   [{node_name}] ✓ Complete")
        
        # Send state snapshot - step completed
        await send_graph_state_snapshot(send_stream, state, node_name, "completed", shared_state)
        
        return "continue" if state.should_continue else "end"
        
    except Exception as e:
        state.errors.append({
            "node": node_name,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        })
        logger.exception(f"{node_name} error: {e}")
        
        # Send state snapshot - step error
        await send_graph_state_snapshot(send_stream, state, node_name, "error", shared_state)
        
        return "error"


def _default_result_extractor(final_result: Any, node_name: str) -> str:
    """Default result extraction logic."""
    if final_result:
        raw_output = final_result.output if hasattr(final_result, 'output') else getattr(final_result, 'data', None)
        return str(raw_output) if raw_output else f"{node_name} completed"
    return f"{node_name} completed"


# ========== Image Generation Specific Logic ==========

async def extract_image_result(final_result: Any, state: QueryState) -> str:
    """Extract and upload images from image generation result."""
    uploaded_urls = []
    
    if final_result and hasattr(final_result, 'response') and final_result.response:
        images = None
        if hasattr(final_result.response, 'images'):
            images_attr = getattr(final_result.response, 'images')
            if callable(images_attr):
                images = images_attr()
            else:
                images = images_attr
        
        if images:
            images_list = list(images) if hasattr(images, '__iter__') and not isinstance(images, (str, bytes)) else [images]
            logger.info(f"   [ImageGeneration] Found {len(images_list)} images to upload")
            
            for idx, image in enumerate(images_list):
                if isinstance(image, BinaryImage):
                    logger.info(f"   [ImageGeneration] Uploading image {idx + 1}/{len(images_list)}...")
                    
                    image_data = image.data
                    content_type = image.media_type or "image/png"
                    
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
    
    # Build the result message with image URLs only
    if uploaded_urls:
        return "\n\n".join([f"![Generated Image]({url})" for url in uploaded_urls])
    elif final_result:
        try:
            num_images = len(final_result.response.images) if final_result.response.images else "No"
            return f"{num_images} image(s) created"
        except Exception:
            return str(final_result.output) if hasattr(final_result, 'output') else "Image generation completed"
    return "Image generation completed"


# ========== Code Execution Specific Logic ==========

def extract_code_result(final_result: Any, state: QueryState) -> str:
    """Extract result from code execution, handling structured output."""
    indexed_key = f"CodeExecution:{calculate_run_index(state.execution_history, 'CodeExecution') - 1}"
    
    if final_result:
        raw_output = final_result.output if hasattr(final_result, 'output') else getattr(final_result, 'data', None)
        
        # Handle CodeExecutionOutput structured response
        if isinstance(raw_output, CodeExecutionOutput):
            return raw_output.model_dump_json()
        elif hasattr(raw_output, 'language') and hasattr(raw_output, 'code'):
            return f'{{"language": "{getattr(raw_output, "language", "python")}", "code": {repr(getattr(raw_output, "code", ""))}, "output": {repr(getattr(raw_output, "output", ""))}}}'
        elif raw_output:
            return str(raw_output)
    
    # Fallback to streaming text if no structured output
    streaming_text = state.streaming_text.get(indexed_key, state.streaming_text.get("CodeExecution", ""))
    if streaming_text:
        return streaming_text
    
    return "Code execution completed but no output available"


# ========== Result Aggregator Specific Logic ==========

def build_aggregator_prompt(state: QueryState) -> str:
    """Build the context prompt for result aggregator with all intermediate results."""
    context = f"Original Query: {state.original_query}\n\nResults:\n"
    for node, result in state.intermediate_results.items():
        context += f"\n{node}: {result}\n"
    return context

