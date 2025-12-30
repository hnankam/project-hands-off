-- ============================================================================
-- Message Deletion Support
-- ============================================================================
-- 
-- This migration adds support for tracking deleted messages in threads.
-- Deleted message IDs are stored separately and filtered during event loading.
--
-- Usage:
--   psql -U your_user -d your_database -f 002_add_message_deletion.sql
--
-- ============================================================================

-- ============================================================================
-- Table: agent_deleted_messages
-- Purpose: Tracks deleted message IDs per thread for filtering during load
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_deleted_messages (
  -- Primary Key
  id BIGSERIAL PRIMARY KEY,
  
  -- Foreign Keys
  thread_id VARCHAR(255) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  
  -- Metadata
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one deletion record per thread+message
  UNIQUE(thread_id, message_id),
  
  -- Foreign Key Constraints
  CONSTRAINT fk_thread_deleted 
    FOREIGN KEY (thread_id) 
    REFERENCES agent_threads(thread_id) 
    ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_deleted_messages_thread 
  ON agent_deleted_messages(thread_id);

CREATE INDEX IF NOT EXISTS idx_deleted_messages_message_id 
  ON agent_deleted_messages(message_id);

CREATE INDEX IF NOT EXISTS idx_deleted_messages_deleted_at 
  ON agent_deleted_messages(deleted_at DESC);

COMMENT ON TABLE agent_deleted_messages IS 'Tracks deleted message IDs per thread for filtering during event loading';
COMMENT ON COLUMN agent_deleted_messages.thread_id IS 'Thread identifier';
COMMENT ON COLUMN agent_deleted_messages.message_id IS 'Deleted message identifier';
COMMENT ON COLUMN agent_deleted_messages.deleted_at IS 'Timestamp when message was deleted';

