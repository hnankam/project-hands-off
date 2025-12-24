"""Agent factory for multi-agent graph.

This module creates and configures all specialized agents used in the
multi-agent graph orchestration. Specialized agents (image_generation,
web_search, code_execution) MUST be configured as auxiliary agents in
the main agent's metadata. No fallback agents are provided.
"""

from __future__ import annotations

from typing import Any

from pydantic_ai import Agent
from pydantic_ai.tools import DeferredToolRequests

from config import logger
from tools.auxiliary_agents import get_auxiliary_agent
from .types import RoutingDecision, ErrorRecoveryDecision
from .constants import THINKING_INSTRUCTION


async def create_agents(
    orchestrator_model: Any,
    organization_id: str | None = None,
    team_id: str | None = None,
    agent_type: str | None = None,
    agent_info: dict | None = None,
) -> dict[str, Any]:
    """Create all agents needed for the multi-agent graph.
    
    Specialized agents (image_generation, web_search, code_execution) are loaded
    as auxiliary agents from the main agent's configuration. These are REQUIRED
    and must be configured in the main agent's metadata.
    
    The orchestrator model is used for both orchestration and result aggregation.
    
    Args:
        orchestrator_model: The model to use for orchestrator and result aggregator (from ctx.model).
                           This is REQUIRED - never create a new model.
        organization_id: Organization ID for loading auxiliary agents (REQUIRED)
        team_id: Team ID for loading auxiliary agents (REQUIRED)
        agent_type: Main agent type for auxiliary agent lookup (REQUIRED)
        agent_info: Main agent info/metadata containing auxiliary agent configuration (REQUIRED)
        
    Returns:
        Dict with all agent instances
        
    Raises:
        ValueError: If any required auxiliary agent is not configured in agent metadata
    """

    # Build orchestrator agent with the provided model
    # Include DeferredToolRequests in output_type to support human-in-the-loop tools
    orchestrator_agent = Agent(
        model=orchestrator_model,
        output_type=[RoutingDecision, DeferredToolRequests],
        instructions=_get_orchestrator_instructions(),
    )
    
    # ==================== Load specialized agents as auxiliary agents ====================
    # Load from main agent's auxiliary_agents configuration
    # Auxiliary agents are REQUIRED - no fallbacks
    
    main_agent_metadata = agent_info.get('metadata', {}) if agent_info else {}
    
    # Image Generation Agent
    image_generation_agent = await get_auxiliary_agent(
        aux_type='image_generation',
        main_agent_type=agent_type or 'unknown',
        main_agent_metadata=main_agent_metadata,
        organization_id=organization_id,
        team_id=team_id,
    )
    
    if not image_generation_agent:
        logger.error(
            "Image generation auxiliary agent not configured for agent_type=%s. "
            "Configure auxiliary_agents.image_generation in agent metadata.",
            agent_type
        )
        raise ValueError(
            f"Image generation auxiliary agent not configured for agent '{agent_type}'. "
            "Please configure auxiliary_agents.image_generation in agent metadata."
        )
    
    # Web Search Agent
    web_search_agent = await get_auxiliary_agent(
        aux_type='web_search',
        main_agent_type=agent_type or 'unknown',
        main_agent_metadata=main_agent_metadata,
        organization_id=organization_id,
        team_id=team_id,
    )
    
    if not web_search_agent:
        logger.error(
            "Web search auxiliary agent not configured for agent_type=%s. "
            "Configure auxiliary_agents.web_search in agent metadata.",
            agent_type
        )
        raise ValueError(
            f"Web search auxiliary agent not configured for agent '{agent_type}'. "
            "Please configure auxiliary_agents.web_search in agent metadata."
        )
    
    # Code Execution Agent
    code_execution_agent = await get_auxiliary_agent(
        aux_type='code_execution',
        main_agent_type=agent_type or 'unknown',
        main_agent_metadata=main_agent_metadata,
        organization_id=organization_id,
        team_id=team_id,
    )
    
    if not code_execution_agent:
        logger.error(
            "Code execution auxiliary agent not configured for agent_type=%s. "
            "Configure auxiliary_agents.code_execution in agent metadata.",
            agent_type
        )
        raise ValueError(
            f"Code execution auxiliary agent not configured for agent '{agent_type}'. "
            "Please configure auxiliary_agents.code_execution in agent metadata."
        )
    
    # Result Aggregator - uses orchestrator model (not configurable as auxiliary)
    result_aggregator_agent = Agent(
        model=orchestrator_model,
        output_type=str,
        instructions=(
            "You are a result aggregator. Your job is to synthesize and summarize results from multiple "
            "specialized agents into a coherent, comprehensive final response. Consider all intermediate results "
            "and the original user query to create a complete answer that addresses what the user asked for."
            + THINKING_INSTRUCTION
        ),
    )
    
    return {
        'general_model': orchestrator_model,  # Same model as orchestrator for dummy agent
        'orchestrator': orchestrator_agent,
        'image_generation': image_generation_agent,
        'web_search': web_search_agent,
        'code_execution': code_execution_agent,
        'result_aggregator': result_aggregator_agent,
    }


def _get_orchestrator_instructions() -> str:
    """Get the instruction prompt for the orchestrator agent."""
    return (
        "You are an intelligent query routing orchestrator. Analyze the current context and determine "
        "the next action. You have access to FIVE types of specialized agents:\n\n"
        "1. image_generation: For creating, generating, or drawing images, pictures, or visual content\n"
        "2. web_search: For finding information online, looking up facts, news, or current events\n"
        "3. code_execution: For performing calculations, running code, solving math problems\n"
        "4. confirmation: For getting user confirmation before proceeding with a sensitive action\n"
        "5. result_aggregator: For synthesizing results from multiple previous steps into a final answer\n\n"
        "USER CONFIRMATION:\n"
        "When the user requests confirmation before certain actions (like code_execution, web_search, "
        "or image_generation), route to the 'confirmation' step BEFORE the action.\n"
        "- Set next_task_type='confirmation'\n"
        "- Set task_prompt to describe what you're asking permission for\n"
        "- Example task_prompt: 'I will execute Python code to calculate the factorial of 15. Proceed?'\n"
        "- The system will pause and wait for user confirmation\n"
        "- If user confirms, continue with the next step in your plan\n"
        "- If user declines, the graph will end\n\n"
        "EXECUTION PLANNING:\n"
        "On the FIRST iteration (when execution_history is empty), you MUST provide a planned_sequence "
        "with the full list of tasks you plan to execute IN ORDER. This helps the user understand "
        "what will happen before execution starts.\n\n"
        "Example planned_sequence for 'Calculate factorial of 15 with confirmation':\n"
        '  planned_sequence: ["confirmation", "code_execution", "result_aggregator"]\n\n'
        "Example planned_sequence for 'Search for SpaceX launch and create an image':\n"
        '  planned_sequence: ["web_search", "image_generation", "result_aggregator"]\n\n'
        "TASK-SPECIFIC PROMPTS (task_prompt field):\n"
        "For EACH decision, you MUST provide a clear, focused task_prompt that tells the sub-agent "
        "EXACTLY what to do. Do NOT just repeat the original query - be SPECIFIC to what this step needs.\n\n"
        "Examples of GOOD task_prompts:\n"
        "- For code_execution: 'Calculate the first 10 Fibonacci numbers and return them as a list'\n"
        "- For image_generation: 'Create a bar chart with x-axis showing positions 1-10 and y-axis showing "
        "  the Fibonacci values [1,1,2,3,5,8,13,21,34,55]'\n"
        "- For web_search: 'Find the latest SpaceX Starship launch date and key details'\n"
        "- For result_aggregator: 'Summarize the Fibonacci calculation results and the generated chart'\n\n"
        "Examples of BAD task_prompts (too vague, just repeats original query):\n"
        "- 'Find the Fibonacci sequence formula, calculate...and generate a visual chart' (this is original query!)\n\n"
        "INCLUDE CONTEXT IN task_prompt:\n"
        "When previous steps have completed, REFERENCE their results in your task_prompt:\n"
        "- 'Based on the Fibonacci sequence [1,1,2,3,5,8,13,21,34,55] from the previous calculation, "
        "  create a bar chart showing these values'\n\n"
        "CRITICAL RULES:\n"
        "1. STRICTLY FOLLOW your planned_sequence - execute each step in ORDER, do not skip steps!\n"
        "2. DO NOT skip to result_aggregator until ALL planned steps are complete.\n"
        "3. Compare execution_history with planned_sequence to find the NEXT unexecuted step.\n"
        "4. Each task type should typically run ONCE per execution. Multiple runs waste resources.\n\n"
        "STEP SELECTION LOGIC:\n"
        "  - Look at your planned_sequence (e.g., ['code_execution', 'result_aggregator'])\n"
        "  - Look at execution_history (e.g., ['CodeExecution:0'])\n"
        "  - The next step is the first item in planned_sequence NOT in execution_history\n"
        "  - In this example: result_aggregator should be next\n\n"
        "IMPORTANT: You MUST explicitly set the needs_followup field for EVERY routing decision:\n"
        "- needs_followup=True: If there are more steps in planned_sequence to execute\n"
        "- needs_followup=False: Only if this is the LAST step (result_aggregator)\n\n"
        "Decision Guidelines:\n"
        "- Follow your planned_sequence STRICTLY - do not skip steps\n"
        "- If user asked for a visual/chart/image, image_generation MUST run before result_aggregator\n"
        "- When in doubt, execute the next planned step rather than jumping to aggregator\n"
        "- Set should_continue=True if more steps remain, False only after result_aggregator\n"
        "- Set next_task_type to the next agent in your planned sequence, or 'end' if truly done\n\n"
        "Analyze the query semantically and return your routing decision with clear reasoning."
        + THINKING_INSTRUCTION
    )

