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
 * - POST /api/auth/forgot-password - Request password reset email
 * - POST /api/auth/reset-password - Reset password with token
 * - And more...
 * 
 * Custom Endpoints:
 * - POST /api/auth/set-active-team - Set user's active team in session
 * - POST /api/auth/admin-reset-password - Admin-initiated password reset
 */

import { Router } from 'express';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../auth/index.js';
import { getPool } from '../config/database.js';

const router = Router();

/**
 * GET /api/auth/reset-password
 * Serves a page that redirects users to the Chrome extension to complete password reset
 * 
 * This is needed because Chrome extensions can't be directly linked from external URLs.
 * The page displays the token and instructions for completing the reset.
 */
router.get('/reset-password', (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invalid Reset Link</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
          .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; }
          h1 { color: #ef4444; margin-bottom: 16px; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Invalid Reset Link</h1>
          <p>This password reset link is invalid or has expired. Please request a new password reset.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  // Serve a page that helps users complete the reset in the Chrome extension
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Reset Your Password</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .container { text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); max-width: 500px; margin: 20px; }
        h1 { color: #1f2937; margin-bottom: 8px; font-size: 24px; }
        .subtitle { color: #6b7280; margin-bottom: 24px; font-size: 14px; }
        .step { text-align: left; padding: 16px; background: #f9fafb; border-radius: 8px; margin-bottom: 16px; }
        .step-number { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: #3b82f6; color: white; border-radius: 50%; font-size: 12px; font-weight: 600; margin-right: 12px; }
        .step-text { color: #374151; font-size: 14px; }
        .token-box { background: #f3f4f6; border: 2px dashed #d1d5db; border-radius: 8px; padding: 16px; margin: 20px 0; word-break: break-all; font-family: monospace; font-size: 12px; color: #1f2937; }
        .copy-btn { background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
        .copy-btn:hover { background: #2563eb; }
        .copy-btn.copied { background: #10b981; }
        .note { color: #9ca3af; font-size: 12px; margin-top: 20px; }
        .extension-link { display: inline-block; margin-top: 16px; padding: 12px 24px; background: #1f2937; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500; }
        .extension-link:hover { background: #374151; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 Reset Your Password</h1>
        <p class="subtitle">Complete your password reset in the Hands-Off extension</p>
        
        <div class="step">
          <span class="step-number">1</span>
          <span class="step-text">Open the Hands-Off Chrome extension</span>
        </div>
        
        <div class="step">
          <span class="step-number">2</span>
          <span class="step-text">The extension will automatically detect your reset request</span>
        </div>
        
        <div class="step">
          <span class="step-number">3</span>
          <span class="step-text">Enter your new password</span>
        </div>
        
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">Or copy this token and paste it in the extension:</p>
        
        <div class="token-box" id="token">${token}</div>
        
        <button class="copy-btn" onclick="copyToken()">Copy Token</button>
        
        <p class="note">This link expires in 1 hour</p>
      </div>
      
      <script>
        function copyToken() {
          const token = document.getElementById('token').textContent;
          navigator.clipboard.writeText(token).then(() => {
            const btn = document.querySelector('.copy-btn');
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.textContent = 'Copy Token';
              btn.classList.remove('copied');
            }, 2000);
          });
        }
        
        // Try to open the extension automatically
        // This will work if the extension has registered a protocol handler
        window.location.hash = '#/reset-password?token=${token}';
      </script>
    </body>
    </html>
  `);
});

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
 * POST /api/auth/admin-reset-password
 * Admin-initiated password reset for a user
 * 
 * Uses Better Auth's forgetPassword API internally to generate a proper reset token
 * that works with Better Auth's resetPassword endpoint.
 * 
 * Body:
 * - userId: User ID to reset password for (required)
 * - organizationId: Organization ID (required for authorization)
 * 
 * Returns:
 * - { success: true, message: string }
 * 
 * Errors:
 * - 400: Missing required parameters
 * - 401: User not authenticated
 * - 403: User is not admin/owner of the organization
 * - 404: Target user not found or not in organization
 * - 500: Server error
 */
router.post('/admin-reset-password', express.json(), async (req, res) => {
  try {
    const { userId, organizationId } = req.body;
    
    if (!userId || !organizationId) {
      return res.status(400).json({ 
        error: 'userId and organizationId are required' 
      });
    }
    
    // Authenticate admin user
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (!session?.session || !session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const adminUserId = session.user.id;
    const pool = getPool();
    
    // Check if requesting user is admin/owner of the organization
    const memberResult = await pool.query(
      'SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2',
      [organizationId, adminUserId]
    );
    
    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }
    
    const roles = Array.isArray(memberResult.rows[0].role) 
      ? memberResult.rows[0].role 
      : [memberResult.rows[0].role];
    
    if (!roles.includes('owner') && !roles.includes('admin')) {
      return res.status(403).json({ error: 'Only admins and owners can reset user passwords' });
    }
    
    // Check if target user is in the organization
    const targetMemberResult = await pool.query(
      'SELECT m."userId", u.email, u.name FROM member m JOIN "user" u ON m."userId" = u.id WHERE m."organizationId" = $1 AND m."userId" = $2',
      [organizationId, userId]
    );
    
    if (targetMemberResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in this organization' });
    }
    
    const targetUser = targetMemberResult.rows[0];
    
    // Use Better Auth's server-side API to request password reset
    // This generates the token and triggers the sendResetPassword callback
    const baseUrl = process.env.BETTER_AUTH_URL || process.env.BASE_URL || 'http://localhost:3001';
    
    await auth.api.requestPasswordReset({
      body: {
        email: targetUser.email,
        redirectTo: `${baseUrl}/api/auth/reset-password`,
      },
    });
    
    console.log(`[Auth] Admin ${session.user.email} initiated password reset for ${targetUser.email}`);
    
    res.json({ 
      success: true, 
      message: `Password reset email sent to ${targetUser.email}` 
    });
  } catch (error) {
    console.error('[Auth] Error in admin password reset:', error.message);
    res.status(500).json({ error: 'Failed to initiate password reset' });
  }
});

/**
 * POST /api/auth/admin-ban-user
 * Deactivate a user within an organization
 * 
 * Organization owners/admins can ban users in their organization.
 * This prevents the user from signing in while preserving their data.
 * 
 * Body:
 * - userId: User ID to ban (required)
 * - organizationId: Organization ID (required for authorization)
 * - banReason: Optional reason for the ban
 * 
 * Returns:
 * - { success: true, message: string }
 * 
 * Errors:
 * - 400: Missing required parameters
 * - 401: User not authenticated
 * - 403: User is not admin/owner of the organization
 * - 404: Target user not found or not in organization
 * - 500: Server error
 */
router.post('/admin-ban-user', express.json(), async (req, res) => {
  try {
    const { userId, organizationId, banReason } = req.body;
    
    if (!userId || !organizationId) {
      return res.status(400).json({ 
        error: 'userId and organizationId are required' 
      });
    }
    
    // Authenticate admin user
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (!session?.session || !session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const adminUserId = session.user.id;
    const pool = getPool();
    
    // Prevent self-banning
    if (userId === adminUserId) {
      return res.status(400).json({ error: 'You cannot ban yourself' });
    }
    
    // Check if requesting user is admin/owner of the organization
    const memberResult = await pool.query(
      'SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2',
      [organizationId, adminUserId]
    );
    
    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }
    
    const roles = Array.isArray(memberResult.rows[0].role) 
      ? memberResult.rows[0].role 
      : [memberResult.rows[0].role];
    
    if (!roles.includes('owner') && !roles.includes('admin')) {
      return res.status(403).json({ error: 'Only admins and owners can ban users' });
    }
    
    // Check if target user is in the organization
    const targetMemberResult = await pool.query(
      'SELECT m."userId", u.email, u.name FROM member m JOIN "user" u ON m."userId" = u.id WHERE m."organizationId" = $1 AND m."userId" = $2',
      [organizationId, userId]
    );
    
    if (targetMemberResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in this organization' });
    }
    
    const targetUser = targetMemberResult.rows[0];
    
    // Ban the user by updating the user table
    await pool.query(
      'UPDATE "user" SET banned = true, "banReason" = $1 WHERE id = $2',
      [banReason || null, userId]
    );
    
    console.log(`[Auth] Admin ${session.user.email} banned user ${targetUser.email} in org ${organizationId}`);
    
    res.json({ 
      success: true, 
      message: `User ${targetUser.email} has been deactivated` 
    });
  } catch (error) {
    console.error('[Auth] Error banning user:', error.message);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

/**
 * POST /api/auth/admin-unban-user
 * Reactivate a banned user within an organization
 * 
 * Organization owners/admins can unban users in their organization.
 * This restores the user's ability to sign in.
 * 
 * Body:
 * - userId: User ID to unban (required)
 * - organizationId: Organization ID (required for authorization)
 * 
 * Returns:
 * - { success: true, message: string }
 * 
 * Errors:
 * - 400: Missing required parameters
 * - 401: User not authenticated
 * - 403: User is not admin/owner of the organization
 * - 404: Target user not found or not in organization
 * - 500: Server error
 */
router.post('/admin-unban-user', express.json(), async (req, res) => {
  try {
    const { userId, organizationId } = req.body;
    
    if (!userId || !organizationId) {
      return res.status(400).json({ 
        error: 'userId and organizationId are required' 
      });
    }
    
    // Authenticate admin user
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (!session?.session || !session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const adminUserId = session.user.id;
    const pool = getPool();
    
    // Check if requesting user is admin/owner of the organization
    const memberResult = await pool.query(
      'SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2',
      [organizationId, adminUserId]
    );
    
    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }
    
    const roles = Array.isArray(memberResult.rows[0].role) 
      ? memberResult.rows[0].role 
      : [memberResult.rows[0].role];
    
    if (!roles.includes('owner') && !roles.includes('admin')) {
      return res.status(403).json({ error: 'Only admins and owners can unban users' });
    }
    
    // Check if target user is in the organization
    const targetMemberResult = await pool.query(
      'SELECT m."userId", u.email, u.name FROM member m JOIN "user" u ON m."userId" = u.id WHERE m."organizationId" = $1 AND m."userId" = $2',
      [organizationId, userId]
    );
    
    if (targetMemberResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in this organization' });
    }
    
    const targetUser = targetMemberResult.rows[0];
    
    // Unban the user by updating the user table
    await pool.query(
      'UPDATE "user" SET banned = false, "banReason" = NULL, "banExpires" = NULL WHERE id = $1',
      [userId]
    );
    
    console.log(`[Auth] Admin ${session.user.email} unbanned user ${targetUser.email} in org ${organizationId}`);
    
    res.json({ 
      success: true, 
      message: `User ${targetUser.email} has been reactivated` 
    });
  } catch (error) {
    console.error('[Auth] Error unbanning user:', error.message);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

/**
 * GET /api/auth/org-members-with-status
 * Get organization members with their banned status
 * 
 * This custom endpoint extends Better Auth's listMembers to include
 * the banned status from the user table.
 * 
 * Query:
 * - organizationId: Organization ID (required)
 * 
 * Returns:
 * - { members: Array<Member with banned status> }
 * 
 * Errors:
 * - 400: Missing organizationId
 * - 401: User not authenticated
 * - 403: User is not a member of the organization
 * - 500: Server error
 */
router.get('/org-members-with-status', async (req, res) => {
  try {
    const { organizationId } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'organizationId is required' 
      });
    }
    
    // Authenticate user
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (!session?.session || !session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const pool = getPool();
    
    // Check if user is a member of the organization
    const memberCheck = await pool.query(
      'SELECT 1 FROM member WHERE "organizationId" = $1 AND "userId" = $2',
      [organizationId, session.user.id]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }
    
    // Fetch members with user data including banned status
    const result = await pool.query(`
      SELECT 
        m.id,
        m."userId",
        m."organizationId",
        m.role,
        m."createdAt",
        u.id as "user_id",
        u.name as "user_name",
        u.email as "user_email",
        u.image as "user_image",
        u.banned as "user_banned",
        u."banReason" as "user_banReason",
        u."banExpires" as "user_banExpires"
      FROM member m
      JOIN "user" u ON m."userId" = u.id
      WHERE m."organizationId" = $1
      ORDER BY m."createdAt" ASC
    `, [organizationId]);
    
    // Transform the flat result into nested structure
    const members = result.rows.map(row => ({
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      role: row.role,
      createdAt: row.createdAt,
      user: {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
        image: row.user_image,
        banned: row.user_banned,
        banReason: row.user_banReason,
        banExpires: row.user_banExpires,
      },
    }));
    
    res.json({ members });
  } catch (error) {
    console.error('[Auth] Error fetching members with status:', error.message);
    res.status(500).json({ error: 'Failed to fetch members' });
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

