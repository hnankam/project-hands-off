-- Migration: Add workspace credentials table
-- Description: Table for storing encrypted user credentials (API keys, passwords, etc.)

-- Create workspace_credentials table
CREATE TABLE IF NOT EXISTS workspace_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  key TEXT,
  encrypted_data TEXT, -- Contains encrypted password/secret (nullable for optional fields)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_workspace_credentials_user ON workspace_credentials(user_id);
CREATE INDEX idx_workspace_credentials_type ON workspace_credentials(user_id, type);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_workspace_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspace_credentials_updated_at
  BEFORE UPDATE ON workspace_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_credentials_updated_at();

