"""Database loaders for multi-tenant configuration data."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from database import get_db_connection
from config import logger
from utils.context import ContextKey, make_context_key
import psycopg


@dataclass
class ContextBundle:
    """Raw configuration bundle fetched from the database for a scope."""

    context: ContextKey
    providers: Dict[str, Dict[str, Any]]
    models: List[Dict[str, Any]]
    agents: List[Dict[str, Any]]
    base_instructions: Dict[str, str]
    version: Optional[datetime]


def _scope_rank(
    row_org: Optional[str],
    row_team: Optional[str],
    organization_id: Optional[str],
    team_id: Optional[str],
) -> int:
    """Compute precedence rank for scoped configuration rows."""

    if team_id is not None and row_team == team_id and row_org == organization_id:
        return 0  # team-level override
    if organization_id is not None and row_org == organization_id and row_team is None:
        return 1  # organization-level override
    if row_org is None and row_team is None:
        return 2  # global default
    return 3


def _max_timestamp(current: Optional[datetime], candidate: Optional[datetime]) -> Optional[datetime]:
    if candidate is None:
        return current
    if current is None or candidate > current:
        return candidate
    return current


def _build_scope_condition(
    col_org: str,
    col_team: str,
    organization_id: Optional[str],
    team_id: Optional[str],
) -> Tuple[str, Dict[str, Any]]:
    clauses: List[str] = []
    params: Dict[str, Any] = {}

    if organization_id is not None:
        clauses.append(f"({col_org} = %(organization_id)s OR {col_org} IS NULL)")
        params['organization_id'] = organization_id
    else:
        clauses.append(f"{col_org} IS NULL")

    if team_id is not None:
        clauses.append(f"({col_team} = %(team_id)s OR {col_team} IS NULL)")
        params['team_id'] = team_id
    else:
        clauses.append(f"{col_team} IS NULL")

    return " AND ".join(clauses), params


async def fetch_context_bundle(
    organization_id: Optional[str],
    team_id: Optional[str],
) -> ContextBundle:
    """Fetch configuration bundle for a specific org/team scope."""

    context = make_context_key(organization_id, team_id)
    last_error: Optional[Exception] = None

    for attempt in range(3):
        providers: Dict[str, Dict[str, Any]] = {}
        provider_ranks: Dict[str, int] = {}

        models_map: Dict[str, Dict[str, Any]] = {}
        model_ranks: Dict[str, int] = {}

        agents_map: Dict[str, Dict[str, Any]] = {}
        agent_ranks: Dict[str, int] = {}

        instructions_map: Dict[str, Dict[str, Any]] = {}
        instruction_ranks: Dict[str, int] = {}

        max_version: Optional[datetime] = None

        try:
            async with get_db_connection() as conn:
                async with conn.cursor() as cur:
                    # Providers
                    provider_where, provider_params = _build_scope_condition(
                        "organization_id", "team_id", organization_id, team_id
                    )
                    await cur.execute(
                        f"""
                        SELECT provider_key,
                               provider_type,
                               credentials,
                               model_settings,
                               bedrock_model_settings,
                               organization_id,
                               team_id,
                               enabled,
                               updated_at,
                               created_at
                          FROM providers
                         WHERE {provider_where}
                         ORDER BY enabled DESC, provider_key
                        """,
                        provider_params,
                    )
                    provider_rows = await cur.fetchall()
                    for row in provider_rows:
                        rank = _scope_rank(row['organization_id'], row['team_id'], organization_id, team_id)
                        existing_rank = provider_ranks.get(row['provider_key'])
                        if existing_rank is None or rank < existing_rank:
                            providers[row['provider_key']] = {
                                'type': row['provider_type'],
                                'credentials': row['credentials'],
                                'model_settings': row['model_settings'],
                                'bedrock_model_settings': row['bedrock_model_settings'],
                                'enabled': row['enabled'],
                            }
                            provider_ranks[row['provider_key']] = rank
                        max_version = _max_timestamp(max_version, row.get('updated_at') or row.get('created_at'))

                    # Models
                    model_where, model_params = _build_scope_condition(
                        "m.organization_id", "m.team_id", organization_id, team_id
                    )
                    await cur.execute(
                        f"""
                        SELECT m.model_key,
                               m.model_name,
                               m.display_name,
                               m.model_settings_override,
                               m.organization_id,
                               m.team_id,
                               m.enabled,
                               p.provider_key,
                               m.updated_at,
                               m.created_at
                          FROM models m
                          JOIN providers p ON m.provider_id = p.id
                         WHERE {model_where}
                         ORDER BY m.enabled DESC, m.model_key
                        """,
                        model_params,
                    )
                    model_rows = await cur.fetchall()
                    for row in model_rows:
                        rank = _scope_rank(row['organization_id'], row['team_id'], organization_id, team_id)
                        existing_rank = model_ranks.get(row['model_key'])
                        if existing_rank is None or rank < existing_rank:
                            model_cfg = {
                                'key': row['model_key'],
                                'provider': row['provider_key'],
                                'name': row['model_name'],
                                'display_name': row['display_name'],
                                'model_settings': row['model_settings_override'],
                                'enabled': row['enabled'],
                            }
                            models_map[row['model_key']] = model_cfg
                            model_ranks[row['model_key']] = rank
                        max_version = _max_timestamp(max_version, row.get('updated_at') or row.get('created_at'))

                    # Agents
                    agent_where, agent_params = _build_scope_condition(
                        "a.organization_id", "a.team_id", organization_id, team_id
                    )
                    await cur.execute(
                        f"""
                        SELECT a.id,
                               a.agent_type,
                               a.agent_name,
                               a.description,
                               a.prompt_template,
                               a.organization_id,
                               a.team_id,
                               a.enabled,
                               a.updated_at,
                               a.created_at,
                               array_remove(array_agg(DISTINCT m.model_key), NULL) AS model_keys
                          FROM agents a
                          LEFT JOIN agent_model_mappings amm ON amm.agent_id = a.id
                          LEFT JOIN models m ON m.id = amm.model_id
                         WHERE {agent_where}
                         GROUP BY a.id,
                                  a.agent_type,
                                  a.agent_name,
                                  a.description,
                                  a.prompt_template,
                                  a.organization_id,
                                  a.team_id,
                                  a.enabled,
                                  a.updated_at,
                                  a.created_at
                         ORDER BY a.enabled DESC, a.agent_type
                        """,
                        agent_params,
                    )
                    agent_rows = await cur.fetchall()
                    for row in agent_rows:
                        rank = _scope_rank(row['organization_id'], row['team_id'], organization_id, team_id)
                        existing_rank = agent_ranks.get(row['agent_type'])
                        if existing_rank is None or rank < existing_rank:
                            model_keys = row['model_keys'] or []
                            allowed_models = [key for key in model_keys if key] if model_keys else []
                            agents_map[row['agent_type']] = {
                                'id': row['id'],
                                'type': row['agent_type'],
                                'name': row['agent_name'],
                                'description': row['description'] or '',
                                'prompt': row['prompt_template'],
                                'enabled': row['enabled'],
                                'allowed_models': allowed_models if allowed_models else None,
                            }
                            agent_ranks[row['agent_type']] = rank
                        max_version = _max_timestamp(max_version, row.get('updated_at') or row.get('created_at'))

                    # Base instructions
                    instructions_where, instructions_params = _build_scope_condition(
                        "organization_id", "team_id", organization_id, team_id
                    )
                    await cur.execute(
                        f"""
                        SELECT instruction_key,
                               instruction_value,
                               organization_id,
                               team_id,
                               updated_at,
                               created_at
                          FROM base_instructions
                         WHERE {instructions_where}
                         ORDER BY instruction_key
                        """,
                        instructions_params,
                    )
                    instruction_rows = await cur.fetchall()
                    for row in instruction_rows:
                        rank = _scope_rank(row['organization_id'], row['team_id'], organization_id, team_id)
                        existing_rank = instruction_ranks.get(row['instruction_key'])
                        if existing_rank is None or rank < existing_rank:
                            instructions_map[row['instruction_key']] = {
                                'value': row['instruction_value'],
                            }
                            instruction_ranks[row['instruction_key']] = rank
                        max_version = _max_timestamp(max_version, row.get('updated_at') or row.get('created_at'))

        except psycopg.OperationalError as exc:
            last_error = exc
            logger.warning(
                "[DB] OperationalError while fetching context bundle (attempt %s/3) -- retrying",
                attempt + 1,
                exc_info=True,
            )
            # Exponential backoff: wait longer on each retry
            wait_time = 0.5 * (2 ** attempt)
            logger.debug(f"[DB] Waiting {wait_time}s before retry...")
            await asyncio.sleep(wait_time)
            continue

        providers_cfg = {
            key: {
                'type': data['type'],
                'credentials': data['credentials'],
                'model_settings': data['model_settings'],
                'bedrock_model_settings': data['bedrock_model_settings'],
                'enabled': data['enabled'],
            }
            for key, data in providers.items()
        }

        models_cfg = []
        for data in models_map.values():
            model_entry = {
                'key': data['key'],
                'provider': data['provider'],
                'name': data['name'],
                'enabled': data['enabled'],
            }
            if data['display_name']:
                model_entry['display_name'] = data['display_name']
            if data['model_settings']:
                model_entry['model_settings'] = data['model_settings']
            models_cfg.append(model_entry)

        agents_cfg = []
        for data in agents_map.values():
            agent_entry = {
                'type': data['type'],
                'name': data['name'],
                'description': data['description'],
                'prompt': data['prompt'],
                'enabled': data['enabled'],
            }
            if data.get('allowed_models'):
                agent_entry['allowed_models'] = data['allowed_models']
            agents_cfg.append(agent_entry)

        base_instructions_cfg = {
            key: value['value'] for key, value in instructions_map.items()
        }

        return ContextBundle(
            context=context,
            providers=providers_cfg,
            models=models_cfg,
            agents=agents_cfg,
            base_instructions=base_instructions_cfg,
            version=max_version,
        )

    if last_error:
        raise last_error


# ---------------------------------------------------------------------------
# Backward compatible cache for synchronous access (global/default scope)
# ---------------------------------------------------------------------------

_sync_cache: Dict[Tuple[str, str], ContextBundle] = {}


def invalidate_cache(organization_id: Optional[str] = None, team_id: Optional[str] = None) -> None:
    """Invalidate cached bundles for a specific context or all contexts."""

    if organization_id is None and team_id is None:
        _sync_cache.clear()
        logger.info("Cleared all configuration context caches")
        return

    key = make_context_key(organization_id, team_id).tuple
    if key in _sync_cache:
        _sync_cache.pop(key, None)
        logger.info("Cleared configuration cache for org=%s team=%s", organization_id, team_id)


def get_models_config_from_db(
    organization_id: Optional[str] = None,
    team_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Return models configuration synchronously (blocking when necessary).

    This helper is primarily kept for backward compatibility. For new code prefer
    using :func:`fetch_context_bundle` via the deployment manager.
    """

    key = make_context_key(organization_id, team_id).tuple
    bundle = _sync_cache.get(key)
    if bundle is None:
        try:
            asyncio.get_running_loop()
            raise RuntimeError(
                "Synchronous get_models_config_from_db called inside running loop; "
                "pre-warm the cache asynchronously first."
            )
        except RuntimeError:
            bundle = asyncio.run(fetch_context_bundle(organization_id, team_id))
            _sync_cache[key] = bundle
    return {
        'providers': bundle.providers,
        'models': bundle.models,
    }


def get_agents_config_from_db(
    organization_id: Optional[str] = None,
    team_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Return agents configuration synchronously (blocking when necessary)."""

    key = make_context_key(organization_id, team_id).tuple
    bundle = _sync_cache.get(key)
    if bundle is None:
        try:
            asyncio.get_running_loop()
            raise RuntimeError(
                "Synchronous get_agents_config_from_db called inside running loop; "
                "pre-warm the cache asynchronously first."
            )
        except RuntimeError:
            bundle = asyncio.run(fetch_context_bundle(organization_id, team_id))
            _sync_cache[key] = bundle
    return {
        'agents': bundle.agents,
        'base_instructions': bundle.base_instructions,
    }


async def warm_context_bundle(
    organization_id: Optional[str] = None,
    team_id: Optional[str] = None,
) -> ContextBundle:
    """Fetch and cache a context bundle asynchronously."""

    bundle = await fetch_context_bundle(organization_id, team_id)
    _sync_cache[bundle.context.tuple] = bundle
    return bundle


