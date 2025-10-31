/**
 * Invitation Routes
 * 
 * Custom endpoints for handling organization invitations in the browser extension.
 * These wrap Better Auth's invitation functionality with extension-friendly responses.
 */

import { Router } from 'express';
import { auth } from '../auth/index.js';

const router = Router();

/**
 * GET /api/invitations/:invitationId
 * Get invitation details by ID
 * 
 * This endpoint allows users to view invitation details before accepting
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

    // Query the database directly to get invitation details
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
    
    const invitation = invitationQuery.rows;

    if (!invitation || invitation.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found',
      });
    }

    const invitationData = invitation[0];
    
    // Fetch inviter details separately
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

    // Check if invitation is expired
    const isExpired = new Date(invitationData.expiresAt) < new Date();
    
    // Check if invitation is already used
    const isUsed = invitationData.status !== 'pending';

    if (isExpired) {
      return res.status(410).json({
        success: false,
        error: 'Invitation has expired',
        invitation: {
          id: invitationData.id,
          status: 'expired',
          organizationName: invitationData.organizationName,
        },
      });
    }

    if (isUsed) {
      return res.status(410).json({
        success: false,
        error: 'Invitation has already been used',
        invitation: {
          id: invitationData.id,
          status: invitationData.status,
          organizationName: invitationData.organizationName,
        },
      });
    }

    // Return invitation details
    res.json({
      success: true,
      invitation: {
        id: invitationData.id,
        email: invitationData.email,
        role: invitationData.role,
        status: invitationData.status,
        organization: {
          id: invitationData.organizationId,
          name: invitationData.organizationName,
          slug: invitationData.organizationSlug,
          logo: invitationData.organizationLogo,
        },
        inviter: {
          email: invitationData.inviterEmail,
          name: invitationData.inviterName,
        },
        expiresAt: invitationData.expiresAt,
        createdAt: invitationData.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invitation details',
      message: error.message,
    });
  }
});

/**
 * POST /api/invitations/:invitationId/accept
 * Accept an invitation
 * 
 * The user must be authenticated to accept an invitation.
 * The authenticated user's email must match the invitation email.
 */
router.post('/:invitationId/accept', async (req, res) => {
  try {
    const { invitationId } = req.params;
    
    if (!invitationId) {
      return res.status(400).json({
        success: false,
        error: 'Invitation ID is required',
      });
    }

    // Get session from request
    const sessionCookie = req.cookies?.['better_auth.session_token'];
    
    if (!sessionCookie) {
      return res.status(401).json({
        success: false,
        error: 'You must be logged in to accept an invitation',
      });
    }

    // Get session details
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session || !session.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
      });
    }

    // Get invitation details first
    const db = auth.options.database;
    const invitationResult = await db.query('SELECT * FROM invitation WHERE id = $1', [invitationId]);
    
    const invitation = invitationResult.rows;

    if (!invitation || invitation.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found',
      });
    }

    const invitationData = invitation[0];

    // Verify the logged-in user's email matches the invitation email
    if (session.user.email !== invitationData.email) {
      return res.status(403).json({
        success: false,
        error: 'This invitation is for a different email address',
        expected: invitationData.email,
        actual: session.user.email,
      });
    }

    // Check if expired
    if (new Date(invitationData.expiresAt) < new Date()) {
      return res.status(410).json({
        success: false,
        error: 'Invitation has expired',
      });
    }

    // Check if already used
    if (invitationData.status !== 'pending') {
      return res.status(410).json({
        success: false,
        error: 'Invitation has already been used',
      });
    }

    // Accept the invitation using Better Auth's API
    const acceptResult = await auth.api.acceptInvitation({
      body: {
        invitationId,
      },
      headers: req.headers,
    });

    if (!acceptResult || acceptResult.error) {
      throw new Error(acceptResult?.error || 'Failed to accept invitation');
    }

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      organization: {
        id: invitationData.organizationId,
        role: invitationData.role,
      },
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
 * Reject an invitation
 * 
 * This marks the invitation as rejected so it can't be used.
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

    // Get invitation details
    const db = auth.options.database;
    const invitationQuery = await db.query('SELECT * FROM invitation WHERE id = $1', [invitationId]);
    
    const invitation = invitationQuery.rows;

    if (!invitation || invitation.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found',
      });
    }

    const invitationData = invitation[0];

    // Check if already used or rejected
    if (invitationData.status !== 'pending') {
      return res.status(410).json({
        success: false,
        error: 'Invitation has already been processed',
        status: invitationData.status,
      });
    }

    // Update invitation status to rejected
    await db.query(
      'UPDATE invitation SET status = $1, "updatedAt" = $2 WHERE id = $3',
      ['rejected', new Date(), invitationId]
    );

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
 * 
 * Useful for showing pending invitations to a user when they log in
 */
router.get('/user/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

    const db = auth.options.database;
    
    // Get all pending invitations for this email
    const invitationsQuery = await db.query(`
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
      WHERE i.email = $1 AND i.status = 'pending' AND i."expiresAt" > $2
      ORDER BY i."createdAt" DESC
    `, [email, new Date()]);
    
    const invitations = invitationsQuery.rows;

    // Fetch inviter details separately if needed
    const invitationsWithInviterInfo = await Promise.all(
      invitations.map(async (inv) => {
        let inviterInfo = { email: null, name: null };
        
        if (inv.inviterId) {
          try {
            const inviterQuery = await db.query(
              'SELECT email, name FROM "user" WHERE id = $1',
              [inv.inviterId]
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
        
        return {
          id: inv.id,
          email: inv.email,
          role: inv.role,
          organization: {
            id: inv.organizationId,
            name: inv.organizationName,
            slug: inv.organizationSlug,
            logo: inv.organizationLogo,
          },
          inviter: inviterInfo,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
        };
      })
    );

    res.json({
      success: true,
      invitations: invitationsWithInviterInfo,
      count: invitations.length,
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

