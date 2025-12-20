# Request Timeout Configuration Fix

## Problem

```
Frontend:
POST http://localhost:3001/api/copilotkit/agent/dynamic_agent/run
net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)
[useAgentWithErrorBanner] Error occurred: network error

Backend:
✅ Python continues running (no errors)
✅ Runtime server shows no errors
✅ Agent execution completes successfully
❌ But frontend times out and shows error
```

### Root Cause

The **Node.js server timeout was too short** for long-running agent executions:

- **Default timeout**: 30 seconds (`REQUEST_TIMEOUT_MS = 30_000`)
- **Typical agent run**: 1-3 minutes with tool calls, code execution, multi-agent graphs
- **Result**: Server closes connection after 30s, but Python continues running

### The Timeline

```
Time    Frontend              Node.js Runtime           Python Backend
─────────────────────────────────────────────────────────────────────
0:00    Send request ──────> Accept request ─────────> Start execution
        Waiting...           Streaming events ────────> Processing...
                             
0:30    ⏰ TIMEOUT!          ⏰ Server timeout!         Still running ✅
        ERR_INCOMPLETE       Connection closed          
        "network error"      (but Python continues)     
        
1:00                                                    Tool call 1 ✅
1:30                                                    Tool call 2 ✅
2:00                                                    Complete ✅
                                                        (but no one listening)
```

### Why This Happened

1. **Agent runs take time**: Tool calls, code execution, API calls, multi-agent coordination
2. **30-second timeout**: Designed for typical HTTP requests, not streaming agent execution
3. **Mismatch**: Frontend waits indefinitely, but server times out at 30s
4. **Broken stream**: Connection closed mid-execution → `ERR_INCOMPLETE_CHUNKED_ENCODING`

## Solution

### Increase Timeout for Long-Running Agents (Lines 48-51)

```javascript
// Before:
export const REQUEST_TIMEOUT_MS = requestTimeout > 0 ? requestTimeout : 30_000; // 30 seconds
export const HEADERS_TIMEOUT_MS = headersTimeout > 0 ? headersTimeout : 65_000; // Node default

// After:
// Increased timeout for long-running agent executions (5 minutes)
// Agent runs with tool calls, code execution, etc. can take several minutes
export const REQUEST_TIMEOUT_MS = requestTimeout > 0 ? requestTimeout : 300_000; // 5 minutes
export const HEADERS_TIMEOUT_MS = headersTimeout > 0 ? headersTimeout : 310_000; // 5 min + 10s buffer
```

### Why 5 Minutes?

**Typical agent execution times**:
- Simple query: 5-15 seconds ✅
- With tool calls: 30-90 seconds ✅
- Code execution: 1-3 minutes ✅
- Multi-agent graph: 2-5 minutes ✅
- Complex workflows: 3-5 minutes ✅

**5-minute timeout provides**:
- ✅ Enough time for complex agent workflows
- ✅ Still reasonable timeout (not infinite)
- ✅ Prevents truly stuck requests from hanging forever

### Configuration Priority

The timeout can be configured via environment variable:

```bash
# .env
REQUEST_TIMEOUT_MS=300000  # 5 minutes
HEADERS_TIMEOUT_MS=310000  # 5 minutes + 10s buffer
```

**Priority**:
1. Environment variable (`process.env.REQUEST_TIMEOUT_MS`)
2. Default value (300,000 ms = 5 minutes)

## Related Timeouts

### 1. Node.js Server Timeouts

```javascript
// server.js (Lines 873-874)
server.setTimeout(REQUEST_TIMEOUT_MS);        // Request body timeout
server.headersTimeout = HEADERS_TIMEOUT_MS;   // Headers timeout
```

- **`setTimeout`**: How long to wait for request body
- **`headersTimeout`**: How long to wait for headers (should be > setTimeout)

### 2. Database Statement Timeout

```javascript
// postgres-agent-runner.js (Line 538)
await client.query('SET LOCAL statement_timeout = 5000'); // 5 seconds
```

- **Purpose**: Prevent database locks from hanging forever
- **Scope**: Per-transaction, not per-request
- **Different concern**: Database operations, not HTTP requests

### 3. Python Backend Timeout

Python's FastAPI/Uvicorn doesn't have a default request timeout - it relies on the client (Node.js) to close the connection.

## Benefits

✅ **Long-running agents work** - 5-minute timeout accommodates complex workflows  
✅ **No premature disconnection** - Server waits for agent to complete  
✅ **Better UX** - No "network error" for legitimate long operations  
✅ **Still has timeout** - Prevents truly stuck requests from hanging forever  
✅ **Configurable** - Can be adjusted via environment variable  

## Testing

### Test Case 1: Quick Response (< 30s)
```
1. Send simple query
2. Agent responds in 10 seconds
3. Expected: ✅ Works (always worked)
```

### Test Case 2: Medium Response (30s - 2min)
```
1. Send query with tool calls
2. Agent takes 90 seconds
3. Before: ❌ Timeout at 30s
4. After: ✅ Completes successfully
```

### Test Case 3: Long Response (2-5min)
```
1. Send complex multi-agent query
2. Agent takes 3 minutes
3. Before: ❌ Timeout at 30s
4. After: ✅ Completes successfully
```

### Test Case 4: Very Long Response (> 5min)
```
1. Send extremely complex query
2. Agent takes 6 minutes
3. Expected: ❌ Timeout at 5 minutes (as designed)
```

## Monitoring

### Good Patterns (After Fix)
```
[PostgresAgentRunner] Run completed: session-XXX/YYY (180000ms)  ✅
Python: INFO: "POST /agent/..." 200 OK  ✅
No timeout errors in frontend  ✅
```

### Bad Patterns (Indicates Issues)
```
ERR_INCOMPLETE_CHUNKED_ENCODING (before 5 minutes)  ❌
Request timeout after 30s  ❌
Agent still running but client disconnected  ❌
```

### Metrics to Track

```javascript
// Track agent execution times
const executionTime = Date.now() - startTime;
console.log(`Agent execution time: ${executionTime}ms`);

// Alert if approaching timeout
if (executionTime > 240000) { // 4 minutes
  console.warn('Agent execution approaching timeout threshold');
}
```

## Alternative Approaches Considered

### 1. Infinite Timeout
❌ **Rejected** - Stuck requests would hang forever, resource exhaustion

### 2. Keep 30s Timeout
❌ **Rejected** - Too short for real-world agent workflows

### 3. 2-Minute Timeout
⚠️ **Considered** - Better than 30s, but still too short for complex workflows

### 4. 5-Minute Timeout (This Fix)
✅ **Chosen** - Balances real-world needs with reasonable timeout

### 5. Dynamic Timeout Based on Complexity
⚠️ **Future Enhancement** - Could adjust timeout based on detected workflow complexity

## Production Considerations

### Load Balancer Timeouts

If using a load balancer (Nginx, HAProxy, AWS ALB), ensure its timeout is also increased:

```nginx
# Nginx
proxy_read_timeout 300s;
proxy_send_timeout 300s;
```

```yaml
# AWS ALB
idle_timeout: 300
```

### Client-Side Timeout

Ensure frontend HTTP client also has sufficient timeout:

```typescript
// fetch with timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

fetch(url, {
  signal: controller.signal,
  // ...
});
```

### Kubernetes/Docker

```yaml
# Kubernetes Ingress
nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
```

## Related Fixes

This is the **eighth critical fix** in the PostgresAgentRunner:

1. **Incomplete Run Filtering** - Skip runs without RUN_FINISHED  
2. **Lock Timeout** - `FOR UPDATE NOWAIT` for immediate failure  
3. **Transactional Consistency** - Use same client for updates  
4. **Client Lifecycle** - Always release clients on error  
5. **Observable Completion** - Always complete/error observables  
6. **Auth Persistence** - Support header-based auth for internal requests  
7. **Stream Closure** - Check observable state before emitting  
8. **Request Timeout** - Increase timeout for long-running agents ← **This fix**

## Environment Variables

```bash
# .env.example
# Request timeout (default: 300000 = 5 minutes)
REQUEST_TIMEOUT_MS=300000

# Headers timeout (should be > REQUEST_TIMEOUT_MS)
HEADERS_TIMEOUT_MS=310000
```

## Conclusion

This fix ensures:
- ✅ **Long-running agents complete** - 5-minute timeout accommodates real workflows
- ✅ **No premature disconnection** - Server waits for legitimate operations
- ✅ **Better user experience** - No "network error" for normal operations
- ✅ **Still protected** - Timeout prevents infinite hangs
- ✅ **Configurable** - Can be tuned per deployment

**Critical for production deployments with complex agent workflows!** ⏱️

## Quick Reference

| Timeout Type | Default | Purpose | Scope |
|--------------|---------|---------|-------|
| `REQUEST_TIMEOUT_MS` | 300s (5 min) | HTTP request timeout | Server-wide |
| `HEADERS_TIMEOUT_MS` | 310s (5 min + 10s) | HTTP headers timeout | Server-wide |
| `statement_timeout` | 5s | Database query timeout | Per-transaction |
| Load balancer | Varies | Proxy timeout | Infrastructure |
| Client fetch | Varies | Frontend timeout | Client-side |

**Rule of thumb**: Each layer should have timeout >= previous layer + buffer.

