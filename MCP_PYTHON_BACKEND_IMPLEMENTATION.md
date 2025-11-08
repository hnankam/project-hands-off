# MCP Python Backend Implementation

## Overview
Implemented Python FastAPI endpoints for MCP server testing and tool loading to support the admin UI.

---

## Files Created/Modified

### 1. `/copilotkit-pydantic/api/admin.py` (NEW)
Complete admin API module for MCP server management.

**Endpoints:**

#### `POST /api/admin/mcp-servers/test`
Tests connectivity to an MCP server.

**Request Body:**
```json
{
  "serverConfig": {
    "transport": "stdio" | "sse" | "ws",
    "command": "node /path/to/server.js",
    "args": ["--arg1", "--arg2"],
    "url": "https://server.example.com/mcp",
    "env": {
      "KEY": "value"
    }
  }
}
```

**Success Response (200):**
```json
{
  "message": "Successfully connected to MCP server",
  "serverInfo": {
    "transport": "stdio",
    "status": "connected",
    "version": "1.0.0"
  }
}
```

**Error Response (503/500):**
```json
{
  "detail": {
    "error": "Failed to connect to MCP server",
    "details": "Connection refused"
  }
}
```

**Functionality:**
- Creates MCP client with provided config
- Tests connection by initializing session
- Attempts to get server version if available
- Returns connection status and server info
- Handles timeouts and connection errors

#### `POST /api/admin/mcp-servers/:serverId/tools`
Loads all available tools from an MCP server.

**Request Body:**
```json
{
  "serverConfig": {
    "transport": "stdio",
    "command": "node /path/to/server.js",
    "args": [],
    "url": null,
    "env": {}
  }
}
```

**Success Response (200):**
```json
{
  "tools": [
    {
      "name": "tool_name",
      "description": "Tool description",
      "displayName": "Tool Display Name",
      "inputSchema": {
        "type": "object",
        "properties": {...}
      }
    }
  ]
}
```

**Error Response (504/503/500):**
```json
{
  "detail": {
    "error": "Timeout loading tools from MCP server",
    "details": "The server took too long to respond"
  }
}
```

**Functionality:**
- Creates MCP client with provided config
- Lists all available tools with 10-second timeout
- Extracts tool name, description, display name, and input schema
- Returns array of tool definitions
- Handles timeouts and errors gracefully

---

### 2. `/copilotkit-pydantic/api/__init__.py` (MODIFIED)
Added export for `register_admin_routes`.

**Changes:**
```python
from .admin import register_admin_routes

__all__ = [
    'register_agent_routes',
    'register_info_routes',
    'register_websocket_routes',
    'register_admin_routes',  # NEW
]
```

---

### 3. `/copilotkit-pydantic/main.py` (MODIFIED)
Registered admin routes with FastAPI app.

**Changes:**
```python
from api import ..., register_admin_routes

# Register routes
register_admin_routes(app)
```

---

## Technical Implementation

### Pydantic Models

**ServerConfig:**
```python
class ServerConfig(BaseModel):
    transport: str
    command: Optional[str] = None
    args: Optional[list[str]] = None
    url: Optional[str] = None
    env: Optional[Dict[str, str]] = None
```

**TestServerRequest/Response:**
```python
class TestServerRequest(BaseModel):
    serverConfig: ServerConfig

class TestServerResponse(BaseModel):
    message: str
    serverInfo: Optional[Dict[str, Any]] = None
```

**LoadToolsRequest/Response:**
```python
class LoadToolsRequest(BaseModel):
    serverConfig: ServerConfig

class LoadToolsResponse(BaseModel):
    tools: list[Dict[str, Any]]
```

### Error Handling

**Connection Errors:**
- Status 503: MCP server connection/session failures
- Status 504: Timeout errors (10s for tools)
- Status 500: General server errors

**Error Response Format:**
```python
{
    "detail": {
        "error": "High-level error message",
        "details": "Specific error details"
    }
}
```

### MCP Client Integration

Uses existing `tools/mcp_loader.py`:
```python
from tools.mcp_loader import create_mcp_client, MCPServerConfig

# Create config
mcp_config = MCPServerConfig(
    name="server_name",
    transport="stdio",
    command="node server.js",
    args=["--flag"],
    url=None,
    env={"KEY": "value"}
)

# Use client
async with create_mcp_client(mcp_config) as client:
    # Test connection or list tools
    tools_result = await client.list_tools()
```

### Async Context Management

Both endpoints use async context managers to ensure proper cleanup:
```python
async with create_mcp_client(mcp_config) as client:
    # Client automatically connects on entry
    # Client automatically disconnects on exit
    result = await client.list_tools()
```

### Timeout Handling

**Test Connectivity:** 5-second timeout for version check
**Load Tools:** 10-second timeout for tool listing

```python
tools_result = await asyncio.wait_for(
    client.list_tools(),
    timeout=10.0
)
```

---

## Integration Flow

### Test Connectivity Flow

1. **Frontend** clicks "Test Connectivity"
2. **Node.js Backend** receives request at `/api/admin/tools/mcp-servers/:serverId/test`
3. Node.js validates user auth and fetches server config from DB
4. **Python Backend** receives request at `/api/admin/mcp-servers/test`
5. Python creates MCP client and tests connection
6. **Result** returned through Node.js to frontend
7. Frontend displays success/error message

### Load Tools Flow

1. **Frontend** clicks "Load Tools" in edit mode
2. **Node.js Backend** receives request at `/api/admin/tools/mcp-servers/:serverId/load-tools`
3. Node.js validates user auth and fetches server config
4. **Python Backend** receives request at `/api/admin/mcp-servers/:serverId/tools`
5. Python creates MCP client and lists tools
6. **Node.js** receives tools and saves to database
7. Frontend displays success message with tool count

---

## Environment Variables

Ensure `PYTHON_BACKEND_URL` is set in Node.js environment:

**.env (Node.js):**
```bash
PYTHON_BACKEND_URL=http://localhost:8000
```

**Default:** `http://localhost:8000`

---

## Testing

### Test Connectivity Endpoint

```bash
curl -X POST http://localhost:8000/api/admin/mcp-servers/test \
  -H "Content-Type: application/json" \
  -d '{
    "serverConfig": {
      "transport": "stdio",
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {}
    }
  }'
```

### Load Tools Endpoint

```bash
curl -X POST http://localhost:8000/api/admin/mcp-servers/test-server/tools \
  -H "Content-Type: application/json" \
  -d '{
    "serverConfig": {
      "transport": "stdio",
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {}
    }
  }'
```

---

## Error Scenarios Handled

### 1. Invalid Server Configuration
- Missing command for stdio transport
- Invalid transport type
- Malformed URL for SSE/WS

### 2. Connection Failures
- Server not running
- Command not found
- Permission denied
- Network errors (SSE/WS)

### 3. Timeout Errors
- Server takes too long to respond
- Slow tool listing
- Hung connections

### 4. Session Initialization Failures
- Server rejects connection
- Protocol mismatch
- Authentication failures

### 5. Tool Listing Failures
- Server doesn't support tool listing
- Malformed tool definitions
- Server crashes during listing

---

## Logging

All operations are logged for debugging:

```python
logger.info(f"Testing MCP server connectivity: transport={transport}")
logger.info(f"Successfully connected to MCP server")
logger.error(f"Failed to test MCP server connectivity: {error}")
```

---

## Next Steps

1. **Restart Python Backend**
   ```bash
   cd copilotkit-pydantic
   python main.py
   ```

2. **Test from UI**
   - Go to Tools tab
   - Edit an MCP server
   - Click "Test Connectivity"
   - Click "Load Tools"

3. **Monitor Logs**
   - Check Python backend logs for connection attempts
   - Check Node.js logs for API calls
   - Check browser console for frontend errors

---

## Summary

The Python backend now provides two essential endpoints for MCP server management:
- **Test Connectivity:** Validates server configuration before use
- **Load Tools:** Discovers available tools from configured servers

Both endpoints integrate with the existing `tools/mcp_loader.py` infrastructure and provide comprehensive error handling and logging for debugging issues.

