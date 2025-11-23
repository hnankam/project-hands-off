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
from config.tools import store_tools_for_context
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
    tools_meta: Dict[str, Dict[str, any]] = field(default_factory=dict)
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
                now = time.time()
                state.last_refresh = now
                state.next_version_check = now + DEPLOYMENT_REFRESH_INTERVAL_SECONDS
                state.status = "ready"
                return state
            
            if force:
                logger.info(
                    "[Refresh] ⚡ Force reload enabled - bypassing version check, applying all configurations from DB"
                )

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
            store_tools_for_context(
                organization_id,
                team_id,
                {
                    'tools': bundle.tools,
                    'mcp_servers': bundle.mcp_servers,
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
                    'allowed_models': agent.get('allowed_models') or None,
                    'allowed_tools': agent.get('allowed_tools') or None,
                }
                for agent in bundle.agents
            }
            tools_meta = {
                key: {
                    'name': value.get('tool_name', key),
                    'type': value.get('tool_type'),
                    'enabled': value.get('enabled', True),
                    'readonly': value.get('readonly', False),
                }
                for key, value in bundle.tools.items()
            }

            state.providers_meta = providers_meta
            state.models_meta = models_meta
            state.agents_meta = agents_meta
            state.tools_meta = tools_meta
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

    allowed_models = agent_meta.get('allowed_models') or None
    if allowed_models and model_key not in allowed_models:
        raise EndpointDisabledError(
            f"Agent '{agent_type}' is not configured to use model '{model_key}'"
        )

    model_meta = state.models_meta.get(model_key)
    if model_meta is None:
        raise ModelNotAvailableError(
            f"Model '{model_key}' is not configured for this context"
        )
    if not model_meta.get('enabled', True):
        raise EndpointDisabledError(f"Model '{model_key}' is disabled for this context")

    # Touch the agent cache to ensure it can be created without error.
    await get_agent(agent_type, model_key, organization_id, team_id)


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
    
    logger.info(
        "[Restart] 🔄 Initiating context restart for org=%s team=%s (force reload from DB)",
        organization_id[:8] if organization_id else 'global',
        team_id[:8] if team_id else 'org-wide'
    )

    state = await _refresh_context(organization_id, team_id, force=True)
    
    return state


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

    def _summarize_tools() -> List[Dict[str, any]]:
        items = []
        for key, meta in state.tools_meta.items():
            items.append({
                'key': key,
                'name': meta.get('name', key),
                'type': meta.get('type'),
                'enabled': meta.get('enabled', True),
                'status': 'ready' if meta.get('enabled', True) else 'disabled',
                'readonly': meta.get('readonly', False),
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
        'tools': _summarize_tools(),
    }


async def prewarm_user_context(organization_id: str, team_id: Optional[str] = None) -> None:
    """Prewarm deployment for a specific user's organization context.
    
    This is called on first authenticated request to eagerly load the user's
    organization deployments.
    """
    from database.connection import get_db_connection
    
    # Check if already loaded
    context_key = context_tuple(organization_id, team_id)
    if context_key in _states and _states[context_key].status == 'ready':
        return
    
    try:
        # Find all team contexts for this organization using junction tables
        async with get_db_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    SELECT DISTINCT %(org_id)s AS organization_id, team_id 
                    FROM (
                        SELECT mt.team_id FROM model_teams mt
                        JOIN models m ON m.id = mt.model_id
                        WHERE m.organization_id = %(org_id)s
                        UNION
                        SELECT at.team_id FROM agent_teams at
                        JOIN agents a ON a.id = at.agent_id
                        WHERE a.organization_id = %(org_id)s
                        UNION
                        SELECT pt.team_id FROM provider_teams pt
                        JOIN providers p ON p.id = pt.provider_id
                        WHERE p.organization_id = %(org_id)s
                        UNION
                        -- Also include org-wide resources (no team association)
                        SELECT NULL AS team_id
                        WHERE EXISTS (
                            SELECT 1 FROM models WHERE organization_id = %(org_id)s
                            AND NOT EXISTS (SELECT 1 FROM model_teams WHERE model_id = models.id)
                        )
                        OR EXISTS (
                            SELECT 1 FROM agents WHERE organization_id = %(org_id)s
                            AND NOT EXISTS (SELECT 1 FROM agent_teams WHERE agent_id = agents.id)
                        )
                        OR EXISTS (
                            SELECT 1 FROM providers WHERE organization_id = %(org_id)s
                            AND NOT EXISTS (SELECT 1 FROM provider_teams WHERE provider_id = providers.id)
                        )
                    ) AS configs
                    ORDER BY team_id NULLS FIRST
                """, {'org_id': organization_id})
                contexts = await cur.fetchall()
        
        if not contexts:
            return
                
        # Prewarm each context for this organization in parallel
        await asyncio.gather(
            *[
                _safe_deploy_context(ctx['organization_id'], ctx['team_id'])
                for ctx in contexts
            ]
        )
        
    except Exception as exc:
        logger.warning(f"Failed to prewarm user context: {exc}")


async def _safe_deploy_context(organization_id: str, team_id: Optional[str]) -> None:
    """Helper to deploy context and catch errors without stopping the batch."""
    try:
        await deploy_context(organization_id, team_id, force=False)
    except Exception as exc:
        logger.warning(f"  ✗ Failed to prewarm org={organization_id} team={team_id}: {exc}")


async def initialize_deployments(prewarm_global: bool = True) -> None:
    """Initialize deployment manager on application startup.
    
    Deployments are now loaded on-demand when users first authenticate.
    """
    pass

def list_deployments() -> List[Dict[str, any]]:
    return [
        get_context_status(org_id, team_id)
        for (org_id, team_id) in _states.keys()
    ]


def list_endpoints() -> List[Dict[str, any]]:
    """List all available agent/model endpoints across all deployed contexts."""
    endpoints = []
    
    for (org_id, team_id), state in _states.items():
        # Determine endpoint status based on deployment state
        endpoint_status = 'ready' if state.status == 'ready' else state.status
            
        # Create endpoints for each agent/model combination
        for agent_key, agent_meta in state.agents_meta.items():
            # Show all agents, but mark disabled ones
            agent_enabled = agent_meta.get('enabled', True)
            allowed_models = agent_meta.get('allowed_models') or None
            allowed_set = set(allowed_models) if allowed_models else None
                
            for model_key, model_meta in state.models_meta.items():
                # Show all models, but mark disabled ones
                model_enabled = model_meta.get('enabled', True)

                if allowed_set is not None and model_key not in allowed_set:
                    continue
                
                # Determine final status
                if not agent_enabled or not model_enabled:
                    final_status = 'disabled'
                else:
                    final_status = endpoint_status
                    
                endpoints.append({
                    'context': {
                        'organization_id': org_id if org_id != '__global__' else None,
                        'team_id': team_id if team_id != '__global__' else None,
                    },
                    'agent': {
                        'type': agent_key,
                        'name': agent_meta.get('name', agent_key),
                        'description': agent_meta.get('description'),
                        'enabled': agent_enabled,
                    },
                    'model': {
                        'key': model_key,
                        'provider': model_meta.get('provider'),
                        'display_name': model_meta.get('display_name'),
                        'enabled': model_enabled,
                    },
                    'status': final_status,
                    'endpoint': f'/agent/{agent_key}/{model_key}',
                })
    
    return endpoints
