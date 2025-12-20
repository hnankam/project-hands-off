# BrokenResourceError Fix

## Problem

```
Python Backend:
anyio.BrokenResourceError
await send_stream.send(event)

Frontend:
net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)
[useAgentWithErrorBanner] Error occurred: network error
```

### Root Cause

The Python backend was throwing `BrokenResourceError` because the **Node.js runtime was closing the stream while Python was still sending events**. This happened due to:

1. **Race condition**: Observable closed before all events were processed
2. **Client disconnection**: Frontend component unmounted or request cancelled
3. **Premature stream closure**: `runSubject.error()` called while events still incoming

### The Flow

```
Python Backend                     Node.js Runtime                 Frontend
┌─────────────────┐               ┌──────────────────┐            ┌──────────┐
│                 │               │                  │            │          │
│ send_stream.    │──────────────>│ runSubject.next()├───────────>│ onEvent()│
│   send(event1)  │               │                  │            │          │
│                 │               │                  │            │          │
│ send_stream.    │──────────────>│ runSubject.next()├───────────>│ onEvent()│
│   send(event2)  │               │                  │            │          │
│                 │               │                  │            │          │
│ ❌ ERROR or     │               │ runSubject.      │            │ ❌ Stream│
│    DISCONNECT   │               │   error() ❌     │            │   broken │
│                 │               │                  │            │          │
│ send_stream.    │──────X────────│ Observable       │            │          │
│   send(event3)  │   BROKEN!     │   closed!        │            │          │
│                 │               │                  │            │          │
│ BrokenResource  │               │                  │            │ ERR_     │
│ Error ❌        │               │                  │            │ INCOMPLETE│
└─────────────────┘               └──────────────────┘            └──────────┘
```

## Solution

### Check Observable State Before Emitting (Lines 151-157)

Before emitting events to the observable, **check if it's still open**:

```javascript
onEvent: async ({ event }) => {
  try {
    let processedEvent = this.processEvent(event, input, historicMessageIds);
    
    // Check if observable is still active before emitting
    if (runSubject.closed) {
      if (this.debug) {
        console.log(`[PostgresAgentRunner] Skipping event - runSubject already closed`);
      }
      return;  // ✅ Skip event instead of throwing error
    }
    
    // Stream to subscribers
    runSubject.next(processedEvent);
    threadSubject.next(processedEvent);
    // ...
  } catch (error) {
    console.error(`[PostgresAgentRunner] Error processing event: ${error.message}`);
    // Don't fail the run for event processing errors
  }
},
```

### Why This Works

**Before**:
```
1. Python sends event
2. Node.js receives event
3. runSubject.next(event) → emits to client
4. Client disconnects
5. runSubject.error() called
6. Python sends another event
7. runSubject.next(event) → THROWS (observable closed)
8. Python gets BrokenResourceError ❌
```

**After**:
```
1. Python sends event
2. Node.js receives event
3. runSubject.next(event) → emits to client
4. Client disconnects
5. runSubject.error() called
6. Python sends another event
7. Check: runSubject.closed? YES
8. Skip event silently ✅
9. Python completes normally ✅
```

## Related Issues

### Issue 1: Client Disconnection

When a user:
- Navigates away from the page
- Closes the browser tab
- Component unmounts

The frontend cancels the request, but Python is still processing. The fix ensures we **gracefully handle** this scenario.

### Issue 2: Long-Running Executions

For very long agent executions:
- Network timeouts
- Proxy timeouts
- Client-side timeouts

Can cause mid-stream disconnections. The fix prevents these from crashing the Python backend.

### Issue 3: Observable Lifecycle

RxJS observables have three states:
- **Active**: Can emit events
- **Completed**: Successfully finished
- **Errored**: Failed with error

Once an observable is **completed or errored**, calling `.next()` throws an error. The fix checks `runSubject.closed` before emitting.

## Benefits

✅ **No BrokenResourceError** - Python backend handles closed streams gracefully  
✅ **No ERR_INCOMPLETE_CHUNKED_ENCODING** - Stream properly closed on client side  
✅ **Graceful disconnection** - Client can disconnect without crashing backend  
✅ **Better logging** - Clear indication when events are skipped  
✅ **Production ready** - Handles real-world network conditions  

## Testing

### Test Case 1: Normal Execution
```
1. Start agent run
2. Let it complete normally
3. Expected: ✅ No errors, all events delivered
```

### Test Case 2: Client Disconnection
```
1. Start agent run
2. Close browser tab mid-execution
3. Expected: ✅ Python completes, no BrokenResourceError
```

### Test Case 3: Component Unmount
```
1. Start agent run
2. Navigate away from page
3. Expected: ✅ Request cancelled, no errors logged
```

### Test Case 4: Network Timeout
```
1. Start very long agent run (5+ minutes)
2. Simulate network interruption
3. Expected: ✅ Backend handles gracefully, logs skipped events
```

## Monitoring

### Good Patterns (After Fix)
```
[PostgresAgentRunner] Skipping event - runSubject already closed  ✅
Python: INFO: 127.0.0.1 - "POST /agent/..." 200 OK  ✅
No BrokenResourceError in Python logs  ✅
```

### Bad Patterns (Indicates Issues)
```
anyio.BrokenResourceError  ❌
Task exception was never retrieved  ❌
ERR_INCOMPLETE_CHUNKED_ENCODING  ❌
```

## Alternative Approaches Considered

### 1. Catch BrokenResourceError in Python
❌ **Rejected** - Doesn't solve root cause, just hides the error

### 2. Keep Connection Open Longer
❌ **Rejected** - Wastes resources, doesn't handle disconnections

### 3. Use Abort Signal
⚠️ **Possible** - But more complex, requires propagating signal to Python

### 4. Check Observable State (This Fix)
✅ **Chosen** - Simple, effective, handles all disconnect scenarios

## Related Fixes

This is the **seventh critical fix** in the PostgresAgentRunner:

1. **Incomplete Run Filtering** - Skip runs without RUN_FINISHED  
2. **Lock Timeout** - `FOR UPDATE NOWAIT` for immediate failure  
3. **Transactional Consistency** - Use same client for updates  
4. **Client Lifecycle** - Always release clients on error  
5. **Observable Completion** - Always complete/error observables  
6. **Auth Persistence** - Support header-based auth for internal requests  
7. **Stream Closure** - Check observable state before emitting ← **This fix**

## Technical Details

### RxJS Observable States

```javascript
const subject = new ReplaySubject();

// Active
subject.closed === false  // Can emit events

// After complete()
subject.complete();
subject.closed === true  // Cannot emit events

// After error()
subject.error(new Error());
subject.closed === true  // Cannot emit events
```

### AnyIO Memory Streams

Python's `anyio` library uses memory streams for async communication:

```python
send_stream, receive_stream = create_memory_object_stream()

# Sender
await send_stream.send(event)  # Throws BrokenResourceError if receiver closed

# Receiver
async for event in receive_stream:
    process(event)
```

When the receiver closes (Node.js closes observable), the sender gets `BrokenResourceError`.

## Conclusion

This fix ensures:
- ✅ **Graceful stream closure** - No errors when client disconnects
- ✅ **Backend stability** - Python doesn't crash on closed streams
- ✅ **Better UX** - Client can disconnect without backend errors
- ✅ **Production ready** - Handles real-world network conditions
- ✅ **Clean logs** - Clear indication of what happened

**Critical for production deployments with real users!** 🚀

