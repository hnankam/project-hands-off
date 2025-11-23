/**
 * Dynamic Routing Middleware
 * 
 * Handles dynamic agent and model selection for CopilotKit requests.
 * Extracts authentication context, resolves organization/team membership,
 * and configures the HttpAgent with the appropriate context.
 */

import { getDefaultAgent, getDefaultModel } from '../config/models.js';
import { DEBUG } from '../config/index.js';
import { log } from '../utils/logger.js';
import { createHttpAgent, getDynamicAgentUrl } from '../agents/dynamic.js';
import { auth } from '../auth/index.js';
import { getPool } from '../config/database.js';

/**
 * Promise chain to serialize dynamic agent registration
 * Ensures only one agent update happens at a time to prevent race conditions
 */
let agentUpdateChain = Promise.resolve();

/**
 * Run a function exclusively (one at a time) using a promise chain
 * @param {Function} fn - Async function to run exclusively
 * @returns {Promise} Result of the function
 */
const runExclusive = (fn) => {
  const run = agentUpdateChain.then(() => fn());
  // Ensure the chain never rejects to avoid breaking future requests
  agentUpdateChain = run.catch(() => {});
  return run;
};

/**
 * Create dynamic routing middleware factory
 * 
 * Creates middleware that:
 * 1. Extracts agent and model from headers or query params
 * 2. Resolves authentication context (user, org, team)
 * 3. Auto-selects organization and team if not set
 * 4. Updates the runtime's dynamic_agent with proper context
 * 5. Forwards auth context headers to the Python backend
 * 
 * @param {Object} runtime - CopilotKit runtime instance
 * @returns {Function} Express middleware function
 */
export function createDynamicRoutingMiddleware(runtime) {
  return async (req, res, next) => {
    // Extract agent, model, and thread ID from headers or query params
    const agent = req.headers['x-copilot-agent-type'] || req.query.agent || await getDefaultAgent();
    const model = req.headers['x-copilot-model-type'] || req.query.model || await getDefaultModel();
    const threadId = req.headers['x-copilot-thread-id'] || null;
    const reqId = res.locals.reqId;
    
    // Initialize auth context
    let authContext = {};
    const pool = getPool();

    try {
      // Get user session from auth
      const session = await auth.api.getSession({ headers: req.headers });
      
      if (session?.user) {
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
          } catch (sessionReadError) {
            if (DEBUG) {
              log(`[Auth] Error reading session metadata: ${sessionReadError.message}`, reqId);
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
            const organizations = await auth.api.listOrganizations({ headers: req.headers });
            
            if (organizations?.length > 0) {
              const firstOrg = organizations[0];
              authContext.organizationId = firstOrg.id;
              authContext.organizationName = firstOrg.name;
              authContext.organizationSlug = firstOrg.slug;
              
              if (DEBUG) {
                log(`[Auth] Auto-selected organization: ${firstOrg.name}`, reqId);
              }
              
              // Persist as active organization
              try {
                await pool.query(
                  'UPDATE session SET "activeOrganizationId" = $1 WHERE id = $2',
                  [firstOrg.id, session.session.id]
                );
              } catch (setActiveError) {
                if (DEBUG) {
                  log(`[Auth] Could not set active organization: ${setActiveError.message}`, reqId);
                }
              }
            } else if (DEBUG) {
              log('[Auth] User is not a member of any organization', reqId);
            }
          } catch (listOrgsError) {
            if (DEBUG) {
              log(`[Auth] Error listing organizations: ${listOrgsError.message}`, reqId);
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
                log(`[Auth] Auto-selected team: ${firstTeam.name}`, reqId);
              }

              // Persist as active team
              try {
                await pool.query(
                  'UPDATE session SET "activeTeamId" = $1 WHERE id = $2',
                  [firstTeam.id, session.session.id],
                );
              } catch (setActiveTeamError) {
                if (DEBUG) {
                  log(`[Auth] Could not set active team: ${setActiveTeamError.message}`, reqId);
                }
              }
            } else if (DEBUG) {
              log('[Auth] User is not a member of any team in this organization', reqId);
            }
          } catch (teamError) {
            if (DEBUG) {
              log(`[Auth] Error querying teams: ${teamError.message}`, reqId);
            }
          }
        } else if (authContext.teamId && !authContext.teamName) {
          // Fetch team name if we have ID but not name
          try {
            const { rows: teamNameRows } = await pool.query(
              'SELECT name FROM team WHERE id = $1',
              [authContext.teamId],
            );
            if (teamNameRows.length > 0) {
              authContext.teamName = teamNameRows[0].name;
            }
          } catch (teamNameError) {
            if (DEBUG) {
              log(`[Auth] Error fetching team name: ${teamNameError.message}`, reqId);
            }
          }
        }
      }
    } catch (authError) {
      if (DEBUG) {
        log(`[Auth] Authentication error: ${authError.message}`, reqId);
      }
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Validate required auth context
    if (!authContext.userId || !authContext.sessionId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!authContext.organizationId) {
      return res.status(409).json({ error: 'Active organization not set' });
    }

    if (!authContext.teamId) {
      return res.status(409).json({ error: 'Active team not set' });
    }

    // Store auth context in request for downstream use
    req.authContext = authContext;
    
    // Log request details
    log('=== CopilotKit Request ===', reqId);
    log(`Agent: ${agent} Model: ${model} Method: ${req.method} Path: ${req.path} URL: ${req.url}`, reqId);
    
    if (DEBUG) {
      log(`Headers: ${JSON.stringify({
        'x-copilot-agent-type': req.headers['x-copilot-agent-type'],
        'x-copilot-model-type': req.headers['x-copilot-model-type']
      }, null, 2)}`, reqId);
    }
    
    log('=========================', reqId);
    
    // Update dynamic_agent with the correct model and agent
    const targetUrl = await getDynamicAgentUrl(agent, model);
    log(`   Dynamic routing: Updating dynamic_agent to ${model} with agent=${agent}`, reqId);
    log(`   Target URL: ${targetUrl}`, reqId);
    log(`   Headers to forward: x-copilot-agent-type=${agent}, x-copilot-model-type=${model}`, reqId);
    if (threadId && DEBUG) {
      log(`   Forwarding thread identifier: ${threadId}`, reqId);
    }
    
    // Update the runtime's dynamic_agent (exclusively to prevent race conditions)
    await runExclusive(async () => {
      const previousAgent = runtime.agents['dynamic_agent'];
      
      // Create new HttpAgent with auth context
      runtime.agents['dynamic_agent'] = await createHttpAgent(agent, model, authContext, {
        'x-copilot-thread-id': threadId,
        'x-request-id': reqId,
      });

      // Restore previous agent after response completes
      await new Promise((resolve) => {
        const cleanup = () => {
          runtime.agents['dynamic_agent'] = previousAgent;
          resolve();
        };

        res.once('finish', cleanup);
        res.once('close', cleanup);
        res.once('error', cleanup);

        log('HttpAgent updated successfully', reqId);
        next();
      });
    });
  };
}

