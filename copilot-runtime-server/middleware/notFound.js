/**
 * Not Found Handler Middleware
 * 
 * Handles all requests that don't match any defined routes.
 * Returns a consistent JSON 404 error response.
 */

/**
 * 404 handler middleware
 * 
 * Should be registered after all other routes to catch unmatched requests.
 * Returns a JSON response with the request path and method for debugging.
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export function notFoundMiddleware(req, res) {
  const reqId = res.locals?.reqId || 'unknown';

  log(`[Not Found] ${req.method} ${req.originalUrl}: JSON=${JSON.stringify(req)}`);
  
  res.status(404).json({
    error: {
      message: 'Not Found',
      code: 'NOT_FOUND',
      status: 404,
      requestId: reqId,
      path: req.originalUrl,
      method: req.method,
    }
  });
}


