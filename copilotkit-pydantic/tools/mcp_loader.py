"""MCP server loading utilities using dynamic JSON configuration."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

from pydantic_ai.mcp import load_mcp_servers
from config import logger


def load_mcp_toolsets(server_configs: dict | None = None) -> list:
    """Load MCP server toolsets using dynamic JSON configuration generated from DB.

    Args:
        server_configs: Mapping of server key -> config dictionary from DB

    Returns:
        List of MCP server toolset instances loaded via load_mcp_servers.
    """
    if not server_configs:
        logger.warning("No MCP server configurations provided")
        return []
    
    # Build JSON configuration for MCP servers from DB config
    mcpServers = {}
    
    for server_key, server_config in server_configs.items():
        transport = server_config.get('transport', 'stdio')

        mcp_entry = {}

        if transport == "stdio":
            command = server_config.get('command')
            if not command:
                logger.warning("MCP server '%s': command is required for stdio transport", server_key)
                continue

            args = server_config.get('args', [])
            env = server_config.get('env', {}) or {}

            # Ensure environment variables suppress debug output that breaks JSON-RPC
            env = dict(env)  # Make a copy so we don't mutate the original

            # Set environment variables to suppress verbose output
            env.setdefault('NODE_ENV', 'production')
            env.setdefault('DEBUG', '')  # Disable debug output

            mcp_entry['command'] = command
            if args:
                mcp_entry['args'] = args
            if env:
                mcp_entry['env'] = env

        elif transport in ("sse", "http"):
            url = server_config.get('url')
            if not url:
                logger.warning("MCP server '%s': url is required for %s transport", server_key, transport)
                continue

            mcp_entry['url'] = url

        else:
            logger.warning("MCP server '%s': unsupported transport type '%s'", server_key, transport)
            continue

        # Add max_retries if specified
        max_retries = server_config.get('max_retries')
        if max_retries is not None:
            mcp_entry['max_retries'] = max_retries

        mcpServers[server_key] = mcp_entry
    
    if not mcpServers:
        logger.warning("No valid MCP server configurations after validation")
        return []

    # Create the dynamic JSON config from DB
    dynamic_config = {"mcpServers": mcpServers}

    # Write dynamic config to temporary JSON file
    with tempfile.NamedTemporaryFile(
        mode='w',
        suffix='.json',
        delete=False,
        prefix='mcp_config_db_'
    ) as tmp_file:
        json.dump(dynamic_config, tmp_file, indent=2)
        tmp_path = tmp_file.name
    
    try:        
        # Load MCP servers using the standard load_mcp_servers function
        toolsets = load_mcp_servers(Path(tmp_path))
        
        # Ensure each toolset has proper id and tool_prefix
        for toolset in toolsets:
            if hasattr(toolset, 'id') and toolset.id:
                if not hasattr(toolset, 'tool_prefix') or not toolset.tool_prefix:
                    toolset.tool_prefix = toolset.id
            else:
                logger.warning("MCP toolset loaded without ID, this may cause issues")
        
        logger.info("Successfully loaded %d MCP server toolset(s) from DB config", len(toolsets))
        return toolsets
        
    except Exception as exc:
        logger.error("Error loading MCP servers from DB-generated JSON config: %s", exc)
        # import traceback
        # traceback.print_exc()
        return []

    finally:
        # Clean up temp file
        try:
            Path(tmp_path).unlink()
        except Exception:
            pass
