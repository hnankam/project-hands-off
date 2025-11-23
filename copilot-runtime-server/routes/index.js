/**
 * Routes Module Exports
 * 
 * Centralizes all route exports for the CopilotKit Runtime Server.
 * This barrel export pattern provides a single import point for all routes,
 * making it easier to import multiple routes in server.js.
 * 
 * **Route Categories:**
 * 
 * 1. Core Runtime Routes:
 *    - copilotkit: Main CopilotKit endpoint for AI chat interactions
 *    - health: Health check and readiness probe endpoint
 *    - config: Multi-resource configuration endpoint (models, providers, agents, tools)
 * 
 * 2. Authentication & Authorization:
 *    - auth: Better Auth endpoints and session management
 *    - invitations: Organization invitation management
 * 
 * 3. Configuration Management (Admin):
 *    - providers: LLM provider configuration (Anthropic, Google, OpenAI)
 *    - models: Model configuration (Claude, Gemini, GPT)
 *    - agents: Agent configuration (general, wiki, jira)
 *    - baseInstructions: Organization-level AI instructions
 *    - tools: Tool configuration for AI agents
 * 
 * 4. Monitoring:
 *    - usage: Usage tracking and analytics
 * 
 * **Usage:**
 * ```javascript
 * import { 
 *   createCopilotKitEndpoint, 
 *   healthCheckHandler,
 *   authRouter,
 *   agentsRouter 
 * } from './routes/index.js';
 * ```
 * 
 * @module routes/index
 */

// ============================================================================
// Core Runtime Routes (Functions)
// ============================================================================

/**
 * CopilotKit endpoint factory function
 * Creates the main AI chat endpoint
 */
export * from './copilotkit.js';

/**
 * Health check handler function
 * Provides service health and readiness status
 */
export * from './health.js';

/**
 * Multi-resource configuration endpoint
 * Returns models, providers, agents, and tools configuration
 */
export * from './config.js';

// ============================================================================
// Authentication & Authorization Routes (Routers)
// ============================================================================

/**
 * Authentication router (Better Auth)
 * Handles user authentication, sessions, and organization management
 */
export { default as authRouter } from './auth.js';

/**
 * Organization invitation router
 * Manages organization member invitations and acceptance
 */
export { default as invitationsRouter } from './invitations.js';

// ============================================================================
// Configuration Management Routes (Admin Routers)
// ============================================================================

/**
 * LLM Providers router (Admin)
 * CRUD operations for provider configuration (Anthropic, Google, OpenAI)
 */
export { default as providersRouter } from './providers.js';

/**
 * Models router (Admin)
 * CRUD operations for model configuration (Claude, Gemini, GPT)
 */
export { default as modelsRouter } from './models.js';

/**
 * Agents router (Admin)
 * CRUD operations for agent configuration (general, wiki, jira)
 */
export { default as agentsRouter } from './agents.js';

/**
 * Base Instructions router (Admin)
 * CRUD operations for organization-level AI instructions
 */
export { default as baseInstructionsRouter } from './base-instructions.js';

/**
 * Tools router (Admin)
 * CRUD operations for tool configuration (external APIs, integrations)
 */
export { default as toolsRouter } from './tools.js';

// ============================================================================
// Monitoring Routes (Routers)
// ============================================================================

/**
 * Usage tracking router
 * Handles usage analytics and metrics
 */
export { default as usageRouter } from './usage.js';

