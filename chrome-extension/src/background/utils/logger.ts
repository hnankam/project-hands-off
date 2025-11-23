/**
 * @fileoverview Logging utilities for Background Service Worker
 * 
 * Provides consistent logging with timestamps and debug mode control.
 * 
 * @module background/utils/logger
 */

import { DEBUG } from '../config/index.js';

/**
 * Generate timestamp for logs
 * @returns ISO timestamp without date (just time)
 */
const ts = (): string => {
  return `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
};

/**
 * Log a debug message (only if DEBUG is enabled)
 * @param args - Arguments to log
 */
export const log = (...args: any[]): void => {
  if (DEBUG) {
    console.log(ts(), ...args);
  }
};

/**
 * Log an error message (always logged, regardless of DEBUG mode)
 * @param args - Arguments to log
 */
export const logError = (...args: any[]): void => {
  console.error(ts(), ...args);
};

/**
 * Log a warning message (only if DEBUG is enabled)
 * @param args - Arguments to log
 */
export const logWarn = (...args: any[]): void => {
  if (DEBUG) {
    console.warn(ts(), ...args);
  }
};

/**
 * Log an info message (only if DEBUG is enabled)
 * @param args - Arguments to log
 */
export const logInfo = (...args: any[]): void => {
  if (DEBUG) {
    console.info(ts(), ...args);
  }
};

/**
 * Logger object for convenience
 * Provides a unified interface for logging
 */
export const logger = {
  debug: log,
  info: logInfo,
  warn: logWarn,
  error: logError
};

