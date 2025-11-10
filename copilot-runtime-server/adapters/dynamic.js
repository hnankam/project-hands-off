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
  
  // Adapter cache per organization context
  const adapterCache = new Map();
  
  const getOrCreateAdapter = async (type, model, context = {}) => {
    const cacheKey = `${type}-${context.organizationId || 'global'}-${context.teamId || 'global'}`;
    
    if (!adapterCache.has(cacheKey)) {
      log(`Creating ${type} adapter for context: org=${context.organizationId || 'null'} team=${context.teamId || 'null'}`);
      let adapter;
      
      switch (type) {
        case 'openai':
          adapter = await createAzureOpenAIAdapter(model, context);
          break;
        case 'google':
          adapter = await createGeminiAdapter(model, context);
          break;
        case 'anthropic':
          adapter = await createClaudeHaikuAdapter(context);
          break;
        default:
          throw new Error(`Unknown adapter type: ${type}`);
      }
      
      adapterCache.set(cacheKey, adapter);
    }
    
    return adapterCache.get(cacheKey);
  };

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
      
      // Extract context from request (should be set by middleware)
      const context = {
        organizationId: request?.context?.organizationId,
        teamId: request?.context?.teamId,
      };
      
      // Get forced model from configuration (for cost optimization)
      const forcedModel = await getForcedModel(requestedModel, context);
      const modelConfig = await getModelConfig(requestedModel, context);
      
      
      if (isGeminiModel(requestedModel)) {
        const forcedGemini = modelConfig?.forced_model || defaultGeminiModel;
        const googleAdapter = await getOrCreateAdapter('google', forcedGemini, context);
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
        const anthropicAdapter = await getOrCreateAdapter('anthropic', forcedClaude, context);
        return processWithRetry('anthropic', () => anthropicAdapter.process({ ...request, model: forcedClaude, messages: sanitizedMessages }));
      }
      
      if (isGPTModel(requestedModel)) {
        const forcedGPT = modelConfig?.forced_model || defaultGPTModel;
        const openaiAdapter = await getOrCreateAdapter('openai', forcedGPT, context);
        return processWithRetry('openai', () => openaiAdapter.process({ ...request, model: forcedGPT }));
      }
      
      // default to OpenAI-compatible (Azure OpenAI)
      const openaiAdapter = await getOrCreateAdapter('openai', defaultGPTModel, context);
      return processWithRetry('openai-default', () => openaiAdapter.process(request));
    },
  };
}


