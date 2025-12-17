-- Migration: Add workspace tables for personal resources
-- Description: Introduces personal workspace for files, notes, and API connections

-- ============================================================================
-- Personal workspace files (uploaded by individual users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspace_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    
    file_name VARCHAR(500) NOT NULL,
    file_type VARCHAR(100) NOT NULL, -- MIME type
    file_size BIGINT NOT NULL, -- bytes
    storage_url TEXT NOT NULL, -- Firebase Storage URL
    
    -- Text extraction for searchability
    extracted_text TEXT,
    page_count INTEGER,
    
    -- Organization
    folder VARCHAR(255) DEFAULT 'root',
    tags TEXT[], -- User-defined tags
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Personal notes created by users
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspace_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    
    -- Organization
    folder VARCHAR(255) DEFAULT 'root',
    tags TEXT[],
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Personal API connections (user's own API keys and OAuth tokens)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspace_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    
    connection_name VARCHAR(255) NOT NULL,
    connection_type VARCHAR(50) NOT NULL, -- 'oauth2_gmail', 'oauth2_slack', 'api_key'
    service_name VARCHAR(100) NOT NULL, -- 'gmail', 'slack', etc.
    
    -- Encrypted credentials (access token, refresh token, API keys)
    encrypted_credentials BYTEA NOT NULL,
    
    -- OAuth2 specific fields
    token_expires_at TIMESTAMP,
    scopes TEXT[], -- OAuth scopes granted
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    last_used_at TIMESTAMP,
    last_sync_at TIMESTAMP,
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT workspace_connections_type_chk 
        CHECK (connection_type IN ('oauth2_gmail', 'oauth2_slack', 'api_key'))
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================

-- workspace_files indexes
CREATE INDEX IF NOT EXISTS idx_workspace_files_user ON workspace_files(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_files_created ON workspace_files(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_files_tags ON workspace_files USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_workspace_files_text_search ON workspace_files USING gin(to_tsvector('english', COALESCE(extracted_text, '')));
CREATE INDEX IF NOT EXISTS idx_workspace_files_folder ON workspace_files(user_id, folder);

-- workspace_notes indexes
CREATE INDEX IF NOT EXISTS idx_workspace_notes_user ON workspace_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_created ON workspace_notes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_updated ON workspace_notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_tags ON workspace_notes USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_text_search ON workspace_notes USING gin(to_tsvector('english', title || ' ' || content));
CREATE INDEX IF NOT EXISTS idx_workspace_notes_folder ON workspace_notes(user_id, folder);

-- workspace_connections indexes
CREATE INDEX IF NOT EXISTS idx_workspace_connections_user ON workspace_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_connections_service ON workspace_connections(user_id, service_name);
CREATE INDEX IF NOT EXISTS idx_workspace_connections_status ON workspace_connections(user_id, status);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================

CREATE TRIGGER update_workspace_files_updated_at 
    BEFORE UPDATE ON workspace_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workspace_notes_updated_at 
    BEFORE UPDATE ON workspace_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workspace_connections_updated_at 
    BEFORE UPDATE ON workspace_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE workspace_files IS 'Personal files uploaded by users (PDFs, documents, images)';
COMMENT ON TABLE workspace_notes IS 'Personal notes created and managed by users';
COMMENT ON TABLE workspace_connections IS 'Personal API connections and OAuth tokens for external services';

COMMENT ON COLUMN workspace_files.extracted_text IS 'Text content extracted from files for search';
COMMENT ON COLUMN workspace_connections.encrypted_credentials IS 'AES-256-GCM encrypted credentials (access tokens, refresh tokens, API keys)';
COMMENT ON COLUMN workspace_connections.scopes IS 'OAuth scopes granted by user';

-- ============================================================================
-- Seed workspace tool definitions
-- ============================================================================

-- Backend workspace tools (global scope, no organization)
-- Only insert if they don't already exist (check by tool_key)
DO $$
BEGIN
    -- search_workspace_files
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'search_workspace_files') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('search_workspace_files', 'Search Workspace Files', 'backend', 'Search user''s uploaded files by name or content', true, NULL);
    END IF;
    
    -- get_file_content
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'get_file_content') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('get_file_content', 'Get File Content', 'backend', 'Get full text content from an uploaded file', true, NULL);
    END IF;
    
    -- search_workspace_notes
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'search_workspace_notes') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('search_workspace_notes', 'Search Workspace Notes', 'backend', 'Search user''s personal notes by title or content', true, NULL);
    END IF;
    
    -- get_note_content
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'get_note_content') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('get_note_content', 'Get Note Content', 'backend', 'Get full content of a personal note', true, NULL);
    END IF;
    
    -- search_user_emails
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'search_user_emails') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('search_user_emails', 'Search User Emails', 'backend', 'Search user''s Gmail emails (requires Gmail connection)', true, NULL);
    END IF;
    
    -- search_user_slack
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'search_user_slack') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('search_user_slack', 'Search User Slack', 'backend', 'Search user''s Slack messages (requires Slack connection)', true, NULL);
    END IF;
END $$;

-- ============================================================================
-- Migration complete
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Added workspace tables (workspace_files, workspace_notes, workspace_connections)';
    RAISE NOTICE '✅ Added workspace tool definitions (search_workspace_files, get_file_content, etc.)';
END $$;

