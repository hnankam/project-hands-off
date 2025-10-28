/**
 * Dynamic agent configuration and management
 */

import { HttpAgent } from "@ag-ui/client";
import { AGENT_BASE_URL } from '../config/index.js';
import { getModelEndpoint, DEFAULT_AGENT, DEFAULT_MODEL } from '../config/models.js';

/**
 * Generate dynamic agent URL based on agent type and model
 */
export async function getDynamicAgentUrl(agent, model) {
  const endpoint = await getModelEndpoint(model);
  // Include agent type in the URL path: /agent/{agent_type}/{model}
  return `${AGENT_BASE_URL}/agent/${agent}/${endpoint}`;
}

/**
 * Create a new HttpAgent with the specified agent and model
 */
export async function createHttpAgent(agent = DEFAULT_AGENT, model = DEFAULT_MODEL) {
  const url = await getDynamicAgentUrl(agent, model);
  return new HttpAgent({ 
    url,
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
export async function createDefaultAgent() {
  return await createHttpAgent(DEFAULT_AGENT, DEFAULT_MODEL);
}

