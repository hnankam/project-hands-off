-- Migration: Add call_agent backend tool
-- Description: Adds the call_agent backend tool that allows the main agent to invoke
--              custom auxiliary agents configured in its metadata.

-- ============================================================================
-- Add call_agent backend tool
-- ============================================================================

INSERT INTO tools (tool_key, tool_name, tool_type, description, readonly, enabled)
VALUES
    (
        'call_agent',
        'Call Agent',
        'backend',
        'Call a custom auxiliary agent with a specific prompt. Use this to delegate specialized tasks to auxiliary agents configured for this agent. Each auxiliary agent has specific capabilities - check the agent instructions for available agents and their descriptions.',
        true,
        true
    )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Migration complete
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Added call_agent backend tool to tools registry';
END $$;

