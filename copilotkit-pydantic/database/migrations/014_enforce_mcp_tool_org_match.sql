-- Migration: Enforce MCP tools match their server's organization
-- Description: Ensure MCP tools can only reference MCP servers in the same organization

-- First, update any existing MCP tools to match their server's organization
-- (This was already done as a pre-migration step, but including here for completeness)
UPDATE tools t
SET organization_id = ms.organization_id
FROM mcp_servers ms
WHERE t.mcp_server_id = ms.id
  AND t.tool_type = 'mcp'
  AND t.organization_id IS DISTINCT FROM ms.organization_id;

-- Create a function to validate MCP tool organization matches server organization
CREATE OR REPLACE FUNCTION validate_mcp_tool_org_match()
RETURNS TRIGGER AS $$
BEGIN
    -- Only validate for MCP tools
    IF NEW.tool_type = 'mcp' AND NEW.mcp_server_id IS NOT NULL THEN
        -- Check if the tool's organization matches the server's organization
        IF NOT EXISTS (
            SELECT 1 FROM mcp_servers 
            WHERE id = NEW.mcp_server_id 
            AND organization_id = NEW.organization_id
        ) THEN
            RAISE EXCEPTION 'MCP tool organization_id (%) must match its server''s organization_id', NEW.organization_id
                USING HINT = 'MCP tools can only reference servers in the same organization';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate on INSERT and UPDATE
DROP TRIGGER IF EXISTS validate_mcp_tool_org_match_trigger ON tools;
CREATE TRIGGER validate_mcp_tool_org_match_trigger
    BEFORE INSERT OR UPDATE ON tools
    FOR EACH ROW
    EXECUTE FUNCTION validate_mcp_tool_org_match();

COMMENT ON FUNCTION validate_mcp_tool_org_match() IS 
    'Validates that MCP tools reference servers in the same organization';

