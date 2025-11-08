/**
 * Database loaders for runtime server configuration
 * Loads providers, models, and agents from PostgreSQL database
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
 * Load providers configuration from database
 */
export async function loadProvidersFromDb({ organizationId = null, teamId = null } = {}) {
  const providerMap = new Map();

  const params = [];
  let whereClause = '';
  let teamClause = '';
  
  if (organizationId !== null) {
    whereClause = 'WHERE p.organization_id = $1';
    params.push(organizationId);
    
    if (teamId !== null) {
      // Filter providers that are either org-wide or assigned to this team
      teamClause = `AND (
        NOT EXISTS (SELECT 1 FROM provider_teams pt WHERE pt.provider_id = p.id)
        OR EXISTS (SELECT 1 FROM provider_teams pt WHERE pt.provider_id = p.id AND pt.team_id = $2)
      )`;
      params.push(teamId);
    } else {
      // Only org-wide providers (no team assignments)
      teamClause = `AND NOT EXISTS (SELECT 1 FROM provider_teams pt WHERE pt.provider_id = p.id)`;
    }
  }

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
    ${whereClause} ${teamClause}
    ORDER BY p.enabled DESC, p.provider_key
    `,
    params,
  );

  for (const row of result.rows) {
    // Providers with team assignments are more specific than org-wide providers
    const hasTeams = row.teams && Array.isArray(row.teams) && row.teams.length > 0;
    const specificity = (hasTeams ? 2 : row.organization_id ? 1 : 0);
    const existing = providerMap.get(row.provider_key);
    if (!existing || specificity > existing.specificity) {
      providerMap.set(row.provider_key, {
        specificity,
        data: row,
      });
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

  console.log(`[DB] Loaded ${providerMap.size} providers from database (context org=${organizationId} team=${teamId})`);
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
      created_at: row.created_at
    };

    if (row.model_settings_override) {
      modelConfig.model_settings = row.model_settings_override;
    }
    
    models.push(modelConfig);
  }
  
  console.log(`[DB] Loaded ${result.rows.length} models from database`);
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
    LEFT JOIN models m ON m.id = amm.model_id
    LEFT JOIN agent_tool_mappings atm ON atm.agent_id = a.id
    LEFT JOIN tools tl ON tl.id = atm.tool_id
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
      allowed_models: Array.isArray(row.model_keys) && row.model_keys.length > 0 ? row.model_keys.filter(Boolean) : null,
      allowed_tools: Array.isArray(row.tool_keys) && row.tool_keys.length > 0 ? row.tool_keys.filter(Boolean) : null
    });
  }
  
  console.log(`[DB] Loaded ${result.rows.length} agents from database`);
  return agents;
}

/**
 * Get default agent and model from database
 * Falls back to hardcoded values if not found
 */
export async function loadDefaultsFromDb() {
  // Try to get defaults from a settings table (can be added later)
  // For now, use first enabled agent and model
  const agentResult = await query(`
    SELECT agent_type FROM agents WHERE enabled = true ORDER BY agent_type LIMIT 1
  `);
  
  const modelResult = await query(`
    SELECT model_key FROM models WHERE enabled = true ORDER BY model_key LIMIT 1
  `);
  
  return {
    default_agent: agentResult.rows[0]?.agent_type || 'general',
    default_model: modelResult.rows[0]?.model_key || 'gemini-2.5-flash-lite'
  };
}

/**
 * Get complete models configuration from database (cached)
 */
export async function getModelsConfigFromDb({ organizationId = null, teamId = null } = {}) {
  const cacheKey = `models_config:${organizationId ?? 'global'}:${teamId ?? 'global'}`;

  if (_cacheValid && _dbCache[cacheKey]) {
    console.log(`[DB] Returning cached models for org=${organizationId} team=${teamId}`);
    return _dbCache[cacheKey];
  }

  try {
  const params = [];
  let whereClause = '';
  let teamClause = '';
  
  if (organizationId !== null) {
    whereClause = 'WHERE m.organization_id = $1';
    params.push(organizationId);
    
    if (teamId !== null) {
      // Filter models that are either org-wide or assigned to this team
      teamClause = `AND (
        NOT EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id)
        OR EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id AND mt.team_id = $2)
      )`;
      params.push(teamId);
    } else {
      // Only org-wide models (no team assignments)
      teamClause = `AND NOT EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id)`;
    }
  }

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
      ${whereClause} ${teamClause}
      ORDER BY m.enabled DESC, m.model_key
      `,
      params,
    );

    // promote the order to pick the most specific scope
    const scopedModels = new Map();
    for (const row of modelRows) {
      const key = row.model_key;
      // Models with team assignments are more specific than org-wide models
      const hasTeams = row.teams && Array.isArray(row.teams) && row.teams.length > 0;
      const specificity = (hasTeams ? 2 : row.organization_id ? 1 : 0);
      const existing = scopedModels.get(key);
      if (!existing || specificity > existing.specificity) {
        scopedModels.set(key, { row, specificity });
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
      created_at: row.created_at
    }));

    const providers = await loadProvidersFromDb({ organizationId, teamId });
    const defaults = await loadDefaultsFromDb();

    const config = {
      providers,
      models,
      default_agent: defaults.default_agent,
      default_model: defaults.default_model
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
 * Get complete agents configuration from database (cached)
 */
export async function getAgentsConfigFromDb({ organizationId = null, teamId = null } = {}) {
  const cacheKey = `agents_config:${organizationId ?? 'global'}:${teamId ?? 'global'}`;

  if (_cacheValid && _dbCache[cacheKey]) {
    console.log(`[DB] Returning cached agents for org=${organizationId} team=${teamId}`);
    return _dbCache[cacheKey];
  }

  try {
  const params = [];
  let whereClause = '';
  let teamClause = '';
  
  if (organizationId !== null) {
    whereClause = 'WHERE a.organization_id = $1';
    params.push(organizationId);
    
    if (teamId !== null) {
      // Filter agents that are either org-wide or assigned to this team
      teamClause = `AND (
        NOT EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id)
        OR EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id AND at.team_id = $2)
      )`;
      params.push(teamId);
    } else {
      // Only org-wide agents (no team assignments)
      teamClause = `AND NOT EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id)`;
    }
  }

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
        array_remove(array_agg(DISTINCT m.model_key), NULL) AS model_keys,
        array_remove(array_agg(DISTINCT tl.tool_key), NULL) AS tool_keys,
        COALESCE(
          (SELECT json_agg(json_build_object('id', at.team_id))
           FROM agent_teams at WHERE at.agent_id = a.id),
          '[]'::json
        ) as teams
      FROM agents a
      LEFT JOIN agent_model_mappings amm ON amm.agent_id = a.id
      LEFT JOIN models m ON m.id = amm.model_id
      LEFT JOIN agent_tool_mappings atm ON atm.agent_id = a.id
      LEFT JOIN tools tl ON tl.id = atm.tool_id
      ${whereClause} ${teamClause}
      GROUP BY
        a.id,
        a.agent_type,
        a.agent_name,
        a.description,
        a.prompt_template,
        a.organization_id,
        a.enabled,
        a.updated_at,
        a.created_at
      ORDER BY a.enabled DESC, a.agent_type
      `,
      params,
    );

    const scopedAgents = new Map();
    for (const row of agentRows) {
      const key = row.agent_type;
      // Agents with team assignments are more specific than org-wide agents
      const hasTeams = row.teams && Array.isArray(row.teams) && row.teams.length > 0;
      const specificity = (hasTeams ? 2 : row.organization_id ? 1 : 0);
      const existing = scopedAgents.get(key);
      if (!existing || specificity > existing.specificity) {
        scopedAgents.set(key, { row, specificity });
      }
    }

    const agents = Array.from(scopedAgents.values()).map(({ row }) => ({
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
      allowed_models: Array.isArray(row.model_keys) && row.model_keys.length > 0 ? row.model_keys.filter(Boolean) : null,
      allowed_tools: Array.isArray(row.tool_keys) && row.tool_keys.length > 0 ? row.tool_keys.filter(Boolean) : null
    }));

    const config = {
      agents
    };

    _dbCache[cacheKey] = config;
    _cacheValid = true;

    return config;
  } catch (error) {
    console.error('[DB] Error loading agents configuration:', error.message);
    throw error;
  }
}

