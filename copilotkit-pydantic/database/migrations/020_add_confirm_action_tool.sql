-- Migration: Add confirmAction frontend tool
-- Description: Seeds the confirmAction frontend tool that was missing from the initial tool seeding.
--              This tool allows the agent to ask for user confirmation before proceeding with actions.

-- ============================================================================
-- Add confirmAction frontend tool
-- ============================================================================

INSERT INTO tools (tool_key, tool_name, tool_type, description, readonly, enabled)
VALUES
    ('confirmAction', 'Confirm Action', 'frontend', 'Ask user to confirm before proceeding with an action.', true, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Migration complete
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Added confirmAction frontend tool to tools registry';
END $$;

