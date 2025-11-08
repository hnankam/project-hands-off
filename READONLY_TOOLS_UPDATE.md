# Readonly Tools Update

## Summary
Updated the tools management system to enforce that **frontend**, **backend**, and **builtin** tools are non-deletable. Only **MCP tools** can be deleted by users.

## Changes Made

### 1. Database Migration (`008_mark_backend_builtin_readonly.sql`)
- Marked all seeded backend tools as `readonly = true`
- Marked all seeded builtin tools as `readonly = true`
- Frontend tools were already marked as readonly in migration 007

**Result:**
```
Type         Total    Readonly   Deletable 
----------------------------------------
backend      3        3          0         
builtin      5        5          0         
frontend     22       22         0         
```

### 2. Backend API (`copilot-runtime-server/routes/tools.js`)
Updated the DELETE endpoint error message to provide better feedback:

```javascript
if (existing.readonly) {
  const typeLabel = existing.tool_type === 'frontend' ? 'Frontend' : 
                   existing.tool_type === 'backend' ? 'Backend' :
                   existing.tool_type === 'builtin' ? 'Built-in' : 'This';
  return res.status(400).json({ 
    error: `${typeLabel} tools cannot be deleted. They can only be enabled or disabled.` 
  });
}
```

### 3. Frontend UI (`ToolsTab.tsx`)
Updated accordion descriptions to clarify deletion policy:

- **Frontend Tools**: "CopilotKit actions (non-deletable, toggle to enable/disable)"
- **Built-in Tools**: "Pydantic-AI built-in tools (non-deletable, toggle to enable/disable)"
- **Backend Tools**: "Python-defined backend tools (non-deletable, toggle to enable/disable)"
- **MCP Tools**: "Tools from Model Context Protocol servers" (deletable)

Also fixed the team loading logic to use `authClient.organization.listTeams` instead of direct fetch to `/api/admin/teams`.

## Tool Types and Deletion Policy

| Tool Type | Description | Deletable | Reason |
|-----------|-------------|-----------|--------|
| **Frontend** | CopilotKit actions defined in the extension | ❌ No | Hard-coded in the frontend codebase |
| **Backend** | Python tools defined in `copilotkit-pydantic/tools/agent_tools.py` | ❌ No | Core backend functionality |
| **Builtin** | Pydantic-AI built-in tools (web search, code execution, etc.) | ❌ No | Framework-provided capabilities |
| **MCP** | Tools from external MCP servers | ✅ Yes | User-configured, can be added/removed |

## User Actions Available

For **readonly tools** (frontend, backend, builtin):
- ✅ Enable/Disable via toggle
- ✅ View metadata and configuration
- ✅ Assign to agents
- ❌ Delete

For **MCP tools**:
- ✅ Enable/Disable via toggle
- ✅ View metadata and configuration
- ✅ Assign to agents
- ✅ Delete (if not assigned to any agent)
- ✅ Add new tools from MCP servers

## Migration Applied
```bash
python copilotkit-pydantic/database/run_migration.py --file copilotkit-pydantic/database/migrations/008_mark_backend_builtin_readonly.sql
```

Status: ✅ Completed successfully

## Testing Recommendations

1. **Verify UI Behavior:**
   - Try to delete frontend, backend, and builtin tools → Should show error message
   - Try to delete MCP tools → Should work (if not assigned to agents)
   - Toggle enable/disable for all tool types → Should work

2. **Verify API Behavior:**
   - `DELETE /api/admin/tools/:toolId` for readonly tools → Should return 400 error
   - `DELETE /api/admin/tools/:toolId` for MCP tools → Should work

3. **Verify Agent Configuration:**
   - All tool types should still be assignable to agents
   - Tools should appear correctly in the tool selector

## Files Modified

1. `copilotkit-pydantic/database/migrations/008_mark_backend_builtin_readonly.sql` (new)
2. `copilot-runtime-server/routes/tools.js` (updated)
3. `pages/side-panel/src/components/admin/ToolsTab.tsx` (updated)

Date: 2025-11-07

