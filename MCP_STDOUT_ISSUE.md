# MCP Server stdout Issue

## Problem

The MCP server (corp-github) is printing debug messages to **stdout**, which breaks the JSON-RPC protocol communication:

```
Loading .env file from: ...
Environment variables loaded...
Corporate GitHub MCP Server running on stdio
```

These messages cause the Python backend to fail parsing JSON-RPC messages, resulting in 0 tools being loaded even though the MCP server has tools available.

## Error in Python Backend

```
Failed to parse JSONRPC message from server
pydantic_core._pydantic_core.ValidationError: 1 validation error for JSONRPCMessage
  Invalid JSON: expected value at line 1 column 1 [type=json_invalid, input_value='Loading .env file from: ...', input_type=str]
```

## Root Cause

The MCP protocol requires that **only JSON-RPC messages** are sent to stdout. Any debug/logging messages MUST go to stderr instead.

## Solutions

### Solution 1: Fix the MCP Server Code (Recommended)

Update the corp-github MCP server to send debug messages to stderr:

```python
import sys

# Change from:
print("Loading .env file from: ...")
print("Environment variables loaded...")
print("Corporate GitHub MCP Server running on stdio")

# To:
print("Loading .env file from: ...", file=sys.stderr)
print("Environment variables loaded...", file=sys.stderr)
print("Corporate GitHub MCP Server running on stdio", file=sys.stderr)
```

### Solution 2: Add Environment Variable to Suppress Output

If the MCP server supports a `QUIET` or `DEBUG` environment variable, add it to the server configuration:

In the Tools tab, when editing the MCP server, add to the "Environment Variables" field:

```json
{
  "QUIET": "1",
  "DEBUG": "0"
}
```

Or:

```json
{
  "LOG_LEVEL": "ERROR"
}
```

### Solution 3: Use pydantic-ai log handler (Already Implemented)

The Python backend already has a log handler in `tools/mcp_loader.py` that redirects MCP logs to stderr. However, this only works for logs sent through the MCP logging system, not raw `print()` statements.

## Impact

- ✅ Test Connectivity works (doesn't require tool listing)
- ❌ Load Tools fails (returns 0 tools due to stdout pollution)
- The MCP server IS working and HAS tools, but they can't be retrieved

## Workaround

Until the MCP server is fixed:

1. Manually add tools to the database if you know what they are
2. Or temporarily comment out the print statements in the MCP server code
3. Or redirect stdout in the Python backend (not recommended as it may break other things)

## Files Involved

- **MCP Server**: corp-github (wherever it's installed)
- **Python Backend**: `copilotkit-pydantic/api/admin.py` (load tools endpoint)
- **Detection**: The error messages in the Python terminal clearly show the stdout pollution

## Next Steps

1. Locate the corp-github MCP server source code
2. Find the print statements
3. Change them to print to stderr: `print(..., file=sys.stderr)`
4. Or add environment variable support for quiet mode
5. Restart the Python backend and try loading tools again

