/**
 * Dynamic routing middleware for agent selection
 */

import { DEFAULT_AGENT, DEFAULT_MODEL } from '../config/models.js';
import { DEBUG } from '../config/index.js';
import { log } from '../utils/logger.js';
import { createHttpAgent, getDynamicAgentUrl } from '../agents/dynamic.js';

/**
 * Middleware to log and route dynamic_agent requests based on headers
 */
export function createDynamicRoutingMiddleware(runtime) {
  return (req, res, next) => {
    const agent = req.headers['x-copilot-agent-type'] || req.query.agent || DEFAULT_AGENT;
    const model = req.headers['x-copilot-model-type'] || req.query.model || DEFAULT_MODEL;
    const reqId = res.locals.reqId;
    
    log('=== CopilotKit Request ===', reqId);
    log('Agent:', agent, 'Model:', model, 'Method:', req.method, 'Path:', req.path, 'URL:', req.url);
    
    if (DEBUG) {
      log('Headers:', JSON.stringify({
        'x-copilot-agent-type': req.headers['x-copilot-agent-type'],
        'x-copilot-model-type': req.headers['x-copilot-model-type']
      }));
    }
    
    // Log the body for POST requests (but limit size)
    if (DEBUG && req.method === 'POST' && req.body) {
      try {
        const bodyStr = JSON.stringify(req.body);
        log('Body preview:', bodyStr.substring(0, 200) + (bodyStr.length > 200 ? '...' : ''));
      } catch {}
    }
    
    log('=========================', reqId);
    
    // Always update dynamic_agent to use the correct model and agent from headers
    log(`🔄 Dynamic routing: Updating dynamic_agent to ${model} with agent=${agent}`, reqId);
    log(`   Target URL: ${getDynamicAgentUrl(agent, model)}`, reqId);
    log(`   Headers to forward: x-copilot-agent-type=${agent}, x-copilot-model-type=${model}`, reqId);
    
    // Recreate the HttpAgent with the new URL (agent + model in path) and headers
    runtime.agents['dynamic_agent'] = createHttpAgent(agent, model);
    
    // Ensure GraphQL body includes forwardedParameters.model ONLY for generateCopilotResponse,
    // so we don't break other operations like LoadAgentStateInput
    if (req.method === 'POST' && req.body && typeof req.body === 'object') {
      try {
        const query = typeof req.body.query === 'string' ? req.body.query : '';
        const isGenerateMutation = query.includes('generateCopilotResponse');
        if (isGenerateMutation) {
          const variables = req.body.variables || {};
          const data = variables.data || {};
          const forwardedParameters = data.forwardedParameters || {};
          if (!forwardedParameters.model) {
            forwardedParameters.model = model;
            data.forwardedParameters = forwardedParameters;
            variables.data = data;
            req.body.variables = variables;
            log('🧩 Injected forwardedParameters.model into GraphQL body:', forwardedParameters.model, reqId);
          }
        } else {
          log('ℹ️ Skipping forwardedParameters injection (non-generateCopilotResponse operation)', reqId);
        }
      } catch (e) {
        log('⚠️ Failed to inject forwardedParameters.model into request body', reqId);
      }
    }

    log('✅ HttpAgent updated successfully', reqId);
    
    next();
  };
}

