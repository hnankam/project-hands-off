/**
 * Dynamic agent configuration and management
 */

import { HttpAgent } from "@ag-ui/client";
import { AGENT_BASE_URL } from '../config/index.js';
import { getModelEndpoint, DEFAULT_AGENT, DEFAULT_MODEL } from '../config/models.js';

/**
 * Generate dynamic agent URL based on agent type and model
 */
export function getDynamicAgentUrl(agent, model) {
  const endpoint = getModelEndpoint(model);
  // Include agent type in the URL path: /agent/{agent_type}/{model}
  return `${AGENT_BASE_URL}/agent/${agent}/${endpoint}`;
}

/**
 * Create a new HttpAgent with the specified agent and model
 */
export function createHttpAgent(agent = DEFAULT_AGENT, model = DEFAULT_MODEL) {
  return new HttpAgent({ 
    url: getDynamicAgentUrl(agent, model),
    headers: {
      'x-copilot-agent-type': agent,
      'x-copilot-model-type': model,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Create the default dynamic agent
 */
export function createDefaultAgent() {
  return createHttpAgent(DEFAULT_AGENT, DEFAULT_MODEL);
}

