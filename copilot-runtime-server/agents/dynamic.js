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
 * @param {string} agent - The agent type
 * @param {string} model - The model type
 * @param {Object} authContext - Optional authentication context with user, org, and team info
 */
export async function createHttpAgent(agent = DEFAULT_AGENT, model = DEFAULT_MODEL, authContext = {}, extraHeaders = {}) {
  const url = await getDynamicAgentUrl(agent, model);
  
  // Build headers including auth context if provided
  const headers = {
    'x-copilot-agent-type': agent,
    'x-copilot-model-type': model,
    'Content-Type': 'application/json'
  };
  
  // Add auth context headers if available
  if (authContext.userId) {
    headers['x-copilot-user-id'] = authContext.userId;
  }
  if (authContext.userEmail) {
    headers['x-copilot-user-email'] = authContext.userEmail;
  }
  if (authContext.userName) {
    headers['x-copilot-user-name'] = authContext.userName;
  }
  if (authContext.organizationId) {
    headers['x-copilot-organization-id'] = authContext.organizationId;
  }
  if (authContext.organizationName) {
    headers['x-copilot-organization-name'] = authContext.organizationName;
  }
  if (authContext.organizationSlug) {
    headers['x-copilot-organization-slug'] = authContext.organizationSlug;
  }
  if (authContext.memberRole) {
    headers['x-copilot-member-role'] = authContext.memberRole;
  }
  if (authContext.teamId) {
    headers['x-copilot-team-id'] = authContext.teamId;
  }
  if (authContext.teamName) {
    headers['x-copilot-team-name'] = authContext.teamName;
  }
  if (authContext.sessionId) {
    headers['x-copilot-session-id'] = authContext.sessionId;
  }

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
 */
export async function createDefaultAgent() {
  return await createHttpAgent(DEFAULT_AGENT, DEFAULT_MODEL);
}

