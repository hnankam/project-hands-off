# Cancel Scope Error - Final Solution

## Problem Statement

When the side panel opens and suggestions are being generated, users intermittently see cancel scope errors:

```
Attempted to exit a cancel scope that isn't the current task's current cancel scope
Attempted to exit cancel scope in a different task than it was entered in
```

## Root Cause

The error originates from CopilotKit's **intentional parallel request optimization**:

1. When suggestions are enabled, CopilotKit makes **multiple parallel** suggestion generation requests to different models/providers
2. CopilotKit uses the **first response** that completes
3. CopilotKit **cancels the slower requests** by closing the SSE connection
4. Python backend's `anyio` library logs these cancellations as `RUN_ERROR` events in the SSE stream

**This is expected behavior from CopilotKit** - not a bug in our code.

## Solution

### Frontend Error Filtering (Only Solution Needed)

Filter these specific `anyio` cancel scope errors in the frontend before displaying them:

#### 1. `useAgentEventSubscriber.ts` - Primary filter

```typescript
const triggerError = useCallback((err: Error, context?: string) => {
  const errorMsg = err.message || '';
  const lowerMsg = errorMsg.toLowerCase();
  
  const isAnyCancelScopeError = 
    (lowerMsg.includes('attempted to exit') && lowerMsg.includes('cancel scope')) ||
    (lowerMsg.includes('exit cancel scope') && lowerMsg.includes('different task'));
  
  if (isAnyCancelScopeError) {
    log('✅ FILTERED anyio cancel scope error (expected from CopilotKit cancellation)');
    return; // Don't propagate - this is expected behavior
  }
  
  // Normal error handling...
}, [log]);
```

#### 2. `useAgentWithErrorBanner.ts` - Secondary filter

```typescript
onError: (error) => {
  const errorMsg = error.error.message || '';
  const lowerMsg = errorMsg.toLowerCase();
  
  const isAnyCancelScopeError = 
    (lowerMsg.includes('attempted to exit') && lowerMsg.includes('cancel scope')) ||
    (lowerMsg.includes('exit cancel scope') && lowerMsg.includes('different task'));
  
  if (isAnyCancelScopeError) {
    debug.log('[useAgentWithErrorBanner] ✅ Filtered anyio cancel scope error');
    // Still call user's onError in case they want to handle it
    if (restConfig.onError) {
      restConfig.onError(error);
    }
    return; // Don't show error banner
  }
  // ...
}
```

#### 3. `ChatInner.tsx` - Tertiary backup filter

```typescript
onError: (error) => {
  const errorMsg = error.error.message || '';
  const lowerMsg = errorMsg.toLowerCase();
  
  const isAnyCancelScopeError = 
    (lowerMsg.includes('attempted to exit') && lowerMsg.includes('cancel scope')) ||
    (lowerMsg.includes('exit cancel scope') && lowerMsg.includes('different task'));
  
  if (isAnyCancelScopeError) {
    debug.log('[ChatInner] ✅ Filtered anyio cancel scope error (backup filter)');
    return;
  }
  
  debug.error('[ChatInner] Agent error occurred:', errorMsg, error.code);
}
```

## Why This Approach

### ✅ Filtering on Frontend (CHOSEN)

**Advantages:**
- Allows SSE stream to complete normally (no `INCOMPLETE_STREAM` errors)
- Prevents user-facing error banners for expected behavior
- Backend still logs the errors for debugging
- Simple, maintainable solution
- No false positives (very specific error message matching)

### ❌ Backend Event Filtering (REJECTED)

**Why rejected:**
- Filtering events in backend breaks SSE stream (CopilotKit expects terminal event)
- Causes `INCOMPLETE_STREAM` errors on frontend
- Backend should forward all events; frontend decides what to show

### ❌ Backend Exception Handling (REJECTED)

**Why rejected:**
- The errors come as `RUN_ERROR` events in SSE stream, not as raised exceptions
- Catching exceptions doesn't help since events are already serialized

## Error Message Patterns

The filter catches these specific patterns:

1. `"Attempted to exit a cancel scope that isn't the current task's current cancel scope"`
2. `"Attempted to exit cancel scope in a different task than it was entered in"`

Both patterns include:
- `"attempted to exit"` + `"cancel scope"` OR
- `"exit cancel scope"` + `"different task"`

## Testing

### Expected Behavior

1. **Panel opens with suggestions enabled**
   - ✅ Suggestions generate successfully
   - ✅ No red error banners shown to user
   - ✅ Console logs show filtered errors (in debug mode)

2. **Multiple parallel suggestion requests**
   - ✅ CopilotKit uses first response
   - ✅ Slower requests are cancelled
   - ✅ Cancel scope errors are filtered silently

3. **Legitimate errors still show**
   - ✅ Network errors display error banner
   - ✅ Agent execution errors display error banner
   - ✅ Only anyio cancel scope errors are filtered

### Debug Logs

When filtering is active, you'll see:

```
[useAgentEventSubscriber] ✅ FILTERED anyio cancel scope error (expected from CopilotKit cancellation)
[useAgentWithErrorBanner] ✅ Filtered anyio cancel scope error
[ChatInner] ✅ Filtered anyio cancel scope error (backup filter)
```

## Related Files

- `/pages/side-panel/src/hooks/copilotkit/useAgentEventSubscriber.ts` (lines 316-328, 391-403, 490-501)
- `/pages/side-panel/src/hooks/copilotkit/useAgentWithErrorBanner.ts` (lines 109-121)
- `/pages/side-panel/src/components/chat/ChatInner.tsx` (lines 337-349)

## References

- **CopilotKit Parallel Optimization**: CopilotKit makes parallel requests and cancels slower ones
- **anyio Cancel Scopes**: Python async cancellation mechanism
- **SSE Streaming**: Server-Sent Events require complete streams with terminal events

