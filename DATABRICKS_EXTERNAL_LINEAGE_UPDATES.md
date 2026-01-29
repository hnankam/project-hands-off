# External Lineage Tool Updates

## Summary

Two major updates to `list_external_lineage` and related external lineage tools:

1. **Type Handling Fix**: Fixed `'str' object has no attribute 'get'` error by supporting both dict and string formats for object parameters
2. **Pagination Standardization**: Updated to use the same pagination pattern as other Unity Catalog listing tools for consistency

---

# Part 1: Type Handling Fix

## Problem

The `list_external_lineage` tool (and other external lineage CRUD operations) were failing with:

```
"error_message": "Failed to list external lineage: 'str' object has no attribute 'get'"
```

### Root Cause

The `_convert_object_dict_to_sdk()` helper function expected nested object properties (like `table`, `path`, `model_version`, `external_metadata`) to be dictionaries, but they were sometimes passed as strings.

**Example of the issue:**

```python
# Expected format:
object_info = {
    "table": {"name": "my_catalog.my_schema.my_table"}
}

# Actual format received:
object_info = {
    "table": "my_catalog.my_schema.my_table"  # String, not dict!
}

# Code tried to do:
obj_dict['table'].get('name')  # ❌ AttributeError: 'str' object has no attribute 'get'
```

## Solution (Part 1)

Updated all external lineage functions to handle **both dict and string inputs** for object properties.

### Flexible Type Handling

**Before:**
```python
if 'table' in obj_dict and obj_dict['table']:
    kwargs['table'] = ExternalLineageTable(name=obj_dict['table'].get('name'))
    # ❌ Fails if obj_dict['table'] is a string
```

**After:**
```python
if 'table' in obj_dict and obj_dict['table']:
    table_val = obj_dict['table']
    if isinstance(table_val, dict):
        kwargs['table'] = ExternalLineageTable(name=table_val.get('name'))
    elif isinstance(table_val, str):
        kwargs['table'] = ExternalLineageTable(name=table_val)
    # ✅ Handles both dict and string
```

Applied to:
- `table` (string = table name)
- `path` (string = URL)
- `model_version` (must be dict with name and version)
- `external_metadata` (string = metadata name)

### Supported Input Formats

The functions now accept multiple formats for object specification:

**Table Object:**
```python
# Format 1: Dict with name
{"table": {"name": "catalog.schema.table"}}

# Format 2: Direct string (name)
{"table": "catalog.schema.table"}
```

**Path Object:**
```python
# Format 1: Dict with URL
{"path": {"url": "s3://bucket/path/to/data"}}

# Format 2: Direct string (URL)
{"path": "s3://bucket/path/to/data"}
```

**External Metadata Object:**
```python
# Format 1: Dict with name
{"external_metadata": {"name": "external_system.object"}}

# Format 2: Direct string (name)
{"external_metadata": "external_system.object"}
```

---

# Part 2: Pagination Standardization

## Changes

### Before

**Parameters:**
- `page_size: Optional[int]` - Maximum number of relationships to return (max 1000)
- `page_token: Optional[str]` - Opaque token for next page of results

**Behavior:**
- Used Databricks SDK's native pagination with page tokens
- Always returned `has_more=False` with comment "SDK handles pagination internally"
- Required clients to manage opaque page tokens

### After

**Parameters:**
- `limit: int = 25` - Number of relationships to return per page (default: 25)
- `page: int = 0` - Zero-indexed page number (default: 0)

**Behavior:**
- Uses `itertools.islice` for consistent pagination across all listing tools
- Returns accurate `has_more` boolean indicating if more results exist
- Simple page number increment for subsequent requests (page=0, 1, 2, ...)

## Implementation Details

### Pagination Logic

```python
from itertools import islice

# Get iterator of all relationships
response = client.external_lineage.list_external_lineage_relationships(
    object_info=obj,
    lineage_direction=direction,
)

# Apply pagination using islice
skip = page * limit
relationships_iterator = islice(response, skip, skip + limit)

relationships = []
for lineage_info in relationships_iterator:
    rel_dict = lineage_info.as_dict() if hasattr(lineage_info, 'as_dict') else {}
    relationships.append(rel_dict)

# Check for more results
has_more = False
try:
    next(response)
    has_more = True
except StopIteration:
    has_more = False
```

### How It Works

1. **Get full iterator**: Request all relationships from the SDK (no page_size/page_token)
2. **Skip to page**: Use `islice(response, skip, skip + limit)` to skip ahead based on page number
3. **Collect page results**: Iterate up to `limit` items
4. **Check for more**: Try to get one more item from iterator
   - If successful: `has_more=True` (more results exist)
   - If `StopIteration`: `has_more=False` (no more results)

## API Changes

### Function Signature

**Before:**
```python
def list_external_lineage(
    host_credential_key: str,
    token_credential_key: str,
    object_info: Dict[str, Any],
    lineage_direction: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListExternalLineageResponse:
```

**After:**
```python
def list_external_lineage(
    host_credential_key: str,
    token_credential_key: str,
    object_info: Dict[str, Any],
    lineage_direction: str,
    limit: int = 25,
    page: int = 0,
) -> ListExternalLineageResponse:
```

### Response Model

No changes to `ListExternalLineageResponse` structure:
```python
{
    "lineage_relationships": [...],  # List of relationship dicts
    "count": 10,                      # Number returned in this page
    "has_more": true,                 # More results available
    "error_message": null             # Error if failed
}
```

## Usage Examples

### Example 1: Get First Page

```python
result = list_external_lineage(
    host_credential_key="databricks_host",
    token_credential_key="databricks_token",
    object_info={"table": "catalog.schema.table"},
    lineage_direction="UPSTREAM",
    limit=25,
    page=0
)

print(f"Retrieved {result.count} relationships")
print(f"More available: {result.has_more}")
```

### Example 2: Paginate Through All Results

```python
page = 0
all_relationships = []

while True:
    result = list_external_lineage(
        host_credential_key="databricks_host",
        token_credential_key="databricks_token",
        object_info={"table": "catalog.schema.table"},
        lineage_direction="DOWNSTREAM",
        limit=50,
        page=page
    )
    
    all_relationships.extend(result.lineage_relationships)
    
    if not result.has_more:
        break
    
    page += 1

print(f"Total relationships: {len(all_relationships)}")
```

### Example 3: Get Specific Page

```python
# Get page 3 (relationships 100-149, assuming limit=50)
result = list_external_lineage(
    host_credential_key="databricks_host",
    token_credential_key="databricks_token",
    object_info={"path": "s3://bucket/data"},
    lineage_direction="UPSTREAM",
    limit=50,
    page=2  # Zero-indexed, so page=2 is the 3rd page
)
```

## Benefits

### 1. **Consistency**
All Unity Catalog listing tools now use the same pagination pattern:
- `list_catalogs`
- `list_schemas`
- `list_tables`
- `list_table_summaries`
- `list_volumes`
- `list_external_lineage` ✅ (now consistent)

### 2. **Simplicity**
- No need to manage opaque page tokens
- Simple integer page counter (0, 1, 2, ...)
- Easy to jump to specific pages

### 3. **Predictability**
- `limit` parameter clearly defines page size
- `page` parameter clearly defines position
- `has_more` clearly indicates if more results exist

### 4. **Better UX for Agents**
- Easier for AI agents to understand and use
- Clear mental model: "give me page N with M items per page"
- Natural language maps well: "show me the next 25 relationships"

## Migration Guide

### For Tool Users

If you were using the old API:

**Old Code:**
```python
# First call
result1 = list_external_lineage(..., page_size=25, page_token=None)
next_token = result1.page_token  # This never existed!

# Second call (wouldn't work with old API)
result2 = list_external_lineage(..., page_size=25, page_token=next_token)
```

**New Code:**
```python
# First call
result1 = list_external_lineage(..., limit=25, page=0)

# Second call
result2 = list_external_lineage(..., limit=25, page=1)

# Check if more pages
if result2.has_more:
    result3 = list_external_lineage(..., limit=25, page=2)
```

### Breaking Changes

⚠️ **Parameter names changed:**
- `page_size` → `limit`
- `page_token` → `page`

⚠️ **Behavior changed:**
- `has_more` now accurately reflects if more results exist (was always `False` before)

## Testing

### Test Cases

1. **Single page of results**
   - Request with `limit=100`, results < 100
   - Verify `has_more=False`

2. **Multiple pages of results**
   - Request with `limit=10`, results > 10
   - Verify `has_more=True` on first page
   - Verify `has_more=False` on last page

3. **Empty results**
   - Request for object with no lineage
   - Verify `count=0`, `has_more=False`

4. **Different page sizes**
   - Test with `limit=1, 10, 25, 50, 100`
   - Verify correct pagination behavior

5. **Page out of bounds**
   - Request `page=999` for object with 10 results
   - Verify `count=0`, `has_more=False`

## Files Modified

- `copilotkit-pydantic/first-party-mcp-servers/databricks/tools/unity_catalog/external_lineage.py`
  - Added `from itertools import islice` import
  - Changed function signature: `page_size/page_token` → `limit/page`
  - Updated implementation to use `islice` pagination
  - Enhanced docstring with pagination details and examples
  - Added `has_more` detection logic

## Related Documentation

- See `list_catalogs()` in `catalogs.py` for reference pagination implementation
- See `list_tables()` in `tables.py` for similar pagination pattern
- See `DATABRICKS_EXTERNAL_LINEAGE_FIX.md` for related type handling fixes

## Future Considerations

1. **Consider caching**: Multiple page requests could benefit from result caching
2. **Performance**: For large lineage graphs, consider adding filters to reduce result set
3. **Batch operations**: Consider adding a "get all" convenience function that handles pagination internally
