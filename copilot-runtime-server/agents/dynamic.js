/**
 * Dynamic Agent Configuration
 * 
 * Provides HttpAgent instances that forward requests to the Python backend.
 * The Python backend handles LLM provider selection and agent logic.
 * 
 * Agent URL pattern: {base}/agent/{agent_type}/{model}
 * Auth context is forwarded via headers to Python backend.
 */

import { HttpAgent } from "@ag-ui/client";
import { PYDANTIC_SERVICE_URL } from '../config/index.js';
import { getModelEndpoint, getDefaultAgent, getDefaultModel } from '../config/models.js';

/**
 * Generate dynamic agent URL based on agent type and model
 * @param {string} agent - The agent type (e.g., 'general', 'wiki', 'jira')
 * @param {string} model - The model type (e.g., 'claude-4.5-haiku', 'gemini-2.5-flash')
 * @returns {Promise<string>} Full agent URL
 */
export async function getDynamicAgentUrl(agent, model) {
  const endpoint = await getModelEndpoint(model);
  return `${PYDANTIC_SERVICE_URL}/agent/${agent}/${endpoint}`;
}

/**
 * Create a new HttpAgent with the specified agent and model
 * 
 * @param {string} agent - The agent type
 * @param {string} model - The model type
 * @param {Object} authContext - Authentication context with user, org, and team info
 * @param {Object} extraHeaders - Additional headers to forward
 * @returns {Promise<HttpAgent>} HttpAgent instance for the Python backend
 */
export async function createHttpAgent(agent, model, authContext = {}, extraHeaders = {}) {
  if (!agent) agent = await getDefaultAgent();
  if (!model) model = await getDefaultModel();
  
  const url = await getDynamicAgentUrl(agent, model);
  
  const headers = {
    'x-copilot-agent-type': agent,
    'x-copilot-model-type': model,
    'Content-Type': 'application/json'
  };
  
  // Auth context property to header mapping
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
  
  // Add auth context headers
  Object.entries(authContextMapping).forEach(([contextKey, headerName]) => {
    if (authContext[contextKey]) {
      headers[headerName] = authContext[contextKey];
  }
  });

  // Forward additional headers
  if (extraHeaders && typeof extraHeaders === 'object') {
    Object.entries(extraHeaders).forEach(([key, value]) => {
      if (value != null) {
        headers[key] = value;
      }
    });
  }
  
  return new HttpAgent({ url, headers });
}

/**
 * Create the default dynamic agent
 * Fetches defaults from database configuration
 * 
 * @returns {Promise<HttpAgent>} Default HttpAgent instance
 */
export async function createDefaultAgent() {
  const agent = await getDefaultAgent();
  const model = await getDefaultModel();
  return await createHttpAgent(agent, model);
}
