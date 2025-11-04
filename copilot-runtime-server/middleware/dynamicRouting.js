/**
 * Dynamic routing middleware for agent selection
 */

import { DEFAULT_AGENT, DEFAULT_MODEL } from '../config/models.js';
import { DEBUG } from '../config/index.js';
import { log } from '../utils/logger.js';
import { createHttpAgent, getDynamicAgentUrl } from '../agents/dynamic.js';
import { auth } from '../auth/index.js';
import { getPool } from '../config/database.js';

// Simple mutex to serialize dynamic agent registration.
let agentUpdateChain = Promise.resolve();

const runExclusive = (fn) => {
  const run = agentUpdateChain.then(() => fn());
  // Ensure the chain never rejects to avoid breaking future requests.
  agentUpdateChain = run.catch(() => {});
  return run;
};

/**
 * Middleware to log and route dynamic_agent requests based on headers
 */
export function createDynamicRoutingMiddleware(runtime) {
  return async (req, res, next) => {
    const agent = req.headers['x-copilot-agent-type'] || req.query.agent || DEFAULT_AGENT;
    const model = req.headers['x-copilot-model-type'] || req.query.model || DEFAULT_MODEL;
    const threadId = req.headers['x-copilot-thread-id'] || null;
    const reqId = res.locals.reqId;
    
    // Extract user, organization, and team information from auth session
    let authContext = {};
    const pool = getPool();

    try {
      const session = await auth.api.getSession({ headers: req.headers });
      
      if (DEBUG && session) {
        log('Full session object:', JSON.stringify(session, null, 2), reqId);
      }
      
      if (session && session.user) {
        authContext.userId = session.user.id;
        authContext.userEmail = session.user.email;
        authContext.userName = session.user.name || session.user.email;
        authContext.sessionId = session.session?.id || null;
        
        let sessionMeta = null;
        if (session.session?.id) {
          try {
            const { rows } = await pool.query(
              `SELECT 
                 s."activeOrganizationId" AS "activeOrganizationId",
                 s."activeTeamId" AS "activeTeamId",
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
              log('⚠️ Error reading session metadata:', sessionReadError.message, reqId);
            }
          }
        }

        if (sessionMeta?.activeOrganizationId) {
          authContext.organizationId = sessionMeta.activeOrganizationId;
          authContext.organizationName = sessionMeta.organizationName ?? authContext.organizationName;
          authContext.organizationSlug = sessionMeta.organizationSlug ?? authContext.organizationSlug;
        }

        if (sessionMeta?.activeTeamId) {
          authContext.teamId = sessionMeta.activeTeamId;
          authContext.teamName = sessionMeta.teamName ?? authContext.teamName;
        }

        if (sessionMeta?.memberRole) {
          const roles = Array.isArray(sessionMeta.memberRole) ? sessionMeta.memberRole : [sessionMeta.memberRole];
          authContext.memberRole = roles.filter(Boolean).join(',');
        }

        if (authContext.organizationId && DEBUG) {
          log('✓ Active organization ID:', authContext.organizationId, reqId);
        } else if (DEBUG) {
          log('⚠️ No active organization set in session for user:', session.user.email, reqId);
        }

        if (authContext.teamId && DEBUG) {
          log('✓ Active team ID:', authContext.teamId, reqId);
        } else if (DEBUG) {
          log('⚠️ No active team set in session for user:', session.user.email, reqId);
        }
        
        // If no active organization, try to list user's organizations and auto-set the first one
        if (!authContext.organizationId) {
          try {
            // List all organizations the user is a member of
            const organizations = await auth.api.listOrganizations({ headers: req.headers });
            
            if (DEBUG) {
              log('User organizations:', JSON.stringify(organizations, null, 2), reqId);
            }
            
            if (organizations && organizations.length > 0) {
              // User has organizations but hasn't set an active one
              const firstOrg = organizations[0];
              authContext.organizationId = firstOrg.id;
              authContext.organizationName = firstOrg.name;
              authContext.organizationSlug = firstOrg.slug;
              
              if (DEBUG) {
                log(`✓ Auto-selected first organization: ${firstOrg.name} (${firstOrg.id})`, reqId);
              }
              
              // Set it as active in the database directly
              try {
                await pool.query(
                  'UPDATE session SET "activeOrganizationId" = $1 WHERE id = $2',
                  [firstOrg.id, session.session.id]
                );
                if (DEBUG) {
                  log('✓ Set as active organization in session', reqId);
                }
              } catch (setActiveError) {
                if (DEBUG) {
                  log('⚠️ Could not set active organization:', setActiveError.message, reqId);
                }
              }
            } else {
              if (DEBUG) {
                log('ℹ️ User is not a member of any organization', reqId);
              }
            }
          } catch (listOrgsError) {
            if (DEBUG) {
              log('⚠️ Error listing organizations:', listOrgsError.message, reqId);
            }
          }
        }
        
        // Resolve team name or auto-select fallback if necessary
        if (authContext.organizationId && !authContext.teamId) {
          try {
            const { rows: teamRows } = await pool.query(`
              SELECT t.id, t.name
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
                log(`✓ Auto-selected team: ${firstTeam.name} (${firstTeam.id})`, reqId);
              }

              try {
                await pool.query(
                  'UPDATE session SET "activeTeamId" = $1 WHERE id = $2',
                  [firstTeam.id, session.session.id],
                );
              } catch (setActiveTeamError) {
                if (DEBUG) {
                  log('⚠️ Could not set active team:', setActiveTeamError.message, reqId);
                }
              }
            } else if (DEBUG) {
              log('ℹ️ User is not a member of any team in this organization', reqId);
            }
          } catch (teamError) {
            if (DEBUG) {
              log('⚠️ Error querying teams:', teamError.message, reqId);
            }
          }
        } else if (authContext.teamId && !authContext.teamName) {
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
              log('⚠️ Error fetching team name:', teamNameError.message, reqId);
            }
          }
        }
      }
    } catch (authError) {
      // Auth is optional for copilotkit requests - continue without auth context
      if (DEBUG) {
        log('No auth session for request:', authError.message, reqId);
      }
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!authContext.userId || !authContext.sessionId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!authContext.organizationId) {
      return res.status(409).json({ error: 'Active organization not set' });
    }

    if (!authContext.teamId) {
      return res.status(409).json({ error: 'Active team not set' });
    }

    // Store auth context in request for use by HttpAgent
    req.authContext = authContext;
    
    log('=== CopilotKit Request ===', reqId);
    log('Agent:', agent, 'Model:', model, 'Method:', req.method, 'Path:', req.path, 'URL:', req.url);
    if (authContext.userId) {
      log('User:', authContext.userEmail, 'Org:', authContext.organizationName || 'none', 'Team:', authContext.teamId || 'none', reqId);
      log('IDs - UserID:', authContext.userId, 'OrgID:', authContext.organizationId || 'none', 'TeamID:', authContext.teamId || 'none', reqId);
    }
    
    if (DEBUG) {
      log('Headers:', JSON.stringify({
        'x-copilot-agent-type': req.headers['x-copilot-agent-type'],
        'x-copilot-model-type': req.headers['x-copilot-model-type']
      }));
      if (authContext.userId) {
        log('Full Auth Context:', JSON.stringify(authContext, null, 2), reqId);
      }
    }
    
    // Log the body for POST requests (but limit size)
    if (DEBUG && req.method === 'POST' && req.body) {
      try {
        const bodyStr = JSON.stringify(req.body);
        log('Body preview:', bodyStr.substring(0, 200) + (bodyStr.length > 200 ? '...' : ''));
      } catch {}
    }
    
    log('=========================', reqId);
    
    // Always update dynamic_agent to use the correct model and agent from headers
    log(`🔄 Dynamic routing: Updating dynamic_agent to ${model} with agent=${agent}`, reqId);
    
    // Get the target URL (await since it's async now)
    const targetUrl = await getDynamicAgentUrl(agent, model);
    log(`   Target URL: ${targetUrl}`, reqId);
    log(`   Headers to forward: x-copilot-agent-type=${agent}, x-copilot-model-type=${model}`, reqId);
    if (threadId && DEBUG) {
      log(`   Forwarding thread identifier: ${threadId}`, reqId);
    }
    
    await runExclusive(async () => {
      const previousAgent = runtime.agents['dynamic_agent'];
      runtime.agents['dynamic_agent'] = await createHttpAgent(agent, model, authContext, {
        'x-copilot-thread-id': threadId,
      });

      await new Promise((resolve) => {
        const cleanup = () => {
          runtime.agents['dynamic_agent'] = previousAgent;
          resolve();
        };

        res.once('finish', cleanup);
        res.once('close', cleanup);
        res.once('error', cleanup);

        // Ensure forwardedParameters.model is present for Copilot mutations
        if (req.method === 'POST' && req.body && typeof req.body === 'object') {
          try {
            const query = typeof req.body.query === 'string' ? req.body.query : '';
            const isGenerateMutation = query.includes('generateCopilotResponse');
            if (isGenerateMutation) {
              const variables = req.body.variables || {};
              const data = variables.data || {};
              const forwardedParameters = data.forwardedParameters || {};
              if (!forwardedParameters.model) {
                forwardedParameters.model = model;
                data.forwardedParameters = forwardedParameters;
                variables.data = data;
                req.body.variables = variables;
                log('🧩 Injected forwardedParameters.model into GraphQL body:', forwardedParameters.model, reqId);
              }
            } else {
              log('ℹ️ Skipping forwardedParameters injection (non-generateCopilotResponse operation)', reqId);
            }
          } catch (e) {
            log('⚠️ Failed to inject forwardedParameters.model into request body', reqId);
          }
        }

        log('✅ HttpAgent updated successfully', reqId);
        next();
      });
    });
  };
}

