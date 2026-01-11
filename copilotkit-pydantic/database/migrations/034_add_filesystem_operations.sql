-- Migration: Add filesystem operation tools
-- Description: Add read_file, glob_files, grep_files, and edit_file tools for enhanced file operations
-- Date: 2026-01-10

-- ============================================================================
-- Add new filesystem operation tools
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Adding filesystem operation tools...';
    
    -- ========================================================================
    -- read_file - Read file with line numbers and ranges
    -- ========================================================================
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'read_file') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, readonly, organization_id, metadata)
        VALUES (
            'read_file',
            'Read File',
            'backend',
            'Read file content with line numbers and optional line range selection. Returns content split by lines with line count.',
            true,
            true,
            NULL,
            jsonb_build_object(
                'category', 'workspace',
                'subcategory', 'filesystem',
                'capabilities', jsonb_build_array('line_numbers', 'line_ranges', 'text_files'),
                'size_limit_mb', 50,
                'version', '1.0.0'
            )
        );
        RAISE NOTICE '  ✓ Added read_file tool';
    ELSE
        RAISE NOTICE '  ⊘ read_file tool already exists';
    END IF;
    
    -- ========================================================================
    -- glob_files - Pattern-based file matching
    -- ========================================================================
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'glob_files') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, readonly, organization_id, metadata)
        VALUES (
            'glob_files',
            'Glob Files',
            'backend',
            'Find files matching glob patterns. Supports wildcards (*, **), character classes ([abc]), and negation ([!abc]). Returns paginated file list.',
            true,
            true,
            NULL,
            jsonb_build_object(
                'category', 'workspace',
                'subcategory', 'filesystem',
                'capabilities', jsonb_build_array('pattern_matching', 'recursive', 'pagination'),
                'patterns', jsonb_build_array('*', '**', '?', '[abc]', '[!abc]'),
                'version', '1.0.0'
            )
        );
        RAISE NOTICE '  ✓ Added glob_files tool';
    ELSE
        RAISE NOTICE '  ⊘ glob_files tool already exists';
    END IF;
    
    -- ========================================================================
    -- grep_files - Content search across files
    -- ========================================================================
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'grep_files') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, readonly, organization_id, metadata)
        VALUES (
            'grep_files',
            'Grep Files',
            'backend',
            'Search for text patterns across multiple files. Supports regex, case-insensitive search, and context lines. Returns line numbers and match positions.',
            true,
            true,
            NULL,
            jsonb_build_object(
                'category', 'workspace',
                'subcategory', 'filesystem',
                'capabilities', jsonb_build_array('regex', 'context_lines', 'line_numbers', 'match_positions'),
                'limits', jsonb_build_object(
                    'max_files', 50,
                    'max_matches_per_file', 100,
                    'max_file_size_mb', 5,
                    'regex_timeout_seconds', 2
                ),
                'version', '1.0.0'
            )
        );
        RAISE NOTICE '  ✓ Added grep_files tool';
    ELSE
        RAISE NOTICE '  ⊘ grep_files tool already exists';
    END IF;
    
    -- ========================================================================
    -- edit_file - Search and replace in files
    -- ========================================================================
    
    IF NOT EXISTS (SELECT 1 FROM tools WHERE tool_key = 'edit_file') THEN
        INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled, readonly, organization_id, metadata)
        VALUES (
            'edit_file',
            'Edit File',
            'backend',
            'Replace text patterns in a file using simple string or regex replacement. Validates JSON/YAML syntax. Supports case-insensitive and all-occurrences modes.',
            true,
            false, -- NOT readonly - this modifies files
            NULL,
            jsonb_build_object(
                'category', 'workspace',
                'subcategory', 'filesystem',
                'capabilities', jsonb_build_array('search_replace', 'regex', 'validation', 'case_insensitive'),
                'validation', jsonb_build_array('json', 'yaml'),
                'limits', jsonb_build_object(
                    'max_file_size_mb', 10,
                    'regex_timeout_seconds', 2,
                    'max_pattern_length', 200
                ),
                'safety', jsonb_build_array('validation', 'rollback_on_failure'),
                'version', '1.0.0'
            )
        );
        RAISE NOTICE '  ✓ Added edit_file tool';
    ELSE
        RAISE NOTICE '  ⊘ edit_file tool already exists';
    END IF;

END $$;

-- ============================================================================
-- Update get_file_content description to differentiate from read_file
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM tools WHERE tool_key = 'get_file_content' AND organization_id IS NULL) THEN
        UPDATE tools 
        SET description = 'Get full text content from an uploaded file. Returns raw content without line numbers. For line-by-line reading, use read_file instead.'
        WHERE tool_key = 'get_file_content' AND organization_id IS NULL;
        RAISE NOTICE '  ✓ Updated get_file_content description';
    END IF;
END $$;

-- ============================================================================
-- Verification and Statistics
-- ============================================================================

DO $$
DECLARE
    workspace_tool_count INTEGER;
    filesystem_tool_count INTEGER;
    readonly_count INTEGER;
    writable_count INTEGER;
BEGIN
    -- Count workspace tools
    SELECT COUNT(*) INTO workspace_tool_count
    FROM tools
    WHERE tool_type = 'backend'
      AND organization_id IS NULL
      AND (metadata->>'category' = 'workspace' OR tool_key LIKE '%workspace%' OR tool_key LIKE '%file%' OR tool_key LIKE '%folder%' OR tool_key LIKE '%note%');
    
    -- Count filesystem operation tools specifically
    SELECT COUNT(*) INTO filesystem_tool_count
    FROM tools
    WHERE tool_type = 'backend'
      AND organization_id IS NULL
      AND metadata->>'subcategory' = 'filesystem';
    
    -- Count readonly vs writable
    SELECT 
        COUNT(*) FILTER (WHERE readonly = true),
        COUNT(*) FILTER (WHERE readonly = false OR readonly IS NULL)
    INTO readonly_count, writable_count
    FROM tools
    WHERE tool_type = 'backend'
      AND organization_id IS NULL
      AND metadata->>'subcategory' = 'filesystem';
    
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE ' ✅ Migration 034 Complete: Filesystem Operations';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Statistics:';
    RAISE NOTICE '  • Total workspace tools: %', workspace_tool_count;
    RAISE NOTICE '  • Filesystem operation tools: %', filesystem_tool_count;
    RAISE NOTICE '  • Read-only operations: %', readonly_count;
    RAISE NOTICE '  • Write operations: %', writable_count;
    RAISE NOTICE '';
    RAISE NOTICE '🆕 New Tools Added:';
    RAISE NOTICE '  • read_file       - Read file with line numbers';
    RAISE NOTICE '  • glob_files      - Pattern-based file matching';
    RAISE NOTICE '  • grep_files      - Content search across files';
    RAISE NOTICE '  • edit_file       - Search and replace in files';
    RAISE NOTICE '';
    RAISE NOTICE '🔒 Security Features:';
    RAISE NOTICE '  • File size limits enforced';
    RAISE NOTICE '  • Regex timeout protection (2s)';
    RAISE NOTICE '  • JSON/YAML validation for edits';
    RAISE NOTICE '  • Binary file skipping in grep';
    RAISE NOTICE '';
    RAISE NOTICE '⚡ Performance Limits:';
    RAISE NOTICE '  • read_file: 50 MB max';
    RAISE NOTICE '  • edit_file: 10 MB max';
    RAISE NOTICE '  • grep_files: 5 MB per file, 50 files max';
    RAISE NOTICE '  • grep_files: 100 matches per file max';
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

-- ============================================================================
-- List all filesystem tools for verification
-- ============================================================================

SELECT 
    tool_key,
    tool_name,
    description,
    readonly,
    enabled,
    metadata->>'version' as version,
    created_at
FROM tools
WHERE tool_type = 'backend'
  AND organization_id IS NULL
  AND metadata->>'subcategory' = 'filesystem'
ORDER BY tool_key;
