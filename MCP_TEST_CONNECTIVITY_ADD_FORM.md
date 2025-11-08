# MCP Server Test Connectivity in Add Form

## Overview
Added the ability to test MCP server connectivity before creating/saving the server configuration in the add form.

## Changes Made

### 1. Backend - New Endpoint
Created a new endpoint that allows testing MCP server connectivity without requiring a saved server ID.

**File**: `copilot-runtime-server/routes/tools.js`

**Endpoint**: `POST /api/admin/tools/mcp-servers/test-config`

#### Request Body:
```json
{
  "organizationId": "org-id",
  "serverConfig": {
    "transport": "stdio" | "sse" | "http",
    "command": "node /path/to/server.js",
    "args": ["--flag1", "--flag2"],
    "url": "https://server.example.com/mcp",
    "env": {
      "KEY": "value"
    }
  }
}
```

#### Response (Success):
```json
{
  "success": true,
  "message": "Successfully connected to MCP server",
  "serverInfo": {
    "transport": "stdio",
    "status": "connected"
  }
}
```

#### Response (Error):
```json
{
  "error": "Failed to connect to MCP server",
  "details": "Error details here"
}
```

#### Features:
- **No server ID required**: Tests configuration directly without needing to save first
- **Authentication**: Requires authenticated session and org admin role
- **Validation**: Validates organizationId and serverConfig are provided
- **Python backend integration**: Forwards request to Python backend for actual MCP connectivity test
- **Error handling**: Comprehensive error handling with detailed messages

### 2. Frontend - Add Form Integration

**File**: `pages/side-panel/src/components/admin/ToolsTab.tsx`

#### New Function: `handleTestServerConnectivityFromForm`
Tests connectivity using the current form state without requiring the server to be saved.

#### Features:
- **Form data parsing**: Parses args (comma-separated) and env (JSON) from form fields
- **JSON validation**: Validates environment variables JSON before sending
- **Status management**: Uses the existing `testStatus` state for loading/success/error states
- **Error handling**: Displays detailed error messages in the UI

#### UI Components:
1. **Test Connectivity Button**
   - Located on the left side above Create/Cancel buttons
   - Same styling as edit form test button
   - Shows "Testing…" when in progress
   - Disabled during testing

2. **Status Banner**
   - Appears below the buttons when test is running or complete
   - Shows loading spinner, success checkmark, or error icon
   - Displays detailed messages
   - Auto-dismisses after timeout (success: 5s, error: 8s)
   - Manual dismiss with close button
   - Smooth fade-out animation

3. **Cancel Button Update**
   - Now also resets `testStatus` to `'idle'` when clicked

### 3. Layout Changes

The add form now has a structured action area:

```
[Test Connectivity]           [Create Server] [Cancel]
[Status Banner if present]
```

This matches the layout of the edit form for consistency.

## Implementation Details

### Form Data Processing:
```typescript
// Parse comma-separated args
let argsArray: string[] = [];
if (serverForm.args.trim()) {
  argsArray = serverForm.args.split(',').map(arg => arg.trim()).filter(Boolean);
}

// Parse JSON env
let envObject: Record<string, string> = {};
try {
  if (serverForm.env.trim()) {
    envObject = JSON.parse(serverForm.env);
  }
} catch (e) {
  // Show error in banner
}
```

### API Call:
```typescript
const response = await fetch(`${baseURL}/api/admin/tools/mcp-servers/test-config`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    organizationId: selectedOrgId,
    serverConfig: {
      transport: serverForm.transport,
      command: serverForm.command,
      args: argsArray,
      url: serverForm.url,
      env: envObject,
    },
  }),
});
```

## User Experience

### Before:
- Users had to create the server first before testing connectivity
- No way to verify configuration is correct before saving
- Required creating and then potentially deleting servers

### After:
- Users can test connectivity before creating the server
- Immediate feedback on configuration correctness
- Reduces need to create/delete test servers
- Same test experience in both add and edit forms

## Error Handling

### Frontend Validation:
- Validates JSON format for environment variables
- Shows user-friendly error if JSON is invalid

### Backend Validation:
- Ensures organizationId is provided
- Ensures serverConfig is provided
- Validates user has org admin role

### Python Backend Communication:
- Handles Python backend unavailability
- Provides clear error messages if backend is down
- Includes timeout handling

## Testing Recommendations

1. **Test with stdio transport**:
   - Fill in command and args
   - Click "Test Connectivity"
   - Verify successful connection message

2. **Test with invalid configuration**:
   - Enter incorrect command or missing args
   - Verify error message is displayed
   - Verify banner auto-dismisses after timeout

3. **Test JSON validation**:
   - Enter invalid JSON in env field
   - Click "Test Connectivity"
   - Verify JSON error message appears

4. **Test form reset**:
   - Test connectivity
   - Click Cancel
   - Verify form and status are reset

5. **Test banner dismissal**:
   - Test connectivity (success or error)
   - Wait for auto-dismiss
   - Test manual dismiss with close button

## Files Modified

1. **Backend**:
   - `copilot-runtime-server/routes/tools.js`
     - Added `POST /mcp-servers/test-config` endpoint

2. **Frontend**:
   - `pages/side-panel/src/components/admin/ToolsTab.tsx`
     - Added `handleTestServerConnectivityFromForm` function
     - Added Test Connectivity button to add form
     - Added status banner to add form
     - Updated Cancel button to reset test status

## Benefits

1. **Better UX**: Test before save
2. **Reduced errors**: Catch configuration issues early
3. **Consistency**: Same test experience in add and edit forms
4. **Time saving**: No need to create/delete test servers
5. **Clear feedback**: Visual status with detailed messages

