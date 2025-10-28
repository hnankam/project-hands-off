/**
 * Configuration loader
 * Loads configuration from PostgreSQL database
 */

// Cache for loaded configurations
let _providersConfig = null;
let _modelsConfig = null;
let _agentsConfig = null;

/**
 * Load providers configuration from database
 */
export async function loadProvidersConfig() {
  if (_providersConfig) {
    return _providersConfig;
  }

  const { getModelsConfigFromDb } = await import('./db-loaders.js');
  const dbConfig = await getModelsConfigFromDb();
  _providersConfig = { providers: dbConfig.providers };
  console.log('[Config] Loaded providers configuration from database');
  
  return _providersConfig;
}

/**
 * Load models configuration from database
 */
export async function loadModelsConfig() {
  if (_modelsConfig) {
    return _modelsConfig;
  }

  const { getModelsConfigFromDb } = await import('./db-loaders.js');
  const dbConfig = await getModelsConfigFromDb();
  _modelsConfig = {
    models: dbConfig.models,
    default_agent: dbConfig.default_agent,
    default_model: dbConfig.default_model
  };
  console.log('[Config] Loaded models configuration from database');
  
  return _modelsConfig;
}

/**
 * Load agents configuration from database
 */
export async function loadAgentsConfig() {
  if (_agentsConfig) {
    return _agentsConfig;
  }

  const { getAgentsConfigFromDb } = await import('./db-loaders.js');
  const dbConfig = await getAgentsConfigFromDb();
  _agentsConfig = dbConfig;
  console.log('[Config] Loaded agents configuration from database');
  
  return _agentsConfig;
}

/**
 * Get provider configuration by key
 */
export async function getProviderConfig(providerKey) {
  const config = await loadProvidersConfig();
  return config.providers[providerKey];
}

/**
 * Get model configuration by key
 */
export async function getModelConfig(modelKey) {
  const config = await loadModelsConfig();
  return config.models.find(m => m.key === modelKey);
}

/**
 * Get all models for a specific provider
 */
export async function getModelsByProvider(providerType) {
  const config = await loadModelsConfig();
  return config.models.filter(m => m.provider === providerType && m.enabled);
}

/**
 * Get agent configuration by type
 */
export async function getAgentConfig(agentType) {
  const config = await loadAgentsConfig();
  return config.agents.find(a => a.type === agentType);
}

/**
 * Get all enabled agents
 */
export async function getEnabledAgents() {
  const config = await loadAgentsConfig();
  return config.agents.filter(a => a.enabled);
}

/**
 * Get default agent type
 */
export async function getDefaultAgent() {
  const config = await loadModelsConfig();
  return config.default_agent;
}

/**
 * Get default model key
 */
export async function getDefaultModel() {
  const config = await loadModelsConfig();
  return config.default_model;
}

/**
 * Get model endpoint mapping
 */
export async function getModelEndpoint(modelKey) {
  const model = await getModelConfig(modelKey);
  if (!model) {
    return await getDefaultModel();
  }
  return model.endpoint;
}

/**
 * Get forced model (for cost optimization)
 */
export async function getForcedModel(modelKey) {
  const model = await getModelConfig(modelKey);
  if (!model) {
    return modelKey;
  }
  return model.forced_model || modelKey;
}

/**
 * Get Bedrock model ID for Claude models
 */
export async function getBedrockModelId(modelKey) {
  const model = await getModelConfig(modelKey);
  if (!model) {
    return null;
  }
  return model.bedrock_model_id || model.model_id;
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
export function getProviderTypeForModel(modelKey) {
  const model = getModelConfig(modelKey);
  if (!model) {
    return 'azure_openai'; // default fallback
  }
  return model.provider;
}

/**
 * Invalidate cache (force reload on next access)
 */
export function invalidateCache() {
  _providersConfig = null;
  _modelsConfig = null;
  _agentsConfig = null;
}

// ============================================================================
// Legacy environment variable mapping removed
// All provider credentials are now loaded from the database via getProviderConfig()
// ============================================================================

