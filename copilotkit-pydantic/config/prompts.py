"""Agent prompt configurations loaded from database."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from utils.context import context_tuple


# Internal caches keyed by context tuple (<org>, <team>)
_prompts_by_context: Dict[Tuple[str, str], Dict[str, str]] = {}
_agent_types_by_context: Dict[Tuple[str, str], List[str]] = {}
_agent_info_by_context: Dict[Tuple[str, str], Dict[str, Dict[str, Any]]] = {}
# Lookup table: agent_id -> agent_type for each context
_agent_id_to_type_by_context: Dict[Tuple[str, str], Dict[str, str]] = {}


def clear_context_prompts(organization_id: str | None = None, team_id: str | None = None) -> None:
    if organization_id is None and team_id is None:
        _prompts_by_context.clear()
        _agent_types_by_context.clear()
        _agent_info_by_context.clear()
        _agent_id_to_type_by_context.clear()
        return

    key = context_tuple(organization_id, team_id)
    _prompts_by_context.pop(key, None)
    _agent_types_by_context.pop(key, None)
    _agent_info_by_context.pop(key, None)
    _agent_id_to_type_by_context.pop(key, None)


def _load_config() -> Dict[str, Any]:
    """Load agents configuration from database (global context)."""

    from .db_loaders import get_agents_config_from_db
    from . import logger

    return get_agents_config_from_db()


def _build_agent_prompts(config: Dict[str, Any]) -> tuple[Dict[str, str], List[str], Dict[str, Dict[str, Any]], Dict[str, str]]:
    """Build agent prompts and metadata from configuration.
    
    Returns:
        Tuple of (prompts, agent_types, agent_info, agent_id_to_type)
    """
    from config import logger

    prompts: Dict[str, str] = {}
    agent_types: List[str] = []
    agent_info: Dict[str, Dict[str, Any]] = {}
    agent_id_to_type: Dict[str, str] = {}

    for agent_cfg in config.get('agents', []):
        agent_type = agent_cfg['type']
        # Database UUID - may come as uuid.UUID object from psycopg, convert to string
        agent_id_raw = agent_cfg.get('id')
        agent_id = str(agent_id_raw) if agent_id_raw else None
        is_enabled = agent_cfg.get('enabled', True)
        
        # Debug: log what IDs are being processed
        logger.debug(
            "Processing agent '%s': id_raw=%s (type=%s) -> id=%s",
            agent_type,
            repr(agent_id_raw)[:40] if agent_id_raw else None,
            type(agent_id_raw).__name__,
            agent_id[:8] if agent_id else None,
        )
        
        # Build prompt for all agents (needed for auxiliary agent creation, even if disabled)
        prompt = agent_cfg['prompt']
        prompts[agent_type] = prompt.strip()
        
        # Always add to agent_info (needed for auxiliary agent lookups, even if disabled)
        agent_info[agent_type] = {
            'id': agent_id,  # Database ID as string for stable references
            'type': agent_cfg['type'],
            'name': agent_cfg.get('name', agent_type),
            'description': agent_cfg.get('description', ''),
            'enabled': is_enabled,
            'metadata': agent_cfg.get('metadata') or {},
            'allowed_models': agent_cfg.get('allowed_models') or None,
            'allowed_tools': agent_cfg.get('allowed_tools') or None,
        }
        
        # Build ID-to-type lookup for auxiliary agent resolution
        if agent_id:
            agent_id_to_type[agent_id] = agent_type
        
        # Only add enabled agents to agent_types (selectable as main conversation agents)
        if is_enabled:
            agent_types.append(agent_type)

    # Debug: log the ID mappings that were built
    logger.debug(
        "Built agent_id_to_type mapping with %d entries: %s",
        len(agent_id_to_type),
        {k[:8]: v for k, v in list(agent_id_to_type.items())[:10]},  # Truncate IDs for readability
    )
    
    return prompts, agent_types, agent_info, agent_id_to_type


def store_prompts_for_context(
    organization_id: str | None,
    team_id: str | None,
    config: Dict[str, Any],
) -> None:
    prompts, agent_types, agent_info, agent_id_to_type = _build_agent_prompts(config)
    key = context_tuple(organization_id, team_id)
    _prompts_by_context[key] = prompts
    _agent_types_by_context[key] = agent_types
    _agent_info_by_context[key] = agent_info
    _agent_id_to_type_by_context[key] = agent_id_to_type


def get_agent_prompts() -> Dict[str, str]:
    """Get prompts for the global context."""

    key = context_tuple(None, None)
    if key not in _prompts_by_context:
        config = _load_config()
        store_prompts_for_context(None, None, config)
    return _prompts_by_context[key]


def get_agent_prompts_for_context(organization_id: str | None, team_id: str | None) -> Dict[str, str]:
    key = context_tuple(organization_id, team_id)
    prompts = _prompts_by_context.get(key)
    if prompts is None:
        raise RuntimeError(
            f"Agent prompts not loaded for org={organization_id} team={team_id}. "
            "Warm the context via the deployment manager first."
        )
    return prompts


def get_agent_types() -> List[str]:
    key = context_tuple(None, None)
    if key not in _agent_types_by_context:
        config = _load_config()
        store_prompts_for_context(None, None, config)
    return _agent_types_by_context[key]


def get_agent_types_for_context(organization_id: str | None, team_id: str | None) -> List[str]:
    key = context_tuple(organization_id, team_id)
    agent_types = _agent_types_by_context.get(key)
    if agent_types is None:
        raise RuntimeError(
            f"Agent types not loaded for org={organization_id} team={team_id}. "
            "Warm the context via the deployment manager first."
        )
    return agent_types


def get_agent_info(agent_type: str) -> Dict[str, Any] | None:
    key = context_tuple(None, None)
    if key not in _agent_info_by_context:
        config = _load_config()
        store_prompts_for_context(None, None, config)
    return _agent_info_by_context[key].get(agent_type)


def get_agent_info_for_context(
    agent_type: str,
    organization_id: str | None,
    team_id: str | None,
) -> Dict[str, Any] | None:
    key = context_tuple(organization_id, team_id)
    info_map = _agent_info_by_context.get(key)
    if info_map is None:
        raise RuntimeError(
            f"Agent info not loaded for org={organization_id} team={team_id}. "
            "Warm the context via the deployment manager first."
        )
    return info_map.get(agent_type)


def get_agent_info_by_id_for_context(
    agent_id: str,
    organization_id: str | None,
    team_id: str | None,
) -> Dict[str, Any] | None:
    """Get agent info by database ID instead of agent_type.
    
    This provides a stable lookup that doesn't break when agent names change.
    
    Args:
        agent_id: The database UUID of the agent
        organization_id: Organization context
        team_id: Team context
        
    Returns:
        Agent info dict or None if not found
    """
    from config import logger
    
    key = context_tuple(organization_id, team_id)
    
    # Get ID-to-type mapping
    id_to_type = _agent_id_to_type_by_context.get(key)
    if id_to_type is None:
        raise RuntimeError(
            f"Agent info not loaded for org={organization_id} team={team_id}. "
            "Warm the context via the deployment manager first."
        )
    
    # Lookup agent_type by ID
    agent_type = id_to_type.get(agent_id)
    if agent_type is None:
        # Debug: log available IDs to help diagnose lookup failures
        logger.debug(
            "Agent ID '%s' not found in context org=%s team=%s. Available IDs: %s",
            agent_id[:8] if agent_id else 'None',
            organization_id[:8] if organization_id else 'None',
            team_id[:8] if team_id else 'None',
            list(id_to_type.keys())[:10],  # Show up to 10 IDs
        )
        return None
    
    # Get agent info by type
    info_map = _agent_info_by_context.get(key)
    return info_map.get(agent_type) if info_map else None

