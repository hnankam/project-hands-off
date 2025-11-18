-- Migration: Add tool management tables (tools, MCP servers, agent mappings)
-- Description: Introduces support for configurable tool access, MCP servers,
--              and per-agent tool assignments with multi-tenancy scoping.

-- ============================================================================
-- Step 1: MCP server registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS mcp_servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_key VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    transport VARCHAR(20) NOT NULL DEFAULT 'stdio',
    command TEXT,
    args TEXT[],
    env JSONB DEFAULT '{}'::jsonb,
    url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
    team_id TEXT REFERENCES team(id) ON DELETE SET NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT mcp_servers_transport_chk CHECK (transport IN ('stdio', 'sse', 'ws'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_key_scope
    ON mcp_servers (COALESCE(organization_id, 'global'), COALESCE(team_id, 'global'), server_key);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_org ON mcp_servers (organization_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_team ON mcp_servers (team_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers (enabled);

DROP TRIGGER IF EXISTS update_mcp_servers_updated_at ON mcp_servers;
CREATE TRIGGER update_mcp_servers_updated_at
    BEFORE UPDATE ON mcp_servers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE mcp_servers IS 'Manages MCP server connection definitions for tool access';

-- ============================================================================
-- Step 2: Tool registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_key VARCHAR(150) NOT NULL,
    tool_name VARCHAR(255) NOT NULL,
    tool_type VARCHAR(20) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    config JSONB DEFAULT '{}'::jsonb,
    organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
    team_id TEXT REFERENCES team(id) ON DELETE SET NULL,
    enabled BOOLEAN DEFAULT true,
    readonly BOOLEAN DEFAULT false,
    mcp_server_id UUID REFERENCES mcp_servers(id) ON DELETE CASCADE,
    remote_tool_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tools_type_chk CHECK (tool_type IN ('frontend', 'backend', 'builtin', 'mcp')),
    CONSTRAINT tools_mcp_fk_chk CHECK (
        (tool_type = 'mcp' AND mcp_server_id IS NOT NULL AND remote_tool_name IS NOT NULL)
        OR (tool_type <> 'mcp' AND mcp_server_id IS NULL AND remote_tool_name IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tools_key_scope
    ON tools (COALESCE(organization_id, 'global'), COALESCE(team_id, 'global'), tool_key);

CREATE INDEX IF NOT EXISTS idx_tools_org ON tools (organization_id);
CREATE INDEX IF NOT EXISTS idx_tools_team ON tools (team_id);
CREATE INDEX IF NOT EXISTS idx_tools_type ON tools (tool_type);
CREATE INDEX IF NOT EXISTS idx_tools_enabled ON tools (enabled);
CREATE INDEX IF NOT EXISTS idx_tools_mcp_server ON tools (mcp_server_id);

DROP TRIGGER IF EXISTS update_tools_updated_at ON tools;
CREATE TRIGGER update_tools_updated_at
    BEFORE UPDATE ON tools
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE tools IS 'Registry of tools available to agents (frontend, backend, builtin, MCP)';

-- ============================================================================
-- Step 3: Agent/tool mappings
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_tool_mappings (
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_mappings_agent
    ON agent_tool_mappings (agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_tool_mappings_tool
    ON agent_tool_mappings (tool_id);

COMMENT ON TABLE agent_tool_mappings IS 'Associates agents with the tools they are allowed to use';

-- ============================================================================
-- Step 4: Seed default tool definitions (global scope)
-- ============================================================================

-- Backend tools registered in Python runtime (copilotkit-pydantic/tools/agent_tools.py)
INSERT INTO tools (tool_key, tool_name, tool_type, description, enabled)
VALUES
    ('create_plan', 'Create Plan', 'backend', 'Create a plan with multiple steps.', true),
    ('update_plan_step', 'Update Plan Step', 'backend', 'Update the description or status of a plan step.', true),
    ('get_weather', 'Get Weather', 'backend', 'Retrieve weather information for a location.', true),
    ('generate_images', 'Generate Images', 'backend', 'Generate images based on a text prompt and return URLs.', true),
    ('web_search', 'Web Search', 'backend', 'Search the web for relevant information.', true),
    ('code_execution', 'Code Execution', 'backend', 'Execute sandboxed Python code.', true),
    ('url_context', 'URL Context', 'backend', 'Load content from provided URLs.', true),

ON CONFLICT DO NOTHING;

-- Built-in tools provided by pydantic-ai
INSERT INTO tools (tool_key, tool_name, tool_type, description, metadata, enabled)
VALUES
    ('builtin_web_search', 'Web Search', 'builtin', 'Search the web for relevant information.', jsonb_build_object('builtin_class', 'WebSearchTool'), false),
    ('builtin_code_execution', 'Code Execution', 'builtin', 'Execute sandboxed Python code.', jsonb_build_object('builtin_class', 'CodeExecutionTool'), false),
    ('builtin_image_generation', 'Image Generation', 'builtin', 'Generate images from prompts.', jsonb_build_object('builtin_class', 'ImageGenerationTool'), false),
    ('builtin_memory', 'Memory', 'builtin', 'Store and retrieve structured memory.', jsonb_build_object('builtin_class', 'MemoryTool'), false),
    ('builtin_url_context', 'URL Context', 'builtin', 'Load content from provided URLs.', jsonb_build_object('builtin_class', 'UrlContextTool'), false)
ON CONFLICT DO NOTHING;

-- Frontend tools (Copilot actions) - marked readonly to prevent deletion
INSERT INTO tools (tool_key, tool_name, tool_type, description, readonly, enabled)
VALUES
    ('searchPageContent', 'Search Page Content', 'frontend', 'Search rendered page content for matching text.', true, true),
    ('searchFormData', 'Search Form Data', 'frontend', 'Search captured form data for matching text.', true, true),
    ('searchDOMUpdates', 'Search DOM Updates', 'frontend', 'Search DOM update history for matching text.', true, true),
    ('searchClickableElements', 'Search Clickable Elements', 'frontend', 'Search clickable element registry for matching text.', true, true),
    ('takeScreenshot', 'Take Screenshot', 'frontend', 'Capture a screenshot of the current page.', true, true),
    ('openNewTab', 'Open New Tab', 'frontend', 'Open a new browser tab with a specified URL.', true, true),
    ('scroll', 'Scroll', 'frontend', 'Scroll a target element or the page viewport.', true, true),
    ('dragAndDrop', 'Drag And Drop', 'frontend', 'Perform a drag and drop interaction between elements.', true, true),
    ('moveCursorToElement', 'Move Cursor To Element', 'frontend', 'Display and move the assistant cursor to a CSS selector.', true, true),
    ('refreshPageContent', 'Refresh Page Content', 'frontend', 'Refresh page HTML and embeddings cache.', true, true),
    ('cleanupExtensionUI', 'Cleanup Extension UI', 'frontend', 'Remove all extension UI overlays and state.', true, true),
    ('clickElement', 'Click Element', 'frontend', 'Click an element identified by a CSS selector.', true, true),
    ('verifySelector', 'Verify Selector', 'frontend', 'Validate a CSS selector and show diagnostics.', true, true),
    ('getSelectorAtPoint', 'Get Selector At Point', 'frontend', 'Resolve a CSS selector at viewport coordinates.', true, true),
    ('getSelectorsAtPoints', 'Get Selectors At Points', 'frontend', 'Resolve CSS selectors for multiple viewport coordinates.', true, true),
    ('sendKeystrokes', 'Send Keystrokes', 'frontend', 'Send a sequence of keystrokes to the active element.', true, true),
    ('inputData', 'Input Data', 'frontend', 'Input text into a form field matched by CSS selector.', true, true),
    ('getHtmlChunksByRange', 'Get HTML Chunks', 'frontend', 'Retrieve cached HTML chunk range for the current page.', true, true),
    ('getFormChunksByRange', 'Get Form Chunks', 'frontend', 'Retrieve cached form data chunks over a range.', true, true),
    ('getClickableChunksByRange', 'Get Clickable Chunks', 'frontend', 'Retrieve cached clickable element chunks over a range.', true, true),
    ('setThemeColor', 'Set Theme Color', 'frontend', 'Update the extension theme accent color.', true, true),
    ('wait', 'Wait', 'frontend', 'Pause execution for a number of seconds.', true, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Migration complete
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Added tool registry tables (tools, mcp_servers, agent_tool_mappings)';
END $$;


