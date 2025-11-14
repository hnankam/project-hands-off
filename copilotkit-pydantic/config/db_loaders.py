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
    tools: Dict[str, Dict[str, Any]]
    mcp_servers: Dict[str, Dict[str, Any]]
    version: Optional[datetime]


def _scope_rank(
    row_org: Optional[str],
    row_teams: Optional[List[str]],
    organization_id: Optional[str],
    team_id: Optional[str],
) -> int:
    """Compute precedence rank for scoped configuration rows with multi-team support."""
    
    # Team-level match (highest priority)
    if team_id is not None and row_teams and team_id in row_teams and row_org == organization_id:
        return 0
    
    # Organization-level (no team restrictions)
    if organization_id is not None and row_org == organization_id and (not row_teams or len(row_teams) == 0):
        return 1
    
    # Global default (no org, no teams)
    if row_org is None and (not row_teams or len(row_teams) == 0):
        return 2
    
    # No match
    return 3


def _max_timestamp(current: Optional[datetime], candidate: Optional[datetime]) -> Optional[datetime]:
    if candidate is None:
        return current
    if current is None or candidate > current:
        return candidate
    return current


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

        instructions_map: Dict[str, str] = {}
        instruction_ranks: Dict[str, int] = {}

        tools_map: Dict[str, Dict[str, Any]] = {}
        tool_ranks: Dict[str, int] = {}

        servers_map: Dict[str, Dict[str, Any]] = {}

        max_version: Optional[datetime] = None

        try:
            async with get_db_connection() as conn:
                async with conn.cursor() as cur:
                    # Build scope filter
                    org_condition = "p.organization_id = %(organization_id)s" if organization_id else "p.organization_id IS NULL"
                    team_condition = ""
                    params = {}
                    
                    if organization_id:
                        params['organization_id'] = organization_id
                    
                    if team_id:
                        params['team_id'] = team_id
                        team_condition = """
                        AND (
                            NOT EXISTS (SELECT 1 FROM provider_teams pt WHERE pt.provider_id = p.id)
                            OR EXISTS (SELECT 1 FROM provider_teams pt WHERE pt.provider_id = p.id AND pt.team_id = %(team_id)s)
                        )
                        """
                    else:
                        team_condition = """
                        AND NOT EXISTS (SELECT 1 FROM provider_teams pt WHERE pt.provider_id = p.id)
                        """

                    # Providers with multi-team support
                    await cur.execute(
                        f"""
                        SELECT p.provider_key,
                               p.provider_type,
                               p.credentials,
                               p.model_settings,
                               p.bedrock_model_settings,
                               p.organization_id,
                               COALESCE(
                                   (SELECT array_agg(pt.team_id)
                                    FROM provider_teams pt
                                    WHERE pt.provider_id = p.id),
                                   ARRAY[]::text[]
                               ) as team_ids,
                               p.enabled,
                               p.updated_at,
                               p.created_at
                          FROM providers p
                         WHERE {org_condition}
                           {team_condition}
                         ORDER BY p.enabled DESC, p.provider_key
                        """,
                        params,
                    )
                    provider_rows = await cur.fetchall()
                    for row in provider_rows:
                        rank = _scope_rank(row['organization_id'], row['team_ids'], organization_id, team_id)
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

                    # Models with multi-team support
                    model_team_condition = ""
                    if team_id:
                        model_team_condition = """
                        AND (
                            NOT EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id)
                            OR EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id AND mt.team_id = %(team_id)s)
                        )
                        """
                    else:
                        model_team_condition = """
                        AND NOT EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id)
                        """
                    
                    model_org_condition = "m.organization_id = %(organization_id)s" if organization_id else "m.organization_id IS NULL"
                    
                    await cur.execute(
                        f"""
                        SELECT m.model_key,
                               m.model_name,
                               m.display_name,
                               m.model_settings_override,
                               m.organization_id,
                               COALESCE(
                                   (SELECT array_agg(mt.team_id)
                                    FROM model_teams mt
                                    WHERE mt.model_id = m.id),
                                   ARRAY[]::text[]
                               ) as team_ids,
                               m.enabled,
                               p.provider_key,
                               m.updated_at,
                               m.created_at
                          FROM models m
                          JOIN providers p ON m.provider_id = p.id
                         WHERE {model_org_condition}
                           {model_team_condition}
                         ORDER BY m.enabled DESC, m.model_key
                        """,
                        params,
                    )
                    model_rows = await cur.fetchall()
                    for row in model_rows:
                        rank = _scope_rank(row['organization_id'], row['team_ids'], organization_id, team_id)
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

                    # Agents with multi-team support
                    agent_team_condition = ""
                    if team_id:
                        agent_team_condition = """
                        AND (
                            NOT EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id)
                            OR EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id AND at.team_id = %(team_id)s)
                        )
                        """
                    else:
                        agent_team_condition = """
                        AND NOT EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id)
                        """
                    
                    agent_org_condition = "a.organization_id = %(organization_id)s" if organization_id else "a.organization_id IS NULL"
                    
                    await cur.execute(
                        f"""
                        SELECT a.id,
                               a.agent_type,
                               a.agent_name,
                               a.description,
                               a.prompt_template,
                               a.organization_id,
                               COALESCE(
                                   (SELECT array_agg(at.team_id)
                                    FROM agent_teams at
                                    WHERE at.agent_id = a.id),
                                   ARRAY[]::text[]
                               ) as team_ids,
                               a.enabled,
                               a.updated_at,
                               a.created_at,
                               array_remove(array_agg(DISTINCT m.model_key), NULL) AS model_keys,
                               array_remove(array_agg(DISTINCT t.tool_key), NULL) AS tool_keys
                          FROM agents a
                          LEFT JOIN agent_model_mappings amm ON amm.agent_id = a.id
                          LEFT JOIN models m ON m.id = amm.model_id
                          LEFT JOIN agent_tool_mappings atm ON atm.agent_id = a.id
                          LEFT JOIN tools t ON t.id = atm.tool_id
                         WHERE {agent_org_condition}
                           {agent_team_condition}
                         GROUP BY a.id,
                                  a.agent_type,
                                  a.agent_name,
                                  a.description,
                                  a.prompt_template,
                                  a.organization_id,
                                  a.enabled,
                                  a.updated_at,
                                  a.created_at
                         ORDER BY a.enabled DESC, a.agent_type
                        """,
                        params,
                    )
                    agent_rows = await cur.fetchall()
                    for row in agent_rows:
                        rank = _scope_rank(row['organization_id'], row['team_ids'], organization_id, team_id)
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
                                'allowed_tools': (
                                    [key for key in (row.get('tool_keys') or []) if key] if row.get('tool_keys') else None
                                ),
                            }
                            agent_ranks[row['agent_type']] = rank
                        max_version = _max_timestamp(max_version, row.get('updated_at') or row.get('created_at'))

                    # MCP servers with multi-team support
                    server_team_condition = ""
                    if team_id:
                        server_team_condition = """
                        AND (
                            NOT EXISTS (SELECT 1 FROM mcp_server_teams mst WHERE mst.mcp_server_id = ms.id)
                            OR EXISTS (SELECT 1 FROM mcp_server_teams mst WHERE mst.mcp_server_id = ms.id AND mst.team_id = %(team_id)s)
                        )
                        """
                    else:
                        server_team_condition = """
                        AND NOT EXISTS (SELECT 1 FROM mcp_server_teams mst WHERE mst.mcp_server_id = ms.id)
                        """
                    
                    # MCP servers must belong to a specific organization
                    server_org_condition = "ms.organization_id = %(organization_id)s" if organization_id else "FALSE"
                    
                    logger.debug(
                        "🔍 MCP Server Query for org=%s team=%s | org_condition=%s | team_condition=%s",
                        organization_id,
                        team_id,
                        server_org_condition,
                        server_team_condition.strip()
                    )
                    
                    await cur.execute(
                        f"""
                        SELECT ms.id,
                               ms.server_key,
                               ms.display_name,
                               ms.command,
                               ms.args,
                               ms.env,
                               ms.transport,
                               ms.url,
                               ms.metadata,
                               ms.organization_id,
                               COALESCE(
                                   (SELECT array_agg(mst.team_id)
                                    FROM mcp_server_teams mst
                                    WHERE mst.mcp_server_id = ms.id),
                                   ARRAY[]::text[]
                               ) as team_ids,
                               ms.enabled,
                               ms.updated_at,
                               ms.created_at
                          FROM mcp_servers ms
                         WHERE {server_org_condition}
                           {server_team_condition}
                         ORDER BY ms.enabled DESC, ms.server_key
                        """,
                        params,
                    )
                    server_rows = await cur.fetchall()
                    logger.info(
                        "📊 MCP Servers loaded for org=%s team=%s: %d servers",
                        organization_id,
                        team_id,
                        len(server_rows)
                    )
                    for row in server_rows:
                        logger.debug(
                            "   - Server: %s (id=%s, team_ids=%s, org_id=%s)",
                            row['server_key'],
                            row['id'],
                            row.get('team_ids', []),
                            row.get('organization_id')
                        )
                        servers_map[row['server_key']] = {
                            'id': row['id'],
                            'server_key': row['server_key'],
                            'display_name': row['display_name'],
                            'description': row.get('description'),
                            'command': row.get('command'),
                            'args': row.get('args') or [],
                            'env': row.get('env') or {},
                            'transport': row.get('transport', 'stdio'),
                            'url': row.get('url'),
                            'metadata': row.get('metadata') or {},
                            'organization_id': row.get('organization_id'),
                            'team_ids': row.get('team_ids') or [],
                            'enabled': row.get('enabled', True),
                            'updated_at': row.get('updated_at'),
                            'created_at': row.get('created_at'),
                        }

                    # Tools with multi-team support
                    tools_team_condition = ""
                    if team_id:
                        tools_team_condition = """
                        AND (
                            NOT EXISTS (SELECT 1 FROM tool_teams tt WHERE tt.tool_id = t.id)
                            OR EXISTS (SELECT 1 FROM tool_teams tt WHERE tt.tool_id = t.id AND tt.team_id = %(team_id)s)
                        )
                        """
                    else:
                        tools_team_condition = """
                        AND NOT EXISTS (SELECT 1 FROM tool_teams tt WHERE tt.tool_id = t.id)
                        """
                    
                    # Allow global tools (organization_id IS NULL) to be inherited by all organizations
                    tools_org_condition = "(t.organization_id IS NULL OR t.organization_id = %(organization_id)s)" if organization_id else "t.organization_id IS NULL"
                    
                    logger.debug(
                        "🔍 Tools Query for org=%s team=%s | org_condition=%s | team_condition=%s",
                        organization_id,
                        team_id,
                        tools_org_condition,
                        tools_team_condition.strip()
                    )
                    
                    await cur.execute(
                        f"""
                        SELECT t.id,
                               t.tool_key,
                               t.tool_name,
                               t.tool_type,
                               t.description,
                               t.metadata,
                               t.config,
                               t.organization_id,
                               COALESCE(
                                   (SELECT array_agg(tt.team_id)
                                    FROM tool_teams tt
                                    WHERE tt.tool_id = t.id),
                                   ARRAY[]::text[]
                               ) as team_ids,
                               CASE 
                                   WHEN t.organization_id IS NULL THEN 
                                       COALESCE(ots.enabled, t.enabled)
                                   ELSE 
                                       t.enabled
                               END as enabled,
                               t.readonly,
                               t.mcp_server_id,
                               t.remote_tool_name,
                               t.updated_at,
                               t.created_at
                          FROM tools t
                          LEFT JOIN organization_tool_settings ots ON ots.tool_id = t.id AND ots.organization_id = %(organization_id)s
                         WHERE {tools_org_condition}
                           {tools_team_condition}
                         ORDER BY (CASE 
                                   WHEN t.organization_id IS NULL THEN 
                                       COALESCE(ots.enabled, t.enabled)
                                   ELSE 
                                       t.enabled
                               END) DESC, t.tool_key
                        """,
                        params,
                    )
                    tool_rows = await cur.fetchall()
                    logger.info(
                        "📊 Tools loaded for org=%s team=%s: %d tools",
                        organization_id,
                        team_id,
                        len(tool_rows)
                    )
                    
                    mcp_tool_count = 0
                    for row in tool_rows:
                        if row.get('tool_type') == 'mcp':
                            mcp_tool_count += 1
                            logger.debug(
                                "   - MCP Tool: %s (server_id=%s, team_ids=%s)",
                                row['tool_key'],
                                row.get('mcp_server_id'),
                                row.get('team_ids', [])
                            )
                        
                        rank = _scope_rank(row['organization_id'], row['team_ids'], organization_id, team_id)
                        existing_rank = tool_ranks.get(row['tool_key'])
                        if existing_rank is None or rank < existing_rank:
                            tools_map[row['tool_key']] = {
                                'id': row['id'],
                                'tool_key': row['tool_key'],
                                'tool_name': row['tool_name'],
                                'tool_type': row['tool_type'],
                                'description': row.get('description'),
                                'metadata': row.get('metadata') or {},
                                'config': row.get('config') or {},
                                'organization_id': row.get('organization_id'),
                                'team_ids': row.get('team_ids') or [],
                                'enabled': row.get('enabled', True),
                                'readonly': row.get('readonly', False),
                                'mcp_server_id': row.get('mcp_server_id'),
                                'remote_tool_name': row.get('remote_tool_name'),
                                'updated_at': row.get('updated_at'),
                                'created_at': row.get('created_at'),
                            }
                            tool_ranks[row['tool_key']] = rank
                        max_version = _max_timestamp(max_version, row.get('updated_at') or row.get('created_at'))
                    
                    if mcp_tool_count > 0:
                        logger.info(
                            "   ✅ Loaded %d MCP tools for org=%s team=%s",
                            mcp_tool_count,
                            organization_id,
                            team_id
                        )

                    # Base instructions (organization-scoped only, no team support)
                    instructions_org_condition = "organization_id = %(organization_id)s" if organization_id else "organization_id IS NULL"
                    
                    await cur.execute(
                        f"""
                        SELECT instruction_key,
                               instruction_value,
                               organization_id,
                               updated_at,
                               created_at
                          FROM base_instructions
                         WHERE {instructions_org_condition}
                         ORDER BY instruction_key
                        """,
                        params,
                    )
                    instruction_rows = await cur.fetchall()
                    for row in instruction_rows:
                        rank = 1 if row['organization_id'] == organization_id else 2
                        existing_rank = instruction_ranks.get(row['instruction_key'])
                        if existing_rank is None or rank < existing_rank:
                            instructions_map[row['instruction_key']] = {
                                'key': row['instruction_key'],
                                'value': row['instruction_value'],
                            }
                            instruction_ranks[row['instruction_key']] = rank
                        max_version = _max_timestamp(max_version, row.get('updated_at') or row.get('created_at'))

            # Success - convert maps to lists
            models = list(models_map.values())
            agents = list(agents_map.values())
            base_instructions = {k: v['value'] for k, v in instructions_map.items()}
            
            # Log what was fetched
            logger.debug(
                "[DB Fetch] org=%s team=%s: %d tools, %d mcp_servers",
                organization_id[:8] if organization_id else 'global',
                team_id[:8] if team_id else 'org-wide',
                len(tools_map),
                len(servers_map)
            )
            if tools_map:
                logger.debug("[DB Fetch] Tool keys: %s", list(tools_map.keys())[:10])
            
            # Add MCP server info to tools
            for tool_key, tool_data in tools_map.items():
                if tool_data.get('mcp_server_id'):
                    # Find MCP server by ID
                    for server_key, server_data in servers_map.items():
                        if server_data.get('id') == tool_data['mcp_server_id']:
                            tool_data['mcp_server'] = {
                                'server_key': server_data['server_key'],
                                'display_name': server_data['display_name'],
                                'enabled': server_data.get('enabled', True),
                                'readonly': tool_data.get('readonly', False),
                                'organization_id': server_data.get('organization_id'),
                                'team_ids': server_data.get('team_ids') or [],
                            }
                            break

            return ContextBundle(
                context=context,
                providers=providers,
                models=models,
                agents=agents,
                base_instructions=base_instructions,
                tools=tools_map,
                mcp_servers=servers_map,
                version=max_version,
            )

        except (psycopg.Error, asyncio.CancelledError) as exc:
            last_error = exc
            if attempt < 2:
                wait_sec = 0.1 * (2**attempt)
                logger.warning(
                    "DB fetch failed (attempt %d) for org=%s team=%s: %s. Retrying in %.1fs...",
                    attempt + 1,
                    organization_id[:8] if organization_id else 'global',
                    team_id[:8] if team_id else 'org-wide',
                    exc,
                    wait_sec,
                )
                await asyncio.sleep(wait_sec)
            else:
                logger.error(
                    "DB fetch failed permanently (attempt %d) for org=%s team=%s: %s",
                    attempt + 1,
                    organization_id[:8] if organization_id else 'global',
                    team_id[:8] if team_id else 'org-wide',
                    exc,
                )
                raise

    raise RuntimeError(f"Failed to fetch context bundle after 3 attempts: {last_error}")


# Cache management
_sync_cache: Dict[Tuple[str, str], ContextBundle] = {}


def get_cached_context_bundle(organization_id: Optional[str], team_id: Optional[str]) -> Optional[ContextBundle]:
    """Synchronously retrieve a cached context bundle."""
    key = (organization_id or '', team_id or '')
    return _sync_cache.get(key)


def cache_context_bundle(organization_id: Optional[str], team_id: Optional[str], bundle: ContextBundle) -> None:
    """Cache a context bundle synchronously."""
    key = (organization_id or '', team_id or '')
    _sync_cache[key] = bundle


def clear_context_cache(organization_id: Optional[str] = None, team_id: Optional[str] = None) -> None:
    """Clear cached context bundles."""
    if organization_id is None and team_id is None:
        _sync_cache.clear()
        return
    
    key = (organization_id or '', team_id or '')
    _sync_cache.pop(key, None)
