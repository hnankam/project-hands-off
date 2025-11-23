/**
 * Model configurations and endpoints
 * Re-exports functions from loader.js for convenient access
 * 
 * All functions support multi-tenant context via options parameter
 */

export { 
  getModelEndpoint,
  getDefaultAgent,
  getDefaultModel,
  isClaudeModel,
  isGeminiModel,
  isGPTModel,
  getModelConfig,
  getModelsByProvider,
  loadModelsConfig
} from './loader.js';


