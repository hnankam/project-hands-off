/**
 * Google Generative AI adapter configuration
 */

import { GoogleGenerativeAIAdapter } from "@copilotkit/runtime";
import { DEBUG } from '../config/index.js';
import { getProviderConfigByType, getModelConfig } from '../config/loader.js';

/**
 * Create Google Gemini adapter
 * Used for Gemini models
 * 
 * @param {string} modelKey - Model key from configuration (e.g., 'gemini-2.5-flash-lite')
 * @param {object} context - Organization/team context for loading configuration
 */
export async function createGeminiAdapter(modelKey = 'gemini-2.5-flash-lite', context = {}) {
  const modelConfig = await getModelConfig(modelKey, context);
  const providerConfig = await getProviderConfigByType('google', context);
  
  if (!providerConfig?.credentials?.api_key) {
    throw new Error('Google API key not found in database configuration');
  }
  
  const modelId = modelConfig?.model_id || 'gemini-2.5-flash-lite';
  const apiKey = providerConfig.credentials.api_key;
  
  return new GoogleGenerativeAIAdapter({
    model: modelId,
    apiKey: apiKey,
    promptCaching: {
      enabled: providerConfig?.default_settings?.prompt_caching?.enabled ?? true,
      debug: DEBUG
    }
  });
}

