/**
 * OpenAI adapter configuration
 * Reference: https://docs.copilotkit.ai/reference/classes/llm-adapters/OpenAIAdapter
 * 
 * Following the Azure OpenAI example pattern from CopilotKit docs
 */

import OpenAI from "openai";
import { OpenAIAdapter } from "@copilotkit/runtime";
import { getProviderConfigByType, getModelConfig } from '../config/loader.js';

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
  
  if (!providerConfig?.azure_config?.instance) {
    throw new Error("Azure OpenAI instance not found in database configuration");
  }
  
  if (!providerConfig?.azure_config?.api_version) {
    throw new Error("Azure OpenAI API version not found in database configuration");
  }
  
  if (!modelConfig?.deployment_name && !modelConfig?.model_id) {
    throw new Error(`Model deployment configuration not found for key: ${modelKey}`);
  }
  
  const apiKey = providerConfig.credentials.api_key;
  const instance = providerConfig.azure_config.instance;
  const apiVersion = providerConfig.azure_config.api_version;
  const deploymentName = modelConfig.deployment_name || modelConfig.model_id;

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: `https://${instance}.openai.azure.com/openai/deployments/${deploymentName}`,
    defaultQuery: { "api-version": apiVersion },
    defaultHeaders: { "api-key": apiKey },
  });
  
  return new OpenAIAdapter({ openai });
}

