# Tools Tab Team Selector Update

## Overview
Updated the Tools tab to use the same team selector component as the Models tab, switching from single-selection to multi-selection with checkboxes.

## Changes Made

### 1. **Changed Team Selector Component**

#### Before:
- Used `SingleTeamSelector` (single team selection dropdown)
- Stored selection in `selectedTeamId` (string)
- Simple dropdown with selected value displayed

#### After:
- Uses `TeamSelector` (multi-selection with checkboxes)
- Stores selection in `teamFilterIds` (string array)
- Modern dropdown with:
  - Team icon next to "All teams" text
  - Team icons next to each team name
  - Checkboxes for selection (blue with checkmark when selected)
  - Loading skeleton while teams are being fetched
  - Same styling as Models tab

### 2. **Updated State Management**

**Before:**
```typescript
const [selectedTeamId, setSelectedTeamId] = useState<string>('');
```

**After:**
```typescript
const [teamFilterIds, setTeamFilterIds] = useState<string[]>([]);
```

### 3. **Updated Component Usage**

**Before:**
```typescript
<SingleTeamSelector
  isLight={isLight}
  teams={teams}
  selectedTeamId={selectedTeamId}
  onTeamChange={setSelectedTeamId}
  disabled={loadingTeams}
  allowEmpty
  placeholder="All teams"
/>
```

**After:**
```typescript
{loadingTeams && teams.length === 0 ? (
  <div className="h-[34px] w-full rounded-md border animate-pulse..." />
) : (
  <TeamSelector
    isLight={isLight}
    teams={teams}
    selectedTeamIds={teamFilterIds}
    onTeamChange={setTeamFilterIds}
    placeholder="All teams"
    allowEmpty
  />
)}
```

### 4. **Updated Filtering Logic**

Since the backend doesn't support filtering by multiple teams, we use the first selected team or show all teams:

```typescript
// In loadTools and loadServers:
const params = new URLSearchParams({ organizationId: selectedOrgId });
// Use first selected team for filtering, or null for all teams
if (teamFilterIds.length > 0) {
  params.append('teamId', teamFilterIds[0]);
}
```

### 5. **Updated Organization Change Handler**

**Before:**
```typescript
onOrgChange={(value: string) => {
  setSelectedOrgId(value);
  setSelectedTeamId('');
}}
```

**After:**
```typescript
onOrgChange={(value: string) => {
  setSelectedOrgId(value);
  setTeamFilterIds([]);
}}
```

### 6. **UI Features Matching Models Tab**

#### Team Selector Button:
- Team icon before "All teams" text
- Rounded border with hover effect
- Chevron icon that rotates when opened
- Same height (34px) and styling

#### Dropdown Menu:
- Team icon next to each team name
- Square checkboxes (not round checkmarks)
- Blue background when selected (bg-blue-600)
- White checkmark inside selected checkbox
- Hover effect on team items
- Same shadow and border styling

#### Loading State:
- Animated skeleton loader with same height
- Pulsing animation while loading

### 7. **Label Text Update**

Changed from "Team Filter" to "Filter by Team" to match Models tab exactly.

## Visual Comparison

### Models Tab (Reference):
```
┌─────────────────────────────────┐
│ 👥 All teams              ▼     │
├─────────────────────────────────┤
│ ☐ 👥 DGP                        │
│ ☐ 👥 XEDS                       │
└─────────────────────────────────┘
```

### Tools Tab (Updated):
```
┌─────────────────────────────────┐
│ 👥 All teams              ▼     │
├─────────────────────────────────┤
│ ☐ 👥 DGP                        │
│ ☐ 👥 XEDS                       │
└─────────────────────────────────┘
```

## Benefits

### User Experience:
- **Consistency**: Tools tab now matches Models tab UI exactly
- **Familiar Interface**: Users see the same team selector across admin tabs
- **Visual Clarity**: Team icons and checkboxes make selection clearer
- **Multi-Select Ready**: Infrastructure supports multi-team filtering when backend is ready

### Code Quality:
- **Reusability**: Uses shared `TeamSelector` component
- **Maintainability**: Changes to team selector styling apply to all tabs
- **Scalability**: Easy to enable full multi-team filtering when backend supports it

## Implementation Notes

1. **Current Filtering Behavior**: 
   - When no teams are selected, shows all tools/servers for the organization
   - When one or more teams are selected, uses the first selected team for filtering
   - This matches the backend's current single-team filtering capability

2. **Future Enhancement**:
   - When backend supports multi-team filtering, simply remove the `[0]` index:
     ```typescript
     // Change from:
     if (teamFilterIds.length > 0) {
       params.append('teamId', teamFilterIds[0]);
     }
     
     // To:
     teamFilterIds.forEach(teamId => {
       params.append('teamId', teamId);
     });
     ```

3. **Resource Creation**:
   - New servers/tools are always created at organization scope (`teamId: null`)
   - This is consistent with the architecture where resources belong to organizations

## Files Modified

- **`pages/side-panel/src/components/admin/ToolsTab.tsx`**
  - Changed import from `SingleTeamSelector` to `TeamSelector`
  - Updated state from `selectedTeamId` to `teamFilterIds`
  - Updated all API calls to use `teamFilterIds`
  - Added loading skeleton for team selector
  - Updated label from "Team Filter" to "Filter by Team"
  - Updated 15+ references throughout the file

## Testing Recommendations

1. **Visual Testing**:
   - Compare Tools tab team selector with Models tab
   - Verify team icons appear correctly
   - Check checkbox styling matches
   - Test hover effects
   - Verify dropdown positioning

2. **Functional Testing**:
   - Select/deselect teams
   - Verify filtering works correctly
   - Change organizations and verify teams reset
   - Test with no teams available
   - Verify loading skeleton appears

3. **Multi-Selection Testing**:
   - Select multiple teams
   - Verify only first team is used for filtering (current limitation)
   - Check that UI allows multi-selection

