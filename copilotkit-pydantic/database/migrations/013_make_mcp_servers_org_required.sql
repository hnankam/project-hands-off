-- Migration: Make organization_id required for MCP servers
-- Description: Remove global MCP server scope - all MCP servers must belong to a specific organization

-- Update any existing global MCP servers to require an organization
-- (This will fail if there are any global servers - they need to be manually assigned to an org first)
-- To check for global servers before running: SELECT * FROM mcp_servers WHERE organization_id IS NULL;

-- Make organization_id NOT NULL
ALTER TABLE mcp_servers 
    ALTER COLUMN organization_id SET NOT NULL;

-- Drop the old global server index
DROP INDEX IF EXISTS idx_mcp_servers_key_global;

-- Update the organization-scoped index to be the primary unique constraint
-- (idx_mcp_servers_key_org already exists and handles org-scoped uniqueness)

-- Update the constraint to enforce organization_id
COMMENT ON COLUMN mcp_servers.organization_id IS 'Required: Organization that owns this MCP server';

