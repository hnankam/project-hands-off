-- Migration: Add Multi-Tenancy Support and Rename usage_logs to usage
-- Created: 2025-01-XX
-- Description: Adds organization_id and team_id columns to providers, models, agents, and base_instructions.
--              Renames usage_logs table to usage and adds organization_id, team_id columns.
--              Recreates indexes to match new schema.

-- ============================================================================
-- Step 1: Add organization_id and team_id to providers
-- ============================================================================

-- Add new columns after credentials (maintaining schema order)
ALTER TABLE providers 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL;

ALTER TABLE providers 
  ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES team(id) ON DELETE SET NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_providers_org ON providers(organization_id);
CREATE INDEX IF NOT EXISTS idx_providers_team ON providers(team_id);

-- Recreate the table to ensure correct column order
CREATE TABLE providers_new (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_key VARCHAR(100) NOT NULL UNIQUE,
    provider_type VARCHAR(50) NOT NULL CHECK (provider_type IN ('google', 'anthropic', 'anthropic_bedrock', 'openai', 'azure_openai')),
    credentials JSONB NOT NULL,
    organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
    team_id TEXT REFERENCES team(id) ON DELETE SET NULL,
    model_settings JSONB DEFAULT '{}'::jsonb,
    bedrock_model_settings JSONB,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Copy data from old table to new table
INSERT INTO providers_new (
    id, provider_key, provider_type, credentials, organization_id, team_id,
    model_settings, bedrock_model_settings, enabled, created_at, updated_at, metadata
)
SELECT 
    id, provider_key, provider_type, credentials, organization_id, team_id,
    model_settings, bedrock_model_settings, enabled, created_at, updated_at, metadata
FROM providers;

-- Drop old table and rename new table
DROP TABLE providers CASCADE;
ALTER TABLE providers_new RENAME TO providers;

-- Recreate indexes
CREATE INDEX idx_providers_type ON providers(provider_type);
CREATE INDEX idx_providers_enabled ON providers(enabled);
CREATE INDEX idx_providers_org ON providers(organization_id);
CREATE INDEX idx_providers_team ON providers(team_id);

-- ============================================================================
-- Step 2: Add organization_id and team_id to models
-- ============================================================================

-- Add new columns (they will be added temporarily)
ALTER TABLE models 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL;

ALTER TABLE models 
  ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES team(id) ON DELETE SET NULL;

-- Recreate the table to ensure correct column order
CREATE TABLE models_new (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    model_key VARCHAR(100) NOT NULL UNIQUE,
    model_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    model_settings_override JSONB,
    organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
    team_id TEXT REFERENCES team(id) ON DELETE SET NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Copy data from old table to new table
INSERT INTO models_new (
    id, provider_id, model_key, model_name, display_name, description,
    model_settings_override, organization_id, team_id, enabled, created_at, updated_at, metadata
)
SELECT 
    id, provider_id, model_key, model_name, display_name, description,
    model_settings_override, organization_id, team_id, enabled, created_at, updated_at, metadata
FROM models;

-- Drop old table and rename new table
DROP TABLE models CASCADE;
ALTER TABLE models_new RENAME TO models;

-- Recreate indexes
CREATE INDEX idx_models_provider ON models(provider_id);
CREATE INDEX idx_models_enabled ON models(enabled);
CREATE INDEX idx_models_key ON models(model_key);
CREATE INDEX idx_models_org ON models(organization_id);
CREATE INDEX idx_models_team ON models(team_id);

-- ============================================================================
-- Step 3: Add organization_id and team_id to agents
-- ============================================================================

-- Add new columns (they will be added temporarily)
ALTER TABLE agents 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL;

ALTER TABLE agents 
  ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES team(id) ON DELETE SET NULL;

-- Recreate the table to ensure correct column order
CREATE TABLE agents_new (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_type VARCHAR(100) NOT NULL UNIQUE,
    agent_name VARCHAR(255) NOT NULL,
    description TEXT,
    prompt_template TEXT NOT NULL,
    organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
    team_id TEXT REFERENCES team(id) ON DELETE SET NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Copy data from old table to new table
INSERT INTO agents_new (
    id, agent_type, agent_name, description, prompt_template,
    organization_id, team_id, enabled, created_at, updated_at, metadata
)
SELECT 
    id, agent_type, agent_name, description, prompt_template,
    organization_id, team_id, enabled, created_at, updated_at, metadata
FROM agents;

-- Drop old table and rename new table
DROP TABLE agents CASCADE;
ALTER TABLE agents_new RENAME TO agents;

-- Recreate indexes
CREATE INDEX idx_agents_type ON agents(agent_type);
CREATE INDEX idx_agents_enabled ON agents(enabled);
CREATE INDEX idx_agents_org ON agents(organization_id);
CREATE INDEX idx_agents_team ON agents(team_id);

-- Recreate trigger
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Step 4: Add organization_id and team_id to base_instructions
-- ============================================================================

-- Add new columns (they will be added temporarily)
ALTER TABLE base_instructions 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL;

ALTER TABLE base_instructions 
  ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES team(id) ON DELETE SET NULL;

-- Recreate the table to ensure correct column order
CREATE TABLE base_instructions_new (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instruction_key VARCHAR(100) NOT NULL UNIQUE,
    instruction_value TEXT NOT NULL,
    description TEXT,
    organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
    team_id TEXT REFERENCES team(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table to new table
INSERT INTO base_instructions_new (
    id, instruction_key, instruction_value, description,
    organization_id, team_id, created_at, updated_at
)
SELECT 
    id, instruction_key, instruction_value, description,
    organization_id, team_id, created_at, updated_at
FROM base_instructions;

-- Drop old table and rename new table
DROP TABLE base_instructions CASCADE;
ALTER TABLE base_instructions_new RENAME TO base_instructions;

-- Recreate index
CREATE INDEX idx_base_instructions_key ON base_instructions(instruction_key);

-- Recreate trigger
CREATE TRIGGER update_base_instructions_updated_at BEFORE UPDATE ON base_instructions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Step 5: Rename usage_logs to usage and add organization_id, team_id
-- ============================================================================

-- Check if usage_logs exists (for backwards compatibility)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usage_logs') THEN
        -- Create new usage table with correct schema
        CREATE TABLE IF NOT EXISTS usage (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            agent_type VARCHAR(100),
            model_key VARCHAR(100),
            session_id VARCHAR(255),
            organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
            team_id TEXT REFERENCES team(id) ON DELETE SET NULL,
            request_tokens INTEGER,
            response_tokens INTEGER,
            total_tokens INTEGER,
            cost DECIMAL(10, 6),
            duration_ms INTEGER,
            status VARCHAR(50),
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            metadata JSONB DEFAULT '{}'::jsonb
        );

        -- Copy data from usage_logs to usage (if usage doesn't have data)
        INSERT INTO usage (
            id, agent_type, model_key, session_id, organization_id, team_id,
            request_tokens, response_tokens, total_tokens, cost, duration_ms,
            status, error_message, created_at, metadata
        )
        SELECT 
            id, agent_type, model_key, session_id, NULL, NULL,
            request_tokens, response_tokens, total_tokens, cost, duration_ms,
            status, error_message, created_at, metadata
        FROM usage_logs
        ON CONFLICT (id) DO NOTHING;

        -- Drop old table
        DROP TABLE usage_logs CASCADE;
        
        RAISE NOTICE 'Migrated usage_logs to usage table';
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usage') THEN
        -- Create usage table from scratch if neither exists
        CREATE TABLE usage (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            agent_type VARCHAR(100),
            model_key VARCHAR(100),
            session_id VARCHAR(255),
            organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
            team_id TEXT REFERENCES team(id) ON DELETE SET NULL,
            request_tokens INTEGER,
            response_tokens INTEGER,
            total_tokens INTEGER,
            cost DECIMAL(10, 6),
            duration_ms INTEGER,
            status VARCHAR(50),
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            metadata JSONB DEFAULT '{}'::jsonb
        );
        
        RAISE NOTICE 'Created new usage table';
    ELSE
        -- usage table exists, add missing columns if needed
        ALTER TABLE usage 
          ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL;
        
        ALTER TABLE usage 
          ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES team(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Updated existing usage table with new columns';
    END IF;
END $$;

-- Create indexes for usage table
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_agent_model ON usage(agent_type, model_key);
CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_org ON usage(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_team ON usage(team_id);

-- ============================================================================
-- Step 6: Recreate provider triggers
-- ============================================================================

-- Drop and recreate trigger for providers
DROP TRIGGER IF EXISTS update_providers_updated_at ON providers;
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Drop and recreate trigger for models
DROP TRIGGER IF EXISTS update_models_updated_at ON models;
CREATE TRIGGER update_models_updated_at BEFORE UPDATE ON models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Step 7: Update table comments
-- ============================================================================

COMMENT ON TABLE providers IS 'AI provider configurations (Google, Anthropic, OpenAI, etc.) with multi-tenancy support';
COMMENT ON TABLE models IS 'AI models available in the system with multi-tenancy support';
COMMENT ON TABLE agents IS 'Agent types and prompts with multi-tenancy support';
COMMENT ON TABLE base_instructions IS 'Reusable prompt components with multi-tenancy support';
COMMENT ON TABLE usage IS 'Track API usage and costs with multi-tenancy and session tracking for analytics';

-- ============================================================================
-- Migration Complete
-- ============================================================================

DO $$ 
BEGIN
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE 'Added organization_id and team_id to: providers, models, agents, base_instructions';
    RAISE NOTICE 'Renamed usage_logs to usage and added organization_id, team_id, session_id support';
    RAISE NOTICE 'All indexes and triggers have been recreated';
END $$;

