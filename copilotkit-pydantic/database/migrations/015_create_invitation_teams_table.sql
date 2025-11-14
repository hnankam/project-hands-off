-- Migration: Add invitation_teams junction table
-- Description: Supports inviting users to multiple teams at once. When a user
--              accepts an invitation, they are automatically added to all
--              associated teams without manual assignment.

-- ============================================================================
-- Step 1: Create invitation_teams junction table
-- ============================================================================

CREATE TABLE IF NOT EXISTS invitation_teams (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "invitationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("invitationId", "teamId")
);

-- ============================================================================
-- Step 2: Create indexes for efficient queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invitation_teams_invitation
    ON invitation_teams ("invitationId");

CREATE INDEX IF NOT EXISTS idx_invitation_teams_team
    ON invitation_teams ("teamId");

-- ============================================================================
-- Step 3: Add comments for documentation
-- ============================================================================

COMMENT ON TABLE invitation_teams IS 'Junction table associating invitations with multiple teams for automatic team assignment upon acceptance';
COMMENT ON COLUMN invitation_teams."invitationId" IS 'References the invitation ID from the Better Auth invitation table';
COMMENT ON COLUMN invitation_teams."teamId" IS 'References team(id) - user will be added to this team upon accepting the invitation';

-- ============================================================================
-- Migration complete
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Created invitation_teams junction table for multi-team invitation support';
END $$;

