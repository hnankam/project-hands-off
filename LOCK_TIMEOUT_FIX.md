# Lock Timeout Fix

## Problem
```
canceling statement due to statement timeout
while locking tuple (1,13) in relation "agent_threads"
```

The `SELECT FOR UPDATE` in `acquireRunLock()` was waiting indefinitely for a row lock, eventually timing out.

## Root Causes

1. **Blocking Lock** - Another transaction held the lock and didn't release it quickly
2. **No Timeout** - Original code waited indefinitely for lock
3. **Cascading Failures** - Multiple runs queuing up waiting for same lock

## Solution Applied

### 1. Statement Timeout (Line 513)
```javascript
// Set 5-second timeout for this transaction
await client.query('SET LOCAL statement_timeout = 5000');
```

### 2. Non-Blocking Lock (Line 520)
```javascript
// Fail immediately if lock unavailable
SELECT ... FOR UPDATE NOWAIT
```

**Before**: `FOR UPDATE` (waits indefinitely)  
**After**: `FOR UPDATE NOWAIT` (fails immediately)

### 3. Better Error Messages (Lines 527-531)
```javascript
if (lockError.code === '55P03') {
  throw new Error(`Thread ${threadId} is locked by another run. Please wait and try again.`);
}
```

## How It Works

```
┌─────────────────────────────────────────────┐
│  Run 1: Acquires lock on thread_abc         │
│  ✅ SELECT ... FOR UPDATE NOWAIT → Success  │
│                                             │
│  Run 2: Tries same thread (concurrent)      │
│  ⚠️  Lock already held → Immediate error    │
│  ❌ "Thread is locked by another run"       │
└─────────────────────────────────────────────┘
```

## Benefits

✅ **Fail Fast** - No waiting, immediate feedback  
✅ **No Cascading** - Subsequent runs don't queue up  
✅ **Clear Errors** - User knows to retry  
✅ **Prevents Timeouts** - 5-second safety net  

## Alternative: SKIP LOCKED

If you want to allow concurrent runs (not recommended for agent state):

```sql
SELECT ... FOR UPDATE SKIP LOCKED
```

This would skip locked rows, but could lead to race conditions in agent execution.

## Monitoring

Watch for errors with code `55P03`:
```javascript
if (error.code === '55P03') {
  console.warn('Lock conflict detected - this is normal under high concurrency');
}
```

## When This Happens

This is **expected behavior** when:
- User sends multiple messages rapidly
- Frontend creates multiple connections
- Server handles concurrent requests

The error is **better than timeout** because:
- Client gets immediate feedback
- Can retry with exponential backoff
- No resources wasted waiting

## Client-Side Handling

Frontend should catch and retry:

```javascript
try {
  await sendMessage(text);
} catch (error) {
  if (error.message.includes('locked by another run')) {
    // Retry after short delay
    await sleep(100);
    await sendMessage(text);
  }
}
```
