/**
 * Invitation Routes
 * 
 * Manages organization invitation lifecycle for the browser extension.
 * Extends Better Auth's invitation system with multi-team support.
 * 
 * **Features:**
 * - Create invitations with team assignments
 * - Public invitation viewing (no auth required)
 * - Accept invitations with automatic team membership
 * - Reject invitations without authentication
 * - List pending invitations by email
 * 
 * **Multi-Team Support:**
 * This module extends Better Auth's single-team invitations with support
 * for inviting users to multiple teams simultaneously via the `invitation_teams`
 * junction table.
 * 
 * **Security Model:**
 * - GET /:invitationId - Public (invitation ID is the security token)
 * - POST /create - Requires authentication (via Better Auth)
 * - POST /:invitationId/accept - Requires authentication
 * - POST /:invitationId/reject - Public (allows declining before signup)
 * - GET /user/:email - Public (users need to see pending invitations)
 * 
 * @module routes/invitations
 */

import crypto from 'crypto';
import { Router } from 'express';
import { auth } from '../auth/index.js';
import { logError } from '../utils/logger.js';

const router = Router();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extracts invitation ID from Better Auth response
 * Better Auth may return the ID in different formats depending on version
 * @param {Object} result - Better Auth API response
 * @returns {string|null} Invitation ID or null if not found
 */
function extractInvitationId(result) {
  return result?.data?.id || result?.data?.invitation?.id || result?.id || null;
}

/**
 * Associates teams with an invitation in the junction table
 * @param {Object} db - Database connection
 * @param {string} invitationId - Invitation ID
 * @param {string[]} teamIds - Array of team IDs
 * @returns {Promise<number>} Number of teams successfully associated
 */
async function associateTeamsWithInvitation(db, invitationId, teamIds) {
  let successCount = 0;
  
  for (const teamId of teamIds) {
    try {
      await db.query(
        'INSERT INTO invitation_teams ("invitationId", "teamId", "createdAt") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [invitationId, teamId, new Date()]
      );
      successCount++;
    } catch (err) {
      console.error(`[Invitations] Failed to associate team ${teamId}:`, err.message);
    }
  }
  
  return successCount;
}

/**
 * Adds a user to a team if not already a member
 * @param {Object} db - Database connection
 * @param {string} teamId - Team ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if user was added, false if already a member
 */
async function addUserToTeam(db, teamId, userId) {
  // Check if already a member
  const existingMember = await db.query(
    'SELECT id FROM "teamMember" WHERE "teamId" = $1 AND "userId" = $2',
    [teamId, userId]
  );

  if (existingMember.rows && existingMember.rows.length > 0) {
    return false; // Already a member
  }

  // Add user to team
  const memberEntryId = crypto.randomUUID();
  await db.query(
    'INSERT INTO "teamMember" (id, "teamId", "userId", "createdAt") VALUES ($1, $2, $3, $4)',
    [memberEntryId, teamId, userId, new Date()]
  );
  
  return true; // Successfully added
}

/**
 * Retrieves all team IDs associated with an invitation
 * Supports both legacy single-team (invitation.teamId) and new multi-team (invitation_teams table)
 * @param {Object} db - Database connection
 * @param {string} invitationId - Invitation ID
 * @param {string|null} legacyTeamId - Legacy teamId from invitation table
 * @returns {Promise<string[]>} Array of unique team IDs
 */
async function getInvitationTeams(db, invitationId, legacyTeamId = null) {
  const teamIds = [];
  
  // Include legacy single teamId if present
  if (legacyTeamId) {
    teamIds.push(legacyTeamId);
  }
  
  // Fetch from invitation_teams junction table
  try {
    const teamsQuery = await db.query(
      'SELECT "teamId" FROM invitation_teams WHERE "invitationId" = $1',
      [invitationId]
    );
    
    if (teamsQuery.rows && teamsQuery.rows.length > 0) {
      teamIds.push(...teamsQuery.rows.map(row => row.teamId));
    }
  } catch (err) {
    console.warn('[Invitations] Error fetching invitation teams:', err.message);
  }
  
  // Remove duplicates and return
  return [...new Set(teamIds)];
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/invitations/create
 * Create an invitation with optional team assignments
 * 
 * Requires: Authentication (enforced by Better Auth)
 * 
 * Body:
 * - email: string (required) - Email address to invite
 * - role: string (required) - Role for the member ('owner', 'admin', 'member')
 * - organizationId: string (required, UUID) - Organization ID
 * - teamIds?: string[] (optional) - Array of team IDs to assign
 * 
 * Responses:
 * - 200 OK: { success: true, message, data, invitationId }
 * - 400 Bad Request: Missing required fields or Better Auth error
 * - 401 Unauthorized: Not authenticated
 * - 500 Internal Server Error: Database or server error
 */
router.post('/create', async (req, res) => {
  const reqId = res.locals?.reqId || 'unknown';
  
  try {
    const { email, role, organizationId, teamIds } = req.body;

    console.log(`[${reqId}] [Invitations] Creating invitation:`, { email, role, organizationId, teams: teamIds?.length || 0 });

    // Validate required fields
    if (!email || !role || !organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Email, role, and organizationId are required',
      });
    }

    // Create invitation using Better Auth
    const result = await auth.api.createInvitation({
      body: {
        email,
        role,
        organizationId,
      },
      headers: req.headers,
    });

    if (!result || result.error) {
      return res.status(400).json({
        success: false,
        error: result?.error || 'Failed to create invitation',
      });
    }

    // Extract invitation ID from Better Auth response
    const invitationId = extractInvitationId(result);
    
    if (!invitationId) {
      console.error(`[${reqId}] [Invitations] Failed to extract invitation ID from result:`, result);
      return res.status(500).json({
        success: false,
        error: 'Failed to extract invitation ID',
      });
    }
    
    console.log(`[${reqId}] [Invitations] Invitation created:`, invitationId);

    // Associate teams with invitation if specified
    if (teamIds && Array.isArray(teamIds) && teamIds.length > 0) {
      const db = auth.options.database;
      const associatedCount = await associateTeamsWithInvitation(db, invitationId, teamIds);
      
      if (associatedCount > 0) {
        console.log(`[${reqId}] [Invitations] Associated ${associatedCount}/${teamIds.length} team(s)`);
      } else {
        console.warn(`[${reqId}] [Invitations] Failed to associate any teams`);
      }
    }

    res.json({
      success: true,
      message: 'Invitation created successfully',
      data: result.data || result,
      invitationId,
    });
  } catch (error) {
    logError(reqId, '[Invitations] Error creating invitation', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create invitation',
      message: error.message,
    });
  }
});

/**
 * GET /api/invitations/:invitationId
 * Get invitation details (PUBLIC - no authentication required)
 * 
 * This endpoint is public because users need to view invitation details
 * before creating an account or logging in. The invitation ID itself
 * acts as the security token (similar to password reset links).
 * 
 * Responses:
 * - 200 OK: { success: true, invitation: InvitationObject }
 * - 400 Bad Request: Invalid invitation ID
 * - 404 Not Found: Invitation not found
 * - 500 Internal Server Error: Database or server error
 */
router.get('/:invitationId', async (req, res) => {
  const reqId = res.locals?.reqId || 'unknown';
  
  try {
    const { invitationId } = req.params;

    if (!invitationId) {
      return res.status(400).json({
        success: false,
        error: 'Invitation ID is required',
      });
    }

    const db = auth.options.database;
    
    // Get invitation with organization details
    const invitationQuery = await db.query(
      `SELECT 
        i.id,
        i.email,
        i.role,
        i.status,
        i."organizationId",
        i."inviterId",
        i."expiresAt",
        i."createdAt",
        o.name AS "organizationName",
        o.slug AS "organizationSlug",
        o.logo AS "organizationLogo"
      FROM invitation i
      LEFT JOIN organization o ON i."organizationId" = o.id
      WHERE i.id = $1`,
      [invitationId]
    );

    if (!invitationQuery.rows || invitationQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found',
      });
    }

    const invitationData = invitationQuery.rows[0];
    
    // Fetch inviter details (optional, non-blocking)
    let inviterInfo = { email: null, name: null };
    if (invitationData.inviterId) {
      try {
        const inviterQuery = await db.query(
          'SELECT email, name FROM "user" WHERE id = $1',
          [invitationData.inviterId]
        );
        if (inviterQuery.rows?.length > 0) {
          inviterInfo = {
            email: inviterQuery.rows[0].email,
            name: inviterQuery.rows[0].name,
          };
        }
      } catch (err) {
        console.warn(`[${reqId}] [Invitations] Could not fetch inviter info:`, err.message);
      }
    }

    // Transform to match frontend expectations
    const invitation = {
      id: invitationData.id,
      email: invitationData.email,
      role: invitationData.role,
      status: invitationData.status,
      organization: {
        id: invitationData.organizationId,
        name: invitationData.organizationName,
        slug: invitationData.organizationSlug,
        logo: invitationData.organizationLogo || null,
      },
      inviter: inviterInfo,
      expiresAt: invitationData.expiresAt,
      createdAt: invitationData.createdAt,
    };

    console.log(`[${reqId}] [Invitations] Fetched invitation:`, invitation.id);

    res.json({
      success: true,
      invitation,
    });
  } catch (error) {
    logError(reqId, '[Invitations] Error fetching invitation', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invitation',
      message: error.message,
    });
  }
});

/**
 * POST /api/invitations/:invitationId/accept
 * Accept an invitation and automatically add user to associated teams
 * 
 * Requires: Authentication (enforced by Better Auth)
 * 
 * Flow:
 * 1. Accept invitation via Better Auth (adds user to organization)
 * 2. Retrieve all teams associated with the invitation
 * 3. Automatically add user to those teams
 * 
 * Responses:
 * - 200 OK: { success: true, message, data }
 * - 400 Bad Request: Better Auth error or invalid invitation
 * - 401 Unauthorized: Not authenticated
 * - 404 Not Found: Invitation not found
 * - 500 Internal Server Error: Database or server error
 */
router.post('/:invitationId/accept', async (req, res) => {
  const reqId = res.locals?.reqId || 'unknown';
  
  try {
    const { invitationId } = req.params;

    // Get invitation details
    const db = auth.options.database;
    const invitationQuery = await db.query(
      'SELECT id, "organizationId", "teamId", email FROM invitation WHERE id = $1',
      [invitationId]
    );

    if (!invitationQuery.rows || invitationQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found',
      });
    }

    const invitation = invitationQuery.rows[0];

    // Accept invitation via Better Auth (adds user to organization)
    const result = await auth.api.acceptInvitation({
      body: { invitationId },
      headers: req.headers,
    });

    if (!result || result.error) {
      return res.status(400).json({
        success: false,
        error: result?.error || 'Failed to accept invitation',
      });
    }

    console.log(`[${reqId}] [Invitations] Invitation accepted:`, invitationId);

    // Get all teams associated with this invitation (legacy + multi-team)
    const teamIds = await getInvitationTeams(db, invitationId, invitation.teamId);

    // Automatically add user to associated teams
    if (teamIds.length > 0) {
      try {
        // Get the user ID from the invitation email
        const userQuery = await db.query(
          'SELECT id FROM "user" WHERE email = $1',
          [invitation.email]
        );

        if (userQuery.rows && userQuery.rows.length > 0) {
          const userId = userQuery.rows[0].id;
          let addedCount = 0;
          let skippedCount = 0;

          // Add user to each team
          for (const teamId of teamIds) {
            try {
              const wasAdded = await addUserToTeam(db, teamId, userId);
              if (wasAdded) {
                addedCount++;
                console.log(`[${reqId}] [Invitations] Added user to team ${teamId}`);
              } else {
                skippedCount++;
                console.log(`[${reqId}] [Invitations] User already in team ${teamId}`);
              }
            } catch (err) {
              console.error(`[${reqId}] [Invitations] Failed to add user to team ${teamId}:`, err.message);
            }
          }

          if (addedCount > 0) {
            console.log(`[${reqId}] [Invitations] Added user to ${addedCount} team(s) (${skippedCount} skipped)`);
          }
        } else {
          console.warn(`[${reqId}] [Invitations] User not found for email:`, invitation.email);
        }
      } catch (teamError) {
        console.error(`[${reqId}] [Invitations] Error adding user to teams:`, teamError.message);
        // Don't fail the invitation acceptance if team addition fails
      }
    }

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      data: result.data,
    });
  } catch (error) {
    logError(reqId, '[Invitations] Error accepting invitation', error);
    res.status(500).json({
      success: false,
      error: 'Failed to accept invitation',
      message: error.message,
    });
  }
});

/**
 * POST /api/invitations/:invitationId/reject
 * Reject/cancel an invitation (PUBLIC - no authentication required)
 * 
 * This endpoint is public to allow users to decline invitations
 * without creating an account or logging in.
 * 
 * Responses:
 * - 200 OK: { success: true, message }
 * - 400 Bad Request: Invitation already processed or invalid ID
 * - 404 Not Found: Invitation not found
 * - 500 Internal Server Error: Database or server error
 */
router.post('/:invitationId/reject', async (req, res) => {
  const reqId = res.locals?.reqId || 'unknown';
  
  try {
    const { invitationId } = req.params;

    if (!invitationId) {
      return res.status(400).json({
        success: false,
        error: 'Invitation ID is required',
      });
    }

    const db = auth.options.database;
    
    // Check if invitation exists and is pending
    const checkQuery = await db.query(
      'SELECT id, status FROM invitation WHERE id = $1',
      [invitationId]
    );

    if (!checkQuery.rows || checkQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found',
      });
    }

    const invitation = checkQuery.rows[0];
    
    if (invitation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Invitation is already ${invitation.status}`,
      });
    }

    // Update invitation status to rejected
    await db.query(
      'UPDATE invitation SET status = $1 WHERE id = $2',
      ['rejected', invitationId]
    );

    console.log(`[${reqId}] [Invitations] Invitation rejected:`, invitationId);

    res.json({
      success: true,
      message: 'Invitation rejected successfully',
    });
  } catch (error) {
    logError(reqId, '[Invitations] Error rejecting invitation', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject invitation',
      message: error.message,
    });
  }
});

/**
 * GET /api/invitations/user/:email
 * Get all pending invitations for a user's email (PUBLIC)
 * 
 * Returns only pending, non-expired invitations for the specified email.
 * This endpoint is public to allow users to see their pending invitations
 * before logging in or creating an account.
 * 
 * Responses:
 * - 200 OK: { success: true, invitations: InvitationObject[], count: number }
 * - 500 Internal Server Error: Database or server error
 */
router.get('/user/:email', async (req, res) => {
  const reqId = res.locals?.reqId || 'unknown';
  
  try {
    const { email } = req.params;

    const db = auth.options.database;
    
    // Query pending, non-expired invitations for this email
    const result = await db.query(
      `SELECT 
        i.id,
        i.email,
        i.role,
        i.status,
        i."organizationId",
        i."expiresAt",
        i."createdAt",
        o.name AS "organizationName",
        o.slug AS "organizationSlug",
        o.logo AS "organizationLogo"
      FROM invitation i
      LEFT JOIN organization o ON i."organizationId" = o.id
      WHERE i.email = $1 
        AND i.status = 'pending' 
        AND i."expiresAt" > $2
      ORDER BY i."createdAt" DESC`,
      [email, new Date()]
    );

    const invitations = result.rows.map(inv => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      organization: {
        id: inv.organizationId,
        name: inv.organizationName,
        slug: inv.organizationSlug,
        logo: inv.organizationLogo || null,
      },
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));

    console.log(`[${reqId}] [Invitations] Found ${invitations.length} pending invitation(s) for ${email}`);

    res.json({
      success: true,
      invitations,
      count: invitations.length,
    });
  } catch (error) {
    logError(reqId, '[Invitations] Error fetching user invitations', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invitations',
      message: error.message,
    });
  }
});

export default router;

