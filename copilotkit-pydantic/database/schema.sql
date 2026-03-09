-- AI Agent Platform Database Schema
-- Database: PostgreSQL (Neon)
-- Note: Multi-tenancy support will be added in a future update

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PROVIDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_key VARCHAR(100) NOT NULL UNIQUE,
    provider_type VARCHAR(50) NOT NULL CHECK (provider_type IN ('google', 'anthropic', 'anthropic_bedrock', 'anthropic_foundry', 'openai', 'azure_openai')),
    credentials JSONB NOT NULL, -- Encrypted credentials
    organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
    team_id TEXT REFERENCES team(id) ON DELETE SET NULL,
    model_settings JSONB DEFAULT '{}'::jsonb,
    bedrock_model_settings JSONB,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_providers_type ON providers(provider_type);
CREATE INDEX idx_providers_enabled ON providers(enabled);
CREATE INDEX idx_providers_org ON providers(organization_id);
CREATE INDEX idx_providers_team ON providers(team_id);

-- ============================================================================
-- MODELS
-- ============================================================================

CREATE TABLE IF NOT EXISTS models (
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

CREATE INDEX idx_models_provider ON models(provider_id);
CREATE INDEX idx_models_enabled ON models(enabled);
CREATE INDEX idx_models_key ON models(model_key);
CREATE INDEX idx_models_org ON models(organization_id);
CREATE INDEX idx_models_team ON models(team_id);

-- ============================================================================
-- AGENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS agents (
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

CREATE INDEX idx_agents_type ON agents(agent_type);
CREATE INDEX idx_agents_enabled ON agents(enabled);
CREATE INDEX idx_agents_org ON agents(organization_id);
CREATE INDEX idx_agents_team ON agents(team_id);

-- ============================================================================
-- AGENT MODEL MAPPINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_model_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_agent_model_unique ON agent_model_mappings(agent_id, model_id);
CREATE INDEX idx_agent_model_agent_id ON agent_model_mappings(agent_id);
CREATE INDEX idx_agent_model_model_id ON agent_model_mappings(model_id);

-- ============================================================================
-- CONFIGURATION VERSIONS (For rollback and audit)
-- ============================================================================

CREATE TABLE IF NOT EXISTS config_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_type VARCHAR(50) NOT NULL CHECK (config_type IN ('provider', 'model', 'agent')),
    config_id UUID NOT NULL,
    version_number INTEGER NOT NULL,
    config_data JSONB NOT NULL,
    change_description TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_config_versions_type ON config_versions(config_type);
CREATE INDEX idx_config_versions_config_id ON config_versions(config_id);

-- ============================================================================
-- USAGE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
    team_id TEXT REFERENCES team(id) ON DELETE SET NULL,
    request_tokens INTEGER,
    response_tokens INTEGER,
    usage_details JSONB,
    cost DECIMAL(10, 6),
    duration_ms INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_usage_created_at ON usage(created_at);
CREATE INDEX idx_usage_agent_model ON usage(agent_id, model_id);
CREATE INDEX idx_usage_agent_id ON usage(agent_id);
CREATE INDEX idx_usage_model_id ON usage(model_id);
CREATE INDEX idx_usage_session ON usage(session_id);
CREATE INDEX idx_usage_user ON usage(user_id);
CREATE INDEX idx_usage_user_id ON usage(user_id);
CREATE INDEX idx_usage_org ON usage(organization_id);
CREATE INDEX idx_usage_team ON usage(team_id);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_models_updated_at BEFORE UPDATE ON models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE providers IS 'AI provider configurations (Google, Anthropic, OpenAI, etc.)';
COMMENT ON TABLE models IS 'AI models available in the system';
COMMENT ON TABLE agents IS 'Agent types and prompts';
COMMENT ON TABLE config_versions IS 'Version history for configurations';
COMMENT ON TABLE usage IS 'Track API usage and costs';
COMMENT ON TABLE audit_logs IS 'Audit trail for all configuration changes';

