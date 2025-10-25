/**
 * Anthropic adapter configuration
 */

import { AnthropicAdapter } from "@copilotkit/runtime";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { 
  AWS_ACCESS_KEY_ID, 
  AWS_SECRET_ACCESS_KEY, 
  AWS_REGION,
  DEBUG 
} from '../config/index.js';

/**
 * Create Anthropic Bedrock client
 */
export function createAnthropicClient() {
  return new AnthropicBedrock({
    awsAccessKeyId: AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: AWS_SECRET_ACCESS_KEY,
    awsRegion: AWS_REGION,
  });
}

/**
 * Create Anthropic adapter
 * Used for Claude models
 */
export function createAnthropicAdapter() {
  const anthropic = createAnthropicClient();
  
  return new AnthropicAdapter({
    anthropic: anthropic,
    model: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    promptCaching: {
      enabled: true,
      debug: DEBUG
    }
  });
}

/**
 * Create Claude Haiku adapter (Bedrock)
 * Forces the lightweight Haiku family for all Claude requests
 */
export function createClaudeHaikuAdapter() {
  const anthropic = createAnthropicClient();

  return new AnthropicAdapter({
    anthropic: anthropic,
    model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    promptCaching: {
      enabled: true,
      debug: DEBUG
    }
  });
}

