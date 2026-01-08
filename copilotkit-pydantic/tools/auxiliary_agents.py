"""Auxiliary agent factory with caching for specialized tool agents.

This module manages auxiliary agents that are used by backend tools for
specialized tasks like image generation, web search, code execution, etc.

There are two types of auxiliary agents:

1. **Built-in Types**: Fixed types that use specific built-in tools
   - image_generation, web_search, code_execution, url_context, memory
   - These have dedicated backend tools (generate_images, web_search, etc.)

2. **Custom Auxiliary Agents**: User-defined agents that can be called via call_agent tool
   - Configured with a unique key, agent_id, and description
   - The main agent learns about them and can call them dynamically

Example metadata structure:
{
    "auxiliary_agents": {
        // Built-in types
        "image_generation": {
            "agent_id": "550e8400-e29b-41d4-a716-446655440000"
        },
        "web_search": {
            "agent_id": "550e8400-e29b-41d4-a716-446655440001"
        },
        // Custom auxiliary agents
        "custom": [
            {
                "key": "research_assistant",
                "agent_id": "550e8400-e29b-41d4-a716-446655440004",
                "description": "Searches and summarizes academic research papers"
        },
            {
                "key": "code_reviewer",
                "agent_id": "550e8400-e29b-41d4-a716-446655440005",
                "description": "Reviews code for bugs, security issues, and best practices"
        }
        ]
    }
}

Using agent_id (database UUID) ensures configurations won't break when 
agent names are changed.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple, TYPE_CHECKING

from pydantic_ai import Agent
from config import logger
from utils.context import context_tuple

if TYPE_CHECKING:
    pass

# Auxiliary agent types
AUXILIARY_AGENT_TYPES = [
    'image_generation',
    'web_search', 
    'code_execution',
    'url_context',
    'memory',
]

# Cache for auxiliary agents
# Key: (org_id, team_id, main_agent_type, aux_type)
# Value: Agent instance
_auxiliary_agent_cache: Dict[Tuple[str, str, str, str], Agent] = {}


def clear_auxiliary_agent_cache(
    organization_id: str | None = None,
    team_id: str | None = None,
    main_agent_type: str | None = None,
    aux_type: str | None = None,
) -> None:
    """Clear cached auxiliary agent instances.
    
    Args:
        organization_id: Clear only for this org (None = all orgs)
        team_id: Clear only for this team (None = all teams)
        main_agent_type: Clear only for this main agent (None = all)
        aux_type: Clear only this auxiliary type (None = all types)
    """
    if all(x is None for x in [organization_id, team_id, main_agent_type, aux_type]):
        _auxiliary_agent_cache.clear()
        logger.info("Cleared all auxiliary agent cache")
        return
    
    org_token, team_token = context_tuple(organization_id, team_id)
    
    keys_to_remove = [
        key for key in _auxiliary_agent_cache
        if (organization_id is None or key[0] == org_token)
        and (team_id is None or key[1] == team_token)
        and (main_agent_type is None or key[2] == main_agent_type)
        and (aux_type is None or key[3] == aux_type)
    ]
    
    for key in keys_to_remove:
        _auxiliary_agent_cache.pop(key, None)
    
    if keys_to_remove:
        logger.info(
            "Cleared %d auxiliary agent cache entries for org=%s team=%s agent=%s aux=%s",
            len(keys_to_remove),
            organization_id[:8] if organization_id else '*',
            team_id[:8] if team_id else '*',
            main_agent_type or '*',
            aux_type or '*',
        )


async def get_auxiliary_agent(
    aux_type: str,
    main_agent_type: str,
    main_agent_metadata: Dict[str, Any],
    organization_id: str | None,
    team_id: str | None,
) -> Optional[Agent]:
    """Get or create a cached auxiliary agent from metadata configuration.
    
    Args:
        aux_type: Type of auxiliary agent ('image_generation', 'web_search', etc.)
        main_agent_type: The main agent's type (for cache key)
        main_agent_metadata: The main agent's metadata containing auxiliary_agents config
        organization_id: Organization context
        team_id: Team context
        
    Returns:
        Configured Agent instance, or None if not configured
        
    Example metadata structure:
        {
            "auxiliary_agents": {
                "image_generation": {
                    "agent_id": "550e8400-e29b-41d4-a716-446655440000"
                }
            }
        }
    """
    # Validate aux_type
    if aux_type not in AUXILIARY_AGENT_TYPES:
        logger.warning(
            "Unknown auxiliary agent type '%s'. Valid types: %s",
            aux_type,
            AUXILIARY_AGENT_TYPES,
        )
        return None
    
    # Get auxiliary agent config from metadata
    aux_agents_config = main_agent_metadata.get('auxiliary_agents', {})
    if not aux_agents_config:
        logger.debug(
            "No auxiliary_agents configured in metadata for main agent '%s'",
            main_agent_type,
        )
        return None
    
    aux_config = aux_agents_config.get(aux_type)
    if not aux_config:
        logger.debug(
            "Auxiliary agent type '%s' not configured for main agent '%s'",
            aux_type,
            main_agent_type,
        )
        return None
    
    # Import config functions
    from config.prompts import get_agent_info_by_id_for_context
    
    # Get agent_id (required)
    aux_agent_id = aux_config.get('agent_id')
    if not aux_agent_id:
        logger.warning(
            "Auxiliary agent config for '%s' missing 'agent_id' in main agent '%s'. "
            "Configure using: {\"auxiliary_agents\": {\"%s\": {\"agent_id\": \"<uuid>\"}}}",
            aux_type,
            main_agent_type,
            aux_type,
        )
        return None
    
    # Lookup by stable database ID
    aux_agent_info = get_agent_info_by_id_for_context(aux_agent_id, organization_id, team_id)
    if not aux_agent_info:
        logger.warning(
            "Auxiliary agent ID '%s' not found for '%s' in main agent '%s'. "
            "The agent may have been deleted.",
            aux_agent_id[:8] if aux_agent_id else 'None',
            aux_type,
            main_agent_type,
        )
        return None
    
    aux_agent_type = aux_agent_info.get('type')
    logger.debug(
        "Resolved auxiliary agent by ID: %s -> type=%s",
        aux_agent_id[:8],
        aux_agent_type,
    )
    
    if not aux_agent_type:
        logger.warning(
            "Could not resolve auxiliary agent type for '%s' in main agent '%s'",
            aux_type,
            main_agent_type,
        )
        return None
    
    # Build cache key
    org_token, team_token = context_tuple(organization_id, team_id)
    cache_key = (org_token, team_token, main_agent_type, aux_type)
    
    # Check cache
    if cache_key in _auxiliary_agent_cache:
        logger.debug(
            "Using cached auxiliary agent '%s' for main agent '%s'",
            aux_type,
            main_agent_type,
        )
        return _auxiliary_agent_cache[cache_key]
    
    # Create auxiliary agent using the agent factory
    try:
        from core.agent_factory import get_agent
        from config.models import get_models_for_context
        
        # aux_agent_info was already fetched above
        
        # Get available models for context
        models = get_models_for_context(organization_id, team_id)
        if not models:
            logger.error(
                "No models available for auxiliary agent '%s' in org=%s team=%s",
                aux_agent_type,
                organization_id,
                team_id,
            )
            return None
        
        # Auxiliary agent MUST have allowed_models configured - no fallback
        if not aux_agent_info:
            logger.error(
                "Auxiliary agent '%s' not found in configuration for org=%s team=%s",
                aux_agent_type,
                organization_id,
                team_id,
            )
            return None
        
        allowed_models = aux_agent_info.get('allowed_models')
        if not allowed_models:
            logger.error(
                "Auxiliary agent '%s' has no models configured. "
                "Please configure at least one model for the auxiliary agent.",
                aux_agent_type,
            )
            return None
        
        # Find the first allowed model that's actually available in context
        model_name = None
        for allowed_model in allowed_models:
            if allowed_model in models:
                model_name = allowed_model
                logger.debug(
                    "Using auxiliary agent's configured model '%s' for '%s'",
                    model_name,
                    aux_agent_type,
                )
                break
        
        if model_name is None:
            logger.error(
                "None of auxiliary agent '%s' allowed_models %s are available in context. "
                "Available models: %s",
                aux_agent_type,
                allowed_models,
                list(models.keys()),
            )
            return None
        
        # Create the agent
        agent = await get_agent(
            agent_type=aux_agent_type,
            model_name=model_name,
            organization_id=organization_id,
            team_id=team_id,
        )
        
        # Cache the agent
        _auxiliary_agent_cache[cache_key] = agent
        
        logger.info(
            "Created and cached auxiliary agent '%s' (type=%s, model=%s) for main agent '%s'",
            aux_type,
            aux_agent_type,
            model_name,
            main_agent_type,
        )
        
        return agent
        
    except KeyError as e:
        logger.error(
            "Failed to create auxiliary agent '%s' (type=%s): Agent type not found - %s",
            aux_type,
            aux_agent_type,
            str(e),
        )
        return None
    except Exception as e:
        logger.error(
            "Failed to create auxiliary agent '%s' (type=%s): %s",
            aux_type,
            aux_agent_type,
            str(e),
        )
        return None


def get_auxiliary_agent_config(
    aux_type: str,
    main_agent_metadata: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Get the configuration for an auxiliary agent without creating it.
    
    Useful for checking if an auxiliary agent is configured.
    
    Args:
        aux_type: Type of auxiliary agent
        main_agent_metadata: The main agent's metadata
        
    Returns:
        Configuration dict or None if not configured
    """
    aux_agents_config = main_agent_metadata.get('auxiliary_agents', {})
    return aux_agents_config.get(aux_type)


def list_configured_auxiliary_agents(
    main_agent_metadata: Dict[str, Any],
) -> list[str]:
    """List all built-in auxiliary agent types configured in metadata.
    
    Args:
        main_agent_metadata: The main agent's metadata
        
    Returns:
        List of configured auxiliary agent type strings
    """
    aux_agents_config = main_agent_metadata.get('auxiliary_agents', {})
    return [
        aux_type for aux_type in AUXILIARY_AGENT_TYPES
        if aux_type in aux_agents_config and aux_agents_config[aux_type].get('agent_id')
    ]


# ========== Custom Auxiliary Agents ==========

def get_custom_auxiliary_agents_config(
    main_agent_metadata: Dict[str, Any],
) -> list[Dict[str, Any]]:
    """Get the list of custom auxiliary agent configurations.
    
    Args:
        main_agent_metadata: The main agent's metadata
        
    Returns:
        List of custom auxiliary agent configs, each with 'key', 'agent_id', 'description'
    """
    aux_agents_config = main_agent_metadata.get('auxiliary_agents', {})
    custom_agents = aux_agents_config.get('custom', [])
    
    # Validate and filter to only valid configs
    valid_configs = []
    for config in custom_agents:
        if isinstance(config, dict) and config.get('key') and config.get('agent_id'):
            valid_configs.append({
                'key': config['key'],
                'agent_id': config['agent_id'],
                'description': config.get('description', ''),
            })
    
    return valid_configs


def get_custom_auxiliary_agent_by_key(
    agent_key: str,
    main_agent_metadata: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Get a custom auxiliary agent config by its key.
    
    Args:
        agent_key: The unique key for the custom auxiliary agent
        main_agent_metadata: The main agent's metadata
        
    Returns:
        The config dict with 'key', 'agent_id', 'description', or None if not found
    """
    custom_agents = get_custom_auxiliary_agents_config(main_agent_metadata)
    for config in custom_agents:
        if config['key'] == agent_key:
            return config
    return None


async def get_custom_auxiliary_agent(
    agent_key: str,
    main_agent_type: str,
    main_agent_metadata: Dict[str, Any],
    organization_id: str | None,
    team_id: str | None,
) -> Optional[Agent]:
    """Get or create a cached custom auxiliary agent by its key.
    
    Custom auxiliary agents are different from built-in types (image_generation, etc.)
    in that they are user-defined and called via the generic call_agent tool.
    
    Args:
        agent_key: The unique key for the custom auxiliary agent
        main_agent_type: The main agent's type (for cache key)
        main_agent_metadata: The main agent's metadata containing auxiliary_agents.custom config
        organization_id: Organization context
        team_id: Team context
        
    Returns:
        Configured Agent instance, or None if not configured
    """
    # Get the custom agent config
    custom_config = get_custom_auxiliary_agent_by_key(agent_key, main_agent_metadata)
    if not custom_config:
        logger.debug(
            "Custom auxiliary agent '%s' not configured for main agent '%s'",
            agent_key,
            main_agent_type,
        )
        return None
    
    aux_agent_id = custom_config['agent_id']
    
    # Import config functions
    from config.prompts import get_agent_info_by_id_for_context
    
    # Lookup by stable database ID
    aux_agent_info = get_agent_info_by_id_for_context(aux_agent_id, organization_id, team_id)
    if not aux_agent_info:
        logger.warning(
            "Custom auxiliary agent ID '%s' (key='%s') not found for main agent '%s'. "
            "The agent may have been deleted.",
            aux_agent_id[:8] if aux_agent_id else 'None',
            agent_key,
            main_agent_type,
        )
        return None
    
    aux_agent_type = aux_agent_info.get('type')
    logger.debug(
        "Resolved custom auxiliary agent by key '%s': id=%s -> type=%s",
        agent_key,
        aux_agent_id[:8],
        aux_agent_type,
    )
    
    if not aux_agent_type:
        logger.warning(
            "Could not resolve agent type for custom auxiliary agent '%s' in main agent '%s'",
            agent_key,
            main_agent_type,
        )
        return None
    
    # Build cache key (using 'custom:' prefix to distinguish from built-in types)
    org_token, team_token = context_tuple(organization_id, team_id)
    cache_key = (org_token, team_token, main_agent_type, f"custom:{agent_key}")
    
    # Check cache
    if cache_key in _auxiliary_agent_cache:
        logger.debug(
            "Using cached custom auxiliary agent '%s' for main agent '%s'",
            agent_key,
            main_agent_type,
        )
        return _auxiliary_agent_cache[cache_key]
    
    # Create auxiliary agent using the agent factory
    try:
        from core.agent_factory import get_agent
        from config.models import get_models_for_context
        
        # Get available models for context
        models = get_models_for_context(organization_id, team_id)
        if not models:
            logger.error(
                "No models available for custom auxiliary agent '%s' in org=%s team=%s",
                agent_key,
                organization_id,
                team_id,
            )
            return None
        
        # Custom auxiliary agent MUST have allowed_models configured
        allowed_models = aux_agent_info.get('allowed_models')
        if not allowed_models:
            logger.error(
                "Custom auxiliary agent '%s' (type=%s) has no models configured. "
                "Please configure at least one model for the auxiliary agent.",
                agent_key,
                aux_agent_type,
            )
            return None
        
        # Find the first allowed model that's actually available in context
        model_name = None
        for allowed_model in allowed_models:
            if allowed_model in models:
                model_name = allowed_model
                logger.debug(
                    "Using model '%s' for custom auxiliary agent '%s'",
                    model_name,
                    agent_key,
                )
                break
        
        if model_name is None:
            logger.error(
                "None of custom auxiliary agent '%s' allowed_models %s are available in context. "
                "Available models: %s",
                agent_key,
                allowed_models,
                list(models.keys()),
            )
            return None
        
        # Create the agent
        agent = await get_agent(
            agent_type=aux_agent_type,
            model_name=model_name,
            organization_id=organization_id,
            team_id=team_id,
        )
        
        # Cache the agent
        _auxiliary_agent_cache[cache_key] = agent
        
        logger.info(
            "Created and cached custom auxiliary agent '%s' (type=%s, model=%s) for main agent '%s'",
            agent_key,
            aux_agent_type,
            model_name,
            main_agent_type,
        )
        
        return agent
        
    except KeyError as e:
        logger.error(
            "Failed to create custom auxiliary agent '%s' (type=%s): Agent type not found - %s",
            agent_key,
            aux_agent_type,
            str(e),
        )
        return None
    except Exception as e:
        logger.error(
            "Failed to create custom auxiliary agent '%s' (type=%s): %s",
            agent_key,
            aux_agent_type,
            str(e),
        )
        return None


def build_custom_auxiliary_agents_instructions(
    main_agent_metadata: Dict[str, Any],
    organization_id: str | None,
    team_id: str | None,
) -> str:
    """Build instruction text describing available custom auxiliary agents.
    
    This is used to inform the main agent about which custom auxiliary agents
    are available and what they do, so it can use the call_agent tool appropriately.
    
    Args:
        main_agent_metadata: The main agent's metadata
        organization_id: Organization context (for resolving agent names)
        team_id: Team context (for resolving agent names)
        
    Returns:
        Instruction text to append to agent's base instructions, or empty string
    """
    custom_agents = get_custom_auxiliary_agents_config(main_agent_metadata)
    
    if not custom_agents:
        return ""
    
    # Import config functions for resolving agent names
    from config.prompts import get_agent_info_by_id_for_context
    
    # Build the instruction text
    lines = [
        "",
        "=== Custom Auxiliary Agents ===",
        "",
        "You have access to specialized auxiliary agents that you can call using the `call_agent` tool.",
        "Use these agents to delegate specialized tasks. Each agent has specific capabilities:",
        "",
    ]
    
    valid_agents = []
    for config in custom_agents:
        agent_key = config['key']
        agent_id = config['agent_id']
        description = config.get('description', 'No description provided')
        
        # Try to resolve agent name from ID
        agent_info = get_agent_info_by_id_for_context(agent_id, organization_id, team_id)
        if agent_info:
            agent_name = agent_info.get('name', agent_key)
            valid_agents.append({
                'key': agent_key,
                'name': agent_name,
                'description': description,
            })
        else:
            logger.debug(
                "Custom auxiliary agent '%s' (id=%s) not found in context, skipping from instructions",
                agent_key,
                agent_id[:8] if agent_id else 'None',
            )
    
    if not valid_agents:
        return ""
    
    for agent in valid_agents:
        lines.append(f"agent_key: {agent['key']}")
        lines.append(f"description: {agent['description']}")
        lines.append("")
    
    return "\n".join(lines)

