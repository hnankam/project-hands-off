/**
 * Dynamic service adapter that delegates to the correct provider based on model.
 * Mirrors the dynamic pattern from CopilotKit examples.
 */

import { isClaudeModel, isGeminiModel, isGPTModel, DEFAULT_MODEL } from '../config/models.js';
import { createAnthropicAdapter, createClaudeHaikuAdapter } from './anthropic.js';
import { createGeminiAdapter } from './google.js';
import { createAzureOpenAIAdapter } from './openai.js';
import { log } from '../utils/logger.js';

/**
 * Factory that creates a CopilotServiceAdapter selecting provider per request.model
 */
export function createDynamicServiceAdapter() {
  // Force provider-specific canonical models
  const openaiAdapter = createAzureOpenAIAdapter('gpt-4o-mini');
  const googleAdapter = createGeminiAdapter('gemini-2.5-flash-lite');
  const anthropicHaikuAdapter = createClaudeHaikuAdapter();

  return {
    async process(request) {
      const model = (request?.model
        || request?.forwardedParameters?.model
        || DEFAULT_MODEL);
      
      if (isGeminiModel(model)) {
        log('DynamicServiceAdapter -> provider: Google Generative AI, forced model: gemini-2.5-flash-lite (requested:', model, ')');
        return googleAdapter.process({ ...request, model: 'gemini-2.5-flash-lite' });
      }
      if (isClaudeModel(model)) {
        log('DynamicServiceAdapter -> provider: Anthropic (Bedrock), forced model: claude-4.5-haiku (requested:', model, ')');
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
        return anthropicHaikuAdapter.process({ ...request, model: 'claude-4.5-haiku', messages: sanitizedMessages });
      }
      if (isGPTModel(model)) {
        log('DynamicServiceAdapter -> provider: OpenAI (Azure), forced model: gpt-4o-mini (requested:', model, ')');
        return openaiAdapter.process({ ...request, model: 'gpt-4o-mini' });
      }
      // default to OpenAI-compatible (Azure OpenAI)
      log('DynamicServiceAdapter -> provider: OpenAI (Azure) [default fallback], model:', model);
      return openaiAdapter.process(request);
    },
  };
}


