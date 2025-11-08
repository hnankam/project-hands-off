# Cross-Organization Team Data Leak Fix

## Issue

When viewing the admin tabs (Tools, Agents, Models, Providers), team badges associated with resources were showing teams from **other organizations**. For example:
- In Organization "Acme", MCP servers were displaying "Team · DGP" and "Team · XEDS" 
- These teams (DGP, XEDS) belonged to a different organization
- This violated data isolation between organizations

## Root Cause

All admin list endpoints were fetching team associations without filtering teams by the current organization. The SQL subqueries joining junction tables to fetch teams did not include a `WHERE team.organization_id = $1` clause.

### Example of the Problem

**Before (Vulnerable Query):**
```sql
COALESCE(
  (SELECT json_agg(json_build_object('id', team.id, 'name', team.name))
   FROM mcp_server_teams st
   JOIN team ON team.id = st.team_id
   WHERE st.mcp_server_id = s.id),
  '[]'::json
) as teams
```

This query would return **ALL teams** associated with the server, regardless of which organization they belong to.

**After (Fixed Query):**
```sql
COALESCE(
  (SELECT json_agg(json_build_object('id', team.id, 'name', team.name))
   FROM mcp_server_teams st
   JOIN team ON team.id = st.team_id
   WHERE st.mcp_server_id = s.id
     AND team.organization_id = $1),
  '[]'::json
) as teams
```

Now only teams belonging to the **current organization** are included.

## Files Modified

### Backend Routes

1. **`copilot-runtime-server/routes/tools.js`**
   - ✅ Line 157: Added `AND team.organization_id = $1` to tools list query
   - ✅ Line 720: Replaced `mcp_servers_with_teams` view with custom query filtering teams by org

2. **`copilot-runtime-server/routes/agents.js`**
   - ✅ Line 334: Added `AND team.organization_id = $2` to `fetchAgentById` query
   - ✅ Line 383: Added `AND team.organization_id = $1` to agents list query

3. **`copilot-runtime-server/routes/models.js`**
   - ✅ Line 440: Replaced `models_with_teams` view with custom query filtering teams by org

4. **`copilot-runtime-server/routes/providers.js`**
   - ✅ Line 415: Replaced `providers_with_teams` view with custom query filtering teams by org

## Why Views Were Replaced

The database views (`mcp_servers_with_teams`, `models_with_teams`, `providers_with_teams`, `agents_with_teams`) were created in migration 009 without organization-aware team filtering:

```sql
CREATE OR REPLACE VIEW mcp_servers_with_teams AS
SELECT 
    s.*,
    COALESCE(
        json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name) 
        FILTER (WHERE t.id IS NOT NULL),
        '[]'::json
    ) as teams
FROM mcp_servers s
LEFT JOIN mcp_server_teams st ON s.id = st.mcp_server_id
LEFT JOIN team t ON st.team_id = t.id
GROUP BY s.id;
```

**Problem:** The view aggregates ALL teams across ALL organizations.

**Solution:** Replaced view usage with custom queries that accept `organizationId` as a parameter and filter teams accordingly.

## Security Implications

### Before Fix
- ❌ **Information Disclosure**: Users could see team names from other organizations
- ❌ **Data Isolation Violation**: Organization boundaries were not properly enforced
- ❌ **Confusion**: UI showed teams that don't exist in the current organization context

### After Fix
- ✅ **Proper Data Isolation**: Teams are filtered by organization
- ✅ **No Information Leakage**: Only teams from the current organization are visible
- ✅ **Correct UI State**: Team badges accurately reflect the organization context

## Testing Checklist

### Manual Testing
- [x] Tools tab: Switch organizations → only shows teams from current org
- [x] MCP Servers: Switch organizations → team badges filtered by org
- [x] Agents tab: Switch organizations → only shows teams from current org
- [x] Models tab: Switch organizations → only shows teams from current org
- [x] Providers tab: Switch organizations → only shows teams from current org

### Regression Testing
- [x] Organization-wide resources (no teams) → still display correctly
- [x] Team-scoped resources → team badges show correct team names
- [x] Multi-team resources → all badges are from the same organization
- [x] Switching between organizations → data refreshes correctly

## Database Views Status

The following views are still defined but **no longer used** by the fixed endpoints:
- `mcp_servers_with_teams` - No longer used (line 713 in tools.js)
- `models_with_teams` - No longer used (line 431 in models.js)
- `providers_with_teams` - No longer used (line 408 in providers.js)
- `agents_with_teams` - Never used (agents already had custom queries)
- `tools_with_teams` - Never used (tools already had custom queries)

**Recommendation:** These views can remain for backward compatibility or be dropped in a future migration if no other code depends on them.

## Related Issues

This fix is part of the broader multi-team migration work:
- ✅ Migration 009: Added junction tables for multi-team support
- ✅ Migration 010: Removed deprecated `team_id` columns
- ✅ Frontend: Updated to use `teams` arrays instead of single `teamId`
- ✅ Backend: Updated validation to use junction tables
- ✅ Pydantic Backend: Updated to use junction tables
- ✅ **This Fix**: Added organization filtering to team queries

## Summary

This fix closes a data isolation gap where team information from one organization could leak into another organization's view. The solution adds organization-based filtering to all team aggregation queries, ensuring users only see teams that belong to their current organization context.

**Security Level:** Medium (Information Disclosure)
**Impact:** All admin tabs (Tools, Agents, Models, Providers)
**Status:** ✅ Resolved

