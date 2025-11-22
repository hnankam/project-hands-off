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
from config.prompts import get_agent_prompts_for_context, get_agent_info_for_context
from config.tools import get_tools_for_context, get_mcp_servers_for_context
from config import logger
from core.models import AgentState
from utils.context import context_tuple

if TYPE_CHECKING:
    from tools.agent_tools import register_agent_tools

# Agent cache for reusing agent instances scoped by organization/team
_agent_cache: Dict[Tuple[str, str, str, str], Agent] = {}

BUILTIN_TOOL_REGISTRY = {
    'builtin_web_search': WebSearchTool,
    'builtin_code_execution': CodeExecutionTool,
    'builtin_image_generation': ImageGenerationTool,
    'builtin_memory': MemoryTool,
    'builtin_url_context': UrlContextTool,
}


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


async def create_agent(
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

    tool_definitions = get_tools_for_context(organization_id, team_id)
    mcp_servers = get_mcp_servers_for_context(organization_id, team_id)
    agent_info = get_agent_info_for_context(agent_type, organization_id, team_id) or {}

    allowed_tool_keys = agent_info.get('allowed_tools')
    # logger.debug(
    #     "Agent '%s' allowed_tools from DB: %s (type: %s)",
    #     agent_type,
    #     allowed_tool_keys,
    #     type(allowed_tool_keys).__name__ if allowed_tool_keys is not None else 'None'
    # )
    # logger.debug(
    #     "Available tool_definitions: %d tools - %s",
    #     len(tool_definitions),
    #     list(tool_definitions.keys())[:10] if tool_definitions else []
    # )
    
    # Handle None or empty list - default to all enabled tools
    if not allowed_tool_keys:
        # logger.debug("No specific tools configured for agent '%s', defaulting to all enabled tools", agent_type)
        allowed_tool_keys = [
            key
            for key, data in tool_definitions.items()
            if data.get('enabled', True) and data.get('tool_type') in {'backend', 'builtin', 'mcp', 'frontend'}
        ]
    else:
        # Filter to only include tools that exist and are enabled
        allowed_tool_keys = [
            key
            for key in allowed_tool_keys
            if key in tool_definitions and tool_definitions[key].get('enabled', True)
        ]
        # logger.debug("Agent '%s' has %d allowed tools configured", agent_type, len(allowed_tool_keys))

    # Preserve order while removing duplicates
    seen_keys = set()
    filtered_keys: list[str] = []
    for key in allowed_tool_keys:
        if key not in seen_keys:
            filtered_keys.append(key)
            seen_keys.add(key)
    allowed_tool_keys = filtered_keys
    
    # logger.debug(
    #     "Agent '%s' final tool list after deduplication: %d tools - %s",
    #     agent_type,
    #     len(allowed_tool_keys),
    #     allowed_tool_keys[:10] if allowed_tool_keys else []
    # )

    builtin_tool_instances = []
    allowed_backend_keys: list[str] = []
    allowed_mcp_keys: list[str] = []
    frontend_tool_keys: list[str] = []

    for key in allowed_tool_keys:
        tool_cfg = tool_definitions.get(key)
        if not tool_cfg:
            logger.warning(
                "Tool '%s' referenced by agent '%s' is not defined for org=%s team=%s",
                key,
                agent_type,
                organization_id,
                team_id,
            )
            continue

        tool_type = tool_cfg.get('tool_type')
        if tool_type == 'builtin':
            cls = BUILTIN_TOOL_REGISTRY.get(key)
            if not cls:
                logger.warning(
                    "No builtin tool class registered for key '%s' (agent=%s)", key, agent_type
                )
                continue
            try:
                builtin_tool_instances.append(cls())
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Failed to instantiate builtin tool '%s': %s", key, exc)
        elif tool_type == 'backend':
            allowed_backend_keys.append(key)
        elif tool_type == 'mcp':
            allowed_mcp_keys.append(key)
        elif tool_type == 'frontend':
            frontend_tool_keys.append(key)
        # frontend tools are handled entirely in the extension and ignored here

    # Log tool configuration before agent creation
    logger.info(
        "Creating agent '%s' with model '%s' for org=%s team=%s",
        agent_type,
        model_name,
        organization_id or 'global',
        team_id or 'default'
    )
    logger.info(
        "Tool configuration: builtin=%d, backend=%d, mcp=%d, frontend=%d",
        len(builtin_tool_instances),
        len(allowed_backend_keys),
        len(allowed_mcp_keys),
        len(frontend_tool_keys)
    )
    
    if builtin_tool_instances:
        builtin_names = [type(tool).__name__ for tool in builtin_tool_instances]
        # logger.debug("Builtin tools: %s", ", ".join(builtin_names))
    # if allowed_backend_keys:
        # logger.debug("Backend tools: %s", ", ".join(allowed_backend_keys))
    # if allowed_mcp_keys:
        # logger.debug("MCP tools: %s", ", ".join(allowed_mcp_keys))
    # if frontend_tool_keys:
        # logger.debug("Frontend tools: %s", ", ".join(frontend_tool_keys))
    
    # Import here to avoid circular import
    from tools.agent_tools import get_agent_tools
    
    # logger.debug("Getting backend and MCP tools for agent '%s'", agent_type)
    backend_tools, mcp_toolsets = await get_agent_tools(
        agent_type=agent_type,
        organization_id=organization_id,
        team_id=team_id,
        tool_definitions=tool_definitions,
        mcp_servers=mcp_servers,
        allowed_backend_tools=set(allowed_backend_keys),
        allowed_mcp_tools=set(allowed_mcp_keys),
    )
    
    agent = Agent(
        model,
        instructions=instructions,
        deps_type=StateDeps[AgentState],
        model_settings=model_settings,
        history_processors=[process_message_attachments, keep_recent_messages],
        builtin_tools=builtin_tool_instances,
        tools=backend_tools,  # Backend callable functions
        toolsets=mcp_toolsets,  # MCP toolsets loaded from static config (TESTING)
        retries=3,
    )

    agent.sequential_tool_calls()

    return agent


async def get_agent(
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
        _agent_cache[cache_key] = await create_agent(agent_type, model_name, organization_id, team_id)

    return _agent_cache[cache_key]

