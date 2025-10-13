import { debug } from '@extension/shared';

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
        message: 'Unable to access current tab'
      };
    }

    // Execute script to remove all extension UI elements and clean up state
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (): CleanupResult => {
        const elementsRemoved: string[] = [];
        let stateCleared = false;
        
        // 1. Remove cursor indicator
        const cursor = document.getElementById('__copilot_cursor_indicator__');
        if (cursor) {
          cursor.remove();
          elementsRemoved.push('cursor indicator');
        }
        
        // 2. Remove cursor animation styles
        const cursorStyle = document.getElementById('__copilot_cursor_style__');
        if (cursorStyle) {
          cursorStyle.remove();
          elementsRemoved.push('cursor styles');
        }
        
        // 3. Remove click ripple animation styles
        const clickRippleStyle = document.getElementById('__copilot_click_ripple_style__');
        if (clickRippleStyle) {
          clickRippleStyle.remove();
          elementsRemoved.push('click ripple styles');
        }
        
        // 4. Remove drag & drop visual elements
        const dragIndicator = document.getElementById('__copilot_drag_indicator__');
        if (dragIndicator) {
          dragIndicator.remove();
          elementsRemoved.push('drag indicator');
        }
        
        const dragPath = document.getElementById('__copilot_drag_path__');
        if (dragPath) {
          dragPath.remove();
          elementsRemoved.push('drag path');
        }
        
        const dropEffect = document.getElementById('__copilot_drop_effect__');
        if (dropEffect) {
          dropEffect.remove();
          elementsRemoved.push('drop effect');
        }
        
        // Remove drag & drop animation styles
        const dragDropStyle = document.getElementById('__copilot_drag_drop_style__');
        if (dragDropStyle) {
          dragDropStyle.remove();
          elementsRemoved.push('drag & drop styles');
        }
        
        // Remove drag & drop element styling
        const dragSources = document.querySelectorAll('[data-copilot-drag-source="true"]');
        if (dragSources.length > 0) {
          dragSources.forEach(el => {
            (el as HTMLElement).style.outline = '';
            (el as HTMLElement).style.outlineOffset = '';
            (el as HTMLElement).style.backgroundColor = '';
            (el as HTMLElement).style.cursor = '';
            el.removeAttribute('data-copilot-drag-source');
          });
          elementsRemoved.push(`${dragSources.length} drag source element(s)`);
        }
        
        const dragTargets = document.querySelectorAll('[data-copilot-drag-target="true"]');
        if (dragTargets.length > 0) {
          dragTargets.forEach(el => {
            (el as HTMLElement).style.outline = '';
            (el as HTMLElement).style.outlineOffset = '';
            (el as HTMLElement).style.backgroundColor = '';
            el.removeAttribute('data-copilot-drag-target');
          });
          elementsRemoved.push(`${dragTargets.length} drag target element(s)`);
        }
        
        // 5. Remove scroll animation styles
        const scrollStyle = document.getElementById('__copilot_scroll_style__');
        if (scrollStyle) {
          scrollStyle.remove();
          elementsRemoved.push('scroll styles');
        }
        
        // 6. Remove any orphaned scroll indicators
        const scrollIndicators = document.querySelectorAll('div[style*="scrollFade"]');
        if (scrollIndicators.length > 0) {
          scrollIndicators.forEach(el => el.remove());
          elementsRemoved.push(`${scrollIndicators.length} scroll indicator(s)`);
        }
        
        // 7. Remove any orphaned click feedback elements (in case they didn't auto-cleanup)
        const clickFeedbacks = document.querySelectorAll('div[style*="clickRipple"]');
        if (clickFeedbacks.length > 0) {
          clickFeedbacks.forEach(el => el.remove());
          elementsRemoved.push(`${clickFeedbacks.length} click feedback element(s)`);
        }
        
        // 8. Remove any orphaned drop effect elements
        const dropEffects = document.querySelectorAll('div[style*="dropRipple"]');
        if (dropEffects.length > 0) {
          dropEffects.forEach(el => el.remove());
          elementsRemoved.push(`${dropEffects.length} drop effect element(s)`);
        }
        
        // 9. CRITICAL: Clear global cursor state to prevent timer leaks
        if ((window as any).__copilotCursorState__) {
          const state = (window as any).__copilotCursorState__;
          
          // Clear auto-hide timer to prevent memory leak
          if (state.hideTimeout) {
            clearTimeout(state.hideTimeout);
          }
          
          // Delete the global state object
          delete (window as any).__copilotCursorState__;
          stateCleared = true;
          elementsRemoved.push('cursor state');
        }
        
        const message = elementsRemoved.length > 0 
          ? `Cleaned up ${elementsRemoved.length} extension UI element(s)`
          : 'No extension UI elements found';
        
        return {
          success: true,
          message,
          elementsRemoved,
          stateCleared
        };
      }
    });

    // Handle the actual result from the script execution
    const result = results[0]?.result;
    
    if (result?.success) {
      return {
        status: 'success',
        message: result.message,
        cleanupInfo: {
          elementsRemoved: result.elementsRemoved,
          stateCleared: result.stateCleared,
          totalElementsRemoved: result.elementsRemoved.length
        }
      };
    } else {
      return {
        status: 'error',
        message: 'Failed to clean up extension UI elements'
      };
    }
  } catch (error) {
    debug.error('[RemoveCursor] Error cleaning up UI:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

