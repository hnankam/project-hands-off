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
import { teamMembersBypassMiddleware } from './middleware/team-members-bypass.js';

// Routes
import { 
  createCopilotKitEndpoint,
  healthCheckHandler,
  getAgentsHandler,
  getModelsHandler,
  getDefaultsHandler,
  getCompleteConfigHandler,
  getTeamsHandler,
  authRouter,
  invitationsRouter,
  providersRouter,
  modelsRouter,
  agentsRouter,
  baseInstructionsRouter,
  usageRouter,
  toolsRouter,
} from './routes/index.js';

// Create Express app
const app = express();

// Trust proxy if behind load balancer
if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

// CORS middleware MUST be first to handle OPTIONS preflight
app.use(createCorsMiddleware());

// Team members bypass middleware - allow org admins to view all team members
// Must be before auth routes to intercept the request
app.use('/api/auth/organization', teamMembersBypassMiddleware);

// CRITICAL: Mount auth routes BEFORE body parsing middleware
// Per Better Auth docs: https://www.better-auth.com/docs/integrations/express
app.use('/api/auth', authRouter);

// Mount invitations routes with JSON body parsing for POST /create endpoint
app.use('/api/invitations', express.json({ limit: `${BODY_LIMIT_MB}mb` }), invitationsRouter);

// Security headers (after auth to avoid interfering)
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// Request ID middleware
app.use(requestIdMiddleware);

// Rate limiting for non-auth API routes
const apiRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/auth'), // Skip auth routes
});
app.use('/api', apiRateLimiter);

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

    // Body parsing middleware for all other routes (AFTER auth routes per Better Auth docs)
    app.use(express.json({ limit: `${BODY_LIMIT_MB}mb` }));
    app.use(express.urlencoded({ extended: true, limit: `${BODY_LIMIT_MB}mb` }));

    // Admin management endpoints
    app.use('/api/admin/providers', providersRouter);
    app.use('/api/admin/models', modelsRouter);
    app.use('/api/admin/agents', agentsRouter);
    app.use('/api/admin/base-instructions', baseInstructionsRouter);
    app.use('/api/admin/tools', toolsRouter);
    app.use('/api/admin/usage', usageRouter);

    // Configuration endpoints for side panel
    app.get('/api/config', getCompleteConfigHandler);
    app.get('/api/config/agents', getAgentsHandler);
    app.get('/api/config/models', getModelsHandler);
    app.get('/api/config/defaults', getDefaultsHandler);
    app.get('/api/config/teams', getTeamsHandler);

    // 404 handler for unmatched routes (JSON)
    app.use(notFoundMiddleware);

    // Global error handler
    app.use(errorHandlerMiddleware);

    // Start server
    const server = app.listen(PORT, () => {
      log(`🚀 CopilotKit Runtime Server running on http://0.0.0.0:${PORT}`);
      log(`   Health check: http://0.0.0.0:${PORT}/health`);
      log(`   Authentication: http://0.0.0.0:${PORT}/api/auth/*`);
      log(`   Invitations: http://0.0.0.0:${PORT}/api/invitations/*`);
      log(`   Admin: http://0.0.0.0:${PORT}/api/admin/{providers,models,tools}`);
      log(`   CopilotKit endpoint: http://0.0.0.0:${PORT}/api/copilotkit`);
      log(`   Configuration endpoints:`);
      log(`     - GET http://0.0.0.0:${PORT}/api/config (complete config)`);
      log(`     - GET http://0.0.0.0:${PORT}/api/config/agents`);
      log(`     - GET http://0.0.0.0:${PORT}/api/config/models`);
      log(`     - GET http://0.0.0.0:${PORT}/api/config/defaults`);
      log(`     - GET http://0.0.0.0:${PORT}/api/config/teams`);
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
