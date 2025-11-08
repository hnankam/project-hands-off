-- Migration: Add Multi-Team Support
-- Created: 2025-01-XX
-- Description: Replaces single team_id with junction tables to support multiple teams per resource
--              Applies to: providers, models, agents, tools, mcp_servers

-- ============================================================================
-- Step 1: Create junction tables for multi-team associations
-- ============================================================================

-- Provider Teams Junction Table
CREATE TABLE IF NOT EXISTS provider_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_teams_provider ON provider_teams(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_teams_team ON provider_teams(team_id);

-- Model Teams Junction Table
CREATE TABLE IF NOT EXISTS model_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(model_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_model_teams_model ON model_teams(model_id);
CREATE INDEX IF NOT EXISTS idx_model_teams_team ON model_teams(team_id);

-- Agent Teams Junction Table
CREATE TABLE IF NOT EXISTS agent_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_teams_agent ON agent_teams(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_teams_team ON agent_teams(team_id);

-- Tool Teams Junction Table
CREATE TABLE IF NOT EXISTS tool_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tool_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_teams_tool ON tool_teams(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_teams_team ON tool_teams(team_id);

-- MCP Server Teams Junction Table
CREATE TABLE IF NOT EXISTS mcp_server_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mcp_server_id UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(mcp_server_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_mcp_server_teams_server ON mcp_server_teams(mcp_server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_server_teams_team ON mcp_server_teams(team_id);

-- ============================================================================
-- Step 2: Migrate existing team_id data to junction tables
-- ============================================================================

-- Migrate providers
INSERT INTO provider_teams (provider_id, team_id)
SELECT id, team_id 
FROM providers 
WHERE team_id IS NOT NULL
ON CONFLICT (provider_id, team_id) DO NOTHING;

-- Migrate models
INSERT INTO model_teams (model_id, team_id)
SELECT id, team_id 
FROM models 
WHERE team_id IS NOT NULL
ON CONFLICT (model_id, team_id) DO NOTHING;

-- Migrate agents
INSERT INTO agent_teams (agent_id, team_id)
SELECT id, team_id 
FROM agents 
WHERE team_id IS NOT NULL
ON CONFLICT (agent_id, team_id) DO NOTHING;

-- Migrate tools
INSERT INTO tool_teams (tool_id, team_id)
SELECT id, team_id 
FROM tools 
WHERE team_id IS NOT NULL
ON CONFLICT (tool_id, team_id) DO NOTHING;

-- Migrate mcp_servers
INSERT INTO mcp_server_teams (mcp_server_id, team_id)
SELECT id, team_id 
FROM mcp_servers 
WHERE team_id IS NOT NULL
ON CONFLICT (mcp_server_id, team_id) DO NOTHING;

-- ============================================================================
-- Step 3: Keep team_id columns for backward compatibility (optional)
-- ============================================================================
-- Note: We can keep the team_id columns for now to maintain backward compatibility
-- They will be deprecated and eventually removed in a future migration
-- For now, we'll add comments to indicate they're deprecated

COMMENT ON COLUMN providers.team_id IS 'DEPRECATED: Use provider_teams junction table instead. This column is maintained for backward compatibility only.';
COMMENT ON COLUMN models.team_id IS 'DEPRECATED: Use model_teams junction table instead. This column is maintained for backward compatibility only.';
COMMENT ON COLUMN agents.team_id IS 'DEPRECATED: Use agent_teams junction table instead. This column is maintained for backward compatibility only.';
COMMENT ON COLUMN tools.team_id IS 'DEPRECATED: Use tool_teams junction table instead. This column is maintained for backward compatibility only.';
COMMENT ON COLUMN mcp_servers.team_id IS 'DEPRECATED: Use mcp_server_teams junction table instead. This column is maintained for backward compatibility only.';

-- ============================================================================
-- Step 4: Add helper views for easier querying
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
-- Step 5: Add comments to document the new structure
-- ============================================================================

COMMENT ON TABLE provider_teams IS 'Junction table for many-to-many relationship between providers and teams';
COMMENT ON TABLE model_teams IS 'Junction table for many-to-many relationship between models and teams';
COMMENT ON TABLE agent_teams IS 'Junction table for many-to-many relationship between agents and teams';
COMMENT ON TABLE tool_teams IS 'Junction table for many-to-many relationship between tools and teams';
COMMENT ON TABLE mcp_server_teams IS 'Junction table for many-to-many relationship between MCP servers and teams';

COMMENT ON VIEW providers_with_teams IS 'Providers with their associated teams aggregated as JSON array';
COMMENT ON VIEW models_with_teams IS 'Models with their associated teams aggregated as JSON array';
COMMENT ON VIEW agents_with_teams IS 'Agents with their associated teams aggregated as JSON array';
COMMENT ON VIEW tools_with_teams IS 'Tools with their associated teams aggregated as JSON array';
COMMENT ON VIEW mcp_servers_with_teams IS 'MCP servers with their associated teams aggregated as JSON array';

