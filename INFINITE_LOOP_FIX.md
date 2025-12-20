# Critical Fixes for Infinite Connection Loop (429 Rate Limit)

## Summary

This document describes the critical fixes applied to prevent infinite connection request loops that lead to 429 rate limiting errors.

## Date Applied
December 20, 2025

## Issues Fixed

### 🔴 CRITICAL Issue #1: Date.now() in Error Handler
**Location:** `pages/side-panel/src/components/chat/ChatSessionContainer.tsx` (ChatInnerWithSignatureSync component)

**Problem:**
```typescript
// BAD - Creates infinite loop!
catch {
  onSignatureChange(`${messages.length}:${Date.now()}`);
}
```

When message signature computation failed (corrupted data, circular references, etc.), the error handler used `Date.now()` which generates a new timestamp every millisecond. This caused:
1. New signature value → state update
2. Component re-render → useEffect runs
3. New Date.now() value → another state update
4. **Infinite loop!**

**Fix Applied:**
```typescript
const lastSignatureRef = useRef<string>('');

useEffect(() => {
  try {
    const signature = JSON.stringify(messages.map(...));
    lastSignatureRef.current = signature;
    onSignatureChange(signature);
  } catch (error) {
    // Use stable fallback without Date.now()
    const fallback = `error:${messages.length}`;
    if (lastSignatureRef.current !== fallback) {
      debug.warn('[ChatInnerWithSignatureSync] Failed to compute signature:', error);
      lastSignatureRef.current = fallback;
      onSignatureChange(fallback);
    }
  }
}, [messages, onSignatureChange]);
```

**Impact:** Prevents signature computation failures from triggering infinite loops.

---

### 🔴 CRITICAL Issue #2: CopilotKitProvider Conditional Rendering
**Location:** `pages/side-panel/src/components/chat/ChatSessionContainer.tsx` (main render)

**Problem:**
```typescript
// BAD - Unmounts/remounts entire provider!
{activeAgent && activeModel ? (
  <CopilotKitProvider>
    <ChatInner />
  </CopilotKitProvider>
) : null}
```

When `activeAgent` or `activeModel` became empty (during errors, auth issues, or transitions), the entire `CopilotKitProvider` would unmount. This caused:
1. All 9 `useAgent()` connections disconnect
2. Provider remounts → all 9 connections reconnect
3. If this happens in an error loop → **9 × N requests in rapid succession**
4. Rate limit exceeded → 429 errors

**Scenarios that triggered this:**
- Auth errors clearing organization/team
- Agent/model switching transitions
- Session switching state updates
- Error boundaries resetting state

**Fix Applied:**
```typescript
// GOOD - Provider stays mounted, children conditionally render
<CopilotKitProvider
  key="copilot-provider-stable"
  runtimeUrl={COPIOLITKIT_CONFIG.RUNTIME_URL}
  headers={copilotHeaders}
  showDevConsole={false}
  renderToolCalls={toolRenderersRef.current as any}
  renderActivityMessages={activityRenderersRef.current as any}
>
  {activeAgent && activeModel ? (
    <>
      <ChatInnerWithSignatureSync ... />
      <PlansPanel ... />
      <GraphsPanel ... />
    </>
  ) : (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p>
          {!selectedAgent || !selectedModel 
            ? 'Select an agent and model to continue' 
            : 'Loading agent configuration...'}
        </p>
      </div>
    </div>
  )}
</CopilotKitProvider>
```

**Impact:** Prevents provider unmount/remount cycles that trigger mass reconnections.

---

## Additional Enhancement: useAgentWithRetry Hook

**Location:** `pages/side-panel/src/hooks/copilotkit/useAgentWithRetry.ts` (NEW FILE)

A new hook that wraps `useAgent` with:
- **Exponential backoff** (1s → 2s → 4s → 8s → 16s → 30s max)
- **Circuit breaker** pattern (opens after 5 failures, resets after 60s)
- **Shared retry state** across all connections (prevents thundering herd)
- **Jitter** to spread out retry attempts (±25% randomization)

**Usage (Optional):**
```typescript
// Instead of:
const { agent } = useAgent({ agentId: 'dynamic_agent' });

// Use:
const { agent, error } = useAgentWithRetry({ agentId: 'dynamic_agent' });

if (error?.circuitOpen) {
  // Handle circuit breaker open state
  console.warn('Too many connection failures - circuit breaker active');
}
```

**Note:** This is exported from `hooks/copilotkit/index.ts` but NOT automatically applied. It requires refactoring existing `useAgent()` calls to use `useAgentWithRetry()` instead.

---

## How the Infinite Loop Happened

1. **Panel opens** → 9 connection requests (normal)
2. **One request fails** (network, auth, backend error)
3. **Signature computation fails** → `Date.now()` fallback triggers
4. **State update** → Component re-renders
5. **New timestamp** → Another state update → **Loop starts**
6. **Meanwhile:** Failed connection triggers reconnect in all 9 components
7. **9 × retry attempts** every few milliseconds
8. **Within 10 seconds:** 100+ requests sent
9. **Rate limit hit** → 429 responses
10. **429 errors trigger more signature failures** → Loop intensifies
11. **Exponential growth** → 1000s of requests

---

## Testing Recommendations

After applying these fixes, test the following scenarios:

### 1. Normal Operation
- ✅ Open panel → Should see ~9 connection requests (expected)
- ✅ Close and reopen panel → Should reconnect cleanly
- ✅ Switch between sessions → No reconnections (provider stays mounted)

### 2. Error Scenarios
- ✅ Disconnect network → Should NOT trigger infinite loop
- ✅ Clear auth (sign out) → Should NOT trigger infinite loop
- ✅ Backend returns 500 error → Should NOT trigger infinite loop
- ✅ Backend returns 429 → Should back off and retry

### 3. Agent/Model Switching
- ✅ Change agent → Headers update, no remount
- ✅ Change model → Headers update, no remount
- ✅ Clear agent/model → Show "Select agent" message, no crash

### 4. Monitor Logs
Look for these patterns:
- ❌ **BAD:** Rapid successive connection requests (>20 in 10 seconds)
- ❌ **BAD:** "Agent reused" logs flooding console
- ✅ **GOOD:** Connection requests spaced out (1-2 per second max)
- ✅ **GOOD:** Circuit breaker logs if many failures

---

## Rate Limiting Configuration

**Current Backend Limits:** (from `copilot-runtime-server/config/environment.js`)
```javascript
RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
RATE_LIMIT_MAX = 120; // 120 requests per minute
```

**Note:** These constants exist but rate limiting middleware is **NOT IMPLEMENTED** in the server code. Consider adding:

```javascript
// Example: Add to server.js
import rateLimit from 'express-rate-limit';

const copilotLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/copilotkit', copilotLimiter);
```

---

## Monitoring

Add monitoring for:
1. **Connection failure rate** - Alert if >5% of connections fail
2. **429 response rate** - Alert if any 429s occur (shouldn't happen with fixes)
3. **Circuit breaker activations** - Track how often circuit opens
4. **Average connection time** - Detect if connections are slow
5. **Active connections** - Monitor for leaks

---

## Remaining Optimizations (Future Work)

### MEDIUM Priority:
1. **Reduce redundant useAgent() calls** - Refactor to props drilling pattern
   - Currently: 9 components each call useAgent()
   - Target: 1-2 calls at top level, pass data as props
   - Benefit: Reduce from 9 to 2 connection requests

2. **Connection deduplication** - Share single connection across components
   - Use React Context to provide shared agent instance
   - Benefit: Single connection for entire session

3. **Lazy connection** - Only connect when session becomes active
   - Don't connect for cached-but-hidden sessions
   - Benefit: Reduce initial load from 9 to 3-4 requests

### LOW Priority:
4. **Debounce signature updates** - Don't update on every message change
5. **WebSocket connection pooling** - Reuse connections across sessions
6. **Preflight health check** - Test connection before attempting full connect

---

## Files Modified

1. ✅ `pages/side-panel/src/components/chat/ChatSessionContainer.tsx`
   - Fixed Date.now() infinite loop in ChatInnerWithSignatureSync
   - Fixed CopilotKitProvider conditional rendering

2. ✅ `pages/side-panel/src/hooks/copilotkit/useAgentWithRetry.ts` (NEW)
   - Added exponential backoff and circuit breaker

3. ✅ `pages/side-panel/src/hooks/copilotkit/index.ts`
   - Exported useAgentWithRetry

4. ✅ `INFINITE_LOOP_FIX.md` (THIS FILE)
   - Documentation of fixes

---

## Rollback Instructions

If these fixes cause issues, rollback by:

```bash
git revert <commit-hash>
```

Or manually revert the specific changes:
1. Change `catch` block back to use `Date.now()`
2. Move conditional back outside `CopilotKitProvider`
3. Remove `useAgentWithRetry.ts` file

---

## Success Criteria

✅ **Fixes are successful if:**
1. No more than 10 connection requests within first 5 seconds of panel open
2. No 429 rate limit errors in normal operation
3. Connection failures trigger backoff (not immediate retry)
4. Circuit breaker opens after 5 consecutive failures
5. Panel remains functional even with network issues

❌ **Rollback if:**
1. Panel becomes unresponsive
2. Messages fail to send/receive
3. New errors appear in console
4. Sessions fail to switch properly

---

## Questions?

Contact: Engineering Team
Date: December 20, 2025

