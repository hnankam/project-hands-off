/**
 * Model configurations and endpoints
 * Now loaded from config/models.json or database via loader
 */

import { 
  getModelEndpoint as getModelEndpointFromLoader,
  getDefaultAgent as getDefaultAgentFromLoader,
  getDefaultModel as getDefaultModelFromLoader,
  isClaudeModel as isClaudeModelFromLoader,
  isGeminiModel as isGeminiModelFromLoader,
  isGPTModel as isGPTModelFromLoader,
  loadModelsConfig
} from './loader.js';

// Load configuration on module init (top-level await)
const modelsConfig = await loadModelsConfig();

// Default models - loaded from configuration
export const DEFAULT_AGENT = modelsConfig.default_agent;
export const DEFAULT_MODEL = modelsConfig.default_model;

// Build MODEL_ENDPOINTS from configuration for backward compatibility
export const MODEL_ENDPOINTS = modelsConfig.models.reduce((acc, model) => {
  acc[model.key] = model.endpoint;
  return acc;
}, {});

// Model type helpers - delegate to loader
export function isClaudeModel(model) {
  return isClaudeModelFromLoader(model);
}

export function isGeminiModel(model) {
  return isGeminiModelFromLoader(model);
}

export function isGPTModel(model) {
  return isGPTModelFromLoader(model);
}

// Get model endpoint path - delegate to loader
export function getModelEndpoint(model) {
  return getModelEndpointFromLoader(model);
}

