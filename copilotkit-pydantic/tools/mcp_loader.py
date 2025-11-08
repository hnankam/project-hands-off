"""MCP server loading utilities."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from pydantic_ai.mcp import load_mcp_servers

MCP_CONFIG_PATH = Path(__file__).with_name("mcp_config.json")


def mcp_log_handler(level: str, data: Any, logger: str | None = None) -> None:
    """Custom log handler that writes MCP server logs to stderr instead of stdout.
    
    This prevents MCP server debug messages from interfering with JSON-RPC communication.
    """
    # Write to stderr to avoid breaking JSON-RPC protocol on stdout
    # Only log warnings and errors to reduce noise
    if level in ("warning", "error"):
        print(f"[MCP {logger or 'unknown'}] {level.upper()}: {data}", file=sys.stderr)
    elif level == "debug":
        # Log debug messages for troubleshooting MCP server issues
        print(f"[MCP {logger or 'unknown'}] DEBUG: {data}", file=sys.stderr)


def load_mcp_toolsets(server_configs: dict | None = None) -> list:
    """Load MCP server toolsets either from provided config or local file.

    Args:
        server_configs: Optional mapping of server key -> config dictionary. When
            provided, the on-disk configuration file is ignored.

    Returns:
        List of MCP server toolsets (MCPServerStdio, MCPServerSSE, etc.)
    """
    try:
        if server_configs is None:
            config_data = json.loads(MCP_CONFIG_PATH.read_text())
            raw_servers = config_data.get("mcpServers", {})
        else:
            raw_servers = server_configs

        disabled_servers = []
        enabled_servers = {}

        for server_id, server_config in raw_servers.items():
            if server_config.get("disabled", False):
                disabled_servers.append(server_id)
                continue
            server_config_clean = {k: v for k, v in server_config.items() if k != "disabled"}
            enabled_servers[server_id] = server_config_clean

        for server_id in disabled_servers:
            print(f"⊘ Skipping disabled MCP server: {server_id}")

        if not enabled_servers:
            print("⚠️ All MCP servers are disabled")
            return []

        filtered_config = {"mcpServers": enabled_servers}

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp_file:
            json.dump(filtered_config, tmp_file)
            tmp_path = Path(tmp_file.name)

        try:
            toolsets = load_mcp_servers(tmp_path)
        finally:
            tmp_path.unlink(missing_ok=True)

    except FileNotFoundError:
        print(f"⚠️ MCP config not found at {MCP_CONFIG_PATH}, continuing without MCP servers")
        return []
    except ValidationError as exc:
        print(f"⚠️ Failed to parse MCP config: {exc}")
        return []
    except Exception as exc:
        print(f"⚠️ Error loading MCP config: {exc}")
        return []

    # Configure logging and retries for each MCP server
    for toolset in toolsets:
        if hasattr(toolset, 'log_handler'):
            toolset.log_handler = mcp_log_handler
        
        # Set max_retries from the original config (before filtering)
        server_id = getattr(toolset, 'id', None)
        if server_id and server_id in enabled_servers:
            max_retries = enabled_servers[server_id].get('max_retries', 1)
            if hasattr(toolset, 'max_retries'):
                toolset.max_retries = max_retries
    
    source = MCP_CONFIG_PATH if server_configs is None else 'runtime configuration'
    print(f"🔌 Loaded {len(toolsets)} MCP server(s) from {source}")
    if disabled_servers:
        print(f"   (Skipped {len(disabled_servers)} disabled server(s))")
    
    return toolsets

