-- Migration: Fix Better Auth Table Names
-- Created: 2025-11-01
-- Description: Fixes incorrect references to plural table names (organizations/teams)
--              and updates to use correct Better Auth singular names (organization/team)
--              Drops the incorrectly created plural tables.

-- ============================================================================
-- Step 1: Drop foreign key constraints on plural tables
-- ============================================================================

ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_organization_id_fkey CASCADE;
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_team_id_fkey CASCADE;

ALTER TABLE models DROP CONSTRAINT IF EXISTS models_organization_id_fkey CASCADE;
ALTER TABLE models DROP CONSTRAINT IF EXISTS models_team_id_fkey CASCADE;

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_organization_id_fkey CASCADE;
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_team_id_fkey CASCADE;

ALTER TABLE base_instructions DROP CONSTRAINT IF EXISTS base_instructions_organization_id_fkey CASCADE;
ALTER TABLE base_instructions DROP CONSTRAINT IF EXISTS base_instructions_team_id_fkey CASCADE;

ALTER TABLE usage DROP CONSTRAINT IF EXISTS usage_organization_id_fkey CASCADE;
ALTER TABLE usage DROP CONSTRAINT IF EXISTS usage_team_id_fkey CASCADE;

-- Drop other constraints on plural tables
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_organization_id_fkey CASCADE;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_organization_id_fkey CASCADE;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_organization_id_fkey CASCADE;
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_team_id_fkey CASCADE;
ALTER TABLE organization_roles DROP CONSTRAINT IF EXISTS organization_roles_organization_id_fkey CASCADE;
ALTER TABLE user_active_context DROP CONSTRAINT IF EXISTS user_active_context_active_organization_id_fkey CASCADE;
ALTER TABLE user_active_context DROP CONSTRAINT IF EXISTS user_active_context_active_team_id_fkey CASCADE;

-- ============================================================================
-- Step 2: Drop plural tables (incorrectly created)
-- ============================================================================

DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS teams CASCADE;

DO $$ 
BEGIN
    RAISE NOTICE '✅ Dropped plural tables: organizations, teams';
END $$;

-- ============================================================================
-- Step 3: Add foreign key constraints to correct Better Auth tables (singular)
-- ============================================================================

-- Providers
ALTER TABLE providers 
    ADD CONSTRAINT providers_organization_id_fkey 
    FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL;

ALTER TABLE providers 
    ADD CONSTRAINT providers_team_id_fkey 
    FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE SET NULL;

-- Models
ALTER TABLE models 
    ADD CONSTRAINT models_organization_id_fkey 
    FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL;

ALTER TABLE models 
    ADD CONSTRAINT models_team_id_fkey 
    FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE SET NULL;

-- Agents
ALTER TABLE agents 
    ADD CONSTRAINT agents_organization_id_fkey 
    FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL;

ALTER TABLE agents 
    ADD CONSTRAINT agents_team_id_fkey 
    FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE SET NULL;

-- Base Instructions
ALTER TABLE base_instructions 
    ADD CONSTRAINT base_instructions_organization_id_fkey 
    FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL;

ALTER TABLE base_instructions 
    ADD CONSTRAINT base_instructions_team_id_fkey 
    FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE SET NULL;

-- Usage
ALTER TABLE usage 
    ADD CONSTRAINT usage_organization_id_fkey 
    FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL;

ALTER TABLE usage 
    ADD CONSTRAINT usage_team_id_fkey 
    FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE SET NULL;

DO $$ 
BEGIN
    RAISE NOTICE '✅ Added foreign key constraints to singular tables: organization, team';
END $$;

-- ============================================================================
-- Step 4: Verify the changes
-- ============================================================================

DO $$ 
DECLARE
    org_exists BOOLEAN;
    orgs_exists BOOLEAN;
    team_exists BOOLEAN;
    teams_exists BOOLEAN;
BEGIN
    -- Check table existence
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization') INTO org_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') INTO orgs_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team') INTO team_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'teams') INTO teams_exists;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Verification Results:';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ organization table exists: %', org_exists;
    RAISE NOTICE '✓ organizations table removed: %', NOT orgs_exists;
    RAISE NOTICE '✓ team table exists: %', team_exists;
    RAISE NOTICE '✓ teams table removed: %', NOT teams_exists;
    RAISE NOTICE '========================================';
    
    IF org_exists AND NOT orgs_exists AND team_exists AND NOT teams_exists THEN
        RAISE NOTICE '✅ Migration completed successfully!';
    ELSE
        RAISE WARNING '⚠️  Some tables may not be in the expected state!';
    END IF;
END $$;

