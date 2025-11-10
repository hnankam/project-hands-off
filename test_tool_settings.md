# Tool Settings Testing Guide

## ✅ Migrations Applied Successfully

Both migrations have been applied:
- ✅ Migration 011: `organization_tool_settings` table created
- ✅ Migration 012: `team_tool_settings` table created

### Database Verification

**organization_tool_settings table:**
- id (uuid) - Primary key
- organization_id (text) - References organization
- tool_id (uuid) - References tools
- enabled (boolean) - Enabled state
- created_at, updated_at (timestamp)
- Unique constraint on (organization_id, tool_id)
- Indexes on organization_id and tool_id

**team_tool_settings table:**
- id (uuid) - Primary key
- team_id (text) - References team
- tool_id (uuid) - References tools
- enabled (boolean) - Enabled state
- created_at, updated_at (timestamp)
- Unique constraint on (team_id, tool_id)
- Indexes on team_id and tool_id

## Testing the Frontend Filters

### Current State
The frontend ToolsTab.tsx should work without any changes because:

1. **Backend API is backward compatible:**
   - Still accepts `enabled` parameter (org-level)
   - Still returns `enabled` field (org-level effective state)
   - New `teamEnabledStates` field is optional

2. **Frontend team filtering:**
   - Uses `TeamMultiSelector` component (already fixed)
   - Sends `teamIds` query parameter to backend
   - Backend filters tools based on teams correctly

### What Should Work Now

#### 1. Organization-Level Tool Toggle
- Navigate to Tools tab
- Select an organization
- Toggle any tool (e.g., "Code Execution")
- ✅ Should update `organization_tool_settings` table
- ✅ Should not affect other organizations

#### 2. Team Filtering
- Navigate to Tools tab
- Select an organization
- Select one or more teams from "Filter by Team" dropdown
- ✅ Should show only tools assigned to those teams (or org-wide tools)
- ✅ Multiple team selection should work correctly

#### 3. Team-Scoped Tools
- Tools with `organization_id` and team associations:
  - ✅ Should appear when their teams are selected
  - ✅ Should be filtered out when other teams are selected
  - ✅ Org-wide tools should always appear

### Manual Testing Steps

1. **Test Org-Level Toggle:**
   ```
   1. Open DevTools Network tab
   2. Navigate to Tools tab
   3. Toggle "Code Execution" tool
   4. Check the PUT request payload:
      - Should include: organizationId, enabled
   5. Verify response includes updated enabled state
   6. Switch to another org, verify tool state is independent
   ```

2. **Test Team Filtering:**
   ```
   1. Select "Filter by Team" dropdown
   2. Select multiple teams
   3. Verify:
      - URL updates with teamIds parameter
      - Tools list shows correctly filtered tools
      - Can select/deselect teams without losing other selections
   ```

3. **Test Team-Level Toggle (API only - UI not implemented):**
   ```bash
   # Use curl or Postman to test team-level settings
   curl -X PUT 'http://localhost:3001/api/admin/tools/{toolId}' \
     -H 'Content-Type: application/json' \
     -d '{
       "organizationId": "your-org-id",
       "enabled": false,
       "teamEnabledStates": {
         "team-1-id": true,
         "team-2-id": false
       }
     }'
   
   # Then GET tools with team filtering
   curl 'http://localhost:3001/api/admin/tools?organizationId=your-org-id&teamIds=team-1-id,team-2-id'
   # Should return teamEnabledStates in response
   ```

### Expected Behavior

#### Before (Old Behavior):
- Toggling "Code Execution" in Org A would affect ALL organizations
- Team filter would only select the last team clicked

#### After (New Behavior):
- Toggling "Code Execution" in Org A only affects Org A ✅
- Team filter allows multiple team selection ✅
- Each org has independent tool settings ✅
- (Optional) Each team can have independent settings ✅

### Verification Queries

Check organization-specific settings:
```sql
SELECT 
  o.name as org_name,
  t.tool_key,
  ots.enabled as org_enabled
FROM organization_tool_settings ots
JOIN organization o ON o.id = ots.organization_id
JOIN tools t ON t.id = ots.tool_id
ORDER BY o.name, t.tool_key;
```

Check team-specific settings:
```sql
SELECT 
  tm.name as team_name,
  t.tool_key,
  tts.enabled as team_enabled
FROM team_tool_settings tts
JOIN team tm ON tm.id = tts.team_id
JOIN tools t ON t.id = tts.tool_id
ORDER BY tm.name, t.tool_key;
```

### Troubleshooting

If tools are not loading:
1. Check browser console for errors
2. Check Network tab for API response
3. Verify backend is running and migrations applied
4. Check backend logs for SQL errors

If team filtering is not working:
1. Verify TeamMultiSelector is being used (not TeamSelector)
2. Check that handleTeamFilterChange passes all team IDs
3. Verify backend receives teamIds parameter
4. Check that filteredTools logic uses includes() for arrays

## Next Steps for UI Enhancement (Optional)

To add team-level toggle UI:

1. **Detect Team Context:**
   ```typescript
   const hasTeamFilter = teamFilterIds.length > 0;
   ```

2. **Show Team Toggle:**
   ```typescript
   {hasTeamFilter && tool.teamEnabledStates && (
     <div>
       {teamFilterIds.map(teamId => (
         <Checkbox
           key={teamId}
           checked={tool.teamEnabledStates[teamId] ?? tool.enabled}
           onChange={() => handleTeamToggle(tool, teamId)}
           label={teams.find(t => t.id === teamId)?.name}
         />
       ))}
     </div>
   )}
   ```

3. **Update Handler:**
   ```typescript
   const handleTeamToggle = async (tool, teamId) => {
     await updateTool(tool.id, {
       organizationId: selectedOrgId,
       teamEnabledStates: {
         [teamId]: !(tool.teamEnabledStates?.[teamId] ?? tool.enabled)
       }
     });
   };
   ```

## Summary

✅ **Migrations Complete**
✅ **Backend Updated**
✅ **Backward Compatible**
✅ **Team Filters Fixed** (multi-select working)
✅ **Organization-Specific Settings** (implemented)
✅ **Team-Specific Settings** (API ready, UI optional)

The system is now ready for testing!

