"""Agent factory for creating and caching agent instances."""

from __future__ import annotations

from typing import Dict, Tuple, TYPE_CHECKING

from pydantic_ai import Agent
from pydantic_ai.builtin_tools import (
    CodeExecutionTool,
    ImageGenerationTool,
    MemoryTool,
    UrlContextTool,
    WebSearchTool,
)
from pydantic_ai.ag_ui import StateDeps

from config.models import get_models_for_context
from config.prompts import get_agent_prompts_for_context
from config import logger
from core.models import AgentState
from utils.context import context_tuple

if TYPE_CHECKING:
    from tools.agent_tools import register_agent_tools

# Agent cache for reusing agent instances scoped by organization/team
_agent_cache: Dict[Tuple[str, str, str, str], Agent] = {}


def clear_agent_cache(organization_id: str | None = None, team_id: str | None = None) -> None:
    """Clear cached agent instances for a specific context or all contexts."""

    if organization_id is None and team_id is None:
        _agent_cache.clear()
        return

    org_token, team_token = context_tuple(organization_id, team_id)
    keys_to_remove = [
        key for key in _agent_cache
        if key[0] == org_token and key[1] == team_token
    ]
    for key in keys_to_remove:
        _agent_cache.pop(key, None)


def create_agent(
    agent_type: str,
    model_name: str,
    organization_id: str | None,
    team_id: str | None,
) -> Agent:
    """Create an agent with the specified type, model, and context."""

    from utils.message_processor import process_message_attachments, keep_recent_messages

    models = get_models_for_context(organization_id, team_id)
    if model_name not in models:
        raise KeyError(
            f"Model '{model_name}' is not available for org={organization_id} team={team_id}"
        )

    prompts = get_agent_prompts_for_context(organization_id, team_id)
    instructions = prompts.get(agent_type)
    if instructions is None:
        # Fall back to a generic instruction if present; otherwise raise
        instructions = prompts.get('general')
    if instructions is None:
        raise KeyError(
            f"Agent '{agent_type}' is not available for org={organization_id} team={team_id}"
        )

    model_entry = models[model_name]
    model = model_entry['model']
    model_settings = model_entry['model_settings']

    agent = Agent(
        model,
        instructions=instructions,
        deps_type=StateDeps[AgentState],
        model_settings=model_settings,
        history_processors=[process_message_attachments, keep_recent_messages],
        builtin_tools=[
            # WebSearchTool(),
            # CodeExecutionTool(),
            # ImageGenerationTool(),
            # UrlContextTool(),
            # MemoryTool(),
        ],
        retries=3,
    )

    agent.sequential_tool_calls()
    
    # Import here to avoid circular import
    from tools.agent_tools import register_agent_tools
    register_agent_tools(agent)

    return agent


def get_agent(
    agent_type: str,
    model_name: str,
    organization_id: str | None,
    team_id: str | None,
) -> Agent:
    """Get or create an agent with caching for the specified context."""

    org_token, team_token = context_tuple(organization_id, team_id)
    cache_key = (org_token, team_token, agent_type, model_name)

    if cache_key not in _agent_cache:
        logger.info(
            "Creating new agent type=%s model=%s org=%s team=%s",
            agent_type,
            model_name,
            organization_id,
            team_id,
        )
        _agent_cache[cache_key] = create_agent(agent_type, model_name, organization_id, team_id)

    return _agent_cache[cache_key]

