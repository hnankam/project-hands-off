-- Migration: Remove Deprecated team_id Columns
-- Created: 2025-11-07
-- Description: Removes the deprecated team_id columns from all resource tables
--              now that multi-team support via junction tables is implemented.
--              This migration should only be run after all backend APIs and 
--              frontend components have been updated to use teamIds arrays.

-- ============================================================================
-- Step 0: Drop views that depend on team_id columns
-- ============================================================================

DROP VIEW IF EXISTS providers_with_teams;
DROP VIEW IF EXISTS models_with_teams;
DROP VIEW IF EXISTS agents_with_teams;
DROP VIEW IF EXISTS tools_with_teams;
DROP VIEW IF EXISTS mcp_servers_with_teams;

-- ============================================================================
-- Step 1: Drop team_id columns from all resource tables
-- ============================================================================

-- Remove team_id from providers
ALTER TABLE providers DROP COLUMN IF EXISTS team_id;

-- Remove team_id from models
ALTER TABLE models DROP COLUMN IF EXISTS team_id;

-- Remove team_id from agents
ALTER TABLE agents DROP COLUMN IF EXISTS team_id;

-- Remove team_id from tools
ALTER TABLE tools DROP COLUMN IF EXISTS team_id;

-- Remove team_id from mcp_servers
ALTER TABLE mcp_servers DROP COLUMN IF EXISTS team_id;

-- Remove team_id from base_instructions (if it exists)
ALTER TABLE base_instructions DROP COLUMN IF EXISTS team_id;

-- ============================================================================
-- Step 2: Update indexes (remove team_id indexes)
-- ============================================================================

DROP INDEX IF EXISTS idx_providers_team;
DROP INDEX IF EXISTS idx_models_team;
DROP INDEX IF EXISTS idx_agents_team;
DROP INDEX IF EXISTS idx_tools_team;
DROP INDEX IF EXISTS idx_mcp_servers_team;
DROP INDEX IF EXISTS idx_base_instructions_team;

-- ============================================================================
-- Step 3: Update unique constraints that included team_id
-- ============================================================================

-- For mcp_servers, update the unique constraint on server_key to only include org
DROP INDEX IF EXISTS idx_mcp_servers_key_scope;

-- Create new unique index for server key per organization (no team)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_key_org
    ON mcp_servers (organization_id, server_key)
    WHERE organization_id IS NOT NULL;

-- For global servers (no organization)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_key_global
    ON mcp_servers (server_key)
    WHERE organization_id IS NULL;

-- ============================================================================
-- Step 4: Recreate views without team_id columns
-- ============================================================================

-- View: Providers with team names
CREATE OR REPLACE VIEW providers_with_teams AS
SELECT 
    p.*,
    COALESCE(
        json_agg(
            json_build_object('id', t.id, 'name', t.name) 
            ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::json
    ) as teams
FROM providers p
LEFT JOIN provider_teams pt ON p.id = pt.provider_id
LEFT JOIN team t ON pt.team_id = t.id
GROUP BY p.id;

-- View: Models with team names
CREATE OR REPLACE VIEW models_with_teams AS
SELECT 
    m.*,
    COALESCE(
        json_agg(
            json_build_object('id', t.id, 'name', t.name) 
            ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::json
    ) as teams
FROM models m
LEFT JOIN model_teams mt ON m.id = mt.model_id
LEFT JOIN team t ON mt.team_id = t.id
GROUP BY m.id;

-- View: Agents with team names
CREATE OR REPLACE VIEW agents_with_teams AS
SELECT 
    a.*,
    COALESCE(
        json_agg(
            json_build_object('id', t.id, 'name', t.name) 
            ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::json
    ) as teams
FROM agents a
LEFT JOIN agent_teams at ON a.id = at.agent_id
LEFT JOIN team t ON at.team_id = t.id
GROUP BY a.id;

-- View: Tools with team names
CREATE OR REPLACE VIEW tools_with_teams AS
SELECT 
    tl.*,
    COALESCE(
        json_agg(
            json_build_object('id', t.id, 'name', t.name) 
            ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::json
    ) as teams
FROM tools tl
LEFT JOIN tool_teams tt ON tl.id = tt.tool_id
LEFT JOIN team t ON tt.team_id = t.id
GROUP BY tl.id;

-- View: MCP Servers with team names
CREATE OR REPLACE VIEW mcp_servers_with_teams AS
SELECT 
    s.*,
    COALESCE(
        json_agg(
            json_build_object('id', t.id, 'name', t.name) 
            ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::json
    ) as teams
FROM mcp_servers s
LEFT JOIN mcp_server_teams st ON s.id = st.mcp_server_id
LEFT JOIN team t ON st.team_id = t.id
GROUP BY s.id;

-- ============================================================================
-- Step 5: Verify cleanup
-- ============================================================================

-- Add comments to document the change
COMMENT ON TABLE providers IS 'Provider configurations. Use provider_teams junction table for team associations.';
COMMENT ON TABLE models IS 'Model configurations. Use model_teams junction table for team associations.';
COMMENT ON TABLE agents IS 'Agent configurations. Use agent_teams junction table for team associations.';
COMMENT ON TABLE tools IS 'Tool registry. Use tool_teams junction table for team associations.';
COMMENT ON TABLE mcp_servers IS 'MCP server configurations. Use mcp_server_teams junction table for team associations.';

