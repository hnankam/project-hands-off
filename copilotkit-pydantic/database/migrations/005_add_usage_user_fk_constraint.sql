-- Migration: Add foreign key constraint for user_id in usage table
-- This ensures referential integrity between usage records and their corresponding users

-- Add foreign key constraint for user_id
ALTER TABLE usage
ADD CONSTRAINT fk_usage_user
FOREIGN KEY (user_id)
REFERENCES "user"(id)
ON DELETE SET NULL;

-- Create index to improve query performance on FK column (if not already exists)
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage(user_id);

-- Add a comment to document the constraint
COMMENT ON CONSTRAINT fk_usage_user ON usage IS 'Foreign key to user table, set to NULL on user deletion';

