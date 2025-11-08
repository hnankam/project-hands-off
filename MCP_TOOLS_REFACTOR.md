# MCP Tools Refactor - Summary

## Overview
Restructured the MCP tools functionality to automatically fetch tools from MCP servers rather than manually adding them. The UI now matches the Models tab design pattern.

## Changes Made

### 1. Backend Changes (`copilot-runtime-server/routes/tools.js`)

#### New Endpoint: Load Tools from MCP Server
```javascript
POST /api/admin/tools/mcp-servers/:serverId/load-tools
```

**Functionality:**
- Connects to the specified MCP server
- Fetches all available tools from the server
- Automatically inserts or updates tools in the database
- Tool naming convention: `{serverKey}_{remoteTool Name}`
- Returns the number of tools loaded

**Flow:**
1. Validates user is org admin
2. Fetches MCP server config from database
3. Makes request to Python backend to list tools
4. Inserts/updates tools in database with proper scoping
5. Invalidates config caches
6. Returns success with tool count

**Notes:**
- Requires `PYTHON_BACKEND_URL` environment variable (defaults to `http://localhost:8000`)
- Expects Python backend endpoint: `/api/admin/mcp-servers/{serverId}/tools`
- Automatically handles tool updates if they already exist

### 2. Frontend Changes (`pages/side-panel/src/components/admin/ToolsTab.tsx`)

####Removed:
- `McpToolFormState` interface
- `INITIAL_MCP_TOOL_FORM` constant
- `mcpToolForm` state
- `canSubmitTool` validation
- `handleSubmitMcpTool` function
- Entire "Add MCP Tool" form section

#### Added:
- `showAddServerForm` state - toggles add server form visibility
- `loadingToolsForServer` state - tracks which server is loading tools
- `handleLoadServerTools(server)` function - loads tools from MCP server

#### UI Restructure:

**MCP Servers Section (Now matches Models tab design exactly):**

**Header:**
- Icon + "MCP Servers (count)" title on left
- "+ Add Server" / "Cancel" button on right (styled like Models tab)
- No container border (clean layout)

**Add Server Form:**
- Shows/hides based on `showAddServerForm` state
- Styled as a highlighted panel (gray/dark background)
- Same fields as before (Server Key, Display Name, Transport, Command, Args, URL)
- "Create Server" and "Cancel" buttons (styled like Models tab)
- Closes automatically after successful submission

**Server List (Card-based layout matching Models):**
- Each server in a card with hover effects
- **Edit Mode**: Full inline editing like Models tab
  - All fields editable
  - "Save Changes" and "Cancel" buttons
  - Same styling as model edit mode
- **View Mode**:
  - Display name (bold)
  - Server key · transport (gray text)
  - Command preview if present
  - Tool count badge (blue, shows number of loaded tools)
  - Action buttons: "Load Tools", Edit icon, Delete icon
  - Icons match Models tab (pencil for edit, trash for delete)

**Empty State:**
- Styled like Models tab empty state
- Server icon, title, and helpful message
- Dashed border container

**Loading States:**
- Skeleton loaders matching Models tab style
- "Loading..." button text while loading tools from a server
- Disabled state for Load Tools button during loading

**Buttons:**
- All buttons styled consistently with Models tab
- "Load Tools" button uses same border style as "+ Add Model"
- Edit/delete icons same size and styling as Models tab
- Save/Cancel buttons same colors and sizing

### 3. Key Features

#### Automatic Tool Discovery
- Click "Load Tools" on any MCP server
- System connects to the server and fetches all available tools
- Tools are automatically added to the database
- Success message shows count: "Loaded X tool(s) from {Server Name}"

#### Tool Count Badge
- Each server card shows how many tools it has loaded
- Updates dynamically when tools are loaded
- Blue badge to indicate active tools

#### Improved UX
- Collapsible form (hidden by default)
- Clear visual hierarchy
- Consistent with Models tab design
- Loading feedback for all async operations
- Informative success/error messages

### 4. Database Schema (No Changes)
The existing schema already supports this functionality:
- `tools` table has `mcp_server_id` foreign key
- `remote_tool_name` stores the original tool name from MCP server
- `tool_key` uses format: `{serverKey}_{remoteToolName}`

### 5. Python Backend Requirement (TODO)

**New endpoint needed:**
```
POST /api/admin/mcp-servers/:serverId/tools
```

**Request Body:**
```json
{
  "serverConfig": {
    "transport": "stdio" | "sse" | "ws",
    "command": "node /path/to/server.js",
    "args": ["--flag1", "--flag2"],
    "url": "https://server.example.com/mcp",
    "env": { "KEY": "value" }
  }
}
```

**Response:**
```json
{
  "tools": [
    {
      "name": "search_jira_issues",
      "displayName": "Search Jira Issues",
      "description": "Search for Jira issues using JQL",
      "inputSchema": { /* JSON Schema */ }
    }
  ]
}
```

**Implementation Notes:**
- Connect to the MCP server using provided config
- List all available tools
- Return tool metadata including name, description, and input schema
- Handle connection errors gracefully

## Benefits

1. **Simplified Workflow:**
   - Old: Add server → Manually add each tool → Specify remote names
   - New: Add server → Click "Load Tools" → Done!

2. **Automatic Sync:**
   - Tools automatically discovered from MCP server
   - Can reload tools to sync updates
   - No manual tool name entry needed

3. **Better UX:**
   - Consistent with Models tab design
   - Clear visual feedback
   - Fewer steps to configure

4. **Reduced Errors:**
   - No manual tool name typos
   - Automatic tool key generation
   - All available tools discovered at once

## Migration Notes

- Existing MCP tools in the database remain unchanged
- No data migration required
- Old tools can be deleted and reloaded if needed
- "Load Tools" will update existing tools if they already exist

## Testing Checklist

- [ ] Add MCP server successfully
- [ ] Click "Load Tools" loads tools from server
- [ ] Tool count badge updates correctly
- [ ] Loaded tools appear in MCP Tools accordion
- [ ] Tools can be enabled/disabled
- [ ] Tools can be deleted
- [ ] Server can be deleted (only if no tools)
- [ ] Form shows/hides correctly
- [ ] Loading states display properly
- [ ] Error messages are clear and helpful

## Future Enhancements

1. **Auto-reload on server enable:**
   - Automatically load tools when server is enabled
   
2. **Tool sync indicator:**
   - Show last sync time
   - Highlight outdated tools

3. **Selective tool import:**
   - Allow choosing which tools to import
   - Bulk enable/disable

4. **Tool preview:**
   - Show tool schema before importing
   - Preview tool descriptions

Date: 2025-11-07

