import { debug as baseDebug } from '@extension/shared';

// Timestamped debug wrappers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: any[]) => baseDebug.log(ts(), ...args),
  warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
  error: (...args: any[]) => baseDebug.error(ts(), ...args),
} as const;

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
interface CleanupUIResult {
  status: 'success' | 'error';
  message: string;
  cleanupInfo?: {
    elementsRemoved: string[];
    stateCleared: boolean;
    totalElementsRemoved: number;
  };
}

/**
 * Remove all extension UI elements and styles from the page
 * Cleans up:
 * - Cursor indicator and styles
 * - Click ripple animation styles
 * - Drag & drop animation styles
 * - Global cursor state and auto-hide timers
 * @returns Promise with status and message object
 */
export async function handleCleanupExtensionUI(): Promise<CleanupUIResult> {
  try {
    debug.log('[RemoveCursor] Removing all extension UI elements');

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return {
        status: 'error',
        message: 'Unable to access current tab',
      };
    }

    // Execute script to remove all extension UI elements and clean up state (with try/catch inside page)
    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (): CleanupResult => {
        try {
          const elementsRemoved: string[] = [];
          let stateCleared = false;

          const byIdRemove = (id: string, label: string) => {
            const el = document.getElementById(id);
            if (el) {
              el.remove();
              elementsRemoved.push(label);
            }
          };

          // 1-3: Indicators and styles
          byIdRemove('__copilot_cursor_indicator__', 'cursor indicator');
          byIdRemove('__copilot_cursor_style__', 'cursor styles');
          byIdRemove('__copilot_click_ripple_style__', 'click ripple styles');

          // 4: Drag & drop visuals
          byIdRemove('__copilot_drag_indicator__', 'drag indicator');
          byIdRemove('__copilot_drag_path__', 'drag path');
          byIdRemove('__copilot_drop_effect__', 'drop effect');
          byIdRemove('__copilot_drag_drop_style__', 'drag & drop styles');

          const resetEls = (selector: string, label: string, attrs: string[]) => {
            const nodes = document.querySelectorAll(selector);
            if (nodes.length > 0) {
              nodes.forEach(el => {
                const he = el as HTMLElement;
                he.style.outline = '';
                he.style.outlineOffset = '';
                he.style.backgroundColor = '';
                he.style.cursor = '';
                attrs.forEach(a => he.removeAttribute(a));
              });
              elementsRemoved.push(`${nodes.length} ${label}`);
            }
          };
          resetEls('[data-copilot-drag-source="true"]', 'drag source element(s)', ['data-copilot-drag-source']);
          resetEls('[data-copilot-drag-target="true"]', 'drag target element(s)', ['data-copilot-drag-target']);

          // 5-8: Scroll & feedback artifacts
          byIdRemove('__copilot_scroll_style__', 'scroll styles');
          document.querySelectorAll('div[style*="scrollFade"]').forEach(el => el.remove());
          document.querySelectorAll('div[style*="clickRipple"]').forEach(el => el.remove());
          document.querySelectorAll('div[style*="dropRipple"]').forEach(el => el.remove());

          // 9: Clear global state
          if ((window as any).__copilotCursorState__) {
            const state = (window as any).__copilotCursorState__;
            if (state.hideTimeout) clearTimeout(state.hideTimeout);
            delete (window as any).__copilotCursorState__;
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
            message: (e as Error).message || 'Cleanup failed',
            elementsRemoved: [],
            stateCleared: false,
          };
        }
      },
    });

    // Add a safety timeout to avoid hanging
    const results = await Promise.race([
      execPromise,
      new Promise<any>(resolve =>
        setTimeout(
          () => resolve([{ result: { success: false, message: 'Timeout', elementsRemoved: [], stateCleared: false } }]),
          5000,
        ),
      ),
    ]);

    // Handle the actual result from the script execution
    const result = results[0]?.result;

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
    } else {
      return {
        status: 'error',
        message: 'Failed to clean up extension UI elements',
      };
    }
  } catch (error) {
    debug.error('[RemoveCursor] Error cleaning up UI:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
