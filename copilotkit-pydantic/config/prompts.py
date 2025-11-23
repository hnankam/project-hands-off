"""Agent prompt configurations loaded from database."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from utils.context import context_tuple


# Internal caches keyed by context tuple (<org>, <team>)
_prompts_by_context: Dict[Tuple[str, str], Dict[str, str]] = {}
_agent_types_by_context: Dict[Tuple[str, str], List[str]] = {}
_agent_info_by_context: Dict[Tuple[str, str], Dict[str, Dict[str, Any]]] = {}


def clear_context_prompts(organization_id: str | None = None, team_id: str | None = None) -> None:
    if organization_id is None and team_id is None:
        _prompts_by_context.clear()
        _agent_types_by_context.clear()
        _agent_info_by_context.clear()
        return

    key = context_tuple(organization_id, team_id)
    _prompts_by_context.pop(key, None)
    _agent_types_by_context.pop(key, None)
    _agent_info_by_context.pop(key, None)


def _load_config() -> Dict[str, Any]:
    """Load agents configuration from database (global context)."""

    from .db_loaders import get_agents_config_from_db
    from . import logger

    return get_agents_config_from_db()


def _build_agent_prompts(config: Dict[str, Any]) -> tuple[Dict[str, str], List[str], Dict[str, Dict[str, Any]]]:
    """Build agent prompts and metadata from configuration with substitution."""

    base_instructions = config.get('base_instructions', {})
    general_instruction = base_instructions.get('general_instruction', '')
    planning_instruction = base_instructions.get('planning_instruction', '')

    prompts: Dict[str, str] = {}
    agent_types: List[str] = []
    agent_info: Dict[str, Dict[str, Any]] = {}

    for agent_cfg in config.get('agents', []):
        if not agent_cfg.get('enabled', True):
            continue

        agent_type = agent_cfg['type']
        prompt_template = agent_cfg['prompt']
        prompt = prompt_template.format(
            general_instruction=general_instruction,
            planning_instruction=planning_instruction,
        )

        prompts[agent_type] = prompt.strip()
        agent_types.append(agent_type)
        agent_info[agent_type] = {
            'type': agent_cfg['type'],
            'name': agent_cfg.get('name', agent_type),
            'description': agent_cfg.get('description', ''),
            'enabled': agent_cfg.get('enabled', True),
            'allowed_models': agent_cfg.get('allowed_models') or None,
            'allowed_tools': agent_cfg.get('allowed_tools') or None,
        }

    return prompts, agent_types, agent_info


def store_prompts_for_context(
    organization_id: str | None,
    team_id: str | None,
    config: Dict[str, Any],
) -> None:
    prompts, agent_types, agent_info = _build_agent_prompts(config)
    key = context_tuple(organization_id, team_id)
    _prompts_by_context[key] = prompts
    _agent_types_by_context[key] = agent_types
    _agent_info_by_context[key] = agent_info


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

