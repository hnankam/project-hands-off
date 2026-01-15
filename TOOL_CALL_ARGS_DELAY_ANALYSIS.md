# Tool Call Args Streaming Delay Analysis

## Problem Summary

**Observation:** `create_text_file` tool executes in <200ms, but UI takes ~3 minutes to render the tool call. This delay accumulates across multiple file creations, causing the UI to lag significantly behind the actual LLM execution.

**Example:**
- Tool execution: `21:35:49.806` - `21:35:50.060` (254ms) ✅
- File created: `00_START_HERE_CELL_2_ANALYSIS.md` (8896 bytes)
- UI rendering: Takes ~3 minutes to show the file creation card

## End-to-End Flow Analysis

### 1. **Python Backend (`copilotkit-pydantic/api/routes.py`)**

**Location:** Lines 367-374

```python
event_stream = run_ag_ui(
    agent=agent_instance,
    run_input=run_input,
    deps=deps,
    on_complete=usage_callback
)
async for event in event_stream:
    await send_stream.send(event)  # ❌ Sends FULL event as SSE string
```

**Key Issue:**
- `run_ag_ui()` generates events as **pre-formatted SSE strings**
- `TOOL_CALL_ARGS` events contain a **`delta` field** (incremental chunks)
- The question is: **Does pydantic_ai send ONE large delta with all arguments, or multiple small incremental deltas?**
- If it's ONE large delta (8KB+), that's the bottleneck
- If it's multiple small deltas, the issue might be event count/overhead

**Event Format (from pydantic_ai):**
```
data: {"type":"TOOL_CALL_ARGS","toolCallId":"...","delta":"<chunk of arguments>"}
```

**Critical Question:**
- For `create_text_file` with 8KB+ content, does pydantic_ai send:
  1. **ONE large delta**: `delta="{\"file_name\":\"...\",\"content\":\"<8KB+>\"}"` ❌ (bottleneck)
  2. **Multiple small deltas**: Many events with small chunks ✅ (less likely bottleneck)

### 2. **HTTP Transfer (Python → Node.js)**

**Location:** `copilot-runtime-server/server.js` (HttpAgent forwarding)

**What Happens:**
- Python backend sends large SSE event string (~8KB+)
- HTTP request/response carries full payload
- Node.js receives and parses the full event

**Performance Impact:**
- Large JSON serialization in Python (8KB+ content)
- Large HTTP payload transfer
- Large JSON parsing in Node.js
- **All of this happens BEFORE any truncation**

### 3. **Node.js Processing (`copilot-runtime-server/runners/postgres-agent-runner.js`)**

**Location:** Lines 684-714

```javascript
onEvent: async ({ event }) => {
    const processedEvent = this.processEvent(event, input, historicMessageIds);
    currentEvents.push(processedEvent);  // Store UNTRUNCATED
    
    let eventToStream = processedEvent;
    const isArgs = processedEvent.type === EventType.TOOL_CALL_ARGS || processedEvent.type === 'TOOL_CALL_ARGS';
    
    if (isArgs) {
        const truncated = this.truncateToolCallResults([processedEvent], runId);
        eventToStream = truncated[0];  // ✅ Truncate AFTER receiving full event
    }
    
    runSubject.next(eventToStream);  // Stream to frontend
}
```

**Truncation Logic (Lines 1279-1377):**
- Threshold: **1200 characters**
- Only truncates if content > 1200 chars
- Replaces with JSON metadata for lazy loading

**Key Issue:**
- Truncation happens **AFTER** receiving the full event from Python
- The large payload has already been:
  - Serialized in Python
  - Transferred over HTTP
  - Parsed in Node.js
- Truncation only helps the frontend, not the backend transfer

### 4. **Frontend Rendering**

**Location:** `pages/side-panel/src/hooks/copilotkit/useAgentEventSubscriber.ts`

**What Happens:**
- Receives truncated event (if > 1200 chars)
- Renders tool call card
- If truncated, shows "Content truncated for performance" message

**Performance Impact:**
- Even with truncation, the frontend may be doing expensive rendering
- Multiple file creations compound the delay

## Root Cause Analysis

**Two possible scenarios:**

### Scenario A: Single Large Delta (Most Likely)
If pydantic_ai sends **ONE large delta** with all arguments:
1. **Python backend sends ONE large `TOOL_CALL_ARGS` event** with `delta` containing full JSON (8KB+)
2. **Large HTTP payload** must be serialized, transferred, and parsed
3. **Truncation happens too late** (in Node.js, after transfer)
4. **Frontend receives events slowly** due to backend transfer delay

### Scenario B: Multiple Small Deltas
If pydantic_ai sends **multiple small incremental deltas**:
1. **Many small `TOOL_CALL_ARGS` events** (each with small delta chunks)
2. **Event overhead** accumulates (serialization, HTTP, parsing per event)
3. **Accumulation logic** in frontend/Node.js may be slow
4. **Event count** rather than size is the bottleneck

**Need to verify:** Check logs/network to see if it's one large event or many small events

## Why Truncation Doesn't Help

The current truncation in Node.js (`postgres-agent-runner.js`) only helps:
- ✅ Frontend payload size
- ✅ Database storage (keeps full content)

But it **doesn't help**:
- ❌ Python → Node.js HTTP transfer
- ❌ Python JSON serialization
- ❌ Node.js JSON parsing
- ❌ Overall latency

## Solution Approaches

### Approach A: Truncate Large Delta in Python (if Scenario A)
**If pydantic_ai sends ONE large delta:**

1. **Intercept events in Python** (`routes.py` or `run_ag_ui` wrapper)
2. **Check `delta` size** in `TOOL_CALL_ARGS` events
3. **Truncate large deltas** if `len(delta) > threshold` (e.g., 1200 chars)
4. **Replace delta** with truncated metadata (similar to Node.js truncation)
5. **Send truncated event** to Node.js
6. **Keep full content** for database persistence (if needed)

**Benefits:**
- ✅ Reduces Python → Node.js HTTP payload
- ✅ Faster Python JSON serialization
- ✅ Faster Node.js JSON parsing
- ✅ Faster overall event streaming
- ✅ UI updates faster

### Approach B: Optimize Event Accumulation (if Scenario B)
**If pydantic_ai sends multiple small deltas:**

1. **Batch/compact deltas** before sending to Node.js
2. **Reduce event count** by merging consecutive `TOOL_CALL_ARGS` events
3. **Optimize accumulation logic** in frontend/Node.js
4. **Consider throttling** event emission rate

**Trade-offs:**
- Need to verify actual event pattern (one large vs many small)
- May need to adjust truncation threshold
- Need to coordinate with existing Node.js truncation logic
- Frontend must handle truncated deltas correctly (already does ✅)

## Current Architecture

```
Python Backend                    Node.js Server                    Frontend
─────────────────                 ──────────────                    ────────
run_ag_ui()                       HttpAgent                        SSE Client
  │                                 │                                │
  ├─ TOOL_CALL_START ──────────────>│                                │
  │                                 │                                │
  ├─ TOOL_CALL_ARGS (8KB+) ────────>│ (Full payload transferred)    │
  │   (Full content)                │                                │
  │                                 ├─ Parse full event              │
  │                                 ├─ Truncate (>1200 chars)        │
  │                                 └───────────────────────────────>│
  │                                                                   │
  ├─ TOOL_CALL_END ────────────────>│                                │
  │                                 │                                │
  └─ TOOL_CALL_RESULT ─────────────>│                                │
```

## Proposed Architecture

```
Python Backend                    Node.js Server                    Frontend
─────────────────                 ──────────────                    ────────
run_ag_ui()                       HttpAgent                        SSE Client
  │                                 │                                │
  ├─ TOOL_CALL_START ──────────────>│                                │
  │                                 │                                │
  ├─ TOOL_CALL_ARGS (truncated) ───>│ (Small payload transferred)   │
  │   (Truncated in Python)         │                                │
  │                                 └───────────────────────────────>│
  │                                                                   │
  ├─ TOOL_CALL_END ────────────────>│                                │
  │                                 │                                │
  └─ TOOL_CALL_RESULT ─────────────>│                                │
```

## Implementation Considerations

1. **Where to truncate:**
   - Option A: In `routes.py` before `send_stream.send(event)`
   - Option B: In a wrapper around `run_ag_ui()`
   - Option C: In `AGUIAdapter` or event encoder

2. **Truncation threshold:**
   - Current: 1200 chars (Node.js)
   - Should match or be slightly lower to account for JSON overhead

3. **Database persistence:**
   - Current: Node.js stores full content in `currentEvents`
   - After Python truncation: Need to ensure full content still reaches database
   - May need to send full content separately or store in Python

4. **Coordination:**
   - Remove or adjust Node.js truncation to avoid double-truncation
   - Ensure consistent truncation behavior across both layers

## Metrics to Track

1. **Python → Node.js transfer time** (before/after truncation)
2. **Event streaming latency** (time from tool execution to UI update)
3. **HTTP payload size** (before/after truncation)
4. **Frontend rendering time** (if still slow after backend fix)

## Next Steps

1. ✅ **Review complete** - Identified root cause
2. ⏳ **Implement Python-side truncation** - Truncate TOOL_CALL_ARGS before sending
3. ⏳ **Test performance** - Measure improvement in UI update latency
4. ⏳ **Coordinate truncation** - Ensure database still gets full content if needed
5. ⏳ **Monitor metrics** - Track transfer times and payload sizes
