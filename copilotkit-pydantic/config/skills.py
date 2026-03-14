"""Skill configurations loaded from database and cached per context."""

from __future__ import annotations

from typing import Any, Dict, Tuple

from config import logger
from utils.context import context_tuple

_skills_by_context: Dict[Tuple[str, str], Dict[str, Dict[str, Any]]] = {}


def clear_context_skills(organization_id: str | None = None, team_id: str | None = None) -> None:
    """Clear cached skill definitions for a specific context or all contexts."""

    if organization_id is None and team_id is None:
        _skills_by_context.clear()
        return

    key = context_tuple(organization_id, team_id)
    _skills_by_context.pop(key, None)


def store_skills_for_context(
    organization_id: str | None,
    team_id: str | None,
    config: Dict[str, Dict[str, Any]],
) -> None:
    """Store skill configuration for the given context."""

    key = context_tuple(organization_id, team_id)
    skills = dict(config.get('skills') or {})
    _skills_by_context[key] = skills


def get_skills_for_context(organization_id: str | None, team_id: str | None) -> Dict[str, Dict[str, Any]]:
    """Retrieve cached skill definitions for the given context."""

    key = context_tuple(organization_id, team_id)
    skills = _skills_by_context.get(key)
    if skills is None:
        logger.warning(
            "[Skills] No skills in cache for org=%s team=%s",
            organization_id[:8] if organization_id else "global",
            team_id[:8] if team_id else "global",
        )
        raise RuntimeError(
            f"Skill configuration not loaded for org={organization_id} team={team_id}. "
            "Warm the context via the deployment manager first."
        )
    return skills
