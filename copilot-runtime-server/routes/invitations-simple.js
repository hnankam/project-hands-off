/**
 * Invitation Routes
 * 
 * Simple wrappers around Better Auth's invitation APIs for browser extension.
 */

import { Router } from 'express';
import { auth } from '../auth/index.js';

const router = Router();

/**
 * GET /api/invitations/:invitationId
 * Get invitation details
 */
router.get('/:invitationId', async (req, res) => {
  try {
    const { invitationId } = req.params;

    // Use Better Auth's getInvitation API
    const result = await auth.api.getInvitation({
      query: {
        id: invitationId,
      },
    });

    if (!result || result.error) {
      return res.status(404).json({
        success: false,
        error: result?.error || 'Invitation not found',
      });
    }

    res.json({
      success: true,
      invitation: result.data,
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
 * Reject/cancel an invitation
 */
router.post('/:invitationId/reject', async (req, res) => {
  try {
    const { invitationId } = req.params;

    // Use Better Auth's cancelInvitation API
    const result = await auth.api.cancelInvitation({
      body: {
        invitationId,
      },
      headers: req.headers,
    });

    if (!result || result.error) {
      return res.status(400).json({
        success: false,
        error: result?.error || 'Failed to reject invitation',
      });
    }

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

