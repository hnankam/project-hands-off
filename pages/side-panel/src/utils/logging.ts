/**
 * ================================================================================
 * Logging Utilities
 * ================================================================================
 * 
 * Shared logging utilities for consistent timestamp formatting across the app.
 * 
 * @module logging
 * ================================================================================
 */

/**
 * Get current timestamp in HH:MM:SS.mmm format
 * @returns Formatted timestamp string in the format [HH:MM:SS.mmm]
 * 
 * @example
 * ```typescript
 * import { ts } from '../utils/logging';
 * console.log(ts(), 'My log message'); // [14:32:45.123] My log message
 * ```
 */
export const ts = (): string => {
  return `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
};

/**
 * Get ISO timestamp
 * @returns ISO 8601 formatted timestamp
 * 
 * @example
 * ```typescript
 * import { getISOTimestamp } from '../utils/logging';
 * console.log(getISOTimestamp()); // 2025-10-22T14:32:45.123Z
 * ```
 */
export const getISOTimestamp = (): string => {
  return new Date().toISOString();
};

/**
 * Format a log prefix with timestamp
 * @param prefix - Log prefix (e.g., '[Component]')
 * @returns Formatted prefix with timestamp
 * 
 * @example
 * ```typescript
 * import { withTimestamp } from '../utils/logging';
 * console.log(withTimestamp('[MyComponent]'), 'Message'); 
 * // [14:32:45.123] [MyComponent] Message
 * ```
 */
export const withTimestamp = (prefix: string): string => {
  return `${ts()} ${prefix}`;
};

