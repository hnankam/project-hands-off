/**
 * Tools API Routes
 * 
 * Provides CRUD operations for AI tools and MCP (Model Context Protocol) servers.
 * Supports multi-tenant architecture with organization and team-level scoping.
 * 
 * Tool Types:
 * - frontend: Client-side tools (read-only, bundled with app)
 * - backend: Server-side tools (read-only, bundled with app)
 * - builtin: Core system tools (read-only, bundled with app)
 * - mcp: Dynamic tools from MCP servers (user-created, deletable)
 * 
 * Endpoints:
 * - GET    /api/admin/tools - List tools (filtered by org/team)
 * - POST   /api/admin/tools - Create tool
 * - PUT    /api/admin/tools/:toolId - Update tool
 * - DELETE /api/admin/tools/:toolId - Delete tool
 * - PUT    /api/admin/tools/bulk/scope - Bulk update tool scopes
 * - GET    /api/admin/tools/mcp-servers - List MCP servers
 * - POST   /api/admin/tools/mcp-servers - Create MCP server
 * - PUT    /api/admin/tools/mcp-servers/:serverId - Update MCP server
 * - DELETE /api/admin/tools/mcp-servers/:serverId - Delete MCP server
 * - POST   /api/admin/tools/mcp-servers/:serverId/load-tools - Load tools from MCP server
 * - POST   /api/admin/tools/mcp-servers/test-config - Test MCP server config
 * - POST   /api/admin/tools/mcp-servers/:serverId/test - Test MCP server connectivity
 * 
 * @module routes/tools
 */

import express from 'express';
import { getPool } from '../config/database.js';
import { invalidateCache as invalidateDbCache } from '../config/db-loaders.js';
import { invalidateCache as invalidateLoaderCache } from '../config/loader.js';
import { syncTeamAssociations, syncTeamAssociationsWithClient } from '../lib/team-helpers.js';
import {
  sanitizeJSON,
  ensureAuthenticated,
  ensureOrgAdmin,
} from '../utils/route-helpers.js';

const router = express.Router();

// ============================================================================
// Constants and Utilities
// ============================================================================

/**
 * Custom validation error class
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/**
 * UUID validation regex (RFC 4122 compliant)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Invalidates configuration caches after changes
 */
function invalidateConfigCaches() {
  invalidateDbCache();
  invalidateLoaderCache();
}

// ============================================================================
// Data Transformation Functions
// ============================================================================

/**
 * Transform database row to camelCase tool object
 * @param {Object} row - Database row (snake_case)
 * @returns {Object} Tool object (camelCase)
 */
const toCamelTool = row => ({
  id: row.id,
  toolKey: row.tool_key,
  toolName: row.tool_name,
  toolType: row.tool_type,
  description: row.description,
  metadata: row.metadata || {},
  config: row.config || {},
  organizationId: row.organization_id,
  teams: row.teams || [],
  enabled: row.enabled,
  readonly: row.readonly,
  mcpServerId: row.mcp_server_id,
  remoteToolName: row.remote_tool_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  mcpServer: row.mcp_server_id
    ? {
        id: row.mcp_server_id,
        serverKey: row.server_key,
        displayName: row.mcp_display_name,
        transport: row.transport,
      }
    : null,
});

/**
 * Transform database row to camelCase MCP server object
 * @param {Object} row - Database row (snake_case)
 * @returns {Object} Server object (camelCase)
 */
const toCamelServer = row => ({
  id: row.id,
  serverKey: row.server_key,
  displayName: row.display_name,
  transport: row.transport,
  command: row.command,
  args: Array.isArray(row.args) ? row.args : [],
  env: row.env || {},
  url: row.url || null,
  metadata: row.metadata || {},
  organizationId: row.organization_id,
  teams: row.teams || [], // Array of {id, name} objects from the view
  enabled: row.enabled,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ============================================================================
// Tool Routes
// ============================================================================

/**
 * GET /api/admin/tools
 * Lists all tools for an organization, optionally filtered by team(s).
 * 
 * Query Parameters:
 * - organizationId: string (required) - Organization ID
 * - teamIds: string | string[] (optional) - Team ID(s) for filtering
 * 
 * Returns tools that are either:
 * 1. Organization-wide (no team restrictions), OR
 * 2. Assigned to at least one of the specified teams
 * 
 * For global tools (frontend, builtin, backend), returns org-level enabled state.
 * For team-specific queries, returns team-level enabled states.
 */
router.get('/', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { organizationId, teamIds: teamIdsParam = null } = req.query;
    // Handle both single teamIds param and array of teamIds params
    const teamIds = Array.isArray(teamIdsParam) ? teamIdsParam : (teamIdsParam ? [teamIdsParam] : []);

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const params = [organizationId];
    let teamFilter = '';
    
    // If teamIds are specified, filter to show only tools that:
    // 1. Are organization-wide (no team restrictions), OR
    // 2. Include at least one of the specified teams
    if (teamIds.length > 0) {
      teamFilter = `
        AND (
          NOT EXISTS (SELECT 1 FROM tool_teams tt WHERE tt.tool_id = t.id)
          OR EXISTS (
            SELECT 1 FROM tool_teams tt 
            WHERE tt.tool_id = t.id AND tt.team_id = ANY($2::text[])
          )
        )
      `;
      params.push(teamIds);
    }

    // Build team-level enabled state subquery
    // When teamIds are provided, we aggregate the enabled states for those teams
    let teamEnabledSubquery = 'NULL::jsonb';
    if (teamIds.length > 0) {
      teamEnabledSubquery = `
        (SELECT jsonb_object_agg(tts.team_id, tts.enabled)
         FROM team_tool_settings tts
         WHERE tts.tool_id = t.id AND tts.team_id = ANY($${params.length + 1}::text[]))
      `;
      params.push(teamIds);
    }

    const { rows } = await pool.query(
      `
        SELECT
          t.*,
          ms.server_key,
          ms.display_name AS mcp_display_name,
          ms.transport,
          COALESCE(
            (SELECT json_agg(json_build_object('id', team.id, 'name', team.name))
             FROM tool_teams tt
             JOIN team ON team.id = tt.team_id
             WHERE tt.tool_id = t.id
               AND team."organizationId" = $1),
            '[]'::json
          ) as teams,
          -- Return team-specific enabled states as a JSON object
          ${teamEnabledSubquery} as team_enabled_states,
          -- For global/org tools, calculate effective enabled state
          -- Priority: team settings > org settings > tool default
          CASE 
            WHEN t.organization_id IS NULL THEN 
              COALESCE(ots.enabled, t.enabled)
            ELSE 
              t.enabled
          END as enabled
        FROM tools t
        LEFT JOIN mcp_servers ms ON ms.id = t.mcp_server_id
        LEFT JOIN organization_tool_settings ots ON ots.tool_id = t.id AND ots.organization_id = $1
        WHERE (t.organization_id IS NULL OR t.organization_id = $1)
          AND t.deleted_at IS NULL
          ${teamFilter}
        ORDER BY
          CASE t.tool_type
            WHEN 'frontend' THEN 1
            WHEN 'builtin' THEN 2
            WHEN 'backend' THEN 3
            WHEN 'mcp' THEN 4
            ELSE 5
          END,
          CASE 
            WHEN t.tool_type = 'mcp' THEN COALESCE(ms.display_name, ms.server_key, '')
            ELSE ''
          END ASC,
          COALESCE(t.tool_name, t.tool_key) ASC
      `,
      params,
    );

    res.json({
      tools: rows.map(toCamelTool),
      count: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/tools
 * Creates a new tool for the organization.
 * 
 * Body:
 * - organizationId: string (required) - Organization ID
 * - teamIds: string[] (optional) - Team IDs to associate with the tool
 * - toolKey: string (required) - Unique key for the tool
 * - toolName: string (required) - Display name
 * - toolType: 'frontend' | 'backend' | 'builtin' | 'mcp' (required)
 * - description: string (optional)
 * - metadata: object (optional) - Tool metadata
 * - config: object (optional) - Tool configuration
 * - enabled: boolean (optional, default: true)
 * - mcpServerId: string (required for MCP tools) - MCP server ID
 * - remoteToolName: string (required for MCP tools) - Remote tool identifier
 */
router.post('/', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const {
      organizationId,
      teamIds = [],
      toolKey,
      toolName,
      toolType,
      description,
      metadata,
      config,
      enabled = true,
      mcpServerId = null,
      remoteToolName = null,
    } = req.body || {};

    if (!toolKey || typeof toolKey !== 'string') {
      throw new ValidationError('toolKey is required');
    }

    if (!toolName || typeof toolName !== 'string') {
      throw new ValidationError('toolName is required');
    }

    if (!toolType || !['frontend', 'backend', 'builtin', 'mcp'].includes(toolType)) {
      throw new ValidationError('toolType must be one of frontend, backend, builtin, or mcp');
    }

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    // Validate teams if provided
    if (teamIds && teamIds.length > 0) {
      const { rows } = await pool.query(
        'SELECT id FROM team WHERE id = ANY($1::text[]) AND "organizationId" = $2',
        [teamIds, organizationId],
      );
      if (rows.length !== teamIds.length) {
        return res.status(404).json({ error: 'One or more teams not found in organization' });
      }
    }

    if (toolType === 'mcp') {
      if (!mcpServerId || !UUID_REGEX.test(mcpServerId)) {
        throw new ValidationError('mcpServerId is required for MCP tools');
      }
      if (!remoteToolName || typeof remoteToolName !== 'string') {
        throw new ValidationError('remoteToolName is required for MCP tools');
      }
    }

    const duplicate = await pool.query(
      `
        SELECT 1
        FROM tools
        WHERE tool_key = $1
          AND COALESCE(organization_id, 'global') = COALESCE($2, 'global')
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [toolKey.trim(), organizationId || null],
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({ error: 'Tool key already exists in this organization' });
    }

    const metadataJSON = sanitizeJSON(metadata, {});
    const configJSON = sanitizeJSON(config, {});

    const insertResult = await pool.query(
      `
        INSERT INTO tools (
          tool_key,
          tool_name,
          tool_type,
          description,
          metadata,
          config,
          organization_id,
          enabled,
          readonly,
          mcp_server_id,
          remote_tool_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `,
      [
        toolKey.trim(),
        toolName.trim(),
        toolType,
        description?.trim() || null,
        metadataJSON,
        configJSON,
        organizationId || null,
        Boolean(enabled),
        toolType === 'frontend',
        toolType === 'mcp' ? mcpServerId : null,
        toolType === 'mcp' ? remoteToolName : null,
      ],
    );
    
    const toolId = insertResult.rows[0].id;
    
    // Sync team associations
    if (teamIds && teamIds.length > 0) {
      await syncTeamAssociations(pool, 'tool_teams', 'tool_id', toolId, teamIds);
    }

    invalidateConfigCaches();

    const created = await pool.query(
      `
        SELECT
          t.*,
          ms.server_key,
          ms.display_name AS mcp_display_name,
          ms.transport,
          COALESCE(
            (SELECT json_agg(json_build_object('id', tt.team_id))
             FROM tool_teams tt WHERE tt.tool_id = t.id),
            '[]'::json
          ) as teams
        FROM tools t
        LEFT JOIN mcp_servers ms ON ms.id = t.mcp_server_id
        WHERE t.id = $1 AND t.deleted_at IS NULL
      `,
      [toolId],
    );

    res.status(201).json({ tool: toCamelTool(created.rows[0]) });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * PUT /api/admin/tools/:toolId
 * Updates an existing tool.
 * 
 * Read-only tools (frontend, backend, builtin) can only have enabled state modified.
 * MCP tools can have all fields updated.
 * 
 * Supports team-level enabled state overrides via teamEnabledStates parameter.
 * 
 * Body:
 * - organizationId: string (required) - Organization ID
 * - teamIds: string[] (optional) - Update team associations
 * - toolName: string (optional) - Update display name
 * - description: string (optional) - Update description
 * - metadata: object (optional) - Update metadata
 * - config: object (optional) - Update configuration
 * - enabled: boolean (optional) - Update enabled state
 * - teamEnabledStates: object (optional) - Team-level enabled overrides { teamId: boolean }
 * - remoteToolName: string (optional, MCP only) - Update remote tool name
 * - mcpServerId: string (optional, MCP only) - Update MCP server
 */
router.put('/:toolId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { toolId } = req.params;
    if (!UUID_REGEX.test(toolId)) {
      throw new ValidationError('Invalid tool id');
    }

    const {
      organizationId,
      teamIds = [],
      toolName,
      description,
      metadata,
      config,
      enabled,
      teamEnabledStates, // Object: { teamId: boolean, ... } for team-level control
      remoteToolName,
      mcpServerId,
    } = req.body || {};

    const pool = getPool();
    
    // Check if the tool exists first to determine if it's global
    const toolCheckResult = await pool.query(
      'SELECT organization_id, tool_type, readonly FROM tools WHERE id = $1 AND deleted_at IS NULL',
      [toolId]
    );

    if (toolCheckResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    const toolInfo = toolCheckResult.rows[0];
    const isGlobalTool = !toolInfo.organization_id;

    // For global tools (frontend, builtin, backend), use the provided organizationId for auth
    // For scoped tools, use the tool's organizationId
    const authOrgId = isGlobalTool ? organizationId : toolInfo.organization_id;
    
    const roles = await ensureOrgAdmin(pool, authOrgId, session.user.id, res);
    if (!roles) return;

    const existingResult = await pool.query(
      `
        SELECT
          t.*,
          ms.server_key,
          ms.display_name AS mcp_display_name,
          ms.transport,
          COALESCE(
            (SELECT json_agg(json_build_object('id', tt.team_id))
             FROM tool_teams tt WHERE tt.tool_id = t.id),
            '[]'::json
          ) as teams
        FROM tools t
        LEFT JOIN mcp_servers ms ON ms.id = t.mcp_server_id
        WHERE t.id = $1 AND t.deleted_at IS NULL
          AND COALESCE(t.organization_id, 'global') = COALESCE($2, 'global')
      `,
      [toolId, isGlobalTool ? null : (organizationId || null)],
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tool not found in this scope' });
    }

    const existing = existingResult.rows[0];

    if (existing.readonly && enabled === undefined && metadata === undefined && config === undefined && toolName === undefined && description === undefined) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const metadataJSON = metadata !== undefined ? sanitizeJSON(metadata, {}) : existing.metadata || {};
    const configJSON = config !== undefined ? sanitizeJSON(config, {}) : existing.config || {};

    let nextMcpServerId = existing.mcp_server_id;
    let nextRemoteToolName = existing.remote_tool_name;

    if (existing.tool_type === 'mcp') {
      if (mcpServerId !== undefined) {
        if (mcpServerId && !UUID_REGEX.test(mcpServerId)) {
          throw new ValidationError('mcpServerId must be a valid UUID');
        }
        nextMcpServerId = mcpServerId || null;
      }
      if (remoteToolName !== undefined) {
        if (remoteToolName && typeof remoteToolName !== 'string') {
          throw new ValidationError('remoteToolName must be a string');
        }
        nextRemoteToolName = remoteToolName || null;
      }
    }

    // Handle team-level enabled states if provided
    if (teamEnabledStates && typeof teamEnabledStates === 'object') {
      const teamEntries = Object.entries(teamEnabledStates);
      
      for (const [teamId, teamEnabled] of teamEntries) {
        // Validate that the team belongs to this organization
        const teamCheck = await pool.query(
          'SELECT id FROM team WHERE id = $1 AND "organizationId" = $2',
          [teamId, organizationId]
        );
        
        if (teamCheck.rows.length === 0) {
          throw new ValidationError(`Invalid team id: ${teamId} for organization`);
        }
        
        // Store team-specific enabled state
        await pool.query(
          `
            INSERT INTO team_tool_settings (team_id, tool_id, enabled, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (team_id, tool_id) 
            DO UPDATE SET enabled = $3, updated_at = NOW()
          `,
          [teamId, toolId, Boolean(teamEnabled)]
        );
      }
    }
    
    // Handle organization-level enabled state (if not overridden by team settings)
    if (enabled !== undefined && isGlobalTool) {
      // For global tools, store enabled state in organization_tool_settings
      await pool.query(
        `
          INSERT INTO organization_tool_settings (organization_id, tool_id, enabled, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (organization_id, tool_id) 
          DO UPDATE SET enabled = $3, updated_at = NOW()
        `,
        [organizationId, toolId, Boolean(enabled)]
      );
    } else {
      // For scoped tools or when updating other fields, update the tool directly
      const fieldsToUpdate = [];
      const updateParams = [];
      let paramCount = 1;
      
      if (toolName) {
        fieldsToUpdate.push(`tool_name = $${paramCount++}`);
        updateParams.push(toolName.trim());
      }
      if (description !== undefined) {
        fieldsToUpdate.push(`description = $${paramCount++}`);
        updateParams.push(description?.trim() || null);
      }
      fieldsToUpdate.push(`metadata = $${paramCount++}`);
      updateParams.push(metadataJSON);
      fieldsToUpdate.push(`config = $${paramCount++}`);
      updateParams.push(configJSON);
      
      // Only update enabled on the tool itself if it's a scoped tool
      if (enabled !== undefined && !isGlobalTool) {
        fieldsToUpdate.push(`enabled = $${paramCount++}`);
        updateParams.push(Boolean(enabled));
      }
      
      if (existing.tool_type === 'mcp') {
        fieldsToUpdate.push(`mcp_server_id = $${paramCount++}`);
        updateParams.push(nextMcpServerId);
        fieldsToUpdate.push(`remote_tool_name = $${paramCount++}`);
        updateParams.push(nextRemoteToolName);
      }
      
      fieldsToUpdate.push(`updated_at = NOW()`);
      updateParams.push(toolId);
      
      if (fieldsToUpdate.length > 1) { // More than just updated_at
        await pool.query(
          `UPDATE tools SET ${fieldsToUpdate.join(', ')} WHERE id = $${paramCount}`,
          updateParams
        );
      }
    }
    
    // Sync team associations if provided
    if (teamIds !== undefined) {
      // For MCP tools, validate that the scope doesn't exceed the MCP server's scope
      if (existing.tool_type === 'mcp' && nextMcpServerId) {
        const serverTeamsResult = await pool.query(
          `SELECT team_id FROM mcp_server_teams WHERE mcp_server_id = $1`,
          [nextMcpServerId]
        );
        
        const serverTeamIds = serverTeamsResult.rows.map(row => row.team_id);
        
        // If server has team restrictions, validate tool scope
        if (serverTeamIds.length > 0) {
          // If trying to set org-wide (empty teamIds), reject it
          if (teamIds.length === 0) {
            return res.status(400).json({
              error: `Cannot set org-wide scope for tool from a team-restricted MCP server. The MCP server is restricted to specific teams.`
            });
          }
          
          // If setting specific teams, they must be a subset of server's teams
          const invalidTeams = teamIds.filter(teamId => !serverTeamIds.includes(teamId));
          if (invalidTeams.length > 0) {
            return res.status(400).json({
              error: `Cannot assign tool to teams that don't have access to its MCP server. Invalid team IDs: ${invalidTeams.join(', ')}`
            });
          }
        }
      }
      
      await syncTeamAssociations(pool, 'tool_teams', 'tool_id', toolId, teamIds);
    }

    invalidateConfigCaches();

    const updated = await pool.query(
      `
        SELECT
          t.*,
          ms.server_key,
          ms.display_name AS mcp_display_name,
          ms.transport,
          COALESCE(
            (SELECT json_agg(json_build_object('id', tt.team_id))
             FROM tool_teams tt WHERE tt.tool_id = t.id),
            '[]'::json
          ) as teams,
          -- Return team-specific enabled states as a JSON object
          (SELECT jsonb_object_agg(tts.team_id, tts.enabled)
           FROM team_tool_settings tts
           JOIN team tm ON tm.id = tts.team_id
           WHERE tts.tool_id = t.id AND tm."organizationId" = $2
          ) as team_enabled_states,
          -- Return the effective enabled state for this organization
          CASE 
            WHEN t.organization_id IS NULL THEN 
              COALESCE(ots.enabled, t.enabled)
            ELSE 
              t.enabled
          END as enabled
        FROM tools t
        LEFT JOIN mcp_servers ms ON ms.id = t.mcp_server_id
        LEFT JOIN organization_tool_settings ots ON ots.tool_id = t.id AND ots.organization_id = $2
        WHERE t.id = $1 AND t.deleted_at IS NULL
      `,
      [toolId, organizationId],
    );

    res.json({ tool: toCamelTool(updated.rows[0]) });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * PUT /api/admin/tools/bulk/scope
 * Bulk update team associations for multiple tools.
 * 
 * Validates that MCP tools don't exceed their server's scope restrictions.
 * 
 * Body:
 * - toolIds: string[] (required) - Array of tool IDs to update
 * - organizationId: string (required) - Organization ID
 * - teamIds: string[] (optional) - New team associations (empty = org-wide)
 */
router.put('/bulk/scope', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { toolIds, organizationId, teamIds } = req.body;

    if (!Array.isArray(toolIds) || toolIds.length === 0) {
      throw new ValidationError('toolIds must be a non-empty array');
    }

    // Validate all tool IDs
    for (const toolId of toolIds) {
      if (!UUID_REGEX.test(toolId)) {
        throw new ValidationError(`Invalid tool id: ${toolId}`);
      }
    }

    if (!organizationId) {
      throw new ValidationError('organizationId is required');
    }

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    // Validate teamIds if provided
    if (teamIds !== undefined) {
      if (!Array.isArray(teamIds)) {
        throw new ValidationError('teamIds must be an array');
      }
      // Validate that all team IDs belong to the organization
      for (const teamId of teamIds) {
        if (teamId) {
          const teamResult = await pool.query(
            'SELECT id FROM team WHERE id = $1 AND "organizationId" = $2',
            [teamId, organizationId]
          );
          if (teamResult.rows.length === 0) {
            throw new ValidationError(`Invalid team id: ${teamId}`);
          }
        }
      }
    }

    // Update all tools in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const toolId of toolIds) {
        // Check if tool exists and get its MCP server info
        const toolCheckResult = await client.query(
          'SELECT organization_id, readonly, tool_type, mcp_server_id FROM tools WHERE id = $1 AND deleted_at IS NULL',
          [toolId]
        );

        if (toolCheckResult.rows.length === 0) {
          throw new ValidationError(`Tool not found: ${toolId}`);
        }

        const toolInfo = toolCheckResult.rows[0];
        
        // For MCP tools, validate that the scope doesn't exceed the MCP server's scope
        if (toolInfo.tool_type === 'mcp' && toolInfo.mcp_server_id) {
          // Get the MCP server's team associations
          const serverTeamsResult = await client.query(
            `SELECT team_id FROM mcp_server_teams WHERE mcp_server_id = $1`,
            [toolInfo.mcp_server_id]
          );
          
          const serverTeamIds = serverTeamsResult.rows.map(row => row.team_id);
          
          // If server has team restrictions, validate tool scope
          if (serverTeamIds.length > 0) {
            // If trying to set org-wide (empty teamIds), reject it
            if (!teamIds || teamIds.length === 0) {
              throw new ValidationError(
                `Cannot set org-wide scope for tool from a team-restricted MCP server. ` +
                `Tool ID: ${toolId}. The MCP server is restricted to specific teams.`
              );
            }
            
            // If setting specific teams, they must be a subset of server's teams
            const invalidTeams = teamIds.filter(teamId => !serverTeamIds.includes(teamId));
            if (invalidTeams.length > 0) {
              throw new ValidationError(
                `Cannot assign tool to teams that don't have access to its MCP server. ` +
                `Tool ID: ${toolId}, Invalid team IDs: ${invalidTeams.join(', ')}`
              );
            }
          }
          // If server is org-wide (no team restrictions), tool can be org-wide or team-specific
        }
        
        // Sync team associations using the transaction client
        // Note: We allow scope changes for all tools, including readonly ones
        // The readonly flag only prevents editing tool properties (name, description, etc.)
        if (teamIds !== undefined) {
          await syncTeamAssociationsWithClient(client, 'tool_teams', 'tool_id', toolId, teamIds);
        }
      }

      await client.query('COMMIT');
      invalidateConfigCaches();

      res.json({ 
        success: true, 
        message: `Updated ${toolIds.length} tool(s)`,
        updatedCount: toolIds.length
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * DELETE /api/admin/tools/:toolId
 * Deletes a tool (MCP tools only).
 * 
 * Read-only tools (frontend, backend, builtin) cannot be deleted.
 * Prevents deletion if tool is assigned to any agents.
 * 
 * Query Parameters:
 * - organizationId: string (required) - Organization ID
 */
router.delete('/:toolId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { toolId } = req.params;
    if (!UUID_REGEX.test(toolId)) {
      throw new ValidationError('Invalid tool id');
    }

    const { organizationId } = req.query;

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const existingResult = await pool.query(
      `
        SELECT readonly, tool_type
        FROM tools
        WHERE id = $1
          AND COALESCE(organization_id, 'global') = COALESCE($2, 'global')
          AND deleted_at IS NULL
      `,
      [toolId, organizationId || null],
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tool not found in this scope' });
    }

    const existing = existingResult.rows[0];

    if (existing.readonly) {
      const typeLabel = existing.tool_type === 'frontend' ? 'Frontend' : 
                       existing.tool_type === 'backend' ? 'Backend' :
                       existing.tool_type === 'builtin' ? 'Built-in' : 'This';
      return res.status(400).json({ 
        error: `${typeLabel} tools cannot be deleted. They can only be enabled or disabled.` 
      });
    }

    const mapping = await pool.query(
      'SELECT 1 FROM agent_tool_mappings WHERE tool_id = $1 LIMIT 1',
      [toolId],
    );

    if (mapping.rows.length > 0) {
      return res.status(400).json({ error: 'Tool is assigned to one or more agents' });
    }

    // Soft delete: set deleted_at timestamp instead of hard delete
    await pool.query(
      'UPDATE tools SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL',
      [toolId]
    );

    invalidateConfigCaches();

    res.json({ success: true });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    next(err);
  }
});

// ============================================================================
// MCP Server Routes
// ============================================================================

/**
 * GET /api/admin/tools/mcp-servers
 * Lists all MCP servers for an organization, optionally filtered by team(s).
 * 
 * Query Parameters:
 * - organizationId: string (required) - Organization ID
 * - teamIds: string | string[] (optional) - Team ID(s) for filtering
 */
router.get('/mcp-servers', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { organizationId, teamIds: teamIdsParam = null } = req.query;
    // Handle both single teamIds param and array of teamIds params
    const teamIds = Array.isArray(teamIdsParam) ? teamIdsParam : (teamIdsParam ? [teamIdsParam] : []);

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const params = [organizationId];
    let teamFilter = '';
    
    // If teamIds are specified, filter to show only servers that:
    // 1. Are organization-wide (no team restrictions), OR
    // 2. Include at least one of the specified teams
    if (teamIds.length > 0) {
      teamFilter = `
        AND (
          NOT EXISTS (SELECT 1 FROM mcp_server_teams st WHERE st.mcp_server_id = s.id)
          OR EXISTS (
            SELECT 1 FROM mcp_server_teams st 
            WHERE st.mcp_server_id = s.id AND st.team_id = ANY($2::text[])
          )
        )
      `;
      params.push(teamIds);
    }

    // Get all servers for the organization with their teams (filtered by org and optionally by team)
    const { rows } = await pool.query(
      `
        SELECT 
          s.*,
          COALESCE(
            (SELECT json_agg(json_build_object('id', team.id, 'name', team.name))
             FROM mcp_server_teams st
             JOIN team ON team.id = st.team_id
             WHERE st.mcp_server_id = s.id
               AND team."organizationId" = $1),
            '[]'::json
          ) as teams
        FROM mcp_servers s
        WHERE s.organization_id = $1
          AND s.deleted_at IS NULL
          ${teamFilter}
        ORDER BY COALESCE(s.display_name, s.server_key) ASC
      `,
      params,
    );

    res.json({
      servers: rows.map(toCamelServer),
      count: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/tools/mcp-servers
 * Creates a new MCP server for the organization.
 * 
 * Body:
 * - organizationId: string (required)
 * - teamIds: string[] (optional) - Team associations
 * - serverKey: string (required) - Unique key
 * - displayName: string (required) - Display name
 * - transport: 'stdio' | 'sse' | 'ws' (default: 'stdio')
 * - command: string (optional, for stdio) - Command to run
 * - args: string[] (optional) - Command arguments
 * - env: object (optional) - Environment variables
 * - url: string (optional, for sse/ws) - Server URL
 * - metadata: object (optional)
 * - enabled: boolean (default: true)
 */
router.post('/mcp-servers', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const {
      organizationId,
      teamIds = [], // Array of team IDs for multi-team support
      serverKey,
      displayName,
      transport = 'stdio',
      command = null,
      args = [],
      env = {},
      url = null,
      metadata = {},
      enabled = true,
    } = req.body || {};

    if (!organizationId || typeof organizationId !== 'string') {
      throw new ValidationError('organizationId is required');
    }

    if (!serverKey || typeof serverKey !== 'string') {
      throw new ValidationError('serverKey is required');
    }

    if (!displayName || typeof displayName !== 'string') {
      throw new ValidationError('displayName is required');
    }

    if (!['stdio', 'sse', 'ws'].includes(transport)) {
      throw new ValidationError('transport must be stdio, sse, or ws');
    }

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    // Validate teams if provided
    if (teamIds.length > 0) {
      const { rows } = await pool.query(
        'SELECT id FROM team WHERE id = ANY($1::text[]) AND "organizationId" = $2',
        [teamIds, organizationId],
      );
      if (rows.length !== teamIds.length) {
        return res.status(404).json({ error: 'One or more teams not found in organization' });
      }
    }

    // Check for duplicate server key in organization
    const duplicate = await pool.query(
      `SELECT 1 FROM mcp_servers
        WHERE server_key = $1
         AND organization_id = $2
         AND deleted_at IS NULL
       LIMIT 1`,
      [serverKey.trim(), organizationId],
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({ error: 'Server key already exists in this organization' });
    }

    const argsArray = Array.isArray(args) ? args.map(value => String(value)) : [];
    const envJSON = sanitizeJSON(env, {});
    const metadataJSON = sanitizeJSON(metadata, {});

    const insertResult = await pool.query(
      `
        INSERT INTO mcp_servers (
          server_key,
          display_name,
          transport,
          command,
          args,
          env,
          url,
          metadata,
          organization_id,
          enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `,
      [
        serverKey.trim(),
        displayName.trim(),
        transport,
        command?.trim() || null,
        argsArray,
        envJSON,
        url?.trim() || null,
        metadataJSON,
        organizationId,
        Boolean(enabled),
      ],
    );

    const serverId = insertResult.rows[0].id;

    // Associate with teams if provided
    if (teamIds.length > 0) {
      await syncTeamAssociations(pool, 'mcp_server_teams', 'mcp_server_id', serverId, teamIds);
    }

    invalidateConfigCaches();

    // Get created server with teams
    const created = await pool.query('SELECT * FROM mcp_servers_with_teams WHERE id = $1 AND deleted_at IS NULL', [serverId]);

    res.status(201).json({ server: toCamelServer(created.rows[0]) });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * PUT /api/admin/tools/mcp-servers/:serverId
 * Updates an existing MCP server.
 * 
 * Body:
 * - organizationId: string (required)
 * - teamIds: string[] (optional) - Update team associations
 * - displayName: string (optional)
 * - transport: 'stdio' | 'sse' | 'ws' (optional)
 * - command: string (optional)
 * - args: string[] (optional)
 * - env: object (optional)
 * - url: string (optional)
 * - metadata: object (optional)
 * - enabled: boolean (optional)
 */
router.put('/mcp-servers/:serverId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { serverId } = req.params;
    if (!UUID_REGEX.test(serverId)) {
      throw new ValidationError('Invalid server id');
    }

    const {
      organizationId,
      teamIds = [], // Array of team IDs for multi-team support
      displayName,
      transport,
      command,
      args,
      env,
      url,
      metadata,
      enabled,
    } = req.body || {};

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    // Validate teams if provided
    if (teamIds.length > 0) {
      const { rows } = await pool.query(
        'SELECT id FROM team WHERE id = ANY($1::text[]) AND "organizationId" = $2',
        [teamIds, organizationId],
      );
      if (rows.length !== teamIds.length) {
        return res.status(404).json({ error: 'One or more teams not found in organization' });
      }
    }

    const existingResult = await pool.query(
      `SELECT * FROM mcp_servers
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [serverId, organizationId],
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'MCP server not found in this organization' });
    }

    const existing = existingResult.rows[0];

    if (transport && !['stdio', 'sse', 'ws'].includes(transport)) {
      throw new ValidationError('transport must be stdio, sse, or ws');
    }

    const argsArray = args !== undefined ? (Array.isArray(args) ? args.map(value => String(value)) : []) : existing.args;
    const envJSON = env !== undefined ? sanitizeJSON(env, {}) : existing.env || {};
    const metadataJSON = metadata !== undefined ? sanitizeJSON(metadata, {}) : existing.metadata || {};

    await pool.query(
      `
        UPDATE mcp_servers
        SET
          display_name = $1,
          transport = $2,
          command = $3,
          args = $4,
          env = $5,
          url = $6,
          metadata = $7,
          enabled = COALESCE($8, enabled),
          updated_at = NOW()
        WHERE id = $9
      `,
      [
        displayName ? displayName.trim() : existing.display_name,
        transport || existing.transport,
        command !== undefined ? (command?.trim() || null) : existing.command,
        args !== undefined ? argsArray : existing.args,
        env !== undefined ? envJSON : existing.env,
        url !== undefined ? (url?.trim() || null) : existing.url,
        metadata !== undefined ? metadataJSON : existing.metadata,
        enabled === undefined ? null : Boolean(enabled),
        serverId,
      ],
    );

    // Update team associations (always sync when teamIds is provided in request)
    if (teamIds !== undefined) {
      await syncTeamAssociations(pool, 'mcp_server_teams', 'mcp_server_id', serverId, teamIds);
    }

    invalidateConfigCaches();

    // Get updated server with teams
    const updated = await pool.query('SELECT * FROM mcp_servers_with_teams WHERE id = $1 AND deleted_at IS NULL', [serverId]);
    res.json({ server: toCamelServer(updated.rows[0]) });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * DELETE /api/admin/tools/mcp-servers/:serverId
 * Deletes an MCP server.
 * 
 * Prevents deletion if server still has tools assigned.
 * 
 * Query Parameters:
 * - organizationId: string (required)
 */
router.delete('/mcp-servers/:serverId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { serverId } = req.params;
    if (!UUID_REGEX.test(serverId)) {
      throw new ValidationError('Invalid server id');
    }

    const { organizationId } = req.query;

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const existingResult = await pool.query(
      `SELECT id FROM mcp_servers
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [serverId, organizationId],
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'MCP server not found in this organization' });
    }

    const toolCheck = await pool.query(
      'SELECT 1 FROM tools WHERE mcp_server_id = $1 AND deleted_at IS NULL LIMIT 1',
      [serverId],
    );

    if (toolCheck.rows.length > 0) {
      return res.status(400).json({ error: 'MCP server still has tools assigned' });
    }

    // Soft delete: set deleted_at timestamp instead of hard delete
    await pool.query(
      'UPDATE mcp_servers SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL',
      [serverId]
    );

    invalidateConfigCaches();

    res.json({ success: true });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/admin/tools/mcp-servers/:serverId/load-tools
 * Loads tools from an MCP server by connecting to it via Python backend.
 * 
 * Creates or updates tools in the database based on what the MCP server exposes.
 * Tool scope automatically matches the MCP server's scope (org-wide or team-specific).
 * 
 * Body:
 * - organizationId: string (required)
 */
router.post('/mcp-servers/:serverId/load-tools', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { serverId } = req.params;
    if (!UUID_REGEX.test(serverId)) {
      throw new ValidationError('Invalid server id');
    }

    const { organizationId } = req.body || {};

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    // Fetch the MCP server details with scope check
    // Server must be either global (NULL org) or belong to the specified org
    const serverResult = await pool.query(
      `SELECT ms.*,
              COALESCE(
                (SELECT json_agg(json_build_object('id', mst.team_id))
                 FROM mcp_server_teams mst WHERE mst.mcp_server_id = ms.id),
                '[]'::json
              ) as teams
       FROM mcp_servers ms
       WHERE ms.id = $1 
       AND (ms.organization_id IS NULL OR ms.organization_id = $2)
       AND ms.deleted_at IS NULL`,
      [serverId, organizationId]
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({ error: 'MCP server not found in this scope' });
    }

    const server = serverResult.rows[0];

    // Make a request to the Python backend to list tools from this MCP server
    const pythonBackendUrl = process.env.PYDANTIC_SERVICE_URL || 'http://localhost:8001';
    
    let response;
    try {
      response = await fetch(`${pythonBackendUrl}/api/admin/mcp-servers/${serverId}/tools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverConfig: {
            transport: server.transport,
            command: server.command,
            args: server.args,
            url: server.url,
            env: server.env || {},
          },
        }),
      });
    } catch (fetchErr) {
      console.error('[tools] Failed to reach Python backend for loading tools:', fetchErr.message);
      return res.status(503).json({
        error: 'Python backend unavailable',
        details: `Could not connect to Python backend at ${pythonBackendUrl}. Please ensure it is running.`,
      });
    }

    if (!response.ok) {
      const result = await response.json().catch(() => ({ error: 'Unknown error' }));
      return res.status(response.status).json({
        error: result.error || 'Failed to load tools from MCP server',
        details: result.details,
      });
    }

    const { tools: availableTools } = await response.json();

    // Insert or update tools in the database
    const insertedTools = [];
    for (const tool of availableTools) {
      const toolKey = `${server.server_key}_${tool.name}`;
      
      // Check if tool already exists
      const existingTool = await pool.query(
        'SELECT id FROM tools WHERE tool_key = $1 AND mcp_server_id = $2',
        [toolKey, serverId]
      );

      if (existingTool.rows.length > 0) {
        // Update existing tool
        const updated = await pool.query(
          `UPDATE tools 
           SET tool_name = $1, description = $2, remote_tool_name = $3, metadata = $4, updated_at = CURRENT_TIMESTAMP
           WHERE id = $5
           RETURNING *`,
          [
            tool.displayName || tool.name,
            tool.description || '',
            tool.name,
            JSON.stringify(tool.inputSchema || {}),
            existingTool.rows[0].id
          ]
        );
        
        const existingToolId = existingTool.rows[0].id;
        
        // Sync tool's team associations to match the MCP server's teams
        if (server.teams && Array.isArray(server.teams) && server.teams.length > 0) {
          const teamIds = server.teams.map(t => t.id);
          await syncTeamAssociations(pool, 'tool_teams', 'tool_id', existingToolId, teamIds);
        } else {
          // If server is org-wide, remove any team associations from the tool
          await syncTeamAssociations(pool, 'tool_teams', 'tool_id', existingToolId, []);
        }
        
        // Fetch the tool with teams to return
        const toolWithTeams = await pool.query(
          `SELECT t.*,
                  COALESCE(
                    (SELECT json_agg(json_build_object('id', tt.team_id))
                     FROM tool_teams tt WHERE tt.tool_id = t.id),
                    '[]'::json
                  ) as teams
           FROM tools t WHERE t.id = $1`,
          [existingToolId]
        );
        
        insertedTools.push(toCamelTool(toolWithTeams.rows[0]));
      } else {
        // Insert new tool
        const inserted = await pool.query(
          `INSERT INTO tools (
            tool_key, tool_name, tool_type, description, remote_tool_name, 
            mcp_server_id, organization_id, metadata, enabled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [
            toolKey,
            tool.displayName || tool.name,
            'mcp',
            tool.description || '',
            tool.name,
            serverId,
            server.organization_id,
            JSON.stringify(tool.inputSchema || {}),
            true
          ]
        );
        
        const newToolId = inserted.rows[0].id;
        
        // Associate tool with the same teams as the MCP server
        if (server.teams && Array.isArray(server.teams) && server.teams.length > 0) {
          const teamIds = server.teams.map(t => t.id);
          await syncTeamAssociations(pool, 'tool_teams', 'tool_id', newToolId, teamIds);
        }
        
        // Fetch the tool with teams to return
        const toolWithTeams = await pool.query(
          `SELECT t.*,
                  COALESCE(
                    (SELECT json_agg(json_build_object('id', tt.team_id))
                     FROM tool_teams tt WHERE tt.tool_id = t.id),
                    '[]'::json
                  ) as teams
           FROM tools t
           WHERE t.id = $1`,
          [newToolId]
        );
        insertedTools.push(toCamelTool(toolWithTeams.rows[0]));
      }
    }

    invalidateConfigCaches();

    res.json({ 
      success: true, 
      toolsLoaded: insertedTools.length,
      tools: insertedTools 
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    console.error('[tools] Failed to load MCP server tools:', err);
    res.status(500).json({ error: err.message || 'Failed to load tools from MCP server' });
  }
});

/**
 * POST /api/admin/tools/mcp-servers/test-config
 * Tests MCP server connectivity with a provided configuration (before saving).
 * 
 * Useful for validating server config during creation/editing.
 * 
 * Body:
 * - organizationId: string (required)
 * - serverConfig: object (required)
 *   - transport: 'stdio' | 'sse' | 'ws'
 *   - command: string (for stdio)
 *   - args: string[] (optional)
 *   - url: string (for sse/ws)
 *   - env: object (optional)
 */
router.post('/mcp-servers/test-config', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { organizationId, serverConfig } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    if (!serverConfig) {
      return res.status(400).json({ error: 'serverConfig is required' });
    }

    const pool = getPool();
    
    // Ensure user is org admin
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    // Call Python backend to test connectivity
    const pythonBackendUrl = process.env.PYDANTIC_SERVICE_URL || 'http://localhost:8001';
    
    try {
      const response = await fetch(`${pythonBackendUrl}/api/admin/mcp-servers/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverConfig: {
            transport: serverConfig.transport,
            command: serverConfig.command,
            args: serverConfig.args || [],
            url: serverConfig.url,
            env: serverConfig.env || {},
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: result.error || 'Failed to connect to MCP server',
          details: result.details,
        });
      }

      res.json({
        success: true,
        message: result.message || 'Successfully connected to MCP server',
        serverInfo: result.serverInfo,
      });
    } catch (fetchErr) {
      console.error('[tools] Failed to reach Python backend:', fetchErr.message);
      return res.status(503).json({
        error: 'Python backend unavailable',
        details: `Could not connect to Python backend at ${pythonBackendUrl}. Please ensure it is running.`,
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/tools/mcp-servers/:serverId/test
 * Tests connectivity to an existing MCP server.
 * 
 * Body:
 * - organizationId: string (required)
 * - teamId: string (optional) - For team-specific testing
 */
router.post('/mcp-servers/:serverId/test', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { serverId } = req.params;
    const { organizationId, teamId = null } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();
    
    // Ensure user is org admin
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    // Fetch server details with scope check
    // Server must be either global (NULL org) or belong to the specified org
    const serverResult = await pool.query(
      `SELECT ms.*,
              COALESCE(
                (SELECT json_agg(json_build_object('id', mst.team_id))
                 FROM mcp_server_teams mst WHERE mst.mcp_server_id = ms.id),
                '[]'::json
              ) as teams
       FROM mcp_servers ms
       WHERE ms.id = $1 
       AND (ms.organization_id IS NULL OR ms.organization_id = $2)
       AND ms.deleted_at IS NULL`,
      [serverId, organizationId]
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({ error: 'MCP server not found' });
    }

    const server = toCamelServer(serverResult.rows[0]);

    // Call Python backend to test connectivity
    const pythonBackendUrl = process.env.PYDANTIC_SERVICE_URL || 'http://localhost:8001';
    
    try {
      const response = await fetch(`${pythonBackendUrl}/api/admin/mcp-servers/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverConfig: {
            transport: server.transport,
            command: server.command,
            args: server.args,
            url: server.url,
            env: server.env || {},
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: result.error || 'Failed to connect to MCP server',
          details: result.details,
        });
      }

      res.json({
        success: true,
        message: result.message || 'Successfully connected to MCP server',
        serverInfo: result.serverInfo,
      });
    } catch (fetchErr) {
      console.error('[tools] Failed to reach Python backend:', fetchErr.message);
      return res.status(503).json({
        error: 'Python backend unavailable',
        details: `Could not connect to Python backend at ${pythonBackendUrl}. Please ensure it is running.`,
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;

