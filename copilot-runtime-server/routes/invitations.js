/**
 * Invitation Routes
 * 
 * Simple wrappers around Better Auth's invitation APIs for browser extension.
 */

import crypto from 'crypto';
import { Router } from 'express';
import { auth } from '../auth/index.js';

const router = Router();

/**
 * POST /api/invitations/create
 * Create an invitation with team assignments
 */
router.post('/create', async (req, res) => {
  try {
    const { email, role, organizationId, teamIds } = req.body;

    console.log('📧 Creating invitation with data:', { email, role, organizationId, teamIds });

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

    // Extract invitation ID from response (Better Auth may return it in different formats)
    const invitationId = result.data?.id || result.data?.invitation?.id || result.id;
    console.log('✅ Invitation created:', invitationId);

    // If teams are specified, store them in the invitation_teams junction table
    // Note: The invitation_teams table must be created via migration 015_create_invitation_teams_table.sql
    if (teamIds && Array.isArray(teamIds) && teamIds.length > 0 && invitationId) {
      const db = auth.options.database;

      // Insert team associations
      for (const teamId of teamIds) {
        try {
          await db.query(
            'INSERT INTO invitation_teams ("invitationId", "teamId", "createdAt") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [invitationId, teamId, new Date()]
          );
        } catch (err) {
          console.error(`Failed to associate team ${teamId} with invitation:`, err);
        }
      }

      console.log(`✅ Invitation created with ${teamIds.length} team(s)`);
    }

    res.json({
      success: true,
      message: 'Invitation created successfully',
      data: result.data || result,
      invitationId, // Include invitation ID in response
    });
  } catch (error) {
    console.error('Error creating invitation:', error);
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
 * Invitations should be accessible without authentication since users
 * need to view them before creating an account or logging in.
 * The invitation ID itself acts as the security token.
 */
router.get('/:invitationId', async (req, res) => {
  try {
    const { invitationId } = req.params;

    if (!invitationId) {
      return res.status(400).json({
        success: false,
        error: 'Invitation ID is required',
      });
    }

    // Query the database directly to bypass authentication requirements
    // Invitations should be publicly accessible (like password reset links)
    const db = auth.options.database;
    
    // Get invitation with organization details
    const invitationQuery = await db.query(`
      SELECT 
        i.id,
        i.email,
        i.role,
        i.status,
        i."organizationId",
        i."inviterId",
        i."expiresAt",
        i."createdAt",
        o.name as "organizationName",
        o.slug as "organizationSlug",
        o.logo as "organizationLogo"
      FROM invitation i
      LEFT JOIN organization o ON i."organizationId" = o.id
      WHERE i.id = $1
    `, [invitationId]);

    if (!invitationQuery.rows || invitationQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found',
      });
    }

    const invitationData = invitationQuery.rows[0];
    
    // Fetch inviter details
    let inviterInfo = { email: null, name: null };
    if (invitationData.inviterId) {
      try {
        const inviterQuery = await db.query(
          'SELECT email, name FROM "user" WHERE id = $1',
          [invitationData.inviterId]
        );
        if (inviterQuery.rows.length > 0) {
          inviterInfo = {
            email: inviterQuery.rows[0].email,
            name: inviterQuery.rows[0].name,
          };
        }
      } catch (err) {
        console.log('Could not fetch inviter info:', err.message);
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
      inviter: {
        email: inviterInfo.email,
        name: inviterInfo.name,
      },
      expiresAt: invitationData.expiresAt,
      createdAt: invitationData.createdAt,
    };

    console.log('✅ Invitation fetched successfully:', invitation.id);

    res.json({
      success: true,
      invitation: invitation,
    });
  } catch (error) {
    console.error('Error fetching invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invitation',
      message: error.message,
    });
  }
});

/**
 * POST /api/invitations/:invitationId/accept
 * Accept an invitation (requires authentication)
 */
router.post('/:invitationId/accept', async (req, res) => {
  try {
    const { invitationId } = req.params;

    // Get invitation details to check if it includes a team
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

    // Use Better Auth's acceptInvitation API
    const result = await auth.api.acceptInvitation({
      body: {
        invitationId,
      },
      headers: req.headers,
    });

    if (!result || result.error) {
      return res.status(400).json({
        success: false,
        error: result?.error || 'Failed to accept invitation',
      });
    }

    // Get teams associated with this invitation
    // Note: The invitation_teams table must be created via migration 015_create_invitation_teams_table.sql
    let teamIds = [];
    
    // Check for single teamId (legacy)
    if (invitation.teamId) {
      teamIds.push(invitation.teamId);
    }
    
    // Check for multiple teams in invitation_teams table
    try {
      const teamsQuery = await db.query(
        'SELECT "teamId" FROM invitation_teams WHERE "invitationId" = $1',
        [invitationId]
      );
      
      if (teamsQuery.rows && teamsQuery.rows.length > 0) {
        teamIds = teamIds.concat(teamsQuery.rows.map(row => row.teamId));
      }
    } catch (err) {
      console.warn('Error fetching invitation teams:', err);
    }

    // Remove duplicates
    teamIds = [...new Set(teamIds)];

    // If invitation includes teams, automatically add user to those teams
    if (teamIds.length > 0) {
      try {
        // Get the user ID from the email
        const userQuery = await db.query(
          'SELECT id FROM "user" WHERE email = $1',
          [invitation.email]
        );

        if (userQuery.rows && userQuery.rows.length > 0) {
          const userId = userQuery.rows[0].id;
          let addedCount = 0;

          // Add user to each team
          for (const teamId of teamIds) {
            try {
              // Check if team member entry already exists
              const existingMember = await db.query(
                'SELECT id FROM "teamMember" WHERE "teamId" = $1 AND "userId" = $2',
                [teamId, userId]
              );

              if (!existingMember.rows || existingMember.rows.length === 0) {
                // Generate a unique ID for the team member entry
                const memberEntryId = crypto.randomUUID();
                
                // Add user to the team
                await db.query(
                  'INSERT INTO "teamMember" (id, "teamId", "userId", "createdAt") VALUES ($1, $2, $3, $4)',
                  [memberEntryId, teamId, userId, new Date()]
                );
                addedCount++;
                console.log(`  ✅ User ${userId} added to team ${teamId}`);
              } else {
                console.log(`  ℹ️ User ${userId} already member of team ${teamId}`);
              }
            } catch (err) {
              console.error(`  ❌ Failed to add user to team ${teamId}:`, err);
            }
          }

          if (addedCount > 0) {
            console.log(`✅ User ${userId} automatically added to ${addedCount} team(s)`);
          }
        }
      } catch (teamError) {
        console.error('Error adding user to teams:', teamError);
        // Don't fail the invitation acceptance if team addition fails
      }
    }

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      data: result.data,
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to accept invitation',
      message: error.message,
    });
  }
});

/**
 * POST /api/invitations/:invitationId/reject
 * Reject/cancel an invitation (no authentication required)
 */
router.post('/:invitationId/reject', async (req, res) => {
  try {
    const { invitationId } = req.params;

    if (!invitationId) {
      return res.status(400).json({
        success: false,
        error: 'Invitation ID is required',
      });
    }

    // Directly update the database to mark invitation as rejected
    // This allows unauthenticated users to decline invitations
    const db = auth.options.database;
    
    // First check if invitation exists and is pending
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

    console.log('✅ Invitation rejected successfully:', invitationId);

    res.json({
      success: true,
      message: 'Invitation rejected successfully',
    });
  } catch (error) {
    console.error('Error rejecting invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject invitation',
      message: error.message,
    });
  }
});

/**
 * GET /api/invitations/user/:email
 * Get all pending invitations for a user's email
 */
router.get('/user/:email', async (req, res) => {
  try {
    const { email } = req.params;

    // Use Better Auth's listInvitations for the organization
    // Note: This may need to iterate through user's organizations
    // For now, query database for pending invitations by email
    const db = auth.options.database;
    
    const result = await db.query(`
      SELECT 
        i.id,
        i.email,
        i.role,
        i.status,
        i."organizationId",
        i."expiresAt",
        i."createdAt",
        o.name as "organizationName",
        o.slug as "organizationSlug",
        o.logo as "organizationLogo"
      FROM invitation i
      LEFT JOIN organization o ON i."organizationId" = o.id
      WHERE i.email = $1 AND i.status = 'pending' AND i."expiresAt" > $2
      ORDER BY i."createdAt" DESC
    `, [email, new Date()]);

    res.json({
      success: true,
      invitations: result.rows.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        organization: {
          id: inv.organizationId,
          name: inv.organizationName,
          slug: inv.organizationSlug,
          logo: inv.organizationLogo,
        },
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })),
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching user invitations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invitations',
      message: error.message,
    });
  }
});

export default router;

