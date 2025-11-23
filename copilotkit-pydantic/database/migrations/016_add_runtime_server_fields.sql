-- Migration: Add Runtime Server Fields
-- Adds fields needed by Node.js runtime server for model routing and optimization
-- These fields are optional and don't break the Python/Pydantic server

-- Add runtime-specific fields to models table
ALTER TABLE models 
ADD COLUMN IF NOT EXISTS endpoint VARCHAR(255),
ADD COLUMN IF NOT EXISTS forced_model VARCHAR(100),
ADD COLUMN IF NOT EXISTS bedrock_model_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS deployment_name VARCHAR(255);

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_models_endpoint ON models(endpoint);
CREATE INDEX IF NOT EXISTS idx_models_forced_model ON models(forced_model);

-- Add runtime-specific fields to agents table
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS endpoint_pattern VARCHAR(255);

-- Add comments for documentation
COMMENT ON COLUMN models.endpoint IS 'API endpoint path for this model (runtime server)';
COMMENT ON COLUMN models.forced_model IS 'Forced model key for cost optimization (runtime server)';
COMMENT ON COLUMN models.bedrock_model_id IS 'AWS Bedrock model ID (runtime server)';
COMMENT ON COLUMN models.deployment_name IS 'Azure OpenAI deployment name (runtime server)';
COMMENT ON COLUMN agents.endpoint_pattern IS 'URL pattern for agent endpoints (runtime server)';

