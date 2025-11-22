"""Agent tool definitions and registration."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List
from collections import defaultdict

from tools.mcp_loader import load_mcp_toolsets
from tools.backend_tools import get_backend_tool
from config import logger


async def get_agent_tools(
    *,
    agent_type: str,
    organization_id: str | None,
    team_id: str | None,
    tool_definitions: Dict[str, Dict[str, Any]],
    mcp_servers: Dict[str, Dict[str, Any]],
    allowed_backend_tools: set[str],
    allowed_mcp_tools: set[str],
) -> tuple[List[Any], List[Any]]:
    """Get backend and MCP tools for the agent based on configuration.
    
    Returns:
        Tuple of (tools, toolsets) where:
        - tools: List of callable functions for Agent(tools=[...])
        - toolsets: List of MCP toolsets for Agent(toolsets=[...])
    """

    logger.info("=" * 80)
    logger.info("🔧 get_agent_tools() called for agent '%s'", agent_type)
    logger.info("=" * 80)

    allowed_backend_tools = set(allowed_backend_tools or set())
    allowed_mcp_tools = set(allowed_mcp_tools or set())
    
    logger.info("📊 Input: allowed_backend_tools=%d, allowed_mcp_tools=%d", len(allowed_backend_tools), len(allowed_mcp_tools))
    logger.info("📊 Input: mcp_servers=%d, tool_definitions=%d", len(mcp_servers) if mcp_servers else 0, len(tool_definitions))

    # Track all registered tools for logging
    registered_tools = {
        'backend': [],
        'mcp': [],
        'total_count': 0
    }
    
    # List to accumulate all tools
    all_tools = []

    def _is_backend_enabled(key: str) -> bool:
        cfg = tool_definitions.get(key)
        return (
            cfg is not None
            and cfg.get('tool_type') == 'backend'
            and cfg.get('enabled', True)
        )

    def _is_mcp_enabled(key: str) -> bool:
        cfg = tool_definitions.get(key)
        return (
            cfg is not None
            and cfg.get('tool_type') == 'mcp'
            and cfg.get('enabled', True)
            and cfg.get('mcp_server_id') is not None
            and cfg.get('remote_tool_name') is not None
        )

    # ========== Backend Tools ==========
    
    # Register backend tools from the backend_tools module
    for tool_key in allowed_backend_tools:
        if not _is_backend_enabled(tool_key):
            logger.warning("Backend tool '%s' is not enabled for agent %s", tool_key, agent_type)
            continue
        
        tool_func = get_backend_tool(tool_key)
        if tool_func is None:
            logger.warning("Backend tool '%s' not found in backend_tools module for agent %s", tool_key, agent_type)
            continue
        
        all_tools.append(tool_func)
        registered_tools['backend'].append(tool_key)
        registered_tools['total_count'] += 1

    # Log backend tools
    if registered_tools['backend']:
        logger.info(
            "Registered %d backend tool(s) for agent %s: %s",
            len(registered_tools['backend']),
            agent_type,
            ", ".join(registered_tools['backend'])
        )

    # ========== MCP Tools ==========
    
    # logger.debug("allowed_mcp_tools = %s (count: %d)", list(allowed_mcp_tools), len(allowed_mcp_tools))
    # logger.debug("mcp_servers available = %s (count: %d)", list(mcp_servers.keys()) if mcp_servers else [], len(mcp_servers) if mcp_servers else 0)

    # If no MCP tools are allowed for this agent, return early
    if not allowed_mcp_tools:
        logger.info(
            "✅ Agent '%s' configured with %d total tool(s) (backend: %d, mcp: 0)",
            agent_type,
            registered_tools['total_count'],
            len(registered_tools['backend'])
        )
        return (all_tools, [])
    
    # If no MCP servers available, return early
    if not mcp_servers:
        logger.warning("No MCP servers available in context")
        return (all_tools, [])

    # Create a reverse mapping from server ID to server_key for MCP server lookup
    server_id_to_key = {}
    for server_key, server_data in mcp_servers.items():
        if server_data.get('id'):
            server_id_to_key[server_data['id']] = server_key
    
    # logger.debug(
    #     "Built server_id_to_key mapping with %d entries for agent '%s'",
    #     len(server_id_to_key),
    #     agent_type
    # )

    # Group MCP tools by server
    grouped_tools = defaultdict(lambda: {'tool_keys': [], 'remote_names': set()})

    for key in allowed_mcp_tools:
        if not _is_mcp_enabled(key):
            logger.warning("MCP tool '%s' is not enabled or missing configuration for agent %s", key, agent_type)
            continue
        cfg = tool_definitions[key]
        server_id = cfg['mcp_server_id']
        remote_name = cfg['remote_tool_name']
        
        # Look up the server_key from the server_id
        server_key = server_id_to_key.get(server_id)
        if not server_key:
            logger.warning(
                "MCP server ID '%s' required for tool '%s' is not found for agent %s",
                server_id,
                key,
                agent_type,
            )
            continue
        
        server_cfg = mcp_servers.get(server_key)
        if not server_cfg or not server_cfg.get('enabled', True):
            logger.warning(
                "MCP server '%s' required for tool '%s' is not enabled for agent %s",
                server_key,
                key,
                agent_type,
            )
            continue
        grouped_tools[server_key]['tool_keys'].append(key)
        grouped_tools[server_key]['remote_names'].add(remote_name)

    if not grouped_tools:
        logger.warning("No MCP toolsets available for agent %s after filtering", agent_type)
        logger.info(
            "✅ Agent '%s' configured with %d total tool(s) (backend: %d, mcp: 0)",
            agent_type,
            registered_tools['total_count'],
            len(registered_tools['backend'])
        )
        return (all_tools, [])

    # Build server configs for MCP loader
    server_configs = {}
    allowed_remote_names_by_key = {}

    for server_key, data in grouped_tools.items():
        server = mcp_servers[server_key]
        config_entry = {
            'transport': server.get('transport', 'stdio'),
        }
        if server.get('command'):
            config_entry['command'] = server['command']
        if server.get('args'):
            config_entry['args'] = server['args']
        if server.get('env'):
            config_entry['env'] = server['env']
        if server.get('url'):
            config_entry['url'] = server['url']
        metadata = server.get('metadata') or {}
        if isinstance(metadata, dict) and 'max_retries' in metadata:
            config_entry['max_retries'] = metadata['max_retries']

        server_configs[server_key] = config_entry
        allowed_remote_names_by_key[server_key] = data['remote_names']
        
        # logger.debug(
        #     "Configured MCP server '%s' with %d tools for agent '%s'",
        #     server_key,
        #     len(data['remote_names']),
        #     agent_type
        # )

    if not server_configs:
        logger.warning("No MCP server configurations available for agent %s", agent_type)
        logger.info(
            "✅ Agent '%s' configured with %d total tool(s) (backend: %d, mcp: 0)",
            agent_type,
            registered_tools['total_count'],
            len(registered_tools['backend'])
        )
        return (all_tools, [])

    # Load MCP toolsets using JSON-based configuration
    # The toolsets are loaded via load_mcp_servers which is more stable and avoids timeouts
    logger.info("🔧 Loading %d MCP server(s) via JSON configuration for agent '%s'", len(server_configs), agent_type)
    # logger.debug("MCP server configs: %s", list(server_configs.keys()))
    mcp_toolsets = load_mcp_toolsets(server_configs)
    
    if not mcp_toolsets:
        logger.warning("No MCP toolsets were loaded from configuration")
        logger.info(
            "✅ Agent '%s' configured with %d total tool(s) (backend: %d, mcp: 0)",
            agent_type,
            registered_tools['total_count'],
            len(registered_tools['backend'])
        )
        return (all_tools, [])
    
    logger.info("✅ Successfully loaded %d MCP toolset(s), now filtering by allowed tools", len(mcp_toolsets))
    toolset_ids = [getattr(ts, 'id', 'NO_ID') for ts in mcp_toolsets]
    # logger.debug("MCP toolset IDs: %s", toolset_ids)
    # logger.debug("Allowed remote names by key: %s", {k: sorted(list(v)) for k, v in allowed_remote_names_by_key.items()})

    filtered_mcp_toolsets: List[Any] = []
    for toolset in mcp_toolsets:
        server_key = getattr(toolset, 'id', None)
        if not server_key:
            logger.warning("MCP toolset missing 'id' attribute, skipping")
            continue

        allowed_remote_names = allowed_remote_names_by_key.get(server_key)
        if not allowed_remote_names:
            # logger.debug("MCP server '%s' has no allowed tools, skipping", server_key)
            continue

        # Pydantic prefixes tool names with the toolset id (e.g. 'corp-github_add_issue_comment').
        # Build a set that includes both the raw remote names and the prefixed variants so that
        # tool_def.name comparisons succeed regardless of prefix handling.
        prefixed_names = {f"{server_key}_{name}" for name in allowed_remote_names}
        allowed_name_set = set(allowed_remote_names) | prefixed_names

        # logger.debug(
        #     "Filtering MCP toolset '%s' with allowed names (raw=%s, prefixed=%s)",
        #     server_key,
        #     sorted(allowed_remote_names),
        #     sorted(prefixed_names)
        # )

        try:
            filtered_toolset = toolset.filtered(
                lambda ctx, tool_def, allowed=allowed_name_set: tool_def.name in allowed
            )
            filtered_mcp_toolsets.append(filtered_toolset)

            for tool_name in allowed_remote_names:
                registered_tools['mcp'].append(f"{server_key}:{tool_name}")
                registered_tools['total_count'] += 1

            # logger.debug(
            #     "✓ Configured MCP toolset '%s' with %d filtered tools",
            #     server_key,
            #     len(allowed_remote_names)
            # )

        except Exception as exc:
            logger.warning("Failed to filter MCP toolset '%s': %s", server_key, str(exc))

    # Count unique MCP servers from registered tools for logging purposes
    mcp_servers_used = set()
    for tool_key in registered_tools['mcp']:
        if ':' in tool_key:
            server_key = tool_key.split(':', 1)[0]
            mcp_servers_used.add(server_key)

    if filtered_mcp_toolsets:
        logger.info(
            "Registered %d MCP tool(s) from %d server(s) for agent %s: %s",
            len(registered_tools['mcp']),
            len(mcp_servers_used),
            agent_type,
            ", ".join(sorted(mcp_servers_used)),
        )
    else:
        logger.warning("No MCP tools were successfully registered for agent %s after filtering", agent_type)

    logger.info(
        "✅ Agent '%s' configured with %d total tool(s) (backend: %d, mcp: %d from %d server(s))",
        agent_type,
        registered_tools['total_count'],
        len(registered_tools['backend']),
        len(registered_tools['mcp']),
        len(mcp_servers_used)
    )

    # if registered_tools['backend'] or registered_tools['mcp']:
        # logger.debug(
        #     "Tool breakdown for agent '%s':\n  Backend tools: %s\n  MCP tools: %s",
        #     agent_type,
        #     registered_tools['backend'] if registered_tools['backend'] else "none",
        #     registered_tools['mcp'] if registered_tools['mcp'] else "none"
        # )

    return (all_tools, filtered_mcp_toolsets)
