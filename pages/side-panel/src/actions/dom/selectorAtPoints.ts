/**
 * Selector at Points Actions
 *
 * Actions for getting CSS selectors for elements at specific viewport coordinates.
 */

import { debug as baseDebug } from '@extension/shared';
import { assertExtensionContext } from '@src/utils/extensionOnly';
import { CSS_ESCAPE_POLYFILL, createBuildSelectorCode } from './shadowDOMHelper';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for consistent logging */
const LOG_PREFIX = '[SelectorAtPoint]';

/** Timeout for script execution in ms */
const SCRIPT_TIMEOUT_MS = 8000;

/** Maximum length for text snippets */
const TEXT_SNIPPET_LENGTH = 60;

/** Maximum classes to include in selector */
const MAX_SELECTOR_CLASSES = 3;

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
// TYPES
// ============================================================================

/** Element info returned from content scripts */
interface ElementInfo {
  tag: string;
  id: string | null;
  classes: string[];
  textSnippet: string;
}

/** Result for single point selector lookup */
export interface SelectorAtPointResult {
  status: 'success' | 'error';
  message: string;
  selector?: string;
  elementInfo?: ElementInfo;
}

/** Point coordinates */
export interface Point {
  x: number;
  y: number;
}

/** Result item for batch selector lookup */
export interface BatchSelectorResultItem extends SelectorAtPointResult {
  point: Point;
}

/** Result for batch selector lookup */
export interface BatchSelectorAtPointsResult {
  status: 'success' | 'error';
  message: string;
  results: BatchSelectorResultItem[];
}

/** Script execution result shape */
interface ScriptResult {
  success: boolean;
  message: string;
  selector?: string;
  elementInfo?: ElementInfo;
  point?: Point;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Create a timeout promise for Promise.race
 */
function createTimeoutPromise<T>(ms: number, fallbackValue: T): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(fallbackValue), ms));
}

/**
 * Type guard for valid script result
 */
function isValidScriptResult(result: unknown): result is { result: ScriptResult } | { result: ScriptResult[] } {
  return result !== null && typeof result === 'object' && 'result' in result && result.result !== null;
}

// ============================================================================
// MAIN HANDLERS
// ============================================================================

/**
 * Get CSS selector for element at a specific viewport point
 *
 * @param x - X coordinate in viewport
 * @param y - Y coordinate in viewport
 * @returns Promise with selector and element info
 */
export async function handleGetSelectorAtPoint(x: number, y: number): Promise<SelectorAtPointResult> {
  try {
    assertExtensionContext('Selector at point');
    debug.log(LOG_PREFIX, 'Request:', { x, y });

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return { status: 'error', message: 'Unable to access current tab' };
    }

    // Build the content script code with helpers
    const helperCode = CSS_ESCAPE_POLYFILL + createBuildSelectorCode(MAX_SELECTOR_CLASSES, TEXT_SNIPPET_LENGTH);

    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (px: number, py: number, helpers: string) => {
        // Inject helpers
        // eslint-disable-next-line no-eval
        eval(helpers);

        // Access injected functions
        const buildSelector = (window as unknown as { buildSelector: (el: Element) => string }).buildSelector;
        const getElementInfo = (window as unknown as { getElementInfo: (el: Element) => unknown }).getElementInfo;

        const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
        const vx = clamp(px, 0, window.innerWidth - 1);
        const vy = clamp(py, 0, window.innerHeight - 1);

        const el = document.elementFromPoint(vx, vy) as Element | null;
        if (!el) {
          return { success: false, message: 'No element at given point' };
        }

        const selector = buildSelector(el);
        const info = getElementInfo(el);

        return { success: true, message: 'Selector generated', selector, elementInfo: info };
      },
      args: [x, y, helperCode] as [number, number, string],
    });

    const timeoutFallback = [{ result: { success: false, message: 'Timeout generating selector' } }];
    const results = await Promise.race([execPromise, createTimeoutPromise(SCRIPT_TIMEOUT_MS, timeoutFallback)]);

    debug.log(LOG_PREFIX, 'Script execution results:', results);

    if (results && results[0] && isValidScriptResult(results[0])) {
      const result = results[0].result as ScriptResult;
      if (result.success) {
        return {
          status: 'success',
          message: result.message,
          selector: result.selector,
          elementInfo: result.elementInfo,
        };
      }
      return { status: 'error', message: result.message };
    }

    return { status: 'error', message: 'No result from script' };
  } catch (error) {
    debug.error(LOG_PREFIX, 'Error:', error);
    return { status: 'error', message: `Error: ${getErrorMessage(error)}` };
  }
}

/**
 * Get CSS selectors for elements at multiple viewport points
 *
 * @param points - Array of {x, y} coordinates
 * @returns Promise with selectors and element info for each point
 */
export async function handleGetSelectorsAtPoints(points: Point[]): Promise<BatchSelectorAtPointsResult> {
  try {
    assertExtensionContext('Selectors at points');
    debug.log(LOG_PREFIX + 's', 'Request:', points);

    if (!Array.isArray(points) || points.length === 0) {
      return { status: 'error', message: 'No points provided', results: [] };
    }

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return { status: 'error', message: 'Unable to access current tab', results: [] };
    }

    // Build the content script code with helpers
    const helperCode = CSS_ESCAPE_POLYFILL + createBuildSelectorCode(MAX_SELECTOR_CLASSES, TEXT_SNIPPET_LENGTH);

    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (pts: { x: number; y: number }[], helpers: string) => {
        // Inject helpers
        // eslint-disable-next-line no-eval
        eval(helpers);

        // Access injected functions
        const buildSelector = (window as unknown as { buildSelector: (el: Element) => string }).buildSelector;
        const getElementInfo = (window as unknown as { getElementInfo: (el: Element) => unknown }).getElementInfo;

        const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

        const results = pts.map(p => {
          const vx = clamp(p.x, 0, window.innerWidth - 1);
          const vy = clamp(p.y, 0, window.innerHeight - 1);
          const el = document.elementFromPoint(vx, vy) as Element | null;

          if (!el) {
            return { success: false, message: 'No element at given point', point: { x: p.x, y: p.y } };
          }

          const selector = buildSelector(el);
          const info = getElementInfo(el);

          return {
            success: true,
            message: 'Selector generated',
            selector,
            elementInfo: info,
            point: { x: p.x, y: p.y },
          };
        });

        return results;
      },
      args: [points, helperCode] as [{ x: number; y: number }[], string],
    });

    const timeoutFallback = [{ result: [] as ScriptResult[] }];
    const results = await Promise.race([execPromise, createTimeoutPromise(SCRIPT_TIMEOUT_MS, timeoutFallback)]);

    const payload = (results && results[0]?.result) || [];
    const mapped: BatchSelectorResultItem[] = (payload as ScriptResult[]).map(r => {
      if (r && r.success) {
        return {
          status: 'success' as const,
          message: r.message,
          selector: r.selector,
          elementInfo: r.elementInfo,
          point: r.point ?? { x: 0, y: 0 },
        };
      }
      return {
        status: 'error' as const,
        message: r?.message || 'Unknown error',
        point: r?.point ?? { x: 0, y: 0 },
      };
    });

    return { status: 'success', message: 'Processed points', results: mapped };
  } catch (error) {
    debug.error(LOG_PREFIX + 's', 'Error:', error);
    return {
      status: 'error',
      message: `Error: ${getErrorMessage(error)}`,
      results: [],
    };
  }
}
