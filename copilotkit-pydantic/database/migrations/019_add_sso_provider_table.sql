-- Migration: Add SSO Provider Table for Better Auth SSO Plugin
-- Created: 2025-12-08
-- Description: Creates the ssoProvider table required by the Better Auth SSO plugin
--              for enterprise OIDC and SAML authentication.

-- ============================================================================
-- Step 1: Create the ssoProvider table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ssoProvider" (
    -- Primary key
    id TEXT PRIMARY KEY NOT NULL,
    
    -- Provider identification
    "providerId" TEXT NOT NULL UNIQUE,
    issuer TEXT NOT NULL,
    domain TEXT NOT NULL,
    
    -- SSO configurations (stored as JSON)
    "oidcConfig" TEXT,  -- JSON string for OIDC configuration
    "samlConfig" TEXT,  -- JSON string for SAML configuration
    
    -- Relationships
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "organizationId" TEXT REFERENCES organization(id) ON DELETE SET NULL,
    
    -- Domain verification (for enterprise security)
    "domainVerified" BOOLEAN DEFAULT false,
    "domainVerificationToken" TEXT,
    "domainVerificationExpiresAt" TIMESTAMP,
    
    -- Timestamps
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Step 2: Create indexes for efficient queries
-- ============================================================================

-- Index for looking up providers by providerId (unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sso_provider_id ON "ssoProvider"("providerId");

-- Index for looking up providers by domain (for SSO sign-in routing)
CREATE INDEX IF NOT EXISTS idx_sso_provider_domain ON "ssoProvider"(domain);

-- Index for looking up providers by organization
CREATE INDEX IF NOT EXISTS idx_sso_provider_org ON "ssoProvider"("organizationId");

-- Index for looking up providers by user
CREATE INDEX IF NOT EXISTS idx_sso_provider_user ON "ssoProvider"("userId");

-- Index for domain verification queries
CREATE INDEX IF NOT EXISTS idx_sso_provider_verified ON "ssoProvider"("domainVerified");

-- ============================================================================
-- Step 3: Add trigger for updatedAt timestamp
-- ============================================================================

-- Create the trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_sso_provider_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists (to avoid duplicates)
DROP TRIGGER IF EXISTS trg_sso_provider_updated_at ON "ssoProvider";

-- Create the trigger
CREATE TRIGGER trg_sso_provider_updated_at
    BEFORE UPDATE ON "ssoProvider"
    FOR EACH ROW
    EXECUTE FUNCTION update_sso_provider_updated_at();

-- ============================================================================
-- Step 4: Verify the changes
-- ============================================================================

DO $$ 
DECLARE
    table_exists BOOLEAN;
    provider_id_idx_exists BOOLEAN;
    domain_idx_exists BOOLEAN;
    org_idx_exists BOOLEAN;
BEGIN
    -- Check table existence
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'ssoProvider'
    ) INTO table_exists;
    
    -- Check indexes
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_sso_provider_id'
    ) INTO provider_id_idx_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_sso_provider_domain'
    ) INTO domain_idx_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_sso_provider_org'
    ) INTO org_idx_exists;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Verification Results:';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ ssoProvider table exists: %', table_exists;
    RAISE NOTICE '✓ providerId index exists: %', provider_id_idx_exists;
    RAISE NOTICE '✓ domain index exists: %', domain_idx_exists;
    RAISE NOTICE '✓ organizationId index exists: %', org_idx_exists;
    RAISE NOTICE '========================================';
    
    IF table_exists AND provider_id_idx_exists AND domain_idx_exists AND org_idx_exists THEN
        RAISE NOTICE '✅ Migration completed successfully!';
    ELSE
        RAISE WARNING '⚠️  Some components may not have been created!';
    END IF;
END $$;

-- ============================================================================
-- SSO Provider Table Schema Reference
-- ============================================================================
-- 
-- The ssoProvider table stores SSO provider configurations for organizations.
-- Each organization can have multiple SSO providers (up to the configured limit).
--
-- OIDC Configuration (oidcConfig JSON):
-- {
--   "clientId": "your-client-id",
--   "clientSecret": "encrypted-secret",
--   "authorizationEndpoint": "https://idp.example.com/authorize",
--   "tokenEndpoint": "https://idp.example.com/token",
--   "jwksEndpoint": "https://idp.example.com/jwks",
--   "discoveryEndpoint": "https://idp.example.com/.well-known/openid-configuration",
--   "scopes": ["openid", "email", "profile"],
--   "pkce": true,
--   "mapping": {
--     "id": "sub",
--     "email": "email",
--     "emailVerified": "email_verified",
--     "name": "name",
--     "image": "picture",
--     "extraFields": { "department": "department", "role": "role" }
--   }
-- }
--
-- SAML Configuration (samlConfig JSON):
-- {
--   "entryPoint": "https://idp.example.com/sso",
--   "cert": "-----BEGIN CERTIFICATE-----...",
--   "callbackUrl": "https://app.example.com/api/auth/sso/saml2/callback/provider-id",
--   "audience": "https://app.example.com",
--   "wantAssertionsSigned": true,
--   "signatureAlgorithm": "sha256"
-- }

