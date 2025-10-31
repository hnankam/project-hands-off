/**
 * Authentication Middleware
 * 
 * Middleware to protect routes and verify user authentication.
 */

import { auth } from '../auth/index.js';

/**
 * Require authentication middleware
 * 
 * Verifies that the user is authenticated before allowing access to the route.
 * Attaches the session and user to req.auth if authenticated.
 */
export async function requireAuth(req, res, next) {
  try {
    // Get session from request
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (!session || !session.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'You must be logged in to access this resource'
      });
    }
    
    // Attach auth info to request
    req.auth = {
      session: session.session,
      user: session.user,
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
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
 */
export async function optionalAuth(req, res, next) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (session && session.user) {
      req.auth = {
        session: session.session,
        user: session.user,
      };
    }
    
    next();
  } catch (error) {
    // Silent fail - auth is optional
    next();
  }
}

/**
 * Require organization membership middleware
 * 
 * Verifies that the user is a member of an organization before allowing access.
 * Must be used after requireAuth middleware.
 */
export async function requireOrganization(req, res, next) {
  try {
    if (!req.auth || !req.auth.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }
    
    // Get active organization from user context
    const activeMember = await auth.api.getActiveMember({ 
      headers: req.headers 
    });
    
    if (!activeMember) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'You must be a member of an organization to access this resource'
      });
    }
    
    // Attach organization info to request
    req.auth.organization = activeMember.organization;
    req.auth.member = activeMember;
    
    next();
  } catch (error) {
    console.error('Organization middleware error:', error);
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'Unable to verify organization membership'
    });
  }
}

/**
 * Require specific role(s) middleware
 * 
 * Verifies that the user has one of the specified roles in their active organization.
 * Must be used after requireOrganization middleware.
 * 
 * @param {string[]} allowedRoles - Array of role names that are allowed
 */
export function requireRole(allowedRoles) {
  return async (req, res, next) => {
    try {
      if (!req.auth || !req.auth.member) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication and organization membership required'
        });
      }
      
      const memberRoles = Array.isArray(req.auth.member.role) 
        ? req.auth.member.role 
        : [req.auth.member.role];
      
      const hasRole = memberRoles.some(role => allowedRoles.includes(role));
      
      if (!hasRole) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
        });
      }
      
      next();
    } catch (error) {
      console.error('Role middleware error:', error);
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Unable to verify role'
      });
    }
  };
}

/**
 * Require specific permission middleware
 * 
 * Verifies that the user has a specific permission for a resource.
 * Must be used after requireOrganization middleware.
 * 
 * @param {string} resource - The resource name (e.g., 'project', 'chat')
 * @param {string} action - The action name (e.g., 'create', 'read', 'update', 'delete')
 */
export function requirePermission(resource, action) {
  return async (req, res, next) => {
    try {
      if (!req.auth || !req.auth.member) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication and organization membership required'
        });
      }
      
      // Get active member's role and permissions
      const { role } = await auth.api.getActiveMemberRole({ 
        headers: req.headers 
      });
      
      // Check if the role has the required permission
      // This is a simplified check - you may want to implement
      // more sophisticated permission checking based on your AC configuration
      const hasPermission = await checkPermission(role, resource, action);
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: `You don't have permission to ${action} ${resource}`
        });
      }
      
      next();
    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Unable to verify permissions'
      });
    }
  };
}

/**
 * Helper function to check if a role has a specific permission
 * 
 * @param {string[]} roles - Array of role names
 * @param {string} resource - Resource name
 * @param {string} action - Action name
 * @returns {Promise<boolean>}
 */
async function checkPermission(roles, resource, action) {
  // Default role permissions (should match your auth config)
  const defaultPermissions = {
    owner: {
      project: ['create', 'read', 'update', 'delete'],
      chat: ['create', 'read', 'update', 'delete'],
      session: ['create', 'read', 'update', 'delete'],
      settings: ['read', 'update'],
    },
    admin: {
      project: ['create', 'read', 'update', 'delete'],
      chat: ['create', 'read', 'update', 'delete'],
      session: ['create', 'read', 'update', 'delete'],
      settings: ['read'],
    },
    member: {
      project: ['read'],
      chat: ['create', 'read', 'update'],
      session: ['create', 'read'],
      settings: ['read'],
    },
  };
  
  // Check if any of the user's roles have the required permission
  for (const role of roles) {
    const rolePermissions = defaultPermissions[role];
    if (rolePermissions && rolePermissions[resource]) {
      if (rolePermissions[resource].includes(action)) {
        return true;
      }
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

