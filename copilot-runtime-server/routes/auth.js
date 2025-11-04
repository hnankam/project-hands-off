/**
 * Authentication Routes
 * 
 * This file sets up all Better Auth routes for authentication and organization management.
 */

import { Router } from 'express';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../auth/index.js';
import { getPool } from '../config/database.js';

const router = Router();

/**
 * POST /api/auth/set-active-team
 * Custom endpoint to set the active team in the user's session
 * Note: We need JSON parsing for this custom endpoint
 */
router.post('/set-active-team', express.json(), async (req, res) => {
  try {
    const { teamId } = req.body;
    
    // Allow null to clear the active team
    if (teamId === undefined) {
      return res.status(400).json({ error: 'Team ID is required (can be null to clear)' });
    }
    
    // Get session from Better Auth
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (!session || !session.session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Update the session's active team (null is allowed to clear it)
    const pool = getPool();
    await pool.query(
      'UPDATE session SET "activeTeamId" = $1 WHERE id = $2',
      [teamId, session.session.id]
    );
    
    console.log(`[Auth] Set active team to ${teamId || 'null'} for session ${session.session.id}`);
    
    res.json({ success: true, activeTeamId: teamId });
  } catch (error) {
    console.error('Error setting active team:', error);
    res.status(500).json({ error: 'Failed to set active team' });
  }
});

/**
 * Mount Better Auth handler using the official Node.js adapter
 * 
 * This handles all Better Auth endpoints:
 * - POST /api/auth/sign-up/email
 * - POST /api/auth/sign-in/email
 * - POST /api/auth/sign-out
 * - GET  /api/auth/session
 * - POST /api/auth/organization/create
 * - GET  /api/auth/organization/list
 * - POST /api/auth/organization/invite-member
 * - And many more...
 */

// Use Better Auth's official Node.js adapter which handles all the request/response conversion
const authHandler = toNodeHandler(auth);

router.all('/*', authHandler);

export default router;

