/**
 * Health check endpoint
 */

/**
 * Health check route handler
 */
export function healthCheckHandler(req, res) {
  res.json({ 
    status: 'ok', 
    message: 'CopilotKit Runtime Server is running',
    timestamp: new Date().toISOString()
  });
}

