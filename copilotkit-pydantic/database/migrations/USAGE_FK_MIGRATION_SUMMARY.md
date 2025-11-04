# Usage Table Foreign Key Constraints - Migration Summary

## Overview
Added foreign key constraints to the `usage` table to ensure referential integrity with related tables (`agents`, `models`, and `user`).

## Migrations Applied

### 1. Migration 004: Agent and Model FK Constraints
**File:** `004_add_usage_fk_constraints.sql`

**Changes:**
- Converted `agent_id` column from `VARCHAR(100)` to `UUID`
- Converted `model_id` column from `VARCHAR(100)` to `UUID`
- Added FK constraint: `fk_usage_agent` → `agents(id)` ON DELETE SET NULL
- Added FK constraint: `fk_usage_model` → `models(id)` ON DELETE SET NULL
- Created indexes: `idx_usage_agent_id`, `idx_usage_model_id`

### 2. Migration 005: User FK Constraint
**File:** `005_add_usage_user_fk_constraint.sql`

**Changes:**
- Added FK constraint: `fk_usage_user` → `user(id)` ON DELETE SET NULL
- Created index: `idx_usage_user_id`

## Final Schema

```sql
CREATE TABLE usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
    team_id TEXT REFERENCES team(id) ON DELETE SET NULL,
    request_tokens INTEGER,
    response_tokens INTEGER,
    usage_details JSONB,
    cost DECIMAL(10, 6),
    duration_ms INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

## Foreign Key Constraints Summary

| Constraint Name | Column | References | On Delete |
|----------------|--------|------------|-----------|
| `fk_usage_agent` | `agent_id` | `agents(id)` | SET NULL |
| `fk_usage_model` | `model_id` | `models(id)` | SET NULL |
| `fk_usage_user` | `user_id` | `user(id)` | SET NULL |
| `usage_organization_id_fkey` | `organization_id` | `organization(id)` | SET NULL |
| `usage_team_id_fkey` | `team_id` | `team(id)` | SET NULL |

## Code Changes

### Backend Changes (`usage_tracker.py`)
- Updated `create_usage_tracking_callback()` to accept `agent_id: str` and `model_id: str` (now UUIDs)
- Added `agent_label` and `model_label` parameters for human-readable telemetry
- Convert UUIDs to strings in `usage_data` dict before WebSocket broadcast (prevents JSON serialization errors)

### API Route Changes (`api/routes.py`)
- Added database queries to resolve agent/model UUIDs from `agent_type` and `model_key`
- Queries respect organizational/team scope precedence (team → org → global)
- Falls back to using type/key strings if resolution fails
- Passes both resolved IDs and human-readable labels to the usage tracker

## Benefits

1. **Data Integrity:** Ensures usage records only reference valid agents, models, and users
2. **Cascading Behavior:** When an agent, model, or user is deleted, related usage records have their FK set to NULL (preserving historical data)
3. **Query Performance:** Indexes on FK columns improve join performance
4. **Analytics:** Can now reliably aggregate usage data by agent, model, or user with proper joins

## Testing Recommendations

1. Verify usage events are being recorded with UUID values:
   ```sql
   SELECT agent_id, model_id, user_id, request_tokens, response_tokens, usage_details
   FROM usage
   ORDER BY created_at DESC
   LIMIT 5;
   ```

2. Test that usage tracking still works after agent/model deletion:
   ```sql
   -- Check that usage records are preserved with NULL FKs
   SELECT COUNT(*) FROM usage WHERE agent_id IS NULL OR model_id IS NULL;
   ```

3. Verify WebSocket broadcasting includes UUID strings (not objects)

4. Test usage analytics queries with joins:
   ```sql
   SELECT 
       a.agent_name,
       m.model_name,
       u.name as user_name,
       SUM(ug.request_tokens) as total_input,
       SUM(ug.response_tokens) as total_output
   FROM usage ug
   LEFT JOIN agents a ON ug.agent_id = a.id
   LEFT JOIN models m ON ug.model_id = m.id
   LEFT JOIN "user" u ON ug.user_id = u.id
   WHERE ug.created_at > NOW() - INTERVAL '7 days'
   GROUP BY a.agent_name, m.model_name, u.name
   ORDER BY total_output DESC;
   ```

## Rollback Instructions

If you need to rollback these changes:

```sql
-- Drop FK constraints
ALTER TABLE usage DROP CONSTRAINT IF EXISTS fk_usage_agent;
ALTER TABLE usage DROP CONSTRAINT IF EXISTS fk_usage_model;
ALTER TABLE usage DROP CONSTRAINT IF EXISTS fk_usage_user;

-- Optionally convert columns back to VARCHAR (will lose UUID precision)
ALTER TABLE usage ALTER COLUMN agent_id TYPE VARCHAR(100);
ALTER TABLE usage ALTER COLUMN model_id TYPE VARCHAR(100);
```

**Note:** Rollback will not restore the old string-based agent/model identifiers. You would need to repopulate from backups if needed.

