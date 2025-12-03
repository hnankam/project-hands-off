-- Migration: Add User Role Column for Better Auth Admin Plugin
-- Created: 2025-12-03
-- Description: Adds the role column to the user table required by the
--              Better Auth admin plugin when defaultRole is specified.

-- ============================================================================
-- Step 1: Add role column to user table
-- ============================================================================

-- Add role field (text, default 'user')
-- This is required by Better Auth's admin plugin when defaultRole is set
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT 'user';

-- ============================================================================
-- Step 2: Create index for efficient role-based queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_role ON "user" ("role");

-- ============================================================================
-- Step 3: Verify the changes
-- ============================================================================

DO $$ 
DECLARE
    role_exists BOOLEAN;
BEGIN
    -- Check column existence
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user' AND column_name = 'role'
    ) INTO role_exists;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Verification Results:';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ role column exists: %', role_exists;
    RAISE NOTICE '========================================';
    
    IF role_exists THEN
        RAISE NOTICE '✅ Migration completed successfully!';
    ELSE
        RAISE WARNING '⚠️  Role column may not have been created!';
    END IF;
END $$;

