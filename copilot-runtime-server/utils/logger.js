/**
 * Logging utilities
 */

import { DEBUG } from '../config/index.js';

// Timestamp helper
const ts = () => `[${new Date().toISOString()}]`;

// Log levels
export const log = (...args) => DEBUG && console.log(ts(), ...args);
export const warn = (...args) => console.warn(ts(), ...args);
export const error = (...args) => console.error(ts(), ...args);
export const info = (...args) => console.log(ts(), ...args);

// Request logger
export function logRequest(reqId, message, details = {}) {
  if (!DEBUG) return;
  
  console.log(ts(), `[${reqId}]`, message);
  
  if (Object.keys(details).length > 0) {
    console.log(ts(), `[${reqId}]`, 'Details:', JSON.stringify(details, null, 2));
  }
}

// Error logger
export function logError(reqId, message, err) {
  console.error(ts(), `[${reqId}]`, 'ERROR:', message);
  
  if (err) {
    console.error(ts(), `[${reqId}]`, 'Message:', err.message);
    
    if (DEBUG && err.stack) {
      console.error(ts(), `[${reqId}]`, 'Stack:', err.stack);
    }
  }
}

