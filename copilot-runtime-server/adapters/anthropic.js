/**
 * Anthropic adapter configuration
 */

import { AnthropicAdapter } from "@copilotkit/runtime";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { DEBUG } from '../config/index.js';
import { 
  getProviderConfig, 
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
  
  // Support both 'aws_region' and 'region' field names for backward compatibility
  const effectiveRegion = aws_region || region;
  
  if (!aws_access_key_id || !aws_secret_access_key || !effectiveRegion) {
    throw new Error(`Missing required AWS credentials in database configuration. Found: ${JSON.stringify({
      hasAccessKey: !!aws_access_key_id,
      hasSecretKey: !!aws_secret_access_key,
      hasRegion: !!effectiveRegion,
      credentials: Object.keys(providerConfig.credentials || {})
    })}`);
  }
  
  return new AnthropicBedrock({
    awsAccessKeyId: aws_access_key_id,
    awsSecretAccessKey: aws_secret_access_key,
    awsRegion: effectiveRegion,
  });
}

/**
 * Create Anthropic adapter with specified model
 * Used for Claude models via Bedrock
 * 
 * @param {string} modelKey - Model key from configuration (e.g., 'claude-4.5-haiku')
 */
export async function createAnthropicAdapter(modelKey = 'claude-3.7-sonnet') {
  const modelConfig = await getModelConfig(modelKey);
  const providerConfig = await getProviderConfig('anthropic_bedrock');
  const anthropic = createAnthropicClient(providerConfig);
  
  const bedrockModelId = modelConfig 
    ? await getBedrockModelId(modelKey)
    : "us.anthropic.claude-3-7-sonnet-20250219-v1:0";
  
  return new AnthropicAdapter({
    anthropic: anthropic,
    model: bedrockModelId,
    promptCaching: {
      enabled: providerConfig?.default_settings?.prompt_caching?.enabled ?? true,
      debug: DEBUG
    }
  });
}

/**
 * Create Claude Haiku adapter (Bedrock)
 * Forces the lightweight Haiku family for all Claude requests
 */
export async function createClaudeHaikuAdapter() {
  return await createAnthropicAdapter('claude-4.5-haiku');
}

