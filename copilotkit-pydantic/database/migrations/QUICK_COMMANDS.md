# Quick Migration Commands

## 🚀 Run Migration Now

### Copy-Paste Command (Local Development)

```bash
# From project root
psql $DATABASE_URL -f copilotkit-pydantic/database/migrations/001_add_multi_tenancy_and_rename_usage.sql
```

### For Neon Database

```bash
# Replace YOUR_* placeholders with actual values
psql "postgresql://YOUR_USERNAME:YOUR_PASSWORD@YOUR_HOST.neon.tech/YOUR_DATABASE?sslmode=require" \
  -f copilotkit-pydantic/database/migrations/001_add_multi_tenancy_and_rename_usage.sql
```

### Example with Real Connection String

```bash
# If your DATABASE_URL is already set in environment
echo $DATABASE_URL  # Verify it's set
psql "$DATABASE_URL" -f copilotkit-pydantic/database/migrations/001_add_multi_tenancy_and_rename_usage.sql
```

## 📋 Pre-Migration Checklist

- [ ] **Backup database** (Required!)
- [ ] Better Auth schema is installed (`organizations`, `teams` tables exist)
- [ ] No active transactions or long-running queries
- [ ] Database user has ALTER TABLE permissions

## ✅ Post-Migration Verification

```bash
# Connect to database
psql $DATABASE_URL

# Then run these checks:
```

```sql
-- 1. Verify new columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'providers' AND column_name IN ('organization_id', 'team_id');

-- 2. Verify usage table exists (not usage_logs)
SELECT COUNT(*) FROM usage;

-- 3. Check all indexes were created
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('providers', 'models', 'agents', 'usage') 
  AND indexname LIKE '%_org' OR indexname LIKE '%_team';

-- 4. Verify data counts match
SELECT 
  (SELECT COUNT(*) FROM providers) as providers_count,
  (SELECT COUNT(*) FROM models) as models_count,
  (SELECT COUNT(*) FROM agents) as agents_count,
  (SELECT COUNT(*) FROM usage) as usage_count;
```

## 🔄 Restart Services After Migration

```bash
# Restart Python backend
cd copilotkit-pydantic
pkill -f "python main.py" || true
python main.py

# Restart Node.js runtime server
cd copilot-runtime-server
npm restart
```

## 📊 Test Multi-Tenancy

```sql
-- Set organization for a provider
UPDATE providers 
SET organization_id = 'your-org-id' 
WHERE provider_key = 'anthropic';

-- Set team for a model
UPDATE models 
SET team_id = 'your-team-id' 
WHERE model_key = 'claude-4.5-haiku';

-- Verify filtering works
SELECT model_key, organization_id, team_id, enabled 
FROM models 
WHERE organization_id = 'your-org-id';
```

## 🆘 Emergency Rollback

**⚠️ Only use if migration fails!**

```sql
-- Rollback multi-tenancy columns
ALTER TABLE providers DROP COLUMN organization_id CASCADE, DROP COLUMN team_id CASCADE;
ALTER TABLE models DROP COLUMN organization_id CASCADE, DROP COLUMN team_id CASCADE;
ALTER TABLE agents DROP COLUMN organization_id CASCADE, DROP COLUMN team_id CASCADE;
ALTER TABLE base_instructions DROP COLUMN organization_id CASCADE, DROP COLUMN team_id CASCADE;

-- Rollback usage rename (if needed)
ALTER TABLE usage RENAME TO usage_logs;
ALTER TABLE usage_logs DROP COLUMN organization_id CASCADE, DROP COLUMN team_id CASCADE;
```

## 📞 Common Issues & Fixes

### Issue: "relation 'organizations' does not exist"

```bash
# Install Better Auth schema first
psql $DATABASE_URL -f copilot-runtime-server/scripts/better-auth-schema.sql
# Then re-run migration
psql $DATABASE_URL -f copilotkit-pydantic/database/migrations/001_add_multi_tenancy_and_rename_usage.sql
```

### Issue: "permission denied for table"

```sql
-- Grant permissions (run as superuser)
GRANT ALL ON ALL TABLES IN SCHEMA public TO your_username;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO your_username;
```

### Issue: Migration hangs

```sql
-- Check for blocking queries (in another terminal)
SELECT pid, query, state, wait_event_type, wait_event
FROM pg_stat_activity
WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%';

-- Kill blocking queries if needed
SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
WHERE state = 'active' AND query LIKE '%providers%';
```

## 🎯 One-Liner for Production

```bash
# Backup, migrate, verify in one go
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql && \
psql $DATABASE_URL -f copilotkit-pydantic/database/migrations/001_add_multi_tenancy_and_rename_usage.sql && \
psql $DATABASE_URL -c "SELECT 'Migration Success: ' || COUNT(*) || ' usage records' FROM usage;"
```

## 📝 Environment Variables

Set these before running commands:

```bash
# Example for local development
export DATABASE_URL="postgresql://user:password@localhost:5432/mydb"

# Example for Neon
export DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/mydb?sslmode=require"

# Verify it's set
echo $DATABASE_URL
```

