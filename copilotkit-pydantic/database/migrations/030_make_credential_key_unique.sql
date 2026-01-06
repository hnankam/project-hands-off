-- Migration: Make credential key globally unique
-- Description: The key column is used as the credential identifier in MCP servers.
--              It must be globally unique so credentials can be looked up by key.

-- First, update any empty or NULL keys to use the UUID id as a fallback
UPDATE workspace_credentials 
SET key = id::text 
WHERE key IS NULL OR key = '';

-- Make key column NOT NULL
ALTER TABLE workspace_credentials 
ALTER COLUMN key SET NOT NULL;

-- Add unique constraint on key column
-- This ensures credential keys are globally unique across all users
ALTER TABLE workspace_credentials 
ADD CONSTRAINT workspace_credentials_key_unique UNIQUE (key);

-- Add index for key lookups (used by credential_resolver)
CREATE INDEX IF NOT EXISTS idx_workspace_credentials_key ON workspace_credentials(key);

