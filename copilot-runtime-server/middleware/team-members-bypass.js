/**
 * Team Members Bypass Middleware
 * 
 * Allows organization admins and owners to view all team members in their organization,
 * bypassing Better Auth's default team membership check.
 * 
 * Use case: Admins need to see all team members across the organization for management purposes,
 * even if they're not directly members of the specific team.
 */

import { getPool } from '../config/database.js';
import { auth } from '../auth/index.js';
import { DEBUG } from '../config/index.js';

/**
 * Middleware to bypass team membership checks for organization admins/owners
 * 
 * Flow:
 * 1. Intercepts GET requests to list-team-members
 * 2. Verifies user authentication
 * 3. Checks if user is admin/owner of the team's organization
 * 4. If yes, returns all team members directly from database
 * 5. If no, passes to Better Auth's default handler
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
export function teamMembersBypassMiddleware(req, res, next) {
  // Only intercept GET requests to list-team-members endpoint
  if (req.method !== 'GET' || !req.path.includes('list-team-members')) {
    return next();
  }

  // Extract teamId from query parameters
  const teamId = req.query.teamId;
  if (!teamId) {
    if (DEBUG) {
      console.log('[Team Members Bypass] No teamId provided, using default handler');
    }
    return next();
  }

  // Wrap in async IIFE to handle async operations
  (async () => {
    try {
      // Get authenticated session
      const session = await auth.api.getSession({ headers: req.headers });
      
      if (!session?.user) {
        return next();
      }

      const userId = session.user.id;
      const pool = getPool();

      // Get the organization ID for this team
      const teamResult = await pool.query(
        'SELECT "organizationId" FROM team WHERE id = $1',
        [teamId]
      );

      if (teamResult.rows.length === 0) {
        if (DEBUG) {
          console.log('[Team Members Bypass] Team not found:', teamId);
        }
        return next();
      }

      const organizationId = teamResult.rows[0].organizationId;

      // Check if user is an admin or owner of the organization
      const memberResult = await pool.query(
        'SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2',
        [organizationId, userId]
      );

      if (memberResult.rows.length === 0) {
        if (DEBUG) {
          console.log('[Team Members Bypass] User not a member of organization');
        }
        return next();
      }

      // Normalize roles to array
      const roles = Array.isArray(memberResult.rows[0].role) 
        ? memberResult.rows[0].role 
        : [memberResult.rows[0].role];

      // Only admins and owners can bypass
      if (!roles.includes('owner') && !roles.includes('admin')) {
        if (DEBUG) {
          console.log('[Team Members Bypass] User is not admin/owner, using default handler');
        }
        return next();
      }

      if (DEBUG) {
        console.log('[Team Members Bypass] Admin/owner access granted for team:', teamId);
      }

      // Fetch all team members directly from database
      const teamMembersResult = await pool.query(
        `SELECT 
          tm.id,
          tm."teamId",
          tm."userId",
          tm."createdAt",
          u.id AS "user_id",
          u.name AS "user_name",
          u.email AS "user_email",
          u.image AS "user_image"
        FROM "teamMember" tm
        JOIN "user" u ON tm."userId" = u.id
        WHERE tm."teamId" = $1
        ORDER BY tm."createdAt" DESC`,
        [teamId]
      );

      // Format response to match Better Auth's expected format
      const teamMembers = teamMembersResult.rows.map(row => ({
        id: row.id,
        teamId: row.teamId,
        userId: row.userId,
        createdAt: row.createdAt,
        user: {
          id: row.user_id,
          name: row.user_name,
          email: row.user_email,
          image: row.user_image,
        },
      }));

      if (DEBUG) {
        console.log(`[Team Members Bypass] Returning ${teamMembers.length} team members`);
      }

      // Return team members as JSON array (Better Auth client expects this format)
      res.status(200).json(teamMembers);
    } catch (err) {
      console.error('[Team Members Bypass] Error:', err.message);
      // Fall back to Better Auth's default handler on error
      return next();
    }
  })();
}

