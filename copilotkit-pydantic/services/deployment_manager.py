"""Deployment manager coordinating context-specific agent/model availability."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Optional, Tuple, List

from config import logger
from config.db_loaders import fetch_context_bundle
from config.models import store_models_for_context
from config.prompts import store_prompts_for_context
from core.agent_factory import clear_agent_cache, get_agent
from utils.context import ContextKey, context_tuple, make_context_key


DEPLOYMENT_REFRESH_INTERVAL_SECONDS = 15.0


class DeploymentError(Exception):
    """Base exception for deployment issues."""

    status_code: int = 500

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        if status_code is not None:
            self.status_code = status_code


class DeploymentNotReadyError(DeploymentError):
    status_code = 503


class AgentNotAvailableError(DeploymentError):
    status_code = 404


class ModelNotAvailableError(DeploymentError):
    status_code = 404


class EndpointDisabledError(DeploymentError):
    status_code = 403


@dataclass
class DeploymentState:
    context: ContextKey
    status: str = "idle"
    last_refresh: float = field(default_factory=time.time)
    version: Optional[datetime] = None
    providers_meta: Dict[str, Dict[str, any]] = field(default_factory=dict)
    models_meta: Dict[str, Dict[str, any]] = field(default_factory=dict)
    agents_meta: Dict[str, Dict[str, any]] = field(default_factory=dict)
    last_error: Optional[str] = None
    next_version_check: float = field(default_factory=lambda: time.time())


_states: Dict[Tuple[str, str], DeploymentState] = {}
_locks: Dict[Tuple[str, str], asyncio.Lock] = {}


def _get_lock(context_key: Tuple[str, str]) -> asyncio.Lock:
    if context_key not in _locks:
        _locks[context_key] = asyncio.Lock()
    return _locks[context_key]


async def _refresh_context(
    organization_id: Optional[str],
    team_id: Optional[str],
    *,
    force: bool = False,
) -> DeploymentState:
    context = make_context_key(organization_id, team_id)
    key = context.tuple
    lock = _get_lock(key)

    async with lock:
        state = _states.get(key) or DeploymentState(context=context)
        state.status = "deploying"
        state.last_error = None
        _states[key] = state

        try:
            bundle = await fetch_context_bundle(organization_id, team_id)

            if (
                not force
                and state.version is not None
                and bundle.version is not None
                and state.version >= bundle.version
            ):
                # No changes detected; simply update freshness timestamps
                now = time.time()
                state.last_refresh = now
                state.next_version_check = now + DEPLOYMENT_REFRESH_INTERVAL_SECONDS
                state.status = "ready"
                return state

            # Persist models/prompts in respective caches
            store_models_for_context(
                organization_id,
                team_id,
                {
                    'providers': bundle.providers,
                    'models': bundle.models,
                },
            )
            store_prompts_for_context(
                organization_id,
                team_id,
                {
                    'agents': bundle.agents,
                    'base_instructions': bundle.base_instructions,
                },
            )

            # Reset agent cache for this context to ensure new settings take effect
            clear_agent_cache(organization_id, team_id)

            # Update metadata for status reporting
            providers_meta = {
                key: {
                    'type': value.get('type'),
                    'enabled': value.get('enabled', True),
                }
                for key, value in bundle.providers.items()
            }
            models_meta = {
                model['key']: {
                    'provider': model.get('provider'),
                    'display_name': model.get('display_name') or model.get('name'),
                    'enabled': model.get('enabled', True),
                }
                for model in bundle.models
            }
            agents_meta = {
                agent['type']: {
                    'name': agent.get('name', agent['type']),
                    'description': agent.get('description', ''),
                    'enabled': agent.get('enabled', True),
                }
                for agent in bundle.agents
            }

            state.providers_meta = providers_meta
            state.models_meta = models_meta
            state.agents_meta = agents_meta
            state.version = bundle.version
            state.last_refresh = time.time()
            state.next_version_check = state.last_refresh + DEPLOYMENT_REFRESH_INTERVAL_SECONDS
            state.status = "ready"
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.exception(
                "Failed to refresh deployment for org=%s team=%s: %s",
                organization_id,
                team_id,
                exc,
            )
            state.status = "error"
            state.last_error = str(exc)
            raise DeploymentError(str(exc)) from exc

        return state


async def ensure_context_ready(
    organization_id: Optional[str],
    team_id: Optional[str],
    *,
    force: bool = False,
) -> DeploymentState:
    """Ensure the context configuration is loaded and current."""

    context_key = context_tuple(organization_id, team_id)
    state = _states.get(context_key)

    if state is None or force:
        return await _refresh_context(organization_id, team_id, force=True)

    if state.status == "error":
        raise DeploymentNotReadyError(state.last_error or "Deployment is in error state")

    now = time.time()
    if now >= state.next_version_check:
        state = await _refresh_context(organization_id, team_id, force=False)

    if state.status != "ready":
        raise DeploymentNotReadyError("Deployment is not ready")

    return state


async def ensure_agent_ready(
    organization_id: str,
    team_id: str,
    agent_type: str,
    model_key: str,
) -> None:
    """Ensure a specific agent/model endpoint is available for the context."""

    state = await ensure_context_ready(organization_id, team_id)

    agent_meta = state.agents_meta.get(agent_type)
    if agent_meta is None:
        raise AgentNotAvailableError(
            f"Agent '{agent_type}' is not configured for this context"
        )
    if not agent_meta.get('enabled', True):
        raise EndpointDisabledError(f"Agent '{agent_type}' is disabled for this context")

    model_meta = state.models_meta.get(model_key)
    if model_meta is None:
        raise ModelNotAvailableError(
            f"Model '{model_key}' is not configured for this context"
        )
    if not model_meta.get('enabled', True):
        raise EndpointDisabledError(f"Model '{model_key}' is disabled for this context")

    # Touch the agent cache to ensure it can be created without error.
    get_agent(agent_type, model_key, organization_id, team_id)


async def deploy_context(
    organization_id: Optional[str],
    team_id: Optional[str],
    *,
    force: bool = False,
) -> DeploymentState:
    """Public API to deploy or redeploy a context."""

    return await _refresh_context(organization_id, team_id, force=force)


async def restart_context(organization_id: Optional[str], team_id: Optional[str]) -> DeploymentState:
    """Force a context restart regardless of current version."""

    return await _refresh_context(organization_id, team_id, force=True)


def get_context_status(organization_id: Optional[str], team_id: Optional[str]) -> Dict[str, any]:
    context_key = context_tuple(organization_id, team_id)
    state = _states.get(context_key)
    if state is None:
        return {
            'context': {
                'organization_id': organization_id,
                'team_id': team_id,
            },
            'status': 'not_deployed',
        }

    def _summarize_models() -> List[Dict[str, any]]:
        items = []
        for key, meta in state.models_meta.items():
            items.append({
                'key': key,
                'provider': meta.get('provider'),
                'display_name': meta.get('display_name'),
                'enabled': meta.get('enabled', True),
                'status': 'ready' if meta.get('enabled', True) else 'disabled',
            })
        return items

    def _summarize_agents() -> List[Dict[str, any]]:
        items = []
        for key, meta in state.agents_meta.items():
            items.append({
                'type': key,
                'name': meta.get('name', key),
                'description': meta.get('description'),
                'enabled': meta.get('enabled', True),
                'status': 'ready' if meta.get('enabled', True) else 'disabled',
            })
        return items

    def _summarize_providers() -> List[Dict[str, any]]:
        items = []
        for key, meta in state.providers_meta.items():
            items.append({
                'key': key,
                'type': meta.get('type'),
                'enabled': meta.get('enabled', True),
                'status': 'ready' if meta.get('enabled', True) else 'disabled',
            })
        return items

    return {
        'context': {
            'organization_id': organization_id,
            'team_id': team_id,
        },
        'status': state.status,
        'last_refresh': state.last_refresh,
        'version': state.version.isoformat() if state.version else None,
        'error': state.last_error,
        'models': _summarize_models(),
        'agents': _summarize_agents(),
        'providers': _summarize_providers(),
    }


async def initialize_deployments(prewarm_global: bool = True) -> None:
    """Initialize deployment manager on application startup."""

    if prewarm_global:
        await deploy_context(None, None, force=True)


def list_deployments() -> List[Dict[str, any]]:
    return [
        get_context_status(org_id, team_id)
        for (org_id, team_id) in _states.keys()
    ]


