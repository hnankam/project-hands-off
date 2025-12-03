"""Auxiliary agent factory with caching for specialized tool agents.

This module manages auxiliary agents that are used by backend tools for
specialized tasks like image generation, web search, code execution, etc.

Auxiliary agents are configured in the main agent's metadata field:

{
    "auxiliary_agents": {
        "image_generation": {
            "agent_type": "image-gen-agent"
        },
        "web_search": {
            "agent_type": "web-search-agent"
        },
        "code_execution": {
            "agent_type": "code-exec-agent"
        },
        "url_context": {
            "agent_type": "url-context-agent"
        },
        "memory": {
            "agent_type": "memory-agent"
        }
    }
}
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
                    "agent_type": "my-image-agent"
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
    
    aux_agent_type = aux_config.get('agent_type')
    if not aux_agent_type:
        logger.warning(
            "Auxiliary agent config for '%s' missing 'agent_type' field in main agent '%s'",
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
        from config.prompts import get_agent_info_for_context
        
        # Get the auxiliary agent's own configuration to find its allowed models
        aux_agent_info = get_agent_info_for_context(aux_agent_type, organization_id, team_id)
        
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
    """List all auxiliary agent types configured in metadata.
    
    Args:
        main_agent_metadata: The main agent's metadata
        
    Returns:
        List of configured auxiliary agent type strings
    """
    aux_agents_config = main_agent_metadata.get('auxiliary_agents', {})
    return [
        aux_type for aux_type in AUXILIARY_AGENT_TYPES
        if aux_type in aux_agents_config and aux_agents_config[aux_type].get('agent_type')
    ]

