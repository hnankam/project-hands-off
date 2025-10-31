/**
 * Better Auth Database Schema
 * 
 * This schema includes all tables required for Better Auth with the organization plugin:
 * - Users and authentication
 * - Sessions
 * - Organizations
 * - Organization members
 * - Teams
 * - Team members
 * - Invitations
 * - Roles and permissions
 */

-- ============================================================================
-- Users Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    image TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- User Accounts Table (for different auth providers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    expires_at TIMESTAMP,
    scope TEXT,
    password TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- ============================================================================
-- Sessions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    token TEXT UNIQUE NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- ============================================================================
-- Verification Tokens Table (for email verification, password reset, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS verification_tokens (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_identifier ON verification_tokens(identifier);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON verification_tokens(token);

-- ============================================================================
-- Organizations Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo TEXT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON organizations(created_at);

-- ============================================================================
-- Organization Members Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT[] NOT NULL DEFAULT ARRAY['member']::TEXT[],
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_organization_id ON members(organization_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_role ON members USING GIN(role);

-- ============================================================================
-- Invitations Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT[] NOT NULL DEFAULT ARRAY['member']::TEXT[],
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    expires_at TIMESTAMP NOT NULL,
    inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_organization_id ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- ============================================================================
-- Teams Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_organization_id ON teams(organization_id);

-- ============================================================================
-- Team Members Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- ============================================================================
-- Organization Roles Table (custom roles)
-- ============================================================================
CREATE TABLE IF NOT EXISTS organization_roles (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role_name TEXT NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, role_name)
);

CREATE INDEX IF NOT EXISTS idx_organization_roles_organization_id ON organization_roles(organization_id);

-- ============================================================================
-- User Active Organization/Team Tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_active_context (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    active_organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    active_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_active_context_organization ON user_active_context(active_organization_id);
CREATE INDEX IF NOT EXISTS idx_user_active_context_team ON user_active_context(active_team_id);

-- ============================================================================
-- Functions for automatic timestamp updates
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all tables with updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_members_updated_at ON members;
CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invitations_updated_at ON invitations;
CREATE TRIGGER update_invitations_updated_at BEFORE UPDATE ON invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_team_members_updated_at ON team_members;
CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON team_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_roles_updated_at ON organization_roles;
CREATE TRIGGER update_organization_roles_updated_at BEFORE UPDATE ON organization_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_active_context_updated_at ON user_active_context;
CREATE TRIGGER update_user_active_context_updated_at BEFORE UPDATE ON user_active_context
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Sample Data (Optional - for development/testing)
-- ============================================================================

-- Create a demo user
INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
VALUES 
    ('user_demo_001', 'Demo User', 'demo@example.com', TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Create demo organization
INSERT INTO organizations (id, name, slug, metadata, created_at, updated_at)
VALUES 
    ('org_demo_001', 'Demo Organization', 'demo-org', '{"description": "A demo organization"}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Add demo user as owner of demo organization
INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
VALUES 
    ('member_demo_001', 'org_demo_001', 'user_demo_001', ARRAY['owner'], NOW(), NOW())
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Create demo team
INSERT INTO teams (id, name, organization_id, created_at, updated_at)
VALUES 
    ('team_demo_001', 'Engineering Team', 'org_demo_001', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Add demo user to demo team
INSERT INTO team_members (id, team_id, user_id, created_at, updated_at)
VALUES 
    ('team_member_demo_001', 'team_demo_001', 'user_demo_001', NOW(), NOW())
ON CONFLICT (team_id, user_id) DO NOTHING;

-- Set demo user's active context
INSERT INTO user_active_context (user_id, active_organization_id, active_team_id, updated_at)
VALUES 
    ('user_demo_001', 'org_demo_001', 'team_demo_001', NOW())
ON CONFLICT (user_id) DO UPDATE SET
    active_organization_id = EXCLUDED.active_organization_id,
    active_team_id = EXCLUDED.active_team_id,
    updated_at = NOW();

-- ============================================================================
-- Grant permissions (adjust as needed for your database user)
-- ============================================================================
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_db_user;

