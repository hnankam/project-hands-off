/**
 * CORS middleware configuration
 */

import cors from 'cors';
import { DEBUG, ALLOWED_ORIGINS } from '../config/index.js';

/**
 * Create CORS middleware
 * Production-friendly: allow configured origins; allow chrome-extension in DEBUG only
 */
export function createCorsMiddleware() {
  return cors({
    origin(origin, callback) {
      // Same-origin/extension requests
      if (!origin) return callback(null, true);
      
      // Always allow chrome extensions (this is a Chrome extension app)
      if (origin.startsWith('chrome-extension://')) {
        return callback(null, true);
      }
      
      // Allow localhost
      if (origin.startsWith('http://localhost') || origin.startsWith('https://localhost')) {
        return callback(null, true);
      }
      
      // Allow configured origins
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      
      return callback(new Error('CORS: Origin not allowed'), false);
    },
    credentials: true,
    exposedHeaders: ['set-cookie'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });
}

