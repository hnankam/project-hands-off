/**
 * Shared cursor movement utilities for DOM actions
 */

/**
 * Cursor state interface for tracking cursor position and state
 */
interface CursorState {
  lastX: number;
  lastY: number;
  hideTimeout: NodeJS.Timeout | null;
}

/**
 * Cursor movement options
 */
interface CursorMovementOptions {
  element: Element;
  foundInShadowDOM: boolean;
  shadowHostInfo: string;
  onComplete?: () => void;
}

/**
 * Initialize or get cursor state from window
 */
function getCursorState(): CursorState {
  if (!(window as any).__copilotCursorState__) {
    (window as any).__copilotCursorState__ = {
      lastX: window.innerWidth / 2,
      lastY: window.innerHeight / 2,
      hideTimeout: null
    };
  }
  return (window as any).__copilotCursorState__;
}

/**
 * Clear any existing cursor hide timeout
 */
function clearCursorHideTimeout(cursorState: CursorState): void {
  if (cursorState.hideTimeout) {
    clearTimeout(cursorState.hideTimeout);
    cursorState.hideTimeout = null;
  }
}

/**
 * Create or get cursor element
 */
function getOrCreateCursorElement(): { cursor: HTMLDivElement; isNewCursor: boolean } {
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

  return { cursor, isNewCursor };
}

/**
 * Ensure cursor style element exists
 */
function ensureCursorStyles(): void {
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
}

/**
 * Animate cursor to element position
 */
function animateCursorToElement(
  cursor: HTMLDivElement,
  cursorState: CursorState,
  centerX: number,
  centerY: number,
  onComplete?: () => void
): void {
  // Animation constants
  const ANIMATION_STEPS = 30;
  const STEP_DURATION = 20;

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

      cursor.style.left = (cursorState.lastX + randomX) + 'px';
      cursor.style.top = (cursorState.lastY + randomY) + 'px';
      cursor.style.opacity = '1';
      cursor.style.animation = 'none';

      step++;
      setTimeout(moveStep, STEP_DURATION);
    } else {
      // Final position - animation complete
      cursorState.lastX = centerX;
      cursorState.lastY = centerY;
      cursor.style.left = centerX + 'px';
      cursor.style.top = centerY + 'px';
      cursor.style.animation = 'copilotPulse 1.2s ease-in-out infinite';

      // Call completion callback if provided
      if (onComplete) {
        onComplete();
      }
    }
  };

  moveStep();
}

/**
 * Move cursor to a specific element with animation
 * @param options - Cursor movement options
 * @returns Promise that resolves when cursor movement is complete
 */
export function moveCursorToElement(options: CursorMovementOptions): Promise<void> {
  return new Promise((resolve) => {
    const { element, onComplete } = options;
    
    // Get cursor state and clear any existing timeout
    const cursorState = getCursorState();
    clearCursorHideTimeout(cursorState);

    // Get or create cursor element
    const { cursor, isNewCursor } = getOrCreateCursorElement();

    // Ensure cursor styles exist
    ensureCursorStyles();

    // Get element position
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Animation timing constants
    const CURSOR_DELAY_NEW = 200;
    const CURSOR_DELAY_EXISTING = 0;

    // Start cursor animation with delay for new cursor
    const startAnimation = () => {
      animateCursorToElement(cursor, cursorState, centerX, centerY, () => {
        if (onComplete) {
          onComplete();
        }
        resolve();
      });
    };

    setTimeout(startAnimation, isNewCursor ? CURSOR_DELAY_NEW : CURSOR_DELAY_EXISTING);
  });
}

/**
 * Highlight an element with visual feedback
 * @param element - Element to highlight
 * @param duration - How long to show the highlight (default: 5000ms)
 * @returns Promise that resolves when highlighting is complete
 */
export function highlightElement(element: Element, duration: number = 5000): Promise<void> {
  return new Promise((resolve) => {
    const originalStyle = (element as HTMLElement).style.cssText;
    const highlightStyle = `
      outline: 3px solid #4CAF50 !important;
      outline-offset: 4px !important;
      background-color: rgba(76, 175, 80, 0.1) !important;
      cursor: pointer !important;
      transition: all 0.3s ease !important;
    `;
    (element as HTMLElement).style.cssText += highlightStyle;

    setTimeout(() => {
      (element as HTMLElement).style.cssText = originalStyle;
      resolve();
    }, duration);
  });
}

/**
 * Auto-hide cursor after a specified delay
 * @param delay - Delay in milliseconds before hiding cursor (default: 300000ms = 5 minutes)
 */
export function autoHideCursor(delay: number = 300000): void {
  const cursorState = getCursorState();
  
  // Clear any existing timeout
  clearCursorHideTimeout(cursorState);
  
  // Set new timeout
  cursorState.hideTimeout = setTimeout(() => {
    const cursor = document.getElementById('__copilot_cursor_indicator__');
    if (cursor) {
      cursor.style.animation = 'copilotFadeOut 0.5s ease-out forwards';
      setTimeout(() => {
        if (cursor) {
          cursor.remove();
        }
      }, 500);
    }
  }, delay);
}
