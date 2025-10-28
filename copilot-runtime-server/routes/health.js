/**
 * Health check endpoint
 */

/**
 * Health and readiness check route handler
 */
import { testConnection } from '../config/database.js';

export async function healthCheckHandler(req, res) {
  let db = false;
  try {
    db = await testConnection();
  } catch {}
  res.json({ 
    status: db ? 'ok' : 'degraded', 
    db,
    message: 'CopilotKit Runtime Server is running',
    timestamp: new Date().toISOString()
  });
}

