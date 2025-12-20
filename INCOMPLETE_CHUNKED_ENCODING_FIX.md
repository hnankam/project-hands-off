# ERR_INCOMPLETE_CHUNKED_ENCODING Fix

## Problem

```
POST http://localhost:3001/api/copilotkit/agent/dynamic_agent/run
net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)

[useAgentWithErrorBanner] Error occurred: network error
[ChatInner] Agent error occurred: network error undefined
Agent execution failed: TypeError: network error
```

### Root Cause

When an error occurred during run execution, the **RxJS observable (`runSubject`) was never completed or errored**, leaving the streaming HTTP response hanging. The server sent a 200 OK status and started streaming events, but when an error occurred:

1. ❌ The `runSubject` was never completed/errored
2. ❌ The stream was left open
3. ❌ The client received an incomplete chunked response

### The Bug (Lines 229-290)

```javascript
catch (error) {
  console.error(`[PostgresAgentRunner] Run failed: ${error.message}`);
  // ... finalization ...
  
  throw error;  // ❌ runSubject never completed!
}

finally {
  // Cleanup in-memory state
  this.activeSubjects.delete(threadId);  // Delete subjects
  
  // Complete thread subject
  const subjects = this.activeSubjects.get(threadId);  // ❌ Already deleted!
  if (subjects?.threadSubject) {
    subjects.threadSubject.complete();  // Never reached!
  }
}
```

**Two bugs**:
1. **`runSubject` not completed on error** - The streaming response to the client is never closed
2. **Logic error in finally block** - Deletes subjects before trying to access them

## Solution

### Fix 1: Complete Observable on Error (Line 263)

```javascript
catch (error) {
  console.error(`[PostgresAgentRunner] Run failed: ${error.message}`);
  // ... finalization ...
  
  // Complete the observable with error to properly close streaming connection
  runSubject.error(error);  // ✅ Stream properly terminated
  
  throw error;
}
```

### Fix 2: Complete Before Delete (Lines 268-278)

```javascript
finally {
  // ... client release ...
  
  // Complete thread subject BEFORE deleting
  const subjects = this.activeSubjects.get(threadId);  // ✅ Get before delete
  if (subjects?.threadSubject) {
    subjects.threadSubject.complete();  // ✅ Complete it
  }
  
  // THEN cleanup in-memory state
  this.activeSubjects.delete(threadId);  // ✅ Delete after completing
}
```

## How RxJS Observables Work with HTTP Streaming

### CopilotKit's Streaming Architecture

```
Server (PostgresAgentRunner)           Client (Browser)
┌─────────────────────────┐           ┌──────────────────┐
│                         │           │                  │
│  runSubject.next(evt)  ├─────┬────>│  onEvent(evt)    │
│  runSubject.next(evt)  ├─────┤     │  onEvent(evt)    │
│  runSubject.next(evt)  ├─────┤     │  onEvent(evt)    │
│                         │     │     │                  │
│  runSubject.complete() ├─────┴────>│  stream closed   │
│                         │           │  ✅ Success      │
└─────────────────────────┘           └──────────────────┘
```

### What Happens on Error (Before Fix)

```
Server                                 Client
┌─────────────────────────┐           ┌──────────────────┐
│                         │           │                  │
│  runSubject.next(evt)  ├─────┬────>│  onEvent(evt)    │
│  runSubject.next(evt)  ├─────┤     │  onEvent(evt)    │
│                         │     │     │                  │
│  ❌ ERROR OCCURS        │     │     │                  │
│  throw error;           │     │     │                  │
│  (stream never closed)  │     X     │  ⏳ Waiting...   │
│                         │           │  ❌ TIMEOUT      │
│                         │           │  ERR_INCOMPLETE  │
└─────────────────────────┘           └──────────────────┘
```

### After Fix

```
Server                                 Client
┌─────────────────────────┐           ┌──────────────────┐
│                         │           │                  │
│  runSubject.next(evt)  ├─────┬────>│  onEvent(evt)    │
│  runSubject.next(evt)  ├─────┤     │  onEvent(evt)    │
│                         │     │     │                  │
│  ❌ ERROR OCCURS        │     │     │                  │
│  runSubject.error(err) ├─────┴────>│  onError(err)    │
│  throw error;           │           │  ✅ Stream closed │
│                         │           │  Error handled   │
└─────────────────────────┘           └──────────────────┘
```

## Observable Lifecycle

### Success Path

1. `runSubject = new ReplaySubject()`
2. `runSubject.next(event1)`
3. `runSubject.next(event2)`
4. `runSubject.next(event3)`
5. **`runSubject.complete()` ✅ (Line 227)**
6. Client receives complete stream

### Error Path (Before Fix)

1. `runSubject = new ReplaySubject()`
2. `runSubject.next(event1)`
3. `runSubject.next(event2)`
4. **Error occurs**
5. **`throw error` ❌ (never completed)**
6. Client stream hangs → `ERR_INCOMPLETE_CHUNKED_ENCODING`

### Error Path (After Fix)

1. `runSubject = new ReplaySubject()`
2. `runSubject.next(event1)`
3. `runSubject.next(event2)`
4. **Error occurs**
5. **`runSubject.error(error)` ✅ (Line 263)**
6. **`throw error`**
7. Client receives error, stream properly closed

## Why This Matters

### HTTP Chunked Transfer Encoding

When CopilotKit streams responses, it uses:
```
Transfer-Encoding: chunked
Content-Type: text/event-stream
```

Each observable event becomes a chunk:
```
runSubject.next(evt1) → HTTP chunk 1
runSubject.next(evt2) → HTTP chunk 2
runSubject.next(evt3) → HTTP chunk 3
runSubject.complete() → HTTP chunk: 0\r\n\r\n (end marker)
```

**Without `complete()` or `error()`**, the end marker is never sent, so the browser waits indefinitely for more chunks → `ERR_INCOMPLETE_CHUNKED_ENCODING`.

## Testing

### Before Fix
1. Trigger any error during run execution (e.g., lock conflict)
2. ❌ Frontend shows "network error"
3. ❌ Browser console: `ERR_INCOMPLETE_CHUNKED_ENCODING`
4. ❌ Response hangs for ~30 seconds before timeout
5. ❌ No clear error message to user

### After Fix
1. Trigger any error during run execution
2. ✅ Frontend shows specific error message
3. ✅ No `ERR_INCOMPLETE_CHUNKED_ENCODING`
4. ✅ Immediate error response
5. ✅ Clear error message: "Thread is locked" / specific error

### Test Cases

```javascript
// Test 1: Lock conflict
// Send two messages rapidly
// Expected: Second fails immediately with clear error

// Test 2: Database error
// Corrupt database state
// Expected: Error message displayed, no hanging

// Test 3: Agent execution error
// Agent throws exception
// Expected: Error propagated cleanly to client

// Test 4: Network interruption
// Kill database connection mid-run
// Expected: Error, no hang, client notified
```

## Related Fixes

This is the **fifth critical fix** in the PostgresAgentRunner:

1. **Incomplete Run Filtering** - Skip runs without RUN_FINISHED
2. **Lock Timeout** - `FOR UPDATE NOWAIT` for immediate failure  
3. **Transactional Consistency** - Use same client for updates
4. **Client Lifecycle** - Always release clients on error
5. **Observable Completion** - Always complete/error observables ← **This fix**

## Best Practices for RxJS Streaming

### Always Complete Observables

```javascript
// ✅ Good
try {
  // ... work ...
  subject.complete();
} catch (error) {
  subject.error(error);  // Properly close stream
  throw error;
}

// ❌ Bad
try {
  // ... work ...
  subject.complete();
} catch (error) {
  throw error;  // Stream left hanging!
}
```

### Complete Before Delete

```javascript
// ✅ Good
const subjects = this.cache.get(id);
if (subjects) {
  subjects.complete();
}
this.cache.delete(id);

// ❌ Bad
this.cache.delete(id);  // Delete first
const subjects = this.cache.get(id);  // undefined!
if (subjects) {
  subjects.complete();  // Never reached
}
```

### Error Propagation

```javascript
// ✅ Good - Error reaches client
catch (error) {
  observable.error(error);  // Client notified
  throw error;              // Server logs
}

// ❌ Bad - Error swallowed
catch (error) {
  console.error(error);  // Only logged
  // Client never knows!
}
```

## Monitoring

### Good Patterns (After Fix)
```
[PostgresAgentRunner] Run failed: Thread is locked
✅ Client receives error immediately
✅ No hanging connections
✅ Clear error message in UI
```

### Bad Patterns (Indicates Issues)
```
ERR_INCOMPLETE_CHUNKED_ENCODING  ❌
network error (generic)          ❌
Request timeout after 30s        ❌
Multiple retries without success ❌
```

## Conclusion

This fix ensures:
- ✅ **Proper stream termination** - All observables completed or errored
- ✅ **No hanging connections** - Immediate error propagation
- ✅ **Better error messages** - Specific errors reach the client
- ✅ **Resource cleanup** - No leaked subscriptions
- ✅ **Reliable UX** - No mysterious "network error" messages

**Critical for production streaming APIs!** 🚀

## Technical Details

### Observable States

RxJS observables have 3 terminal states:

| State | Method | Meaning |
|-------|--------|---------|
| ✅ **Complete** | `.complete()` | Successful end of stream |
| ❌ **Error** | `.error(err)` | Stream ended with error |
| ⏳ **Active** | *(no call)* | Stream still open ← **Bug was here** |

**Rule**: Every observable **must** eventually reach a terminal state!

### HTTP Response Lifecycle

```
1. Server: response.writeHead(200, { 'Transfer-Encoding': 'chunked' })
2. Server: observable.next() → response.write(chunk1)
3. Server: observable.next() → response.write(chunk2)
4. Server: observable.complete() → response.end() ← **Missing before fix!**
5. Client: Connection closed, all data received ✅

Without step 4: Client waits forever → ERR_INCOMPLETE_CHUNKED_ENCODING
```

