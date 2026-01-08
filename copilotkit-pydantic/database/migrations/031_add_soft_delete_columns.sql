-- Migration: Add Soft Delete Support
-- Created: 2025-01-XX
-- Description: Adds deleted_at columns to agents, models, providers, and tools tables
--              to enable soft deletes instead of hard deletes.

-- ============================================================================
-- Step 1: Add deleted_at column to agents table
-- ============================================================================

ALTER TABLE agents 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_agents_deleted_at ON agents(deleted_at);

-- ============================================================================
-- Step 2: Add deleted_at column to models table
-- ============================================================================

ALTER TABLE models 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_models_deleted_at ON models(deleted_at);

-- ============================================================================
-- Step 3: Add deleted_at column to providers table
-- ============================================================================

ALTER TABLE providers 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_providers_deleted_at ON providers(deleted_at);

-- ============================================================================
-- Step 4: Add deleted_at column to tools table
-- ============================================================================

ALTER TABLE tools 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_tools_deleted_at ON tools(deleted_at);

-- ============================================================================
-- Step 5: Add comments
-- ============================================================================

COMMENT ON COLUMN agents.deleted_at IS 'Timestamp when the agent was soft deleted. NULL means not deleted.';
COMMENT ON COLUMN models.deleted_at IS 'Timestamp when the model was soft deleted. NULL means not deleted.';
COMMENT ON COLUMN providers.deleted_at IS 'Timestamp when the provider was soft deleted. NULL means not deleted.';
COMMENT ON COLUMN tools.deleted_at IS 'Timestamp when the tool was soft deleted. NULL means not deleted.';

-- ============================================================================
-- Step 6: Update views to filter out deleted records
-- ============================================================================

-- View: Providers with team names (filter deleted)
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
WHERE p.deleted_at IS NULL
GROUP BY p.id;

-- View: Models with team names (filter deleted)
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
WHERE m.deleted_at IS NULL
GROUP BY m.id;

-- View: Agents with team names (filter deleted)
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
WHERE a.deleted_at IS NULL
GROUP BY a.id;

-- View: Tools with team names (filter deleted)
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
WHERE tl.deleted_at IS NULL
GROUP BY tl.id;

-- ============================================================================
-- Step 7: Add deleted_at column to mcp_servers table
-- ============================================================================

ALTER TABLE mcp_servers 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_mcp_servers_deleted_at ON mcp_servers(deleted_at);

COMMENT ON COLUMN mcp_servers.deleted_at IS 'Timestamp when the MCP server was soft deleted. NULL means not deleted.';

-- View: MCP Servers with team names (filter deleted)
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
WHERE s.deleted_at IS NULL
GROUP BY s.id;

-- ============================================================================
-- Step 8: Add deleted_at column to ssoProvider table
-- ============================================================================

ALTER TABLE "ssoProvider" 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_sso_provider_deleted_at ON "ssoProvider"(deleted_at);

COMMENT ON COLUMN "ssoProvider".deleted_at IS 'Timestamp when the SSO provider was soft deleted. NULL means not deleted.';

