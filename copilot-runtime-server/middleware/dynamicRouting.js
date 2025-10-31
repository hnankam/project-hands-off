/**
 * Dynamic routing middleware for agent selection
 */

import { DEFAULT_AGENT, DEFAULT_MODEL } from '../config/models.js';
import { DEBUG } from '../config/index.js';
import { log } from '../utils/logger.js';
import { createHttpAgent, getDynamicAgentUrl } from '../agents/dynamic.js';
import { auth } from '../auth/index.js';
import { getPool } from '../config/database.js';

/**
 * Middleware to log and route dynamic_agent requests based on headers
 */
export function createDynamicRoutingMiddleware(runtime) {
  return async (req, res, next) => {
    const agent = req.headers['x-copilot-agent-type'] || req.query.agent || DEFAULT_AGENT;
    const model = req.headers['x-copilot-model-type'] || req.query.model || DEFAULT_MODEL;
    const reqId = res.locals.reqId;
    
    // Extract user, organization, and team information from auth session
    let authContext = {};
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      
      if (DEBUG && session) {
        log('Full session object:', JSON.stringify(session, null, 2), reqId);
      }
      
      if (session && session.user) {
        authContext.userId = session.user.id;
        authContext.userEmail = session.user.email;
        authContext.userName = session.user.name || session.user.email;
        
        // Get organization and team IDs from session object
        if (session.session?.activeOrganizationId) {
          authContext.organizationId = session.session.activeOrganizationId;
          
          if (DEBUG) {
            log('✓ Active organization ID from session:', session.session.activeOrganizationId, reqId);
          }
        } else {
          if (DEBUG) {
            log('⚠️ No active organization set in session for user:', session.user.email, reqId);
          }
        }
        
        if (session.session?.activeTeamId) {
          authContext.teamId = session.session.activeTeamId;
          
          if (DEBUG) {
            log('✓ Active team ID from session:', session.session.activeTeamId, reqId);
          }
        } else {
          if (DEBUG) {
            log('⚠️ No active team set in session for user:', session.user.email, reqId);
          }
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
                const pool = getPool();
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
        
        // Get organization name, slug, and member role from database if we have an organizationId
        if (authContext.organizationId) {
          try {
            const pool = getPool();
            
            // Fetch organization details if not already set
            if (!authContext.organizationName) {
              const orgResult = await pool.query(
                'SELECT name, slug FROM organization WHERE id = $1',
                [authContext.organizationId]
              );
              
              if (DEBUG) {
                log('Organization query result:', JSON.stringify(orgResult.rows, null, 2), reqId);
              }
              
              if (orgResult.rows.length > 0) {
                authContext.organizationName = orgResult.rows[0].name;
                authContext.organizationSlug = orgResult.rows[0].slug;
                
                if (DEBUG) {
                  log(`✓ Organization: ${authContext.organizationName} (${authContext.organizationSlug})`, reqId);
                }
              }
            }
            
            // Fetch member role
            const memberResult = await pool.query(
              'SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2',
              [authContext.organizationId, session.user.id]
            );
            
            if (DEBUG) {
              log('Member role query result:', JSON.stringify(memberResult.rows, null, 2), reqId);
            }
            
            if (memberResult.rows.length > 0) {
              const roles = memberResult.rows[0].role;
              authContext.memberRole = Array.isArray(roles) ? roles.join(',') : roles;
              
              if (DEBUG) {
                log(`✓ Member role: ${authContext.memberRole}`, reqId);
              }
            }
          } catch (roleError) {
            if (DEBUG) {
              log('⚠️ Error getting organization/member data:', roleError.message, reqId);
            }
          }
        }
        
        // Get team name and auto-select if needed
        if (authContext.organizationId) {
          try {
            const pool = getPool();
            
            if (authContext.teamId) {
              // Fetch team name if we already have a team ID
              const teamNameResult = await pool.query(
                'SELECT name FROM team WHERE id = $1',
                [authContext.teamId]
              );
              
              if (teamNameResult.rows.length > 0) {
                authContext.teamName = teamNameResult.rows[0].name;
                
                if (DEBUG) {
                  log(`✓ Team name: ${authContext.teamName}`, reqId);
                }
              }
            } else {
              // Auto-select first team if no team is active
              const teamResult = await pool.query(`
                SELECT t.id, t.name
                FROM team t
                INNER JOIN "teamMember" tm ON t.id = tm."teamId"
                WHERE t."organizationId" = $1 AND tm."userId" = $2
                LIMIT 1
              `, [authContext.organizationId, session.user.id]);
              
              if (DEBUG) {
                log('User teams query result:', JSON.stringify(teamResult.rows, null, 2), reqId);
              }
              
              if (teamResult.rows.length > 0) {
                const firstTeam = teamResult.rows[0];
                authContext.teamId = firstTeam.id;
                authContext.teamName = firstTeam.name;
                
                if (DEBUG) {
                  log(`✓ Auto-selected team: ${firstTeam.name} (${firstTeam.id})`, reqId);
                }
                
                // Set it as active in the session
                try {
                  await pool.query(
                    'UPDATE session SET "activeTeamId" = $1 WHERE id = $2',
                    [firstTeam.id, session.session.id]
                  );
                  if (DEBUG) {
                    log('✓ Set as active team in session', reqId);
                  }
                } catch (setActiveTeamError) {
                  if (DEBUG) {
                    log('⚠️ Could not set active team:', setActiveTeamError.message, reqId);
                  }
                }
              } else {
                if (DEBUG) {
                  log('ℹ️ User is not a member of any team in this organization', reqId);
                }
              }
            }
          } catch (teamError) {
            if (DEBUG) {
              log('⚠️ Error querying teams:', teamError.message, reqId);
            }
          }
        }
      }
    } catch (authError) {
      // Auth is optional for copilotkit requests - continue without auth context
      if (DEBUG) {
        log('No auth session for request:', authError.message, reqId);
      }
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
    
    // Recreate the HttpAgent with the new URL (agent + model in path) and headers including auth context
    runtime.agents['dynamic_agent'] = await createHttpAgent(agent, model, authContext);
    
    // Ensure GraphQL body includes forwardedParameters.model ONLY for generateCopilotResponse,
    // so we don't break other operations like LoadAgentStateInput
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
  };
}

