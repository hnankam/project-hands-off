/**
 * Configuration API Routes
 *
 * Provides configuration endpoints for the Chrome extension's side panel.
 * Returns data formatted for React components (AgentSelector, ModelSelector).
 *
 * All endpoints require authentication and use active organization/team context.
 *
 * Endpoints:
 * - GET /api/config - Complete configuration (agents + models + defaults)
 * - GET /api/config/agents - List available agents
 * - GET /api/config/models - List available models
 * - GET /api/config/defaults - Get default agent and model
 * - GET /api/config/teams - List user's teams in active organization
 *
 * Response Formats:
 *
 * Agents: { id: "general", label: "General Agent", description: "...", enabled: true }
 * Models: { id: "claude-4.5-haiku", label: "Claude 4.5 Haiku", provider: "Anthropic", enabled: true }
 * Teams: { id: "uuid", name: "Team Name", organizationId: "uuid", isMember: true }
 * Defaults: { default_agent: "general", default_model: "claude-4.5-haiku" }
 */

import { loadModelsConfig, loadAgentsConfig } from '../config/loader.js';
import { getPool } from '../config/database.js';
import { auth } from '../auth/index.js';

// ============================================================================
// Context Resolution
// ============================================================================

/**
 * Resolve active organization and team context from session
 * Supports optional teamId query parameter for team override
 *
 * @param {Object} req - Express request
 * @returns {Promise<Object>} Context object with organizationId, teamId, or error
 */
async function resolveActiveContext(req) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return { errorStatus: 401, errorMessage: 'Unauthorized' };
    }

    const activeOrgId = session.session?.activeOrganizationId || null;
    let activeTeamId = session.session?.activeTeamId || null;
    const requestedTeamId = req.query?.teamId || null;

    // Allow team override via query parameter if user is a member
    if (requestedTeamId && activeOrgId) {
      if (requestedTeamId === activeTeamId) {
        // Already active team, no validation needed
        activeTeamId = requestedTeamId;
      } else {
        // Validate user is a member of requested team
        try {
          const pool = getPool();
          const { rows } = await pool.query(
            `SELECT tm."userId"
             FROM team t
             JOIN "teamMember" tm ON tm."teamId" = t.id
             WHERE t.id = $1
               AND t."organizationId" = $2
               AND tm."userId" = $3
             LIMIT 1`,
            [requestedTeamId, activeOrgId, session.user.id],
          );

          if (rows.length > 0) {
            activeTeamId = requestedTeamId;
          } else {
            console.warn('[Config API] Rejecting team override - user not a member', {
              userId: session.user.id,
              requestedTeamId,
            });
          }
        } catch (dbError) {
          console.error('[Config API] Error validating team override:', dbError.message);
        }
      }
    }

    return {
      organizationId: activeOrgId,
      teamId: activeTeamId,
    };
  } catch (error) {
    console.error('[Config API] Error resolving session context:', error?.message || error);
    return { errorStatus: 401, errorMessage: 'Unauthorized' };
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/config/agents
 * List available agents for the user's active organization/team
 *
 * Query params:
 * - teamId (optional): Override active team context
 *
 * Returns:
 * {
 *   agents: [{ id, label, description, enabled, allowedModels, allowedTools,
 *     requiredWorkspaceCredentials? }],  // merged: agent + auxiliary_agents targets
 *   count: number
 * }
 */
export async function getAgentsHandler(req, res, next) {
  try {
    const context = await resolveActiveContext(req);

    if (context.errorStatus) {
      return res.status(context.errorStatus).json({ error: context.errorMessage });
    }

    if (!context.organizationId || !context.teamId) {
      return res.json({
        agents: [],
        count: 0,
        missingContext: true,
      });
    }

    const config = await loadAgentsConfig({
      organizationId: context.organizationId,
      teamId: context.teamId,
    });

    // Format for AgentSelector component
    // Only include enabled agents (disabled are hidden from sessions page selectors)
    const agents = config.agents
      .filter(agent => agent.enabled)
      .map(agent => ({
        id: agent.type,
        label: agent.name,
        description: agent.description || '',
        enabled: Boolean(agent.enabled),
        allowedModels: agent.allowed_models || null,
        allowedTools: agent.allowed_tools || null,
        organization_id: agent.organization_id || null,
        requiredWorkspaceCredentials:
          Array.isArray(agent.required_workspace_credentials) && agent.required_workspace_credentials.length > 0
            ? agent.required_workspace_credentials
            : null,
      }));

    res.json({
      agents,
      count: agents.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/config/models
 * List available models for the user's active organization/team
 *
 * Query params:
 * - teamId (optional): Override active team context
 *
 * Returns:
 * {
 *   models: [{ id, label, provider, enabled }],
 *   default_model: string,
 *   count: number
 * }
 */
export async function getModelsHandler(req, res, next) {
  try {
    const context = await resolveActiveContext(req);
    console.log('[Config API] getModelsHandler - context:', {
      organizationId: context.organizationId,
      teamId: context.teamId,
      queryTeamId: req.query?.teamId,
    });

    if (context.errorStatus) {
      return res.status(context.errorStatus).json({ error: context.errorMessage });
    }

    if (!context.organizationId || !context.teamId) {
      return res.json({
        models: [],
        count: 0,
        missingContext: true,
      });
    }

    const config = await loadModelsConfig({
      organizationId: context.organizationId,
      teamId: context.teamId,
    });

    // Map provider keys to user-friendly display names
    const providerDisplayNames = {
      anthropic: 'Anthropic',
      anthropic_bedrock: 'Anthropic',
      anthropic_foundry: 'Anthropic',
      google: 'Google',
      azure_openai: 'OpenAI',
      openai: 'OpenAI',
    };

    // Format for ModelSelector component
    // Only include enabled models (disabled are hidden from sessions page selectors)
    const models = config.models
      .filter(model => model.enabled)
      .map(model => ({
        id: model.key,
        label: model.name,
        provider: providerDisplayNames[model.provider] || model.provider,
        enabled: Boolean(model.enabled),
        organization_id: model.organization_id || null,
      }));

    res.json({
      models,
      default_model: config.default_model,
      count: models.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/config/defaults
 * Get default agent and model for the user's active organization/team
 *
 * Query params:
 * - teamId (optional): Override active team context
 *
 * Returns:
 * {
 *   default_agent: string,
 *   default_model: string
 * }
 */
export async function getDefaultsHandler(req, res, next) {
  try {
    const context = await resolveActiveContext(req);

    if (context.errorStatus) {
      return res.status(context.errorStatus).json({ error: context.errorMessage });
    }

    if (!context.organizationId || !context.teamId) {
      return res.json({
        default_agent: null,
        default_model: null,
        missingContext: true,
      });
    }

    const modelsConfig = await loadModelsConfig({
      organizationId: context.organizationId,
      teamId: context.teamId,
    });

    res.json({
      default_agent: modelsConfig.default_agent,
      default_model: modelsConfig.default_model,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/config
 * Get complete configuration (agents + models + defaults)
 *
 * Query params:
 * - teamId (optional): Override active team context
 *
 * Returns:
 * {
 *   agents: [{ id, label, description, allowedModels, allowedTools }],
 *   models: [{ id, label, provider }],
 *   defaults: { agent: string, model: string }
 * }
 *
 * Note: Only enabled agents and models are included
 */
export async function getCompleteConfigHandler(req, res, next) {
  try {
    const context = await resolveActiveContext(req);

    if (context.errorStatus) {
      return res.status(context.errorStatus).json({ error: context.errorMessage });
    }

    if (!context.organizationId || !context.teamId) {
      return res.json({
        agents: [],
        models: [],
        defaults: { agent: null, model: null },
        missingContext: true,
      });
    }

    const [modelsConfig, agentsConfig] = await Promise.all([
      loadModelsConfig({
        organizationId: context.organizationId,
        teamId: context.teamId,
      }),
      loadAgentsConfig({
        organizationId: context.organizationId,
        teamId: context.teamId,
      }),
    ]);

    // Map provider keys to display names
    const providerDisplayNames = {
      anthropic: 'Anthropic',
      anthropic_bedrock: 'Anthropic',
      anthropic_foundry: 'Anthropic',
      google: 'Google',
      azure_openai: 'OpenAI',
      openai: 'OpenAI',
    };

    res.json({
      // Format for AgentSelector: { id, label, description, allowedModels }
      agents: agentsConfig.agents
        .filter(agent => agent.enabled)
        .map(agent => ({
          id: agent.type,
          label: agent.name,
          description: agent.description || '',
          allowedModels: agent.allowed_models || null,
          allowedTools: agent.allowed_tools || null,
        })),
      // Format for ModelSelector: { id, label, provider }
      models: modelsConfig.models
        .filter(model => model.enabled)
        .map(model => ({
          id: model.key,
          label: model.name,
          provider: providerDisplayNames[model.provider] || model.provider,
        })),
      defaults: {
        agent: modelsConfig.default_agent,
        model: modelsConfig.default_model,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/config/teams
 * List all teams in the user's active organization with membership status
 *
 * Returns all teams in the organization, not just teams the user belongs to.
 * Each team includes an `isMember` flag to indicate user's membership status.
 *
 * Returns:
 * {
 *   teams: [{ id, name, organizationId, createdAt, isMember }],
 *   count: number
 * }
 *
 * isMember: true if user is a member of the team, false otherwise
 */
export async function getTeamsHandler(req, res, next) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = session.user.id;
    const pool = getPool();

    // Get active organization ID from session
    let activeOrganizationId = session.session?.activeOrganizationId || null;
    if (session.session?.id) {
      try {
        const { rows } = await pool.query('SELECT "activeOrganizationId" FROM session WHERE id = $1', [
          session.session.id,
        ]);
        if (rows.length > 0 && rows[0].activeOrganizationId) {
          activeOrganizationId = rows[0].activeOrganizationId;
        }
      } catch (err) {
        console.error('[Teams API] Error reading session activeOrganizationId:', err.message);
      }
    }

    if (!activeOrganizationId) {
      console.log('[Teams API] No active organization - returning empty teams');
      return res.json({ teams: [], count: 0 });
    }

    // Query all teams in the organization with user's membership status
    const result = await pool.query(
      `SELECT 
        t.id, 
        t.name, 
        t."organizationId", 
        t."createdAt",
        CASE WHEN tm."userId" IS NOT NULL THEN true ELSE false END AS "isMember"
      FROM team t
      LEFT JOIN "teamMember" tm ON t.id = tm."teamId" AND tm."userId" = $2
      WHERE t."organizationId" = $1
      ORDER BY t.name ASC`,
      [activeOrganizationId, userId],
    );

    const teams = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      organizationId: row.organizationId,
      createdAt: row.createdAt,
      isMember: row.isMember,
    }));

    res.json({
      teams,
      count: teams.length,
    });
  } catch (error) {
    console.error('[Teams API] Error fetching teams:', error.message);
    next(error);
  }
}
