# 🔧 Fix: Zod Validation Error for agent_state Activity Messages

## Problem

Console error when agent state updates were sent:
```
Failed to parse content for activity message 'agent_state': ZodError: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "null",
    "path": ["sessionId"],
    "message": "Expected string, received null"
  }
]
```

## Root Cause

**Python `None` vs JavaScript `undefined` mismatch**

The backend was sending `"sessionId": null` in JSON when sessionId was not available:

```python
# ❌ WRONG: Sends null when sessionId doesn't exist
activity_content = {
    "graphs": {...},
    "sessionId": shared_state.sessionId if (...) else None,  # None becomes null in JSON
}
```

But the frontend Zod schema expects `string | undefined`, not `string | null`:

```typescript
// Frontend schema
export const unifiedAgentStateSchema = z.object({
  plans: z.record(planInstanceSchema).optional(),
  graphs: z.record(graphInstanceSchema).optional(),
  sessionId: z.string().optional(),  // ← Expects string OR undefined, NOT null
  deferred_tool_requests: z.unknown().optional(),
});
```

### The Difference

| Python | JSON | TypeScript/Zod | Valid? |
|--------|------|----------------|--------|
| `None` | `null` | `null` | ❌ Fails validation |
| (omitted) | (omitted) | `undefined` | ✅ Valid |
| `"abc123"` | `"abc123"` | `"abc123"` | ✅ Valid |

**Key Point**: In Zod, `.optional()` means the field can be **omitted** (undefined), not that it can be `null`.

## The Fix

Changed the backend to **omit the key** when the value is None, rather than setting it to `null`:

### File: `copilotkit-pydantic/tools/multi_agent_graph/state.py`

#### Fix 1: Activity Message Content (lines 501-511)

**Before:**
```python
activity_content = {
    "graphs": {
        graph_id: graph_instance_data
    },
    "sessionId": shared_state.sessionId if (shared_state and hasattr(shared_state, 'sessionId')) else None,
}
```

**After:**
```python
activity_content = {
    "graphs": {
        graph_id: graph_instance_data
    },
}

# Only include sessionId if it exists (Zod schema expects string or undefined, not null)
if shared_state and hasattr(shared_state, 'sessionId') and shared_state.sessionId:
    activity_content["sessionId"] = shared_state.sessionId
```

#### Fix 2: State Snapshot (lines 471-482)

**Before:**
```python
nested_snapshot = {
    "graphs": all_graphs,
    "plans": {...},
    "deferred_tool_requests": getattr(shared_state, 'deferred_tool_requests', None) if shared_state else None,
}

if shared_state and hasattr(shared_state, 'sessionId') and shared_state.sessionId:
    nested_snapshot["sessionId"] = shared_state.sessionId
```

**After:**
```python
nested_snapshot = {
    "graphs": all_graphs,
    "plans": {...},
}

# Only include optional fields if they exist (Zod schema expects undefined, not null)
if shared_state and hasattr(shared_state, 'sessionId') and shared_state.sessionId:
    nested_snapshot["sessionId"] = shared_state.sessionId
if shared_state and hasattr(shared_state, 'deferred_tool_requests') and shared_state.deferred_tool_requests:
    nested_snapshot["deferred_tool_requests"] = shared_state.deferred_tool_requests
```

## Why This Works

### JSON Serialization Behavior

**With `None` value:**
```python
{"sessionId": None}  →  {"sessionId": null}  # ❌ Zod rejects
```

**With omitted key:**
```python
{}  →  {}  # ✅ Zod accepts (field is undefined)
```

**With actual value:**
```python
{"sessionId": "abc123"}  →  {"sessionId": "abc123"}  # ✅ Zod accepts
```

### Zod Schema Interpretation

```typescript
z.string().optional()
```

Means:
- ✅ `{sessionId: "abc123"}` - Valid (string)
- ✅ `{}` - Valid (field undefined/missing)
- ❌ `{sessionId: null}` - Invalid (null is not string or undefined)

To accept `null`, the schema would need:
```typescript
z.string().nullable().optional()  // or z.string().nullish()
```

## Impact

✅ **No more Zod validation errors** in console  
✅ **Agent state updates work correctly**  
✅ **Activity messages parse successfully**  
✅ **GraphStateCard renders without errors**  
✅ **Backward compatible** - existing code with sessionId still works  

## Testing

### Before Fix
```
Console: Failed to parse content for activity message 'agent_state': ZodError: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "null",
    "path": ["sessionId"]
  }
]
```

### After Fix
```
Console: (no errors)
Agent state updates successfully
Graphs render correctly
```

## Related Issues

This same pattern applies to **any optional field** in Zod schemas:

- ✅ **Correct**: Omit the key when value is None
- ❌ **Wrong**: Include the key with `null` value

### Other Fields Fixed
- `deferred_tool_requests` - Now omitted when None instead of `null`

## Files Modified

### Backend
- **`copilotkit-pydantic/tools/multi_agent_graph/state.py`**
  - Lines 471-482: Fixed `nested_snapshot` to omit optional fields when None
  - Lines 501-511: Fixed `activity_content` to omit sessionId when None

### Frontend
- **No changes needed** - Schema was already correct

## Best Practice

When sending data to Zod-validated schemas:

```python
# ❌ DON'T: Set optional fields to None
data = {
    "required_field": "value",
    "optional_field": some_value if condition else None,  # Sends null
}

# ✅ DO: Omit optional fields when they don't exist
data = {
    "required_field": "value",
}
if condition and some_value:
    data["optional_field"] = some_value  # Only include if exists
```

---

**Date**: December 20, 2024  
**Files Modified**: `copilotkit-pydantic/tools/multi_agent_graph/state.py`  
**Lines Changed**: 471-482, 501-511  
**Status**: ✅ FIXED  
**Type**: Backend Data Serialization Fix

