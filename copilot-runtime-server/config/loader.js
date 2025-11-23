/**
 * Configuration loader
 * Loads configuration from PostgreSQL database with multi-tenant caching
 * 
 * Note: This is a secondary cache layer on top of db-loaders.js
 * - db-loaders.js has its own cache with _cacheValid flag
 * - This layer provides simpler Map-based caching per loader function
 */

// Cache for loaded configurations, keyed by organization/team context
const _providersConfigCache = new Map();
const _modelsConfigCache = new Map();
const _agentsConfigCache = new Map();

/**
 * Generate a consistent cache key from organization and team context
 * @param {Object} options - Context options
 * @param {string|null} options.organizationId - Organization ID (null for global)
 * @param {string|null} options.teamId - Team ID (null for org-wide)
 * @returns {string} Cache key in format "orgId:teamId"
 */
function makeCacheKey({ organizationId = null, teamId = null } = {}) {
  const org = organizationId ?? 'global';
  const team = teamId ?? 'global';
  return `${org}:${team}`;
}

/**
 * Load providers configuration from database
 * @param {Object} options - Multi-tenant context
 * @param {string|null} options.organizationId - Organization ID
 * @param {string|null} options.teamId - Team ID
 * @returns {Promise<{providers: Object}>} Providers configuration
 */
export async function loadProvidersConfig(options = {}) {
  const cacheKey = makeCacheKey(options);
  
  if (_providersConfigCache.has(cacheKey)) {
    return _providersConfigCache.get(cacheKey);
  }

  const { getModelsConfigFromDb } = await import('./db-loaders.js');
  const dbConfig = await getModelsConfigFromDb(options);
  
  const config = { providers: dbConfig.providers };
  _providersConfigCache.set(cacheKey, config);
  
  return config;
}

/**
 * Load models configuration from database
 * @param {Object} options - Multi-tenant context
 * @param {string|null} options.organizationId - Organization ID
 * @param {string|null} options.teamId - Team ID
 * @returns {Promise<{models: Array, default_agent: string, default_model: string}>}
 */
export async function loadModelsConfig(options = {}) {
  const cacheKey = makeCacheKey(options);
  if (_modelsConfigCache.has(cacheKey)) {
    return _modelsConfigCache.get(cacheKey);
  }

  const { getModelsConfigFromDb } = await import('./db-loaders.js');
  const dbConfig = await getModelsConfigFromDb(options);
  const config = {
    models: dbConfig.models,
    default_agent: dbConfig.default_agent,
    default_model: dbConfig.default_model
  };
  _modelsConfigCache.set(cacheKey, config);
  
  return config;
}

/**
 * Load agents configuration from database
 * @param {Object} options - Multi-tenant context
 * @param {string|null} options.organizationId - Organization ID
 * @param {string|null} options.teamId - Team ID
 * @returns {Promise<{agents: Array}>}
 */
export async function loadAgentsConfig(options = {}) {
  const cacheKey = makeCacheKey(options);
  if (_agentsConfigCache.has(cacheKey)) {
    return _agentsConfigCache.get(cacheKey);
  }

  const { getAgentsConfigFromDb } = await import('./db-loaders.js');
  const dbConfig = await getAgentsConfigFromDb(options);
  _agentsConfigCache.set(cacheKey, dbConfig);
  
  return dbConfig;
}

/**
 * Get provider configuration by key
 */
export async function getProviderConfig(providerKey, options = {}) {
  const config = await loadProvidersConfig(options);
  return config.providers[providerKey];
}

/**
 * Get provider configuration by type (e.g., 'azure_openai', 'anthropic_bedrock', 'google')
 * This searches by provider_type instead of provider_key
 * @param {string} providerType - Provider type to search for
 * @param {Object} options - Multi-tenant context
 * @returns {Promise<Object|null>} Provider configuration or null if not found
 */
export async function getProviderConfigByType(providerType, options = {}) {
  const config = await loadProvidersConfig(options);
  
  // Use Object.values for cleaner iteration (we don't need the key)
  return Object.values(config.providers).find(provider => provider.type === providerType) || null;
}

/**
 * Get model configuration by key
 */
export async function getModelConfig(modelKey, options = {}) {
  const config = await loadModelsConfig(options);
  return config.models.find(m => m.key === modelKey);
}

/**
 * Get all models for a specific provider
 */
export async function getModelsByProvider(providerType, options = {}) {
  const config = await loadModelsConfig(options);
  return config.models.filter(m => m.provider === providerType && m.enabled);
}

/**
 * Get agent configuration by type
 */
export async function getAgentConfig(agentType, options = {}) {
  const config = await loadAgentsConfig(options);
  return config.agents.find(a => a.type === agentType);
}

/**
 * Get all enabled agents
 */
export async function getEnabledAgents(options = {}) {
  const config = await loadAgentsConfig(options);
  return config.agents.filter(a => a.enabled);
}

/**
 * Get default agent type
 */
export async function getDefaultAgent(options = {}) {
  const config = await loadModelsConfig(options);
  return config.default_agent;
}

/**
 * Get default model key
 */
export async function getDefaultModel(options = {}) {
  const config = await loadModelsConfig(options);
  return config.default_model;
}

/**
 * Get model endpoint mapping
 */
export async function getModelEndpoint(modelKey, options = {}) {
  const model = await getModelConfig(modelKey, options);
  if (!model) {
    return await getDefaultModel(options);
  }
  // Endpoint path was historically stored separately; fall back to model key
  if (model.model_settings?.endpoint) {
    return model.model_settings.endpoint;
  }
  return model.key;
}

/**
 * Get forced model (for cost optimization)
 */
export async function getForcedModel(modelKey, options = {}) {
  const model = await getModelConfig(modelKey, options);
  if (!model) {
    return modelKey;
  }
  // Forced model overrides were previously stored separately; fall back to original key
  return model.model_settings?.forced_model || modelKey;
}

/**
 * Get Bedrock model ID for Claude models
 */
export async function getBedrockModelId(modelKey, options = {}) {
  const model = await getModelConfig(modelKey, options);
  if (!model) {
    return null;
  }
  return model.model_settings?.bedrock_model_id || model.model_id;
}

/**
 * Check if model is Claude
 */
export function isClaudeModel(modelKey) {
  return modelKey.startsWith('claude-');
}

/**
 * Check if model is Gemini
 */
export function isGeminiModel(modelKey) {
  return modelKey.startsWith('gemini-');
}

/**
 * Check if model is GPT
 */
export function isGPTModel(modelKey) {
  return modelKey.startsWith('gpt-') || modelKey.startsWith('gpt5-');
}

/**
 * Get provider type for a model
 * @param {string} modelKey - Model key to look up
 * @param {Object} options - Multi-tenant context
 * @returns {Promise<string>} Provider type (e.g., 'azure_openai', 'anthropic_bedrock', 'google')
 */
export async function getProviderTypeForModel(modelKey, options = {}) {
  const model = await getModelConfig(modelKey, options);
  if (!model) {
    return 'azure_openai'; // default fallback
  }
  return model.provider;
}

/**
 * Invalidate cache (force reload on next access)
 * This clears the secondary cache layer; db-loaders.js has its own cache invalidation
 */
export function invalidateCache() {
  _providersConfigCache.clear();
  _modelsConfigCache.clear();
  _agentsConfigCache.clear();
  console.log('[Loader] Cache invalidated');
}

/**
 * Get cache statistics (for debugging/monitoring)
 * @returns {Object} Cache size information
 */
export function getCacheStats() {
  return {
    providers: _providersConfigCache.size,
    models: _modelsConfigCache.size,
    agents: _agentsConfigCache.size,
    total: _providersConfigCache.size + _modelsConfigCache.size + _agentsConfigCache.size
  };
}
