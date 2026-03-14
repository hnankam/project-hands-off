-- Migration: Add Skills Tables
-- Description: Adds skills table, skill_teams junction, agent_skill_mappings,
--              and skills_with_teams view for Agent Skills support.

-- ============================================================================
-- Step 1: Create skills table
-- ============================================================================

CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    skill_key VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('manual', 'git')),
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    git_config JSONB,
    organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    CONSTRAINT skills_git_config_check CHECK (
        (source_type = 'git' AND git_config IS NOT NULL) OR
        source_type = 'manual'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_key_scope
    ON skills (COALESCE(organization_id, 'global'), skill_key)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_skills_org ON skills(organization_id);
CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
CREATE INDEX IF NOT EXISTS idx_skills_source_type ON skills(source_type);
CREATE INDEX IF NOT EXISTS idx_skills_deleted_at ON skills(deleted_at);

DROP TRIGGER IF EXISTS update_skills_updated_at ON skills;
CREATE TRIGGER update_skills_updated_at
    BEFORE UPDATE ON skills
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE skills IS 'Registry of Agent Skills (manual or git-based)';

-- ============================================================================
-- Step 2: Create skill_teams junction table
-- ============================================================================

CREATE TABLE IF NOT EXISTS skill_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_teams_skill ON skill_teams(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_teams_team ON skill_teams(team_id);

COMMENT ON TABLE skill_teams IS 'Junction table for many-to-many relationship between skills and teams';

-- ============================================================================
-- Step 3: Create agent_skill_mappings table
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_skill_mappings (
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_skill_mappings_agent
    ON agent_skill_mappings(agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_skill_mappings_skill
    ON agent_skill_mappings(skill_id);

COMMENT ON TABLE agent_skill_mappings IS 'Associates agents with the skills they are allowed to use';

-- ============================================================================
-- Step 4: Create skills_with_teams view
-- ============================================================================

CREATE OR REPLACE VIEW skills_with_teams AS
SELECT
    s.*,
    COALESCE(
        json_agg(
            json_build_object('id', t.id, 'name', t.name)
            ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::json
    ) as teams
FROM skills s
LEFT JOIN skill_teams st ON s.id = st.skill_id
LEFT JOIN team t ON st.team_id = t.id
WHERE s.deleted_at IS NULL
GROUP BY s.id;

COMMENT ON VIEW skills_with_teams IS 'Skills with their associated teams aggregated as JSON array';

-- ============================================================================
-- Migration complete
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Added skills tables (skills, skill_teams, agent_skill_mappings, skills_with_teams)';
END $$;
