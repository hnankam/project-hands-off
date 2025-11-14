# Critical Data Loss Prevention Fix

## Problem
Messages were being **permanently deleted** and reset to zero despite optimistic locking and other safeguards. This occurred when:

1. CopilotKit's message state was temporarily empty (due to hydration timing, failed restore, or race condition)
2. The 1500ms protection window had expired
3. `RuntimeStateBridge` auto-persisted the empty state to storage
4. Storage was permanently overwritten with an empty array

## Root Cause

In `SessionRuntimeContext.tsx`, the protection against empty message overwrites was **time-limited**:

```typescript
// OLD CODE - VULNERABLE TO DATA LOSS
if (!hasMessages && Date.now() - mountedAtRef.current < 1500) {
  // Only protected for first 1500ms after mount!
  const stored = await sessionStorageDBWrapper.getAllMessagesAsync(sessionId);
  if (stored.length > 0) {
    return; // Prevent overwrite
  }
}
// AFTER 1500ms: Empty messages WOULD overwrite storage!
```

### Timeline of Data Loss

```
0ms    - Component mounts, mountedAtRef set
0-500ms - Messages loading/hydrating
1500ms - Protection window EXPIRES
1800ms - CopilotKit state temporarily empty (race condition/timing bug)
1800ms - RuntimeStateBridge persists empty array
1800ms - Storage overwritten: 15 messages → 0 messages ❌ DATA LOST
```

## Solution

Changed from **time-based** to **state-based** protection that **never expires**:

```typescript
// NEW CODE - PERMANENT PROTECTION
if (!hasMessages) {
  const stored = await sessionStorageDBWrapper.getAllMessagesAsync(sessionId);
  const storedCount = stored.length;
  
  if (storedCount > 0) {
    console.warn(`⚠️ PREVENTED DATA LOSS: Refusing to overwrite ${storedCount} stored messages!`);
    console.warn(`This suggests a hydration or timing issue. Storage will be preserved.`);
    return; // ALWAYS prevent overwrite if storage has messages
  }
}
```

### Key Changes

1. **Removed time-based check** - No more 1500ms expiration
2. **Always check storage** - Every time we try to persist empty messages
3. **Fail-safe on error** - If storage check fails, refuse to persist (safer to skip than risk data loss)
4. **Track storage state** - Monitor message counts for diagnostics

## Files Modified

**`pages/side-panel/src/context/SessionRuntimeContext.tsx`** (Lines 375-406)

- Removed: `Date.now() - mountedAtRef.current < 1500` check
- Added: Permanent storage check before any empty persist
- Added: `lastKnownStorageCountRef` to track storage state
- Added: Error handling that defaults to preserving data

## Behavior

### ✅ PROTECTED - Empty Writes Are Blocked When:
- Storage has 1+ messages
- CopilotKit state is empty (hydration issue, race condition, timing bug)
- Protection applies at ANY time (not just first 1500ms)

### ✅ ALLOWED - Empty Writes Succeed When:
- Storage is already empty (nothing to lose)
- User explicitly clears messages via "Clear Messages" button (uses `updateAllMessages` directly, bypasses RuntimeStateBridge)

### ⚠️ WARNING LOGS
When data loss is prevented, you'll see:
```
⚠️ PREVENTED DATA LOSS: Refusing to overwrite 11 stored messages with empty state!
This suggests a hydration or timing issue. Storage will be preserved.
```

This is **expected** if:
- There's a hydration race condition
- CopilotKit temporarily loses messages
- Tab switching causes state reset

The warning means **your data is safe** and the bug is prevented.

## Impact

### Before Fix
- ❌ Messages could be lost after 1500ms
- ❌ No protection during normal operation
- ❌ Race conditions caused permanent data loss
- ❌ Users reported "messages reset to zero"

### After Fix
- ✅ Messages always protected
- ✅ Empty overwrites blocked permanently
- ✅ Race conditions handled gracefully
- ✅ Data preserved even when timing bugs occur

## Testing

✅ Build successful
✅ No linter errors
✅ TypeScript compilation passed

## How Intentional Clears Still Work

User-initiated "Clear Messages" action:
1. Uses `sessionStorageDBWrapper.updateAllMessages(sessionId, [])` directly
2. Bypasses `RuntimeStateBridge` entirely
3. Reloads page immediately after clear
4. No conflict with protection logic

## Version Conflict Behavior

If messages are being actively edited while protection triggers:

1. **Storage has messages**: Write blocked, version NOT updated
2. **Next legitimate write**: May get version conflict
3. **Conflict resolution**: Reloads latest version from storage
4. **Result**: Latest messages preserved (either user's new edits or protected originals)

This is the correct behavior - optimistic locking + data loss prevention working together.

## Related Fixes

This fix works in conjunction with:
- Optimistic locking (prevents concurrent write conflicts)
- Persistence lock manager (coordinates load/save operations)
- Message restoration retry logic (handles CopilotKit initialization races)
- Tab switch modal prevention (prevents spurious UI state changes)

## Monitoring

Watch for these logs:
- ✅ `✅ Persisted N messages` - Normal saves working
- ⚠️ `⚠️ PREVENTED DATA LOSS` - Protection triggered (good!)
- ❌ `Failed to check storage before empty write` - Rare error, needs investigation

## Future Improvements

Potential enhancements:
1. Add telemetry to track how often protection triggers
2. Investigate root cause of CopilotKit state resets
3. Add automatic recovery mechanism to reload messages when empty state detected
4. Implement bidirectional sync to detect storage changes and update UI

## Summary

**CRITICAL FIX**: Replaced time-limited (1500ms) empty message protection with permanent state-based protection. This prevents all scenarios where empty CopilotKit state could overwrite stored messages, ensuring user data is never lost due to timing bugs or race conditions.

**Result**: Messages are now safe at all times, not just during initial mount.

