/**
 * OpenAI adapter configuration
 * Reference: https://docs.copilotkit.ai/reference/classes/llm-adapters/OpenAIAdapter
 * 
 * Following the Azure OpenAI example pattern from CopilotKit docs
 */

import OpenAI from "openai";
import { OpenAIAdapter } from "@copilotkit/runtime";
import { DEBUG } from '../config/index.js';
import { getProviderConfigByType, getModelConfig } from '../config/loader.js';

/**
 * Create OpenAI adapter with configuration options
 * Used for GPT models with Azure OpenAI
 * 
 * @param {string} modelKey - Model key from configuration (e.g., 'gpt-5-mini', 'gpt-5', 'gpt5-pro')
 * @param {Object} options - Additional configuration options
 * @param {string} options.apiKey - OpenAI API key (overrides env)
 * @param {string} options.instance - Azure OpenAI instance name (overrides config)
 * @param {string} options.apiVersion - Azure API version (overrides config)
 * @param {number} options.maxTokens - Maximum tokens for completion
 * @param {number} options.temperature - Sampling temperature (0-2)
 * @returns {OpenAIAdapter} OpenAI adapter instance
 */
export async function createOpenAIAdapter(modelKey = "gpt-5-mini", options = {}) {
    const providerConfig = await getProviderConfigByType('azure_openai');
    const modelConfig = await getModelConfig(modelKey);
    
    if (!providerConfig?.credentials?.api_key) {
      throw new Error("Azure OpenAI API key not found in database configuration");
    }
    
    const apiKey = providerConfig.credentials.api_key;
    const instance = options.instance || providerConfig?.azure_config?.instance || "dgp-dev-openai";
    const apiVersion = options.apiVersion || providerConfig?.azure_config?.api_version_alt || "2025-01-01-preview";
    const deploymentName = modelConfig?.deployment_name || modelConfig?.model_id || modelKey;
          
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: `https://${instance}.openai.azure.com/openai/deployments/${deploymentName}`,
      defaultQuery: { "api-version": apiVersion },
      defaultHeaders: { "api-key": apiKey },
    });

  return new OpenAIAdapter({ openai });
}

/**
 * Create Azure OpenAI adapter
 * For use with Azure OpenAI Service
 * 
 * @param {string} modelKey - Model key from configuration
 * @param {object} context - Organization/team context for loading configuration
 * @returns {OpenAIAdapter} Azure OpenAI adapter instance
 */
export async function createAzureOpenAIAdapter(modelKey = "gpt-4o-mini", context = {}) {
  const providerConfig = await getProviderConfigByType('azure_openai', context);
  const modelConfig = await getModelConfig(modelKey, context);
  
  if (!providerConfig?.credentials?.api_key) {
    throw new Error("Azure OpenAI API key not found in database configuration");
  }
  
  const apiKey = providerConfig.credentials.api_key;
  const instance = providerConfig?.azure_config?.instance || "dgp-dev-openai";
  const apiVersion = providerConfig?.azure_config?.api_version || "2024-04-01-preview";
  const deploymentName = modelConfig?.deployment_name || modelConfig?.model_id || modelKey;

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: `https://${instance}.openai.azure.com/openai/deployments/${deploymentName}`,
    defaultQuery: { "api-version": apiVersion },
    defaultHeaders: { "api-key": apiKey },
  });
  
  return new OpenAIAdapter({ openai });
}

/**
 * Create GPT-5-mini adapter for Azure OpenAI
 * Uses Azure OpenAI endpoint with gpt-5-mini deployment
 * 
 * @param {Object} options - Configuration options (optional overrides)
 * @returns {OpenAIAdapter} Azure GPT-5-mini adapter instance
 */
export async function createGPT5MiniAdapter(options = {}) {
  return await createOpenAIAdapter("gpt-5-mini", options);
}

/**
 * Create GPT-5 adapter for Azure OpenAI
 * Uses Azure OpenAI endpoint with gpt-5 deployment
 * 
 * @param {Object} options - Configuration options (optional overrides)
 * @returns {OpenAIAdapter} Azure GPT-5 adapter instance
 */
export async function createGPT5Adapter(options = {}) {
  return await createOpenAIAdapter("gpt-5", options);
}

/**
 * Create GPT-5-Pro adapter for Azure OpenAI
 * Uses Azure OpenAI endpoint with gpt5-pro deployment
 * 
 * @param {Object} options - Configuration options (optional overrides)
 * @returns {OpenAIAdapter} Azure GPT-5-Pro adapter instance
 */
export async function createGPT5ProAdapter(options = {}) {
  return await createOpenAIAdapter("gpt5-pro", options);
}

