-- Migration: Add anthropic_vertex and anthropic_foundry provider types
-- Description: Extends provider_type CHECK constraint to support Anthropic via
--              Google Vertex AI and Microsoft Foundry.

-- Drop existing CHECK constraint and add new one with extended provider types
-- Try both possible constraint names (schema vs migration-created table)
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_provider_type_check;
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_new_provider_type_check;
ALTER TABLE providers ADD CONSTRAINT providers_provider_type_check
    CHECK (provider_type IN (
        'google',
        'anthropic',
        'anthropic_bedrock',
        'anthropic_vertex',
        'anthropic_foundry',
        'openai',
        'azure_openai'
    ));
