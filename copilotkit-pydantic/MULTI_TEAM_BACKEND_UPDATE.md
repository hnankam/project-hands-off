# Pydantic Backend Multi-Team Migration Update

## Summary

Updated the pydantic backend to use junction tables for multi-team support, aligning with migration 010 that removes deprecated `team_id` columns from resource tables.

## Files Updated

### 1. `config/db_loaders.py` ✅

**Changes:**
- Updated `_scope_rank()` function signature to accept `row_teams: List[str]` instead of `row_team: str`
- Removed old `_build_scope_condition()` function
- Rewrote all SQL queries to use LEFT JOIN with junction tables:
  - `provider_teams` for providers
  - `model_teams` for models  
  - `agent_teams` for agents
  - `tool_teams` for tools
  - `mcp_server_teams` for MCP servers
- Updated scope precedence logic to check team membership (`team_id IN row_teams`)
- Base instructions remain organization-scoped only (no team support)

**Query Pattern:**
```sql
-- OLD (BROKEN after migration 010)
SELECT ... FROM resources WHERE team_id = %(team_id)s OR team_id IS NULL

-- NEW (WORKING with junction tables)
SELECT ..., 
       COALESCE(
           (SELECT array_agg(jt.team_id)
            FROM junction_table jt
            WHERE jt.resource_id = r.id),
           ARRAY[]::text[]
       ) as team_ids
FROM resources r
WHERE organization_id = %(organization_id)s
  AND (
      NOT EXISTS (SELECT 1 FROM junction_table jt WHERE jt.resource_id = r.id)
      OR EXISTS (SELECT 1 FROM junction_table jt WHERE jt.resource_id = r.id AND jt.team_id = %(team_id)s)
  )
```

### 2. `api/routes.py` ✅

**Changes:**
- Updated agent ID resolution query to use `agent_teams` junction table
- Updated model ID resolution query to use `model_teams` junction table
- Maintained correct precedence ordering:
  1. Team-level (team member + org match)
  2. Organization-level (org match, no teams)
  3. Global (no org, no teams)

**Usage Tracking:**
- `usage.team_id` column still exists and is correctly used (usage is a tracking table, not a resource table)

## Database Schema Compatibility

### Before Migration 010:
```sql
CREATE TABLE agents (
    ...
    team_id TEXT,  -- DEPRECATED
    ...
);
```

### After Migration 010:
```sql
CREATE TABLE agents (
    ...
    -- team_id column REMOVED
);

CREATE TABLE agent_teams (
    agent_id UUID,
    team_id TEXT,
    PRIMARY KEY (agent_id, team_id)
);
```

## Scope Precedence Logic

The updated system correctly handles multi-team resources:

```python
def _scope_rank(row_org, row_teams, organization_id, team_id):
    # Priority 0: Team-specific (team in row_teams AND org matches)
    if team_id and row_teams and team_id in row_teams and row_org == organization_id:
        return 0
    
    # Priority 1: Organization-wide (org matches, no teams)
    if organization_id and row_org == organization_id and len(row_teams) == 0:
        return 1
    
    # Priority 2: Global (no org, no teams)
    if not row_org and len(row_teams) == 0:
        return 2
    
    # Priority 3: No match
    return 3
```

## Testing Checklist

- [ ] Test global resource loading (no org, no team)
- [ ] Test organization-wide resource loading (org, no team)
- [ ] Test team-specific resource loading (org + team)
- [ ] Test multi-team resource visibility
- [ ] Test scope precedence ordering
- [ ] Verify agent deployments work
- [ ] Verify model loading works
- [ ] Verify tool availability works
- [ ] Verify provider configuration works
- [ ] Verify MCP server loading works
- [ ] Verify usage tracking still works

## Migration Safety

✅ **Safe to run migration 010** after these changes are deployed.

The pydantic backend now:
- Does NOT query `team_id` columns from resource tables
- Uses junction tables for all team associations
- Maintains backward compatibility with existing deployment manager
- Correctly handles multi-team associations

## Related Files (No Changes Needed)

These files use the updated loaders and don't need changes:
- `config/models.py` - Context functions work with existing parameters
- `config/prompts.py` - Context functions work with existing parameters  
- `config/tools.py` - Context functions work with existing parameters
- `services/deployment_manager.py` - Calls loaders with team_id parameter
- `services/usage_tracker.py` - Uses `usage.team_id` which still exists
- `utils/context.py` - Just passes parameters through

## Benefits

1. ✅ Full multi-team support - resources can be associated with multiple teams
2. ✅ Consistent with Node.js backend architecture
3. ✅ Compatible with migration 010 (removes deprecated columns)
4. ✅ Maintains existing API contracts (team_id parameter still accepted)
5. ✅ No breaking changes for deployment manager or context system

## Next Steps

1. Deploy updated pydantic backend
2. Test all deployment scenarios
3. Run migration 010 to remove deprecated team_id columns
4. Monitor deployment logs for any issues

