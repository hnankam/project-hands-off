from __future__ import annotations

from dataclasses import dataclass, field
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext, BinaryImage, ImageGenerationTool, WebSearchTool, CodeExecutionTool
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from pydantic_ai import ModelSettings
from pydantic_ai.models.google import GoogleModel, GoogleModelSettings
from pydantic_ai.providers.google import GoogleProvider

# Google provider and models
google_provider = GoogleProvider(api_key='AIzaSyCID3PMug--i65c02xdw_FB-wyVTXJ3wHs')
image_generation_model = GoogleModel(model_name='gemini-2.5-flash-image', provider=google_provider)
general_model = GoogleModel(model_name='gemini-2.5-pro', provider=google_provider)


# Define the routing decision structure
class RoutingDecision(BaseModel):
    """Structured output for the orchestrator's routing decision."""
    should_continue: bool  # Whether to continue processing or end
    next_task_type: str  # "image_generation", "web_search", "code_execution", "result_aggregator", "end", or "unknown"
    reasoning: str  # Explanation of why this decision was made
    confidence: float  # Confidence score between 0 and 1
    needs_followup: bool  # REQUIRED: Whether additional processing is needed after this task (True/False)


# Create the orchestrator agent that analyzes queries
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

# Create specialized agents
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


# Define error recovery decision structure
class ErrorRecoveryDecision(BaseModel):
    """Structured output for error handler's recovery decision."""
    should_retry: bool  # Whether to retry the failed operation
    should_try_alternative: bool  # Whether to try an alternative approach
    alternative_task_type: str = ""  # Alternative task type if should_try_alternative is True
    should_end: bool  # Whether to end execution due to unrecoverable error
    reasoning: str  # Explanation of the recovery decision
    error_message: str  # User-friendly error message


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


# Define the orchestrator node that routes queries
@dataclass
class OrchestratorNode(BaseNode[QueryState, None, str]):
    """Orchestrator that analyzes the query using an LLM and routes to appropriate agent."""
    
    async def run(
        self, ctx: GraphRunContext[QueryState]
    ) -> ImageGenerationNode | WebSearchNode | CodeExecutionNode | ResultAggregatorNode | ErrorHandlerNode | End[str]:
        """Use the orchestrator agent to analyze the query and route to the appropriate node."""
        # Initialize original query if this is the first iteration
        if not ctx.state.original_query:
            ctx.state.original_query = ctx.state.query
        
        # Increment iteration count
        ctx.state.iteration_count += 1
        
        print(f"\n{'='*60}")
        print(f"🤖 Orchestrator Analysis (Iteration {ctx.state.iteration_count})")
        print(f"{'='*60}")
        print(f"Query: {ctx.state.query}")
        if ctx.state.execution_history:
            print(f"Execution History: {' → '.join(ctx.state.execution_history)}")
        if ctx.state.intermediate_results:
            print(f"Intermediate Results:")
            for node, result in ctx.state.intermediate_results.items():
                print(f"   • {node}: {result[:80]}...")
        if ctx.state.result:
            print(f"Current Result: {ctx.state.result[:100]}...")
        
        # Check iteration limit
        if ctx.state.iteration_count > ctx.state.max_iterations:
            ctx.state.result = (
                f"Maximum iteration limit ({ctx.state.max_iterations}) reached. "
                f"Completed tasks: {', '.join(ctx.state.execution_history)}"
            )
            print(f"\n⚠️  Maximum iterations reached. Ending execution.\n")
            return End(ctx.state.result)
        
        # Build context for the orchestrator
        context = f"Original Query: {ctx.state.original_query}\n"
        context += f"Current Query: {ctx.state.query}\n"
        if ctx.state.execution_history:
            context += f"Already Executed: {', '.join(ctx.state.execution_history)}\n"
        if ctx.state.intermediate_results:
            context += "\nIntermediate Results:\n"
            for node, result in ctx.state.intermediate_results.items():
                context += f"  - {node}: {result}\n"
        if ctx.state.result:
            context += f"Current Result: {ctx.state.result}\n"
        
        # Use the orchestrator agent to make an intelligent routing decision
        try:
            result = await orchestrator_agent.run(context)
            decision: RoutingDecision = result.output
            
            print(f"\n📊 Routing Decision:")
            print(f"   Should Continue: {decision.should_continue}")
            print(f"   Next Task: {decision.next_task_type.upper()}")
            print(f"   Confidence: {decision.confidence:.2%}")
            print(f"   Needs Followup: {decision.needs_followup}")
            print(f"   Reasoning: {decision.reasoning}")
            
            # Check if we should end
            if not decision.should_continue or decision.next_task_type.lower() == "end":
                final_result = ctx.state.result if ctx.state.result else "Task completed."
                print(f"\n✅ Orchestrator decided to end execution\n")
                return End(final_result)
            
            # Route based on the agent's decision
            if decision.next_task_type.lower() == "image_generation":
                ctx.state.query_type = "image_generation"
                print(f"\n→ Routing to ImageGenerationNode\n")
                return ImageGenerationNode(needs_followup=decision.needs_followup)
            elif decision.next_task_type.lower() == "web_search":
                ctx.state.query_type = "web_search"
                print(f"\n→ Routing to WebSearchNode\n")
                return WebSearchNode(needs_followup=decision.needs_followup)
            elif decision.next_task_type.lower() == "code_execution":
                ctx.state.query_type = "code_execution"
                print(f"\n→ Routing to CodeExecutionNode\n")
                return CodeExecutionNode(needs_followup=decision.needs_followup)
            elif decision.next_task_type.lower() == "result_aggregator":
                print(f"\n→ Routing to ResultAggregatorNode\n")
                return ResultAggregatorNode()
            else:
                ctx.state.result = (
                    f"Unable to determine appropriate handler. "
                    f"Reasoning: {decision.reasoning}"
                )
                print(f"\n→ Unknown task type, ending\n")
                return End(ctx.state.result)
                
        except Exception as e:
            print(f"\n✗ Orchestrator analysis failed: {e}\n")
            ctx.state.result = f"Orchestrator analysis failed: {str(e)}"
            return End(ctx.state.result)


# Define the image generation node
@dataclass
class ImageGenerationNode(BaseNode[QueryState, None, str]):
    """Node that handles image generation queries."""
    needs_followup: bool = False  # Whether to return to orchestrator after completion
    
    async def run(self, ctx: GraphRunContext[QueryState]) -> OrchestratorNode | ErrorHandlerNode | End[str]:
        """Generate an image using the image generation agent."""
        node_name = "ImageGeneration"
        print(f"🎨 {node_name}Node processing query...")
        print(f"   Needs Followup: {self.needs_followup}")
        
        # Add to execution history
        ctx.state.execution_history.append(node_name)
        
        try:
            result = await image_generation_agent.run(ctx.state.query)
            num_images = len(result.response.images) if result.response.images else 0
            node_result = f"✅ Image generated successfully! Created {num_images} image(s)."
            ctx.state.result = node_result
            
            # Store intermediate result
            ctx.state.intermediate_results[node_name] = node_result
            
            print(f"   ✓ Generation complete: {num_images} image(s) created")
            
            # Decide whether to hand off to orchestrator or end
            if self.needs_followup:
                print(f"   ↩️  Handing off to orchestrator for next steps...")
                return OrchestratorNode()
            else:
                print(f"   🏁 Task complete, ending execution")
                return End(ctx.state.result)
                
        except Exception as e:
            # Log error
            from datetime import datetime
            error_info = {
                "node": node_name,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            ctx.state.errors.append(error_info)
            ctx.state.last_error_node = node_name
            
            node_result = f"❌ Image generation failed: {str(e)}"
            ctx.state.result = node_result
            ctx.state.intermediate_results[node_name] = node_result
            
            print(f"   ✗ Image generation failed: {e}")
            print(f"   🔧 Routing to ErrorHandlerNode for recovery...")
            
            # Route to error handler
            return ErrorHandlerNode()


# Define the web search node
@dataclass
class WebSearchNode(BaseNode[QueryState, None, str]):
    """Node that handles web search queries."""
    needs_followup: bool = False  # Whether to return to orchestrator after completion
    
    async def run(self, ctx: GraphRunContext[QueryState]) -> OrchestratorNode | ErrorHandlerNode | End[str]:
        """Perform a web search using the web search agent."""
        node_name = "WebSearch"
        print(f"🔍 {node_name}Node processing query...")
        print(f"   Needs Followup: {self.needs_followup}")
        
        # Add to execution history
        ctx.state.execution_history.append(node_name)
        
        try:
            result = await web_search_agent.run(ctx.state.query)
            node_result = result.output if hasattr(result, 'output') else str(result.data)
            ctx.state.result = node_result
            
            # Store intermediate result
            ctx.state.intermediate_results[node_name] = node_result
            
            print(f"   ✓ Web search complete")
            
            # Decide whether to hand off to orchestrator or end
            if self.needs_followup:
                print(f"   ↩️  Handing off to orchestrator for next steps...")
                return OrchestratorNode()
            else:
                print(f"   🏁 Task complete, ending execution")
                return End(ctx.state.result)
                
        except Exception as e:
            # Log error
            from datetime import datetime
            error_info = {
                "node": node_name,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            ctx.state.errors.append(error_info)
            ctx.state.last_error_node = node_name
            
            node_result = f"❌ Web search failed: {str(e)}"
            ctx.state.result = node_result
            ctx.state.intermediate_results[node_name] = node_result
            
            print(f"   ✗ Web search failed: {e}")
            print(f"   🔧 Routing to ErrorHandlerNode for recovery...")
            
            # Route to error handler
            return ErrorHandlerNode()


# Define the code execution node
@dataclass
class CodeExecutionNode(BaseNode[QueryState, None, str]):
    """Node that handles code execution queries."""
    needs_followup: bool = False  # Whether to return to orchestrator after completion
    
    async def run(self, ctx: GraphRunContext[QueryState]) -> OrchestratorNode | ErrorHandlerNode | End[str]:
        """Execute code using the code execution agent."""
        node_name = "CodeExecution"
        print(f"💻 {node_name}Node processing query...")
        print(f"   Needs Followup: {self.needs_followup}")
        
        # Add to execution history
        ctx.state.execution_history.append(node_name)
        
        try:
            result = await code_execution_agent.run(ctx.state.query)
            node_result = result.output if hasattr(result, 'output') else str(result.data)
            ctx.state.result = node_result
            
            # Store intermediate result
            ctx.state.intermediate_results[node_name] = node_result
            
            print(f"   ✓ Code execution complete")
            
            # Decide whether to hand off to orchestrator or end
            if self.needs_followup:
                print(f"   ↩️  Handing off to orchestrator for next steps...")
                return OrchestratorNode()
            else:
                print(f"   🏁 Task complete, ending execution")
                return End(ctx.state.result)
                
        except Exception as e:
            # Log error
            from datetime import datetime
            error_info = {
                "node": node_name,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            ctx.state.errors.append(error_info)
            ctx.state.last_error_node = node_name
            
            node_result = f"❌ Code execution failed: {str(e)}"
            ctx.state.result = node_result
            ctx.state.intermediate_results[node_name] = node_result
            
            print(f"   ✗ Code execution failed: {e}")
            print(f"   🔧 Routing to ErrorHandlerNode for recovery...")
            
            # Route to error handler
            return ErrorHandlerNode()


# Define the error handler node
@dataclass
class ErrorHandlerNode(BaseNode[QueryState, None, str]):
    """Node that handles errors and determines recovery strategy."""
    
    async def run(
        self, ctx: GraphRunContext[QueryState]
    ) -> ImageGenerationNode | WebSearchNode | CodeExecutionNode | OrchestratorNode | End[str]:
        """Analyze the error and determine recovery action."""
        node_name = "ErrorHandler"
        print(f"\n🔧 {node_name}Node analyzing error...")
        
        # Add to execution history
        ctx.state.execution_history.append(node_name)
        
        # Get the most recent error
        if not ctx.state.errors:
            print(f"   ⚠️  No errors found in state. Ending execution.")
            return End("Error handler called but no error information available.")
        
        last_error = ctx.state.errors[-1]
        failed_node = ctx.state.last_error_node
        
        print(f"   Failed Node: {failed_node}")
        print(f"   Error: {last_error['error'][:100]}...")
        print(f"   Retry Count: {ctx.state.retry_count}/{ctx.state.max_retries}")
        
        # Build context for error handler
        error_context = f"Original Query: {ctx.state.original_query}\n"
        error_context += f"Failed Node: {failed_node}\n"
        error_context += f"Error: {last_error['error']}\n"
        error_context += f"Retry Count: {ctx.state.retry_count}/{ctx.state.max_retries}\n"
        error_context += f"Execution History: {' → '.join(ctx.state.execution_history)}\n"
        
        if ctx.state.intermediate_results:
            error_context += "\nSuccessful Results So Far:\n"
            for node, result in ctx.state.intermediate_results.items():
                if not result.startswith("❌"):
                    error_context += f"  - {node}: {result[:100]}...\n"
        
        error_context += "\nDetermine the best recovery strategy."
        
        try:
            result = await error_handler_agent.run(error_context)
            decision: ErrorRecoveryDecision = result.output
            
            print(f"\n   📊 Recovery Decision:")
            print(f"      Should Retry: {decision.should_retry}")
            print(f"      Should Try Alternative: {decision.should_try_alternative}")
            if decision.should_try_alternative:
                print(f"      Alternative: {decision.alternative_task_type.upper()}")
            print(f"      Should End: {decision.should_end}")
            print(f"      Reasoning: {decision.reasoning}")
            
            # Handle retry logic
            if decision.should_retry:
                if ctx.state.retry_count >= ctx.state.max_retries:
                    print(f"\n   ⚠️  Max retries reached. Cannot retry.")
                    ctx.state.result = decision.error_message
                    return End(decision.error_message)
                
                ctx.state.retry_count += 1
                print(f"\n   🔄 Retrying {failed_node} (attempt {ctx.state.retry_count})...")
                
                # Retry the failed node based on its type
                if failed_node == "ImageGeneration":
                    return ImageGenerationNode(needs_followup=False)
                elif failed_node == "WebSearch":
                    return WebSearchNode(needs_followup=False)
                elif failed_node == "CodeExecution":
                    return CodeExecutionNode(needs_followup=False)
                
            # Handle alternative approach
            elif decision.should_try_alternative and decision.alternative_task_type:
                print(f"\n   🔀 Trying alternative approach: {decision.alternative_task_type.upper()}")
                ctx.state.retry_count = 0  # Reset retry count for new approach
                
                # Route to alternative node
                if decision.alternative_task_type.lower() == "image_generation":
                    return ImageGenerationNode(needs_followup=False)
                elif decision.alternative_task_type.lower() == "web_search":
                    return WebSearchNode(needs_followup=False)
                elif decision.alternative_task_type.lower() == "code_execution":
                    return CodeExecutionNode(needs_followup=False)
                elif decision.alternative_task_type.lower() == "orchestrator":
                    return OrchestratorNode()
            
            # End execution with error message
            if decision.should_end:
                print(f"\n   ❌ Error deemed unrecoverable. Ending execution.")
                ctx.state.result = decision.error_message
                return End(decision.error_message)
            
            # Fallback: if no clear decision, end with error
            print(f"\n   ⚠️  No clear recovery path. Ending execution.")
            ctx.state.result = decision.error_message or "Error recovery failed."
            return End(ctx.state.result)
            
        except Exception as e:
            print(f"\n   ✗ Error handler itself failed: {e}")
            error_msg = f"Error handling failed. Original error: {last_error['error']}"
            ctx.state.result = error_msg
            return End(error_msg)


# Define the result aggregator node
@dataclass
class ResultAggregatorNode(BaseNode[QueryState, None, str]):
    """Node that aggregates results from multiple previous steps into a final coherent response."""
    
    async def run(self, ctx: GraphRunContext[QueryState]) -> End[str]:
        """Aggregate intermediate results into a final response."""
        node_name = "ResultAggregator"
        print(f"📋 {node_name}Node synthesizing results...")
        
        # Add to execution history
        ctx.state.execution_history.append(node_name)
        
        # Build comprehensive context for aggregation
        aggregation_context = f"Original User Query: {ctx.state.original_query}\n\n"
        aggregation_context += "Task Execution Summary:\n"
        aggregation_context += f"Nodes Executed: {' → '.join(ctx.state.execution_history[:-1])}\n\n"  # Exclude current node
        
        if ctx.state.intermediate_results:
            aggregation_context += "Results from each step:\n"
            for node, result in ctx.state.intermediate_results.items():
                aggregation_context += f"\n{node}:\n{result}\n"
        
        aggregation_context += "\nPlease provide a comprehensive final answer that synthesizes all these results and directly addresses the original user query."
        
        try:
            result = await result_aggregator_agent.run(aggregation_context)
            final_result = result.output
            ctx.state.result = final_result
            
            # Store intermediate result
            ctx.state.intermediate_results[node_name] = final_result
            
            print(f"   ✓ Aggregation complete")
        except Exception as e:
            final_result = (
                f"❌ Result aggregation failed: {str(e)}\n\n"
                f"Here are the individual results:\n"
            )
            for node, result in ctx.state.intermediate_results.items():
                final_result += f"\n{node}: {result}\n"
            
            ctx.state.result = final_result
            ctx.state.intermediate_results[node_name] = final_result
            print(f"   ✗ Aggregation failed: {e}")
        
        print(f"   🏁 Aggregation complete, ending execution")
        return End(ctx.state.result)


# Create the graph
multi_agent_graph = Graph(
    nodes=[OrchestratorNode, ImageGenerationNode, WebSearchNode, CodeExecutionNode, ResultAggregatorNode, ErrorHandlerNode],
    state_type=QueryState,
)


# Example usage
if __name__ == "__main__":
    # Generate mermaid diagram of the graph structure
    print("\n" + "=" * 60)
    print("MULTI-AGENT GRAPH STRUCTURE (Mermaid Diagram)")
    print("=" * 60)
    mermaid_diagram = multi_agent_graph.mermaid_code(start_node=OrchestratorNode)
    print(mermaid_diagram)
    print("\n")
    
    # Example queries to test the orchestrator's routing capabilities
    # Including both single-step and multi-step queries
    test_queries = [
        # Single-step queries (should complete in one node)
        # {
        #     "query": "Calculate the factorial of 15",
        #     "description": "Simple code execution task"
        # },
        # {
        #     "query": "Generate an image of a cat sitting on a windowsill",
        #     "description": "Simple image generation task"
        # },
        
        # # Multi-step queries (should require orchestrator to chain agents)
        # {
        #     "query": "Search for the latest SpaceX rocket launch details, then create an image visualizing it",
        #     "description": "Multi-step: Web search → Image generation"
        # },
        # {
        #     "query": "Find the Fibonacci sequence formula, calculate the 10th number, then generate a visual chart of it",
        #     "description": "Multi-step: Web search → Code execution → Image generation"
        # },
        {
            "query": "What is the current world population? Calculate what 10% of that would be and provide a breakdown by continent.",
            "description": "Multi-step: Web search → Code execution"
        },
    ]
    
    for i, test_case in enumerate(test_queries, 1):
        query = test_case["query"]
        description = test_case["description"]
        
        print("\n" + "🔹" * 40)
        print(f"EXAMPLE {i}: {description}")
        print("🔹" * 40)
        print(f"Query: {query}")
        
        result = multi_agent_graph.run_sync(
            OrchestratorNode(),
            state=QueryState(query=query, max_iterations=5)
        )
        
        print(f"\n{'='*60}")
        print(f"✅ FINAL RESULT:")
        print(f"{'='*60}")
        print(f"{result.output}")
        print(f"\n{'='*60}\n")