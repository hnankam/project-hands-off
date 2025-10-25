/**
 * CopilotKit endpoint configuration
 */

import { copilotRuntimeNodeExpressEndpoint } from "@copilotkit/runtime";

/**
 * Create CopilotKit endpoint
 */
export function createCopilotKitEndpoint(serviceAdapter, runtime) {
  return copilotRuntimeNodeExpressEndpoint({
    endpoint: '/api/copilotkit',
    serviceAdapter,
    runtime,
  });
}

