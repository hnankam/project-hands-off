-- Migration: Refactor usage table columns
-- Description: 
--   1. Rename agent_type to agent_id
--   2. Rename model_key to model_id
--   3. Remove total_tokens (can be calculated)
--   4. Add usage_details JSONB column for provider-specific details

-- Rename columns
ALTER TABLE usage RENAME COLUMN agent_type TO agent_id;
ALTER TABLE usage RENAME COLUMN model_key TO model_id;

-- Add usage_details column
ALTER TABLE usage ADD COLUMN IF NOT EXISTS usage_details JSONB;

-- Drop total_tokens column
ALTER TABLE usage DROP COLUMN IF EXISTS total_tokens;

-- Update index to use new column name
DROP INDEX IF EXISTS idx_usage_agent_model;
CREATE INDEX IF NOT EXISTS idx_usage_agent_model ON usage(agent_id, model_id);

-- Add comment for documentation
COMMENT ON COLUMN usage.agent_id IS 'Agent identifier';
COMMENT ON COLUMN usage.model_id IS 'Model identifier';
COMMENT ON COLUMN usage.usage_details IS 'Provider-specific usage details (cache tokens, etc.)';

