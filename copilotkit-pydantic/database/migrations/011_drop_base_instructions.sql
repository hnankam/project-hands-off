-- Migration: Drop base_instructions table
-- Created: 2026-01-05
-- Description: Removes the base_instructions table which is no longer used.
--              Agent prompt templates are now stored directly in the agents table.

-- ============================================================================
-- Step 1: Drop the trigger
-- ============================================================================
DROP TRIGGER IF EXISTS update_base_instructions_updated_at ON base_instructions;

-- ============================================================================
-- Step 2: Drop the index
-- ============================================================================
DROP INDEX IF EXISTS idx_base_instructions_key;
DROP INDEX IF EXISTS idx_base_instructions_team;

-- ============================================================================
-- Step 3: Drop the table
-- ============================================================================
DROP TABLE IF EXISTS base_instructions CASCADE;

-- ============================================================================
-- Step 4: Update config_versions check constraint
-- ============================================================================
-- Remove 'base_instruction' from the allowed config_type values
-- Note: PostgreSQL doesn't support directly modifying CHECK constraints,
-- so we need to drop and recreate it.

ALTER TABLE config_versions DROP CONSTRAINT IF EXISTS config_versions_config_type_check;
ALTER TABLE config_versions ADD CONSTRAINT config_versions_config_type_check 
    CHECK (config_type IN ('provider', 'model', 'agent'));

-- ============================================================================
-- Migration Complete
-- ============================================================================
DO $$ 
BEGIN
    RAISE NOTICE '✅ Migration 011 completed successfully!';
    RAISE NOTICE 'Dropped base_instructions table and related objects';
    RAISE NOTICE 'Updated config_versions check constraint';
END $$;

