# Multi-Team Support - Implementation Summary

## What Was Created

### 1. Database Migration
**File**: `copilotkit-pydantic/database/migrations/009_add_multi_team_support.sql`

- Creates 5 junction tables for many-to-many relationships:
  - `provider_teams`
  - `model_teams`
  - `agent_teams`
  - `tool_teams`
  - `mcp_server_teams`

- Migrates existing `team_id` data to junction tables
- Creates helper views for easier querying (returns teams as JSON arrays)
- Maintains backward compatibility with existing `team_id` columns

### 2. Implementation Plan
**File**: `MULTI_TEAM_SUPPORT_PLAN.md`

Complete guide covering:
- Architecture changes
- API modifications
- UI component updates
- Migration strategy
- Testing checklist
- Rollout plan

### 3. New Component
**File**: `pages/side-panel/src/components/admin/TeamMultiSelector.tsx`

Multi-select dropdown component with:
- Checkbox selection for each team
- "Select All" and "Clear" buttons
- Shows count badge when multiple teams selected
- Consistent with existing design system
- Loading and disabled states
- Click-outside-to-close functionality

## Key Changes Required

### Backend (Node.js)

#### Update API Endpoints:
```javascript
// Before
POST /api/admin/models
{
  "teamId": "team-123"  // Single team
}

// After  
POST /api/admin/models
{
  "teamIds": ["team-123", "team-456"]  // Multiple teams
  "scope": "teams"  // or "organization"
}
```

#### Update Queries:
```sql
-- Before
SELECT * FROM models WHERE team_id = $1

-- After
SELECT m.*, 
  json_agg(json_build_object('id', t.id, 'name', t.name)) as teams
FROM models m
LEFT JOIN model_teams mt ON m.id = mt.model_id
LEFT JOIN teams t ON mt.team_id = t.id
GROUP BY m.id
```

#### Add Helper Function:
```javascript
async function syncTeamAssociations(pool, table, junctionTable, resourceId, teamIds) {
  // Delete old associations
  // Insert new associations
  // Handle transaction
}
```

### Frontend (React/TypeScript)

#### Replace Single Selector:
```typescript
// Before
import { SingleTeamSelector } from './TeamSelector';
<SingleTeamSelector
  selectedTeamId={form.teamId}
  onTeamChange={value => setForm({...form, teamId: value})}
/>

// After
import { TeamMultiSelector } from './TeamMultiSelector';
<TeamMultiSelector
  selectedTeamIds={form.teamIds}
  onTeamChange={ids => setForm({...form, teamIds: ids})}
/>
```

#### Update Form State:
```typescript
// Before
interface FormState {
  scope: 'organization' | 'team';
  teamId: string;
}

// After
interface FormState {
  scope: 'organization' | 'teams';
  teamIds: string[];
}
```

#### Update Scope Badges:
```typescript
// Before
{tool.teamId ? `Team · ${teamName}` : 'Organization'}

// After
{tool.teams.length > 0 
  ? `Teams (${tool.teams.length})` 
  : 'Organization'}
```

## Migration Steps

### Step 1: Run Database Migration
```bash
cd copilotkit-pydantic
python run_migration.py 009_add_multi_team_support.sql
```

### Step 2: Update Backend APIs
1. Tools API (`copilot-runtime-server/routes/tools.js`)
2. Models API (`copilot-runtime-server/routes/models.js`)
3. Providers API (`copilot-runtime-server/routes/providers.js`)
4. Agents API (`copilot-runtime-server/routes/agents.js`)

For each:
- Update GET to return `teams` array
- Update POST/PUT to accept `teamIds` array
- Update queries to use junction tables
- Implement `syncTeamAssociations` helper

### Step 3: Update Frontend
1. Import `TeamMultiSelector` in each tab
2. Update form state from `teamId` to `teamIds`
3. Replace `SingleTeamSelector` with `TeamMultiSelector`
4. Update scope logic (`'team'` → `'teams'`)
5. Update badges to show team count
6. Update API calls to send `teamIds` array

### Step 4: Test
- Create resources with multiple teams
- Verify users can see resources from their teams
- Test org-wide resources (no teams)
- Test filtering
- Test editing/updating team assignments

## Benefits

### 1. Flexibility
- Assign a model to both "Engineering" and "Product" teams
- Share tools across multiple teams without duplication
- Fine-grained access control

### 2. Efficiency
- No need to create duplicate resources
- Centralized management
- Easier updates (change once, affects all teams)

### 3. User Experience
- Clear visual indication of team assignments
- Easy to see which teams have access
- Intuitive multi-select interface

### 4. Scalability
- Supports complex organizational structures
- Handles any number of teams per resource
- Efficient database queries with proper indexes

## Example Use Cases

### Use Case 1: Shared Model
```
Model: GPT-4
Organization: Acme Corp
Teams: Engineering, Product, Marketing
```
- All three teams can use this model
- Single configuration, multiple teams
- Changes apply to all teams

### Use Case 2: Department-Specific Tool
```
Tool: Jira Integration
Organization: Acme Corp
Teams: Engineering, QA
```
- Only Engineering and QA can use this tool
- Other teams don't see it
- Scoped access control

### Use Case 3: Organization-Wide Resource
```
Provider: OpenAI
Organization: Acme Corp
Teams: (none - org-wide)
```
- Available to all teams
- No specific team restrictions
- Default for most resources

## Technical Details

### Database Schema

#### Junction Table Example:
```sql
CREATE TABLE model_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(model_id, team_id)
);
```

#### View Example:
```sql
CREATE VIEW models_with_teams AS
SELECT 
    m.*,
    COALESCE(
        json_agg(
            json_build_object('id', t.id, 'name', t.name) 
            ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::json
    ) as teams
FROM models m
LEFT JOIN model_teams mt ON m.id = mt.model_id
LEFT JOIN teams t ON mt.team_id = t.id
GROUP BY m.id;
```

### Access Control Logic

```javascript
// User has access if:
// 1. Resource is org-wide (no teams), OR
// 2. Resource is assigned to at least one of user's teams

function hasAccess(resource, userTeamIds) {
  // Org-wide resource
  if (!resource.teams || resource.teams.length === 0) {
    return true;
  }
  
  // Team-specific resource
  return resource.teams.some(team => 
    userTeamIds.includes(team.id)
  );
}
```

### API Response Format

```json
{
  "model": {
    "id": "model-123",
    "modelKey": "gpt-4",
    "organizationId": "org-456",
    "teams": [
      {"id": "team-789", "name": "Engineering"},
      {"id": "team-012", "name": "Product"}
    ],
    "enabled": true
  }
}
```

## Backward Compatibility

### Phase 1: Dual Support (Current → Next Release)
- Backend accepts both `teamId` (single) and `teamIds` (array)
- Frontend sends `teamIds` array
- Database has both `team_id` column and junction tables
- Queries check both sources

### Phase 2: Deprecation Warning (Next+1 Release)
- Log warnings when `teamId` is used
- Documentation updated to use `teamIds`
- Migration guide for API consumers

### Phase 3: Removal (Next+2 Release)
- Drop support for `teamId` parameter
- Remove `team_id` columns from database
- Full migration to multi-team model

## Next Steps

1. **Review and approve** the migration SQL
2. **Test migration** on development database
3. **Update backend APIs** one at a time
4. **Update frontend** tab by tab
5. **QA testing** for each updated tab
6. **Deploy to staging** for integration testing
7. **Production deployment** with rollback plan

## Questions to Consider

1. **Should resources require at least one team assignment?**
   - Or allow org-wide resources with zero teams?
   - Current plan: Allow zero teams = org-wide

2. **How to handle team deletion?**
   - CASCADE deletes team associations
   - Resources become available to fewer teams
   - If last team is deleted, becomes org-wide

3. **UI for showing many teams?**
   - Badge with count: "Teams (15)"
   - Hover to show list?
   - Click to expand full list?

4. **Filtering with multiple teams?**
   - Show resources from ANY of selected teams?
   - Or only resources in ALL selected teams?
   - Current plan: ANY (union, not intersection)

## Files to Update

### Backend:
- ✅ `copilotkit-pydantic/database/migrations/009_add_multi_team_support.sql`
- ⏳ `copilot-runtime-server/routes/tools.js`
- ⏳ `copilot-runtime-server/routes/models.js`
- ⏳ `copilot-runtime-server/routes/providers.js`
- ⏳ `copilot-runtime-server/routes/agents.js`

### Frontend:
- ✅ `pages/side-panel/src/components/admin/TeamMultiSelector.tsx`
- ⏳ `pages/side-panel/src/components/admin/ToolsTab.tsx`
- ⏳ `pages/side-panel/src/components/admin/ModelsTab.tsx`
- ⏳ `pages/side-panel/src/components/admin/ProvidersTab.tsx`
- ⏳ `pages/side-panel/src/components/admin/AgentsTab.tsx`

### Documentation:
- ✅ `MULTI_TEAM_SUPPORT_PLAN.md`
- ✅ `MULTI_TEAM_SUPPORT_SUMMARY.md`

