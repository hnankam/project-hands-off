-- Migration: Add User Banned Fields for Better Auth Admin Plugin
-- Created: 2025-12-01
-- Description: Adds banned, banReason, and banExpires fields to the user table
--              to support user deactivation/reactivation without deletion.

-- ============================================================================
-- Step 1: Add banned fields to user table
-- ============================================================================

-- Add banned field (boolean, default false)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN DEFAULT FALSE;

-- Add banReason field (text, optional)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason" TEXT;

-- Add banExpires field (timestamp, optional - null means permanent ban)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMP;

-- ============================================================================
-- Step 2: Create index for efficient banned user queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_banned ON "user" ("banned");

-- ============================================================================
-- Step 3: Verify the changes
-- ============================================================================

DO $$ 
DECLARE
    banned_exists BOOLEAN;
    ban_reason_exists BOOLEAN;
    ban_expires_exists BOOLEAN;
BEGIN
    -- Check column existence
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user' AND column_name = 'banned'
    ) INTO banned_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user' AND column_name = 'banReason'
    ) INTO ban_reason_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user' AND column_name = 'banExpires'
    ) INTO ban_expires_exists;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Verification Results:';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ banned column exists: %', banned_exists;
    RAISE NOTICE '✓ banReason column exists: %', ban_reason_exists;
    RAISE NOTICE '✓ banExpires column exists: %', ban_expires_exists;
    RAISE NOTICE '========================================';
    
    IF banned_exists AND ban_reason_exists AND ban_expires_exists THEN
        RAISE NOTICE '✅ Migration completed successfully!';
    ELSE
        RAISE WARNING '⚠️  Some columns may not have been created!';
    END IF;
END $$;

