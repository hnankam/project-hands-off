/**
 * Dynamic service adapter that delegates to the correct provider based on model.
 * Mirrors the dynamic pattern from CopilotKit examples.
 */

import { isClaudeModel, isGeminiModel, isGPTModel, DEFAULT_MODEL } from '../config/models.js';
import { getForcedModel, getModelConfig } from '../config/loader.js';
import { createAnthropicAdapter, createClaudeHaikuAdapter } from './anthropic.js';
import { createGeminiAdapter } from './google.js';
import { createAzureOpenAIAdapter } from './openai.js';
import { log } from '../utils/logger.js';

/**
 * Factory that creates a CopilotServiceAdapter selecting provider per request.model
 */
export async function createDynamicServiceAdapter() {
  // Get default forced models from configuration
  const defaultGeminiModel = 'gemini-2.5-flash-lite';
  const defaultClaudeModel = 'claude-4.5-haiku';
  const defaultGPTModel = 'gpt-4o-mini';
  
  // Create adapters with forced models (await since they're async now)
  const openaiAdapter = await createAzureOpenAIAdapter(defaultGPTModel);
  const googleAdapter = await createGeminiAdapter(defaultGeminiModel);
  const anthropicHaikuAdapter = await createClaudeHaikuAdapter();

  const processWithRetry = async (label, fn, retries = 2) => {
    let lastErr;
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const delay = Math.min(1000 * attempt, 3000);
        log(`Retry ${attempt}/${retries} for ${label} after error: ${err?.message || err}`);
        if (attempt <= retries) {
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  };

  return {
    async process(request) {
      const requestedModel = (request?.model
        || request?.forwardedParameters?.model
        || DEFAULT_MODEL);
      
      // Get forced model from configuration (for cost optimization)
      const forcedModel = await getForcedModel(requestedModel);
      const modelConfig = await getModelConfig(requestedModel);
      
      
      if (isGeminiModel(requestedModel)) {
        const forcedGemini = modelConfig?.forced_model || defaultGeminiModel;
        return processWithRetry('google', () => googleAdapter.process({ ...request, model: forcedGemini }));
      }
      
      if (isClaudeModel(requestedModel)) {
        const forcedClaude = modelConfig?.forced_model || defaultClaudeModel;
        
        // Sanitize messages for Anthropic
        const sanitizeForAnthropic = (msgs = []) => {
          const out = [];
          for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            const isAction = typeof m?.isActionExecutionMessage === 'function' && m.isActionExecutionMessage();
            if (isAction) {
              const next = msgs[i + 1];
              const nextIsResult = next && typeof next.isResultMessage === 'function' && next.isResultMessage();
              const matches = nextIsResult && next.actionExecutionId === m.id;
              if (matches) {
                out.push(m);
                out.push(next);
                i++;
              }
              continue;
            }
            out.push(m);
          }
          return out;
        };
        
        const sanitizedMessages = sanitizeForAnthropic(request.messages);
        return processWithRetry('anthropic', () => anthropicHaikuAdapter.process({ ...request, model: forcedClaude, messages: sanitizedMessages }));
      }
      
      if (isGPTModel(requestedModel)) {
        const forcedGPT = modelConfig?.forced_model || defaultGPTModel;
        return processWithRetry('openai', () => openaiAdapter.process({ ...request, model: forcedGPT }));
      }
      
      // default to OpenAI-compatible (Azure OpenAI)
      return processWithRetry('openai-default', () => openaiAdapter.process(request));
    },
  };
}


