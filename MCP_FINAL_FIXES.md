# MCP Server Test Connectivity - Final Fixes

## Summary

Fixed two critical issues preventing MCP server test connectivity from working:

1. **Node.js Backend Authentication**: Fixed incorrect session checking
2. **Python Backend Implementation**: Updated to use proper pydantic-ai MCP classes

---

## Issue 1: Node.js Backend - Missing Pool Definition

### Problem
```
ReferenceError: pool is not defined
at file:///Users/hnankam/Downloads/data/project-hands-off/copilot-runtime-server/routes/tools.js:949:40
```

### Root Cause
The `pool` variable was not defined in the scope of the test endpoint.

### Fix
Added `const pool = getPool();` before using it:

```javascript
// Test MCP server connectivity
router.post('/mcp-servers/:serverId/test', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { serverId } = req.params;
    const { organizationId, teamId = null } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool(); // ✅ Added this line
    
    // Ensure user is org admin
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;
    
    // ... rest of the endpoint
  }
});
```

---

## Issue 2: Node.js Backend - Incorrect Authentication Pattern

### Problem
```json
{"error": "Unauthorized: No active session"}
```

### Root Cause
The endpoint was using `req.session` which doesn't exist in the Express setup. Should use `auth.api.getSession({ headers: req.headers })` like the Models tab does.

### Fix
Changed from:
```javascript
// ❌ OLD (incorrect)
const session = req.session;
if (!session || !session.user) {
  return res.status(401).json({ error: 'Unauthorized: No active session' });
}
await ensureOrgAdmin(pool, organizationId, session.user.id, res);
```

To:
```javascript
// ✅ NEW (correct - matches Models tab pattern)
const session = await ensureAuthenticated(req, res);
if (!session) return;

const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
if (!roles) return;
```

Where `ensureAuthenticated` is defined as:
```javascript
async function ensureAuthenticated(req, res) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session || !session.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  return session;
}
```

---

## Issue 3: Python Backend - Using Temporary JSON Files

### Problem
The Python backend was creating temporary JSON config files and using `load_mcp_servers()`, which is inefficient and not the recommended approach per the pydantic-ai documentation.

### Root Cause
Incorrectly using the file-based loader instead of the proper MCP client classes.

### Fix
Updated to use the proper `MCPServerStdio`, `MCPServerSSE`, and `MCPServerWS` classes as documented in https://ai.pydantic.dev/mcp/client/

#### Before (Incorrect):
```python
import json
import tempfile
from pathlib import Path
from pydantic_ai.mcp import load_mcp_servers

# Create temp config file
temp_config = {"mcpServers": {"test_server": server_config}}
with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp_file:
    json.dump(temp_config, tmp_file)
    tmp_path = Path(tmp_file.name)

try:
    toolsets = load_mcp_servers(tmp_path)
    # ... use toolsets
finally:
    tmp_path.unlink(missing_ok=True)
```

#### After (Correct):
```python
from pydantic_ai.mcp import MCPServerStdio, MCPServerSSE, MCPServerWS

# Create the appropriate MCP server instance based on transport
if transport == "stdio":
    mcp_server = MCPServerStdio(
        command=command,
        args=args,
        env=env if env else None,
    )
elif transport == "sse":
    mcp_server = MCPServerSSE(url=url)
elif transport == "ws":
    mcp_server = MCPServerWS(url=url)

# Use directly
tools_result = await asyncio.wait_for(
    mcp_server.list_tools(),
    timeout=10.0
)
```

---

## Updated Files

### Node.js Backend
- **`copilot-runtime-server/routes/tools.js`**
  - Added `const pool = getPool();` in test endpoint
  - Changed authentication from `req.session` to `ensureAuthenticated(req, res)`

### Python Backend
- **`copilotkit-pydantic/api/admin.py`**
  - Removed `json`, `tempfile`, `Path` imports
  - Removed `load_mcp_servers` import
  - Added direct imports: `MCPServerStdio`, `MCPServerSSE`, `MCPServerWS`
  - Updated both `/test` and `/{server_id}/tools` endpoints to use proper MCP classes

---

## Testing

### Test Connectivity
1. Open Tools tab in admin panel
2. Edit an MCP server (or add a new one)
3. Click "Test Connectivity" button
4. Should successfully connect and show success message

### Load Tools
1. Edit an MCP server
2. Click "Load Tools" button
3. Should fetch all tools from the server and persist them to the database

---

## Benefits of This Approach

1. **No Temporary Files**: Cleaner, no filesystem I/O overhead
2. **Direct API Usage**: Uses the proper pydantic-ai MCP client classes
3. **Better Performance**: No file creation/deletion cycle
4. **Type Safety**: Proper type hints and validation from pydantic-ai
5. **Consistent Authentication**: Matches the pattern used across all admin endpoints

---

## Next Steps

Both the Node.js and Python backends should now be restarted for the changes to take effect:

```bash
# Restart Node.js backend (if not in watch mode)
cd copilot-runtime-server
npm run dev

# Restart Python backend (if not in watch mode)
cd copilotkit-pydantic
python main.py
```

The test connectivity and load tools features should now work correctly! 🎉

