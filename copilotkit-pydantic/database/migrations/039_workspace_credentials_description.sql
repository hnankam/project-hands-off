-- Migration: Optional description on workspace_credentials
-- Description: User-visible notes for credentials (not used for resolution).

ALTER TABLE workspace_credentials
ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN workspace_credentials.description IS 'Optional user-facing description; stored in plaintext.';
