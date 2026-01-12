# Data Integrity Fix: Preventing Truncation Corruption

## Problem Summary

**CRITICAL BUG**: The runtime server was persisting **truncated** tool call results and args to the database, causing permanent data loss.

### Root Cause

In `postgres-agent-runner.js`, the `executeRun()` method was:

1. ❌ Truncating events for frontend display
2. ❌ **Storing truncated events** in `currentEvents` array
3. ❌ **Persisting truncated data** to database (immediate + completion)
4. ❌ Causing permanent data corruption

### Impact

- Database contained truncated content (original lost forever)
- Future sessions loaded corrupted data
- Tool results/args over 1200 characters were replaced with:
  ```json
  {
    "truncated": true,
    "toolCallId": "...",
    "originalLength": 5000,
    "message": "Content truncated..."
  }
  ```

## Solution

### Architecture Change

**Separate truncation for display vs. persistence:**

```javascript
// IN executeRun() onEvent handler:

// 1. Store UNTRUNCATED event for database
const processedEvent = this.processEvent(event, input, historicMessageIds);
currentEvents.push(processedEvent); // ✅ Full data for DB

// 2. Create TRUNCATED COPY for streaming
let eventToStream = processedEvent;
if (isResult || isArgs) {
  const truncated = this.truncateToolCallResults([processedEvent]);
  eventToStream = truncated[0]; // ✅ Truncated for frontend only
}

// 3. Stream truncated, persist original
runSubject.next(eventToStream);  // ✅ Frontend gets truncated
await this.appendEvent(runId, processedEvent); // ✅ DB gets original
```

### Key Principles

1. **`currentEvents`**: Always contains UNTRUNCATED data
2. **`eventToStream`**: Truncated copy for frontend only
3. **Database writes**: Always use untruncated data
4. **Frontend streaming**: Uses truncated data for performance
5. **`loadAndStreamHistory()`**: Truncates on read (safe, doesn't write back)

## Verification

### What's Protected

✅ **Database writes** (always untruncated):
- `appendEvent()` (immediate persistence during run)
- `completeRun()` (final persistence at run completion)
- Both use `currentEvents` which contains untruncated data

✅ **Frontend display** (truncated for performance):
- `runSubject.next(eventToStream)` sends truncated to frontend
- `loadAndStreamHistory()` truncates on read (doesn't write back)
- File management card fetches full content from DB via file_id

### Data Flow

```
Agent Event → processEvent() → [FORK]
                                  ↓
                    ┌─────────────┴─────────────┐
                    ↓                           ↓
            currentEvents[]            eventToStream
         (UNTRUNCATED)                 (TRUNCATED)
                    ↓                           ↓
            Database Storage              Frontend Stream
         (Source of Truth)              (Display Only)
```

## Testing

### Verify Fix

1. **Create a large file** (> 1200 chars)
2. **Check database**: `SELECT events FROM agent_runs WHERE run_id = '...'`
3. **Verify**: TOOL_CALL_RESULT/TOOL_CALL_ARGS events contain full content
4. **Verify**: Frontend shows truncated content with "Show Content Preview" button
5. **Click "Show Content Preview"**: Full content fetched from DB via file_id

### Before Fix

```sql
SELECT events::jsonb->-1->'content' FROM agent_runs WHERE run_id = '...';
-- Returns: '{"truncated":true,"toolCallId":"...","originalLength":5000}' ❌
```

### After Fix

```sql
SELECT events::jsonb->-1->'content' FROM agent_runs WHERE run_id = '...';
-- Returns: Full original content (5000 chars) ✅
```

## Related Changes

1. **Frontend**: File management card now uses `file_id` to fetch content from DB
2. **Backend**: `loadAndStreamHistory()` truncates on read (safe, read-only)
3. **Metrics**: No impact on existing metrics

## Deployment Notes

- ✅ **Backward compatible**: Existing truncated data in DB will remain truncated
- ✅ **Forward compatible**: New events will always be stored untruncated
- ⚠️ **Historical data**: Consider running a migration to restore truncated content from backups (if available)

## Monitoring

Watch for:
- Database event sizes increasing (expected, good)
- Frontend payload sizes unchanged (truncation still happens for display)
- No performance degradation (truncation only affects streaming, not DB)

## Summary

**Before**: Truncation corrupted database storage ❌  
**After**: Truncation only affects display, DB always has full data ✅

This ensures data integrity while maintaining performance optimization for the frontend.
