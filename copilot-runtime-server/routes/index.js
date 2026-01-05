/**
 * Routes Module Exports
 * 
 * Centralizes all route exports for the CopilotKit Runtime Server.
 * This barrel export pattern provides a single import point for all routes.
 * 
 * Note: The CopilotKit endpoint is handled directly in server.js using Hono.
 * 
 * **Route Categories:**
 * 
 * 1. Core Routes:
 *    - health: Health check and readiness probe
 *    - config: Configuration (models, providers, agents, tools)
 * 
 * 2. Authentication:
 *    - auth: Better Auth endpoints
 *    - invitations: Organization invitations
 * 
 * 3. Admin APIs:
 *    - providers: LLM provider config
 *    - models: Model config
 *    - agents: Agent config
 *    - tools: Tool config
 * 
 * 4. Monitoring:
 *    - usage: Usage tracking
 * 
 * @module routes/index
 */

// ============================================================================
// Core Routes
// ============================================================================

export * from './health.js';
export * from './config.js';

// ============================================================================
// Authentication Routes
// ============================================================================

export { default as authRouter } from './auth.js';
export { default as invitationsRouter } from './invitations.js';

// ============================================================================
// Admin Routes
// ============================================================================

export { default as providersRouter } from './providers.js';
export { default as modelsRouter } from './models.js';
export { default as agentsRouter } from './agents.js';
export { default as toolsRouter } from './tools.js';

// ============================================================================
// Monitoring Routes
// ============================================================================

export { default as usageRouter } from './usage.js';

// ============================================================================
// Workspace Routes (Personal Resources)
// ============================================================================

export { default as workspaceRouter } from './workspace.js';
export { default as oauthRouter } from './oauth.js';
