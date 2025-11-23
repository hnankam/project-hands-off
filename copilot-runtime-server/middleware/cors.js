/**
 * CORS Middleware Configuration
 * 
 * Configures Cross-Origin Resource Sharing (CORS) for the application.
 * Supports Chrome extensions, localhost, and configured production origins.
 */

import cors from 'cors';
import { DEBUG, ALLOWED_ORIGINS, IS_DEVELOPMENT } from '../config/index.js';

/**
 * Create CORS middleware with dynamic origin validation
 * 
 * Allows:
 * - Chrome extensions (always, for extension support)
 * - Localhost (for development)
 * - Configured origins from ALLOWED_ORIGINS environment variable
 * - Same-origin requests (no origin header)
 * 
 * @returns {Function} Configured CORS middleware
 */
export function createCorsMiddleware() {
  return cors({
    origin(origin, callback) {
      // Allow requests with no origin (same-origin, Postman, curl, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      // Always allow Chrome extensions (this is a Chrome extension compatible app)
      if (origin.startsWith('chrome-extension://')) {
        return callback(null, true);
      }
      
      // Allow localhost and 127.0.0.1 in development
      if (IS_DEVELOPMENT && (
        origin.startsWith('http://localhost') || 
        origin.startsWith('https://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('https://127.0.0.1')
      )) {
        return callback(null, true);
      }
      
      // Allow explicitly configured origins
      if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      
      return callback(new Error(`CORS: Origin not allowed: ${origin}`), false);
    },
    
    // Allow credentials (cookies, authorization headers)
    credentials: true,
    
    // Headers that should be exposed to the client
    exposedHeaders: ['set-cookie', 'x-request-id'],
    
    // Headers that clients are allowed to send
    // Note: HTTP headers are case-insensitive, but Express.js normalizes them to lowercase
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cookie',
      'x-request-id',
      'x-copilot-agent-type',
      'x-copilot-model-type',
      'x-copilot-session-id',
      'x-copilot-organization-id',
      'x-copilot-team-id',
      'x-copilot-thread-id',
      'x-copilot-user-id',
    ],
    
    // HTTP methods allowed for CORS requests
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    
    // Cache preflight requests for 24 hours
    maxAge: 86400,
    
    // Always respond to OPTIONS requests successfully
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
}

