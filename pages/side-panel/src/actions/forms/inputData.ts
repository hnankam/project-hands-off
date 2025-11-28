/**
 * Input Data - Backward Compatibility Wrapper
 *
 * Provides backward-compatible function signatures for the input dispatcher.
 * Preferred usage: handleInputData(selector, value, { clearFirst, moveCursor, ...options })
 */

import { debug as baseDebug } from '@extension/shared';
import { handleInputData as newHandleInputData } from './inputDispatcher';
import { InputDataResult, InputHandlerOptions } from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for consistent logging */
const LOG_PREFIX = '[InputData]';

// ============================================================================
// DEBUG HELPERS
// ============================================================================

const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: unknown[]) => baseDebug.log(ts(), ...args),
  warn: (...args: unknown[]) => baseDebug.warn(ts(), ...args),
  error: (...args: unknown[]) => baseDebug.error(ts(), ...args),
} as const;

// ============================================================================
// FUNCTION OVERLOADS
// ============================================================================

/**
 * Handle input data with options object (preferred)
 */
export async function handleInputData(
  cssSelector: string,
  value: string,
  options?: InputHandlerOptions,
): Promise<InputDataResult>;

/**
 * Handle input data with legacy boolean parameters
 * @deprecated Use options object instead
 */
export async function handleInputData(
  cssSelector: string,
  value: string,
  clearFirst?: boolean,
  moveCursor?: boolean,
): Promise<InputDataResult>;

/**
 * Implementation that handles both signatures
 */
export async function handleInputData(
  cssSelector: string,
  value: string,
  third?: boolean | InputHandlerOptions,
  fourth?: boolean,
): Promise<InputDataResult> {
  try {
    // Normalize arguments
    let normalizedClearFirst = true;
    let normalizedMoveCursor = true;

    if (typeof third === 'object' && third !== null) {
      // Options object signature
      normalizedClearFirst = third.clearFirst !== false;
      normalizedMoveCursor = third.moveCursor !== false;
    } else {
      // Legacy boolean signature
      normalizedClearFirst = third !== false;
      normalizedMoveCursor = fourth !== false;
    }

    debug.log(LOG_PREFIX, 'Forwarding to dispatcher:', {
      selector: cssSelector.substring(0, 50),
      clearFirst: normalizedClearFirst,
      moveCursor: normalizedMoveCursor,
    });

    return await newHandleInputData(cssSelector, value, normalizedClearFirst, normalizedMoveCursor);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    debug.error(LOG_PREFIX, 'Failed:', errorMessage);
    return {
      status: 'error',
      message: `Failed to input data: ${errorMessage}`,
    };
  }
}
