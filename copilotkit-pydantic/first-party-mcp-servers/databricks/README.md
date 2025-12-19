# Databricks MCP Server (FastMCP)

First-party MCP server for Databricks workspace operations built with **FastMCP**.

## Features

- **SQL Queries**: List and retrieve SQL queries
- **Jobs**: List, get, and trigger job runs
- **Clusters**: List and inspect clusters
- **Notebooks**: Create, import, export, delete, and list notebooks
- **Workspace**: List workspace files
- **Connection Pooling**: Automatic caching of WorkspaceClient instances

## Installation

```bash
cd copilotkit-pydantic/first-party-mcp-servers/databricks
pip install -r requirements.txt
```

## Running the Server

### Standard Mode (stdio)

```bash
python server.py
```

### SSE Mode (HTTP)

```bash
fastmcp run server.py --sse
```

### Development Mode

```bash
fastmcp dev server.py
```

## Usage with MCP Client

FastMCP automatically provides MCP protocol support. The server can be used via:

1. **stdio transport** - Direct process communication
2. **SSE transport** - HTTP-based streaming

### Calling Tools

Tools expect credentials as parameters:

```python
# Example tool call
result = await client.call_tool(
    "list_queries",
    arguments={
        "host": "https://my-workspace.cloud.databricks.com",
        "token": "dapi1234567890..."
    }
)
```

## Registering with Your Application

### For stdio Transport

```json
{
  "mcpServers": {
    "databricks": {
      "command": "python",
      "args": ["/path/to/server.py"],
      "env": {}
    }
  }
}
```

### For SSE Transport

```json
{
  "mcpServers": {
    "databricks": {
      "url": "http://localhost:8000/sse",
      "transport": "sse"
    }
  }
}
```

### Via Admin UI

1. Go to Admin UI → Tools → MCP Servers
2. Click "Add MCP Server"
3. Fill in:
   - **Server Key**: `databricks`
   - **Display Name**: `Databricks`
   - **Transport**: `stdio` or `sse`
   - **Command**: `python` (for stdio)
   - **Args**: `["/path/to/server.py"]` (for stdio)
   - **URL**: `http://localhost:8000/sse` (for SSE)
4. Save

## Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_queries` | List SQL queries | `host`, `token` |
| `get_query` | Get query details | `host`, `token`, `query_id` |
| `list_jobs` | List jobs | `host`, `token`, `limit` (optional) |
| `get_job` | Get job details | `host`, `token`, `job_id` |
| `trigger_job` | Trigger job run | `host`, `token`, `job_id`, `notebook_params` (optional), `jar_params` (optional) |
| `list_clusters` | List clusters | `host`, `token` |
| `get_cluster` | Get cluster details | `host`, `token`, `cluster_id` |
| `list_notebooks` | List notebooks in path | `host`, `token`, `path` (optional) |
| `get_notebook` | Export notebook content | `host`, `token`, `path`, `format` (optional) |
| `import_notebook` | Import notebook | `host`, `token`, `path`, `content`, `language` (optional), `format` (optional), `overwrite` (optional) |
| `delete_notebook` | Delete notebook | `host`, `token`, `path`, `recursive` (optional) |
| `create_notebook` | Create new notebook | `host`, `token`, `path`, `language` (optional) |
| `get_notebook_status` | Get notebook metadata | `host`, `token`, `path` |
| `list_workspace_files` | List workspace files | `host`, `token`, `path` (optional) |

## Tool Parameters

All tools require:
- **host**: Databricks workspace URL (e.g., `https://my-workspace.cloud.databricks.com`)
- **token**: Personal Access Token (starts with `dapi`)

## How Credentials Work

1. **Frontend**: User enters credentials in UI
2. **Context**: Credentials sent via copilot context
3. **Agent**: Extracts credentials from context
4. **MCP Server**: Receives credentials per-tool-call
5. **Caching**: WorkspaceClient cached for 1 hour

**Security**:
- ✅ No credentials stored on server
- ✅ Client connections cached with SHA-256 hashed keys
- ✅ 1-hour TTL on cached connections
- ✅ Credentials only in memory during requests

## Testing

### Using FastMCP Inspector

```bash
fastmcp dev server.py
```

Opens an interactive inspector at `http://localhost:5173`

### Manual Testing

```python
from databricks.sdk import WorkspaceClient

# Test credentials
host = "https://your-workspace.cloud.databricks.com"
token = "dapi..."

client = WorkspaceClient(host=host, token=token)
print(list(client.queries.list()))
```

## Project Structure

```
databricks/
├── server.py                  # FastMCP server entry point
├── cache.py                   # WorkspaceClient connection pooling
├── models.py                  # Pydantic models for type safety
├── requirements.txt           # Dependencies
├── tools/                     # Tools organized by category
│   ├── __init__.py           # Tool exports
│   ├── queries.py            # SQL query tools
│   ├── jobs.py               # Job management tools
│   ├── clusters.py           # Cluster tools
│   ├── notebooks.py          # Notebook management tools
│   └── workspace.py          # Workspace file tools
├── README.md                 # This file
├── QUICKSTART.md             # Quick start guide
└── test_server.sh            # Test script
```

## Why FastMCP?

FastMCP provides:
- ✅ **MCP Protocol**: Built-in MCP standard support
- ✅ **Tool Decorators**: Simple `@mcp.tool()` syntax
- ✅ **Auto-discovery**: Tools automatically registered
- ✅ **Type Safety**: Pydantic validation for parameters and return types
- ✅ **Multiple Transports**: stdio, SSE, WebSocket
- ✅ **Developer Tools**: Built-in inspector and debugging

## Notebook Management

The server provides comprehensive notebook management capabilities:

### List Notebooks
```python
# List all notebooks in a directory
notebooks = list_notebooks(host, token, path="/Users/me/notebooks")
```

### Export Notebooks
```python
# Export notebook in different formats
notebook = get_notebook(host, token, path="/Users/me/notebook", format="SOURCE")
# Formats: SOURCE, HTML, JUPYTER, DBC
```

### Import Notebooks
```python
# Import a notebook
import_notebook(
    host, token,
    path="/Users/me/new_notebook",
    content="<base64-encoded-content>",
    language="PYTHON",  # PYTHON, SCALA, SQL, R
    format="SOURCE",    # SOURCE, HTML, JUPYTER, DBC, AUTO
    overwrite=False
)
```

### Create Notebooks
```python
# Create a new empty notebook
create_notebook(host, token, path="/Users/me/notebook", language="PYTHON")
```

### Delete Notebooks
```python
# Delete a notebook
delete_notebook(host, token, path="/Users/me/notebook")
```

### Get Notebook Status
```python
# Get notebook metadata
status = get_notebook_status(host, token, path="/Users/me/notebook")
```

## Type Safety

All tools use proper type hints that match the Databricks SDK:

```python
from typing import Any
from databricks.sdk.service.compute import ClusterDetails
from databricks.sdk.service.sql import ListQueryObjectsResponseQuery
from databricks.sdk.service.jobs import BaseJob, Run

def list_clusters(host: str, token: str) -> list[dict[str, Any]]:
    """Returns list of cluster details matching SDK ClusterDetails type."""
    ...

def list_queries(host: str, token: str) -> list[dict[str, Any]]:
    """Returns list of queries matching SDK ListQueryObjectsResponseQuery type."""
    ...
```

This ensures:
- **IDE autocomplete** for return types
- **Type checking** with mypy/pyright
- **Runtime validation** via Pydantic
- **Consistent API** matching Databricks SDK

## Production Deployment

### Using systemd

Create `/etc/systemd/system/databricks-mcp.service`:

```ini
[Unit]
Description=Databricks MCP Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/databricks
ExecStart=/usr/bin/python3 server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable databricks-mcp
sudo systemctl start databricks-mcp
```

### Using Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "server.py"]
```

Build and run:
```bash
docker build -t databricks-mcp .
docker run databricks-mcp
```

## Development

### Adding New Tools

**Step 1**: Create a new tool function in the appropriate category file (or create a new category):

```python
# In tools/queries.py (or create tools/new_category.py)
from typing import Any
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import SomeSDKType  # Import SDK type
from cache import get_workspace_client

def my_new_tool(host: str, token: str, param1: str) -> dict[str, Any]:
    """Tool description.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        param1: Description of parameter
        
    Returns:
        Dictionary matching SDK SomeSDKType structure
    """
    client = get_workspace_client(host, token)
    # Your implementation
    result = client.some_api.some_method(param1)
    
    # Convert SDK dataclass to dict
    if hasattr(result, 'as_dict'):
        return result.as_dict()
    return {"result": str(result)}
```

**Step 2**: Export the tool in `tools/__init__.py`:

```python
from .queries import list_queries, get_query, my_new_tool

__all__ = [
    'list_queries',
    'get_query',
    'my_new_tool',  # Add here
]
```

**Step 3**: Register the tool in `server.py`:

```python
from tools.queries import list_queries, get_query, my_new_tool

mcp.tool()(my_new_tool)
```

FastMCP automatically:
- Registers the tool
- Validates parameters
- Handles errors
- Provides documentation

### Cache Management

View cache stats:
```python
from cache import get_cache_info
print(get_cache_info())
```

Clear cache:
```python
from cache import clear_cache
clear_cache()
```

## Troubleshooting

**Server won't start:**
```bash
pip install -r requirements.txt
```

**Invalid credentials:**
- Verify workspace URL format
- Check token starts with `dapi`
- Verify token permissions in Databricks

**Connection timeout:**
- Check workspace URL is accessible
- Verify network connectivity
- Check firewall rules

## Resources

- [FastMCP Documentation](https://github.com/jlowin/fastmcp)
- [Databricks SDK Documentation](https://databricks-sdk-py.readthedocs.io/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

## License

Same as parent project.
