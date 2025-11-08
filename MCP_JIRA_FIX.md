# MCP Jira Server Fix - Console Output Suppressed

## Problem
The corp-jira MCP server was printing debug messages that interfered with JSON-RPC communication, causing 0 tools to be loaded.

## Solution Applied

### File Modified
`/Users/hnankam/Documents/adobe-mcp-servers-main/src/corp-jira/env.ts`

### Changes Made
Commented out the following console.error statements:
- Line 19: `console.error('Loading .env file from:', envPath);`
- Line 27: `console.error('Environment variables loaded successfully');`
- Line 28: `console.error('JIRA_EMAIL:', process.env.JIRA_EMAIL);`
- Line 29: `console.error('JIRA_PERSONAL_ACCESS_TOKEN:', ...);`

**Note**: We kept the error logging (line 25) for actual errors, only removed informational messages.

### Rebuild
```bash
cd /Users/hnankam/Documents/adobe-mcp-servers-main/src/corp-jira
npm run build
```

## Result
The MCP server will now only output JSON-RPC messages to stdout, allowing proper tool discovery.

## Next Steps
1. Restart the Python backend (if needed)
2. Go to Tools tab in the admin panel
3. Edit the Jira MCP server
4. Click "Load Tools"
5. Should now successfully load all available Jira tools!

## Apply Same Fix to Other MCP Servers
If you have other MCP servers with similar issues (like corp-github), apply the same fix:
1. Find the source `.ts` file
2. Comment out `console.error()` or `console.log()` statements for informational messages
3. Keep error logging for actual errors
4. Rebuild with `npm run build`

