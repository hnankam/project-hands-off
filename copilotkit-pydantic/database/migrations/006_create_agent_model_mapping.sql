-- Migration: Create agent_model_mappings table to relate agents and models
-- Allows restricting which models an agent can use. Absence of rows means agent is available for all models.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_model_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_model_unique ON agent_model_mappings(agent_id, model_id);
CREATE INDEX IF NOT EXISTS idx_agent_model_agent_id ON agent_model_mappings(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_model_model_id ON agent_model_mappings(model_id);

COMMIT;

