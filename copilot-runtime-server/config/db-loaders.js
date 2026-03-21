/**
 * Database loaders for runtime server configuration
 * Loads providers, models, and agents from PostgreSQL database
 *
 * Multi-tenancy design:
 * - organizationId is OPTIONAL for server startup (loads global config)
 * - organizationId should be PROVIDED for all runtime requests (tenant-specific config)
 * - teamId is always optional and provides additional scoping within an organization
 */

import { query } from './database.js';

// Cache for database configurations
let _dbCache = {};
let _cacheValid = true;

/**
 * Invalidate the configuration cache
 */
export function invalidateCache() {
  _cacheValid = false;
  _dbCache = {};
  console.log('[DB] Configuration cache invalidated');
}

/**
 * Helper to build WHERE and team filter clauses for multi-tenancy queries
 * @param {string|null} organizationId - Organization ID (null for server startup/global)
 * @param {string|null} teamId - Optional team ID for team-specific filtering
 * @param {string} tableAlias - SQL table alias (e.g., 'p', 'm', 'a')
 * @param {string} joinTable - Name of the join table for team assignments
 * @param {string} resourceIdColumn - Column name in join table (e.g., 'provider_id', 'model_id', 'agent_id')
 * @returns {{ whereClause: string, teamClause: string, params: any[] }}
 */
function buildTenancyFilters(organizationId, teamId, tableAlias, joinTable, resourceIdColumn) {
  const params = [];
  let whereClause = '';
  let teamClause = '';

  if (organizationId) {
    // Scoped to specific organization
    whereClause = `WHERE ${tableAlias}.organization_id = $1`;
    params.push(organizationId);

    if (teamId !== null && teamId !== undefined) {
      // Filter items that are either org-wide or assigned to this team
      teamClause = `AND (
        NOT EXISTS (SELECT 1 FROM ${joinTable} jt WHERE jt.${resourceIdColumn} = ${tableAlias}.id)
        OR EXISTS (SELECT 1 FROM ${joinTable} jt WHERE jt.${resourceIdColumn} = ${tableAlias}.id AND jt.team_id = $2)
      )`;
      params.push(teamId);
    } else {
      // Only org-wide items (no team assignments)
      teamClause = `AND NOT EXISTS (SELECT 1 FROM ${joinTable} jt WHERE jt.${resourceIdColumn} = ${tableAlias}.id)`;
    }
  } else {
    // Global query (for server initialization only) - get all items without org filter
    // WARNING: This should only be used during server startup, not for user requests
    whereClause = '';
    teamClause = '';
  }

  return { whereClause, teamClause, params };
}

/**
 * Helper to calculate specificity for scoped items
 */
function calculateSpecificity(item) {
  const hasTeams = item.teams && Array.isArray(item.teams) && item.teams.length > 0;
  return hasTeams ? 2 : item.organization_id ? 1 : 0;
}

/**
 * Load providers configuration from database
 * @param {Object} context - Multi-tenant context
 * @param {string|null} context.organizationId - Organization ID (null for server startup)
 * @param {string|null} context.teamId - Optional team ID
 */
export async function loadProvidersFromDb({ organizationId = null, teamId = null } = {}) {
  const providerMap = new Map();
  const { whereClause, teamClause, params } = buildTenancyFilters(
    organizationId,
    teamId,
    'p',
    'provider_teams',
    'provider_id',
  );

  const result = await query(
    `
    SELECT 
      p.provider_key,
      p.provider_type,
      p.credentials,
      p.model_settings,
      p.bedrock_model_settings,
      p.organization_id,
      p.enabled,
      p.updated_at,
      p.created_at,
      COALESCE(
        (SELECT json_agg(json_build_object('id', pt.team_id))
         FROM provider_teams pt WHERE pt.provider_id = p.id),
        '[]'::json
      ) as teams
    FROM providers p
    ${whereClause ? whereClause + ' AND' : 'WHERE'} p.deleted_at IS NULL
    ${teamClause}
    ORDER BY p.enabled DESC, p.provider_key
    `,
    params,
  );

  for (const row of result.rows) {
    const specificity = calculateSpecificity(row);
    const existing = providerMap.get(row.provider_key);
    if (!existing || specificity > existing.specificity) {
      providerMap.set(row.provider_key, { specificity, data: row });
    }
  }

  const providers = {};
  for (const { data: row } of providerMap.values()) {
    providers[row.provider_key] = {
      type: row.provider_type,
      name: row.provider_key,
      enabled: row.enabled,
      credentials: row.credentials || {},
      default_settings: row.model_settings || { prompt_caching: { enabled: true, debug: false } },
      organization_id: row.organization_id,
      teams: row.teams || [],
      bedrock_model_settings: row.bedrock_model_settings || null,
      updated_at: row.updated_at,
      created_at: row.created_at,
    };

    if (row.provider_type === 'azure_openai' && row.model_settings?.azure_config) {
      providers[row.provider_key].azure_config = row.model_settings.azure_config;
    }
  }

  return providers;
}

/**
 * Load models configuration from database
 */
export async function loadModelsFromDb() {
  const models = [];

  const result = await query(`
    SELECT 
      m.model_key,
      m.model_name,
      m.display_name,
      m.description,
      m.model_settings_override,
      m.organization_id,
      m.enabled,
      m.updated_at,
      m.created_at,
      p.provider_key,
      p.provider_type,
      COALESCE(
        (SELECT json_agg(json_build_object('id', mt.team_id))
         FROM model_teams mt WHERE mt.model_id = m.id),
        '[]'::json
      ) as teams
    FROM models m
    JOIN providers p ON m.provider_id = p.id
    WHERE m.deleted_at IS NULL AND p.deleted_at IS NULL
    ORDER BY m.enabled DESC, m.model_key
  `);

  for (const row of result.rows) {
    const modelConfig = {
      key: row.model_key,
      name: row.display_name || row.model_name,
      provider: row.provider_key,
      model_id: row.model_name, // The actual model ID (e.g., gemini-2.5-flash-lite)
      enabled: row.enabled,
      description: row.description || '',
      organization_id: row.organization_id,
      teams: row.teams || [],
      updated_at: row.updated_at,
      created_at: row.created_at,
    };

    if (row.model_settings_override) {
      modelConfig.model_settings = row.model_settings_override;
    }

    models.push(modelConfig);
  }

  return models;
}

/**
 * Load agents configuration from database
 */
export async function loadAgentsFromDb() {
  const agents = [];

  const result = await query(`
    SELECT 
      a.id,
      a.agent_type,
      a.agent_name,
      a.description,
      a.prompt_template,
      a.endpoint_pattern,
      a.organization_id,
      a.enabled,
      array_remove(array_agg(DISTINCT m.model_key), NULL) AS model_keys,
      array_remove(array_agg(DISTINCT tl.tool_key), NULL) AS tool_keys,
      COALESCE(
        (SELECT json_agg(json_build_object('id', at.team_id))
         FROM agent_teams at WHERE at.agent_id = a.id),
        '[]'::json
      ) as teams
    FROM agents a
    LEFT JOIN agent_model_mappings amm ON amm.agent_id = a.id
    LEFT JOIN models m ON m.id = amm.model_id AND m.deleted_at IS NULL
    LEFT JOIN agent_tool_mappings atm ON atm.agent_id = a.id
    LEFT JOIN tools tl ON tl.id = atm.tool_id AND tl.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
    GROUP BY
      a.id,
      a.agent_type,
      a.agent_name,
      a.description,
      a.prompt_template,
      a.endpoint_pattern,
      a.organization_id,
      a.enabled
    ORDER BY a.enabled DESC, a.agent_type
  `);

  for (const row of result.rows) {
    agents.push({
      type: row.agent_type,
      name: row.agent_name,
      description: row.description || '',
      prompt: row.prompt_template, // For compatibility
      endpoint_pattern: row.endpoint_pattern || '/agent/{agent_type}/{model}',
      organization_id: row.organization_id,
      teams: row.teams || [],
      enabled: row.enabled,
      allowed_models:
        Array.isArray(row.model_keys) && row.model_keys.length > 0 ? row.model_keys.filter(Boolean) : null,
      allowed_tools: Array.isArray(row.tool_keys) && row.tool_keys.length > 0 ? row.tool_keys.filter(Boolean) : null,
    });
  }

  return agents;
}

/**
 * Get default agent and model from database
 */
export async function loadDefaultsFromDb() {
  // Try to get defaults from a settings table (can be added later)
  // For now, use first enabled agent and model
  const agentResult = await query(`
    SELECT agent_type FROM agents WHERE enabled = true AND deleted_at IS NULL ORDER BY agent_type LIMIT 1
  `);

  const modelResult = await query(`
    SELECT model_key FROM models WHERE enabled = true AND deleted_at IS NULL ORDER BY model_key LIMIT 1
  `);

  return {
    default_agent: agentResult.rows[0]?.agent_type,
    default_model: modelResult.rows[0]?.model_key,
  };
}

/**
 * Get complete models configuration from database (cached)
 * @param {Object} context - Multi-tenant context
 * @param {string|null} context.organizationId - Organization ID (null for server startup/global queries)
 * @param {string|null} context.teamId - Optional team ID
 */
export async function getModelsConfigFromDb({ organizationId = null, teamId = null } = {}) {
  const cacheKey = `models_config:${organizationId ?? 'global'}:${teamId ?? 'org'}`;

  if (_cacheValid && _dbCache[cacheKey]) {
    return _dbCache[cacheKey];
  }

  try {
    const { whereClause, teamClause, params } = buildTenancyFilters(
      organizationId,
      teamId,
      'm',
      'model_teams',
      'model_id',
    );

    const { rows: modelRows } = await query(
      `
      SELECT 
        m.model_key,
        m.model_name,
        m.display_name,
        m.description,
        m.model_settings_override,
        m.organization_id,
        m.enabled,
        m.updated_at,
        m.created_at,
        p.provider_key,
        p.provider_type,
        COALESCE(
          (SELECT json_agg(json_build_object('id', mt.team_id))
           FROM model_teams mt WHERE mt.model_id = m.id),
          '[]'::json
        ) as teams
      FROM models m
      JOIN providers p ON m.provider_id = p.id
      ${whereClause ? whereClause + ' AND' : 'WHERE'} m.deleted_at IS NULL AND p.deleted_at IS NULL
      ${teamClause}
      ORDER BY m.enabled DESC, m.model_key
      `,
      params,
    );

    // Promote the order to pick the most specific scope
    const scopedModels = new Map();
    for (const row of modelRows) {
      const specificity = calculateSpecificity(row);
      const existing = scopedModels.get(row.model_key);
      if (!existing || specificity > existing.specificity) {
        scopedModels.set(row.model_key, { row, specificity });
      }
    }

    const models = Array.from(scopedModels.values()).map(({ row }) => ({
      key: row.model_key,
      name: row.display_name || row.model_name,
      provider: row.provider_key,
      model_id: row.model_name,
      enabled: row.enabled,
      description: row.description || '',
      organization_id: row.organization_id,
      teams: row.teams || [],
      model_settings: row.model_settings_override || null,
      updated_at: row.updated_at,
      created_at: row.created_at,
    }));

    const [providers, defaults] = await Promise.all([
      loadProvidersFromDb({ organizationId, teamId }),
      loadDefaultsFromDb(),
    ]);

    const config = {
      providers,
      models,
      default_agent: defaults.default_agent,
      default_model: defaults.default_model,
    };

    _dbCache[cacheKey] = config;
    _cacheValid = true;

    return config;
  } catch (error) {
    console.error('[DB] Error loading models configuration:', error.message);
    throw error;
  }
}

/**
 * @param {unknown} meta - agents.metadata JSON
 * @returns {object[]} required_workspace_credentials array (may be empty)
 */
function requiredWorkspaceCredentialsFromAgentMetadata(meta) {
  const m = meta && typeof meta === 'object' ? meta : null;
  const rwc = m?.required_workspace_credentials;
  return Array.isArray(rwc) ? rwc : [];
}

/**
 * Collect auxiliary agent row UUIDs from metadata.auxiliary_agents (built-in slots + custom).
 * @param {unknown} auxiliaryAgents
 * @returns {string[]}
 */
function collectAuxiliaryAgentIds(auxiliaryAgents) {
  if (!auxiliaryAgents || typeof auxiliaryAgents !== 'object') return [];
  const ids = [];
  const builtinKeys = ['image_generation', 'web_search', 'code_execution', 'url_context', 'memory'];
  for (const k of builtinKeys) {
    const block = auxiliaryAgents[k];
    const aid = block?.agent_id;
    if (typeof aid === 'string' && aid.trim()) ids.push(aid.trim());
  }
  if (Array.isArray(auxiliaryAgents.custom)) {
    for (const c of auxiliaryAgents.custom) {
      const aid = c?.agent_id;
      if (typeof aid === 'string' && aid.trim()) ids.push(aid.trim());
    }
  }
  return [...new Set(ids)];
}

/**
 * Merge this agent's required_workspace_credentials with those of agents referenced in auxiliary_agents.
 * @param {object} row - agent row from DB (id, metadata)
 * @param {Map<string, object[]>} rwcByAgentId - agent UUID -> credential requirement objects
 */
function mergedRequiredWorkspaceCredentialsForAgent(row, rwcByAgentId) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : null;
  const primary = requiredWorkspaceCredentialsFromAgentMetadata(meta);
  const merged = [...primary];
  const auxIds = collectAuxiliaryAgentIds(meta?.auxiliary_agents);
  for (const id of auxIds) {
    const extra = rwcByAgentId.get(id);
    if (extra && extra.length > 0) merged.push(...extra);
  }
  return merged.length > 0 ? merged : null;
}

/**
 * Get complete agents configuration from database (cached)
 * @param {Object} context - Multi-tenant context
 * @param {string|null} context.organizationId - Organization ID (null for server startup/global queries)
 * @param {string|null} context.teamId - Optional team ID
 */
export async function getAgentsConfigFromDb({ organizationId = null, teamId = null } = {}) {
  const cacheKey = `agents_config:${organizationId ?? 'global'}:${teamId ?? 'org'}`;

  if (_cacheValid && _dbCache[cacheKey]) {
    return _dbCache[cacheKey];
  }

  try {
    const { whereClause, teamClause, params } = buildTenancyFilters(
      organizationId,
      teamId,
      'a',
      'agent_teams',
      'agent_id',
    );

    const { rows: agentRows } = await query(
      `
      SELECT 
        a.id,
        a.agent_type,
        a.agent_name,
        a.description,
        a.prompt_template,
        a.organization_id,
        a.enabled,
        a.updated_at,
        a.created_at,
        a.metadata,
        array_remove(array_agg(DISTINCT m.model_key), NULL) AS model_keys,
        array_remove(array_agg(DISTINCT tl.tool_key), NULL) AS tool_keys,
        COALESCE(
          (SELECT json_agg(json_build_object('id', at.team_id))
           FROM agent_teams at WHERE at.agent_id = a.id),
          '[]'::json
        ) as teams
      FROM agents a
      LEFT JOIN agent_model_mappings amm ON amm.agent_id = a.id
      LEFT JOIN models m ON m.id = amm.model_id AND m.deleted_at IS NULL
      LEFT JOIN agent_tool_mappings atm ON atm.agent_id = a.id
      LEFT JOIN tools tl ON tl.id = atm.tool_id AND tl.deleted_at IS NULL
      ${whereClause ? whereClause + ' AND' : 'WHERE'} a.deleted_at IS NULL
      ${teamClause}
      GROUP BY
        a.id,
        a.agent_type,
        a.agent_name,
        a.description,
        a.prompt_template,
        a.organization_id,
        a.enabled,
        a.updated_at,
        a.created_at,
        a.metadata
      ORDER BY a.enabled DESC, a.agent_type
      `,
      params,
    );

    const scopedAgents = new Map();
    for (const row of agentRows) {
      const specificity = calculateSpecificity(row);
      const existing = scopedAgents.get(row.agent_type);
      if (!existing || specificity > existing.specificity) {
        scopedAgents.set(row.agent_type, { row, specificity });
      }
    }

    /** @type {Map<string, object[]>} */
    const rwcByAgentId = new Map();
    for (const r of agentRows) {
      const list = requiredWorkspaceCredentialsFromAgentMetadata(r.metadata);
      rwcByAgentId.set(r.id, list);
    }

    const agents = Array.from(scopedAgents.values()).map(({ row }) => {
      const required_workspace_credentials = mergedRequiredWorkspaceCredentialsForAgent(row, rwcByAgentId);
      return {
        type: row.agent_type,
        name: row.agent_name,
        description: row.description || '',
        prompt: row.prompt_template,
        endpoint_pattern: '/agent/{agent_type}/{model}',
        organization_id: row.organization_id,
        teams: row.teams || [],
        enabled: row.enabled,
        updated_at: row.updated_at,
        created_at: row.created_at,
        allowed_models:
          Array.isArray(row.model_keys) && row.model_keys.length > 0 ? row.model_keys.filter(Boolean) : null,
        allowed_tools: Array.isArray(row.tool_keys) && row.tool_keys.length > 0 ? row.tool_keys.filter(Boolean) : null,
        required_workspace_credentials,
      };
    });

    const config = { agents };

    _dbCache[cacheKey] = config;
    _cacheValid = true;

    return config;
  } catch (error) {
    console.error('[DB] Error loading agents configuration:', error.message);
    throw error;
  }
}
