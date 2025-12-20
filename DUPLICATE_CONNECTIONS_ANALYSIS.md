# Duplicate Connection Analysis

## Problem
When opening the sidepanel, we see **6 duplicate `/connect` requests** for the same thread within milliseconds:

```
[PostgresAgentRunner] Connecting to thread: session-1766249655097
[PostgresAgentRunner] Connecting to thread: session-1766249655097
[PostgresAgentRunner] Connecting to thread: session-1766249655097
[PostgresAgentRunner] Connecting to thread: session-1766249655097
[PostgresAgentRunner] Connecting to thread: session-1766249655097
[PostgresAgentRunner] Connecting to thread: session-1766249655097
```

## Root Cause

### Frontend: Multiple `useAgent()` Hooks

The CopilotKit V2 architecture requires calling `useAgent()` for each hook that needs to subscribe to agent events. In `ChatInner.tsx`, we have:

1. **`useAgentWithErrorBanner`** (line 279) - subscribes to run status and errors
2. **`useCopilotChat`** - subscribes to messages
3. **`useCopilotAgent`** - subscribes to state changes
4. **~20+ `useFrontendTool`** hooks - each subscribes to tool call events
5. **`useCopilotSuggestions`** - subscribes to suggestion events
6. **Other agent hooks** for different features

**Each `useAgent()` call creates a separate connection to the runtime**.

According to the comment in `ChatSessionContainer.tsx` (line 1322):
```typescript
/* CRITICAL FIX: Always render CopilotKitProvider to prevent unmount/remount cycles
   Unmounting causes all 9 useAgent() connections to disconnect and reconnect,
   which can trigger infinite loops and rate limiting (429 errors).
```

So there are **at least 9 `useAgent()` connections** expected!

### Backend: Per-Request Agent Registration

In `server.js` (lines 574-614), each request:

1. Gets/creates a cached agent
2. Registers it with a unique ID: `agent_${requestId}`
3. Forwards the request to CopilotKit runtime
4. Deletes the agent registration after response

This is **correct behavior** - each connection request is independent.

## Why 6 Instead of 9?

The logs show **6 connections**, but the comment mentions **9 hooks**. Possible reasons:

1. **Connection batching/deduplication** by CopilotKit internally
2. **Not all hooks connect immediately** - some may be lazy
3. **Multiple hooks sharing the same agent subscription** internally
4. **React Strict Mode** in development might cause double-mounting (6 = 3 hooks × 2 mounts)

## Is This a Problem?

### ✅ Expected Behavior
- **Multiple connections are by design** in CopilotKit V2
- Each hook needs its own subscription to specific event types
- The server correctly handles concurrent connections

### ⚠️ Potential Issues
1. **Performance**: 6-9 connections per page load creates overhead
2. **Database load**: Each connection queries historic runs
3. **Network traffic**: Multiple SSE streams for the same thread

### ✅ Not a Problem
- **Thread fragmentation**: Fixed - suggestions use separate UUID threads
- **Data consistency**: All connections see the same data
- **Memory leaks**: Connections are properly cleaned up

## Recommendations

### 1. **Keep Current Behavior (Recommended)**
- This is how CopilotKit V2 is designed to work
- The overhead is acceptable for the feature benefits
- Focus on optimizing database queries instead

### 2. **Add Connection Pooling**
If performance becomes an issue:
```javascript
// In PostgresAgentRunner.connect()
if (this.activeConnections.has(threadId)) {
  // Return existing connection subject
  return this.activeConnections.get(threadId);
}
```

### 3. **Optimize Historic Run Loading**
Currently, each connection loads full history. Could optimize:
```sql
-- Add an index for faster queries
CREATE INDEX IF NOT EXISTS idx_agent_runs_thread_status 
ON agent_runs(thread_id, status, created_at);

-- Use LIMIT to reduce data transfer
SELECT * FROM agent_runs 
WHERE thread_id = $1 AND status IN ('completed', 'stopped')
ORDER BY created_at DESC 
LIMIT 10;  -- Already implemented
```

### 4. **Frontend Optimization**
Reduce the number of hooks if possible:
- Combine multiple `useFrontendTool` into a single batch hook
- Use selective subscriptions (only subscribe to needed events)

## Conclusion

**The duplicate connections are expected CopilotKit V2 behavior, not a bug.**

The current implementation is correct. Monitor performance metrics and optimize if needed, but don't try to "fix" this by preventing connections - that would break the hooks.
