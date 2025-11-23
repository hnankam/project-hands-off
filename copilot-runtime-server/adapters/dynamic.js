/**
 * Dynamic service adapter that delegates to the correct provider based on model.
 * Mirrors the dynamic pattern from CopilotKit examples.
 */

import { isClaudeModel, isGeminiModel, isGPTModel, getDefaultModel } from '../config/models.js';
import { getForcedModel, getModelConfig } from '../config/loader.js';
import { createAnthropicAdapter } from './anthropic.js';
import { createGeminiAdapter } from './google.js';
import { createAzureOpenAIAdapter } from './openai.js';
import { log } from '../utils/logger.js';
import { DEBUG } from '../config/environment.js';

// Global context storage for the current request
let currentRequestContext = { 
  organizationId: null, 
  teamId: null,
  agent: null,
  model: null
};

/**
 * Middleware to capture organization, team, agent, and model context from Express request
 * Must be called before the CopilotKit endpoint processes the request
 */
export function captureRequestContext(req, res, next) {
  currentRequestContext = {
    organizationId: req.authContext?.organizationId || null,
    teamId: req.authContext?.teamId || null,
    agent: req.headers['x-copilot-agent-type'] || req.query?.agent || null,
    model: req.headers['x-copilot-model-type'] || req.query?.model || null,
  };
  
  if (DEBUG && currentRequestContext.model) {
    log(`[Context] Captured model=${currentRequestContext.model} agent=${currentRequestContext.agent}`);
  }
  
  next();
}

/**
 * Factory that creates a CopilotServiceAdapter selecting provider per request.model
 */
export async function createDynamicServiceAdapter() {
  // Adapter cache per organization context and model
  const adapterCache = new Map();
  
  const getOrCreateAdapter = async (type, model, context = {}) => {
    const cacheKey = `${type}-${model}-${context.organizationId || 'global'}-${context.teamId || 'global'}`;
    
    if (!adapterCache.has(cacheKey)) {
      log(`Creating ${type} adapter for model=${model} context: org=${context.organizationId || 'null'} team=${context.teamId || 'null'}`);
      let adapter;
      
      switch (type) {
        case 'openai':
          adapter = await createAzureOpenAIAdapter(model, context);
          break;
        case 'google':
          adapter = await createGeminiAdapter(model, context);
          break;
        case 'anthropic':
          adapter = await createAnthropicAdapter(model, context);
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
      // Use model from request, or from captured context, or fall back to default
      const requestedModel = (request?.model
        || request?.forwardedParameters?.model
        || currentRequestContext.model
        || await getDefaultModel());
      
      // Extract context from global context (set by middleware)
      const context = {
        organizationId: currentRequestContext.organizationId,
        teamId: currentRequestContext.teamId,
      };
      
      // Get model configuration (includes forced model if set)
      const modelConfig = await getModelConfig(requestedModel, context);
      const effectiveModel = modelConfig?.forced_model || requestedModel;
      
      if (isGeminiModel(requestedModel)) {
        const googleAdapter = await getOrCreateAdapter('google', effectiveModel, context);
        return processWithRetry('google', () => googleAdapter.process({ ...request, model: effectiveModel }));
      }
      
      if (isClaudeModel(requestedModel)) {
        // Sanitize messages for Anthropic - remove unpaired action execution messages
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
        const anthropicAdapter = await getOrCreateAdapter('anthropic', effectiveModel, context);
        return processWithRetry('anthropic', () => anthropicAdapter.process({ ...request, model: effectiveModel, messages: sanitizedMessages }));
      }
      
      if (isGPTModel(requestedModel)) {
        const openaiAdapter = await getOrCreateAdapter('openai', effectiveModel, context);
        return processWithRetry('openai', () => openaiAdapter.process({ ...request, model: effectiveModel }));
      }
      
      // Unknown model type - throw error instead of silently defaulting
      throw new Error(`Unsupported model type: ${requestedModel}. Must be a GPT, Claude, or Gemini model.`);
    },
  };
}


