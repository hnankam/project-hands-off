/**
 * Anthropic adapter configuration
 */

import { AnthropicAdapter } from "@copilotkit/runtime";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { DEBUG } from '../config/index.js';
import { 
  getProviderConfigByType, 
  getModelConfig,
  getBedrockModelId 
} from '../config/loader.js';

/**
 * Create Anthropic Bedrock client using database credentials
 * @param {Object} providerConfig - Provider configuration from database
 */
export function createAnthropicClient(providerConfig) {
  if (!providerConfig?.credentials) {
    throw new Error('Anthropic Bedrock credentials not found in database configuration');
  }
  
  const { aws_access_key_id, aws_secret_access_key, aws_region, region } = providerConfig.credentials;
  const effectiveRegion = aws_region || region;
  
  if (!aws_access_key_id || !aws_secret_access_key || !effectiveRegion) {
    throw new Error('Missing required AWS credentials (access_key, secret_key, or region)');
  }
  
  // Clear AWS environment variables to prevent credential chain conflicts
  const originalSessionToken = process.env.AWS_SESSION_TOKEN;
  const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
  const originalSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
  
  if (originalSessionToken) delete process.env.AWS_SESSION_TOKEN;
  if (originalAccessKey) delete process.env.AWS_ACCESS_KEY_ID;
  if (originalSecretKey) delete process.env.AWS_SECRET_ACCESS_KEY;
  
  // IMPORTANT: Use correct Bedrock SDK parameter names
  // awsAccessKey/awsSecretKey (not awsAccessKeyId/awsSecretAccessKey)
  // providerChainResolver: null disables AWS credential chain (prevents ~/.aws/credentials interference)
  const client = new AnthropicBedrock({
    awsAccessKey: aws_access_key_id,
    awsSecretKey: aws_secret_access_key,
    awsRegion: effectiveRegion,
    awsSessionToken: null,
    providerChainResolver: null, // Only use explicit credentials
  });
  
  // Restore environment variables
  if (originalSessionToken) process.env.AWS_SESSION_TOKEN = originalSessionToken;
  if (originalAccessKey) process.env.AWS_ACCESS_KEY_ID = originalAccessKey;
  if (originalSecretKey) process.env.AWS_SECRET_ACCESS_KEY = originalSecretKey;
  
  return client;
}

/**
 * Create Anthropic adapter with specified model
 * Used for Claude models via Bedrock
 * 
 * @param {string} modelKey - Model key from configuration (e.g., 'claude-4.5-haiku')
 * @param {object} context - Organization/team context for loading configuration
 */
export async function createAnthropicAdapter(modelKey, context = {}) {
  if (!modelKey) {
    throw new Error('Model key is required for createAnthropicAdapter');
  }
  
  const modelConfig = await getModelConfig(modelKey, context);
  if (!modelConfig) {
    throw new Error(`Model configuration not found for key: ${modelKey}`);
  }
  
  const providerConfig = await getProviderConfigByType('anthropic_bedrock', context);
  const anthropic = createAnthropicClient(providerConfig);
  
  const bedrockModelId = await getBedrockModelId(modelKey, context);
  if (!bedrockModelId) {
    throw new Error(`Bedrock model ID not found for model key: ${modelKey}`);
  }
  
  return new AnthropicAdapter({
    anthropic: anthropic,
    model: bedrockModelId,
    promptCaching: {
      enabled: providerConfig?.default_settings?.prompt_caching?.enabled ?? true,
      debug: DEBUG
    }
  });
}

