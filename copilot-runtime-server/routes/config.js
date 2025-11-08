/**
 * Configuration endpoints for side panel selectors
 * 
 * These endpoints provide data formatted specifically for the React components
 * in the Chrome extension's side panel:
 * 
 * - AgentSelector expects: { id: string, label: string, description?: string }
 * - ModelSelector expects: { id: string, label: string, provider: string }
 * 
 * Example responses:
 * 
 * GET /api/config/agents
 * {
 *   "agents": [
 *     { "id": "general", "label": "General Agent", "description": "..." },
 *     { "id": "wiki", "label": "Wiki Agent", "description": "..." }
 *   ],
 *   "count": 2
 * }
 * 
 * GET /api/config/models
 * {
 *   "models": [
 *     { "id": "claude-4.5-haiku", "label": "Claude 4.5 Haiku", "provider": "Anthropic" },
 *     { "id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash", "provider": "Google" }
 *   ],
 *   "default_model": "claude-4.5-haiku",
 *   "count": 2
 * }
 * 
 * GET /api/config/defaults
 * {
 *   "default_agent": "general",
 *   "default_model": "claude-4.5-haiku"
 * }
 * 
 * GET /api/config (complete configuration)
 * {
 *   "agents": [...],
 *   "models": [...],
 *   "defaults": { "agent": "general", "model": "claude-4.5-haiku" }
 * }
 */

import { loadModelsConfig, loadAgentsConfig } from '../config/loader.js';
import { getPool } from '../config/database.js';
import { auth } from '../auth/index.js';

async function resolveActiveContext(req) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return { errorStatus: 401, errorMessage: 'Unauthorized' };
    }

    const activeOrgId = session.session?.activeOrganizationId || null;
    let activeTeamId = session.session?.activeTeamId || null;

    const requestedTeamId = req.query?.teamId || null;

    if (requestedTeamId && activeOrgId) {
      if (requestedTeamId === activeTeamId) {
        // Nothing to validate if it matches the session context
        activeTeamId = requestedTeamId;
      } else {
        try {
          const pool = getPool();
          const { rows } = await pool.query(
            `
              SELECT tm."userId"
              FROM team t
              JOIN "teamMember" tm ON tm."teamId" = t.id
              WHERE t.id = $1
                AND t."organizationId" = $2
                AND tm."userId" = $3
              LIMIT 1
            `,
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
          console.error('[Config API] Error validating team override:', dbError);
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

/**
 * GET /api/config/agents
 * Returns list of available agents for side panel selector
 * Format matches AgentSelector component: { id, label }
 */
export async function getAgentsHandler(req, res, next) {
  try {
    const context = await resolveActiveContext(req);
    console.log('[Config API] getAgentsHandler - context:', { organizationId: context.organizationId, teamId: context.teamId, queryTeamId: req.query?.teamId });

    if (context.errorStatus) {
      return res.status(context.errorStatus).json({ error: context.errorMessage });
    }

    if (!context.organizationId || !context.teamId) {
      return res.json({ agents: [], count: 0, missingContext: true });
    }

    const config = await loadAgentsConfig({
      organizationId: context.organizationId,
      teamId: context.teamId,
    });
    
    // Format for side panel AgentSelector: { id, label, enabled, allowedModels }
    // Include all agents (enabled and disabled) for UI display
    const agents = config.agents
      .map(agent => ({
        id: agent.type,        // e.g., "general", "wiki", "jira"
        label: agent.name,     // e.g., "General Agent", "Wiki Agent"
        description: agent.description || '',
        enabled: Boolean(agent.enabled),  // Explicitly convert to boolean (null/undefined → false)
        allowedModels: agent.allowed_models || null,  // Array of model keys or null for all models
        allowedTools: agent.allowed_tools || null,
        organization_id: agent.organization_id || null
      }));
    
    res.json({
      agents,
      count: agents.length
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/config/models
 * Returns list of available models for side panel selector
 * Format matches ModelSelector component: { id, label, provider }
 */
export async function getModelsHandler(req, res, next) {
  try {
    const context = await resolveActiveContext(req);
    console.log('[Config API] getModelsHandler - context:', { organizationId: context.organizationId, teamId: context.teamId, queryTeamId: req.query?.teamId });

    if (context.errorStatus) {
      return res.status(context.errorStatus).json({ error: context.errorMessage });
    }

    if (!context.organizationId || !context.teamId) {
      return res.json({ models: [], count: 0, missingContext: true });
    }

    const config = await loadModelsConfig({
      organizationId: context.organizationId,
      teamId: context.teamId,
    });
    
    // Map provider keys to display names
    const providerDisplayNames = {
      'anthropic': 'Anthropic',
      'anthropic_bedrock': 'Anthropic',
      'google': 'Google',
      'azure_openai': 'OpenAI',
      'openai': 'OpenAI'
    };
    
    // Format for side panel ModelSelector: { id, label, provider, enabled }
    // Include all models (enabled and disabled) for UI display
    const models = config.models
      .map(model => ({
        id: model.key,                                          // e.g., "claude-4.5-haiku"
        label: model.name,                                      // e.g., "Claude 4.5 Haiku"
        provider: providerDisplayNames[model.provider] || model.provider,  // e.g., "Anthropic"
        enabled: Boolean(model.enabled),  // Explicitly convert to boolean (null/undefined → false)
        organization_id: model.organization_id || null
      }));
    
    res.json({
      models,
      default_model: config.default_model,
      count: models.length
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/config/defaults
 * Returns default agent and model selections
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
      default_model: modelsConfig.default_model
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/config
 * Returns complete configuration (agents + models + defaults)
 * Formats match the respective selector components
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
      })
    ]);
    
    // Map provider keys to display names
    const providerDisplayNames = {
      'anthropic': 'Anthropic',
      'anthropic_bedrock': 'Anthropic',
      'google': 'Google',
      'azure_openai': 'OpenAI',
      'openai': 'OpenAI'
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
          allowedTools: agent.allowed_tools || null
        })),
      // Format for ModelSelector: { id, label, provider }
      models: modelsConfig.models
        .filter(model => model.enabled)
        .map(model => ({
          id: model.key,
          label: model.name,
          provider: providerDisplayNames[model.provider] || model.provider
        })),
      defaults: {
        agent: modelsConfig.default_agent,
        model: modelsConfig.default_model
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/config/teams
 * Returns list of teams the current user belongs to in their active organization
 * Format: { id, name, organizationId, createdAt }
 * Requires authentication
 */
export async function getTeamsHandler(req, res, next) {
  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (!session || !session.user) {
      console.log('[Teams API] Unauthorized - no session');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = session.user.id;
    const userEmail = session.user.email;

    const pool = getPool();

    let activeOrganizationId = session.session?.activeOrganizationId || null;
    if (session.session?.id) {
      try {
        const { rows } = await pool.query(
          'SELECT "activeOrganizationId" FROM session WHERE id = $1',
          [session.session.id]
        );
        if (rows.length > 0 && rows[0].activeOrganizationId) {
          activeOrganizationId = rows[0].activeOrganizationId;
        }
      } catch (err) {
        console.error('[Teams API] Error reading session row for active org:', err);
      }
    }
    
    console.log('[Teams API] Request from user:', { userId, userEmail, activeOrganizationId });
    
    if (!activeOrganizationId) {
      console.log('[Teams API] No active organization - returning empty teams');
      return res.json({ teams: [], count: 0 });
    }
    
    // Query ALL teams in the organization with membership info
    const result = await pool.query(`
      SELECT 
        t.id, 
        t.name, 
        t."organizationId", 
        t."createdAt",
        CASE WHEN tm."userId" IS NOT NULL THEN true ELSE false END as "isMember"
      FROM team t
      LEFT JOIN "teamMember" tm ON t.id = tm."teamId" AND tm."userId" = $2
      WHERE t."organizationId" = $1
      ORDER BY t.name ASC
    `, [activeOrganizationId, userId]);
    
    console.log('[Teams API] Query result:', {
      orgId: activeOrganizationId,
      userId,
      teamsFound: result.rows.length,
      teams: result.rows.map(r => ({ id: r.id, name: r.name, isMember: r.isMember }))
    });
    
    const teams = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      organizationId: row.organizationId,
      createdAt: row.createdAt,
      isMember: row.isMember
    }));
    
    res.json({
      teams,
      count: teams.length
    });
  } catch (error) {
    console.error('[Teams API] Error fetching teams:', error);
    next(error);
  }
}

