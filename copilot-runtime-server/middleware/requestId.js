/**
 * Request ID Middleware
 * 
 * Generates and attaches a unique ID to each request for correlation
 * and debugging across logs, errors, and responses.
 */

/**
 * Generate a unique request ID
 * 
 * Format: rt_<timestamp>_<random>
 * Example: rt_1763844236677_zuw4ye
 * 
 * @returns {string} Unique request ID
 */
export function generateRequestId() {
  return `rt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Middleware to attach request ID to response locals
 * 
 * The request ID can be accessed throughout the request lifecycle via:
 * - `res.locals.reqId` in middleware and route handlers
 * - Included in error responses and logs for request tracing
 * 
 * Should be one of the first middleware in the chain.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
export function requestIdMiddleware(req, res, next) {
  res.locals.reqId = generateRequestId();
  next();
}

