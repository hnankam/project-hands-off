# Multi-Team Support - Backend Implementation Complete! 🎉

## ✅ All Backend APIs Updated

All backend APIs have been successfully updated to support multi-team functionality. The deprecated `team_id` columns have been removed from the code (database migration pending).

### Summary of Changes

#### 1. **Tools API (MCP Servers)** ✅
- **GET `/api/admin/tools/mcp-servers`**: Returns servers with `teams` array
- **POST `/api/admin/tools/mcp-servers`**: Accepts `teamIds` array
- **PUT `/api/admin/tools/mcp-servers/:serverId`**: Accepts `teamIds` array
- **DELETE `/api/admin/tools/mcp-servers/:serverId`**: Updated scope matching

#### 2. **Models API** ✅
- **GET `/api/admin/models`**: Returns models with `teams` array
- **POST `/api/admin/models`**: Accepts `teamIds` array
- **PUT `/api/admin/models/:modelId`**: Accepts `teamIds` array
- Uses `models_with_teams` view for efficient querying

#### 3. **Providers API** ✅
- **GET `/api/admin/providers`**: Returns providers with `teams` array
- **POST `/api/admin/providers`**: Accepts `teamIds` array
- **PUT `/api/admin/providers/:providerId`**: Accepts `teamIds` array
- Uses `providers_with_teams` view for efficient querying

#### 4. **Agents API** ✅
- **GET `/api/admin/agents`**: Returns agents with `teams` array
- **POST `/api/admin/agents`**: Accepts `teamIds` array
- **PUT `/api/admin/agents/:agentId`**: Accepts `teamIds` array
- Uses `agents_with_teams` view for efficient querying

## Database Schema

### Junction Tables Created
- `provider_teams` - Many-to-many: providers ↔ teams
- `model_teams` - Many-to-many: models ↔ teams
- `agent_teams` - Many-to-many: agents ↔ teams
- `tool_teams` - Many-to-many: tools ↔ teams
- `mcp_server_teams` - Many-to-many: MCP servers ↔ teams

### Helper Views Created
- `providers_with_teams` - Providers with aggregated teams JSON
- `models_with_teams` - Models with aggregated teams JSON
- `agents_with_teams` - Agents with aggregated teams JSON
- `tools_with_teams` - Tools with aggregated teams JSON
- `mcp_servers_with_teams` - MCP servers with aggregated teams JSON

### Pending Migration
- `010_remove_deprecated_team_id.sql` - Removes `team_id` columns from all tables

## Backend Helper Functions

Created `/copilot-runtime-server/lib/team-helpers.js` with:

```javascript
// Sync team associations for a resource
syncTeamAssociations(pool, junctionTable, resourceIdColumn, resourceId, teamIds)

// Get teams for a resource
getTeamsForResource(pool, junctionTable, resourceIdColumn, resourceId)

// Build WHERE clause for filtering by user's teams
buildTeamAccessClause(resourceTable, junctionTable, resourceIdColumn, userTeamIds, paramOffset)

// Get resources with their teams using helper views
getResourcesWithTeams(pool, viewName, organizationId, userTeamIds, orderByColumn)
```

## API Request/Response Format Changes

### Before (Single Team)
```javascript
// Request
POST /api/admin/models
{
  "organizationId": "org-123",
  "teamId": "team-456",  // Single team
  "modelKey": "gpt-4"
}

// Response
{
  "model": {
    "id": "uuid",
    "modelKey": "gpt-4",
    "teamId": "team-456",
    "teamName": "Engineering"
  }
}
```

### After (Multi-Team)
```javascript
// Request
POST /api/admin/models
{
  "organizationId": "org-123",
  "teamIds": ["team-456", "team-789"],  // Multiple teams
  "modelKey": "gpt-4"
}

// Response
{
  "model": {
    "id": "uuid",
    "modelKey": "gpt-4",
    "teams": [
      {"id": "team-456", "name": "Engineering"},
      {"id": "team-789", "name": "Product"}
    ]
  }
}
```

## Key Implementation Details

### 1. Team Validation
All APIs now validate team IDs using:
```javascript
if (teamIds.length > 0) {
  const { rows } = await pool.query(
    'SELECT id FROM team WHERE id = ANY($1::text[]) AND "organizationId" = $2',
    [teamIds, organizationId],
  );
  if (rows.length !== teamIds.length) {
    return res.status(404).json({ error: 'One or more teams not found in organization' });
  }
}
```

### 2. Team Association Sync
Using the `syncTeamAssociations` helper:
```javascript
// Associate with teams if provided
if (teamIds.length > 0) {
  await syncTeamAssociations(pool, 'model_teams', 'model_id', modelId, teamIds);
}
```

### 3. Fetching with Teams
Using helper views:
```javascript
const { rows } = await pool.query(
  `SELECT * FROM models_with_teams
   WHERE organization_id = $1
   ORDER BY created_at DESC`,
  [organizationId],
);
```

### 4. Scope Changes
- **Before**: Resources could be org-wide OR team-specific (single team)
- **After**: Resources can be org-wide OR associated with multiple teams
- Org-wide resources: `teams = []` (empty array)
- Team-scoped resources: `teams = [{id, name}, ...]` (array of team objects)

## Code Cleanup

### Removed from Backend Code
- ❌ `teamId` parameter (single team)
- ❌ `teamName` field in responses
- ❌ `team_id` column references in INSERT/UPDATE queries
- ❌ `LEFT JOIN team t ON resource.team_id = t.id` queries
- ❌ Team-based duplicate checking (now org-based)

### Added to Backend Code
- ✅ `teamIds` parameter (array)
- ✅ `teams` field in responses (array of {id, name})
- ✅ Junction table operations via `syncTeamAssociations`
- ✅ Helper view queries for efficient team aggregation
- ✅ Array-based team validation

## Testing Checklist

### API Testing (Backend)
- [x] Create resource with no teams (org-wide)
- [x] Create resource with one team
- [x] Create resource with multiple teams
- [x] Update resource teams (add/remove)
- [x] List resources (returns teams arrays)
- [x] Verify team validation (invalid team IDs)
- [x] Test duplicate checking (now org-scoped)

### Integration Testing
- [ ] Frontend can create resources with multiple teams
- [ ] Frontend displays team badges correctly
- [ ] Frontend can filter by team
- [ ] Frontend can edit team associations

## Next Steps

### 1. Run Database Migration (Optional)
```bash
cd copilotkit-pydantic
source .venv/bin/activate
python database/run_migration.py --file database/migrations/010_remove_deprecated_team_id.sql
```

**Note**: This migration removes `team_id` columns. Only run after frontend is updated!

### 2. Update Frontend Components
- [ ] Update `ToolsTab.tsx` to use `TeamMultiSelector`
- [ ] Update `ModelsTab.tsx` to use `TeamMultiSelector`
- [ ] Update `ProvidersTab.tsx` to use `TeamMultiSelector`
- [ ] Update `AgentsTab.tsx` to use `TeamMultiSelector`

### 3. Update Frontend API Calls
- Replace `teamId` with `teamIds` in create/update requests
- Update type definitions to use `teams: Array<{id: string, name: string}>`
- Update scope badge rendering to handle multiple teams

### 4. Update Frontend Forms
- Replace `SingleTeamSelector` with `TeamMultiSelector`
- Update form state from `teamId: string` to `teamIds: string[]`
- Update form submission logic

## Files Modified

### Created
- ✅ `copilot-runtime-server/lib/team-helpers.js` - Reusable team management functions
- ✅ `copilotkit-pydantic/database/migrations/009_add_multi_team_support.sql` - Junction tables and views
- ✅ `copilotkit-pydantic/database/migrations/010_remove_deprecated_team_id.sql` - Remove deprecated columns
- ✅ `pages/side-panel/src/components/admin/TeamMultiSelector.tsx` - Multi-select component

### Modified (Backend)
- ✅ `copilot-runtime-server/routes/tools.js` - MCP Servers API
- ✅ `copilot-runtime-server/routes/models.js` - Models API
- ✅ `copilot-runtime-server/routes/providers.js` - Providers API
- ✅ `copilot-runtime-server/routes/agents.js` - Agents API

### To Be Modified (Frontend)
- ⏳ `pages/side-panel/src/components/admin/ToolsTab.tsx`
- ⏳ `pages/side-panel/src/components/admin/ModelsTab.tsx`
- ⏳ `pages/side-panel/src/components/admin/ProvidersTab.tsx`
- ⏳ `pages/side-panel/src/components/admin/AgentsTab.tsx`

## Progress Summary

**Backend Implementation: 100% Complete** 🎉

- ✅ Database schema (junction tables + views)
- ✅ Backend helper functions
- ✅ Tools API (MCP Servers)
- ✅ Models API
- ✅ Providers API
- ✅ Agents API
- ✅ Code cleanup (removed teamId references)
- ✅ No linter errors

**Frontend Implementation: 0% Complete**

- ⏳ TeamMultiSelector component (created, not integrated)
- ⏳ ToolsTab updates
- ⏳ ModelsTab updates
- ⏳ ProvidersTab updates
- ⏳ AgentsTab updates

**Overall Progress: 60% Complete**

## Notes

1. **Backward Compatibility**: The backend no longer accepts `teamId` (single). All requests must use `teamIds` (array).

2. **Empty Arrays**: An empty `teamIds` array means the resource is org-wide (available to all teams).

3. **Database Views**: The `*_with_teams` views automatically aggregate team information as JSON, making queries efficient.

4. **Junction Tables**: All team associations are managed via junction tables with `ON DELETE CASCADE` for automatic cleanup.

5. **Validation**: Team validation ensures all provided team IDs exist and belong to the organization.

6. **Duplicate Checking**: Resource uniqueness is now checked at the organization level, not team level.

## Migration Path

### Phase 1: Backend (Complete) ✅
1. Create junction tables and views
2. Update backend APIs to use `teamIds`
3. Remove `teamId` from code
4. Test backend endpoints

### Phase 2: Frontend (In Progress) ⏳
1. Update frontend components to use `TeamMultiSelector`
2. Update API calls to send `teamIds`
3. Update type definitions
4. Update scope badge rendering
5. Test frontend functionality

### Phase 3: Database Cleanup (Pending) ⏳
1. Run migration to remove `team_id` columns
2. Verify no references to old columns
3. Update documentation

## Success Criteria

- [x] All backend APIs accept `teamIds` arrays
- [x] All backend APIs return `teams` arrays
- [x] Junction tables properly manage associations
- [x] Helper views efficiently aggregate team data
- [x] No `teamId` references in backend code
- [x] No linter errors in backend code
- [ ] Frontend forms use `TeamMultiSelector`
- [ ] Frontend displays team badges correctly
- [ ] Frontend can create/edit multi-team resources
- [ ] End-to-end testing passes

---

**Status**: Backend implementation complete! Ready for frontend integration. 🚀

