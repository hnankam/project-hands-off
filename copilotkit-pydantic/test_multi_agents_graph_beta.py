from __future__ import annotations

from typing import Literal
from dataclasses import dataclass, field
from datetime import datetime
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai import ImageGenerationTool, WebSearchTool, CodeExecutionTool
from pydantic_graph.beta import GraphBuilder, StepContext, TypeExpression
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider

import asyncio
import uuid
from ag_ui.core import CustomEvent, RunAgentInput, UserMessage
from ag_ui.encoder import EventEncoder
from anyio import create_memory_object_stream, create_task_group
from anyio.streams.memory import MemoryObjectSendStream
from pydantic_ai import Agent
from pydantic_ai._run_context import RunContext
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE, run_ag_ui, AGUIAdapter

# Google provider and models
google_provider = GoogleProvider(api_key='AIzaSyAQjPdaMaJzMyS7Eco1DtKT0ueutPQjXGs')
image_generation_model = GoogleModel(model_name='gemini-2.5-flash-image', provider=google_provider)
general_model = GoogleModel(model_name='gemini-2.5-flash', provider=google_provider)


# Define action types for routing
ActionType = Literal["image_generation", "web_search", "code_execution", "result_aggregator", "end"]
WorkerResult = Literal["continue", "end", "error"]

# Define the routing decision structure
class RoutingDecision(BaseModel):
    """Structured output for the orchestrator's routing decision."""
    should_continue: bool  # Whether to continue processing or end
    next_task_type: str  # "image_generation", "web_search", "code_execution", "result_aggregator", or "end"
    reasoning: str  # Explanation of why this decision was made
    confidence: float  # Confidence score between 0 and 1
    needs_followup: bool  # REQUIRED: Whether additional processing is needed after this task (True/False)


# Define error recovery decision structure
class ErrorRecoveryDecision(BaseModel):
    """Structured output for error handler's recovery decision."""
    should_retry: bool  # Whether to retry the failed operation
    should_try_alternative: bool  # Whether to try an alternative approach
    alternative_task_type: str = ""  # Alternative task type if should_try_alternative is True
    should_end: bool  # Whether to end execution due to unrecoverable error
    reasoning: str  # Explanation of the recovery decision
    error_message: str  # User-friendly error message


# Create specialized agents
orchestrator_agent = Agent(
    model=general_model,
    output_type=RoutingDecision,
    system_prompt=(
        "You are an intelligent query routing orchestrator. Analyze the current context and determine "
        "the next action. You have access to four types of specialized agents:\n\n"
        "1. IMAGE_GENERATION: For creating, generating, or drawing images, pictures, or visual content\n"
        "2. WEB_SEARCH: For finding information online, looking up facts, news, or current events\n"
        "3. CODE_EXECUTION: For performing calculations, running code, solving math problems\n"
        "4. RESULT_AGGREGATOR: For synthesizing results from multiple previous steps into a final answer\n\n"
        "IMPORTANT: You MUST explicitly set the needs_followup field for EVERY routing decision:\n"
        "- needs_followup=True: If the current task is a step in a multi-step workflow (e.g., search then generate image)\n"
        "- needs_followup=False: If this is the final task that completes the user's request\n\n"
        "Decision Guidelines:\n"
        "- What tasks have already been executed (check execution_history)\n"
        "- Whether the current result satisfies the original query\n"
        "- Whether additional processing is needed (e.g., search for info then generate an image)\n"
        "- If multiple tasks have been completed, consider using RESULT_AGGREGATOR to synthesize results\n"
        "- Set should_continue=True if more work is needed, False if the task is complete\n"
        "- Set next_task_type to the agent type needed, or 'end' if done\n\n"
        "Examples:\n"
        "- Simple query 'Calculate factorial of 15' → needs_followup=False (single task)\n"
        "- Complex query 'Search for SpaceX launch and create image' → First step needs_followup=True, second step needs_followup=False\n\n"
        "Analyze the query semantically and return your routing decision with clear reasoning."
    ),
)

image_generation_agent = Agent(
    model=image_generation_model,
    builtin_tools=[ImageGenerationTool()],
    system_prompt=(
        "You are an image generation assistant. Based on the user's prompt, "
        "generate an image based on the description provided. "
        "Use the image generation tool to create the image."
    ),
)

web_search_agent = Agent(
    model=general_model,
    builtin_tools=[WebSearchTool()],
    system_prompt="You are a web search assistant. Search the web for relevant information.",
)

code_execution_agent = Agent(
    model=general_model,
    builtin_tools=[CodeExecutionTool()],
    output_type=str,
    system_prompt="You are a code execution assistant. Execute code to solve problems.",
)

result_aggregator_agent = Agent(
    model=general_model,
    output_type=str,
    system_prompt=(
        "You are a result aggregator. Your job is to synthesize and summarize results from multiple "
        "specialized agents into a coherent, comprehensive final response. Consider all intermediate results "
        "and the original user query to create a complete answer that addresses what the user asked for."
    ),
)

error_handler_agent = Agent(
    model=general_model,
    output_type=ErrorRecoveryDecision,
    system_prompt=(
        "You are an intelligent error recovery agent. When an agent fails, analyze the error and determine "
        "the best recovery strategy. You have several options:\n\n"
        "1. RETRY: Retry the same operation (if the error seems transient)\n"
        "2. ALTERNATIVE: Try a different approach (e.g., if image generation fails, maybe describe it in text)\n"
        "3. END: End execution with a clear error message (if error is unrecoverable)\n\n"
        "Consider:\n"
        "- The type of error that occurred\n"
        "- How many retries have already been attempted\n"
        "- Whether there's a reasonable alternative approach\n"
        "- The original user's intent\n"
        "- Previous successful steps (check intermediate_results)\n\n"
        "Provide a clear, actionable recovery decision with user-friendly error messaging."
    ),
)


# Define the graph dependencies
@dataclass
class GraphDeps:
    """Dependencies passed to all graph nodes."""
    send_stream: MemoryObjectSendStream[str] | None = None
    ag_ui_adapter: AGUIAdapter | None = None


# Define the graph state to hold query context
@dataclass
class QueryState:
    """State maintained throughout the graph execution."""
    query: str
    original_query: str = ""  # Store the original user query
    result: str = ""
    query_type: str = ""  # "image_generation", "web_search", "code_execution", or "unknown"
    execution_history: list[str] = field(default_factory=list)  # Track which nodes have been executed
    intermediate_results: dict[str, str] = field(default_factory=dict)  # Track results from each node
    errors: list[dict[str, str]] = field(default_factory=list)  # Track errors: [{node, error, timestamp}]
    last_error_node: str = ""  # Track which node last encountered an error
    retry_count: int = 0  # Track retry attempts for error recovery
    max_retries: int = 2  # Maximum retry attempts
    iteration_count: int = 0  # Prevent infinite loops
    max_iterations: int = 5  # Maximum number of routing iterations
    should_continue: bool = True  # Control flag for orchestrator loop
    next_action: str = ""  # Next action to take


# Create the graph builder
def create_multi_agent_graph():
    """Create a multi-agent graph using the beta API builder pattern."""
    
    g = GraphBuilder(
        state_type=QueryState,
        input_type=str,  # User query string
        output_type=str,  # Final result string
        deps_type=GraphDeps,  # Graph dependencies (stream and AG-UI adapter)
    )
    
    # ==================== ORCHESTRATOR STEP ====================
    @g.step
    async def orchestrator_step(ctx: StepContext[QueryState, None, None | WorkerResult]) -> ActionType:
        """Orchestrator that analyzes context and determines next action."""
        # Initialize original query
        if not ctx.state.original_query:
            ctx.state.original_query = ctx.state.query
        
        # Increment iteration count
        ctx.state.iteration_count += 1
        
        print(f"\n{'='*60}")
        print(f"🤖 Orchestrator (Iteration {ctx.state.iteration_count})")
        print(f"{'='*60}")
        print(f"Query: {ctx.state.query}")
        if ctx.state.execution_history:
            print(f"History: {' → '.join(ctx.state.execution_history)}")
        
        # Send orchestrator start event
        if ctx.deps and ctx.deps.send_stream:
            encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
            await ctx.deps.send_stream.send(
                encoder.encode(
                    CustomEvent(
                        name='orchestrator_start',
                        value={
                            'iteration': ctx.state.iteration_count,
                            'query': ctx.state.query,
                            'history': ctx.state.execution_history
                        }
                    )
                )
            )
        
        # Check iteration limit
        if ctx.state.iteration_count > ctx.state.max_iterations:
            print(f"⚠️  Max iterations reached")
            if ctx.deps and ctx.deps.send_stream:
                encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
                await ctx.deps.send_stream.send(
                    encoder.encode(
                        CustomEvent(
                            name='max_iterations_reached',
                            value={'max_iterations': ctx.state.max_iterations}
                        )
                    )
                )
            return "end"
        
        # Build context
        context = f"Original Query: {ctx.state.original_query}\n"
        if ctx.state.execution_history:
            context += f"Executed: {', '.join(ctx.state.execution_history)}\n"
        if ctx.state.intermediate_results:
            context += "\nResults:\n"
            for node, result in ctx.state.intermediate_results.items():
                context += f"  - {node}: {result[:100]}...\n"
        
        # Get decision
        try:
            result = await orchestrator_agent.run(context)
            decision: RoutingDecision = result.output
            
            print(f"\n📊 Decision: {decision.next_task_type.upper()}")
            print(f"   Reasoning: {decision.reasoning[:100]}...")
            
            # Send decision event
            if ctx.deps and ctx.deps.send_stream:
                encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
                await ctx.deps.send_stream.send(
                    encoder.encode(
                        CustomEvent(
                            name='orchestrator_decision',
                            value={
                                'next_task': decision.next_task_type,
                                'should_continue': decision.should_continue,
                                'needs_followup': decision.needs_followup,
                                'confidence': decision.confidence,
                                'reasoning': decision.reasoning
                            }
                        )
                    )
                )
            
            # Store for worker nodes
            ctx.state.should_continue = decision.needs_followup
            
            return decision.next_task_type.lower()  # type: ignore
            
        except Exception as e:
            print(f"✗ Orchestrator failed: {e}")
            if ctx.deps and ctx.deps.send_stream:
                encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
                await ctx.deps.send_stream.send(
                    encoder.encode(
                        CustomEvent(
                            name='orchestrator_error',
                            value={'error': str(e)}
                        )
                    )
                )
            return "end"
    
    # ==================== WORKER STEPS ====================
    @g.step
    async def image_generation_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Generate an image using AGUIAdapter for streaming."""
        print(f"🎨 ImageGeneration processing...")
        ctx.state.execution_history.append("ImageGeneration")
        
        # Send start event
        if ctx.deps and ctx.deps.send_stream:
            encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
            await ctx.deps.send_stream.send(
                encoder.encode(
                    CustomEvent(
                        name='image_generation_start',
                        value={'query': ctx.state.query}
                    )
                )
            )
        
        try:
            # Create a new AGUIAdapter instance for this specific run
            adapter = AGUIAdapter(
                agent=image_generation_agent,
                run_input=ctx.deps.ag_ui_adapter.run_input,
                accept=SSE_CONTENT_TYPE
            )
            
            # Variable to capture the final result
            final_result = None
            
            def on_complete(result):
                """Callback to capture the final result."""
                nonlocal final_result
                final_result = result
            
            # Run the agent and stream events
            event_stream = adapter.run_stream(on_complete=on_complete)
            
            # Stream all events through the deps if available
            if ctx.deps and ctx.deps.send_stream:
                async for event in event_stream:
                    await ctx.deps.send_stream.send(event)
            else:
                async for _ in event_stream:
                    pass
            
            # Extract result from the completed run
            if final_result:
                num_images = len(final_result.response.images) if final_result.response.images else 0
                node_result = f"✅ Image: {num_images} image(s) created"
            else:
                node_result = "Image generation completed"
            
            ctx.state.intermediate_results["ImageGeneration"] = node_result
            ctx.state.result = node_result
            print(f"   ✓ Complete {num_images} image(s) created")
            
            # Send success event
            if ctx.deps and ctx.deps.send_stream:
                encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
                await ctx.deps.send_stream.send(
                    encoder.encode(
                        CustomEvent(
                            name='image_generation_complete',
                            value={
                                'result': node_result,
                                'should_continue': ctx.state.should_continue
                            }
                        )
                    )
                )
            
            return "continue" if ctx.state.should_continue else "end"
        except Exception as e:
            ctx.state.errors.append({"node": "ImageGeneration", "error": str(e), "timestamp": datetime.now().isoformat()})
            print(f"   ✗ Error: {e}")
            
            # Send error event
            if ctx.deps and ctx.deps.send_stream:
                encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
                await ctx.deps.send_stream.send(
                    encoder.encode(
                        CustomEvent(
                            name='image_generation_error',
                            value={'error': str(e)}
                        )
                    )
                )
            
            return "error"
    
    @g.step
    async def web_search_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Perform web search using AGUIAdapter for streaming."""
        print(f"🔍 WebSearch processing...")
        ctx.state.execution_history.append("WebSearch")
        
        # Send start event
        if ctx.deps and ctx.deps.send_stream:
            encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
            await ctx.deps.send_stream.send(
                encoder.encode(
                    CustomEvent(
                        name='web_search_start',
                        value={'query': ctx.state.query}
                    )
                )
            )
        
        try:
            # Create a new AGUIAdapter instance for this specific run
            adapter = AGUIAdapter(
                agent=web_search_agent,
                run_input=ctx.deps.ag_ui_adapter.run_input,
                accept=SSE_CONTENT_TYPE
            )
            
            # Variable to capture the final result
            final_result = None
            
            def on_complete(result):
                """Callback to capture the final result."""
                nonlocal final_result
                final_result = result
            
            # Run the agent and stream events
            event_stream = adapter.run_stream(on_complete=on_complete)
            
            # Stream all events through the deps if available
            if ctx.deps and ctx.deps.send_stream:
                async for event in event_stream:
                    await ctx.deps.send_stream.send(event)
            else:
                async for _ in event_stream:
                    pass
            
            # Extract result from the completed run
            if final_result:
                node_result = final_result.output if hasattr(final_result, 'output') else str(final_result.data)
            else:
                node_result = "Web search completed"
            
            ctx.state.intermediate_results["WebSearch"] = node_result
            ctx.state.result = node_result
            print(f"   ✓ Complete")
            
            # Send success event
            if ctx.deps and ctx.deps.send_stream:
                encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
                await ctx.deps.send_stream.send(
                    encoder.encode(
                        CustomEvent(
                            name='web_search_complete',
                            value={
                                'result': node_result[:200] if len(node_result) > 200 else node_result,
                                'should_continue': ctx.state.should_continue
                            }
                        )
                    )
                )
            
            return "continue" if ctx.state.should_continue else "end"
        except Exception as e:
            ctx.state.errors.append({"node": "WebSearch", "error": str(e), "timestamp": datetime.now().isoformat()})
            print(f"   ✗ Error: {e}")
            
            # Send error event
            if ctx.deps and ctx.deps.send_stream:
                encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
                await ctx.deps.send_stream.send(
                    encoder.encode(
                        CustomEvent(
                            name='web_search_error',
                            value={'error': str(e)}
                        )
                    )
                )
            
            return "error"
    
    @g.step
    async def code_execution_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Execute code using AGUIAdapter for streaming."""
        print(f"💻 CodeExecution processing...")
        ctx.state.execution_history.append("CodeExecution")
        
        # Send start event
        if ctx.deps and ctx.deps.send_stream:
            encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
            await ctx.deps.send_stream.send(
                encoder.encode(
                    CustomEvent(
                        name='code_execution_start',
                        value={'query': ctx.state.query}
                    )
                )
            )
        
        try:
            
            # Create a new adapter with the code_execution_agent
            adapter = AGUIAdapter(
                agent=code_execution_agent,
                run_input=ctx.deps.ag_ui_adapter.run_input,
                accept=SSE_CONTENT_TYPE
            )
            
            # Variable to capture the final result
            final_result = None
            
            def on_complete(result):
                """Callback to capture the final result."""
                nonlocal final_result
                final_result = result
            
            # Run the agent and stream events
            event_stream = adapter.run_stream(on_complete=on_complete)
            
            # Stream all events through the deps if available
            event_count = 0
            if ctx.deps and ctx.deps.send_stream:
                async for event in event_stream:
                    event_count += 1
                    # Forward the AG-UI event directly to the send stream
                    # The event is already encoded in AG-UI format
                    await ctx.deps.send_stream.send(event)
            else:
                # If no send_stream, still consume the stream
                async for _ in event_stream:
                    event_count += 1

            # Extract result from the completed run
            if final_result:
                node_result = final_result.output
            else:
                node_result = "Code execution completed but no output available"
            
            ctx.state.intermediate_results["CodeExecution"] = node_result
            ctx.state.result = node_result
            print(f"   ✓ Complete")
            
            # Send success event
            if ctx.deps and ctx.deps.send_stream:
                encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
                await ctx.deps.send_stream.send(
                    encoder.encode(
                        CustomEvent(
                            name='code_execution_complete',
                            value={
                                'result': node_result[:200] if len(node_result) > 200 else node_result,
                                'should_continue': ctx.state.should_continue
                            }
                        )
                    )
                )
            
            return "continue" if ctx.state.should_continue else "end"
        except Exception as e:
            ctx.state.errors.append({"node": "CodeExecution", "error": str(e), "timestamp": datetime.now().isoformat()})
            print(f"   ✗ Error: {e}")
            
            # Send error event
            if ctx.deps and ctx.deps.send_stream:
                encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
                await ctx.deps.send_stream.send(
                    encoder.encode(
                        CustomEvent(
                            name='code_execution_error',
                            value={'error': str(e)}
                        )
                    )
                )
            
            return "error"
    
    @g.step
    async def result_aggregator_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Aggregate results using AGUIAdapter for streaming."""
        print(f"📋 ResultAggregator processing...")
        ctx.state.execution_history.append("ResultAggregator")
        
        # Send start event
        if ctx.deps and ctx.deps.send_stream:
            encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
            await ctx.deps.send_stream.send(
                encoder.encode(
                    CustomEvent(
                        name='result_aggregator_start',
                        value={
                            'num_results': len(ctx.state.intermediate_results),
                            'nodes': list(ctx.state.intermediate_results.keys())
                        }
                    )
                )
            )
        
        context = f"Original Query: {ctx.state.original_query}\n\nResults:\n"
        for node, result in ctx.state.intermediate_results.items():
            context += f"\n{node}: {result}\n"
        
        try:
            # Create a new AGUIAdapter instance for this specific run            
            adapter = AGUIAdapter(
                agent=result_aggregator_agent,
                run_input=ctx.deps.ag_ui_adapter.run_input,
                accept=SSE_CONTENT_TYPE
            )
            
            # Variable to capture the final result
            final_result = None
            
            def on_complete(result):
                """Callback to capture the final result."""
                nonlocal final_result
                final_result = result
            
            # Run the agent and stream events
            event_stream = adapter.run_stream(on_complete=on_complete)
            
            # Stream all events through the deps if available
            if ctx.deps and ctx.deps.send_stream:
                async for event in event_stream:
                    await ctx.deps.send_stream.send(event)
            else:
                async for _ in event_stream:
                    pass
            
            # Extract result from the completed run
            if final_result:
                ctx.state.result = final_result.output if hasattr(final_result, 'output') else str(final_result.data)
            else:
                ctx.state.result = "Result aggregation completed"
            
            print(f"   ✓ Complete")
            
            # Send success event
            if ctx.deps and ctx.deps.send_stream:
                encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
                await ctx.deps.send_stream.send(
                    encoder.encode(
                        CustomEvent(
                            name='result_aggregator_complete',
                            value={'result': ctx.state.result}
                        )
                    )
                )
            
            return "end"
        except Exception as e:
            ctx.state.result = f"Aggregation failed: {str(e)}"
            print(f"   ✗ Error: {e}")
            
            # Send error event
            if ctx.deps and ctx.deps.send_stream:
                encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
                await ctx.deps.send_stream.send(
                    encoder.encode(
                        CustomEvent(
                            name='result_aggregator_error',
                            value={'error': str(e)}
                        )
                    )
                )
            
            return "end"
    
    # ==================== FINALIZE STEP ====================
    @g.step
    async def finalize_result(ctx: StepContext[QueryState, None, WorkerResult | ActionType]) -> str:
        """Extract final result from state."""
        print(f"\n{'='*60}")
        print(f"✅ Finalizing result")
        print(f"{'='*60}")
        
        final_result = ctx.state.result if ctx.state.result else "Task completed."
        
        # Add summary
        if ctx.state.execution_history:
            final_result = f"{final_result}\n\n[Executed: {' → '.join(ctx.state.execution_history)}]"
        
        # Send finalize event
        if ctx.deps and ctx.deps.send_stream:
            encoder = EventEncoder(accept=SSE_CONTENT_TYPE)
            await ctx.deps.send_stream.send(
                encoder.encode(
                    CustomEvent(
                        name='graph_finalize',
                        value={
                            'final_result': final_result,
                            'execution_history': ctx.state.execution_history,
                            'iteration_count': ctx.state.iteration_count
                        }
                    )
                )
            )
        
        return final_result
    
    # ==================== BUILD GRAPH WITH DECISION NODES ====================
    # Start -> Orchestrator
    g.add(g.edge_from(g.start_node).to(orchestrator_step))
    
    # Orchestrator -> Decision (route to workers or finalize)
    g.add(
        g.edge_from(orchestrator_step).to(
            g.decision()
            .branch(g.match(TypeExpression[Literal["image_generation"]]).to(image_generation_step))
            .branch(g.match(TypeExpression[Literal["web_search"]]).to(web_search_step))
            .branch(g.match(TypeExpression[Literal["code_execution"]]).to(code_execution_step))
            .branch(g.match(TypeExpression[Literal["result_aggregator"]]).to(result_aggregator_step))
            .branch(g.match(TypeExpression[Literal["end"]]).to(finalize_result))
        )
    )
    
    # Workers -> Decision (continue to orchestrator or finalize)
    for worker_step in [image_generation_step, web_search_step, code_execution_step, result_aggregator_step]:
        g.add(
            g.edge_from(worker_step).to(
                g.decision()
                .branch(g.match(TypeExpression[Literal["continue"]]).to(orchestrator_step))
                .branch(g.match(TypeExpression[Literal["end"]]).to(finalize_result))
                .branch(g.match(TypeExpression[Literal["error"]]).to(finalize_result))  # TODO: Add error handler
            )
        )
    
    # Finalize -> End
    g.add(g.edge_from(finalize_result).to(g.end_node))
    
    return g.build()


async def run_multi_agent_graph_with_ag_ui(run_input: RunAgentInput, send_stream=None):
    """
    Run the multi-agent graph with AG UI event streaming.
    
    Args:
        run_input: RunAgentInput containing thread_id, run_id, messages, etc.
        send_stream: Optional MemoryObjectSendStream for custom event streaming
    
    Returns:
        Final result from the graph execution
    """
    # Create the graph
    multi_agent_graph = create_multi_agent_graph()
    
    # Extract query from the last user message
    query = ""
    if run_input.messages:
        last_message = run_input.messages[-1]
        if hasattr(last_message, 'content'):
            query = last_message.content
    
    if not query:
        query = "No query provided"
    
    print(f"\n{'='*60}")
    print(f"🚀 Running Multi-Agent Graph with AG UI")
    print(f"{'='*60}")
    print(f"Thread ID: {run_input.thread_id}")
    print(f"Run ID: {run_input.run_id}")
    print(f"Query: {query}")
    print(f"{'='*60}\n")
    
    # Initialize encoder if we have a send stream
    encoder = EventEncoder(accept=SSE_CONTENT_TYPE) if send_stream else None
    
    # Send start event
    if send_stream and encoder:
        await send_stream.send(
            encoder.encode(
                CustomEvent(
                    name='graph_start',
                    value={'query': query, 'thread_id': run_input.thread_id}
                )
            )
        )
    
    # Create a dummy agent for the AGUIAdapter
    # The adapter is mainly for protocol handling and can be reused across different agents
    dummy_agent = Agent(model=general_model)
    
    # Create AGUIAdapter instance with the dummy agent
    # This will be used by nodes to stream agent events
    ag_ui_adapter = AGUIAdapter(
        agent=dummy_agent,
        run_input=run_input,
        accept=SSE_CONTENT_TYPE
    )
    
    # Initialize state
    state = QueryState(query=query, max_iterations=5)
    
    # Send state initialization event
    if send_stream and encoder:
        await send_stream.send(
            encoder.encode(
                CustomEvent(
                    name='state_initialized',
                    value={'query': query, 'max_iterations': state.max_iterations}
                )
            )
        )
    
    # Create GraphDeps with both send_stream and ag_ui_adapter
    deps = GraphDeps(send_stream=send_stream, ag_ui_adapter=ag_ui_adapter)
    
    try:
        # Run the graph with GraphDeps
        result = await multi_agent_graph.run(state=state, inputs=query, deps=deps)
        
        # Send final result event
        if send_stream and encoder:
            await send_stream.send(
                encoder.encode(
                    CustomEvent(
                        name='graph_complete',
                        value={'result': result, 'status': 'success'}
                    )
                )
            )
        
        print(f"\n{'='*60}")
        print(f"✅ FINAL RESULT:")
        print(f"{'='*60}")
        print(f"{result}")
        print(f"\n{'='*60}\n")
        
        return result
        
    except Exception as e:
        error_msg = f"Graph execution failed: {str(e)}"
        print(f"\n{'='*60}")
        print(f"❌ ERROR:")
        print(f"{'='*60}")
        print(f"{error_msg}")
        print(f"\n{'='*60}\n")
        
        # Send error event
        if send_stream and encoder:
            await send_stream.send(
                encoder.encode(
                    CustomEvent(
                        name='graph_error',
                        value={'error': error_msg, 'status': 'error'}
                    )
                )
            )
        
        raise


async def run_with_mock_ag_ui_events(query: str):
    """
    Run the multi-agent graph with mock AG UI event streaming.
    Similar to the example code pattern with memory streams.
    
    Args:
        query: The user query to process
    """
    # Create mock AG UI input
    run_input = RunAgentInput(
        thread_id=uuid.uuid4().hex,
        run_id=uuid.uuid4().hex,
        messages=[
            UserMessage(
                id='msg_1',
                content=query,
            )
        ],
        state={},
        context=[],
        tools=[],
        forwarded_props=None,
    )
    
    # Create memory streams for event handling
    send_stream, receive_stream = create_memory_object_stream[str]()
    
    async def run_graph_with_stream(send_stream: MemoryObjectSendStream[str]) -> None:
        """Run the graph and send events to the stream."""
        async with send_stream:
            result = await run_multi_agent_graph_with_ag_ui(run_input, send_stream)
    
    # Run the graph and collect events
    events = []
    async with create_task_group() as tg:
        tg.start_soon(run_graph_with_stream, send_stream)
        async for event in receive_stream:
            print(f"[EVENT] {event}")
            events.append(event)
    
    return events


# Example usage
if __name__ == "__main__":
    import asyncio
    
    async def main():
        # Test 1: Direct graph execution (original pattern)
        print("\n" + "=" * 40)
        print("TEST 1: Direct Graph Execution")
        print("=" * 40)
        
        multi_agent_graph = create_multi_agent_graph()
        
        # Generate mermaid diagram
        print("\n" + "=" * 60)
        print("MULTI-AGENT GRAPH STRUCTURE (Beta API)")
        print("=" * 60)
        mermaid_diagram = multi_agent_graph.render(title='Multi-Agent Graph (Beta)', direction='TB')
        print(mermaid_diagram)
        print("\n")
        
        # Test 2: AG UI event streaming pattern (new pattern)
        print("\n" + "=" * 40)
        print("TEST 2: AG UI Event Streaming Pattern")
        print("=" * 40)
        
        test_queries = [
            # {
            #     "query": "Calculate the factorial of 15",
            #     "description": "Simple code execution task"
            # },
            # {
            #     "query": "Generate an image of a cat sitting on a windowsill. Make any assumptions about the cat's environment.",
            #     "description": "Simple image generation task"
            # },
            # {
            #     "query": "Search the web for the latest news on the latest AI models.",
            #     "description": "Web search task"
            # },
            {
                "query": "Search for the latest SpaceX rocket launch details, then create an image visualizing it and provide a brief description of the launch..",
                "description": "Multi-step: Web search → Image generation"
            },
            # {
            #     "query": "Write a story about the latest election results in Cameroon, using images and various illustrations.",
            #     "description": "Multi-step"
            # },
        ]
        
        for i, test_case in enumerate(test_queries, 1):
            query = test_case["query"]
            description = test_case["description"]
            
            print("\n" + "=" * 40)
            print(f"EXAMPLE {i}: {description}")
            print("=" * 40)
            print(f"Query: {query}")
            
            # Run with mock AG UI events
            events = await run_with_mock_ag_ui_events(query)
            
            print(f"\n{'='*60}")
            print(f"COLLECTED {len(events)} EVENTS")
            print(f"{'='*60}\n")
    
    asyncio.run(main())

