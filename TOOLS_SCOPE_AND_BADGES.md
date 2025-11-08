# Tools Tab: Scope and Team Selection for MCP Servers + Scope Badges

## Overview
Added scope (Organization/Team) selection to MCP server forms and implemented scope badges for both tools and MCP servers, matching the design pattern used in the Models tab.

## Changes Made

### 1. **Frontend Changes (`ToolsTab.tsx`)**

#### A. New Imports
```typescript
import { TeamSelector, SingleTeamSelector } from './TeamSelector';
import { Checkbox, Radio } from './FormControls';
```
- Added `Radio` for scope selection
- Added `SingleTeamSelector` for team dropdown

#### B. Type Definitions
```typescript
type McpServerScope = 'organization' | 'team';

interface McpServerFormState {
  // ... existing fields
  scope: McpServerScope;
  teamId: string;
  enabled: boolean;
}

interface McpServerRecord {
  // ... existing fields
  teamName?: string | null;  // NEW: Added for displaying team name
}
```

#### C. Scope Badge Rendering Functions

**For Tools:**
```typescript
const renderToolScopeBadge = (tool: ToolRecord) => {
  if (tool.teamId) {
    const team = teams.find(t => t.id === tool.teamId);
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
        Team · {team?.name || 'Unknown'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
      Organization
    </span>
  );
};
```

**For MCP Servers:**
```typescript
const renderServerScopeBadge = (server: McpServerRecord) => {
  if (server.teamId) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
        Team · {server.teamName || 'Unknown'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
      Organization
    </span>
  );
};
```

**Badge Colors:**
- **Team scope**: Blue badge (`bg-blue-100 text-blue-700` / `bg-blue-900/30 text-blue-400`)
- **Organization scope**: Purple badge (`bg-purple-100 text-purple-700` / `bg-purple-900/30 text-purple-400`)

#### D. MCP Server Form Updates

**Initialize Form State:**
```typescript
const INITIAL_SERVER_FORM: McpServerFormState = {
  // ... existing fields
  scope: 'organization',
  teamId: '',
  enabled: true,
};
```

**Edit Server Initialization:**
```typescript
const startEditServer = (server: McpServerRecord) => {
  setEditingServerId(server.id);
  setEditServerForm({
    // ... existing fields
    scope: server.teamId ? 'team' : 'organization',
    teamId: server.teamId || '',
    enabled: server.enabled,
  });
};
```

**Scope and Team Selector UI (in both create and edit forms):**
```typescript
<div className="grid grid-cols-2 gap-3">
  <div>
    <label>Scope</label>
    <div className="flex items-center gap-4">
      <Radio
        name="server-scope"
        value="organization"
        checked={serverForm.scope === 'organization'}
        onChange={() => setServerForm(prev => ({ ...prev, scope: 'organization', teamId: '' }))}
        label="Organization"
        isLight={isLight}
      />
      <Radio
        name="server-scope"
        value="team"
        checked={serverForm.scope === 'team'}
        onChange={() => setServerForm(prev => ({ ...prev, scope: 'team' }))}
        label="Team"
        isLight={isLight}
      />
    </div>
  </div>
  <div>
    <label>Team (optional)</label>
    <SingleTeamSelector
      isLight={isLight}
      teams={teams}
      selectedTeamId={serverForm.teamId}
      onTeamChange={value => setServerForm(prev => ({ ...prev, teamId: value }))}
      placeholder="Select team"
      disabled={serverForm.scope !== 'team'}
      allowEmpty={false}
    />
  </div>
</div>
```

**Submit Logic:**
```typescript
// Create server
body: JSON.stringify({
  organizationId: selectedOrgId,
  teamId: serverForm.scope === 'team' ? serverForm.teamId || null : null,
  // ... other fields
}),

// Update server
body: JSON.stringify({
  organizationId: selectedOrgId,
  teamId: editServerForm.scope === 'team' ? editServerForm.teamId || null : null,
  // ... other fields
}),
```

#### E. Tool Accordion Updates

**Added Scope Column to Table Header:**
```typescript
<th className="px-4 py-2 font-medium">Enabled</th>
<th className="px-4 py-2 font-medium">Name</th>
<th className="px-4 py-2 font-medium">Key</th>
<th className="px-4 py-2 font-medium">Scope</th>  // NEW
<th className="px-4 py-2 font-medium">Description</th>
```

**Added Scope Badge to Table Body:**
```typescript
<td className="px-4 py-2 whitespace-nowrap">
  {renderToolScopeBadge(tool)}
</td>
```

**Updated colSpan:**
- Changed from `colSpan={4}` to `colSpan={5}` for empty state message

#### F. MCP Server Card Updates

**Added Scope Badge Display:**
```typescript
<div className="flex items-center gap-2 mt-1">
  {renderServerScopeBadge(server)}
  {serverToolCount > 0 && (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium">
      {serverToolCount} tool{serverToolCount !== 1 ? 's' : ''}
    </span>
  )}
</div>
```

### 2. **Backend Changes (`copilot-runtime-server/routes/tools.js`)**

#### Updated MCP Server Query
Added `LEFT JOIN` with teams table to fetch team names:

```javascript
const { rows } = await pool.query(
  `
    SELECT s.*, t.name as team_name
    FROM mcp_servers s
    LEFT JOIN teams t ON s.team_id = t.id
    WHERE (s.organization_id IS NULL OR s.organization_id = $1)
      ${teamClause}
    ORDER BY s.server_key
  `,
  params,
);
```

**Changes:**
- Added `LEFT JOIN teams t ON s.team_id = t.id`
- Selected `t.name as team_name` to include team name in response
- The `toCamelServer` function converts `team_name` to `teamName` automatically

## UI/UX Features

### 1. **Scope Selection**
- **Radio Buttons**: Organization or Team
- **Visual Grouping**: Two radio buttons side by side
- **Auto-clear Team**: Selecting "Organization" clears the team selection
- **Consistent Layout**: Matches Models tab scope selection

### 2. **Team Dropdown**
- **Disabled State**: Grayed out when scope is "Organization"
- **Single Selection**: Uses `SingleTeamSelector` component
- **Placeholder**: "Select team" when no team selected
- **Required**: When scope is "Team", user must select a team

### 3. **Scope Badges**

#### Tool Accordions:
- **Location**: New "Scope" column in all tool tables
- **Design**: Small rounded badges with color coding
- **Content**: Shows "Organization" or "Team · TeamName"

#### MCP Server Cards:
- **Location**: Below server key/transport/command line
- **Grouping**: Displayed alongside tool count badge
- **Consistency**: Same design as tool badges

#### Badge Styling:
```css
/* Team Badge */
Light: bg-blue-100 text-blue-700
Dark: bg-blue-900/30 text-blue-400

/* Organization Badge */
Light: bg-purple-100 text-purple-700
Dark: bg-purple-900/30 text-purple-400
```

## Form Layout

### Create MCP Server Form:
```
┌────────────────────────────────────────────┐
│ Server Key          | Display Name         │
│ Transport           | Command              │
│ Arguments           | URL                  │
│ Environment Vars    | Metadata             │
│ Scope (O/T)        | Team Dropdown        │ ← NEW
│                                            │
│ [Test Connectivity]                        │
│                     [Create] [Cancel]      │
└────────────────────────────────────────────┘
```

### Edit MCP Server Form:
Same layout as create form, with scope and team pre-selected based on server's current configuration.

## Data Flow

### 1. **Creating a Server**
```javascript
User selects scope → "Team"
User selects team → "DGP"
Form submits with:
{
  organizationId: "org-123",
  teamId: "team-456",  // DGP's ID
  ...
}
```

### 2. **Loading Servers**
```javascript
Backend query returns:
{
  id: "server-1",
  serverKey: "corp-jira",
  teamId: "team-456",
  teamName: "DGP",  // From JOIN
  ...
}

Frontend initializes edit form:
{
  scope: "team",  // Derived from teamId
  teamId: "team-456",
  ...
}
```

### 3. **Displaying Badges**
```javascript
// Tools
renderToolScopeBadge(tool) →
  tool.teamId ? "Team · [name from teams array]" : "Organization"

// Servers
renderServerScopeBadge(server) →
  server.teamId ? "Team · [teamName from DB]" : "Organization"
```

## Consistency with Models Tab

### ✅ Matching Features:
1. **Scope Radio Buttons**: Same layout and behavior
2. **Team Dropdown**: Same `SingleTeamSelector` component
3. **Badge Colors**: Blue for Team, Purple for Organization
4. **Badge Design**: Same font size (text-[10px]), padding, and rounding
5. **Form Layout**: Two-column grid for scope and team
6. **Label Text**: "Scope" and "Team (optional)"
7. **Disabled State**: Team dropdown disabled when scope is Organization

### 📊 Visual Comparison

#### Models Card:
```
Model Name
model-key · provider-name
[Provider Badge] [Scope Badge]
```

#### MCP Server Card:
```
Server Name
server-key · transport · command
[Scope Badge] [N tools]
```

#### Tool Table Row:
```
| ☑ | Tool Name | tool-key | [Scope Badge] | Description |
```

## Testing Scenarios

### 1. **Create Server at Organization Level**
- Select "Organization" scope
- Team dropdown should be disabled
- Submit creates server with `teamId: null`
- Badge should show "Organization" (purple)

### 2. **Create Server at Team Level**
- Select "Team" scope
- Team dropdown should be enabled
- Select a team (e.g., "DGP")
- Submit creates server with `teamId: "team-id"`
- Badge should show "Team · DGP" (blue)

### 3. **Edit Server**
- Open existing org-level server
- Scope should be "Organization"
- Team dropdown should be disabled
- Change to "Team" scope
- Team dropdown should enable
- Select team and save
- Badge should update to show team name

### 4. **Scope Badge Display**
- Check all tool accordions (frontend, builtin, backend, mcp)
- Each should have "Scope" column with appropriate badge
- MCP server cards should show scope badge
- Badge colors should match theme (light/dark)

### 5. **Team Name Resolution**
- For tools: Frontend looks up team name from teams array
- For servers: Backend provides team name via JOIN
- Both should display "Team · [Name]" consistently

## Migration Notes

### Database Schema:
- **No changes required**: `mcp_servers` table already has `team_id` column
- Backend now returns `team_name` via JOIN (no schema change)

### Existing Data:
- Servers without `team_id` → Show "Organization" badge
- Servers with `team_id` → Show "Team · [Name]" badge

## Benefits

### 1. **Consistency**
- MCP servers now match models in scope management
- Same UI patterns across all admin tabs
- Unified scope badge design

### 2. **Clarity**
- Users can immediately see whether a tool/server is org-wide or team-specific
- Scope badges provide at-a-glance information
- No need to open forms to check scope

### 3. **Flexibility**
- Teams can have their own MCP server configurations
- Organization-wide servers remain available to all teams
- Same scoping model as models and agents

### 4. **User Experience**
- Familiar controls from Models tab
- Disabled states prevent invalid selections
- Clear visual feedback with color-coded badges

## Implementation Details

### Radio Button Behavior:
- Clicking "Organization" radio → clears `teamId`, disables dropdown
- Clicking "Team" radio → enables dropdown, keeps `teamId` if set

### Team Dropdown Behavior:
- **Disabled when scope = "Organization"**:
  - Grayed out appearance
  - No interaction possible
  - Placeholder remains visible
- **Enabled when scope = "Team"**:
  - Normal appearance
  - Full interaction
  - Required selection before submit

### Badge Rendering:
- **Light Theme**: Higher contrast backgrounds (100 suffix)
- **Dark Theme**: Translucent backgrounds (900/30)
- **Font**: `text-[10px]` for compact display
- **Padding**: `px-1.5 py-0.5` for visual balance

## Files Modified

1. **`pages/side-panel/src/components/admin/ToolsTab.tsx`**
   - Added imports for `Radio` and `SingleTeamSelector`
   - Added `McpServerScope` type
   - Updated `McpServerFormState` interface
   - Updated `McpServerRecord` interface
   - Added `renderToolScopeBadge` function
   - Added `renderServerScopeBadge` function
   - Updated `startEditServer` to include scope/teamId
   - Updated `handleCreateServer` to send teamId based on scope
   - Updated `handleUpdateServer` to send teamId based on scope
   - Added scope/team UI to create server form
   - Added scope/team UI to edit server form
   - Added "Scope" column to tool accordions
   - Added scope badge display to tool table rows
   - Added scope badge display to server cards
   - Updated colSpan from 4 to 5 in tool tables

2. **`copilot-runtime-server/routes/tools.js`**
   - Updated `GET /mcp-servers` query to include LEFT JOIN with teams table
   - Added `t.name as team_name` to SELECT clause

## Summary

This update brings MCP servers in line with the scoping model used for models and agents, providing a consistent and intuitive user experience across all admin tabs. The addition of scope badges makes it immediately clear which tools and servers are available organization-wide versus team-specific, improving discoverability and understanding of resource availability.

