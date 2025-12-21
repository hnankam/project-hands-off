-- Migration: Update workspace tools
-- Description: Add new workspace management tools (folders, file operations, read/write)

-- ============================================================================
-- Remove deprecated tools that were removed from codebase
-- ============================================================================

-- Remove email/slack tools (not implemented)
DELETE FROM tools WHERE tool_key IN ('search_user_emails', 'search_user_slack');

-- Remove update_file_tags_tool (merged into file management)
DELETE FROM tools WHERE tool_key = 'update_file_tags';

-- ============================================================================
-- Add/Update workspace tools
-- ============================================================================

DO $$
BEGIN
    -- ========================================================================
    -- File Read Operations
    -- ========================================================================
    
    -- search_workspace_files (update description for pagination)
    IF EXISTS (SELECT 1 FROM tools WHERE tool_key = 'search_workspace_files' AND organization_id IS NULL) THEN
        UPDATE tools 
        SET description = 'Search user''s uploaded files by name or content with pagination support'
        WHERE tool_key = 'search_workspace_files' AND organization_id IS NULL;
    ELSE
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('search_workspace_files', 'Search Workspace Files', 'backend', 
                'Search user''s uploaded files by name or content with pagination support', true, NULL);
    END IF;
    
    -- get_file_content
    IF EXISTS (SELECT 1 FROM tools WHERE tool_key = 'get_file_content' AND organization_id IS NULL) THEN
        UPDATE tools 
        SET description = 'Get full text content from an uploaded file without truncation'
        WHERE tool_key = 'get_file_content' AND organization_id IS NULL;
    ELSE
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('get_file_content', 'Get File Content', 'backend', 
                'Get full text content from an uploaded file without truncation', true, NULL);
    END IF;
    
    -- get_file_metadata (NEW)
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'get_file_metadata') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('get_file_metadata', 'Get File Metadata', 'backend', 
                'Get file metadata without downloading full content', true, NULL);
    END IF;
    
    -- ========================================================================
    -- Note Operations
    -- ========================================================================
    
    -- search_workspace_notes (update description)
    IF EXISTS (SELECT 1 FROM tools WHERE tool_key = 'search_workspace_notes' AND organization_id IS NULL) THEN
        UPDATE tools 
        SET description = 'Search user''s personal notes by title or content'
        WHERE tool_key = 'search_workspace_notes' AND organization_id IS NULL;
    ELSE
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('search_workspace_notes', 'Search Workspace Notes', 'backend', 
                'Search user''s personal notes by title or content', true, NULL);
    END IF;
    
    -- get_note_content (update description)
    IF EXISTS (SELECT 1 FROM tools WHERE tool_key = 'get_note_content' AND organization_id IS NULL) THEN
        UPDATE tools 
        SET description = 'Get full content of a personal note without truncation'
        WHERE tool_key = 'get_note_content' AND organization_id IS NULL;
    ELSE
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('get_note_content', 'Get Note Content', 'backend', 
                'Get full content of a personal note without truncation', true, NULL);
    END IF;
    
    -- ========================================================================
    -- Folder Management Tools (NEW)
    -- ========================================================================
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'list_folders') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('list_folders', 'List Folders', 'backend', 
                'List all folders in user''s workspace with file counts', true, NULL);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'create_folder') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('create_folder', 'Create Folder', 'backend', 
                'Create a new folder in user''s workspace', true, NULL);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'rename_folder') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('rename_folder', 'Rename Folder', 'backend', 
                'Rename an existing folder in user''s workspace', true, NULL);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'delete_folder') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('delete_folder', 'Delete Folder', 'backend', 
                'Delete a folder from user''s workspace (with safety checks)', true, NULL);
    END IF;
    
    -- ========================================================================
    -- File Management Tools (NEW)
    -- ========================================================================
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'list_files') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('list_files', 'List Files', 'backend', 
                'List files in a folder with pagination and optional recursive traversal', true, NULL);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'delete_file') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('delete_file', 'Delete File', 'backend', 
                'Delete a file from user''s workspace (permanent deletion)', true, NULL);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'rename_file') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('rename_file', 'Rename File', 'backend', 
                'Rename a file in user''s workspace', true, NULL);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'move_file') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('move_file', 'Move File', 'backend', 
                'Move a file to a different folder', true, NULL);
    END IF;
    
    -- ========================================================================
    -- File Read/Write Tools (NEW)
    -- ========================================================================
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'create_text_file') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('create_text_file', 'Create Text File', 'backend', 
                'Create a new text file (txt, md, json, csv, etc.) in workspace', true, NULL);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'update_file_content') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, organization_id)
        VALUES ('update_file_content', 'Update File Content', 'backend', 
                'Update content of an existing text file (replace or append)', true, NULL);
    END IF;
    
END $$;

-- ============================================================================
-- Migration complete
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Updated workspace tools in database';
    RAISE NOTICE '✅ Removed deprecated tools: search_user_emails, search_user_slack, update_file_tags';
    RAISE NOTICE '✅ Added folder management tools: list_folders, create_folder, rename_folder, delete_folder';
    RAISE NOTICE '✅ Added file management tools: list_files, delete_file, rename_file, move_file';
    RAISE NOTICE '✅ Added file read/write tools: get_file_metadata, create_text_file, update_file_content';
    RAISE NOTICE '✅ Total workspace tools: 16';
END $$;

