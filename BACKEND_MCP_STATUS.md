# Backend MCP Loading Status

## Summary
✅ **YES, the backend IS already loading MCP servers from the database!**

The implementation was already in place before the migration. The migration script simply moved the existing MCP server configurations from JSON to the database, and the backend seamlessly switched to reading from the database.

## How It Works

### 1. Database Loading (`config/db_loaders.py`)

The `fetch_context_bundle` function loads MCP servers from the database:

```python
# Lines 247-288
await cur.execute(
    """
    SELECT id, server_key, display_name, transport,
           command, args, env, url, metadata,
           organization_id, team_id, enabled,
           updated_at, created_at
    FROM mcp_servers
    WHERE {server_where}
    """,
    server_params,
)
server_rows = await cur.fetchall()
for row in server_rows:
    servers_map[row['id']] = {
        'id': row['id'],
        'server_key': row['server_key'],
        'display_name': row['display_name'],
        'transport': row['transport'],
        'command': row['command'],
        'args': list(row['args']) if row.get('args') else [],
        'env': row.get('env') or {},
        'url': row.get('url'),
        'metadata': row.get('metadata') or {},
        # ... etc
    }
```

### 2. Context Caching (`config/tools.py`)

MCP servers are cached per context (org/team):

```python
def get_mcp_servers_for_context(
    organization_id: str | None, 
    team_id: str | None
) -> Dict[str, Dict[str, object]]:
    """Retrieve cached MCP server definitions for the given context."""
    key = context_tuple(organization_id, team_id)
    servers = _servers_by_context.get(key)
    if servers is None:
        raise RuntimeError(
            f"MCP server configuration not loaded for org={organization_id} team={team_id}. "
            "Warm the context via the deployment manager first."
        )
    return servers
```

### 3. Agent Factory (`core/agent_factory.py`)

When creating an agent, it loads MCP servers from the database:

```python
# Line 85-86
tool_definitions = get_tools_for_context(organization_id, team_id)
mcp_servers = get_mcp_servers_for_context(organization_id, team_id)

# Lines 160-169
register_agent_tools(
    agent,
    agent_type=agent_type,
    organization_id=organization_id,
    team_id=team_id,
    tool_definitions=tool_definitions,
    mcp_servers=mcp_servers,  # ← Database-loaded servers
    allowed_backend_tools=set(allowed_backend_keys),
    allowed_mcp_tools=set(allowed_mcp_keys),
)
```

### 4. Tool Registration (`tools/agent_tools.py`)

The MCP servers from database are converted to runtime configs:

```python
# Lines 143-171
server_configs = {}
for server_id, data in grouped_tools.items():
    server = mcp_servers.get(server_id)
    if not server:
        continue
    server_key = server.get('server_key')
    
    config_entry: Dict[str, Any] = {
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
    # Extract max_retries from metadata
    metadata = server.get('metadata') or {}
    if isinstance(metadata, dict) and 'max_retries' in metadata:
        config_entry['max_retries'] = metadata['max_retries']
    
    server_configs[server_key] = config_entry
```

### 5. MCP Loader (`tools/mcp_loader.py`)

The loader accepts both JSON file AND runtime configs:

```python
def load_mcp_toolsets(server_configs: dict | None = None) -> list:
    """Load MCP server toolsets either from provided config or local file.
    
    Args:
        server_configs: Optional mapping of server key -> config dictionary. 
                       When provided, the on-disk configuration file is ignored.
    """
    try:
        if server_configs is None:
            # Load from JSON file (legacy)
            config_data = json.loads(MCP_CONFIG_PATH.read_text())
            raw_servers = config_data.get("mcpServers", {})
        else:
            # Load from runtime config (database) ← USED NOW
            raw_servers = server_configs
```

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Request arrives with org_id/team_id                         │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. fetch_context_bundle(org_id, team_id)                       │
│    - Queries mcp_servers table                                 │
│    - Filters by organization_id/team_id scope                  │
│    - Returns ContextBundle with mcp_servers dict               │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. store_tools_for_context() + store_servers_for_context()     │
│    - Caches tools and mcp_servers in memory                    │
│    - Key: (org_id, team_id) tuple                              │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. create_agent(agent_type, model, org_id, team_id)            │
│    - Calls get_tools_for_context()                             │
│    - Calls get_mcp_servers_for_context()                       │
│    - Filters to agent's allowed_tools                          │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. register_agent_tools()                                       │
│    - Groups MCP tools by server_id                             │
│    - Builds server_configs dict from database data             │
│    - Calls load_mcp_toolsets(server_configs)                   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. load_mcp_toolsets(server_configs)                           │
│    - Receives runtime config (NOT JSON file)                   │
│    - Filters disabled servers                                  │
│    - Creates temp JSON for pydantic-ai loader                  │
│    - Returns MCP toolsets                                      │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Agent has filtered MCP toolsets attached                    │
│    - Only allowed tools accessible                             │
│    - Server configs from database                              │
│    - Ready to handle requests                                  │
└─────────────────────────────────────────────────────────────────┘
```

## What the Migration Did

The migration script (`migrate_mcp_config.py`) simply:
1. ✅ Read MCP servers from `mcp_config.json`
2. ✅ Inserted them into `mcp_servers` table
3. ✅ Preserved all configuration (command, args, env, max_retries)
4. ✅ Set global scope (org_id=NULL, team_id=NULL)

**The backend code didn't change** - it was already designed to load from database!

## Verification

You can verify this is working by:

### Check Database Loading
```python
cd copilotkit-pydantic
python3 -c "
from config.db_loaders import get_agents_config_from_db
config = get_agents_config_from_db()
print(f'MCP Servers loaded: {len(config[\"mcp_servers\"])}')
for server_id, server in config['mcp_servers'].items():
    print(f'  - {server[\"server_key\"]}: {server[\"display_name\"]}')
"
```

### Check Runtime Loading
```python
cd copilotkit-pydantic
python3 -c "
from config.tools import get_mcp_servers_for_context
from services.deployment_manager import ensure_deployment

# Warm the cache
ensure_deployment(organization_id=None, team_id=None)

# Get servers
servers = get_mcp_servers_for_context(None, None)
print(f'MCP Servers available: {len(servers)}')
for server_id, server in servers.items():
    print(f'  - {server[\"server_key\"]}: enabled={server[\"enabled\"]}')
"
```

### Check Agent Creation
```bash
# Start the backend
cd copilotkit-pydantic
uvicorn api.main:app --reload

# In another terminal, test agent with MCP tools
curl -X POST http://localhost:8000/agent/general/gemini-2.5-flash-lite \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What MCP tools do you have access to?"
  }'
```

## Legacy Fallback

The `mcp_loader.py` still supports JSON file loading as a fallback:

```python
if server_configs is None:
    # Load from JSON file
    config_data = json.loads(MCP_CONFIG_PATH.read_text())
    raw_servers = config_data.get("mcpServers", {})
else:
    # Load from runtime config (database) ← PRIMARY PATH
    raw_servers = server_configs
```

This means:
- ✅ Database-first when available (normal operation)
- ✅ JSON fallback if no runtime config provided (edge cases)
- ✅ Backward compatible with old deployment scripts

## Conclusion

**The backend was already database-ready!** The migration simply:
1. Populated the database with existing MCP server configs
2. Made them manageable via admin UI
3. Enabled multi-tenancy scoping
4. No code changes needed - it "just worked"

This is good architecture - the backend was designed to be database-driven from the start, even though the JSON file was being used initially.

## Next Steps

Now that MCP servers are in the database:
1. ✅ Verify servers appear in Admin UI → Tools tab → MCP Servers
2. ⏳ Create MCP tool mappings (link server tools to agent tools)
3. ⏳ Assign MCP tools to specific agents
4. ⏳ Test agent execution with MCP tools
5. ⏳ Optional: Remove JSON file after confirming everything works

