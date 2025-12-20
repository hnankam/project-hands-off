-- ============================================================================
-- PostgresAgentRunner Database Schema
-- ============================================================================
-- 
-- This migration creates the tables required for the PostgresAgentRunner
-- implementation, which replaces the InMemoryAgentRunner with persistent
-- storage in PostgreSQL.
--
-- Tables:
--   - agent_threads: Thread-level state (lightweight, frequently updated)
--   - agent_runs: Run-level history (append-only, rarely updated after completion)
--   - agent_messages: Message storage (separate from events for efficient querying)
--
-- Multi-tenancy:
--   - All threads are scoped to organization_id and team_id
--   - Foreign keys ensure referential integrity
--   - Indexes optimize tenant-scoped queries
--
-- Performance:
--   - Strategic indexes on frequently queried columns
--   - JSONB for flexible event storage
--   - Cascade deletes for automatic cleanup
--
-- Usage:
--   psql -U your_user -d your_database -f 001_create_agent_runner_tables.sql
--
-- ============================================================================

-- ============================================================================
-- Table: agent_threads
-- Purpose: Stores thread-level state (current run status, metadata)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_threads (
  -- Primary Key
  thread_id VARCHAR(255) PRIMARY KEY,
  
  -- Multi-tenancy (using VARCHAR to support various ID formats: UUID, nanoid, etc.)
  organization_id VARCHAR(255),
  team_id VARCHAR(255),
  user_id VARCHAR(255),
  session_id VARCHAR(255),
  
  -- Current Run State
  is_running BOOLEAN NOT NULL DEFAULT FALSE,
  current_run_id VARCHAR(255),
  stop_requested BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Agent Context
  agent_id VARCHAR(255) NOT NULL DEFAULT 'dynamic_agent',
  agent_type VARCHAR(100),
  model_type VARCHAR(100),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for agent_threads
CREATE INDEX IF NOT EXISTS idx_agent_threads_org 
  ON agent_threads(organization_id) 
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_threads_team 
  ON agent_threads(team_id) 
  WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_threads_user 
  ON agent_threads(user_id);

CREATE INDEX IF NOT EXISTS idx_agent_threads_running 
  ON agent_threads(is_running) 
  WHERE is_running = TRUE;

CREATE INDEX IF NOT EXISTS idx_agent_threads_last_accessed 
  ON agent_threads(last_accessed_at);

COMMENT ON TABLE agent_threads IS 'Thread-level state for agent execution';
COMMENT ON COLUMN agent_threads.thread_id IS 'Unique thread identifier (typically from frontend)';
COMMENT ON COLUMN agent_threads.is_running IS 'Whether thread is currently executing';
COMMENT ON COLUMN agent_threads.current_run_id IS 'ID of the currently executing run';
COMMENT ON COLUMN agent_threads.stop_requested IS 'Whether a stop has been requested';
COMMENT ON COLUMN agent_threads.last_accessed_at IS 'Last access time for cleanup';

-- ============================================================================
-- Table: agent_runs
-- Purpose: Stores run-level history (events, status, timing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_runs (
  -- Primary Key
  id SERIAL PRIMARY KEY,
  run_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Foreign Keys
  thread_id VARCHAR(255) NOT NULL,
  parent_run_id VARCHAR(255),
  
  -- Run Metadata
  status VARCHAR(50) NOT NULL DEFAULT 'running',  -- running, completed, stopped, error
  events JSONB NOT NULL DEFAULT '[]'::jsonb,      -- Compacted events array
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Foreign Key Constraints
  CONSTRAINT fk_thread 
    FOREIGN KEY (thread_id) 
    REFERENCES agent_threads(thread_id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_parent_run 
    FOREIGN KEY (parent_run_id) 
    REFERENCES agent_runs(run_id) 
    ON DELETE SET NULL,
    
  -- Check Constraints
  CONSTRAINT chk_status 
    CHECK (status IN ('running', 'completed', 'stopped', 'error'))
);

-- Indexes for agent_runs
CREATE INDEX IF NOT EXISTS idx_agent_runs_thread 
  ON agent_runs(thread_id);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status 
  ON agent_runs(status);

CREATE INDEX IF NOT EXISTS idx_agent_runs_created 
  ON agent_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_run_id 
  ON agent_runs(run_id);

-- GIN index for JSONB event queries (optional, for analytics)
CREATE INDEX IF NOT EXISTS idx_agent_runs_events_gin 
  ON agent_runs USING GIN (events);

COMMENT ON TABLE agent_runs IS 'Run-level history with compacted events';
COMMENT ON COLUMN agent_runs.run_id IS 'Unique run identifier (from AG-UI protocol)';
COMMENT ON COLUMN agent_runs.status IS 'Run status: running, completed, stopped, or error';
COMMENT ON COLUMN agent_runs.events IS 'Compacted event stream (JSONB array)';
COMMENT ON COLUMN agent_runs.parent_run_id IS 'Parent run ID for nested runs';

-- ============================================================================
-- Table: agent_messages
-- Purpose: Stores messages separately from events for efficient querying
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_messages (
  -- Primary Key
  id BIGSERIAL PRIMARY KEY,
  message_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Foreign Keys
  thread_id VARCHAR(255) NOT NULL,
  run_id VARCHAR(255),
  
  -- Message Data
  role VARCHAR(50) NOT NULL,  -- 'user', 'assistant', 'system', 'tool'
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign Key Constraints
  CONSTRAINT fk_thread_messages 
    FOREIGN KEY (thread_id) 
    REFERENCES agent_threads(thread_id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_run_messages 
    FOREIGN KEY (run_id) 
    REFERENCES agent_runs(run_id) 
    ON DELETE SET NULL,
    
  -- Check Constraints
  CONSTRAINT chk_role 
    CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);

-- Indexes for agent_messages
CREATE INDEX IF NOT EXISTS idx_agent_messages_thread 
  ON agent_messages(thread_id);

CREATE INDEX IF NOT EXISTS idx_agent_messages_run 
  ON agent_messages(run_id) 
  WHERE run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_messages_created 
  ON agent_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_messages_message_id 
  ON agent_messages(message_id);

CREATE INDEX IF NOT EXISTS idx_agent_messages_role 
  ON agent_messages(role);

-- Full-text search index on message content (optional)
CREATE INDEX IF NOT EXISTS idx_agent_messages_content_search 
  ON agent_messages USING GIN (to_tsvector('english', content));

COMMENT ON TABLE agent_messages IS 'Message storage separate from events for efficient querying';
COMMENT ON COLUMN agent_messages.message_id IS 'Unique message identifier (from AG-UI protocol)';
COMMENT ON COLUMN agent_messages.role IS 'Message role: user, assistant, system, or tool';
COMMENT ON COLUMN agent_messages.content IS 'Message content (text)';
COMMENT ON COLUMN agent_messages.metadata IS 'Additional message metadata (JSONB)';

-- ============================================================================
-- Functions & Triggers
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for agent_threads
DROP TRIGGER IF EXISTS update_agent_threads_updated_at ON agent_threads;
CREATE TRIGGER update_agent_threads_updated_at
  BEFORE UPDATE ON agent_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for agent_messages
DROP TRIGGER IF EXISTS update_agent_messages_updated_at ON agent_messages;
CREATE TRIGGER update_agent_messages_updated_at
  BEFORE UPDATE ON agent_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Grants (adjust as needed for your user/role setup)
-- ============================================================================

-- Example grants (uncomment and adjust for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON agent_threads TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON agent_runs TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON agent_messages TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE agent_runs_id_seq TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE agent_messages_id_seq TO your_app_user;

-- ============================================================================
-- Row-Level Security (Optional - for additional multi-tenancy protection)
-- ============================================================================

-- Uncomment to enable RLS
-- ALTER TABLE agent_threads ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (adjust for your auth setup)
-- CREATE POLICY tenant_isolation_threads ON agent_threads
--   USING (organization_id = current_setting('app.current_organization_id')::uuid);

-- CREATE POLICY tenant_isolation_runs ON agent_runs
--   USING (EXISTS (
--     SELECT 1 FROM agent_threads 
--     WHERE agent_threads.thread_id = agent_runs.thread_id 
--       AND agent_threads.organization_id = current_setting('app.current_organization_id')::uuid
--   ));

-- CREATE POLICY tenant_isolation_messages ON agent_messages
--   USING (EXISTS (
--     SELECT 1 FROM agent_threads 
--     WHERE agent_threads.thread_id = agent_messages.thread_id 
--       AND agent_threads.organization_id = current_setting('app.current_organization_id')::uuid
--   ));

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify tables were created
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('agent_threads', 'agent_runs', 'agent_messages')
ORDER BY table_name;

-- Verify indexes were created
SELECT tablename, indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('agent_threads', 'agent_runs', 'agent_messages')
ORDER BY tablename, indexname;

-- ============================================================================
-- Sample Queries (for reference)
-- ============================================================================

-- Get all threads for an organization
-- SELECT * FROM agent_threads 
-- WHERE organization_id = 'your-org-id' 
-- ORDER BY last_accessed_at DESC;

-- Get messages for a thread
-- SELECT message_id, role, content, created_at 
-- FROM agent_messages 
-- WHERE thread_id = 'your-thread-id' 
-- ORDER BY created_at ASC;

-- Get recent runs for a thread
-- SELECT run_id, status, created_at, completed_at 
-- FROM agent_runs 
-- WHERE thread_id = 'your-thread-id' 
-- ORDER BY created_at DESC 
-- LIMIT 10;

-- Get active threads
-- SELECT thread_id, agent_type, model_type, created_at 
-- FROM agent_threads 
-- WHERE is_running = TRUE;

-- Cleanup old threads (run periodically)
-- DELETE FROM agent_threads 
-- WHERE last_accessed_at < NOW() - INTERVAL '7 days' 
--   AND is_running = FALSE;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

