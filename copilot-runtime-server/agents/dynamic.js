/**
 * Dynamic agent configuration and management
 */

import { HttpAgent } from "@ag-ui/client";
import { AGENT_BASE_URL } from '../config/index.js';
import { getModelEndpoint, getDefaultAgent, getDefaultModel } from '../config/models.js';

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
 * @param {string} agent - The agent type
 * @param {string} model - The model type
 * @param {Object} authContext - Optional authentication context with user, org, and team info
 * @param {Object} extraHeaders - Additional headers to forward
 */
export async function createHttpAgent(agent, model, authContext = {}, extraHeaders = {}) {
  // Get defaults if not provided
  if (!agent) agent = await getDefaultAgent();
  if (!model) model = await getDefaultModel();
  const url = await getDynamicAgentUrl(agent, model);
  
  // Build headers including auth context if provided
  const headers = {
    'x-copilot-agent-type': agent,
    'x-copilot-model-type': model,
    'Content-Type': 'application/json'
  };
  
  // Map of auth context properties to header names
  const authContextMapping = {
    userId: 'x-copilot-user-id',
    userEmail: 'x-copilot-user-email',
    userName: 'x-copilot-user-name',
    organizationId: 'x-copilot-organization-id',
    organizationName: 'x-copilot-organization-name',
    organizationSlug: 'x-copilot-organization-slug',
    memberRole: 'x-copilot-member-role',
    teamId: 'x-copilot-team-id',
    teamName: 'x-copilot-team-name',
    sessionId: 'x-copilot-session-id'
  };
  
  // Add auth context headers if available
  Object.entries(authContextMapping).forEach(([contextKey, headerName]) => {
    if (authContext[contextKey]) {
      headers[headerName] = authContext[contextKey];
  }
  });

  // Forward any additional headers (e.g., client thread identifiers)
  if (extraHeaders && typeof extraHeaders === 'object') {
    Object.entries(extraHeaders).forEach(([key, value]) => {
      if (value != null) {
        headers[key] = value;
      }
    });
  }
  
  return new HttpAgent({ 
    url,
    headers
  });
}

/**
 * Create the default dynamic agent
 * Fetches defaults from database configuration
 */
export async function createDefaultAgent() {
  const agent = await getDefaultAgent();
  const model = await getDefaultModel();
  return await createHttpAgent(agent, model);
}

