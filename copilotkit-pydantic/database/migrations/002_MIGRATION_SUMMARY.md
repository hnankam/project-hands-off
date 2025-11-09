# Migration 002: Remove total_tokens Column

## Overview
This migration removes the redundant `total_tokens` column from the `usage` table, as it can be calculated from `request_tokens + response_tokens`.

## Changes Made

### 1. Database Schema Changes
- ✅ Removed `total_tokens` column from `usage` table
- ✅ Created `usage_with_totals` view for backward compatibility
  - The view includes a computed `total_tokens` column: `(COALESCE(request_tokens, 0) + COALESCE(response_tokens, 0))`

### 2. Code Changes

#### `/copilotkit-pydantic/services/usage_tracker.py`
- Updated `_persist_usage_event()` function signature:
  - Removed `total_tokens: int` parameter
  - Removed `total_tokens` from INSERT statement
- Updated `create_usage_tracking_callback()`:
  - Removed `total_tokens=total_tokens` from persist call
- Updated `log_usage_failure()`:
  - Removed `total_tokens=0` from persist call

## Migration Status
✅ **Successfully Applied** - 2025-11-08

## Verification
- 919 existing usage records remain intact
- View `usage_with_totals` provides computed totals for queries that need it
- Application code updated to match new schema

## Backward Compatibility
The `usage_with_totals` view provides backward compatibility for any queries that expect a `total_tokens` column:

```sql
-- Old code can query the view instead of the table
SELECT total_tokens FROM usage_with_totals WHERE session_id = 'xyz';
```

## Benefits
1. **Reduced redundancy**: No duplicate data storage
2. **Data consistency**: Total always matches request + response
3. **Simplified maintenance**: One less column to manage
4. **Storage savings**: Smaller table size (one fewer integer column per row)

## Rollback
If needed, rollback can be performed with:

```sql
BEGIN;
ALTER TABLE usage ADD COLUMN total_tokens INTEGER;
UPDATE usage SET total_tokens = COALESCE(request_tokens, 0) + COALESCE(response_tokens, 0);
DROP VIEW IF EXISTS usage_with_totals;
COMMIT;
```

## Next Steps
1. ✅ Migration applied successfully
2. ✅ Code updated to remove total_tokens references
3. Monitor application logs for any issues
4. Consider using `usage_with_totals` view if needed for reporting

