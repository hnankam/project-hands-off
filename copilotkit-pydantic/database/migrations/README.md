# Database Migrations

This directory contains SQL migration scripts for upgrading the database schema.

## Migration Files

- `001_add_multi_tenancy_and_rename_usage.sql` - Adds multi-tenancy support (organization_id, team_id) to all configuration tables and renames usage_logs to usage

## Running Migrations

### Prerequisites

1. Ensure you have PostgreSQL client tools installed (`psql`)
2. Have your database connection details ready
3. **Backup your database before running migrations!**

### Method 1: Using psql Command Line

```bash
# Set your database connection string
export DATABASE_URL="postgresql://username:password@host:port/database?sslmode=require"

# Run the migration
psql $DATABASE_URL -f migrations/001_add_multi_tenancy_and_rename_usage.sql
```

### Method 2: Using psql Interactive Mode

```bash
# Connect to your database
psql "postgresql://username:password@host:port/database?sslmode=require"

# Run the migration file
\i copilotkit-pydantic/database/migrations/001_add_multi_tenancy_and_rename_usage.sql

# Or if already in the migrations directory
\i 001_add_multi_tenancy_and_rename_usage.sql
```

### Method 3: Using Python (Recommended for Production)

Create a migration runner script:

```python
# run_migration.py
import asyncio
import psycopg
from pathlib import Path
from config.environment import get_database_url

async def run_migration():
    """Run database migration."""
    migration_file = Path(__file__).parent / 'migrations' / '001_add_multi_tenancy_and_rename_usage.sql'
    
    print(f"Reading migration file: {migration_file}")
    with open(migration_file, 'r') as f:
        migration_sql = f.read()
    
    database_url = get_database_url()
    print(f"Connecting to database...")
    
    async with await psycopg.AsyncConnection.connect(database_url) as conn:
        async with conn.cursor() as cur:
            print("Executing migration...")
            await cur.execute(migration_sql)
            await conn.commit()
            print("✅ Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(run_migration())
```

Then run:

```bash
cd copilotkit-pydantic
python run_migration.py
```

### Method 4: Quick Command (Copy-Paste)

**For Development/Testing:**

```bash
# Replace with your actual database URL
psql "postgresql://username:password@host:port/database?sslmode=require" \
  -f copilotkit-pydantic/database/migrations/001_add_multi_tenancy_and_rename_usage.sql
```

**For Neon/Serverless Postgres:**

```bash
psql "postgresql://username:password@ep-xxx-xxx.region.aws.neon.tech/database?sslmode=require" \
  -f copilotkit-pydantic/database/migrations/001_add_multi_tenancy_and_rename_usage.sql
```

## What This Migration Does

### 1. Adds Multi-Tenancy Support

Adds `organization_id` and `team_id` columns to:
- `providers`
- `models`
- `agents`
- `base_instructions`

These columns reference the `organizations` and `teams` tables from Better Auth.

### 2. Renames usage_logs to usage

- Renames the `usage_logs` table to `usage`
- Adds `organization_id` and `team_id` columns
- Preserves existing `session_id` column for session tracking
- Maintains all existing data

### 3. Column Order Preservation

The migration recreates tables to ensure column order matches the new schema exactly, as if tables were created fresh.

### 4. Index Optimization

Creates indexes on new columns for efficient filtering:
- `idx_providers_org`, `idx_providers_team`
- `idx_models_org`, `idx_models_team`
- `idx_agents_org`, `idx_agents_team`
- `idx_usage_org`, `idx_usage_team`

### 5. Trigger Maintenance

Recreates all `updated_at` triggers to ensure they work with the new table structure.

## Verification

After running the migration, verify it succeeded:

```sql
-- Check providers table structure
\d providers

-- Check models table structure
\d models

-- Check agents table structure
\d agents

-- Check usage table exists (not usage_logs)
\dt usage

-- Check indexes were created
\di idx_providers_org
\di idx_models_org
\di idx_agents_org
\di idx_usage_org

-- Verify data integrity
SELECT COUNT(*) FROM providers;
SELECT COUNT(*) FROM models;
SELECT COUNT(*) FROM agents;
SELECT COUNT(*) FROM usage;
```

## Rollback (Emergency Only)

⚠️ **Warning: Rollback will lose organization and team associations!**

If you need to rollback:

```sql
-- This will remove the new columns
ALTER TABLE providers DROP COLUMN IF EXISTS organization_id CASCADE;
ALTER TABLE providers DROP COLUMN IF EXISTS team_id CASCADE;
ALTER TABLE models DROP COLUMN IF EXISTS organization_id CASCADE;
ALTER TABLE models DROP COLUMN IF EXISTS team_id CASCADE;
ALTER TABLE agents DROP COLUMN IF EXISTS organization_id CASCADE;
ALTER TABLE agents DROP COLUMN IF EXISTS team_id CASCADE;
ALTER TABLE base_instructions DROP COLUMN IF EXISTS organization_id CASCADE;
ALTER TABLE base_instructions DROP COLUMN IF EXISTS team_id CASCADE;

-- To rollback usage rename (only if needed)
ALTER TABLE usage RENAME TO usage_logs;
ALTER TABLE usage_logs DROP COLUMN IF EXISTS organization_id CASCADE;
ALTER TABLE usage_logs DROP COLUMN IF EXISTS team_id CASCADE;
```

## Troubleshooting

### Error: relation "organizations" does not exist

**Solution:** You need to run the Better Auth schema first:

```bash
psql $DATABASE_URL -f copilot-runtime-server/scripts/better-auth-schema.sql
```

### Error: permission denied

**Solution:** Ensure your database user has sufficient privileges:

```sql
-- Grant necessary permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

### Migration hangs or times out

**Solution:** 
- Check if there are long-running queries blocking the migration
- Ensure no active connections are using the tables being modified
- Try running during low-traffic periods

### Data appears missing after migration

**Solution:**
- The migration preserves all data
- If data seems missing, check the new table names (usage vs usage_logs)
- Verify with: `SELECT COUNT(*) FROM usage;`

## Next Steps

After successful migration:

1. **Update application code** to use the new `usage` table name
2. **Restart services** to pick up the new schema
3. **Test multi-tenancy** by setting organization_id and team_id values
4. **Monitor logs** for any schema-related errors
5. **Set up analytics** using the new org/team/session columns

## Support

For issues or questions:
- Check the main README: `/copilotkit-pydantic/database/README.md`
- Review the schema: `/copilotkit-pydantic/database/schema.sql`
- Check application logs for errors

