/**
 * OpenAI adapter configuration
 * Reference: https://docs.copilotkit.ai/reference/classes/llm-adapters/OpenAIAdapter
 * 
 * Following the Azure OpenAI example pattern from CopilotKit docs
 */

import OpenAI from "openai";
import { OpenAIAdapter } from "@copilotkit/runtime";
import { AZURE_OPENAI_API_KEY, AZURE_OPENAI_BASE_URL, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_VERSION, DEBUG } from '../config/index.js';

/**
 * Create OpenAI adapter with configuration options
 * Used for GPT models with Azure OpenAI
 * 
 * @param {string} model - Model name (e.g., gpt-5-mini, gpt-5, gpt5-pro)
 * @param {Object} options - Additional configuration options
 * @param {string} options.apiKey - OpenAI API key (overrides env)
 * @param {string} options.instance - Azure OpenAI instance name (default: dgp-dev-openai)
 * @param {string} options.apiVersion - Azure API version (default: 2025-01-01-preview)
 * @param {number} options.maxTokens - Maximum tokens for completion
 * @param {number} options.temperature - Sampling temperature (0-2)
 * @returns {OpenAIAdapter} OpenAI adapter instance
 */
export function createOpenAIAdapter(model = "gpt-5-mini", options = {}) {
    const instance = options.instance || "dgp-dev-openai";
    const apiVersion = options.apiVersion || "2025-01-01-preview";
     
    if (!AZURE_OPENAI_API_KEY) {
      throw new Error("The AZURE_OPENAI_API_KEY environment variable is missing or empty.");
    }
          
    const openai = new OpenAI({
      apiKey: AZURE_OPENAI_API_KEY,
      baseURL: `https://${instance}.openai.azure.com/openai/deployments/${model}`,
      defaultQuery: { "api-version": apiVersion },
      defaultHeaders: { "api-key": AZURE_OPENAI_API_KEY },
    });

  return new OpenAIAdapter({ openai });
}

/**
 * Create Azure OpenAI adapter
 * For use with Azure OpenAI Service
 * 
 * @param {Object} config - Azure OpenAI configuration
 * @param {string} config.endpoint - Azure OpenAI endpoint
 * @param {string} config.apiKey - Azure OpenAI API key
 * @param {string} config.apiVersion - Azure API version
 * @param {string} config.deployment - Azure deployment name
 * @returns {OpenAIAdapter} Azure OpenAI adapter instance
 */
export function createAzureOpenAIAdapter(model = "gpt-4o-mini") {

   // You will need to set these environment variables or edit the following values
   const endpoint = AZURE_OPENAI_ENDPOINT;
   const apiKey = AZURE_OPENAI_API_KEY;
   const apiVersion = AZURE_OPENAI_API_VERSION;
   const deployment = model;

  const openai = new OpenAI({
    apiKey: AZURE_OPENAI_API_KEY,
    baseURL: `https://dgp-dev-openai.openai.azure.com/openai/deployments/${model}`,
    defaultQuery: { "api-version": "2024-04-01-preview" },
    defaultHeaders: { "api-key": AZURE_OPENAI_API_KEY },
  });
  return new OpenAIAdapter({ openai });

    // console.log("📤 Sending request to Azure OpenAI...");
  
    // const result = await openai.chat.completions.create({
    //   messages: [
    //     { role: "developer", content: "You are an AI assistant that helps people find information." },
    //     { role: "user", content: "hey" },
    //     { role: "assistant", content: "Hey! How can I help you today?" }
    //   ],
    //   max_completion_tokens: 16384
    // });
  
    // console.log("✅ Response received!");
    // console.log();
    // console.log("📄 Result:");
    // console.log(JSON.stringify(result, null, 2));

  return new OpenAIAdapter({ openai: openai });
}

/**
 * Create GPT-5-mini adapter for Azure OpenAI
 * Uses Azure OpenAI endpoint with gpt-5-mini deployment
 * 
 * @param {Object} options - Configuration options (optional overrides)
 * @returns {OpenAIAdapter} Azure GPT-5-mini adapter instance
 */
export function createGPT5MiniAdapter(options = {}) {
  return createOpenAIAdapter("gpt-5-mini", options);
}

/**
 * Create GPT-5 adapter for Azure OpenAI
 * Uses Azure OpenAI endpoint with gpt-5 deployment
 * 
 * @param {Object} options - Configuration options (optional overrides)
 * @returns {OpenAIAdapter} Azure GPT-5 adapter instance
 */
export function createGPT5Adapter(options = {}) {
  return createOpenAIAdapter("gpt-5", options);
}

/**
 * Create GPT-5-Pro adapter for Azure OpenAI
 * Uses Azure OpenAI endpoint with gpt5-pro deployment
 * 
 * @param {Object} options - Configuration options (optional overrides)
 * @returns {OpenAIAdapter} Azure GPT-5-Pro adapter instance
 */
export function createGPT5ProAdapter(options = {}) {
  return createOpenAIAdapter("gpt5-pro", options);
}

