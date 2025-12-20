-- ============================================================================
-- PostgresAgentRunner Rollback Migration
-- ============================================================================
-- 
-- This migration rolls back the agent runner tables created by
-- 001_create_agent_runner_tables.sql
--
-- WARNING: This will delete all agent execution data!
--
-- Usage:
--   psql -U your_user -d your_database -f 001_rollback_agent_runner_tables.sql
--
-- ============================================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS update_agent_threads_updated_at ON agent_threads;
DROP TRIGGER IF EXISTS update_agent_messages_updated_at ON agent_messages;

-- Drop function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables in reverse order (respecting foreign keys)
DROP TABLE IF EXISTS agent_messages CASCADE;
DROP TABLE IF EXISTS agent_runs CASCADE;
DROP TABLE IF EXISTS agent_threads CASCADE;

-- Verify tables were dropped
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('agent_threads', 'agent_runs', 'agent_messages');

-- Should return no rows

