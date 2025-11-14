/**
 * Configuration loader
 * Loads configuration from PostgreSQL database
 */

// Cache for loaded configurations, keyed by organization/team context
const _providersConfigCache = new Map();
const _modelsConfigCache = new Map();
const _agentsConfigCache = new Map();

function makeCacheKey({ organizationId = null, teamId = null } = {}) {
  const org = organizationId ?? 'global';
  const team = teamId ?? 'global';
  return `${org}:${team}`;
}

/**
 * Load providers configuration from database
 */
export async function loadProvidersConfig(options = {}) {
  const cacheKey = makeCacheKey({ organizationId: null, teamId: null, ...options });
  
  if (_providersConfigCache.has(cacheKey)) {
    return _providersConfigCache.get(cacheKey);
  }

  const { getModelsConfigFromDb } = await import('./db-loaders.js');
  const dbConfig = await getModelsConfigFromDb(options);
  
  const config = { providers: dbConfig.providers };
  _providersConfigCache.set(cacheKey, config);
  console.log('[Config] Loaded providers configuration from database for context', cacheKey);
  
  return config;
}

/**
 * Load models configuration from database
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
  console.log('[Config] Loaded models configuration from database for context', cacheKey);
  
  return config;
}

/**
 * Load agents configuration from database
 */
export async function loadAgentsConfig(options = {}) {
  const cacheKey = makeCacheKey(options);
  if (_agentsConfigCache.has(cacheKey)) {
    return _agentsConfigCache.get(cacheKey);
  }

  const { getAgentsConfigFromDb } = await import('./db-loaders.js');
  const dbConfig = await getAgentsConfigFromDb(options);
  _agentsConfigCache.set(cacheKey, dbConfig);
  console.log('[Config] Loaded agents configuration from database for context', cacheKey);
  
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
 * Get provider configuration by type (e.g., 'azure_openai', 'anthropic', 'google')
 * This searches by provider_type instead of provider_key
 */
export async function getProviderConfigByType(providerType, options = {}) {
  const config = await loadProvidersConfig(options);
  
  // Search through providers to find one with matching type
  for (const [key, provider] of Object.entries(config.providers)) {
    if (provider.type === providerType) {
      return provider;
    }
  }
  
  return null;
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
 */
export function invalidateCache() {
  _providersConfigCache.clear();
  _modelsConfigCache.clear();
  _agentsConfigCache.clear();
}

// ============================================================================
// Legacy environment variable mapping removed
// All provider credentials are now loaded from the database via getProviderConfig()
// ============================================================================

