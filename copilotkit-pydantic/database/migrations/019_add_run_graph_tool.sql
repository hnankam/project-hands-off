-- Migration: Add run_graph backend tool
-- Description: Adds the run_graph tool that orchestrates multi-agent graphs for complex queries

-- ============================================================================
-- Add run_graph backend tool (only if it doesn't exist)
-- ============================================================================

INSERT INTO tools (tool_key, tool_name, tool_type, description, metadata, enabled, readonly)
SELECT
    'run_graph',
    'Run Graph',
    'backend',
    'Run a multi-agent graph to process complex queries. Orchestrates specialized agents (image generation, web search, code execution) for multi-step tasks.',
    jsonb_build_object(
        'capabilities', jsonb_build_array('image_generation', 'web_search', 'code_execution', 'result_aggregation'),
        'use_cases', jsonb_build_array(
            'Complex queries requiring multiple steps',
            'Queries combining search with image generation',
            'Multi-modal tasks that need different capabilities'
        ),
        'parameters', jsonb_build_object(
            'query', 'The user query to process through the multi-agent graph',
            'max_iterations', 'Maximum orchestrator iterations (default: 5)'
        )
    ),
    true,
    false
WHERE NOT EXISTS (
    SELECT 1 FROM tools WHERE tool_key = 'run_graph' AND organization_id IS NULL
);

-- ============================================================================
-- Migration complete
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Added run_graph backend tool for multi-agent graph orchestration';
END $$;
