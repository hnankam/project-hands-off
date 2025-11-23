/**
 * Route Helper Utilities
 * 
 * Shared utility functions used across multiple route handlers.
 * These utilities reduce code duplication across 5+ route files
 * (models, providers, agents, tools, base-instructions).
 * 
 * Categories:
 * - JSON and Data Utilities: Parsing and sanitization
 * - HTTP/Network Utilities: URL normalization, error extraction
 * - Authentication & Authorization: Session validation, role checking
 * 
 * Usage:
 * Import specific functions as needed in route handlers to validate
 * requests, check permissions, and handle data transformations.
 * 
 * @module utils/route-helpers
 * 
 * @example
 * // In a route handler
 * import { ensureAuthenticated, ensureOrgAdmin, sanitizeJSON } from '../utils/route-helpers.js';
 * 
 * router.post('/api/models', async (req, res, next) => {
 *   const session = await ensureAuthenticated(req, res);
 *   if (!session) return;
 *   
 *   const pool = getPool();
 *   const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
 *   if (!roles) return;
 *   
 *   const metadata = sanitizeJSON(req.body.metadata, {});
 *   // ... continue with route logic
 * });
 */

import { auth } from '../auth/index.js';

// ============================================================================
// JSON and Data Utilities
// ============================================================================

/**
 * Sanitizes and parses JSON values from request body
 * Handles various input formats: null, objects, JSON strings, empty strings
 * 
 * @param {*} value - Value to sanitize (string, object, or null)
 * @param {Object} fallback - Fallback value if parsing fails (default: {})
 * @returns {Object} Parsed JSON object or fallback
 * @throws {Error} If value is invalid JSON string
 * 
 * @example
 * // Handle JSON string
 * const config = sanitizeJSON('{"key": "value"}', {});
 * // Returns: { key: "value" }
 * 
 * @example
 * // Handle already-parsed object
 * const config = sanitizeJSON({ key: "value" }, {});
 * // Returns: { key: "value" }
 * 
 * @example
 * // Handle null/undefined with fallback
 * const config = sanitizeJSON(null, { default: true });
 * // Returns: { default: true }
 */
export const sanitizeJSON = (value, fallback = {}) => {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error('Invalid JSON payload');
  }
};

// ============================================================================
// HTTP/Network Utilities
// ============================================================================

/**
 * Ensures URL has https:// protocol
 * Used for normalizing provider endpoints (especially Azure OpenAI)
 * 
 * @param {string} value - URL to ensure has https
 * @returns {string} URL with https:// protocol
 * 
 * @example
 * ensureHttps('example.openai.azure.com')
 * // Returns: 'https://example.openai.azure.com'
 * 
 * @example
 * ensureHttps('https://example.com')
 * // Returns: 'https://example.com' (unchanged)
 * 
 * @example
 * ensureHttps('http://localhost:8080')
 * // Returns: 'http://localhost:8080' (preserves http for localhost)
 */
export const ensureHttps = (value) => {
  if (!value) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return `https://${value}`;
};

/**
 * Safely parses JSON response from fetch, returns null on error
 * Prevents crashes when API returns non-JSON or malformed responses
 * 
 * @param {Response} response - Fetch response object
 * @returns {Promise<Object|null>} Parsed JSON or null
 * 
 * @example
 * const response = await fetch(url);
 * const data = await safeJsonParse(response);
 * 
 * if (data) {
 *   // Process successful JSON response
 * } else {
 *   // Handle non-JSON or malformed response
 * }
 */
export const safeJsonParse = async (response) => {
  try {
    return await response.json();
  } catch (err) {
    return null;
  }
};

/**
 * Extracts error message from various API response formats
 * Handles multiple error structures from different providers:
 * - OpenAI/Azure: { error: { message: "..." } }
 * - Google: { error: "..." }
 * - Anthropic/Bedrock: { message: "..." }
 * - FastAPI/Django: { detail: "..." }
 * - RFC 7807: { title: "...", detail: "..." }
 * - Array of errors: { errors: ["...", ...] }
 * 
 * @param {Object|string} payload - Error payload from API
 * @param {string} fallback - Fallback message if extraction fails
 * @returns {string} Extracted or fallback error message
 * 
 * @example
 * // OpenAI format
 * extractErrorMessage({ error: { message: "Invalid API key" } }, "Unknown error")
 * // Returns: "Invalid API key"
 * 
 * @example
 * // Simple string error
 * extractErrorMessage("Connection timeout", "Unknown error")
 * // Returns: "Connection timeout"
 * 
 * @example
 * // Fallback when no error found
 * extractErrorMessage({}, "Something went wrong")
 * // Returns: "Something went wrong"
 */
export const extractErrorMessage = (payload, fallback) => {
  if (!payload) return fallback;

  if (typeof payload === 'string') {
    return payload;
  }

  // Try payload.error (various formats)
  const errField = payload.error;
  if (errField) {
    if (typeof errField === 'string') {
      return errField;
    }
    if (typeof errField.message === 'string') {
      return errField.message;
    }
    if (typeof errField.error === 'string') {
      return errField.error;
    }
    if (errField.error && typeof errField.error.message === 'string') {
      return errField.error.message;
    }
  }

  // Try payload.message
  if (typeof payload.message === 'string') {
    return payload.message;
  }

  // Try payload.errors array
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const first = payload.errors[0];
    if (typeof first === 'string') {
      return first;
    }
    if (first && typeof first.message === 'string') {
      return first.message;
    }
  }

  // Try payload.detail (common in FastAPI/Django)
  if (typeof payload.detail === 'string') {
    return payload.detail;
  }

  // Try payload.title (common in RFC 7807 Problem Details)
  if (typeof payload.title === 'string') {
    return payload.title;
  }

  return fallback;
};

// ============================================================================
// Authentication & Authorization Utilities
// ============================================================================

/**
 * Ensures the request has a valid authenticated session
 * Validates Better Auth session and sends 401 if invalid
 * 
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @returns {Promise<Object|null>} Session object or null (with 401 response sent)
 * 
 * @example
 * router.post('/api/models', async (req, res, next) => {
 *   const session = await ensureAuthenticated(req, res);
 *   if (!session) return; // 401 already sent
 *   
 *   const userId = session.user.id;
 *   const userEmail = session.user.email;
 *   // ... continue with authenticated logic
 * });
 */
export async function ensureAuthenticated(req, res) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session || !session.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  return session;
}

/**
 * Ensures the user is an admin or owner of the organization
 * Validates organization membership and checks for admin/owner role
 * 
 * Sends appropriate HTTP error if validation fails:
 * - 400: organizationId missing
 * - 403: Not a member or insufficient permissions
 * 
 * @param {Pool} pool - Database connection pool
 * @param {string} organizationId - Organization ID
 * @param {string} userId - User ID
 * @param {Response} res - Express response
 * @returns {Promise<string[]|null>} Array of roles or null (with error response sent)
 * 
 * @example
 * router.post('/api/models', async (req, res, next) => {
 *   const session = await ensureAuthenticated(req, res);
 *   if (!session) return;
 *   
 *   const pool = getPool();
 *   const { organizationId } = req.body;
 *   
 *   const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
 *   if (!roles) return; // Error response already sent (403 or 400)
 *   
 *   // User is admin or owner, continue with privileged operation
 *   // roles array contains ['owner'], ['admin'], or ['owner', 'admin']
 * });
 */
export async function ensureOrgAdmin(pool, organizationId, userId, res) {
  if (!organizationId) {
    res.status(400).json({ error: 'organizationId is required' });
    return null;
  }

  const memberResult = await pool.query(
    'SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2',
    [organizationId, userId],
  );

  if (memberResult.rows.length === 0) {
    res.status(403).json({ error: 'Forbidden: user is not a member of the organization' });
    return null;
  }

  const roleValue = memberResult.rows[0].role;
  const roles = Array.isArray(roleValue)
    ? roleValue
    : typeof roleValue === 'string'
      ? [roleValue]
      : [];

  if (!roles.includes('owner') && !roles.includes('admin')) {
    res.status(403).json({ error: 'Forbidden: admin or owner role required' });
    return null;
  }

  return roles;
}

/**
 * Validates that a team belongs to the specified organization
 * Performs database lookup to ensure team-org relationship
 * 
 * @param {Pool} pool - Database connection pool
 * @param {string} organizationId - Organization ID
 * @param {string} teamId - Team ID to validate
 * @returns {Promise<boolean>} True if valid (or teamId is null), false otherwise
 * 
 * @example
 * const isValid = await validateTeamBelongsToOrg(pool, orgId, teamId);
 * 
 * if (!isValid) {
 *   return res.status(404).json({ 
 *     error: 'Team not found in organization' 
 *   });
 * }
 * 
 * // Team is valid, continue with operation
 */
export async function validateTeamBelongsToOrg(pool, organizationId, teamId) {
  if (!teamId) {
    return true;
  }

  const teamResult = await pool.query(
    'SELECT id FROM team WHERE id = $1 AND "organizationId" = $2',
    [teamId, organizationId],
  );

  return teamResult.rows.length > 0;
}

