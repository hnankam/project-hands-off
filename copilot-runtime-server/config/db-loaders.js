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

  const useScopedFilter = organizationId !== null || teamId !== null;

  const params = [];
  let whereClause = '';
  if (useScopedFilter) {
    whereClause = 'WHERE (organization_id IS NULL OR organization_id = $1) AND (team_id IS NULL OR team_id = $2)';
    params.push(organizationId, teamId);
  }

  const result = await query(
    `
    SELECT 
      provider_key,
      provider_type,
      credentials,
      model_settings,
      bedrock_model_settings,
      organization_id,
      team_id,
      enabled,
      updated_at,
      created_at
    FROM providers
    ${whereClause}
    ORDER BY enabled DESC, provider_key
    `,
    params,
  );

  for (const row of result.rows) {
    const specificity = (row.team_id ? 2 : row.organization_id ? 1 : 0);
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
      team_id: row.team_id,
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
      m.team_id,
      m.enabled,
      m.updated_at,
      m.created_at,
      p.provider_key,
      p.provider_type
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
      team_id: row.team_id,
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
      agent_type,
      agent_name,
      description,
      prompt_template,
      endpoint_pattern,
      organization_id,
      team_id,
      enabled
    FROM agents
    ORDER BY enabled DESC, agent_type
  `);
  
  for (const row of result.rows) {
    agents.push({
      type: row.agent_type,
      name: row.agent_name,
      description: row.description || '',
      prompt: row.prompt_template, // For compatibility
      endpoint_pattern: row.endpoint_pattern || '/agent/{agent_type}/{model}',
      organization_id: row.organization_id,
      team_id: row.team_id,
      enabled: row.enabled
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
  if (teamId !== null && organizationId !== null) {
    whereClause = 'WHERE m.organization_id = $1 AND m.team_id = $2';
    params.push(organizationId, teamId);
  } else if (organizationId !== null) {
    whereClause = 'WHERE m.organization_id = $1 AND m.team_id IS NULL';
    params.push(organizationId);
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
        m.team_id,
        m.enabled,
        m.updated_at,
        m.created_at,
        p.provider_key,
        p.provider_type
      FROM models m
      JOIN providers p ON m.provider_id = p.id
      ${whereClause}
      ORDER BY m.enabled DESC, m.model_key
      `,
      params,
    );

    // promote the order to pick the most specific scope
    const scopedModels = new Map();
    for (const row of modelRows) {
      const key = row.model_key;
      const specificity = (row.team_id ? 2 : row.organization_id ? 1 : 0);
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
      team_id: row.team_id,
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
  if (teamId !== null && organizationId !== null) {
    whereClause = 'WHERE organization_id = $1 AND team_id = $2';
    params.push(organizationId, teamId);
  } else if (organizationId !== null) {
    whereClause = 'WHERE organization_id = $1 AND team_id IS NULL';
    params.push(organizationId);
  }

    const { rows: agentRows } = await query(
      `
      SELECT 
        agent_type,
        agent_name,
        description,
        prompt_template,
        organization_id,
        team_id,
        enabled,
        updated_at,
        created_at
      FROM agents
      ${whereClause}
      ORDER BY enabled DESC, agent_type
      `,
      params,
    );

    const scopedAgents = new Map();
    for (const row of agentRows) {
      const key = row.agent_type;
      const specificity = (row.team_id ? 2 : row.organization_id ? 1 : 0);
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
      team_id: row.team_id,
      enabled: row.enabled,
      updated_at: row.updated_at,
      created_at: row.created_at
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

