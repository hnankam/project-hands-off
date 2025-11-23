/**
 * Authentication Routes
 * 
 * Sets up Better Auth routes for authentication and organization management.
 * Includes custom endpoints for team management that extend Better Auth's functionality.
 * 
 * Better Auth Endpoints (handled by toNodeHandler):
 * - POST /api/auth/sign-up/email
 * - POST /api/auth/sign-in/email
 * - POST /api/auth/sign-out
 * - GET  /api/auth/session
 * - POST /api/auth/organization/create
 * - GET  /api/auth/organization/list
 * - POST /api/auth/organization/invite-member
 * - POST /api/auth/team/create
 * - GET  /api/auth/team/list
 * - And more...
 * 
 * Custom Endpoints:
 * - POST /api/auth/set-active-team - Set user's active team in session
 */

import { Router } from 'express';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../auth/index.js';
import { getPool } from '../config/database.js';

const router = Router();

/**
 * POST /api/auth/set-active-team
 * Set the active team in the user's session
 * 
 * This custom endpoint allows users to switch between teams in their organization.
 * The active team determines which resources and configurations are visible/accessible.
 * 
 * Body:
 * - teamId: Team ID (required, can be null to clear)
 * 
 * Returns:
 * - { success: true, activeTeamId: string|null }
 * 
 * Errors:
 * - 400: teamId parameter missing
 * - 401: User not authenticated
 * - 500: Database error
 */
router.post('/set-active-team', express.json(), async (req, res) => {
  try {
    const { teamId } = req.body;
    
    // teamId is required (can be null to clear, but must be present)
    if (teamId === undefined) {
      return res.status(400).json({ 
        error: 'Team ID is required (can be null to clear)' 
      });
    }
    
    // Authenticate user
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (!session?.session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Update the session's active team in database
    const pool = getPool();
    await pool.query(
      'UPDATE session SET "activeTeamId" = $1 WHERE id = $2',
      [teamId, session.session.id]
    );
    
    res.json({ 
      success: true, 
      activeTeamId: teamId 
    });
  } catch (error) {
    console.error('[Auth] Error setting active team:', error.message);
    res.status(500).json({ error: 'Failed to set active team' });
  }
});

/**
 * Mount Better Auth handler
 * 
 * Uses Better Auth's official Node.js adapter (toNodeHandler) to handle all
 * standard authentication and organization management endpoints.
 * 
 * The adapter automatically converts Express req/res to Better Auth's expected
 * format and handles all the authentication logic, session management, and
 * organization/team operations.
 * 
 * This catch-all route must be registered AFTER custom routes to ensure
 * custom endpoints like /set-active-team are handled first.
 */
const authHandler = toNodeHandler(auth);

router.all('/*', authHandler);

export default router;

