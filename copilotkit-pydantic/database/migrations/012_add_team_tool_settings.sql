-- Migration 012: Add team-level tool settings
-- This allows each team to independently enable/disable tools within their organization
-- Settings hierarchy: Team settings override organization settings, which override global defaults

-- Create team_tool_settings table
CREATE TABLE IF NOT EXISTS team_tool_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure one setting per team per tool
  UNIQUE(team_id, tool_id)
);

-- Create indexes for performance
CREATE INDEX idx_team_tool_settings_team_id ON team_tool_settings(team_id);
CREATE INDEX idx_team_tool_settings_tool_id ON team_tool_settings(tool_id);

-- Add comment explaining the table
COMMENT ON TABLE team_tool_settings IS 'Stores team-specific enabled/disabled state for tools. Overrides organization-level settings. Used for fine-grained team control of tool availability.';

-- Add comment explaining the priority hierarchy
COMMENT ON COLUMN team_tool_settings.enabled IS 'Team-level enabled state. Priority: team_tool_settings > organization_tool_settings > tools.enabled';

