-- Migration 011: Add organization-specific tool settings
-- This allows each organization to independently enable/disable global tools
-- without affecting other organizations

-- Create organization_tool_settings table
CREATE TABLE IF NOT EXISTS organization_tool_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure one setting per organization per tool
  UNIQUE(organization_id, tool_id)
);

-- Create indexes for performance
CREATE INDEX idx_org_tool_settings_org_id ON organization_tool_settings(organization_id);
CREATE INDEX idx_org_tool_settings_tool_id ON organization_tool_settings(tool_id);

-- Add comment explaining the table
COMMENT ON TABLE organization_tool_settings IS 'Stores organization-specific enabled/disabled state for tools. Used to override the default enabled state of global tools on a per-organization basis.';

