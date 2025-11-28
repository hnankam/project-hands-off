/**
 * Input Dispatcher
 *
 * Main dispatcher that routes input operations to specialized handlers.
 * Includes handler-level deduplication to prevent duplicate agent requests.
 */

import { debug as baseDebug } from '@extension/shared';
import { InputDataResult, InputHandlerOptions, InputType, InputHandler } from './types';

// Import all specialized handlers
import { TextInputHandler } from './textInputHandler';
import { CheckboxRadioHandler } from './checkboxRadioHandler';
import { DateInputHandler } from './dateInputHandler';
import { NumberInputHandler } from './numberInputHandler';
import { SelectInputHandler } from './selectInputHandler';
import { ContentEditableHandler } from './contentEditableHandler';
import { TextareaHandler } from './textareaHandler';
import { ModernInputHandler } from './modernInputHandler';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for consistent logging */
const LOG_PREFIX = '[InputDispatcher]';

/** Lock timeout for deduplication (covers slower agent calls) */
const LOCK_TIMEOUT_MS = 10000;

/** Stale lock cleanup threshold */
const STALE_LOCK_THRESHOLD_MS = 30000;

/** Content script atomic lock timeout */
const CONTENT_LOCK_TIMEOUT_MS = 4000;

/** Element-level lock timeout for concurrent execution prevention */
const ELEMENT_LOCK_TIMEOUT_MS = 5000;

/** Typing speed bounds */
const TYPING_SPEED = {
  MIN_MS: 10,
  MAX_MS: 30,
  BASE_DIVISOR: 500,
} as const;

/** Animation timing */
const ANIMATION = {
  CURSOR_STEPS: 16,
  STEP_DURATION_MS: 16,
  CURSOR_DELAY_NEW_MS: 100,
  CURSOR_DELAY_EXISTING_MS: 0,
  HIGHLIGHT_DURATION_MS: 2000,
  KEYBOARD_NAV_DELAY_MIN_MS: 600,
  KEYBOARD_NAV_DELAY_RANGE_MS: 400,
  DROPDOWN_OPEN_DELAY_MS: 600,
  FOCUS_DELAY_MS: 200,
  SELECTION_DELAY_MS: 200,
  INPUT_CALLBACK_DELAY_MS: 200,
} as const;

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

/** Handler entry in the dispatcher */
interface HandlerEntry {
  handler: InputHandler;
  priority: number;
  name: string;
}

/** Lock entry for deduplication */
interface LockEntry {
  timestamp: number;
  promise: Promise<InputDataResult>;
}

/** Element info from content script */
interface ElementInfo {
  element: HTMLElement;
  foundInShadowDOM: boolean;
  shadowHostInfo: string;
  inputType: string;
  tagName: string;
}

/** Content script result */
interface ContentScriptResult {
  success: boolean;
  message: string;
  elementInfo?: {
    tag: string;
    type: string;
    id: string;
    name: string;
    value: string;
    foundInShadowDOM?: boolean;
    shadowHost?: string | null;
  };
}

// ============================================================================
// HANDLER-LEVEL DEDUPLICATION
// ============================================================================

// Use globalThis to ensure the Map persists across module reloads/HMR
declare global {
  // eslint-disable-next-line no-var
  var __inputRequestLocks__: Map<string, LockEntry> | undefined;
}

if (!globalThis.__inputRequestLocks__) {
  globalThis.__inputRequestLocks__ = new Map<string, LockEntry>();
  debug.log(LOG_PREFIX, 'Initializing global lock Map');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clean up stale locks from the lock map
 */
function cleanupStaleLocks(lockMap: Map<string, LockEntry>): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, lock] of lockMap.entries()) {
    if (now - lock.timestamp > STALE_LOCK_THRESHOLD_MS) {
      lockMap.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

// ============================================================================
// INPUT DISPATCHER CLASS
// ============================================================================

/**
 * Main input dispatcher that routes to appropriate specialized handlers
 * This replaces the monolithic inputData.ts with a modular system
 */
export class InputDispatcher {
  private handlers: HandlerEntry[] = [];

  constructor() {
    // Initialize handlers in priority order (higher priority = checked first)
    this.handlers = [
      { handler: new ModernInputHandler(), priority: 100, name: 'ModernInput' },
      { handler: new TextInputHandler(), priority: 90, name: 'TextInput' },
      { handler: new CheckboxRadioHandler(), priority: 80, name: 'CheckboxRadio' },
      { handler: new DateInputHandler(), priority: 70, name: 'DateInput' },
      { handler: new NumberInputHandler(), priority: 60, name: 'NumberInput' },
      { handler: new SelectInputHandler(), priority: 50, name: 'SelectInput' },
      { handler: new ContentEditableHandler(), priority: 40, name: 'ContentEditable' },
      { handler: new TextareaHandler(), priority: 30, name: 'Textarea' },
    ];

    // Sort handlers by priority (highest first)
    this.handlers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Main entry point for input data handling
   * @param cssSelector - CSS selector for the input element
   * @param value - Value to input
   * @param clearFirst - Whether to clear the field first
   * @param moveCursor - Whether to move cursor to the input element (default: true)
   * @returns Promise with result
   */
  async handleInputData(
    cssSelector: string,
    value: string,
    clearFirst: boolean = true,
    moveCursor: boolean = true,
  ): Promise<InputDataResult> {
    // Create stable signature for deduplication
    const requestSignature = `${cssSelector}|${value}|${clearFirst}|${moveCursor}`;
    const callId = Math.random().toString(36).substring(2, 9);

    debug.log(LOG_PREFIX, `[${callId}] Request:`, { selector: cssSelector.substring(0, 50), clearFirst, moveCursor });

    // Get or create lock map
    const lockMap = globalThis.__inputRequestLocks__ ?? new Map<string, LockEntry>();
    if (!globalThis.__inputRequestLocks__) {
      debug.warn(LOG_PREFIX, `[${callId}] Global lock Map was undefined, recreating`);
      globalThis.__inputRequestLocks__ = lockMap;
    }

    // Check for existing lock
    const existingLock = lockMap.get(requestSignature);
    const lockAge = existingLock ? Date.now() - existingLock.timestamp : -1;

    debug.log(LOG_PREFIX, `[${callId}] Lock check:`, {
      hasLock: !!existingLock,
      lockAge,
      willReuse: existingLock && lockAge < LOCK_TIMEOUT_MS,
    });

    // Reuse existing promise if within timeout
    if (existingLock && lockAge < LOCK_TIMEOUT_MS) {
      debug.log(LOG_PREFIX, `[${callId}] Duplicate request blocked, reusing existing execution`);
      return existingLock.promise;
    }

    // Create execution promise
    const executionPromise = this.executeInputDataInternal(
      cssSelector,
      value,
      clearFirst,
      moveCursor,
      callId,
      requestSignature,
    );

    // Store lock
    lockMap.set(requestSignature, {
      timestamp: Date.now(),
      promise: executionPromise,
    });

    debug.log(LOG_PREFIX, `[${callId}] Lock acquired, total locks:`, lockMap.size);

    // Cleanup on error
    executionPromise.catch(() => {
      lockMap.delete(requestSignature);
      debug.log(LOG_PREFIX, `[${callId}] Lock deleted due to error`);
    });

    // Passive cleanup of stale locks
    const cleaned = cleanupStaleLocks(lockMap);
    if (cleaned > 0) {
      debug.log(LOG_PREFIX, `[${callId}] Cleaned ${cleaned} stale lock(s)`);
    }

    return executionPromise;
  }

  private async executeInputDataInternal(
    cssSelector: string,
    value: string,
    clearFirst: boolean,
    moveCursor: boolean,
    callId: string,
    requestSignature: string,
  ): Promise<InputDataResult> {
    try {
      // Get active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) {
        return { status: 'error', message: 'Unable to access current tab' };
      }

      debug.log(LOG_PREFIX, `[${callId}] Executing script on tab ${activeTab.id}`);

      // Execute content script
      const results = await chrome.scripting.executeScript({
        target: {
          tabId: activeTab.id,
          allFrames: false,
        },
        world: 'ISOLATED',
        func: this.createContentScript(),
        args: [
          cssSelector,
          value,
          clearFirst,
          moveCursor,
          callId,
          requestSignature,
          CONTENT_LOCK_TIMEOUT_MS,
          ELEMENT_LOCK_TIMEOUT_MS,
          TYPING_SPEED,
          ANIMATION,
        ],
      });

      debug.log(LOG_PREFIX, `[${callId}] Script completed`);

      if (results && results[0]?.result) {
        const result = results[0].result as ContentScriptResult;
        debug.log(LOG_PREFIX, `[${callId}] Result:`, { success: result.success, message: result.message });

        if (result.success && result.elementInfo) {
          return {
            status: 'success',
            message: result.message,
            elementInfo: {
              tag: result.elementInfo.tag,
              type: result.elementInfo.type || 'N/A',
              id: result.elementInfo.id || '',
              name: result.elementInfo.name || '',
              value: result.elementInfo.value || '',
              foundInShadowDOM: result.elementInfo.foundInShadowDOM || false,
              shadowHost: result.elementInfo.shadowHost || null,
            },
          };
        } else {
          return {
            status: 'error',
            message: result.message,
          };
        }
      }

      return { status: 'error', message: 'Unable to input data into field' };
    } catch (error) {
      debug.error(LOG_PREFIX, `[${callId}] Error:`, error);
      return {
        status: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Creates the content script function to be injected
   * This is a large function that handles all input operations in the page context
   */
  private createContentScript(): (
    selector: string,
    inputValue: string,
    shouldClear: boolean,
    shouldMoveCursor: boolean,
    callIdParam: string,
    signature: string,
    contentLockTimeout: number,
    elementLockTimeout: number,
    typingSpeed: typeof TYPING_SPEED,
    animation: typeof ANIMATION,
  ) => Promise<ContentScriptResult> {
    return async (
      selector: string,
      inputValue: string,
      shouldClear: boolean,
      shouldMoveCursor: boolean,
      callIdParam: string,
      signature: string,
      contentLockTimeout: number,
      elementLockTimeout: number,
      typingSpeed: { MIN_MS: number; MAX_MS: number; BASE_DIVISOR: number },
      animation: {
        CURSOR_STEPS: number;
        STEP_DURATION_MS: number;
        CURSOR_DELAY_NEW_MS: number;
        CURSOR_DELAY_EXISTING_MS: number;
        HIGHLIGHT_DURATION_MS: number;
        KEYBOARD_NAV_DELAY_MIN_MS: number;
        KEYBOARD_NAV_DELAY_RANGE_MS: number;
        DROPDOWN_OPEN_DELAY_MS: number;
        FOCUS_DELAY_MS: number;
        SELECTION_DELAY_MS: number;
        INPUT_CALLBACK_DELAY_MS: number;
      },
    ): Promise<ContentScriptResult> => {
      console.log(`[ContentScript:${callIdParam}] Script injected and executing...`);

      // ATOMIC lock check using DOM attribute for cross-injection synchronization
      const lockAttr = `data-copilot-input-lock-${signature.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)}`;

      // Try to acquire lock atomically using DOM attribute
      const existingLock = document.documentElement.getAttribute(lockAttr);
      if (existingLock) {
        const lockTime = parseInt(existingLock, 10);
        if (!isNaN(lockTime) && Date.now() - lockTime < contentLockTimeout) {
          console.log(`[ContentScript:${callIdParam}] Atomic lock already held, skipping duplicate`);
          return {
            success: true,
            message: 'Input skipped (atomic lock held)',
          };
        }
      }

      // Set atomic lock with timestamp
      document.documentElement.setAttribute(lockAttr, Date.now().toString());

      // Also check window-level flag for additional safety
      const injectionKey = `__copilotInputInjected_${selector}_${inputValue}`;
      const win = window as unknown as Record<string, boolean | undefined>;
      if (win[injectionKey]) {
        console.log(`[ContentScript:${callIdParam}] Window lock already held, skipping duplicate`);
        return {
          success: true,
          message: 'Input skipped (window lock held)',
        };
      }
      win[injectionKey] = true;

      // Cleanup function
      const cleanup = () => {
        delete win[injectionKey];
        document.documentElement.removeAttribute(lockAttr);
      };

      // Fallback cleanup after timeout
      const cleanupTimer = setTimeout(cleanup, contentLockTimeout);

      // ========================================================================
      // CONTENT SCRIPT HELPER FUNCTIONS
      // ========================================================================

      // Shadow DOM helper - supports >> notation
      function querySelectorWithShadowDOM(sel: string): HTMLElement | null {
        if (!sel.includes(' >> ')) {
          return document.querySelector(sel) as HTMLElement;
        }

        const parts = sel.split(' >> ');
        if (parts.length !== 2) {
          throw new Error('Invalid shadow DOM selector format. Expected "shadowPath >> elementSelector"');
        }

        const shadowPath = parts[0].trim();
        const elementSelector = parts[1].trim();

        const pathSegments = shadowPath
          .split(' > ')
          .map((s: string) => s.trim())
          .filter((s: string) => s && s !== 'document');

        if (pathSegments.length === 0) {
          throw new Error('Shadow path must contain at least one element');
        }

        let currentRoot: Document | ShadowRoot = document;

        for (const segment of pathSegments) {
          const hostElement: Element | null = currentRoot.querySelector(segment);

          if (!hostElement) {
            throw new Error('Shadow host not found: ' + segment);
          }

          if (!hostElement.shadowRoot) {
            throw new Error('Element does not have a shadow root: ' + segment);
          }

          currentRoot = hostElement.shadowRoot;
        }

        return currentRoot.querySelector(elementSelector) as HTMLElement;
      }

      function findElement(
        sel: string,
      ): { element: HTMLElement; foundInShadowDOM: boolean; shadowHostInfo: string; inputType: string; tagName: string } | null {
        const element = querySelectorWithShadowDOM(sel);
        const foundInShadowDOM = sel.includes(' >> ');
        const shadowHostInfo = foundInShadowDOM ? sel.split(' >> ')[0].trim() : '';

        if (!element) {
          return null;
        }

        const inputType =
          (element as HTMLInputElement).type || (element.hasAttribute('contenteditable') ? 'contenteditable' : '');
        const tagName = element.tagName.toLowerCase();

        return {
          element,
          foundInShadowDOM,
          shadowHostInfo,
          inputType,
          tagName,
        };
      }

      function isElementVisible(element: HTMLElement): boolean {
        const style = window.getComputedStyle(element);
        return !(
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0' ||
          element.offsetWidth === 0 ||
          element.offsetHeight === 0
        );
      }

      function scrollIntoView(element: HTMLElement): void {
        try {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        } catch {
          // Ignore scroll errors
        }
      }

      function getElementValue(element: HTMLElement): string {
        if (element.tagName === 'INPUT') {
          const inputElement = element as HTMLInputElement;
          const type = inputElement.type;
          if (type === 'checkbox' || type === 'radio') {
            return inputElement.checked ? 'checked' : 'unchecked';
          }
          return inputElement.value;
        }

        if (element.tagName === 'TEXTAREA') {
          return (element as HTMLTextAreaElement).value;
        }

        if (element.tagName === 'SELECT') {
          return (element as HTMLSelectElement).value;
        }

        if (element.hasAttribute('contenteditable')) {
          return element.textContent || '';
        }

        return '';
      }

      function moveCursorToElement(element: HTMLElement): void {
        try {
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          // Get or create cursor tracking object
          const winAny = window as unknown as Record<string, unknown>;
          if (!winAny.__copilotCursorState__) {
            winAny.__copilotCursorState__ = {
              lastX: window.innerWidth / 2,
              lastY: window.innerHeight / 2,
              hideTimeout: null,
            };
          }
          const cursorState = winAny.__copilotCursorState__ as {
            lastX: number;
            lastY: number;
            hideTimeout: ReturnType<typeof setTimeout> | null;
          };

          // Clear any existing hide timeout
          if (cursorState.hideTimeout) {
            clearTimeout(cursorState.hideTimeout);
            cursorState.hideTimeout = null;
          }

          // Get or create cursor element
          let cursor = document.getElementById('__copilot_cursor_indicator__') as HTMLDivElement | null;
          let isNewCursor = false;

          if (!cursor) {
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
            isNewCursor = true;
          }

          // Animate cursor to element position
          const animateCursor = () => {
            const stepX = (centerX - cursorState.lastX) / animation.CURSOR_STEPS;
            const stepY = (centerY - cursorState.lastY) / animation.CURSOR_STEPS;
            let step = 0;

            const moveStep = () => {
              if (step < animation.CURSOR_STEPS) {
                cursorState.lastX += stepX;
                cursorState.lastY += stepY;

                // Add slight randomness for natural movement
                const randomX = (Math.random() - 0.5) * 2;
                const randomY = (Math.random() - 0.5) * 2;

                cursor!.style.left = cursorState.lastX + randomX + 'px';
                cursor!.style.top = cursorState.lastY + randomY + 'px';
                cursor!.style.opacity = '1';
                cursor!.style.animation = 'none';

                step++;
                setTimeout(moveStep, animation.STEP_DURATION_MS);
              } else {
                // Final position
                cursorState.lastX = centerX;
                cursorState.lastY = centerY;
                cursor!.style.left = centerX + 'px';
                cursor!.style.top = centerY + 'px';
                cursor!.style.animation = 'copilotPulse 1.2s ease-in-out infinite';

                // Set cursor position for text inputs
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                  const inputElement = element as HTMLInputElement | HTMLTextAreaElement;
                  const inputType = (inputElement as HTMLInputElement).type || 'text';
                  const supportsSelection =
                    ['text', 'search', 'url', 'tel'].includes(inputType) ||
                    element.tagName === 'TEXTAREA' ||
                    element.hasAttribute('contenteditable');

                  if (supportsSelection && inputElement.setSelectionRange) {
                    try {
                      const length = inputElement.value.length;
                      inputElement.setSelectionRange(length, length);
                    } catch {
                      // Some input types don't support selection
                    }
                  }
                }

                // Call input callback
                const winCallback = window as unknown as { __copilotInputCallback__?: () => void };
                if (winCallback.__copilotInputCallback__) {
                  setTimeout(() => {
                    winCallback.__copilotInputCallback__?.();
                    winCallback.__copilotInputCallback__ = undefined;
                  }, animation.INPUT_CALLBACK_DELAY_MS);
                }
              }
            };

            moveStep();
          };

          // Start animation with appropriate delay
          setTimeout(
            animateCursor,
            isNewCursor ? animation.CURSOR_DELAY_NEW_MS : animation.CURSOR_DELAY_EXISTING_MS,
          );
        } catch (error) {
          console.error('[ContentScript] Error moving cursor:', error);
        }
      }

      function focusAndHighlight(element: HTMLElement, moveCursor: boolean = true): void {
        const originalOutline = element.style.outline;
        const originalOutlineOffset = element.style.outlineOffset;
        const originalBackground = element.style.backgroundColor;

        element.focus();

        if (moveCursor) {
          moveCursorToElement(element);
        }

        element.style.outline = '3px solid #2196F3';
        element.style.outlineOffset = '4px';
        element.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
        element.style.transition = 'all 0.3s ease';

        setTimeout(() => {
          element.style.outline = originalOutline;
          element.style.outlineOffset = originalOutlineOffset;
          element.style.backgroundColor = originalBackground;
          element.style.transition = '';
        }, animation.HIGHLIGHT_DURATION_MS);
      }

      function showSuccessFeedback(element: HTMLElement): void {
        const rect = element.getBoundingClientRect();

        // Ensure animation style exists
        let styleEl = document.getElementById('__copilot_input_success_style__');
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = '__copilot_input_success_style__';
          styleEl.textContent = `
            @keyframes copilotInputSuccess {
              0% { transform: scale(0) translateY(0); opacity: 1; }
              50% { transform: scale(1.2) translateY(-5px); opacity: 1; }
              100% { transform: scale(1) translateY(-15px); opacity: 0; }
            }
          `;
          document.head.appendChild(styleEl);
        }

        const inputFeedback = document.createElement('div');
        inputFeedback.className = '__copilot_input_feedback__';
        inputFeedback.textContent = '✓';
        inputFeedback.style.cssText = `
          position: fixed;
          left: ${rect.right - 25}px;
          top: ${rect.top - 5}px;
          width: 20px;
          height: 20px;
          background: #4CAF50;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: bold;
          pointer-events: none;
          z-index: 999999;
          animation: copilotInputSuccess 0.8s ease-out;
        `;

        document.body.appendChild(inputFeedback);
        setTimeout(() => inputFeedback.remove(), 800);
      }

      // ========================================================================
      // INPUT APPROACH FUNCTIONS
      // ========================================================================

      async function approach0_ClickAndType(
        inputElement: HTMLInputElement,
        value: string,
      ): Promise<{ success: boolean; message: string }> {
        try {
          const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          inputElement.dispatchEvent(clickEvent);
          inputElement.focus();

          await new Promise(resolve => setTimeout(resolve, 50));

          for (let i = 0; i < value.length; i++) {
            const char = value[i];

            const keydownEvent = new KeyboardEvent('keydown', {
              bubbles: true,
              cancelable: true,
              key: char,
              code: `Key${char.toUpperCase()}`,
              charCode: char.charCodeAt(0),
              keyCode: char.charCodeAt(0),
              which: char.charCodeAt(0),
            });
            inputElement.dispatchEvent(keydownEvent);

            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            (inputEvent as unknown as Record<string, unknown>).target = inputElement;
            (inputEvent as unknown as Record<string, unknown>).data = char;
            inputElement.dispatchEvent(inputEvent);

            const keyupEvent = new KeyboardEvent('keyup', {
              bubbles: true,
              cancelable: true,
              key: char,
              code: `Key${char.toUpperCase()}`,
              charCode: char.charCodeAt(0),
              keyCode: char.charCodeAt(0),
              which: char.charCodeAt(0),
            });
            inputElement.dispatchEvent(keyupEvent);

            await new Promise(resolve => setTimeout(resolve, 5));
          }

          const changeEvent = new Event('change', { bubbles: true, cancelable: true });
          inputElement.dispatchEvent(changeEvent);

          await new Promise(resolve => setTimeout(resolve, 100));

          return { success: true, message: 'Click and type completed' };
        } catch (error) {
          return { success: false, message: 'Click and type failed' };
        }
      }

      async function approach1_DirectValueSetting(
        inputElement: HTMLInputElement,
        value: string,
      ): Promise<{ success: boolean; message: string }> {
        const wasReadonly = inputElement.hasAttribute('readonly');
        if (wasReadonly) {
          inputElement.removeAttribute('readonly');
        }

        inputElement.value = value;
        const events = ['input', 'change', 'blur'];
        for (const eventType of events) {
          const event = new Event(eventType, { bubbles: true, cancelable: true });
          (event as unknown as Record<string, unknown>).target = inputElement;
          inputElement.dispatchEvent(event);
        }

        if (wasReadonly) {
          inputElement.setAttribute('readonly', '');
        }

        return { success: true, message: 'Direct value setting completed' };
      }

      async function approach2_SimulateTyping(
        inputElement: HTMLInputElement,
        value: string,
      ): Promise<{ success: boolean; message: string }> {
        const wasReadonly = inputElement.hasAttribute('readonly');
        if (wasReadonly) {
          inputElement.removeAttribute('readonly');
        }

        inputElement.focus();
        for (let i = 0; i < value.length; i++) {
          const char = value[i];
          inputElement.value += char;
          const inputEvent = new Event('input', { bubbles: true, cancelable: true });
          (inputEvent as unknown as Record<string, unknown>).target = inputElement;
          (inputEvent as unknown as Record<string, unknown>).data = char;
          inputElement.dispatchEvent(inputEvent);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        (changeEvent as unknown as Record<string, unknown>).target = inputElement;
        inputElement.dispatchEvent(changeEvent);

        if (wasReadonly) {
          inputElement.setAttribute('readonly', '');
        }

        return { success: true, message: 'Simulated typing completed' };
      }

      // ========================================================================
      // KEYBOARD NAVIGATION FOR CUSTOM DROPDOWNS
      // ========================================================================

      async function tryKeyboardNavigation(
        dropdownElement: HTMLElement,
        value: string,
      ): Promise<{ success: boolean; message?: string }> {
        try {
          const isSelectableOption = (text: string): boolean => {
            if (!text || text.length === 0) return false;
            return text.length < 50 && !text.includes('?') && !text.includes('*');
          };

          dropdownElement.click();
          await new Promise(resolve => setTimeout(resolve, animation.DROPDOWN_OPEN_DELAY_MS));

          const isInHiddenContainer = (el: HTMLElement): boolean => {
            let current = el.parentElement;
            while (current) {
              const style = window.getComputedStyle(current);
              if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                current.getAttribute('aria-hidden') === 'true'
              ) {
                return true;
              }
              current = current.parentElement;
            }
            return false;
          };

          if (!isInHiddenContainer(dropdownElement)) {
            dropdownElement.focus();
          }

          await new Promise(resolve => setTimeout(resolve, animation.FOCUS_DELAY_MS));

          const container =
            dropdownElement.closest(
              '[data-slot="form-item"], .dropdown, .select, [role="listbox"], [role="menu"]',
            ) || dropdownElement.parentElement;

          const allOptions: Array<{ element: Element; text: string }> = [];
          const foundElements = new Set<Element>();

          // Visual element selectors
          const visualElementSelectors = [
            '[role="option"]:not(option)',
            '[role="menuitem"]:not(option)',
            '[role="listitem"]:not(option)',
            '[data-radix-select-item]',
            '[data-radix-collection-item]',
            '.ant-select-item',
            '.ant-select-item-option',
            '.MuiMenuItem-root',
            '.dropdown-item',
            '[data-slot="select-item"]',
            '.select-item',
            '.select-option',
            '.menu-item',
            '.option-item',
            '.list-item',
            'div[data-value]',
            'li[data-value]',
          ];

          const searchAreas = [
            container,
            document.body,
            document.querySelector('[data-radix-portal]'),
            document.querySelector('[data-radix-select-content]'),
            document.querySelector('[role="listbox"]'),
            document.querySelector('[role="menu"]'),
          ].filter(Boolean);

          for (const sel of visualElementSelectors) {
            try {
              searchAreas.forEach(area => {
                if (area) {
                  const elements = area.querySelectorAll(sel);
                  elements.forEach(el => {
                    if (el.tagName !== 'OPTION') {
                      foundElements.add(el);
                    }
                  });
                }
              });
            } catch {
              // Skip invalid selectors
            }
          }

          // Process found elements
          const candidateElements = Array.from(foundElements);
          candidateElements.forEach(element => {
            const text = element.textContent?.trim();
            if (text && text.length > 0 && isSelectableOption(text)) {
              if (
                element === dropdownElement ||
                element.getAttribute('role') === 'combobox' ||
                element.getAttribute('data-slot') === 'select-trigger'
              ) {
                return;
              }

              const existingOption = allOptions.find(opt => opt.text === text);
              if (!existingOption) {
                allOptions.push({ element, text });
              }
            }
          });

          // Fallback to hidden select
          if (allOptions.length === 0) {
            const hiddenSelect = container?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
            if (hiddenSelect) {
              for (let i = 0; i < hiddenSelect.options.length; i++) {
                const option = hiddenSelect.options[i];
                const text = option.text?.trim();
                if (text && text.length > 0) {
                  allOptions.push({ element: option, text });
                }
              }
            }
          }

          const targetIndex = allOptions.findIndex(opt => opt.text === value);
          if (targetIndex === -1) {
            return { success: false, message: 'Target option not found' };
          }

          // Navigate using arrow keys
          for (let i = 0; i < targetIndex; i++) {
            const keyDownEvent = new KeyboardEvent('keydown', {
              key: 'ArrowDown',
              code: 'ArrowDown',
              keyCode: 40,
              which: 40,
              bubbles: true,
              cancelable: true,
              view: window,
            });
            dropdownElement.dispatchEvent(keyDownEvent);

            const keyUpEvent = new KeyboardEvent('keyup', {
              key: 'ArrowDown',
              code: 'ArrowDown',
              keyCode: 40,
              which: 40,
              bubbles: true,
              cancelable: true,
              view: window,
            });
            dropdownElement.dispatchEvent(keyUpEvent);

            const delay = animation.KEYBOARD_NAV_DELAY_MIN_MS + Math.random() * animation.KEYBOARD_NAV_DELAY_RANGE_MS;
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          // Press Enter to select
          await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 200));

          const enterDownEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            view: window,
          });
          dropdownElement.dispatchEvent(enterDownEvent);

          const enterUpEvent = new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            view: window,
          });
          dropdownElement.dispatchEvent(enterUpEvent);

          // Also trigger on hidden select
          const hiddenSelect = container?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
          if (hiddenSelect) {
            for (let i = 0; i < hiddenSelect.options.length; i++) {
              const option = hiddenSelect.options[i];
              if (option.value === value || option.text === value) {
                hiddenSelect.selectedIndex = i;
                break;
              }
            }
            hiddenSelect.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            hiddenSelect.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          }

          dropdownElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          dropdownElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

          await new Promise(resolve => setTimeout(resolve, animation.SELECTION_DELAY_MS));

          // Close dropdown
          const escapeDownEvent = new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
            view: window,
          });
          dropdownElement.dispatchEvent(escapeDownEvent);

          return {
            success: true,
            message: `Custom dropdown option "${value}" selected successfully via keyboard navigation`,
          };
        } catch (keyboardError) {
          console.log('[ContentScript] Keyboard navigation failed:', keyboardError);
          return { success: false, message: 'Keyboard navigation failed' };
        }
      }

      // ========================================================================
      // MAIN EXECUTION LOGIC
      // ========================================================================

      try {
        const elementInfo = findElement(selector);
        if (!elementInfo) {
          clearTimeout(cleanupTimer);
          cleanup();
          return {
            success: false,
            message: `No element found with selector: "${selector}" in main DOM or Shadow DOM.`,
          };
        }

        if (!isElementVisible(elementInfo.element)) {
          clearTimeout(cleanupTimer);
          cleanup();
          return {
            success: false,
            message: `Element found but is hidden: "${selector}"`,
          };
        }

        scrollIntoView(elementInfo.element);

        // Check for concurrent execution lock
        const lockKey = '__copilotInputInProgress__';
        const elAny = elementInfo.element as unknown as Record<string, boolean | undefined>;
        if (elAny[lockKey]) {
          clearTimeout(cleanupTimer);
          cleanup();
          return {
            success: true,
            message: 'Input skipped (already in progress)',
            elementInfo: {
              tag: elementInfo.element.tagName,
              type: elementInfo.inputType || 'N/A',
              id: elementInfo.element.id || '',
              name: (elementInfo.element as HTMLInputElement).name || '',
              value: getElementValue(elementInfo.element),
              foundInShadowDOM: elementInfo.foundInShadowDOM,
              shadowHost: elementInfo.shadowHostInfo,
            },
          };
        }

        // Perform input
        const performInput = async (): Promise<ContentScriptResult> => {
          elAny[lockKey] = true;

          const timeoutId = setTimeout(() => {
            elAny[lockKey] = false;
          }, elementLockTimeout);

          try {
            const { element, inputType } = elementInfo;

            if (element.tagName === 'INPUT') {
              const inputElement = element as HTMLInputElement;
              const type = inputElement.type || 'text';

              if (type === 'checkbox' || type === 'radio') {
                const shouldCheck = inputValue.toLowerCase() === 'true' || inputValue === '1';
                inputElement.checked = shouldCheck;
                inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              } else if (type === 'file') {
                clearTimeout(timeoutId);
                elAny[lockKey] = false;
                return {
                  success: false,
                  message: 'File input fields cannot be programmatically set for security reasons',
                };
              } else {
                // Text input - use formatter handling
                inputElement.value = '';

                const tryFormatterApproaches = async () => {
                  const approaches = [
                    { name: 'SimulateTyping', fn: () => approach2_SimulateTyping(inputElement, inputValue) },
                    { name: 'DirectValueSetting', fn: () => approach1_DirectValueSetting(inputElement, inputValue) },
                    { name: 'ClickAndType', fn: () => approach0_ClickAndType(inputElement, inputValue) },
                  ];

                  for (const approach of approaches) {
                    try {
                      const result = await approach.fn();
                      if (result.success) {
                        const currentValue = inputElement.value;
                        if (currentValue && currentValue !== '') {
                          inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                          return true;
                        }
                      }
                    } catch {
                      continue;
                    }
                  }

                  // Fallback: basic streaming
                  const chars = inputValue.split('');
                  const speed = Math.max(
                    typingSpeed.MIN_MS,
                    Math.min(typingSpeed.MAX_MS, typingSpeed.BASE_DIVISOR / chars.length),
                  );

                  for (let i = 0; i < chars.length; i++) {
                    inputElement.value = inputValue.substring(0, i + 1);
                    inputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, speed));
                  }

                  inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                  return true;
                };

                await tryFormatterApproaches();
              }
            } else if (element.tagName === 'TEXTAREA') {
              const textareaElement = element as HTMLTextAreaElement;
              textareaElement.value = '';

              // Use same approach as text input
              const chars = inputValue.split('');
              const speed = Math.max(
                typingSpeed.MIN_MS,
                Math.min(typingSpeed.MAX_MS, typingSpeed.BASE_DIVISOR / chars.length),
              );

              for (let i = 0; i < chars.length; i++) {
                textareaElement.value = inputValue.substring(0, i + 1);
                textareaElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                await new Promise(resolve => setTimeout(resolve, speed));
              }

              textareaElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            } else if (element.tagName === 'SELECT') {
              const selectElement = element as HTMLSelectElement;
              let optionFound = false;
              for (let i = 0; i < selectElement.options.length; i++) {
                const option = selectElement.options[i];
                if (option.value === inputValue || option.text === inputValue) {
                  selectElement.selectedIndex = i;
                  optionFound = true;
                  break;
                }
              }
              if (!optionFound) {
                clearTimeout(timeoutId);
                elAny[lockKey] = false;
                return {
                  success: false,
                  message: `No option found with value or text: "${inputValue}"`,
                };
              }
              selectElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            } else if (
              element.tagName === 'BUTTON' &&
              (element.getAttribute('data-slot') === 'select-trigger' || element.getAttribute('role') === 'combobox')
            ) {
              // Custom dropdown button
              const keyboardResult = await tryKeyboardNavigation(element, inputValue);
              clearTimeout(timeoutId);
              elAny[lockKey] = false;
              if (keyboardResult.success) {
                return {
                  success: true,
                  message: keyboardResult.message || `Custom dropdown option "${inputValue}" selected`,
                  elementInfo: {
                    tag: element.tagName,
                    type: 'select',
                    id: element.id || '',
                    name: (element as HTMLInputElement).name || '',
                    value: inputValue,
                    foundInShadowDOM: elementInfo.foundInShadowDOM,
                    shadowHost: elementInfo.shadowHostInfo,
                  },
                };
              } else {
                return {
                  success: false,
                  message: keyboardResult.message || 'Keyboard navigation failed for custom dropdown',
                };
              }
            } else if (element.hasAttribute('contenteditable')) {
              if (shouldClear) {
                element.textContent = '';
              }

              const chars = inputValue.split('');
              const speed = Math.max(
                typingSpeed.MIN_MS,
                Math.min(typingSpeed.MAX_MS, typingSpeed.BASE_DIVISOR / chars.length),
              );

              for (let i = 0; i < chars.length; i++) {
                element.textContent = inputValue.substring(0, i + 1);
                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                await new Promise(resolve => setTimeout(resolve, speed));
              }
            } else {
              clearTimeout(timeoutId);
              elAny[lockKey] = false;
              return {
                success: false,
                message: `Element is not an input field: ${element.tagName}`,
              };
            }

            showSuccessFeedback(element);

            clearTimeout(timeoutId);
            elAny[lockKey] = false;

            return {
              success: true,
              message: 'Input successful',
              elementInfo: {
                tag: element.tagName,
                type: inputType || 'N/A',
                id: element.id || '',
                name: (element as HTMLInputElement).name || '',
                value: getElementValue(element),
                foundInShadowDOM: elementInfo.foundInShadowDOM,
                shadowHost: elementInfo.shadowHostInfo,
              },
            };
          } catch (error) {
            clearTimeout(timeoutId);
            elAny[lockKey] = false;
            throw error;
          }
        };

        // Execute with or without cursor movement
        if (shouldMoveCursor) {
          focusAndHighlight(elementInfo.element, shouldMoveCursor);

          return new Promise(resolve => {
            const winCallback = window as unknown as { __copilotInputCallback__?: () => void };
            winCallback.__copilotInputCallback__ = async () => {
              const result = await performInput();
              clearTimeout(cleanupTimer);
              cleanup();
              resolve(result);
            };
          });
        } else {
          focusAndHighlight(elementInfo.element, shouldMoveCursor);
          const result = await performInput();
          clearTimeout(cleanupTimer);
          cleanup();
          return result;
        }
      } catch (error) {
        clearTimeout(cleanupTimer);
        cleanup();
        return {
          success: false,
          message: `Error inputting data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    };
  }

  /**
   * Get handler statistics for debugging
   */
  getHandlerStats(): Array<{ name: string; priority: number }> {
    return this.handlers.map(({ priority, name }) => ({
      name,
      priority,
    }));
  }

  /**
   * Add a custom handler
   */
  addHandler(handler: InputHandler, priority: number = 50, name: string = 'Custom'): void {
    this.handlers.push({ handler, priority, name });
    this.handlers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a handler by name
   */
  removeHandler(name: string): boolean {
    const index = this.handlers.findIndex(h => h.name === name);
    if (index !== -1) {
      this.handlers.splice(index, 1);
      return true;
    }
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

/** Singleton instance */
export const inputDispatcher = new InputDispatcher();

/** Main function for backward compatibility */
export async function handleInputData(
  cssSelector: string,
  value: string,
  clearFirst: boolean = true,
  moveCursor: boolean = true,
): Promise<InputDataResult> {
  return inputDispatcher.handleInputData(cssSelector, value, clearFirst, moveCursor);
}
