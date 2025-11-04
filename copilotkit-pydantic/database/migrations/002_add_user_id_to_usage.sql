-- Migration: Add user_id column to usage table
-- Description: Adds user_id column to track which user generated the usage event

-- Add user_id column
ALTER TABLE usage ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Create index on user_id for efficient queries
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage(user_id);

-- Add comment for documentation
COMMENT ON COLUMN usage.user_id IS 'User ID from authentication system who triggered this usage event';

