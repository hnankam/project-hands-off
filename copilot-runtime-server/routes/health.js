/**
 * Health Check Endpoint
 * 
 * Provides health and readiness status for the CopilotKit Runtime Server.
 * This endpoint is used by monitoring systems, load balancers, and orchestrators
 * (e.g., Kubernetes, Docker, AWS ELB) to determine if the service is healthy
 * and ready to accept traffic.
 * 
 * Status Definitions:
 * - "ok": Service is fully operational, database connection successful
 * - "degraded": Service is running but database connection failed
 * 
 * This endpoint should always return 200 OK even in degraded state,
 * as the service can still serve some requests (e.g., static content).
 * 
 * @module routes/health
 */

import { testConnection } from '../config/database.js';

/**
 * Health and readiness check route handler
 * 
 * Tests the database connection and returns the overall service health status.
 * This is a critical endpoint for infrastructure monitoring and orchestration.
 * 
 * **Response Codes:**
 * - 200 OK: Always returned (service is responding)
 * 
 * **Response Body:**
 * - status: "ok" | "degraded" - Overall service health
 * - db: boolean - Database connection status (true = connected, false = failed)
 * - message: string - Human-readable status message
 * - timestamp: string (ISO 8601) - Current server time
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>} JSON response with health status
 * 
 * @example
 * // Successful response (healthy)
 * {
 *   "status": "ok",
 *   "db": true,
 *   "message": "CopilotKit Runtime Server is running",
 *   "timestamp": "2025-11-23T10:30:00.000Z"
 * }
 * 
 * @example
 * // Degraded response (database unavailable)
 * {
 *   "status": "degraded",
 *   "db": false,
 *   "message": "CopilotKit Runtime Server is running",
 *   "timestamp": "2025-11-23T10:30:00.000Z"
 * }
 */
export async function healthCheckHandler(req, res) {
  let db = false;
  
  // Test database connection (non-blocking, fails silently)
  try {
    db = await testConnection();
  } catch (error) {
    // Silently catch database errors - we want to report degraded status, not fail
    // The error is already logged by testConnection() if DEBUG is enabled
  }
  
  // Always return 200 OK - the service is responding
  // Status field indicates actual health ("ok" vs "degraded")
  res.json({ 
    status: db ? 'ok' : 'degraded',  // Service health based on database connectivity
    db,                               // Explicit database connection status
    message: 'CopilotKit Runtime Server is running',
    timestamp: new Date().toISOString() // Current server time for clock sync verification
  });
}

