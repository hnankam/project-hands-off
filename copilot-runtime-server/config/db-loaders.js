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
export async function loadProvidersFromDb() {
  const providers = {};
  
  const result = await query(`
    SELECT 
      provider_key,
      provider_type,
      credentials,
      model_settings,
      bedrock_model_settings,
      enabled
    FROM providers
    WHERE enabled = true
    ORDER BY provider_key
  `);
  
  for (const row of result.rows) {
    providers[row.provider_key] = {
      type: row.provider_type,
      name: row.provider_key, // Can be enhanced with a display_name column
      enabled: row.enabled,
      credentials: row.credentials || {},
      default_settings: row.model_settings || { prompt_caching: { enabled: true, debug: false } }
    };
    
    // Add Azure-specific config if available
    if (row.provider_type === 'azure_openai' && row.model_settings?.azure_config) {
      providers[row.provider_key].azure_config = row.model_settings.azure_config;
    }
    
    // Add bedrock settings if present
    if (row.bedrock_model_settings) {
      providers[row.provider_key].bedrock_model_settings = row.bedrock_model_settings;
    }
  }
  
  console.log(`[DB] Loaded ${result.rows.length} providers from database`);
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
      m.endpoint,
      m.forced_model,
      m.bedrock_model_id,
      m.deployment_name,
      m.enabled,
      p.provider_key,
      p.provider_type
    FROM models m
    JOIN providers p ON m.provider_id = p.id
    WHERE m.enabled = true
    ORDER BY m.model_key
  `);
  
  for (const row of result.rows) {
    const modelConfig = {
      key: row.model_key,
      name: row.display_name || row.model_name,
      provider: row.provider_key,
      model_id: row.model_name, // The actual model ID (e.g., gemini-2.5-flash-lite)
      endpoint: row.endpoint || row.model_key,
      enabled: row.enabled,
      description: row.description || ''
    };
    
    // Add runtime-specific fields
    if (row.forced_model) {
      modelConfig.forced_model = row.forced_model;
    }
    
    if (row.bedrock_model_id) {
      modelConfig.bedrock_model_id = row.bedrock_model_id;
    }
    
    if (row.deployment_name) {
      modelConfig.deployment_name = row.deployment_name;
    }
    
    // Add model settings override if present
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
      enabled
    FROM agents
    WHERE enabled = true
    ORDER BY agent_type
  `);
  
  for (const row of result.rows) {
    agents.push({
      type: row.agent_type,
      name: row.agent_name,
      description: row.description || '',
      prompt: row.prompt_template, // For compatibility
      endpoint_pattern: row.endpoint_pattern || '/agent/{agent_type}/{model}',
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
export async function getModelsConfigFromDb() {
  const cacheKey = 'models_config';
  
  if (_cacheValid && _dbCache[cacheKey]) {
    console.log('[DB] Returning cached models configuration');
    return _dbCache[cacheKey];
  }
  
  try {
    const providers = await loadProvidersFromDb();
    const models = await loadModelsFromDb();
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
export async function getAgentsConfigFromDb() {
  const cacheKey = 'agents_config';
  
  if (_cacheValid && _dbCache[cacheKey]) {
    console.log('[DB] Returning cached agents configuration');
    return _dbCache[cacheKey];
  }
  
  try {
    const agents = await loadAgentsFromDb();
    
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

