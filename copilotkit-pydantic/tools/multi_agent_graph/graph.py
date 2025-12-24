"""Graph builder for multi-agent orchestration.

This module constructs the pydantic-graph that routes queries to specialized
agents based on the orchestrator's routing decisions.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Any
import json

from pydantic_graph.beta import GraphBuilder, StepContext, TypeExpression
from pydantic_ai.ag_ui import SSE_CONTENT_TYPE, AGUIAdapter

from config import logger
from core.models import UnifiedDeps
from .types import (
    QueryState,
    ActionType,
    WorkerResult,
    RoutingDecision,
    ToolCallInfo,
)
from .agents import create_agents
from .state import send_graph_state_delta
from .steps import (
    run_worker_step,
    create_orchestrator_run_input,
    extract_image_result,
    extract_code_result,
    build_aggregator_prompt,
)
from .constants import DEFAULT_IMAGE_MODEL, DEFAULT_GENERAL_MODEL


async def create_multi_agent_graph(
    orchestrator_model: Any,
    organization_id: str | None = None,
    team_id: str | None = None,
    agent_type: str | None = None,
    agent_info: dict | None = None,
):
    """Create a multi-agent graph using the beta API builder pattern.
    
    Args:
        orchestrator_model: The model from ctx.model to use for orchestrator and aggregator (REQUIRED).
        organization_id: Organization ID for loading auxiliary agents
        team_id: Team ID for loading auxiliary agents
        agent_type: Main agent type for auxiliary agent lookup
        agent_info: Main agent info/metadata containing auxiliary agent configuration
        
    Returns:
        Built graph ready for execution
    """
    agents = await create_agents(
        orchestrator_model=orchestrator_model,
        organization_id=organization_id,
        team_id=team_id,
        agent_type=agent_type,
        agent_info=agent_info,
    )
    
    g = GraphBuilder(
        state_type=QueryState,
        input_type=str,
        output_type=str,
        deps_type=UnifiedDeps,
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
        
        logger.info(f"🤖 Orchestrator (Iteration {ctx.state.iteration_count})")
        logger.info(f"Query: {ctx.state.query}")
        if ctx.state.execution_history:
            logger.info(f"History: {' → '.join(ctx.state.execution_history)}")
        
        send_stream = ctx.deps.send_stream if ctx.deps else None
        shared_state = ctx.deps.state if ctx.deps else None
        await send_graph_state_delta(send_stream, ctx.state, "Orchestrator", "in_progress", shared_state)
        
        # Check iteration limit
        if ctx.state.iteration_count > ctx.state.max_iterations:
            logger.warning("Max iterations reached")
            ctx.state.errors.append({
                "node": "Orchestrator",
                "error": f"Max iterations ({ctx.state.max_iterations}) reached",
                "timestamp": datetime.now().isoformat()
            })
            await send_graph_state_delta(send_stream, ctx.state, "Orchestrator", "error", shared_state)
            return "end"
        
        # Build context
        context = f"Original Query: {ctx.state.original_query}\n"
        if ctx.state.execution_history:
            context += f"Executed: {', '.join(ctx.state.execution_history)}\n"
        if ctx.state.intermediate_results:
            context += "\nResults:\n"
            for node, result in ctx.state.intermediate_results.items():
                context += f"  - {node}: {result[:100]}...\n"
        
        # Get decision - run through AGUIAdapter to access frontend tools
        try:
            orchestrator_run_input = create_orchestrator_run_input(
                ctx.deps.adapter.run_input,
                context
            )
            
            orchestrator_adapter = AGUIAdapter(
                agent=agents['orchestrator'],
                run_input=orchestrator_run_input,
                accept=SSE_CONTENT_TYPE
            )
            
            result_holder = [None]
            orchestrator_streaming_text = []
            
            # Initialize tool call tracking for orchestrator
            orchestrator_key = f"Orchestrator:{ctx.state.iteration_count - 1}"
            ctx.state.tool_calls[orchestrator_key] = []
            ctx.state.tool_calls["Orchestrator"] = []
            current_tool_call: ToolCallInfo | None = None
            
            def capture_result(result):
                result_holder[0] = result
            
            # Run orchestrator and capture streaming content AND tool calls
            async for event in orchestrator_adapter.run_stream(on_complete=capture_result):
                if isinstance(event, str):
                    try:
                        for line in event.split('\n'):
                            if line.startswith('data:'):
                                data = json.loads(line[5:].strip())
                                event_type = data.get('type', '')
                                
                                # Handle TEXT_MESSAGE_CONTENT events (streaming text)
                                if event_type == 'TEXT_MESSAGE_CONTENT' and data.get('delta'):
                                    orchestrator_streaming_text.append(data['delta'])
                                
                                # Handle TOOL_CALL_START - new tool call begins
                                elif event_type == 'TOOL_CALL_START':
                                    tool_name = data.get('tool_call_name', 'unknown')
                                    current_tool_call = ToolCallInfo(tool_name=tool_name, status="in_progress")
                                    ctx.state.tool_calls[orchestrator_key].append(current_tool_call)
                                    ctx.state.tool_calls["Orchestrator"] = ctx.state.tool_calls[orchestrator_key]
                                    logger.info(f"   [Orchestrator] Tool call started: {tool_name}")
                                    # Send snapshot to show tool call started
                                    await send_graph_state_delta(send_stream, ctx.state, "Orchestrator", "in_progress", shared_state)
                                
                                # Handle TOOL_CALL_ARGS - tool arguments streaming
                                elif event_type == 'TOOL_CALL_ARGS':
                                    if current_tool_call and data.get('delta'):
                                        current_tool_call.args += data['delta']
                                
                                # Handle TOOL_CALL_END - tool call arguments complete
                                elif event_type == 'TOOL_CALL_END':
                                    if current_tool_call:
                                        args_preview = current_tool_call.args[:50] if current_tool_call.args else "(no args)"
                                        logger.debug(f"   [Orchestrator] Tool call args complete: {args_preview}...")
                                
                                # Handle TOOL_CALL_RESULT - tool execution result
                                elif event_type == 'TOOL_CALL_RESULT':
                                    result_content = data.get('content', '')
                                    if isinstance(result_content, str):
                                        result_str = result_content
                                    else:
                                        result_str = str(result_content)[:500]  # Truncate long results
                                    
                                    # Mark the last in_progress tool call as completed
                                    for tc in ctx.state.tool_calls[orchestrator_key]:
                                        if tc.status == "in_progress":
                                            tc.result = result_str
                                            tc.status = "completed"
                                            logger.info(f"   [Orchestrator] Tool call completed: {tc.tool_name} -> {result_str[:50]}...")
                                            break
                                    ctx.state.tool_calls["Orchestrator"] = ctx.state.tool_calls[orchestrator_key]
                                    # Send snapshot to show tool call result
                                    await send_graph_state_delta(send_stream, ctx.state, "Orchestrator", "in_progress", shared_state)
                    except json.JSONDecodeError:
                        pass
                    except Exception as e:
                        logger.debug(f"   [Orchestrator] Error processing event: {e}")
            
            # Finalize any in-progress tool calls
            for tc in ctx.state.tool_calls.get(orchestrator_key, []):
                if tc.status == "in_progress":
                    tc.status = "completed"
                    if not tc.result:
                        tc.result = "(completed - no output)"
                    logger.debug(f"   [Orchestrator] Finalized in-progress tool call: {tc.tool_name}")
            
            # Store orchestrator streaming text
            if orchestrator_streaming_text:
                ctx.state.streaming_text["Orchestrator"] = ''.join(orchestrator_streaming_text)
                logger.debug(f"   [Orchestrator] Captured streaming text: {len(ctx.state.streaming_text.get('Orchestrator', ''))} chars")
            
            # Log tool call summary
            tool_call_count = len(ctx.state.tool_calls.get(orchestrator_key, []))
            if tool_call_count > 0:
                logger.info(f"   [Orchestrator] Made {tool_call_count} tool call(s): {[tc.tool_name for tc in ctx.state.tool_calls[orchestrator_key]]}")
            
            # Get the captured result
            final_result = result_holder[0]
            decision: RoutingDecision | None = None
            
            if final_result:
                output = getattr(final_result, 'output', final_result)
                
                # Check if it's a DeferredToolRequests (frontend tool needs user interaction)
                from pydantic_ai.tools import DeferredToolRequests
                if isinstance(output, DeferredToolRequests):
                    # This means a frontend tool (like confirmAction) was called
                    # DeferredToolRequests is a VALID output type, not an error
                    # The tool call events were already emitted via the stream
                    # The frontend will handle the deferred tool and respond
                    
                    deferred_calls = list(output.calls) if output.calls else []
                    deferred_approvals = list(output.approvals) if output.approvals else []
                    
                    tool_names = [c.tool_name for c in deferred_calls + deferred_approvals]
                    logger.info(f"   Orchestrator returned DeferredToolRequests for: {tool_names}")
                    
                    # Track orchestrator in execution history (completed its decision)
                    orchestrator_iteration = ctx.state.iteration_count - 1
                    indexed_key = f"Orchestrator:{orchestrator_iteration}"
                    ctx.state.execution_history.append(indexed_key)
                    ctx.state.streaming_text[indexed_key] = f"Requesting user confirmation for: {tool_names}"
                    ctx.state.streaming_text["Orchestrator"] = ctx.state.streaming_text[indexed_key]
                    
                    # Extract action description from confirmAction args if available
                    action_description = "proceed with the action"
                    for call in deferred_calls:
                        if call.tool_name == "confirmAction" and hasattr(call, 'args'):
                            args = call.args if isinstance(call.args, dict) else {}
                            action_description = args.get("actionDescription", action_description)
                            break
                    
                    # Add Confirmation step to show in UI
                    confirmation_index = len([
                        h for h in ctx.state.execution_history 
                        if h == "Confirmation" or h.startswith("Confirmation:")
                    ])
                    confirmation_key = f"Confirmation:{confirmation_index}"
                    ctx.state.execution_history.append(confirmation_key)
                    ctx.state.prompts[confirmation_key] = action_description
                    ctx.state.prompts["Confirmation"] = action_description
                    ctx.state.streaming_text[confirmation_key] = f"Requesting confirmation: {action_description}"
                    ctx.state.streaming_text["Confirmation"] = ctx.state.streaming_text[confirmation_key]
                    
                    # Store the tool call info for the Confirmation step
                    ctx.state.tool_calls[confirmation_key] = [
                        ToolCallInfo(
                            tool_name=call.tool_name,
                            args=json.dumps(call.args) if hasattr(call, 'args') else "{}",
                            result="",
                            status="in_progress"
                        )
                        for call in deferred_calls
                    ]
                    ctx.state.tool_calls["Confirmation"] = ctx.state.tool_calls[confirmation_key]
                    
                    # Set planned steps if not already set (infer from confirmation context)
                    if not ctx.state.planned_steps:
                        # Infer likely next steps based on the confirmation
                        if "code" in action_description.lower() or "calculate" in action_description.lower():
                            ctx.state.planned_steps = ["code_execution", "result_aggregator"]
                        elif "search" in action_description.lower() or "find" in action_description.lower():
                            ctx.state.planned_steps = ["web_search", "result_aggregator"]
                        elif "image" in action_description.lower() or "generate" in action_description.lower():
                            ctx.state.planned_steps = ["image_generation", "result_aggregator"]
                        else:
                            ctx.state.planned_steps = ["result_aggregator"]
                        logger.info(f"   Inferred planned steps: {ctx.state.planned_steps}")
                    
                    # Update state to "waiting" status
                    ctx.state.result = f"Waiting for user interaction: {tool_names}"
                    
                    await send_graph_state_delta(send_stream, ctx.state, "Confirmation", "waiting", shared_state)
                    
                    # Store the deferred requests so parent can access them
                    ctx.state.deferred_tool_requests = output
                    
                    # Return "deferred" to indicate we're waiting for user interaction
                    # The graph will handle this and the parent adapter will manage the flow
                    return "deferred"
                
                elif hasattr(output, 'next_task_type'):
                    # Normal RoutingDecision
                        decision = output
                else:
                    logger.warning(f"   Orchestrator output is not RoutingDecision: {type(output)}")
                    result = await agents['orchestrator'].run(context)
                    decision = result.output
            
            if not decision:
                logger.warning("Orchestrator adapter didn't return expected result, falling back to direct run")
                result = await agents['orchestrator'].run(context)
                decision = result.output
            
            logger.info(f"📊 Decision: {decision.next_task_type.upper()}")
            logger.info(f"   Reasoning: {decision.reasoning[:100]}...")
            
            # Store orchestrator reasoning with iteration index
            orchestrator_iteration = ctx.state.iteration_count - 1
            indexed_key = f"Orchestrator:{orchestrator_iteration}"
            
            if decision.reasoning:
                thinking_content = f"<think>\n{decision.reasoning}\n</think>"
                ctx.state.streaming_text[indexed_key] = thinking_content
                ctx.state.streaming_text["Orchestrator"] = thinking_content
            
            # Track orchestrator in execution history
            ctx.state.execution_history.append(indexed_key)
            
            # Handle execution plan
            if decision.planned_sequence and not ctx.state.planned_steps:
                ctx.state.planned_steps = list(decision.planned_sequence)
                logger.info(f"   Planned: {' → '.join(ctx.state.planned_steps)}")
            elif ctx.state.planned_steps and decision.next_task_type.lower() != "end":
                _update_planned_steps(ctx.state, decision.next_task_type.lower())
            
            # Store task-specific prompt for next worker
            ctx.state.current_task_prompt = decision.task_prompt if decision.task_prompt else ctx.state.query
            logger.info(f"   Task prompt: {ctx.state.current_task_prompt[:100]}...")
            
            # Store for worker nodes
            ctx.state.should_continue = decision.needs_followup
            ctx.state.next_action = decision.next_task_type.lower()
            
            await send_graph_state_delta(send_stream, ctx.state, "Orchestrator", "completed", shared_state)
            
            return decision.next_task_type.lower()  # type: ignore
            
        except Exception as e:
            logger.exception(f"Orchestrator failed: {e}")
            ctx.state.errors.append({
                "node": "Orchestrator",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })
            await send_graph_state_delta(send_stream, ctx.state, "Orchestrator", "error", shared_state)
            return "end"
    
    # ==================== CONFIRMATION STEP ====================
    @g.step
    async def confirmation_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Request user confirmation before proceeding with an action.
        
        Creates a DeferredToolRequests for the confirmAction tool and returns it
        so the parent adapter can handle the human-in-the-loop flow.
        """
        logger.info("✋ Confirmation step - requesting user confirmation...")
        
        # Calculate run index for this confirmation step
        run_index = len([
            h for h in ctx.state.execution_history 
            if h == "Confirmation" or h.startswith("Confirmation:")
        ])
        indexed_key = f"Confirmation:{run_index}"
        
        # Check if this confirmation has already been completed (during resume)
        if indexed_key in ctx.state.execution_history:
            logger.info(f"   [Confirmation] {indexed_key} already in execution history, skipping...")
            # Check if confirmation was approved
            if indexed_key in ctx.state.tool_calls:
                for tc in ctx.state.tool_calls[indexed_key]:
                    tc_dict = tc if isinstance(tc, dict) else tc.__dict__
                    if tc_dict.get("status") == "completed":
                        result = tc_dict.get("result", "")
                        if isinstance(result, str) and "true" in result.lower():
                            logger.info(f"   [Confirmation] User confirmed, continuing...")
                            return "continue"
                        else:
                            logger.info(f"   [Confirmation] User declined, ending...")
                            ctx.state.result = "User cancelled the action"
                            return "end"
            logger.info(f"   [Confirmation] No completed confirmation found, continuing anyway...")
            return "continue"
        
        # Append to execution history
        ctx.state.execution_history.append(indexed_key)
        
        send_stream = ctx.deps.send_stream if ctx.deps else None
        shared_state = ctx.deps.state if ctx.deps else None
        
        # Initialize tool call tracking for this step
        ctx.state.tool_calls[indexed_key] = []
        ctx.state.tool_calls["Confirmation"] = []
        
        # Store the prompt
        action_description = ctx.state.current_task_prompt or "proceed with the next action"
        ctx.state.prompts[indexed_key] = action_description
        ctx.state.prompts["Confirmation"] = action_description
        
        # Send state snapshot - step started
        await send_graph_state_delta(send_stream, ctx.state, "Confirmation", "in_progress", shared_state)
        
        try:
            from pydantic_ai.tools import DeferredToolRequests
            from pydantic_ai.messages import ToolCallPart
            import uuid
            
            # Create a unique tool call ID
            tool_call_id = f"confirm_{uuid.uuid4().hex[:8]}"
            
            # Create the tool call for confirmAction
            tool_call = ToolCallPart(
                tool_name="confirmAction",
                args={"actionDescription": action_description},
                tool_call_id=tool_call_id,
            )
            
            # Track the tool call in state
            current_tool_call = ToolCallInfo(
                tool_name="confirmAction",
                status="in_progress",
                args=json.dumps({"actionDescription": action_description})
            )
            ctx.state.tool_calls[indexed_key].append(current_tool_call)
            ctx.state.tool_calls["Confirmation"] = ctx.state.tool_calls[indexed_key]
            
            logger.info(f"   [Confirmation] Creating DeferredToolRequests for confirmAction")
            logger.info(f"   [Confirmation] Tool call ID: {tool_call_id}")
            logger.info(f"   [Confirmation] Action description: {action_description[:100]}...")
            
            # Create the DeferredToolRequests
            # Use 'calls' for external tools (confirmAction is a frontend tool that needs external execution)
            deferred = DeferredToolRequests(
                calls=[tool_call],
                approvals=[],
            )
            
            # Store the deferred request in state
            ctx.state.deferred_tool_requests = deferred
            ctx.state.result = f"Waiting for user interaction: ['confirmAction']"
            ctx.state.streaming_text[indexed_key] = f"Requesting confirmation: {action_description}"
            ctx.state.streaming_text["Confirmation"] = ctx.state.streaming_text[indexed_key]
            
            # Update state to "waiting"
            await send_graph_state_delta(send_stream, ctx.state, "Confirmation", "waiting", shared_state)
            
            logger.info(f"   [Confirmation] Returning DeferredToolRequests")
            
            # Return "deferred" - the graph will handle this and finalize with waiting status
            return "deferred"
                
        except Exception as e:
            logger.exception(f"Confirmation step error: {e}")
            ctx.state.errors.append({
                "node": "Confirmation",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })
            await send_graph_state_delta(send_stream, ctx.state, "Confirmation", "error", shared_state)
            return "error"
    
    # ==================== WORKER STEPS ====================
    @g.step
    async def image_generation_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Generate an image using AGUIAdapter for streaming and upload to Firebase."""
        logger.info("🎨 ImageGeneration processing...")
        return await run_worker_step(
            state=ctx.state,
            deps=ctx.deps,
            node_name="ImageGeneration",
            agent=agents['image_generation'],
            model_label=DEFAULT_IMAGE_MODEL,
            result_extractor=extract_image_result,
        )
    
    @g.step
    async def web_search_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Perform web search using AGUIAdapter for streaming."""
        logger.info("🔍 WebSearch processing...")
        return await run_worker_step(
            state=ctx.state,
            deps=ctx.deps,
            node_name="WebSearch",
            agent=agents['web_search'],
            model_label=DEFAULT_GENERAL_MODEL,
        )
    
    @g.step
    async def code_execution_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Execute code using AGUIAdapter for streaming."""
        logger.info("💻 CodeExecution processing...")
        return await run_worker_step(
            state=ctx.state,
            deps=ctx.deps,
            node_name="CodeExecution",
            agent=agents['code_execution'],
            model_label=DEFAULT_GENERAL_MODEL,
            result_extractor=extract_code_result,
        )
    
    @g.step
    async def result_aggregator_step(ctx: StepContext[QueryState, None, ActionType]) -> WorkerResult:
        """Aggregate results using AGUIAdapter for streaming."""
        logger.info("📋 ResultAggregator processing...")
        
        # Result aggregator always ends
        result = await run_worker_step(
            state=ctx.state,
            deps=ctx.deps,
            node_name="ResultAggregator",
            agent=agents['result_aggregator'],
            model_label=DEFAULT_GENERAL_MODEL,
            prompt_builder=build_aggregator_prompt,
        )
        
        # Override to always end after aggregation
        return "end" if result != "error" else "error"
    
    # ==================== FINALIZE STEP ====================
    @g.step
    async def finalize_result(ctx: StepContext[QueryState, None, WorkerResult | ActionType]) -> str:
        """Extract final result from state."""
        logger.info("✅ Finalizing result")
        
        send_stream = ctx.deps.send_stream if ctx.deps else None
        shared_state = ctx.deps.state if ctx.deps else None
        
        final_result = ctx.state.result if ctx.state.result else "Task completed."
        
        # Check if we're waiting for user interaction (deferred tools)
        is_waiting = ctx.state.deferred_tool_requests is not None
        final_status = "waiting" if is_waiting else "completed"
        
        ctx.state.result = final_result
        ctx.state.should_continue = False
        
        logger.info(f"   [Finalize] Sending final snapshot with status={final_status}, result length={len(final_result)}")
        await send_graph_state_delta(send_stream, ctx.state, "", final_status, shared_state)
        
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
            .branch(g.match(TypeExpression[Literal["confirmation"]]).to(confirmation_step))
            .branch(g.match(TypeExpression[Literal["deferred"]]).to(finalize_result))  # Waiting for user interaction
            .branch(g.match(TypeExpression[Literal["end"]]).to(finalize_result))
        )
    )
    
    # Workers -> Decision (continue to orchestrator or finalize)
    for worker_step in [image_generation_step, web_search_step, code_execution_step, result_aggregator_step, confirmation_step]:
        g.add(
            g.edge_from(worker_step).to(
                g.decision()
                .branch(g.match(TypeExpression[Literal["continue"]]).to(orchestrator_step))
                .branch(g.match(TypeExpression[Literal["end"]]).to(finalize_result))
                .branch(g.match(TypeExpression[Literal["error"]]).to(finalize_result))
                .branch(g.match(TypeExpression[Literal["deferred"]]).to(finalize_result))  # Waiting for user interaction
            )
        )
    
    # Finalize -> End
    g.add(g.edge_from(finalize_result).to(g.end_node))
    
    return g.build()


def _update_planned_steps(state: QueryState, next_step: str) -> None:
    """Update planned steps if orchestrator decides to add more runs."""
    action_to_step = {
        "image_generation": "image_generation",
        "web_search": "web_search",
        "code_execution": "code_execution",
        "result_aggregator": "result_aggregator",
        "confirmation": "confirmation",
    }
    step_to_history = {
        "image_generation": "ImageGeneration",
        "web_search": "WebSearch",
        "code_execution": "CodeExecution",
        "result_aggregator": "ResultAggregator",
        "confirmation": "Confirmation",
    }
    
    step_name = action_to_step.get(next_step, next_step)
    if step_name not in action_to_step.values():
        return
    
    history_name = step_to_history.get(step_name, step_name)
    
    # Only count actual sub-agent executions, not orchestrator entries
    executed_count = len([
        h for h in state.execution_history
        if h == history_name or h.startswith(f"{history_name}:")
    ])
    
    planned_count = state.planned_steps.count(step_name)
    
    # If we're about to execute more times than planned, append
    if executed_count >= planned_count:
        state.planned_steps.append(step_name)
        logger.info(f"   Updated plan (added {step_name}): {' → '.join(state.planned_steps)}")

