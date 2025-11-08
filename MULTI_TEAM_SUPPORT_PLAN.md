# Multi-Team Support Implementation Plan

## Overview
Transform the system from single-team assignment to multi-team support, allowing resources (providers, models, agents, tools, MCP servers) to be assigned to multiple teams simultaneously.

## Current State
- Each resource has a single `team_id` field
- Resources are either:
  - **Organization-wide**: `team_id = NULL` (available to all teams)
  - **Team-specific**: `team_id = 'team-123'` (available to one team only)

## Target State
- Each resource can be assigned to **multiple teams**
- Resources are either:
  - **Organization-wide**: No team associations (available to all teams)
  - **Multi-team**: Associated with specific teams via junction tables

## Architecture Changes

### 1. Database Schema

#### New Junction Tables:
- `provider_teams` (provider_id, team_id)
- `model_teams` (model_id, team_id)
- `agent_teams` (agent_id, team_id)
- `tool_teams` (tool_id, team_id)
- `mcp_server_teams` (mcp_server_id, team_id)

#### Helper Views:
- `providers_with_teams`
- `models_with_teams`
- `agents_with_teams`
- `tools_with_teams`
- `mcp_servers_with_teams`

These views aggregate team information as JSON arrays for easier querying.

### 2. Backend API Changes

#### Request/Response Format Changes:

**Before:**
```json
{
  "organizationId": "org-123",
  "teamId": "team-456",  // Single team ID
  "modelKey": "gpt-4"
}
```

**After:**
```json
{
  "organizationId": "org-123",
  "teamIds": ["team-456", "team-789"],  // Array of team IDs
  "scope": "teams",  // "organization" | "teams"
  "modelKey": "gpt-4"
}
```

#### Scope Logic:
- `scope: "organization"` → `teamIds: []` (empty array, org-wide)
- `scope: "teams"` → `teamIds: [...]` (specific teams)

#### API Endpoints to Update:

**Providers:**
- `GET /api/admin/providers` - Return array of team objects
- `POST /api/admin/providers` - Accept `teamIds` array
- `PUT /api/admin/providers/:id` - Accept `teamIds` array

**Models:**
- `GET /api/admin/models` - Return array of team objects
- `POST /api/admin/models` - Accept `teamIds` array
- `PUT /api/admin/models/:id` - Accept `teamIds` array

**Agents:**
- `GET /api/admin/agents` - Return array of team objects
- `POST /api/admin/agents` - Accept `teamIds` array
- `PUT /api/admin/agents/:id` - Accept `teamIds` array

**Tools:**
- `GET /api/admin/tools` - Return array of team objects
- `POST /api/admin/tools` - Accept `teamIds` array
- `PUT /api/admin/tools/:id` - Accept `teamIds` array

**MCP Servers:**
- `GET /api/admin/tools/mcp-servers` - Return array of team objects
- `POST /api/admin/tools/mcp-servers` - Accept `teamIds` array
- `PUT /api/admin/tools/mcp-servers/:id` - Accept `teamIds` array

#### Backend Query Updates:

**Before:**
```javascript
SELECT * FROM models 
WHERE organization_id = $1 
  AND (team_id IS NULL OR team_id = $2)
```

**After:**
```javascript
SELECT m.*, 
  COALESCE(
    json_agg(
      json_build_object('id', t.id, 'name', t.name)
    ) FILTER (WHERE t.id IS NOT NULL),
    '[]'
  ) as teams
FROM models m
LEFT JOIN model_teams mt ON m.id = mt.model_id
LEFT JOIN teams t ON mt.team_id = t.id
WHERE m.organization_id = $1
  AND (
    NOT EXISTS (SELECT 1 FROM model_teams WHERE model_id = m.id)  -- Org-wide
    OR EXISTS (
      SELECT 1 FROM model_teams 
      WHERE model_id = m.id 
        AND team_id = ANY($2::text[])  -- Matches any of user's teams
    )
  )
GROUP BY m.id
```

### 3. Frontend UI Changes

#### Replace Single Team Selector with Multi-Team Selector

**Current (Single):**
```typescript
<SingleTeamSelector
  selectedTeamId={form.teamId}
  onTeamChange={value => setForm({...form, teamId: value})}
  disabled={form.scope !== 'team'}
/>
```

**New (Multi):**
```typescript
<TeamMultiSelector
  selectedTeamIds={form.teamIds}
  onTeamChange={ids => setForm({...form, teamIds: ids})}
  disabled={form.scope !== 'teams'}
  placeholder="Select teams..."
/>
```

#### Scope Badge Updates

**Current:**
- Shows: "Team · DGP" or "Organization"

**New:**
- Shows: "Teams (2)" or "All Teams" or "Organization"
- On hover/click: Shows list of team names

#### Form State Updates

**Before:**
```typescript
interface FormState {
  scope: 'organization' | 'team';
  teamId: string;
}
```

**After:**
```typescript
interface FormState {
  scope: 'organization' | 'teams';
  teamIds: string[];
}
```

### 4. Migration Strategy

#### Phase 1: Database Migration
1. Run `009_add_multi_team_support.sql`
2. Creates junction tables
3. Migrates existing `team_id` data
4. Keeps `team_id` columns for backward compatibility

#### Phase 2: Backend Updates
1. Update all API endpoints to:
   - Accept `teamIds` array in requests
   - Return `teams` array in responses
   - Maintain backward compatibility with `teamId` (single)
2. Update database queries to use junction tables
3. Update filtering logic for multi-team access

#### Phase 3: Frontend Updates
1. Create `TeamMultiSelector` component
2. Update all forms (Models, Providers, Agents, Tools, MCP Servers)
3. Update scope badges to show team count
4. Update filtering logic

#### Phase 4: Deprecation (Future)
1. Remove backward compatibility for `teamId` (single)
2. Drop `team_id` columns from tables
3. Remove old API parameter handling

## Implementation Details

### New Component: TeamMultiSelector

```typescript
interface TeamMultiSelectorProps {
  isLight: boolean;
  teams: Team[];
  selectedTeamIds: string[];
  onTeamChange: (teamIds: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
}

export const TeamMultiSelector: React.FC<TeamMultiSelectorProps> = ({
  isLight,
  teams,
  selectedTeamIds,
  onTeamChange,
  placeholder = 'Select teams...',
  disabled = false,
  allowEmpty = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleTeam = (teamId: string) => {
    if (selectedTeamIds.includes(teamId)) {
      onTeamChange(selectedTeamIds.filter(id => id !== teamId));
    } else {
      onTeamChange([...selectedTeamIds, teamId]);
    }
  };

  const removeTeam = (teamId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onTeamChange(selectedTeamIds.filter(id => id !== teamId));
  };

  const selectedTeams = teams.filter(t => selectedTeamIds.includes(t.id));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md min-h-[32px] w-full border',
          disabled 
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer',
          isLight
            ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
            : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
        )}
      >
        <TeamIcon />
        <div className="flex-1 flex flex-wrap items-center gap-1 text-left">
          {selectedTeams.length === 0 ? (
            <span className="text-gray-500">{placeholder}</span>
          ) : (
            selectedTeams.map(team => (
              <span
                key={team.id}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs',
                  isLight
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-blue-900/30 text-blue-400'
                )}
              >
                {team.name}
                {!disabled && (
                  <button
                    onClick={(e) => removeTeam(team.id, e)}
                    className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))
          )}
        </div>
        <ChevronDownIcon />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-md border shadow-lg max-h-[240px] overflow-auto">
          {teams.map(team => {
            const isSelected = selectedTeamIds.includes(team.id);
            return (
              <button
                key={team.id}
                onClick={() => toggleTeam(team.id)}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-gray-100"
              >
                <Checkbox checked={isSelected} />
                <TeamIcon />
                <span>{team.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
```

### Updated Scope Badges

```typescript
const renderScopeBadge = (resource: Resource) => {
  // No teams = Organization-wide
  if (!resource.teams || resource.teams.length === 0) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
        Organization
      </span>
    );
  }

  // Multiple teams
  return (
    <span 
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 cursor-help"
      title={resource.teams.map(t => t.name).join(', ')}
    >
      Teams ({resource.teams.length})
    </span>
  );
};
```

### Backend Helper Function

```javascript
// Helper to sync team associations
async function syncTeamAssociations(pool, resourceTable, junctionTable, resourceId, teamIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete existing associations
    await client.query(
      `DELETE FROM ${junctionTable} WHERE ${resourceTable}_id = $1`,
      [resourceId]
    );

    // Insert new associations
    if (teamIds && teamIds.length > 0) {
      const values = teamIds.map((teamId, idx) => 
        `($1, $${idx + 2})`
      ).join(', ');
      
      await client.query(
        `INSERT INTO ${junctionTable} (${resourceTable}_id, team_id) 
         VALUES ${values}
         ON CONFLICT (${resourceTable}_id, team_id) DO NOTHING`,
        [resourceId, ...teamIds]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Usage example
await syncTeamAssociations(pool, 'model', 'model_teams', modelId, teamIds);
```

## Testing Checklist

### Database
- [ ] Junction tables created successfully
- [ ] Existing data migrated correctly
- [ ] Views return correct team arrays
- [ ] Indexes are created

### Backend API
- [ ] GET endpoints return `teams` array
- [ ] POST endpoints accept `teamIds` array
- [ ] PUT endpoints accept `teamIds` array
- [ ] Junction table updates work correctly
- [ ] Filtering by multiple teams works
- [ ] Backward compatibility maintained

### Frontend
- [ ] TeamMultiSelector component works
- [ ] Can select multiple teams
- [ ] Can remove teams
- [ ] Scope badges show correct info
- [ ] Forms submit correct data
- [ ] All tabs updated (Models, Providers, Agents, Tools, MCP Servers)

### User Access
- [ ] Users can see resources from any of their teams
- [ ] Org-wide resources visible to all teams
- [ ] Team-specific resources only visible to those teams
- [ ] Multi-team resources visible to all assigned teams

## Rollout Plan

### Step 1: Database Migration
```bash
cd copilotkit-pydantic
python run_migration.py 009_add_multi_team_support.sql
```

### Step 2: Backend Updates
1. Update `tools.js` MCP servers endpoint
2. Update `models.js` endpoints
3. Update `providers.js` endpoints  
4. Update `agents.js` endpoints

### Step 3: Frontend Updates
1. Create `TeamMultiSelector.tsx`
2. Update `ToolsTab.tsx`
3. Update `ModelsTab.tsx`
4. Update `ProvidersTab.tsx`
5. Update `AgentsTab.tsx`

### Step 4: Testing
- Test each tab individually
- Test cross-team access
- Test org-wide resources
- Test filtering

## Benefits

1. **Flexibility**: Resources can serve multiple teams
2. **Efficiency**: No need to duplicate resources
3. **Management**: Easier to manage shared resources
4. **Scalability**: Supports complex org structures
5. **Granularity**: Fine-grained access control

## Migration Impact

### Low Risk
- New tables don't affect existing functionality
- Backward compatibility maintained
- Can rollback if needed

### Data Migration
- Automatic migration of existing `team_id` values
- No data loss
- `team_id` columns kept for compatibility

### API Compatibility
- Supports both old (teamId) and new (teamIds) formats during transition
- Gradual migration path

