# Tab Switch Modal Fix

## Problem
When switching browser tabs (going to another tab and returning), the agent/model switcher modal would incorrectly appear, even though no manual agent/model change was made by the user.

## Root Cause
When the browser tab becomes active again, the `ChatSessionContainer` reloads agent/model values from the database (triggered by the `isActive` dependency in the metadata loading effect). This causes the `selectedAgent` and `selectedModel` state to change, which triggers the `useAgentSwitching` hook, incorrectly showing the modal for a **database load** instead of a **user-initiated change**.

## Solution
Implemented a flag-based system to distinguish between user-initiated changes and database loads:

### 1. **Added `isLoadingFromDBRef` in ChatSessionContainer** (`ChatSessionContainer.tsx`)
   - Created a shared ref `isLoadingFromDBRef` that tracks when agent/model values are being loaded from the database
   - Set to `true` when loading starts, `false` when loading completes or fails
   - Passed to `useAgentSwitching` hook for checking

```typescript
// Track if we're in the middle of loading from DB (shared with useAgentSwitching)
const isLoadingFromDBRef = useRef<boolean>(false);

// In metadata loading effect:
isLoadingRef.current = true;
isLoadingFromDBRef.current = true; // Mark that we're loading from DB

// On completion:
isLoadingFromDBRef.current = false; // Clear loading flag
```

### 2. **Added DB Load Check in useAgentSwitching** (`useAgentSwitching.ts`)
   - Added `isLoadingFromDBRef` parameter to the hook interface
   - Added an early check that skips the modal if `isLoadingFromDBRef.current` is true
   - This ensures the modal only shows for actual user-initiated changes

```typescript
// Don't trigger modal if we're loading from DB - this is not a user-initiated change
if (isLoadingFromDBRef.current) {
  console.log(ts(), '[useAgentSwitching] Change from DB load detected, skipping modal');
  previousAgentRef.current = selectedAgent;
  previousModelRef.current = selectedModel;
  previousSessionIdRef.current = sessionId;
  setActiveAgent(selectedAgent);
  setActiveModel(selectedModel);
  return;
}
```

## Files Modified
1. **`pages/side-panel/src/components/ChatSessionContainer.tsx`**
   - Added `isLoadingFromDBRef` ref declaration (line 137)
   - Set flag during DB loading (lines 152, 161, 167, 202, 208, 222)
   - Passed ref to `useAgentSwitching` hook (line 952)

2. **`pages/side-panel/src/hooks/useAgentSwitching.ts`**
   - Updated `UseAgentSwitchingParams` interface to include `isLoadingFromDBRef` (line 43)
   - Updated hook parameters to accept `isLoadingFromDBRef` (line 51)
   - Added DB load check before triggering modal (lines 147-156)

## Testing
✅ Build completed successfully with no errors
✅ TypeScript compilation passed
✅ No linter errors

## Expected Behavior After Fix
- ✅ Modal **shows** when user manually changes agent/model via dropdown
- ✅ Modal **does not show** when switching browser tabs and returning
- ✅ Modal **does not show** on initial session load
- ✅ Modal **does not show** when session changes
- ✅ Modal **does not show** when agent/model is cleared (no team/org)

## Related Previous Fixes
- Initial load modal prevention (using `hasSwitchingEffectRunRef`)
- Session change modal prevention (using `sessionChanged` check)
- Empty value modal prevention (when no team/org selected)
- Auto-selection modal prevention (initial auto-select detection)

This fix adds another layer of protection specifically for database/storage reloads.

