/**
 * Middleware to allow organization admins/owners to view all team members
 * This bypasses Better Auth's default team membership check
 */

import { getPool } from '../config/database.js';
import { auth } from '../auth/index.js';

export function teamMembersBypassMiddleware(req, res, next) {
  // Only intercept GET requests to list-team-members
  if (req.method !== 'GET' || !req.path.includes('list-team-members')) {
    return next();
  }

  console.log('[Team Members Bypass] Intercepting list-team-members request');

  // Extract teamId from query
  const teamId = req.query.teamId;
  if (!teamId) {
    console.log('[Team Members Bypass] No teamId provided, skipping bypass');
    return next();
  }

  console.log('[Team Members Bypass] Checking authentication and permissions', { teamId });

  // Use async handler
  (async () => {
    try {
      // Get session from Better Auth
      const session = await auth.api.getSession({ headers: req.headers });
      
      if (!session || !session.user) {
        console.log('[Team Members Bypass] No authenticated user');
        return next();
      }

      const userId = session.user.id;
      console.log('[Team Members Bypass] Authenticated user:', userId);

      const pool = getPool();

      // Get the organization ID for this team (Better Auth uses singular table names)
      const teamResult = await pool.query(
        'SELECT "organizationId" FROM team WHERE id = $1',
        [teamId]
      );

      if (teamResult.rows.length === 0) {
        console.log('[Team Members Bypass] Team not found');
        return next();
      }

      const organizationId = teamResult.rows[0].organizationId;

      // Check if user is an owner or admin of the organization
      const memberResult = await pool.query(
        'SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2',
        [organizationId, userId]
      );

      if (memberResult.rows.length === 0) {
        console.log('[Team Members Bypass] User not a member of organization');
        return next();
      }

      const roles = Array.isArray(memberResult.rows[0].role) 
        ? memberResult.rows[0].role 
        : [memberResult.rows[0].role];

      if (!roles.includes('owner') && !roles.includes('admin')) {
        console.log('[Team Members Bypass] User is not owner/admin, using default check');
        return next();
      }

      console.log('[Team Members Bypass] ✅ User is owner/admin, bypassing membership check');

      // Fetch team members directly from database
      const teamMembersResult = await pool.query(
        `SELECT 
          tm.id,
          tm."teamId",
          tm."userId",
          tm."createdAt",
          u.id as "user_id",
          u.name as "user_name",
          u.email as "user_email",
          u.image as "user_image"
        FROM "teamMember" tm
        JOIN "user" u ON tm."userId" = u.id
        WHERE tm."teamId" = $1
        ORDER BY tm."createdAt" DESC`,
        [teamId]
      );

      // Format response to match Better Auth format
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

      console.log('[Team Members Bypass] Returning', teamMembers.length, 'team members');
      console.log('[Team Members Bypass] Sample member:', JSON.stringify(teamMembers[0], null, 2));

      // Return as plain array - Better Auth client will wrap it
      res.status(200);
      res.setHeader('Content-Type', 'application/json');
      return res.json(teamMembers);
    } catch (err) {
      console.error('[Team Members Bypass] Error:', err);
      return next();
    }
  })();
}

