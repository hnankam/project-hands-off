/**
 * Authentication Middleware
 * 
 * Provides middleware functions to protect routes and verify user authentication,
 * organization membership, roles, and permissions using Better Auth.
 */

import { auth } from '../auth/index.js';

/**
 * Require authentication middleware
 * 
 * Verifies that the user is authenticated before allowing access to the route.
 * Attaches the session and user to req.auth if authenticated.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
export async function requireAuth(req, res, next) {
  try {
    // Get session from request headers
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (!session?.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'You must be logged in to access this resource'
      });
    }
    
    // Attach auth info to request for downstream use
    req.auth = {
      session: session.session,
      user: session.user,
    };
    
    next();
  } catch (error) {
    console.error('[Auth] Authentication error:', error.message);
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid or expired session'
    });
  }
}

/**
 * Optional authentication middleware
 * 
 * Attaches auth info to the request if available, but doesn't require it.
 * Useful for endpoints that have different behavior for authenticated vs. anonymous users.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
export async function optionalAuth(req, res, next) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (session?.user) {
      req.auth = {
        session: session.session,
        user: session.user,
      };
    }
  } catch (error) {
    // Silent fail - auth is optional
    // Don't log errors for optional auth to reduce noise
  }
  
  next();
}

/**
 * Require organization membership middleware
 * 
 * Verifies that the user is a member of an organization before allowing access.
 * Attaches organization and member info to req.auth.
 * 
 * @requires requireAuth - Must be used after requireAuth middleware
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
export async function requireOrganization(req, res, next) {
  try {
    if (!req.auth?.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }
    
    // Get active organization member from user context
    const activeMember = await auth.api.getActiveMember({ 
      headers: req.headers 
    });
    
    if (!activeMember?.organization) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'You must be a member of an organization to access this resource'
      });
    }
    
    // Attach organization and member info to request
    req.auth.organization = activeMember.organization;
    req.auth.member = activeMember;
    
    next();
  } catch (error) {
    console.error('[Auth] Organization verification error:', error.message);
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'Unable to verify organization membership'
    });
  }
}

/**
 * Require specific role(s) middleware factory
 * 
 * Returns a middleware that verifies the user has one of the specified roles
 * in their active organization.
 * 
 * @requires requireOrganization - Must be used after requireOrganization middleware
 * @param {string|string[]} allowedRoles - Role name or array of role names that are allowed
 * @returns {Function} Express middleware function
 * 
 * @example
 * app.get('/admin', requireAuth, requireOrganization, requireRole(['owner', 'admin']), handler);
 */
export function requireRole(allowedRoles) {
  // Normalize to array for consistent handling
  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return async (req, res, next) => {
    try {
      if (!req.auth?.member) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication and organization membership required'
        });
      }
      
      // Normalize member roles to array
      const memberRoles = Array.isArray(req.auth.member.role) 
        ? req.auth.member.role 
        : [req.auth.member.role];
      
      // Check if user has any of the allowed roles
      const hasRole = memberRoles.some(role => rolesArray.includes(role));
      
      if (!hasRole) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: `This action requires one of the following roles: ${rolesArray.join(', ')}`
        });
      }
      
      next();
    } catch (error) {
      console.error('[Auth] Role verification error:', error.message);
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Unable to verify role'
      });
    }
  };
}

/**
 * Require specific permission middleware factory
 * 
 * Returns a middleware that verifies the user has a specific permission
 * for a resource based on their role.
 * 
 * @requires requireOrganization - Must be used after requireOrganization middleware
 * @param {string} resource - The resource name (e.g., 'project', 'chat', 'session')
 * @param {string} action - The action name (e.g., 'create', 'read', 'update', 'delete')
 * @returns {Function} Express middleware function
 * 
 * @example
 * app.post('/projects', requireAuth, requireOrganization, requirePermission('project', 'create'), handler);
 */
export function requirePermission(resource, action) {
  return async (req, res, next) => {
    try {
      if (!req.auth?.member) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication and organization membership required'
        });
      }
      
      // Normalize member roles to array
      const memberRoles = Array.isArray(req.auth.member.role) 
        ? req.auth.member.role 
        : [req.auth.member.role];
      
      // Check if any of the user's roles have the required permission
      const hasPermission = await checkPermission(memberRoles, resource, action);
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: `You don't have permission to ${action} ${resource}`
        });
      }
      
      next();
    } catch (error) {
      console.error('[Auth] Permission verification error:', error.message);
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Unable to verify permissions'
      });
    }
  };
}

/**
 * Permission matrix defining what actions each role can perform on each resource
 * Aligned with Better Auth's default roles (owner, admin, member)
 */
const PERMISSION_MATRIX = {
    owner: {
      project: ['create', 'read', 'update', 'delete'],
      chat: ['create', 'read', 'update', 'delete'],
      session: ['create', 'read', 'update', 'delete'],
      settings: ['read', 'update'],
    model: ['create', 'read', 'update', 'delete'],
    provider: ['create', 'read', 'update', 'delete'],
    tool: ['create', 'read', 'update', 'delete'],
    },
    admin: {
      project: ['create', 'read', 'update', 'delete'],
      chat: ['create', 'read', 'update', 'delete'],
      session: ['create', 'read', 'update', 'delete'],
      settings: ['read'],
    model: ['create', 'read', 'update', 'delete'],
    provider: ['create', 'read', 'update', 'delete'],
    tool: ['create', 'read', 'update', 'delete'],
    },
    member: {
      project: ['read'],
      chat: ['create', 'read', 'update'],
      session: ['create', 'read'],
      settings: ['read'],
    model: ['read'],
    provider: ['read'],
    tool: ['read'],
    },
  };
  
/**
 * Helper function to check if a role has a specific permission
 * 
 * @param {string[]} roles - Array of role names
 * @param {string} resource - Resource name (e.g., 'project', 'chat', 'model')
 * @param {string} action - Action name (e.g., 'create', 'read', 'update', 'delete')
 * @returns {Promise<boolean>} True if any of the user's roles have the permission
 * 
 * @example
 * const canCreate = await checkPermission(['member'], 'project', 'create'); // false
 * const canRead = await checkPermission(['member'], 'project', 'read');     // true
 */
async function checkPermission(roles, resource, action) {
  // Check if any of the user's roles have the required permission
  for (const role of roles) {
    const rolePermissions = PERMISSION_MATRIX[role];
    
    if (rolePermissions?.[resource]?.includes(action)) {
        return true;
    }
  }
  
  return false;
}

export default {
  requireAuth,
  optionalAuth,
  requireOrganization,
  requireRole,
  requirePermission,
};

