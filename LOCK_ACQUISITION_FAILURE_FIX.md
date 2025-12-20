# Lock Acquisition Failure Fix

## Problem

```
[PostgresAgentRunner] Run failed: Thread session-XXX is locked by another run. Please wait and try again.
[PostgresAgentRunner] Error during finalization: canceling statement due to statement timeout
```

### Root Cause

When a run failed to acquire a lock (due to `FOR UPDATE NOWAIT`), the system had **two critical bugs**:

#### Bug 1: Finalization Without Lock (Lines 229-256)

The error handler tried to finalize the run **without checking if a lock was ever acquired**:

```javascript
catch (error) {
  // Try to finalize - but client might be null!
  await this.updateThreadState(threadId, { ... }, client);  // ❌ client is null
}
```

When `client` is `null`, `updateThreadState` falls back to `this.pool.query()`, which creates a **new database client** and tries to update the locked row → **timeout**!

#### Bug 2: Client Leak in acquireRunLock (Lines 531-652)

When `acquireRunLock` failed (lock unavailable, thread already running, or INSERT error), it:
- ✅ Rolled back the transaction
- ❌ **Never released the client**

This caused:
- **Connection pool exhaustion** (leaked clients)
- **Double-release attempts** when executeRun's finally block ran

### Error Flow

```
Run 1:
  1. acquireRunLock() → Gets lock, starts transaction
  2. agent.runAgent() → Takes 2 minutes
  3. Lock still held...

Run 2 (concurrent):
  1. acquireRunLock() → FOR UPDATE NOWAIT fails
  2. throws error WITHOUT releasing client  ❌
  3. executeRun catch block → tries to finalize with null client
  4. updateThreadState() → new client tries to lock → TIMEOUT ❌
  5. Client leaked ❌

Run 3 (retry):
  1. acquireRunLock() → Still locked (Run 1 not done)
  2. Same errors cascade... ❌
```

## Solution

### Fix 1: Skip Finalization When No Lock (Lines 233-257)

```javascript
catch (error) {
  this.metrics.runsFailed++;
  
  // Only finalize if we successfully acquired a client/lock
  if (client) {
    // Finalize using the transactional client
    await this.updateThreadState(threadId, { ... }, client);
  } else {
    // Lock acquisition failed - thread state is already consistent
    if (this.debug) {
      console.log(`[PostgresAgentRunner] Skipping finalization - lock was never acquired`);
    }
  }
  
  throw error;
}
```

**Why this works**:
- If `client` is `null`, we never got the lock → **no finalization needed**
- Thread state is consistent (another run has the lock and will manage it)
- No timeout trying to update a locked row

### Fix 2: Release Client on All Errors (Lines 554-576, 611-616, 638-652)

#### Lock Not Available (Lines 554-576)
```javascript
catch (lockError) {
  // Rollback and release client before throwing
  try {
    await client.query('ROLLBACK');
  } catch (rollbackErr) {
    // Ignore rollback errors
  }
  client.release();  // ✅ Always release
  
  if (lockError.code === '55P03') {
    throw new Error(`Thread ${threadId} is locked by another run. Please wait and try again.`);
  }
  throw lockError;
}
```

#### Thread Already Running (Lines 611-616)
```javascript
if (result.rows[0].is_running) {
  // Rollback and release client before throwing
  try {
    await client.query('ROLLBACK');
  } catch (rollbackErr) {
    // Ignore rollback errors
  }
  client.release();  // ✅ Always release
  throw new Error('Thread already running');
}
```

#### General Errors (Lines 638-652)
```javascript
catch (error) {
  // Rollback and release on any error
  // Since we're throwing, executeRun won't receive the client, so we must release it here
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    console.error(`[PostgresAgentRunner] Rollback error: ${rollbackError.message}`);
  }
  
  try {
    client.release();  // ✅ Always release
  } catch (releaseError) {
    console.error(`[PostgresAgentRunner] Release error: ${releaseError.message}`);
  }
  
  throw error;
}
```

## Flow After Fix

```
Run 1:
  1. acquireRunLock() → Gets lock, starts transaction
  2. agent.runAgent() → Takes 2 minutes
  3. Lock held during execution
  4. Finally block → COMMIT, release client ✅

Run 2 (concurrent):
  1. acquireRunLock() → FOR UPDATE NOWAIT fails
  2. ROLLBACK, release client ✅
  3. Throws error with null client
  4. executeRun catch → checks `if (client)` → false
  5. Skips finalization ✅
  6. Returns error to client immediately
  7. No timeout, no leak ✅

Run 3 (retry):
  1. acquireRunLock() → Run 1 finished, gets lock ✅
  2. Executes successfully ✅
```

## Benefits

✅ **No Timeouts** - Don't try to update locked rows  
✅ **No Client Leaks** - All clients properly released  
✅ **Fast Failure** - Immediate feedback when lock unavailable  
✅ **Clean Retry** - Subsequent retries work once lock is free  
✅ **Pool Health** - Connection pool doesn't get exhausted  

## Client Lifecycle Summary

| Scenario | BEGIN | LOCK | ROLLBACK | RELEASE | Who Releases |
|----------|-------|------|----------|---------|--------------|
| Success | ✅ | ✅ | ❌ | ✅ | executeRun finally |
| Lock unavailable (55P03) | ✅ | ❌ | ✅ | ✅ | **acquireRunLock** |
| Thread running | ✅ | ✅ | ✅ | ✅ | **acquireRunLock** |
| INSERT/UPDATE error | ✅ | ✅ | ✅ | ✅ | **acquireRunLock** |
| Agent execution error | ✅ | ✅ | ✅ | ✅ | executeRun finally |

## Key Principle

**Rule**: If `acquireRunLock` throws an error, it **must release the client** before throwing.

**Reason**: When a function throws, the caller doesn't receive the return value. Since `executeRun` expects to receive a `client` from `acquireRunLock`, if `acquireRunLock` throws, `executeRun`'s `client` variable remains `null`. Therefore, `acquireRunLock` must handle its own cleanup.

## Testing

### Before Fix
1. Start a long-running agent execution (Run 1)
2. Send another message quickly (Run 2)
3. ❌ Run 2 fails with "Thread is locked"
4. ❌ "Error during finalization: statement timeout"
5. ❌ Subsequent retries keep failing
6. ❌ Connection pool eventually exhausted

### After Fix
1. Start a long-running agent execution (Run 1)
2. Send another message quickly (Run 2)
3. ✅ Run 2 fails immediately with clear message
4. ✅ No finalization timeout
5. ✅ Client properly released
6. ✅ Retry succeeds once Run 1 completes
7. ✅ Connection pool healthy

## Related Fixes

This is the **fourth critical fix** in the PostgresAgentRunner:

1. **Incomplete Run Filtering** - Skip runs without RUN_FINISHED
2. **Lock Timeout** - `FOR UPDATE NOWAIT` for immediate failure
3. **Transactional Consistency** - Use same client for updates
4. **Client Lifecycle** - Always release clients on error ← **This fix**

## Monitoring

Watch for these patterns in logs:

### Good (After Fix)
```
[PostgresAgentRunner] Run failed: Thread is locked by another run
[PostgresAgentRunner] Skipping finalization - lock was never acquired
```

### Bad (Indicates Issues)
```
[PostgresAgentRunner] Error during finalization: statement timeout  ❌
[PostgresAgentRunner] Release error: client already released  ❌
Error: Connection pool exhausted  ❌
```

## Conclusion

This fix ensures:
- ✅ **Proper resource cleanup** - No client leaks
- ✅ **Fast failure** - Immediate error response
- ✅ **Clean retries** - No cascading failures
- ✅ **Pool health** - Connections properly managed
- ✅ **Production ready** - Handles high concurrency gracefully

**Critical for production deployments with concurrent users!** 🚀

