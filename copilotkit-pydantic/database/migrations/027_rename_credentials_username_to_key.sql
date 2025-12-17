-- Migration: Rename username column to key in workspace_credentials
-- Description: Rename the username column to key for better clarity

-- Rename the column
ALTER TABLE workspace_credentials RENAME COLUMN username TO key;

