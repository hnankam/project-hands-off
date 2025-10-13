/**
 * Debug utility for conditional logging
 * Logs are enabled by default for easier debugging
 * Can be disabled via localStorage.setItem('DEBUG_ENABLED', 'false')
 */

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development';

// Allow enabling debug logs via localStorage for production debugging
// Default to true for easier debugging
const isDebugEnabled = typeof window !== 'undefined' && 
  window.localStorage?.getItem('DEBUG_ENABLED') !== 'false'; // Changed: defaults to enabled

const shouldLog = isDevelopment || isDebugEnabled;

/**
 * Conditional console.log - logs by default (can be disabled with localStorage)
 * @param args - Any arguments to log
 */
export const debugLog = (...args: any[]): void => {
  if (shouldLog) {
    console.log(...args);
  }
};

/**
 * Conditional console.warn - warns by default (can be disabled with localStorage)
 * @param args - Any arguments to warn about
 */
export const debugWarn = (...args: any[]): void => {
  if (shouldLog) {
    console.warn(...args);
  }
};

/**
 * Always logs errors - errors should always be visible
 * @param args - Any arguments to log as errors
 */
export const debugError = (...args: any[]): void => {
  console.error(...args);
};

/**
 * Explicitly enable debug logging (already enabled by default)
 * Usage: enableDebugLogging()
 */
export const enableDebugLogging = (): void => {
  if (typeof window !== 'undefined') {
    window.localStorage?.removeItem('DEBUG_ENABLED'); // Remove to use default (enabled)
    console.log('✅ Debug logging enabled (default). Reload the page to see logs.');
  }
};

/**
 * Disable debug logging
 * Usage: disableDebugLogging()
 */
export const disableDebugLogging = (): void => {
  if (typeof window !== 'undefined') {
    window.localStorage?.setItem('DEBUG_ENABLED', 'false');
    console.log('✅ Debug logging disabled. Reload the page.');
  }
};

// Export as default object for convenience
export const debug = {
  log: debugLog,
  warn: debugWarn,
  error: debugError,
  enable: enableDebugLogging,
  disable: disableDebugLogging,
};

export default debug;

