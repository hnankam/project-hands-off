import { debug as baseDebug } from '@extension/shared';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Timeout for cleanup operation in milliseconds */
const CLEANUP_TIMEOUT_MS = 5000;

/** Extension element IDs to remove */
const EXTENSION_ELEMENT_IDS = [
  { id: '__copilot_cursor_indicator__', label: 'cursor indicator' },
  { id: '__copilot_cursor_style__', label: 'cursor styles' },
  { id: '__copilot_click_ripple_style__', label: 'click ripple styles' },
  { id: '__copilot_drag_indicator__', label: 'drag indicator' },
  { id: '__copilot_drag_path__', label: 'drag path' },
  { id: '__copilot_drop_effect__', label: 'drop effect' },
  { id: '__copilot_drag_drop_style__', label: 'drag & drop styles' },
  { id: '__copilot_scroll_style__', label: 'scroll styles' },
] as const;

/** Data attributes to clean up */
const DATA_ATTRIBUTES = {
  dragSource: 'data-copilot-drag-source',
  dragTarget: 'data-copilot-drag-target',
} as const;

/** Log prefix for cleanup actions */
const LOG_PREFIX = '[CleanupUI]';

// ============================================================================
// TYPES
// ============================================================================

/** Timestamp helper for consistent logging */
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

/** Timestamped debug wrappers */
const debug = {
  log: (...args: unknown[]) => baseDebug.log(ts(), ...args),
  warn: (...args: unknown[]) => baseDebug.warn(ts(), ...args),
  error: (...args: unknown[]) => baseDebug.error(ts(), ...args),
} as const;

/**
 * Global cursor state stored on window
 */
interface CopilotCursorState {
  hideTimeout?: ReturnType<typeof setTimeout>;
  [key: string]: unknown;
}

/**
 * Extended window with cursor state
 */
interface WindowWithCursorState extends Window {
  __copilotCursorState__?: CopilotCursorState;
}

/**
 * Internal result type for cleanup operation (used by script)
 */
interface CleanupResult {
  success: boolean;
  message: string;
  elementsRemoved: string[];
  stateCleared: boolean;
}

/**
 * Result type for cleanup extension UI operation
 */
export interface CleanupUIResult {
  status: 'success' | 'error';
  message: string;
  cleanupInfo?: {
    elementsRemoved: string[];
    stateCleared: boolean;
    totalElementsRemoved: number;
  };
}

/**
 * Script execution result from chrome.scripting.executeScript
 */
interface ScriptExecutionResult {
  result?: CleanupResult;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Type guard to check if script result is valid
 */
function isValidScriptResult(
  results: ScriptExecutionResult[] | undefined
): results is [ScriptExecutionResult, ...ScriptExecutionResult[]] {
  return Array.isArray(results) && results.length > 0 && results[0]?.result !== undefined;
}

/**
 * Create a timeout promise for cleanup operation
 */
function createTimeoutPromise(): Promise<ScriptExecutionResult[]> {
  return new Promise((resolve) =>
    setTimeout(
      () =>
        resolve([
          {
            result: {
              success: false,
              message: 'Cleanup operation timed out',
              elementsRemoved: [],
              stateCleared: false,
            },
          },
        ]),
      CLEANUP_TIMEOUT_MS
    )
  );
}

/**
 * Get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Remove all extension UI elements and styles from the page
 *
 * Cleans up:
 * - Cursor indicator and styles
 * - Click ripple animation styles
 * - Drag & drop animation styles
 * - Global cursor state and auto-hide timers
 *
 * @returns Promise with status and message object
 */
export async function handleCleanupExtensionUI(): Promise<CleanupUIResult> {
  try {
    debug.log(LOG_PREFIX, 'Removing all extension UI elements');

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;

    if (!tabId) {
      return {
        status: 'error',
        message: 'Unable to access current tab',
      };
    }

    // Execute script to remove all extension UI elements and clean up state
    const execPromise = chrome.scripting.executeScript({
      target: { tabId },
      func: (): CleanupResult => {
        try {
          const elementsRemoved: string[] = [];
          let stateCleared = false;

          // Helper to remove element by ID
          const removeById = (id: string, label: string): void => {
            const el = document.getElementById(id);
            if (el) {
              el.remove();
              elementsRemoved.push(label);
            }
          };

          // Helper to reset elements matching selector
          const resetElements = (selector: string, label: string, attrs: string[]): void => {
            const nodes = document.querySelectorAll(selector);
            if (nodes.length > 0) {
              nodes.forEach((el) => {
                const htmlEl = el as HTMLElement;
                htmlEl.style.outline = '';
                htmlEl.style.outlineOffset = '';
                htmlEl.style.backgroundColor = '';
                htmlEl.style.cursor = '';
                attrs.forEach((attr) => htmlEl.removeAttribute(attr));
              });
              elementsRemoved.push(`${nodes.length} ${label}`);
            }
          };

          // Remove extension elements by ID
          // Note: IDs are defined inline here because this runs in page context
          const elementIds = [
            { id: '__copilot_cursor_indicator__', label: 'cursor indicator' },
            { id: '__copilot_cursor_style__', label: 'cursor styles' },
            { id: '__copilot_click_ripple_style__', label: 'click ripple styles' },
            { id: '__copilot_drag_indicator__', label: 'drag indicator' },
            { id: '__copilot_drag_path__', label: 'drag path' },
            { id: '__copilot_drop_effect__', label: 'drop effect' },
            { id: '__copilot_drag_drop_style__', label: 'drag & drop styles' },
            { id: '__copilot_scroll_style__', label: 'scroll styles' },
          ];

          elementIds.forEach(({ id, label }) => removeById(id, label));

          // Reset drag source/target elements
          resetElements('[data-copilot-drag-source="true"]', 'drag source element(s)', ['data-copilot-drag-source']);
          resetElements('[data-copilot-drag-target="true"]', 'drag target element(s)', ['data-copilot-drag-target']);

          // Remove animation artifacts
          document.querySelectorAll('div[style*="scrollFade"]').forEach((el) => el.remove());
          document.querySelectorAll('div[style*="clickRipple"]').forEach((el) => el.remove());
          document.querySelectorAll('div[style*="dropRipple"]').forEach((el) => el.remove());

          // Clear global cursor state
          const win = window as WindowWithCursorState;
          if (win.__copilotCursorState__) {
            const state = win.__copilotCursorState__;
            if (state.hideTimeout) {
              clearTimeout(state.hideTimeout);
            }
            delete win.__copilotCursorState__;
            stateCleared = true;
            elementsRemoved.push('cursor state');
          }

          const message =
            elementsRemoved.length > 0
              ? `Cleaned up ${elementsRemoved.length} extension UI element(s)`
              : 'No extension UI elements found';

          return { success: true, message, elementsRemoved, stateCleared };
        } catch (e) {
          return {
            success: false,
            message: e instanceof Error ? e.message : 'Cleanup failed',
            elementsRemoved: [],
            stateCleared: false,
          };
        }
      },
    });

    // Add a safety timeout to avoid hanging
    const results = await Promise.race([execPromise, createTimeoutPromise()]);

    // Handle the result from script execution
    if (!isValidScriptResult(results)) {
      return {
        status: 'error',
        message: 'Failed to execute cleanup script',
      };
    }

    const result = results[0].result;

    if (result?.success) {
      return {
        status: 'success',
        message: result.message,
        cleanupInfo: {
          elementsRemoved: result.elementsRemoved,
          stateCleared: result.stateCleared,
          totalElementsRemoved: result.elementsRemoved.length,
        },
      };
    }

    return {
      status: 'error',
      message: result?.message ?? 'Failed to clean up extension UI elements',
    };
  } catch (error) {
    debug.error(LOG_PREFIX, 'Error cleaning up UI:', getErrorMessage(error));
    return {
      status: 'error',
      message: `Error: ${getErrorMessage(error)}`,
    };
  }
}
