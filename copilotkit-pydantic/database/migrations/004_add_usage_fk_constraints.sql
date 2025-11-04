-- Migration: Add foreign key constraints to usage table
-- This ensures referential integrity between usage records and their corresponding agents/models
-- Note: This assumes agent_id and model_id are now UUIDs (not VARCHAR strings)

-- First, we need to alter the column types if they're still VARCHAR
-- Check and convert agent_id to UUID if needed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'usage'
          AND column_name = 'agent_id'
          AND data_type = 'character varying'
    ) THEN
        -- Try to convert existing data to UUID format
        -- For string values that aren't valid UUIDs, set to NULL
        UPDATE usage
        SET agent_id = NULL
        WHERE agent_id IS NOT NULL
          AND agent_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        
        ALTER TABLE usage
        ALTER COLUMN agent_id TYPE UUID USING agent_id::UUID;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'usage'
          AND column_name = 'model_id'
          AND data_type = 'character varying'
    ) THEN
        -- Try to convert existing data to UUID format
        -- For string values that aren't valid UUIDs, set to NULL
        UPDATE usage
        SET model_id = NULL
        WHERE model_id IS NOT NULL
          AND model_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        
        ALTER TABLE usage
        ALTER COLUMN model_id TYPE UUID USING model_id::UUID;
    END IF;
END $$;

-- Add foreign key constraint for agent_id
ALTER TABLE usage
ADD CONSTRAINT fk_usage_agent
FOREIGN KEY (agent_id)
REFERENCES agents(id)
ON DELETE SET NULL;

-- Add foreign key constraint for model_id
ALTER TABLE usage
ADD CONSTRAINT fk_usage_model
FOREIGN KEY (model_id)
REFERENCES models(id)
ON DELETE SET NULL;

-- Create indexes to improve query performance on FK columns
CREATE INDEX IF NOT EXISTS idx_usage_agent_id ON usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_usage_model_id ON usage(model_id);

-- Optional: Add a comment to document the constraint
COMMENT ON CONSTRAINT fk_usage_agent ON usage IS 'Foreign key to agents table, set to NULL on agent deletion';
COMMENT ON CONSTRAINT fk_usage_model ON usage IS 'Foreign key to models table, set to NULL on model deletion';

