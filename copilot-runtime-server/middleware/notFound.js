/**
 * Not Found handler middleware (JSON response)
 */

export function notFoundMiddleware(req, res) {
  const reqId = res.locals?.reqId;
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


