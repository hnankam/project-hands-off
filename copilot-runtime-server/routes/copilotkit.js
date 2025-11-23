/**
 * CopilotKit Endpoint Configuration
 * 
 * Creates the main CopilotKit runtime endpoint for handling AI chat requests.
 * This endpoint processes messages from the Chrome extension and forwards them
 * to the appropriate LLM provider via the service adapter.
 * 
 * Flow:
 * 1. Chrome extension sends chat message to /api/copilotkit
 * 2. Dynamic routing middleware updates the HttpAgent with context
 * 3. Service adapter selects the appropriate LLM provider (Anthropic/Google/OpenAI)
 * 4. Request is forwarded to Python backend with full context
 * 5. Python backend processes with the selected agent and model
 * 6. Streaming response is returned to the Chrome extension
 * 
 * The endpoint is created using CopilotKit's official Node.js/Express adapter.
 */

import { copilotRuntimeNodeExpressEndpoint } from "@copilotkit/runtime";

/**
 * Create CopilotKit endpoint for Express
 * 
 * Wraps the CopilotKit runtime with Express-compatible handlers.
 * This endpoint handles GraphQL queries and mutations from the CopilotKit client.
 * 
 * @param {Object} serviceAdapter - LLM service adapter (handles model selection and routing)
 * @param {Object} runtime - CopilotKit runtime instance (manages agents and actions)
 * @returns {Function} Express router middleware
 * 
 * @example
 * const serviceAdapter = await createDynamicServiceAdapter();
 * const runtime = new CopilotRuntime();
 * const endpoint = createCopilotKitEndpoint(serviceAdapter, runtime);
 * app.use('/api/copilotkit', endpoint);
 */
export function createCopilotKitEndpoint(serviceAdapter, runtime) {
  return copilotRuntimeNodeExpressEndpoint({
    endpoint: '/api/copilotkit',
    serviceAdapter,  // Dynamic adapter that routes to Anthropic/Google/OpenAI
    runtime,         // CopilotKit runtime with agents and actions
  });
}

