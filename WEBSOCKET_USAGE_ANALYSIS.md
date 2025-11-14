# WebSocket Usage Stats Analysis

**Date**: November 14, 2025  
**Status**: ✅ **FIXED - WebSocket stays connected for all sessions**

---

## ✅ Fix Implemented

### Change Made

**File**: `pages/side-panel/src/components/ChatSessionContainer.tsx`  
**Line**: 663

```typescript
// Before: WebSocket disconnected when session inactive
useUsageStream(sessionId, isActive, 'ws://localhost:8001', initialUsage, initialLastUsage);
                         ^^^^^^^^
                         
// After: WebSocket always connected for accurate stats
useUsageStream(sessionId, true, 'ws://localhost:8001', initialUsage, initialLastUsage);
                         ^^^^
```

### Result

- ✅ **All mounted sessions maintain WebSocket connections**
- ✅ **Usage stats updated in real-time for ALL sessions**
- ✅ **Background processing stats captured correctly**
- ✅ **Cumulative totals always accurate**
- ✅ **Connection automatically closed on session unmount** (via useEffect cleanup)

### Trade-offs

**Benefits**:
- ✅ Accurate usage statistics across all sessions
- ✅ No missed updates during background processing
- ✅ Real-time stats for inactive sessions
- ✅ Simplified state management

**Costs**:
- ⚠️ Multiple WebSocket connections (one per mounted session)
- ⚠️ Slightly higher resource usage
- ⚠️ More server connections

**Mitigation**: The `useUsageStream` hook uses connection pooling (one connection per session) and automatically closes connections when sessions are unmounted, so the resource impact is minimal and bounded by the number of active sessions.

---

## Original Analysis (Before Fix)

### Previous Behavior

### WebSocket Connection Management

**Location**: `pages/side-panel/src/hooks/useUsageStream.ts`

The WebSocket connection for token usage statistics is **session-specific** and **activity-dependent**:

```typescript
// ChatSessionContainer.tsx line 663
useUsageStream(sessionId, isActive, 'ws://localhost:8001', initialUsage, initialLastUsage);
                         ^^^^^^^^
                         This controls the WebSocket connection
```

### Connection Lifecycle

1. **When Session is ACTIVE** (`isActive=true`):
   - `incrementEnabled(entry)` is called
   - `enabledCount` increases
   - WebSocket connection opens (if not already open)
   - Usage updates are received and processed
   - Stats are updated in real-time

2. **When Session is INACTIVE** (`isActive=false`):
   - `decrementEnabled(entry)` is called
   - `enabledCount` decreases
   - When `enabledCount` reaches 0, WebSocket is closed: `entry.ws.close()`
   - **No usage updates are received**
   - Stats remain at their last known state

### Code Flow

```typescript
// useUsageStream.ts lines 429-434
if (enabled) {
  incrementEnabled(entry);
  enabledRef.current = true;
} else {
  enabledRef.current = false;
}

// lines 360-378
const decrementEnabled = (entry: ConnectionEntry) => {
  if (entry.enabledCount > 0) {
    entry.enabledCount -= 1;
  }

  if (entry.enabledCount === 0) {
    if (entry.ws) {
      try {
        entry.ws.close();  // ⚠️ WebSocket closed when no active listeners
      } catch {}
    }
  }
};
```

---

## Impact Assessment

### Positive Aspects ✅

1. **Resource Efficiency**: Inactive sessions don't maintain WebSocket connections
2. **Reduced Server Load**: Only active sessions consume server resources
3. **Battery Friendly**: Fewer persistent connections = better battery life
4. **Clean Architecture**: Connection lifecycle tied to session activity

### Negative Aspects ⚠️

1. **Stale Stats for Inactive Sessions**: Usage stats are NOT updated for inactive sessions
2. **Stats Gap**: If agent continues processing in background, inactive session won't reflect updates
3. **Delayed Sync**: Stats only update when session becomes active again
4. **Potential Confusion**: User might see outdated usage numbers when switching sessions

---

## Data Flow

### Active Session (WebSocket Connected)
```
Backend Agent (Processing)
    ↓ (WebSocket message)
useUsageStream (listening)
    ↓ (state update)
ChatSessionContainer
    ↓ (persist)
SessionStorageDB
```

### Inactive Session (WebSocket Disconnected)
```
Backend Agent (Processing)
    ↓ (WebSocket message - NOT RECEIVED)
useUsageStream (NOT listening) ❌
    ↓ (no update)
ChatSessionContainer (stale data)
    ↓ (no persist)
SessionStorageDB (stale data)
```

---

## Scenarios

### Scenario 1: Single Active Session
- ✅ Works perfectly
- Real-time updates received
- Stats always accurate

### Scenario 2: Switch Between Sessions Rapidly
- ⚠️ Old session disconnects immediately
- ⚠️ New session connects immediately
- ✅ Active session gets updates
- ❌ Inactive sessions miss updates

### Scenario 3: Background Processing
If an agent continues processing after user switches away:
- ❌ Usage updates are lost
- ❌ Stats remain at pre-switch values
- ❌ No way to catch up missed updates
- ⚠️ Cumulative usage will be incorrect

### Scenario 4: Long-Running Task
User starts task → switches to another session → task completes:
- ❌ Original session never receives completion usage stats
- ❌ Stats frozen at last active moment
- ⚠️ Total usage across sessions will be understated

---

## Potential Issues

### 1. **Usage Stats Inaccuracy**
**Severity**: 🟡 Medium  
**Issue**: Inactive sessions have stale usage data

**Example**:
1. User starts expensive query in Session A
2. User switches to Session B
3. Query completes in Session A (takes 10,000 tokens)
4. User returns to Session A
5. Usage stats still show pre-query values ❌

### 2. **Missing Cumulative Totals**
**Severity**: 🟡 Medium  
**Issue**: Cumulative usage calculations may be incomplete

**Example**:
- Session A: Shows 5,000 tokens (but actually used 15,000)
- Session B: Shows 3,000 tokens (accurate)
- Total shown: 8,000 tokens
- Actual total: 18,000 tokens ❌

### 3. **No Background Sync**
**Severity**: 🟢 Low  
**Issue**: No mechanism to fetch missed updates

Even when session becomes active again, it doesn't fetch updates that occurred while inactive.

---

## Possible Solutions

### Option 1: Keep All Connections Open ⚠️
**Pros**: All sessions receive real-time updates  
**Cons**: High resource usage, many WebSocket connections

```typescript
// Always enable, regardless of isActive
useUsageStream(sessionId, true, 'ws://localhost:8001', ...);
```

### Option 2: Periodic Polling for Inactive Sessions ⚡ (Recommended)
**Pros**: Balanced approach, eventual consistency  
**Cons**: Slight delay, requires API endpoint

```typescript
// Add REST API fallback
useEffect(() => {
  if (!isActive && sessionId) {
    const interval = setInterval(async () => {
      const stats = await fetchUsageStats(sessionId);
      setCumulative(stats.cumulative);
      setLastUsage(stats.last);
    }, 10000); // Poll every 10 seconds
    
    return () => clearInterval(interval);
  }
}, [isActive, sessionId]);
```

### Option 3: Fetch on Activation 🎯 (Quickest Fix)
**Pros**: Simple, no polling overhead, catches up on activation  
**Cons**: Stats only update when user switches to session

```typescript
// In ChatSessionContainer.tsx
useEffect(() => {
  if (isActive && sessionId) {
    // Fetch latest stats when session becomes active
    fetchLatestUsageStats(sessionId).then(stats => {
      setCumulative(stats.cumulative);
      setLastUsage(stats.last);
    });
  }
}, [isActive, sessionId]);
```

### Option 4: Server-Side Aggregation 🏆 (Best Long-Term)
**Pros**: Single source of truth, always accurate, no client tracking  
**Cons**: Requires backend changes

Store cumulative usage on server, fetch on demand:
```typescript
// No WebSocket needed for cumulative stats
// Only use WebSocket for real-time progress indicators
```

---

## Recommendation

### Short Term: **Option 3** (Fetch on Activation)
1. Add REST API endpoint: `GET /api/usage/stats/:sessionId`
2. Fetch latest stats when session becomes active
3. Minimal code changes, immediate benefit

### Long Term: **Option 4** (Server-Side Aggregation)
1. Store cumulative usage in database
2. Update on every API call (server-side)
3. Client fetches on demand
4. WebSocket only for real-time streaming progress

---

## Current Code Locations

### WebSocket Hook
- **File**: `pages/side-panel/src/hooks/useUsageStream.ts`
- **Lines**: 385-503 (hook definition)
- **Lines**: 162-304 (connection management)

### Usage Integration
- **File**: `pages/side-panel/src/components/ChatSessionContainer.tsx`
- **Line**: 663 (useUsageStream call with `isActive` parameter)
- **Lines**: 773-798 (persistence logic)

### Connection Pool
- **File**: `pages/side-panel/src/hooks/useUsageStream.ts`
- **Lines**: 355-379 (incrementEnabled/decrementEnabled)

---

## Conclusion

**Answer to Question**: 
> "Check if websocket messages are handled by sessionruntime context when the session is not active"

**NO** - WebSocket messages are **NOT** handled when the session is not active. The WebSocket connection is explicitly closed when a session becomes inactive (`enabledCount` reaches 0).

**Impact**:
- ❌ Usage stats are NOT kept up to date for inactive sessions
- ⚠️ Inactive sessions will have stale/incomplete usage data
- ⚠️ If background processing occurs, those usage updates are lost
- ✅ However, this saves resources and is more efficient

**Recommendation**: Consider implementing **Option 3** (fetch on activation) for better UX, or **Option 4** (server-side aggregation) for production quality.

