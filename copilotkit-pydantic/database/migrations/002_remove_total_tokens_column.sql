-- ============================================================================
-- Migration: Remove total_tokens column from usage table
-- ============================================================================
-- Description: Remove redundant total_tokens column as it can be calculated
--              from request_tokens + response_tokens
-- Date: 2025-01-09
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Remove total_tokens column from usage table
-- ============================================================================

DO $$ 
BEGIN
    -- Check if total_tokens column exists before dropping
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'usage' 
        AND column_name = 'total_tokens'
    ) THEN
        ALTER TABLE usage DROP COLUMN total_tokens;
        RAISE NOTICE 'Dropped total_tokens column from usage table';
    ELSE
        RAISE NOTICE 'total_tokens column does not exist, skipping';
    END IF;
END $$;

-- ============================================================================
-- Step 2: Create a computed column view (optional - for convenience)
-- ============================================================================

-- Drop view if it exists
DROP VIEW IF EXISTS usage_with_totals;

-- Create view that includes computed total_tokens
CREATE VIEW usage_with_totals AS
SELECT 
    id,
    agent_id,
    model_id,
    session_id,
    user_id,
    organization_id,
    team_id,
    request_tokens,
    response_tokens,
    (COALESCE(request_tokens, 0) + COALESCE(response_tokens, 0)) AS total_tokens,
    cost,
    duration_ms,
    status,
    error_message,
    created_at,
    metadata,
    usage_details
FROM usage;

COMMENT ON VIEW usage_with_totals IS 'Usage table with computed total_tokens column for backward compatibility';

-- ============================================================================
-- Migration Complete
-- ============================================================================

DO $$ 
BEGIN
    RAISE NOTICE '✅ Migration 002 completed successfully!';
    RAISE NOTICE 'Removed total_tokens column from usage table';
    RAISE NOTICE 'Created usage_with_totals view for computed totals';
END $$;

COMMIT;

