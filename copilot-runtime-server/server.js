/**
 * CopilotKit Runtime Server
 * 
 * Main entry point for the Express server providing AI copilot functionality
 * with multi-tenant support, dynamic agent routing, and comprehensive admin APIs.
 * 
 * Architecture:
 * - Express.js web server with security middleware
 * - CopilotKit runtime integration for AI chat
 * - Dynamic agent/model selection based on request headers
 * - Multi-tenant configuration (organization/team scoped)
 * - Better Auth for authentication and organization management
 * - PostgreSQL database for configuration and usage tracking
 * 
 * Key Features:
 * - Dynamic LLM provider/model selection per request
 * - Role-based access control (owner, admin, member)
 * - Organization and team management
 * - Real-time usage analytics
 * - MCP (Model Context Protocol) server integration
 * - Invitation system for organization onboarding
 * 
 * API Categories:
 * - /api/copilotkit - Main AI chat endpoint
 * - /api/auth - Authentication (Better Auth)
 * - /api/invitations - Organization invitations
 * - /api/admin - Configuration management (models, providers, agents, tools)
 * - /api/config - Runtime configuration for clients
 * - /health - Health check endpoint
 * 
 * @module server
 */

// ============================================================================
// External Dependencies
// ============================================================================

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { CopilotRuntime } from "@copilotkit/runtime";

// ============================================================================
// Configuration
// ============================================================================

import { 
  PORT, 
  AGENT_BASE_URL, 
  BODY_LIMIT_MB, 
  RATE_LIMIT_WINDOW_MS, 
  RATE_LIMIT_MAX, 
  REQUEST_TIMEOUT_MS, 
  HEADERS_TIMEOUT_MS, 
  TRUST_PROXY 
} from './config/index.js';

// ============================================================================
// Utilities
// ============================================================================

import { log } from './utils/index.js';

// ============================================================================
// Adapters
// ============================================================================

import { createDynamicServiceAdapter, captureRequestContext } from './adapters/index.js';

// ============================================================================
// Agents
// ============================================================================

import { createDefaultAgent } from './agents/index.js';

// ============================================================================
// Middleware
// ============================================================================

import { 
  createCorsMiddleware,
  requestIdMiddleware,
  createDynamicRoutingMiddleware,
  errorHandlerMiddleware,
  notFoundMiddleware
} from './middleware/index.js';
import { teamMembersBypassMiddleware } from './middleware/team-members-bypass.js';

// ============================================================================
// Routes
// ============================================================================

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

// ============================================================================
// Express Application Setup
// ============================================================================

/**
 * Main Express application instance
 * Configured with security, rate limiting, and multi-tenant routing
 */
const app = express();

// ============================================================================
// Middleware Configuration (Order Matters!)
// ============================================================================

/**
 * 1. Proxy Configuration
 * Trust proxy headers when behind a load balancer (e.g., nginx, AWS ELB)
 */
if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

/**
 * 2. CORS Middleware (MUST BE FIRST)
 * Handles preflight OPTIONS requests before any other middleware
 */
app.use(createCorsMiddleware());

/**
 * 3. Better Auth Special Middleware
 * Allows organization owners/admins to view all team members
 * Must intercept before auth routes process the request
 */
app.use('/api/auth/organization', teamMembersBypassMiddleware);

/**
 * 4. Authentication Routes (BEFORE body parsing!)
 * Per Better Auth docs: https://www.better-auth.com/docs/integrations/express
 * Better Auth handles its own body parsing internally
 */
app.use('/api/auth', authRouter);

/**
 * 5. Invitations Routes (with body parsing)
 * Needs JSON body parsing for POST /create endpoint
 */
app.use('/api/invitations', express.json({ limit: `${BODY_LIMIT_MB}mb` }), invitationsRouter);

/**
 * 6. Security Headers
 * Applied after auth to avoid interfering with Better Auth's internal processing
 * Allows popups for OAuth flows (same-origin-allow-popups)
 */
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

/**
 * 7. Request ID Middleware
 * Generates unique ID for each request for correlation and tracing
 * Format: rt_<timestamp>_<random>
 */
app.use(requestIdMiddleware);

/**
 * 8. Rate Limiting
 * Protects non-auth API routes from abuse
 * Auth routes are skipped (they have their own protection)
 */
const apiRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,  // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,   // Disable `X-RateLimit-*` headers
  skip: (req) => req.path.startsWith('/auth'), // Skip auth routes
});
app.use('/api', apiRateLimiter);

// ============================================================================
// Async Server Initialization
// ============================================================================

/**
 * Initializes the server with async configuration loading
 * 
 * Initialization Steps:
 * 1. Create dynamic service adapter (LLM provider selector)
 * 2. Create default agent (fallback agent)
 * 3. Initialize CopilotKit runtime
 * 4. Mount CopilotKit middleware chain
 * 5. Mount remaining API routes
 * 6. Start HTTP server
 */
(async () => {
  try {
    // ========================================================================
    // CopilotKit Initialization
    // ========================================================================

    /**
     * Dynamic Service Adapter
     * Selects appropriate LLM provider based on requested model
     * Supports: OpenAI, Azure OpenAI, Anthropic (Bedrock), Google Gemini
     */
    const serviceAdapter = await createDynamicServiceAdapter();

    /**
     * Default Agent
     * Fallback agent when no specific agent is requested
     * Points to Python backend for processing
     */
    const defaultAgent = await createDefaultAgent();

    /**
     * CopilotKit Runtime
     * Core runtime that manages agents and processes chat requests
     */
    const runtime = new CopilotRuntime({
      agents: {
        "dynamic_agent": defaultAgent,
      },
    });

    // ========================================================================
    // CopilotKit Endpoint Middleware Chain
    // ========================================================================

    /**
     * 1. Dynamic Routing Middleware
     * - Extracts agent/model from headers
     * - Validates authentication
     * - Selects organization/team context
     * - Updates runtime with correct agent dynamically
     */
    const dynamicRoutingMiddleware = createDynamicRoutingMiddleware(runtime);
    app.use('/api/copilotkit', dynamicRoutingMiddleware);

    /**
     * 2. Context Capture Middleware
     * - Captures auth context (org/team/user)
     * - Makes context available to service adapter
     * - Enables multi-tenant model/provider selection
     */
    app.use('/api/copilotkit', captureRequestContext);

    /**
     * 3. CopilotKit Endpoint
     * - Main chat/completion endpoint
     * - Handles GraphQL mutations from client
     * - Streams responses back to client
     */
    const copilotKitEndpoint = createCopilotKitEndpoint(serviceAdapter, runtime);
    app.use('/api/copilotkit', copilotKitEndpoint);

    // ========================================================================
    // Health Check & Monitoring
    // ========================================================================

    /**
     * Health check endpoint for load balancers and monitoring
     * Returns: { status: "ok|degraded", db: boolean }
     */
    app.get('/health', healthCheckHandler);

    // ========================================================================
    // Body Parsing Middleware
    // Applied AFTER auth routes per Better Auth requirements
    // ========================================================================

    app.use(express.json({ limit: `${BODY_LIMIT_MB}mb` }));
    app.use(express.urlencoded({ extended: true, limit: `${BODY_LIMIT_MB}mb` }));

    // ========================================================================
    // Admin API Routes (Configuration Management)
    // Require authentication and admin/owner role
    // ========================================================================

    app.use('/api/admin/providers', providersRouter);
    app.use('/api/admin/models', modelsRouter);
    app.use('/api/admin/agents', agentsRouter);
    app.use('/api/admin/base-instructions', baseInstructionsRouter);
    app.use('/api/admin/tools', toolsRouter);
    app.use('/api/admin/usage', usageRouter);

    // ========================================================================
    // Public Configuration Endpoints
    // Used by client (Chrome extension, web app) to get available options
    // ========================================================================

    app.get('/api/config', getCompleteConfigHandler);
    app.get('/api/config/agents', getAgentsHandler);
    app.get('/api/config/models', getModelsHandler);
    app.get('/api/config/defaults', getDefaultsHandler);
    app.get('/api/config/teams', getTeamsHandler);

    // ========================================================================
    // Error Handlers (Must be last!)
    // ========================================================================

    /**
     * 404 handler for unmatched routes
     * Returns consistent JSON error response
     */
    app.use(notFoundMiddleware);

    /**
     * Global error handler
     * Catches all errors and formats consistent JSON responses
     */
    app.use(errorHandlerMiddleware);

    // ========================================================================
    // HTTP Server Startup
    // ========================================================================

    /**
     * Start the HTTP server and log available endpoints
     */
    const server = app.listen(PORT, () => {
      log('═══════════════════════════════════════════════════════════════════');
      log('CopilotKit Runtime Server - Ready');
      log('═══════════════════════════════════════════════════════════════════');
      log('');
      log(`Server:        http://0.0.0.0:${PORT}`);
      log(`Health Check:  http://0.0.0.0:${PORT}/health`);
      log('');
      log('Authentication & Organizations:');
      log(`   - POST   ${PORT}/api/auth/sign-in/email`);
      log(`   - POST   ${PORT}/api/auth/sign-up/email`);
      log(`   - GET    ${PORT}/api/auth/session`);
      log(`   - POST   ${PORT}/api/invitations/create`);
      log(`   - POST   ${PORT}/api/invitations/:id/accept`);
      log('');
      log('AI Chat Endpoint:');
      log(`   - POST   ${PORT}/api/copilotkit`);
      log('');
      log('Admin APIs (require auth + admin/owner role):');
      log(`   - /api/admin/providers`);
      log(`   - /api/admin/models`);
      log(`   - /api/admin/agents`);
      log(`   - /api/admin/tools`);
      log(`   - /api/admin/base-instructions`);
      log(`   - /api/admin/usage`);
      log('');
      log('Public Configuration APIs:');
      log(`   - GET    ${PORT}/api/config (complete)`);
      log(`   - GET    ${PORT}/api/config/agents`);
      log(`   - GET    ${PORT}/api/config/models`);
      log(`   - GET    ${PORT}/api/config/defaults`);
      log(`   - GET    ${PORT}/api/config/teams`);
      log('');
      log(`Python Backend: ${AGENT_BASE_URL}`);
      log('═══════════════════════════════════════════════════════════════════');
    });

    // ========================================================================
    // Server Timeout Configuration
    // ========================================================================

    /**
     * Set request timeout (default: 120 seconds)
     * Long timeout needed for streaming LLM responses
     */
    server.setTimeout(REQUEST_TIMEOUT_MS);

    /**
     * Set headers timeout (must be > setTimeout)
     * Prevents premature connection closure
     */
    server.headersTimeout = HEADERS_TIMEOUT_MS;

    // ========================================================================
    // Graceful Shutdown Handler
    // ========================================================================

    /**
     * Handle SIGINT (Ctrl+C) and SIGTERM (kill command)
     * Allows in-flight requests to complete before shutdown
     */
    const shutdown = () => {
      log('');
      log('Shutting down gracefully...');
      server.close(() => {
        log('Server closed. Goodbye!');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    // ========================================================================
    // Initialization Error Handler
    // ========================================================================

    console.error('═══════════════════════════════════════════════════════════════════');
    console.error('Failed to initialize server');
    console.error('═══════════════════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    console.error('═══════════════════════════════════════════════════════════════════');
    process.exit(1);
  }
})();
