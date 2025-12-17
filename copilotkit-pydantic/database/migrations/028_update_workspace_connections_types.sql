-- Migration: Update workspace_connections constraint for cloud storage
-- Description: Add support for additional OAuth2 connection types (Dropbox, Google Drive, OneDrive, Outlook)

-- Drop the existing constraint
ALTER TABLE workspace_connections DROP CONSTRAINT IF EXISTS workspace_connections_type_chk;

-- Add updated constraint with all supported OAuth2 services
ALTER TABLE workspace_connections 
  ADD CONSTRAINT workspace_connections_type_chk 
  CHECK (connection_type IN (
    'oauth2_gmail',
    'oauth2_outlook',
    'oauth2_slack',
    'oauth2_google-drive',
    'oauth2_onedrive',
    'oauth2_dropbox',
    'api_key'
  ));

-- ============================================================================
-- Migration complete
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Updated workspace_connections constraint to support cloud storage OAuth';
    RAISE NOTICE '✅ Added connection types: oauth2_outlook, oauth2_google-drive, oauth2_onedrive, oauth2_dropbox';
END $$;

