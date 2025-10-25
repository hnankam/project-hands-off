/**
 * Model configurations and endpoints
 */

// Available models and their endpoint mappings
export const MODEL_ENDPOINTS = {
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'claude-3.5-sonnet': 'claude-3.5-sonnet',
  'claude-3.7-sonnet': 'claude-3.7-sonnet',
  'claude-4.1-opus': 'claude-4.1-opus',
  'claude-4.5-sonnet': 'claude-4.5-sonnet',
  'claude-4.5-haiku': 'claude-4.5-haiku',
  'gpt-5-mini': 'gpt-5-mini',
  'gpt-5': 'gpt-5',
  'gpt5-pro': 'gpt5-pro',
};

// Default models
export const DEFAULT_AGENT = 'general';
export const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

// Model type helpers
export function isClaudeModel(model) {
  return model.startsWith('claude-');
}

export function isGeminiModel(model) {
  return model.startsWith('gemini-');
}

export function isGPTModel(model) {
  return model.startsWith('gpt-') || model.startsWith('gpt5-');
}

// Get model endpoint path
export function getModelEndpoint(model) {
  return MODEL_ENDPOINTS[model] || DEFAULT_MODEL;
}

