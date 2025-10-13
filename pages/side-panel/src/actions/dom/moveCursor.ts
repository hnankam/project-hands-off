import { debug } from '@extension/shared';

/**
 * Result type for move cursor operation
 */
interface MoveCursorResult {
  status: 'success' | 'error';
  message: string;
  elementInfo?: {
    tag: string;
    text: string;
    id: string;
    className: string;
    foundInShadowDOM: boolean;
    shadowHost: string | null;
  };
}

/**
 * Moves the cursor to a specific element on the current web page
 * @param cssSelector - A valid CSS selector string from the page HTML content
 * @returns Promise with status and message object
 */
export async function handleMoveCursorToElement(cssSelector: string): Promise<MoveCursorResult> {
  try {
    debug.log('[MoveCursor] Moving cursor to element with selector:', cssSelector);
    
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return {
        status: 'error',
        message: 'Unable to access current tab'
      };
    }

    // Execute script in content page to find and highlight the element
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (selector: string): any => {
        try {
          // First try to find element in main DOM
          let element = document.querySelector(selector);
          let foundInShadowDOM = false;
          let shadowHostInfo = '';
          
          // If not found in main DOM, search in Shadow DOM
          if (!element) {
            console.log('[MoveCursor] Element not found in main DOM, searching Shadow DOM...');
            
            // Search through all shadow roots with early exit
            for (const hostElement of Array.from(document.querySelectorAll('*'))) {
              if (hostElement.shadowRoot && !element) {
                try {
                  const shadowElement = hostElement.shadowRoot.querySelector(selector);
                  if (shadowElement) {
                    element = shadowElement;
                    foundInShadowDOM = true;
                    shadowHostInfo = `${hostElement.tagName}${hostElement.id ? '#' + hostElement.id : ''}${hostElement.className ? '.' + hostElement.className.split(' ')[0] : ''}`;
                    console.log('[MoveCursor] Found element in Shadow DOM:', shadowHostInfo);
                    break; // Early exit - stop searching once element is found
                  }
                } catch (shadowError) {
                  // Ignore shadow DOM query errors (invalid selectors, etc.)
                  console.log('[MoveCursor] Shadow DOM query error:', shadowError);
                }
              }
            }
          }
          
          if (!element) {
            return { 
              success: false, 
              message: `No element found with selector: "${selector}" in main DOM or Shadow DOM. Please analyze the HTML and provide a valid CSS selector.` 
            };
          }

          // At this point, element is guaranteed to be non-null
          const targetElement = element;

          // Check if element is visible
          const computedStyle = window.getComputedStyle(targetElement);
          if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || computedStyle.opacity === '0') {
            return { 
              success: false, 
              message: `Element found but is hidden: "${selector}"` 
            };
          }

        // Scroll element into view smoothly (using 'nearest' to avoid viewport distortion)
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

        // Return promise that resolves after animation completes
        return new Promise((resolve) => {
          // Wait for scroll to complete
          setTimeout(() => {
            try {
              // Get or create cursor tracking object in window (preserve existing state)
              if (!(window as any).__copilotCursorState__) {
                (window as any).__copilotCursorState__ = {
                  lastX: window.innerWidth / 2,
                  lastY: window.innerHeight / 2,
                  hideTimeout: null
                };
              }
              const cursorState = (window as any).__copilotCursorState__;

              // Clear any existing hide timeout
              if (cursorState.hideTimeout) {
                clearTimeout(cursorState.hideTimeout);
                cursorState.hideTimeout = null;
              }

              // Get or create cursor element
              let cursor = document.getElementById('__copilot_cursor_indicator__') as HTMLDivElement | null;
              let isNewCursor = false;
              
              if (!cursor) {
                isNewCursor = true;
                cursor = document.createElement('div');
                cursor.id = '__copilot_cursor_indicator__';
                cursor.style.cssText = `
                  position: fixed !important;
                  top: 0 !important;
                  left: 0 !important;
                  width: 24px !important;
                  height: 24px !important;
                  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234CAF50"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>') no-repeat !important;
                  background-size: contain !important;
                  pointer-events: none !important;
                  z-index: 2147483647 !important;
                  transition: all 0.3s ease !important;
                  transform: translate(-50%, -50%) !important;
                  filter: drop-shadow(0 0 8px rgba(76, 175, 80, 0.8)) !important;
                `;
                document.body.appendChild(cursor);
              }

              // Ensure cursor style element exists
              let cursorStyleEl = document.getElementById('__copilot_cursor_style__');
              if (!cursorStyleEl) {
                cursorStyleEl = document.createElement('style');
                cursorStyleEl.id = '__copilot_cursor_style__';
                cursorStyleEl.textContent = `
                  @keyframes copilotPulse {
                    0%, 100% { 
                      transform: translate(-50%, -50%) scale(1); 
                      filter: drop-shadow(0 0 8px rgba(76, 175, 80, 0.8));
                    }
                    50% { 
                      transform: translate(-50%, -50%) scale(1.3); 
                      filter: drop-shadow(0 0 12px rgba(76, 175, 80, 1));
                    }
                  }
                  @keyframes copilotFadeOut {
                    0% { 
                      opacity: 1;
                      transform: translate(-50%, -50%) scale(1);
                    }
                    100% { 
                      opacity: 0;
                      transform: translate(-50%, -50%) scale(0.5);
                    }
                  }
                `;
                document.head.appendChild(cursorStyleEl);
              }

              // Highlight the element
              const originalStyle = (targetElement as HTMLElement).style.cssText;
              const highlightStyle = `
                outline: 3px solid #4CAF50 !important;
                outline-offset: 4px !important;
                background-color: rgba(76, 175, 80, 0.1) !important;
                cursor: pointer !important;
                transition: all 0.3s ease !important;
              `;
              (targetElement as HTMLElement).style.cssText += highlightStyle;

              // Get element position
              const rect = targetElement.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;

              // Animation constants
              const ANIMATION_STEPS = 30;
              const STEP_DURATION = 20;
              const CURSOR_DELAY_NEW = 200;
              const CURSOR_DELAY_EXISTING = 0;
              const HIGHLIGHT_DURATION = 5000;
              const AUTO_HIDE_DELAY = 300000;

              // Animate cursor to element position
              const animateCursor = () => {
                const stepX = (centerX - cursorState.lastX) / ANIMATION_STEPS;
                const stepY = (centerY - cursorState.lastY) / ANIMATION_STEPS;
                let step = 0;

                const moveStep = () => {
                  if (step < ANIMATION_STEPS) {
                    cursorState.lastX += stepX;
                    cursorState.lastY += stepY;

                    // Add slight randomness for natural movement
                    const randomX = (Math.random() - 0.5) * 2;
                    const randomY = (Math.random() - 0.5) * 2;

                    cursor!.style.left = (cursorState.lastX + randomX) + 'px';
                    cursor!.style.top = (cursorState.lastY + randomY) + 'px';
                    cursor!.style.opacity = '1';
                    cursor!.style.animation = 'none';

                    step++;
                    setTimeout(moveStep, STEP_DURATION);
                  } else {
                    // Final position - animation complete
                    cursorState.lastX = centerX;
                    cursorState.lastY = centerY;
                    cursor!.style.left = centerX + 'px';
                    cursor!.style.top = centerY + 'px';
                    cursor!.style.animation = 'copilotPulse 1.2s ease-in-out infinite';

                    // Auto-hide cursor after 5 minutes
                    cursorState.hideTimeout = setTimeout(() => {
                      if (cursor) {
                        cursor.style.animation = 'copilotFadeOut 0.5s ease-out forwards';
                        setTimeout(() => {
                          if (cursor) {
                            cursor.remove();
                          }
                        }, 500);
                      }
                    }, AUTO_HIDE_DELAY);

                    // Remove highlight after delay
                    setTimeout(() => {
                      (targetElement as HTMLElement).style.cssText = originalStyle;
                    }, HIGHLIGHT_DURATION);

                    // Resolve with success
                    resolve({
                      success: true,
                      message: `Cursor moved to: "${(targetElement.textContent || targetElement.tagName).substring(0, 50)}"${foundInShadowDOM ? ` (in Shadow DOM: ${shadowHostInfo})` : ''}`,
                      elementInfo: {
                        tag: targetElement.tagName,
                        text: (targetElement.textContent || '').trim().substring(0, 100),
                        id: targetElement.id,
                        className: targetElement.className,
                        foundInShadowDOM: foundInShadowDOM,
                        shadowHost: foundInShadowDOM ? shadowHostInfo : null
                      }
                    });
                  }
                };

                moveStep();
              };

              // Start cursor animation with delay for new cursor
              setTimeout(animateCursor, isNewCursor ? CURSOR_DELAY_NEW : CURSOR_DELAY_EXISTING);
            } catch (error) {
              resolve({
                success: false,
                message: `Error moving cursor: ${(error as Error).message || 'Unknown error'}`
              });
            }
          }, 600); // Wait for scroll to complete
        });
        } catch (error) {
          return { 
            success: false, 
            message: `Invalid CSS selector: "${selector}". Error: ${(error as Error).message || 'Unknown error'}` 
          };
        }
      },
      args: [cssSelector] as [string]
    });

    if (results && results[0]?.result) {
      const result = results[0].result as any;
      if (result.success && result.elementInfo) {
        return {
          status: 'success',
          message: result.message,
          elementInfo: {
            tag: result.elementInfo.tag,
            text: result.elementInfo.text || '',
            id: result.elementInfo.id || '',
            className: result.elementInfo.className || '',
            foundInShadowDOM: result.elementInfo.foundInShadowDOM,
            shadowHost: result.elementInfo.shadowHost
          }
        };
      } else {
        return {
          status: 'error',
          message: `${result.message || 'Element not found'}\n\nTry being more specific or use a different description.`
        };
      }
    }

    return {
      status: 'error',
      message: 'Unable to move cursor to element'
    };
  } catch (error) {
    debug.error('[MoveCursor] Error moving cursor:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

