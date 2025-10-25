/**
 * CopilotKit Runtime Server
 * 
 * Main entry point for the server. This server provides REST API endpoints
 * for CopilotKit with dynamic agent routing based on headers.
 */

import express from 'express';
import { CopilotRuntime } from "@copilotkit/runtime";

// Configuration
import { PORT, AGENT_BASE_URL } from './config/index.js';

// Utilities
import { log } from './utils/index.js';

// Adapters
import { createGeminiAdapter } from './adapters/index.js';

// Agents
import { createDefaultAgent } from './agents/index.js';

// Middleware
import { 
  createCorsMiddleware,
  requestIdMiddleware,
  createDynamicRoutingMiddleware,
  errorHandlerMiddleware
} from './middleware/index.js';

// Routes
import { 
  createCopilotKitEndpoint,
  healthCheckHandler
} from './routes/index.js';

// Create Express app
const app = express();

// Body parsing middleware
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// CORS middleware
app.use(createCorsMiddleware());

// Request ID middleware
app.use(requestIdMiddleware);

// Create adapters
const geminiAdapter = createGeminiAdapter();

// Create runtime with dynamic agent
const runtime = new CopilotRuntime({
  agents: {
    "dynamic_agent": createDefaultAgent(),
  },
});

// Dynamic routing middleware (must be before copilotkit endpoint)
const dynamicRoutingMiddleware = createDynamicRoutingMiddleware(runtime);
app.use('/api/copilotkit', dynamicRoutingMiddleware);

// CopilotKit endpoint
const copilotKitEndpoint = createCopilotKitEndpoint(geminiAdapter, runtime);
app.use('/api/copilotkit', copilotKitEndpoint);

// Health check endpoint
app.get('/health', healthCheckHandler);

// Global error handler
app.use(errorHandlerMiddleware);

// Start server
app.listen(PORT, () => {
  log(`🚀 CopilotKit Runtime Server running on http://0.0.0.0:${PORT}`);
  log(`   Health check: http://0.0.0.0:${PORT}/health`);
  log(`   CopilotKit endpoint: http://0.0.0.0:${PORT}/api/copilotkit`);
  log(`   Configured to forward requests to agent base: ${AGENT_BASE_URL}`);
});
