# Organization Selector Auto-Reset Fix

## Issue
When switching organizations in the Provider, Model, and Agent tabs, the selection would automatically reset back to the first/default organization.

## Root Cause
Two separate but related issues were causing this behavior:

### Issue 1: AdminPage.tsx - Object Reference Dependency
**Location:** `pages/side-panel/src/pages/AdminPage.tsx:277`

**Problem:**
```typescript
useEffect(() => {
  if (organization?.id && !selectedOrgForTeams) {
    setSelectedOrgForTeams(organization.id);
  }
}, [organization]); // ← Triggers on object reference changes
```

The `organization` object in the dependency array would trigger the effect whenever the object **reference** changed (even if the ID was the same), which can happen during:
- Auth context refreshes
- Re-renders
- Component updates

**Fix:**
```typescript
useEffect(() => {
  if (organization?.id && !selectedOrgForTeams) {
    setSelectedOrgForTeams(organization.id);
  }
}, [organization?.id]); // Only trigger when the ID changes
```

### Issue 2: Admin Tabs - Circular Dependency Loop
**Locations:**
- `pages/side-panel/src/components/admin/AgentsTab.tsx:411`
- `pages/side-panel/src/components/admin/ModelsTab.tsx:365`
- `pages/side-panel/src/components/admin/ProvidersTab.tsx:332`

### Issue 3: ToolsTab - Missing preselectedOrgId Sync
**Location:** `pages/side-panel/src/components/admin/ToolsTab.tsx:401`

**Problem:**
```typescript
useEffect(() => {
  if (preselectedOrgId && preselectedOrgId !== selectedOrgId) {
    setSelectedOrgId(preselectedOrgId);
  }
}, [preselectedOrgId, selectedOrgId]); // ← selectedOrgId causes loop
```

**What was happening:**
1. User manually changes org → `selectedOrgId` changes to new value
2. useEffect triggers because `selectedOrgId` is in dependencies
3. Sees `preselectedOrgId !== selectedOrgId` → resets back to `preselectedOrgId`
4. Loop: User selection is immediately overridden!

**Fix:**
```typescript
useEffect(() => {
  if (preselectedOrgId && preselectedOrgId !== selectedOrgId) {
    setSelectedOrgId(preselectedOrgId);
  }
}, [preselectedOrgId]); // Only react to parent changes, not user selections
```

**Problem:**
The ToolsTab was only using `preselectedOrgId` for initial state but had no useEffect to sync when the parent changed it. This meant:
1. Team selector updated (via separate logic)
2. But tools/MCP servers didn't reload because `selectedOrgId` never changed

**Fix:**
```typescript
useEffect(() => {
  if (preselectedOrgId && preselectedOrgId !== selectedOrgId) {
    setSelectedOrgId(preselectedOrgId);
  }
}, [preselectedOrgId]); // Sync parent changes to local state
```

This triggers the existing useEffects that reload tools and servers when `selectedOrgId` changes.

## Files Modified

### Fixed
1. ✅ `pages/side-panel/src/pages/AdminPage.tsx` - Changed dependency to `[organization?.id]`
2. ✅ `pages/side-panel/src/components/admin/AgentsTab.tsx` - Removed `selectedOrgId` from dependencies
3. ✅ `pages/side-panel/src/components/admin/ModelsTab.tsx` - Removed `selectedOrgId` from dependencies
4. ✅ `pages/side-panel/src/components/admin/ProvidersTab.tsx` - Removed `selectedOrgId` from dependencies
5. ✅ `pages/side-panel/src/components/admin/ToolsTab.tsx` - Added missing `preselectedOrgId` sync useEffect

### Already Correct
- ✅ `pages/side-panel/src/components/admin/UsageTab.tsx` - Already had `[preselectedOrgId]` only
- ✅ `pages/side-panel/src/components/admin/TeamsTab.tsx` - Works fine
- ✅ `pages/side-panel/src/components/admin/OrganizationsTab.tsx` - Works fine
- ✅ `pages/side-panel/src/components/admin/UsersTab.tsx` - Works fine
- ✅ `pages/side-panel/src/components/admin/DeploymentsTab.tsx` - Doesn't use `preselectedOrgId`

## Testing Checklist

- [x] Provider tab: Switch organization → stays on selected org
- [x] Model tab: Switch organization → stays on selected org
- [x] Agent tab: Switch organization → stays on selected org
- [x] Teams tab: Already working correctly
- [x] Organizations tab: Already working correctly
- [x] Users tab: Already working correctly
- [x] Usage tab: Already working correctly
- [x] Tools tab: Switch organization → tools and MCP servers reload
- [x] Deployments tab: No organization selector issues

## Key Principle

**For parent-controlled state synchronization:**
- ✅ **DO:** Only include the parent prop in dependencies (`[parentProp]`)
- ❌ **DON'T:** Include both parent and local state (`[parentProp, localState]`)

This prevents circular update loops where local user changes trigger effects that reset the state back to the parent's value.

## Resolution Status

🎉 **RESOLVED** - All admin tabs now maintain user-selected organization without auto-resetting.

