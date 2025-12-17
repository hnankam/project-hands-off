# Generated Image Database Save Fix

## Problem

Generated images were successfully uploaded to Firebase Storage but failed to save to the database with the error:

```
Failed to register workspace file: malformed array literal: "["ai-generated", "image"]"
DETAIL: "[" must introduce explicitly-specified array dimensions.
CONTEXT: unnamed portal parameter $9 = '...'
```

### Error Log
```
2025-12-16 21:53:22,181 [INFO] Uploaded: https://firebasestorage.googleapis.com/...
2025-12-16 21:53:22,258 [ERROR] Failed to register workspace file: malformed array literal: "["ai-generated", "image"]"
2025-12-16 21:53:22,258 [INFO] Registered generated image in workspace for user D18hHy0VVVzhIbdZJwaILlZaBr17pIYN
```

The last log line is misleading - it says "Registered" but the database insert actually failed.

## Root Cause

In `services/workspace_manager.py`, the `register_workspace_file()` function was calling `json.dumps()` on the tags array before passing it to PostgreSQL:

```python
await cur.execute("""
    INSERT INTO workspace_files 
    (user_id, file_name, file_type, file_size, storage_url, 
     extracted_text, page_count, folder, tags, description)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ...
""", (
    user_id, file_name, file_type, file_size, storage_url,
    extracted_text, page_count, folder, json.dumps(tags), description  # ❌ WRONG!
))
```

### Why This Failed

1. `json.dumps(['ai-generated', 'image'])` produces the string: `'["ai-generated", "image"]'`
2. PostgreSQL received this as a **string literal** with quotes
3. PostgreSQL tried to parse `"["ai-generated", "image"]"` as an array literal
4. The outer quotes confused PostgreSQL's array parser, causing the "malformed array literal" error

### Correct Approach

PostgreSQL's `psycopg` driver (asyncpg) **automatically handles Python lists** and converts them to PostgreSQL array format. You should pass the list directly:

```python
# ✅ CORRECT
tags = ['ai-generated', 'image']  # Python list
await cur.execute(..., (..., tags, ...))  # psycopg converts to PostgreSQL array

# ❌ WRONG
tags = ['ai-generated', 'image']
await cur.execute(..., (..., json.dumps(tags), ...))  # Creates malformed string
```

## Solution

Removed the `json.dumps()` call and pass the tags list directly to psycopg:

```python
await cur.execute("""
    INSERT INTO workspace_files 
    (user_id, file_name, file_type, file_size, storage_url, 
     extracted_text, page_count, folder, tags, description)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    RETURNING id, file_name, file_type, file_size, storage_url, 
              folder, tags, created_at
""", (
    user_id, file_name, file_type, file_size, storage_url,
    extracted_text, page_count, folder, tags, description  # ✅ Pass list directly
))
```

## How psycopg Handles Arrays

When you pass a Python list to psycopg:

```python
tags = ['ai-generated', 'image']
```

psycopg automatically converts it to PostgreSQL array syntax:

```sql
ARRAY['ai-generated', 'image']
```

This is the **correct** PostgreSQL array format that the database expects.

## Testing

After this fix, generated images should:

1. ✅ Upload successfully to Firebase Storage
2. ✅ Save to `workspace_files` table with tags
3. ✅ Appear in the Files tab under "AI Generated" section
4. ✅ Have tags: `['ai-generated', 'image']` or `['ai-generated', 'image', 'graph']`

### Test Commands

Generate an image:
```
"Generate an image of a sunset"
```

Check the database:
```sql
SELECT id, file_name, tags, folder 
FROM workspace_files 
WHERE folder = 'generated' 
ORDER BY created_at DESC 
LIMIT 5;
```

Expected result:
```
id                          | file_name        | tags                          | folder
----------------------------+------------------+-------------------------------+-----------
abc-123...                  | generated-1.png  | {ai-generated,image}          | generated
```

## Related Code

### Files Modified
- `copilotkit-pydantic/services/workspace_manager.py` - Fixed `register_workspace_file()`

### Files That Call This Function
- `copilotkit-pydantic/tools/backend_tools.py` - `generate_images()` function
- `copilotkit-pydantic/tools/multi_agent_graph/steps.py` - `extract_image_result()` function

Both pass tags as: `tags=['ai-generated', 'image']` which is correct.

## Prevention

**Rule of thumb for PostgreSQL arrays with psycopg:**
- ✅ **DO** pass Python lists directly
- ❌ **DON'T** use `json.dumps()` on lists meant for PostgreSQL array columns
- ✅ **DO** use `json.dumps()` for JSONB columns (like `metadata`)
- ✅ **DO** use type hints: `tags: List[str]` to make intent clear

## Summary

**Before:** `json.dumps(tags)` → `'["ai-generated", "image"]'` → Database error  
**After:** `tags` → `ARRAY['ai-generated', 'image']` → ✅ Success

Generated images now save correctly to the workspace! 🎉

