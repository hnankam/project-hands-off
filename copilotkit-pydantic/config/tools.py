"""Tool configurations loaded from database and cached per context."""

from __future__ import annotations

from typing import Any, Dict, Tuple

from utils.context import context_tuple

_tools_by_context: Dict[Tuple[str, str], Dict[str, Dict[str, Any]]] = {}
_servers_by_context: Dict[Tuple[str, str], Dict[str, Dict[str, Any]]] = {}


def clear_context_tools(organization_id: str | None = None, team_id: str | None = None) -> None:
    """Clear cached tool definitions for a specific context or all contexts."""

    if organization_id is None and team_id is None:
        _tools_by_context.clear()
        _servers_by_context.clear()
        return

    key = context_tuple(organization_id, team_id)
    _tools_by_context.pop(key, None)
    _servers_by_context.pop(key, None)


def store_tools_for_context(
    organization_id: str | None,
    team_id: str | None,
    config: Dict[str, Dict[str, Any]],
) -> None:
    """Store tool and MCP server configuration for the given context."""

    key = context_tuple(organization_id, team_id)
    tools = dict(config.get('tools') or {})
    servers = dict(config.get('mcp_servers') or {})
    _tools_by_context[key] = tools
    _servers_by_context[key] = servers


def get_tools_for_context(organization_id: str | None, team_id: str | None) -> Dict[str, Dict[str, Any]]:
    """Retrieve cached tool definitions for the given context."""

    key = context_tuple(organization_id, team_id)
    tools = _tools_by_context.get(key)
    if tools is None:
        raise RuntimeError(
            f"Tool configuration not loaded for org={organization_id} team={team_id}. "
            "Warm the context via the deployment manager first."
        )
    return tools


def get_mcp_servers_for_context(organization_id: str | None, team_id: str | None) -> Dict[str, Dict[str, Any]]:
    """Retrieve cached MCP server definitions for the given context."""

    key = context_tuple(organization_id, team_id)
    servers = _servers_by_context.get(key)
    if servers is None:
        raise RuntimeError(
            f"MCP server configuration not loaded for org={organization_id} team={team_id}. "
            "Warm the context via the deployment manager first."
        )
    return servers

