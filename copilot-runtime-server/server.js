/**
 * CopilotKit Runtime Server
 * 
 * Main entry point for the server. This server provides REST API endpoints
 * for CopilotKit with dynamic agent routing based on headers.
 */

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { CopilotRuntime } from "@copilotkit/runtime";

// Configuration
import { PORT, AGENT_BASE_URL, BODY_LIMIT_MB, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, REQUEST_TIMEOUT_MS, HEADERS_TIMEOUT_MS, TRUST_PROXY } from './config/index.js';

// Utilities
import { log } from './utils/index.js';

// Adapters
import { createDynamicServiceAdapter } from './adapters/index.js';

// Agents
import { createDefaultAgent } from './agents/index.js';

// Middleware
import { 
  createCorsMiddleware,
  requestIdMiddleware,
  createDynamicRoutingMiddleware,
  errorHandlerMiddleware,
  notFoundMiddleware
} from './middleware/index.js';

// Routes
import { 
  createCopilotKitEndpoint,
  healthCheckHandler,
  getAgentsHandler,
  getModelsHandler,
  getDefaultsHandler,
  getCompleteConfigHandler
} from './routes/index.js';

// Create Express app
const app = express();

// Trust proxy if behind load balancer
if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// Body parsing middleware
app.use(express.json({ limit: `${BODY_LIMIT_MB}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${BODY_LIMIT_MB}mb` }));

// CORS middleware
app.use(createCorsMiddleware());

// Request ID middleware
app.use(requestIdMiddleware);

// Rate limiting
app.use('/api', rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Initialize server with async configuration loading
(async () => {
  try {
    // Create dynamic adapter (selects provider per-request model)
    const serviceAdapter = await createDynamicServiceAdapter();

    // Create default agent (await since it's async now)
    const defaultAgent = await createDefaultAgent();

    // Create runtime with dynamic agent
    const runtime = new CopilotRuntime({
      agents: {
        "dynamic_agent": defaultAgent,
      },
    });

    // Dynamic routing middleware (must be before copilotkit endpoint)
    const dynamicRoutingMiddleware = createDynamicRoutingMiddleware(runtime);
    app.use('/api/copilotkit', dynamicRoutingMiddleware);

    // CopilotKit endpoint
    const copilotKitEndpoint = createCopilotKitEndpoint(serviceAdapter, runtime);
    app.use('/api/copilotkit', copilotKitEndpoint);

    // Health check endpoint
    app.get('/health', healthCheckHandler);

    // Configuration endpoints for side panel
    app.get('/api/config', getCompleteConfigHandler);
    app.get('/api/config/agents', getAgentsHandler);
    app.get('/api/config/models', getModelsHandler);
    app.get('/api/config/defaults', getDefaultsHandler);

    // 404 handler for unmatched routes (JSON)
    app.use(notFoundMiddleware);

    // Global error handler
    app.use(errorHandlerMiddleware);

    // Start server
    const server = app.listen(PORT, () => {
      log(`🚀 CopilotKit Runtime Server running on http://0.0.0.0:${PORT}`);
      log(`   Health check: http://0.0.0.0:${PORT}/health`);
      log(`   CopilotKit endpoint: http://0.0.0.0:${PORT}/api/copilotkit`);
      log(`   Configuration endpoints:`);
      log(`     - GET http://0.0.0.0:${PORT}/api/config (complete config)`);
      log(`     - GET http://0.0.0.0:${PORT}/api/config/agents`);
      log(`     - GET http://0.0.0.0:${PORT}/api/config/models`);
      log(`     - GET http://0.0.0.0:${PORT}/api/config/defaults`);
      log(`   Configured to forward requests to agent base: ${AGENT_BASE_URL}`);
    });

    // Configure timeouts
    server.setTimeout(REQUEST_TIMEOUT_MS);
    server.headersTimeout = HEADERS_TIMEOUT_MS;

    // Graceful shutdown
    const shutdown = () => {
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
})();
