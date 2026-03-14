/**
 * CopilotKit Runtime Server
 * 
 * Express + Hono hybrid server providing AI copilot functionality
 * with multi-tenant support, dynamic agent routing, and admin APIs.
 * 
 * Architecture:
 * - Express.js for auth and admin APIs
 * - Hono for CopilotKit runtime (AG-UI protocol)
 * - HttpAgent forwards requests to Python backend
 * - Dynamic agent/model selection via request headers
 * - Multi-tenant configuration (organization/team scoped)
 * - Better Auth for authentication
 * - PostgreSQL for configuration and usage tracking
 * 
 * API Endpoints:
 * - /api/copilotkit - AI chat endpoint (AG-UI protocol)
 * - /api/auth - Authentication (Better Auth)
 * - /api/invitations - Organization invitations
 * - /api/admin - Configuration management
 * - /api/config - Runtime configuration
 * - /health - Health check
 * 
 * @module server
 */

// ============================================================================
// External Dependencies
// ============================================================================

import express from 'express';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  CopilotRuntime,
  createCopilotEndpoint,
  // InMemoryAgentRunner  // Commented out - using PostgresAgentRunner instead
} from '@copilotkit/runtime/v2';
import { HttpAgent } from '@ag-ui/client';

// PostgresAgentRunner for persistent storage
import { PostgresAgentRunner } from './runners/postgres-agent-runner.js';
import {SqliteAgentRunner} from "@copilotkitnext/sqlite-runner";

// ============================================================================
// Configuration
// ============================================================================

import { 
  PORT, 
  PYDANTIC_SERVICE_URL,
  BODY_LIMIT_MB, 
  REQUEST_TIMEOUT_MS, 
  HEADERS_TIMEOUT_MS, 
  TRUST_PROXY,
  DEBUG,
  AGENT_RUNNER_TRANSFORM_ERRORS,
  AGENT_RUNNER_DISABLE_CLEANUP,
  AGENT_RUNNER_THREAD_TTL,
  AGENT_RUNNER_CLEANUP_INTERVAL
} from './config/index.js';

// Runner configuration
const USE_SQLITE_RUNNER = process.env.USE_SQLITE_RUNNER === 'true';
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || './copilotkit.db';

// ============================================================================
// Utilities
// ============================================================================

import { log } from './utils/index.js';

// ============================================================================
// Database & Auth
// ============================================================================

import { auth } from './auth/index.js';
import { ensureAuthenticated } from './utils/route-helpers.js';
import { getPool } from './config/database.js';
import { getDefaultAgent, getDefaultModel } from './config/models.js';

// ============================================================================
// Middleware
// ============================================================================

import { 
  createCorsMiddleware,
  requestIdMiddleware,
  errorHandlerMiddleware,
  notFoundMiddleware
} from './middleware/index.js';
import { teamMembersBypassMiddleware } from './middleware/team-members-bypass.js';

// ============================================================================
// Routes
// ============================================================================

import { 
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
  usageRouter,
  toolsRouter,
  skillsRouter,
  workspaceRouter,
  oauthRouter,
} from './routes/index.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_AGENT_ID = 'dynamic_agent';

// ============================================================================
// Agent Cache (by agentType:modelType:orgId:teamId)
// ============================================================================

/**
 * Cache for HttpAgent instances keyed by "agentType:modelType:orgId:teamId"
 * Agents are reused for the same org/team/agent/model combination.
 * Only truly per-request fields (requestId, threadId) are added at request time.
 */
const agentCache = new Map();

// Cache size limit to prevent memory leaks
const AGENT_CACHE_MAX_SIZE = 100;

/**
 * Generate cache key for agent lookup
 */
function getAgentCacheKey(agentType, modelType, orgId, teamId) {
  return `${agentType}:${modelType}:${orgId || 'global'}:${teamId || 'global'}`;
}

/**
 * Get or create a cached HttpAgent for the given context
 * @param {Object} context - Request context
 * @returns {HttpAgent} Cached or new HttpAgent
 */
function getCachedAgent(context) {
  const { agentType, modelType, authContext } = context;
  const orgId = authContext?.organizationId;
  const teamId = authContext?.teamId;
  const cacheKey = getAgentCacheKey(agentType, modelType, orgId, teamId);
  
  if (agentCache.has(cacheKey)) {
    return { agent: agentCache.get(cacheKey), cached: true, cacheKey };
  }
  
  // Evict oldest entries if cache is full
  if (agentCache.size >= AGENT_CACHE_MAX_SIZE) {
    const firstKey = agentCache.keys().next().value;
    agentCache.delete(firstKey);
    if (DEBUG) {
      log(`Agent cache evicted: ${firstKey}`);
    }
  }
  
  const url = `${PYDANTIC_SERVICE_URL}/agent/${agentType}/${modelType}`;
  const headers = {
    'x-copilot-agent-type': agentType,
    'x-copilot-model-type': modelType,
    'Content-Type': 'application/json',
  };

  // Add stable auth context headers (org/team don't change per-request)
  // NOTE: Do NOT include sessionId here - it's per-request and added in buildPerRequestHeaders
  if (authContext) {
    const stableAuthHeaders = {
      userId: 'x-copilot-user-id',
      userEmail: 'x-copilot-user-email',
      userName: 'x-copilot-user-name',
      organizationId: 'x-copilot-organization-id',
      organizationName: 'x-copilot-organization-name',
      organizationSlug: 'x-copilot-organization-slug',
      memberRole: 'x-copilot-member-role',
      teamId: 'x-copilot-team-id',
      teamName: 'x-copilot-team-name',
    };

    Object.entries(stableAuthHeaders).forEach(([contextKey, headerName]) => {
      if (authContext[contextKey]) {
        headers[headerName] = authContext[contextKey];
      }
    });
  }
  
  const agent = new HttpAgent({ url, headers });
  agentCache.set(cacheKey, agent);
  
  return { agent, cached: false, cacheKey };
}

/**
 * Get agent cache statistics
 */
function getAgentCacheStats() {
  return {
    size: agentCache.size,
    maxSize: AGENT_CACHE_MAX_SIZE,
    keys: Array.from(agentCache.keys()),
  };
}

// ============================================================================
// Per-Request Header Builder
// ============================================================================

/**
 * Build per-request headers (requestId, threadId, sessionId)
 * These vary per request and can't be cached with the agent.
 */
function buildPerRequestHeaders(context) {
  const headers = {
    'x-request-id': context.requestId,
  };

  if (context.threadId) {
    headers['x-copilot-thread-id'] = context.threadId;
  }
  
  // Include ALL auth context headers to override cached agent headers
  // This ensures fresh auth context even when agent is reused from cache
  if (context.authContext) {
    const authHeaderMapping = {
      userId: 'x-copilot-user-id',
      userEmail: 'x-copilot-user-email',
      userName: 'x-copilot-user-name',
      organizationId: 'x-copilot-organization-id',
      organizationName: 'x-copilot-organization-name',
      organizationSlug: 'x-copilot-organization-slug',
      memberRole: 'x-copilot-member-role',
      teamId: 'x-copilot-team-id',
      teamName: 'x-copilot-team-name',
      sessionId: 'x-copilot-session-id',
    };
    
    Object.entries(authHeaderMapping).forEach(([contextKey, headerName]) => {
      if (context.authContext[contextKey]) {
        headers[headerName] = context.authContext[contextKey];
      }
    });
  }

  return headers;
}

// ============================================================================
// CopilotKit Runtime Setup
// ============================================================================

/**
 * Create the shared CopilotKit runtime with PostgresAgentRunner
 * 
 * Uses PostgresAgentRunner for persistent storage, horizontal scalability,
 * and crash recovery. Messages are stored in a separate agent_messages table
 * for efficient querying.
 */
async function createCopilotKitRuntime() {
  const defaultAgentType = await getDefaultAgent();
  const defaultModelType = await getDefaultModel();
  
  // Create default HttpAgent pointing to Python backend
  const defaultAgent = new HttpAgent({
    url: `${PYDANTIC_SERVICE_URL}/agent/${defaultAgentType}/${defaultModelType}`,
    headers: {
      'x-copilot-agent-type': defaultAgentType,
      'x-copilot-model-type': defaultModelType,
      'Content-Type': 'application/json',
    },
  });

  // Create runner based on configuration
  let runner;
  
  if (USE_SQLITE_RUNNER) {
    // SQLite runner for lightweight persistence
    log('Using SqliteAgentRunner');
    runner = new SqliteAgentRunner({
      dbPath: SQLITE_DB_PATH,
    });
  } else {
    // PostgreSQL runner for production (default)
    log('Using PostgresAgentRunner');
    runner = new PostgresAgentRunner({
      pool: getPool(),
      ttl: AGENT_RUNNER_THREAD_TTL,
      cleanupInterval: AGENT_RUNNER_CLEANUP_INTERVAL,
      disableCleanup: AGENT_RUNNER_DISABLE_CLEANUP,
      persistEventsImmediately: true, // Persist events immediately for data durability
      maxHistoricRuns: parseInt(process.env.AGENT_RUNNER_MAX_HISTORIC_RUNS) || 1000,  // Max runs to load (safety limit, set to 0/null to load all - matches SQLite)
      debug: DEBUG,         // Verbose logging in development only
      transformErrors: AGENT_RUNNER_TRANSFORM_ERRORS, // false = filter out error runs, true = transform RUN_ERROR to RUN_FINISHED
    });

    // Recover any stalled runs from previous server instance (PostgreSQL only)
    log('Recovering stalled runs...');
    await runner.recoverStalledRuns();
    log('Recovery complete');
  }

  // Create runtime with selected runner
  // const runtime = new CopilotRuntime({
  //   agents: {
  //     [DEFAULT_AGENT_ID]: defaultAgent,
  //   },
  //   runner: new InMemoryAgentRunner(),  // Old: in-memory only
  // });
  
  const runtime = new CopilotRuntime({
    agents: {
      [DEFAULT_AGENT_ID]: defaultAgent,
    },
    runner,  // PostgreSQL or SQLite backed with persistence
  });

  return { runtime, defaultAgent, defaultAgentType, defaultModelType, runner };
}

// ============================================================================
// Auth Context Resolution
// ============================================================================

/**
 * Resolve authentication context from request headers
 * Auto-selects organization and team if not set
 * 
 * Supports two modes:
 * 1. Session-based auth (from cookies) - for frontend requests
 * 2. Header-based auth (from x-copilot-* headers) - for internal agent requests
 */
async function resolveAuthContext(headers, requestId) {
  const authContext = {};
  const pool = getPool();

  try {
    // Check if auth context is already in headers (internal agent request)
    const hasAuthHeaders = 
      headers['x-copilot-user-id'] && 
      headers['x-copilot-organization-id'] && 
      headers['x-copilot-team-id'];
    
    if (hasAuthHeaders) {
      // Use existing auth headers (from cached agent)
      authContext.userId = headers['x-copilot-user-id'];
      authContext.userEmail = headers['x-copilot-user-email'];
      authContext.userName = headers['x-copilot-user-name'];
      authContext.organizationId = headers['x-copilot-organization-id'];
      authContext.organizationName = headers['x-copilot-organization-name'];
      authContext.organizationSlug = headers['x-copilot-organization-slug'];
      authContext.memberRole = headers['x-copilot-member-role'];
      authContext.teamId = headers['x-copilot-team-id'];
      authContext.teamName = headers['x-copilot-team-name'];
      authContext.sessionId = headers['x-copilot-session-id'];
      
      if (DEBUG) {
        log('[Auth] Using cached auth headers (internal request)', requestId);
      }
      
      return { authContext };
    }
    
    // Get user session from auth (frontend request with cookies)
    const session = await auth.api.getSession({ headers });
    
    if (!session?.user) {
      return { error: 'Authentication required', status: 401 };
    }

    // Extract basic user info
    authContext.userId = session.user.id;
    authContext.userEmail = session.user.email;
    authContext.userName = session.user.name || session.user.email;
    authContext.sessionId = session.session?.id || null;
    
    // Query session metadata with organization and team info
    let sessionMeta = null;
    if (session.session?.id) {
      try {
        const { rows } = await pool.query(
          `SELECT 
             s."activeOrganizationId",
             s."activeTeamId",
             o.name AS "organizationName",
             o.slug AS "organizationSlug",
             m.role AS "memberRole",
             t.name AS "teamName"
           FROM session s
           LEFT JOIN organization o ON o.id = s."activeOrganizationId"
           LEFT JOIN member m ON m."organizationId" = s."activeOrganizationId" AND m."userId" = $1
           LEFT JOIN team t ON t.id = s."activeTeamId"
           WHERE s.id = $2`,
          [session.user.id, session.session.id],
        );

        if (rows.length > 0) {
          sessionMeta = rows[0];
        }
      } catch (err) {
        if (DEBUG) {
          log(`[Auth] Error reading session metadata: ${err.message}`, requestId);
        }
      }
    }

    // Populate auth context from session metadata
    if (sessionMeta?.activeOrganizationId) {
      authContext.organizationId = sessionMeta.activeOrganizationId;
      authContext.organizationName = sessionMeta.organizationName;
      authContext.organizationSlug = sessionMeta.organizationSlug;
    }

    if (sessionMeta?.activeTeamId) {
      authContext.teamId = sessionMeta.activeTeamId;
      authContext.teamName = sessionMeta.teamName;
    }

    if (sessionMeta?.memberRole) {
      const roles = Array.isArray(sessionMeta.memberRole) 
        ? sessionMeta.memberRole 
        : [sessionMeta.memberRole];
      authContext.memberRole = roles.filter(Boolean).join(',');
    }
    
    // Auto-select organization if not set
    if (!authContext.organizationId) {
      try {
        const organizations = await auth.api.listOrganizations({ headers });
        
        if (organizations?.length > 0) {
          const firstOrg = organizations[0];
          authContext.organizationId = firstOrg.id;
          authContext.organizationName = firstOrg.name;
          authContext.organizationSlug = firstOrg.slug;
          
          if (DEBUG) {
            log(`[Auth] Auto-selected organization: ${firstOrg.name}`, requestId);
          }
          
          // Persist as active organization
          try {
            await pool.query(
              'UPDATE session SET "activeOrganizationId" = $1 WHERE id = $2',
              [firstOrg.id, session.session.id]
            );
          } catch (err) {
            if (DEBUG) {
              log(`[Auth] Could not set active organization: ${err.message}`, requestId);
            }
          }
        }
      } catch (err) {
        if (DEBUG) {
          log(`[Auth] Error listing organizations: ${err.message}`, requestId);
        }
      }
    }
    
    // Auto-select team if not set
    if (authContext.organizationId && !authContext.teamId) {
      try {
        const { rows: teamRows } = await pool.query(
          `SELECT t.id, t.name
           FROM team t
           INNER JOIN "teamMember" tm ON t.id = tm."teamId"
           WHERE t."organizationId" = $1 AND tm."userId" = $2
           ORDER BY t.name ASC
           LIMIT 1`,
          [authContext.organizationId, session.user.id],
        );

        if (teamRows.length > 0) {
          const firstTeam = teamRows[0];
          authContext.teamId = firstTeam.id;
          authContext.teamName = firstTeam.name;

          if (DEBUG) {
            log(`[Auth] Auto-selected team: ${firstTeam.name}`, requestId);
          }

          // Persist as active team
          try {
            await pool.query(
              'UPDATE session SET "activeTeamId" = $1 WHERE id = $2',
              [firstTeam.id, session.session.id],
            );
          } catch (err) {
            if (DEBUG) {
              log(`[Auth] Could not set active team: ${err.message}`, requestId);
            }
          }
        }
      } catch (err) {
        if (DEBUG) {
          log(`[Auth] Error querying teams: ${err.message}`, requestId);
        }
      }
    }

    // Validate required auth context
    if (!authContext.userId || !authContext.sessionId) {
      return { error: 'Authentication required', status: 401 };
    }

    if (!authContext.organizationId) {
      return { error: 'Active organization not set', status: 409 };
    }

    if (!authContext.teamId) {
      return { error: 'Active team not set', status: 409 };
    }

    return { authContext };
  } catch (err) {
    if (DEBUG) {
      log(`[Auth] Authentication error: ${err.message}`, requestId);
    }
    return { error: 'Authentication required', status: 401 };
  }
}

// ============================================================================
// Express Application Setup
// ============================================================================

const app = express();

// ============================================================================
// Async Server Initialization
// ============================================================================

(async () => {
  try {
    // ========================================================================
    // CopilotKit Runtime Initialization
    // ========================================================================

    const { runtime, defaultAgent, defaultAgentType, defaultModelType, runner } = 
      await createCopilotKitRuntime();

    log('CopilotKit Runtime initialized');
    log(`Default agent: ${defaultAgentType}, Default model: ${defaultModelType}`);
    log('Runner: PostgresAgentRunner (persistent storage enabled)');

    // ========================================================================
    // Hono App for CopilotKit Endpoint
    // ========================================================================

    const honoApp = new Hono();

    // CORS for Hono app - matches Express CORS configuration
    honoApp.use('*', cors({
      origin: (origin) => {
        // Allow requests with no origin (same-origin, Postman, curl)
        if (!origin) return '*';
        
        // Always allow Chrome extensions
        if (origin.startsWith('chrome-extension://')) return origin;
        
        // Allow localhost/127.0.0.1 in development
        if (origin.startsWith('http://localhost') || 
            origin.startsWith('https://localhost') ||
            origin.startsWith('http://127.0.0.1') ||
            origin.startsWith('https://127.0.0.1')) {
          return origin;
        }
        
        // In production, return null to reject (or check ALLOWED_ORIGINS)
        return null;
      },
      credentials: true,
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'Cookie',
        'x-request-id',
        'x-copilot-agent-type',
        'x-copilot-model-type',
        'x-copilot-thread-id',
        'x-copilot-session-id',
        'x-copilot-user-id',
        'x-copilot-user-email',
        'x-copilot-organization-id',
        'x-copilot-team-id',
      ],
      exposeHeaders: ['set-cookie', 'x-request-id'],
      maxAge: 86400, // Cache preflight for 24 hours
    }));

    // Create CopilotKit endpoint
    const copilotEndpoint = createCopilotEndpoint({
      runtime,
      basePath: '/api/copilotkit',
    });

    // Mount CopilotKit endpoint with dynamic routing
    honoApp.all('/api/copilotkit/*', async (c) => {
      const requestId = `rt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      
      // Convert Hono headers to plain object for auth resolution
      const headersObj = {};
      c.req.raw.headers.forEach((value, key) => {
        headersObj[key] = value;
      });

      // Extract context from headers
      const agentType = c.req.header('x-copilot-agent-type') || defaultAgentType;
      const modelType = c.req.header('x-copilot-model-type') || defaultModelType;
      const threadId = c.req.header('x-copilot-thread-id');

      // Resolve auth context
      const authResult = await resolveAuthContext(headersObj, requestId);
      if (authResult.error) {
        return c.json({ error: authResult.error }, authResult.status);
      }

      const context = {
        agentType,
        modelType,
        threadId,
        requestId,
        authContext: authResult.authContext,
      };

      // Log request with tracking for suggestion debugging
      log('=== CopilotKit Request ===', requestId);
      log(`🔍 [RUNTIME] Agent: ${agentType} | Model: ${modelType} | Method: ${c.req.method} | Path: ${c.req.path}`, requestId);
      log(`🔍 [RUNTIME] Session: ${context.authContext.sessionId} | Thread: ${threadId || 'none'}`, requestId);
      if (DEBUG) {
        log(`Auth: org=${context.authContext.organizationId} team=${context.authContext.teamId}`, requestId);
      }
      log('=============================', requestId);

      // Get or create cached agent (no mutex needed - uses per-request agent IDs)
      const { agent: cachedAgent, cached, cacheKey } = getCachedAgent(context);
      
      // Use a unique agent ID for this request to avoid conflicts
      const requestAgentId = `agent_${requestId}`;
      
        try {
        // Register the agent for this request
        runtime.agents[requestAgentId] = cachedAgent;
        
        if (DEBUG) {
          log(`Agent ${cached ? 'reused' : 'created'}: ${cacheKey} -> ${requestAgentId}`, requestId);
        }

        // Rewrite the request URL to use our per-request agent ID
        const originalUrl = new URL(c.req.url);
        const newPath = originalUrl.pathname.replace(
          /\/agent\/[^/]+\//,
          `/agent/${requestAgentId}/`
        );
        originalUrl.pathname = newPath;

        // Create modified request with per-request headers
        const perRequestHeaders = buildPerRequestHeaders(context);
        const modifiedHeaders = new Headers(c.req.raw.headers);
        Object.entries(perRequestHeaders).forEach(([key, value]) => {
          modifiedHeaders.set(key, value);
        });

        let bodyForRequest = c.req.raw.body;

        // CRITICAL: Filter orphaned tool returns from the request body BEFORE forwarding to Python backend
        // This prevents the "Tool call with ID ... not found in the history" error
        if (c.req.raw.method === 'POST' && originalUrl.pathname.includes('/run')) {
          try {
            const rawBody = await c.req.text();
            const bodyJson = JSON.parse(rawBody);
            
            // Filter messages if they exist
            if (bodyJson.messages && Array.isArray(bodyJson.messages)) {
              const originalLength = bodyJson.messages.length;
              
              // Build set of valid tool call IDs
              const validToolCallIds = new Set();
              for (const msg of bodyJson.messages) {
                if (msg.role === 'assistant' && msg.toolCalls) {
                  for (const tc of msg.toolCalls) {
                    if (tc.id) {
                      validToolCallIds.add(tc.id);
                    }
                  }
                }
              }
              
              // Filter out orphaned tool returns
              bodyJson.messages = bodyJson.messages.filter(msg => {
                if (msg.role === 'tool' && msg.toolCallId) {
                  if (!validToolCallIds.has(msg.toolCallId)) {
                    if (DEBUG) {
                      console.log(`[server.js] Filtering orphaned tool return ${msg.id} with toolCallId ${msg.toolCallId}`);
                    }
                    return false;
                  }
                }
                return true;
              });
              
              if (bodyJson.messages.length !== originalLength) {
                if (DEBUG) {
                  console.log(`[server.js] Filtered ${originalLength - bodyJson.messages.length} orphaned tool returns from request body`);
                }
              }
            }
            
            // Re-serialize the filtered body
            bodyForRequest = JSON.stringify(bodyJson);
          } catch (err) {
            console.error(`[server.js] ⚠️  Failed to filter request body: ${err.message}`);
            // Fall back to original body if filtering fails
            bodyForRequest = await c.req.raw.text();
          }
        }

        const modifiedRequest = new Request(originalUrl.toString(), {
          method: c.req.raw.method,
          headers: modifiedHeaders,
          body: bodyForRequest,
          duplex: 'half',
        });

        // Forward to CopilotKit handler
        return await copilotEndpoint.fetch(modifiedRequest);
        } finally {
        // Clean up per-request agent registration
        delete runtime.agents[requestAgentId];
        }
    });

    // ========================================================================
    // Express Middleware Configuration
    // ========================================================================

    // 1. Proxy Configuration
    if (TRUST_PROXY) {
      app.set('trust proxy', 1);
    }

    // 2. CORS Middleware
    app.use(createCorsMiddleware());

    // 3. Better Auth Middleware
    app.use('/api/auth/organization', teamMembersBypassMiddleware);

    // 4. Authentication Routes (BEFORE body parsing!)
    app.use('/api/auth', authRouter);

    // 5. Invitations Routes
    app.use('/api/invitations', express.json({ limit: `${BODY_LIMIT_MB}mb` }), invitationsRouter);

    // 6. Request ID Middleware
    app.use(requestIdMiddleware);

    // ========================================================================
    // CopilotKit Endpoint (Bridge Express to Hono)
    // ========================================================================

    app.all('/api/copilotkit/*', async (req, res) => {
      const requestId = res.locals.reqId || `bridge_${Date.now()}`;
      
      try {
        // Convert Express request to Fetch Request for Hono
        const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const headers = new Headers();
        Object.entries(req.headers).forEach(([key, value]) => {
          if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
        });

        // Get body for POST/PUT/PATCH requests
        let body = null;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
          body = await new Promise((resolve, reject) => {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks)));
            req.on('error', reject);
          });
        }

        const fetchRequest = new Request(url, {
          method: req.method,
          headers,
          body: body?.length > 0 ? body : null,
        });

        // Forward to Hono app
        const response = await honoApp.fetch(fetchRequest);

        // Convert Hono Response to Express response
        res.status(response.status);
        response.headers.forEach((value, key) => {
          // Skip content-encoding as Express handles this
          if (key.toLowerCase() !== 'content-encoding') {
          res.setHeader(key, value);
          }
        });

        // Handle streaming response with proper error handling
        if (response.body) {
          const reader = response.body.getReader();
          
          // Handle client disconnect
          req.on('close', () => {
            reader.cancel().catch(() => {});
          });
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              // Check if client is still connected before writing
              if (!res.writableEnded) {
                res.write(value);
              } else {
                reader.cancel().catch(() => {});
                break;
              }
            }
          } catch (streamError) {
            if (DEBUG) {
              log(`Stream error: ${streamError.message}`, requestId);
            }
          } finally {
            if (!res.writableEnded) {
              res.end();
            }
          }
        } else {
          const text = await response.text();
          res.send(text);
        }
      } catch (error) {
        log(`CopilotKit Error: ${error.message}`, requestId);
        if (DEBUG && error.stack) {
          log(`Stack: ${error.stack}`, requestId);
        }
        
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Internal server error',
            requestId 
          });
        }
      }
    });

    // ========================================================================
    // Health Check & Monitoring
    // ========================================================================

    app.get('/health', healthCheckHandler);

    // ========================================================================
    // Body Parsing Middleware (AFTER CopilotKit)
    // ========================================================================

    app.use(express.json({ limit: `${BODY_LIMIT_MB}mb` }));
    app.use(express.urlencoded({ extended: true, limit: `${BODY_LIMIT_MB}mb` }));

    // ========================================================================
    // Message Deletion Endpoints (AFTER body parsing middleware)
    // ========================================================================

    /**
     * DELETE /api/messages/:threadId/:messageId
     * Delete a single message from a thread
     */
    app.delete('/api/messages/:threadId/:messageId', async (req, res) => {
      try {
        const { threadId, messageId } = req.params;
        
        if (!threadId || !messageId) {
          return res.status(400).json({ error: 'Thread ID and Message ID are required' });
        }
        
        // Only PostgresAgentRunner supports deletion
        if (USE_SQLITE_RUNNER || !runner || typeof runner.deleteMessage !== 'function') {
          return res.status(501).json({ error: 'Message deletion not supported with current runner' });
        }
        
        await runner.deleteMessage(threadId, messageId);
        
        res.json({ success: true, messageId });
      } catch (error) {
        log(`Error deleting message: ${error.message}`, res.locals.reqId);
        res.status(500).json({ error: 'Failed to delete message', message: error.message });
      }
    });

    /**
     * DELETE /api/messages/:threadId
     * Delete all messages in a thread (reset thread)
     */
    app.delete('/api/messages/:threadId', async (req, res) => {
      try {
        const { threadId } = req.params;
        
        if (!threadId) {
          return res.status(400).json({ error: 'Thread ID is required' });
        }
        
        // Only PostgresAgentRunner supports deletion
        if (USE_SQLITE_RUNNER || !runner || typeof runner.deleteAllMessages !== 'function') {
          return res.status(501).json({ error: 'Message deletion not supported with current runner' });
        }
        
        await runner.deleteAllMessages(threadId);
        
        res.json({ success: true, threadId });
      } catch (error) {
        log(`Error deleting all messages: ${error.message}`, res.locals.reqId);
        res.status(500).json({ error: 'Failed to delete messages', message: error.message });
      }
    });

    /**
     * POST /api/messages/:threadId/bulk-delete
     * Delete multiple messages from a thread
     */
    app.post('/api/messages/:threadId/bulk-delete', async (req, res) => {
      try {
        const { threadId } = req.params;
        const { messageIds } = req.body;
        
        if (!threadId) {
          return res.status(400).json({ error: 'Thread ID is required' });
        }
        
        if (!Array.isArray(messageIds) || messageIds.length === 0) {
          return res.status(400).json({ error: 'messageIds must be a non-empty array' });
        }
        
        // Only PostgresAgentRunner supports deletion
        if (USE_SQLITE_RUNNER || !runner || typeof runner.deleteMessages !== 'function') {
          return res.status(501).json({ error: 'Message deletion not supported with current runner' });
        }
        
        await runner.deleteMessages(threadId, messageIds);
        
        res.json({ success: true, deletedCount: messageIds.length });
      } catch (error) {
        log(`Error bulk deleting messages: ${error.message}`, res.locals.reqId);
        res.status(500).json({ error: 'Failed to delete messages', message: error.message });
      }
    });

    /**
     * POST /api/threads
     * Create or update a thread with user-chosen title (when user creates or renames a session)
     * Body: { threadId: string, title: string }
     */
    app.post('/api/threads', async (req, res) => {
      try {
        const session = await ensureAuthenticated(req, res);
        if (!session) return;

        const { threadId, title } = req.body || {};
        if (!threadId || typeof threadId !== 'string') {
          return res.status(400).json({ error: 'threadId is required' });
        }

        const userId = session.user.id;
        const organizationId = session.session?.activeOrganizationId || null;
        const teamId = session.session?.activeTeamId || null;

        if (USE_SQLITE_RUNNER || !runner || typeof runner.createOrUpdateThread !== 'function') {
          return res.status(501).json({ error: 'Thread create/update not supported with current runner' });
        }

        await runner.createOrUpdateThread({
          threadId: threadId.trim(),
          title: typeof title === 'string' ? title : null,
          userId,
          organizationId,
          teamId,
        });

        res.json({ success: true, threadId: threadId.trim() });
      } catch (error) {
        log(`Error creating/updating thread: ${error.message}`, res.locals.reqId);
        res.status(500).json({ error: 'Failed to create/update thread', message: error.message });
      }
    });

    /**
     * GET /api/threads
     * List threads for the authenticated user (for session sync after extension reinstall)
     */
    app.get('/api/threads', async (req, res) => {
      try {
        const session = await ensureAuthenticated(req, res);
        if (!session) return;

        const userId = session.user.id;
        const organizationId = session.session?.activeOrganizationId || null;
        const teamId = session.session?.activeTeamId || null;

        if (USE_SQLITE_RUNNER || !runner || typeof runner.listThreads !== 'function') {
          return res.json({ threads: [] });
        }

        const threads = await runner.listThreads({
          userId,
          organizationId,
          teamId,
          limit: 500,
        });

        res.json({ threads });
      } catch (error) {
        log(`Error listing threads: ${error.message}`, res.locals.reqId);
        res.status(500).json({ error: 'Failed to list threads', message: error.message });
      }
    });

    /**
     * DELETE /api/threads/:threadId
     * Delete a thread and all associated data (hard delete with cascade)
     * This will cascade delete all runs, messages, and deleted message records
     */
    app.delete('/api/threads/:threadId', async (req, res) => {
      try {
        const { threadId } = req.params;
        
        if (!threadId) {
          return res.status(400).json({ error: 'Thread ID is required' });
        }
        
        // Only PostgresAgentRunner supports thread deletion
        if (USE_SQLITE_RUNNER || !runner || typeof runner.deleteThread !== 'function') {
          return res.status(501).json({ error: 'Thread deletion not supported with current runner' });
        }
        
        const deleted = await runner.deleteThread(threadId);
        
        if (!deleted) {
          return res.status(404).json({ error: 'Thread not found' });
        }
        
        res.json({ success: true, threadId });
      } catch (error) {
        log(`Error deleting thread: ${error.message}`, res.locals.reqId);
        res.status(500).json({ error: 'Failed to delete thread', message: error.message });
      }
    });

    /**
     * GET /api/threads/:threadId/history
     * Paginated history for "load more" - returns older runs as events
     *
     * Query params:
     * - before, beforeMessageId: load runs OLDER than this
     * - afterRunId: load runs NEWER than this (fills gap when response was capped)
     * - limit: max root runs to load (default 5)
     *
     * Returns: { events, hasMore, oldestRunId?, afterRunId? }
     */
    app.get('/api/threads/:threadId/history', async (req, res) => {
      try {
        const session = await ensureAuthenticated(req, res);
        if (!session) return;

        const { threadId } = req.params;
        const { before, beforeMessageId, afterRunId, limit, excludeRoot } = req.query;

        if (!threadId) {
          return res.status(400).json({ error: 'Thread ID is required' });
        }

        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 5);

        if (USE_SQLITE_RUNNER || !runner) {
          return res.status(501).json({ error: 'History pagination not supported with current runner' });
        }

        if (typeof afterRunId === 'string' && afterRunId) {
          if (typeof runner.getHistoryEventsAfter !== 'function') {
            return res.status(501).json({ error: 'History "after" pagination not supported' });
          }
          const beforeMsgId = typeof beforeMessageId === 'string' ? beforeMessageId : null;
          const result = await runner.getHistoryEventsAfter(threadId, afterRunId, 20, beforeMsgId);
          return res.json({
            events: result.events,
            hasMore: result.hasMore,
            afterRunId: result.afterRunId || undefined,
            runs: result.runs,
          });
        }

        const beforeRunId = typeof before === 'string' ? before : null;
        const beforeMsgId = typeof beforeMessageId === 'string' ? beforeMessageId : null;
        if (!beforeRunId && !beforeMsgId) {
          return res.status(400).json({ error: 'Query param "before"/"beforeMessageId" or "afterRunId" is required' });
        }

        const excludeRootBool = excludeRoot === 'true' || excludeRoot === '1';
        const result = await runner.getHistoryEventsBefore(
          threadId, beforeRunId || '', beforeMsgId, limitNum, excludeRootBool
        );

        res.json({
          events: result.events,
          hasMore: result.hasMore,
          oldestRunId: result.oldestRunId,
          afterRunId: result.afterRunId || undefined,
          runs: result.runs,
        });
      } catch (error) {
        log(`Error fetching history: ${error.message}`, res.locals.reqId);
        res.status(500).json({ error: 'Failed to fetch history', message: error.message });
      }
    });

    /**
     * GET /api/runs/:runId/tool-result/:toolCallId
     * Get the full untruncated content of a tool call result or args
     * Used by the frontend to lazy-load truncated tool results
     * 
     * Query params:
     * - eventType: 'TOOL_CALL_RESULT' or 'TOOL_CALL_ARGS' (required)
     * 
     * Returns: { content: string | object, found: boolean }
     */
    app.get('/api/runs/:runId/tool-result/:toolCallId', async (req, res) => {
      try {
        const { runId, toolCallId } = req.params;
        const { eventType } = req.query;
        
        if (!runId || !toolCallId) {
          return res.status(400).json({ error: 'Run ID and Tool Call ID are required' });
        }
        
        if (!eventType || (eventType !== 'TOOL_CALL_RESULT' && eventType !== 'TOOL_CALL_ARGS')) {
          return res.status(400).json({ error: 'Event type must be TOOL_CALL_RESULT or TOOL_CALL_ARGS' });
        }
        
        // Query the database for the run's events
        const pool = getPool();
        const result = await pool.query(
          `SELECT events FROM agent_runs WHERE run_id = $1`,
          [runId]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Run not found', found: false });
        }
        
        const events = result.rows[0].events || [];
        
        // Find the event with the matching toolCallId and eventType
        const targetEvent = events.find(event => 
          event.toolCallId === toolCallId && event.type === eventType
        );
        
        if (!targetEvent) {
          return res.status(404).json({ 
            error: `${eventType} event with toolCallId ${toolCallId} not found in run ${runId}`,
            found: false 
          });
        }
        
        // Extract content based on event type
        let content = null;
        if (eventType === 'TOOL_CALL_RESULT') {
          // For TOOL_CALL_RESULT, check content field first, then result field
          content = targetEvent.content !== undefined ? targetEvent.content : targetEvent.result;
        } else {
          // For TOOL_CALL_ARGS, check args field first, then delta field
          content = targetEvent.args !== undefined ? targetEvent.args : targetEvent.delta;
        }
        
        if (content === null || content === undefined) {
          return res.status(404).json({ 
            error: `No content found in ${eventType} event`,
            found: false 
          });
        }
        
        // Return the full untruncated content
        res.json({ 
          content,
          found: true,
          eventType,
          toolCallId,
          runId
        });
        
      } catch (error) {
        log(`Error fetching tool result: ${error.message}`, res.locals.reqId);
        res.status(500).json({ error: 'Failed to fetch tool result', message: error.message });
      }
    });

    // ========================================================================
    // Admin API Routes
    // ========================================================================

    app.use('/api/admin/providers', providersRouter);
    app.use('/api/admin/models', modelsRouter);
    app.use('/api/admin/agents', agentsRouter);
    app.use('/api/admin/tools', toolsRouter);
    app.use('/api/admin/skills', skillsRouter);
    app.use('/api/admin/usage', usageRouter);

    // ========================================================================
    // Workspace Endpoints (Personal Resources)
    // ========================================================================
    
    app.use('/api/workspace', express.json({ limit: `${BODY_LIMIT_MB}mb` }), workspaceRouter);
    
    // ========================================================================
    // OAuth Endpoints (Personal Connections)
    // ========================================================================
    
    app.use('/api/oauth', oauthRouter);

    // ========================================================================
    // Public Configuration Endpoints
    // ========================================================================

    app.get('/api/config', getCompleteConfigHandler);
    app.get('/api/config/agents', getAgentsHandler);
    app.get('/api/config/models', getModelsHandler);
    app.get('/api/config/defaults', getDefaultsHandler);
    app.get('/api/config/teams', getTeamsHandler);

    // ========================================================================
    // Error Handlers
    // ========================================================================

    app.use(notFoundMiddleware);
    app.use(errorHandlerMiddleware);

    // ========================================================================
    // HTTP Server Startup
    // ========================================================================

    const server = app.listen(PORT, () => {
      log('═══════════════════════════════════════════════════════════════════');
      log('CopilotKit Runtime Server - Ready');
      log('═══════════════════════════════════════════════════════════════════');
      log('');
      log(`Server:        http://0.0.0.0:${PORT}`);
      log(`Health Check:  http://0.0.0.0:${PORT}/health`);
      log('');
      log('CopilotKit (AG-UI Protocol):');
      log(`   - POST   ${PORT}/api/copilotkit/*`);
      log('');
      log('Authentication & Organizations:');
      log(`   - POST   ${PORT}/api/auth/sign-in/email`);
      log(`   - POST   ${PORT}/api/auth/sign-up/email`);
      log(`   - GET    ${PORT}/api/auth/session`);
      log(`   - POST   ${PORT}/api/invitations/create`);
      log('');
      log('Admin APIs (require auth + admin/owner role):');
      log(`   - /api/admin/providers`);
      log(`   - /api/admin/models`);
      log(`   - /api/admin/agents`);
      log(`   - /api/admin/tools`);
      log(`   - /api/admin/base-instructions`);
      log(`   - /api/admin/usage`);
      log('');
      log(`Python Backend: ${PYDANTIC_SERVICE_URL}`);
      log('═══════════════════════════════════════════════════════════════════');
    });

    // Server timeout configuration
    server.setTimeout(REQUEST_TIMEOUT_MS);
    server.headersTimeout = HEADERS_TIMEOUT_MS;

    // Graceful shutdown
    const shutdown = async () => {
      log('');
      log('Shutting down gracefully...');
      
      // Shutdown PostgresAgentRunner
      if (runner) {
        log('Shutting down PostgresAgentRunner...');
        try {
          await runner.shutdown();
          log('PostgresAgentRunner shutdown complete');
        } catch (error) {
          log(`Error shutting down runner: ${error.message}`);
        }
      }
      
      server.close(() => {
        log('Server closed. Goodbye!');
        process.exit(0);
      });
      
      // Force exit after 10 seconds if graceful shutdown hangs
      setTimeout(() => {
        log('Forcefully shutting down...');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Handle unhandled errors gracefully to prevent crashes
    process.on('uncaughtException', (error) => {
      console.error('═══════════════════════════════════════════════════════════════════');
      console.error('Uncaught Exception - Server will continue running');
      console.error('═══════════════════════════════════════════════════════════════════');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('═══════════════════════════════════════════════════════════════════');
      // Don't exit - let server continue
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('═══════════════════════════════════════════════════════════════════');
      console.error('Unhandled Promise Rejection - Server will continue running');
      console.error('═══════════════════════════════════════════════════════════════════');
      console.error('Reason:', reason);
      console.error('Promise:', promise);
      console.error('═══════════════════════════════════════════════════════════════════');
      // Don't exit - let server continue
    });

  } catch (error) {
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
