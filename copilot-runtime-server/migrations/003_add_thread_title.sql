-- Add metadata JSONB column to agent_threads for extensible thread data
-- Enables storing user-chosen session names (metadata.title) for restore after extension reinstall

ALTER TABLE agent_threads ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN agent_threads.metadata IS 'Extensible thread metadata (e.g. title for user-chosen session name)';
