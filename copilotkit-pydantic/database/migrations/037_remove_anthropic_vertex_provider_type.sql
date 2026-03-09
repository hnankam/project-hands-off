-- Migration: Remove anthropic_vertex provider type
-- Description: Drops anthropic_vertex from provider_type CHECK constraint.
--              Keeps anthropic_foundry. Any existing anthropic_vertex providers
--              must be deleted or migrated before applying.

-- Delete any providers with anthropic_vertex type (they would fail the new constraint)
DELETE FROM providers WHERE provider_type = 'anthropic_vertex';

-- Drop and recreate CHECK constraint without anthropic_vertex
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_provider_type_check;
ALTER TABLE providers ADD CONSTRAINT providers_provider_type_check
    CHECK (provider_type IN (
        'google',
        'anthropic',
        'anthropic_bedrock',
        'anthropic_foundry',
        'openai',
        'azure_openai'
    ));
