/**
 * Utility functions for input handling
 */

import { debug as baseDebug } from '@extension/shared';
import { ElementInfo, ModernInputDetection, StreamingOptions, FrameworkType } from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for consistent logging */
const LOG_PREFIX = '[InputUtils]';

/** Default highlight duration in ms */
const DEFAULT_HIGHLIGHT_DURATION_MS = 2000;

/** Typing speed bounds */
const TYPING_SPEED = {
  MIN_MS: 10,
  MAX_MS: 50,
} as const;

/** Feedback animation duration in ms */
const FEEDBACK_ANIMATION_DURATION_MS = 800;

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

/** Element with framework instance keys */
interface FrameworkElement extends HTMLElement {
  [key: string]: unknown;
}

/** React internal instance */
interface ReactInstance {
  type?: {
    displayName?: string;
    name?: string;
  };
}

/** Vue instance */
interface VueInstance {
  $options?: {
    name?: string;
  };
}

// ============================================================================
// ELEMENT FINDING
// ============================================================================

/**
 * Find element in DOM or Shadow DOM (with recursive traversal for nested shadow roots)
 */
export function findElement(selector: string): ElementInfo | null {
  let element = document.querySelector(selector) as HTMLElement;
  let foundInShadowDOM = false;
  let shadowHostInfo = '';

  // If not found in main DOM, search in Shadow DOM recursively
  if (!element) {
    debug.log(LOG_PREFIX, 'Element not found in main DOM, searching Shadow DOM recursively...');

    const searchShadowRoots = (
      root: Document | ShadowRoot | Element,
      currentDepth: number = 0,
    ): HTMLElement | null => {
      const elements = root.querySelectorAll('*');

      for (const hostElement of Array.from(elements)) {
        if (hostElement.shadowRoot) {
          try {
            const shadowElement = hostElement.shadowRoot.querySelector(selector) as HTMLElement;
            if (shadowElement) {
              foundInShadowDOM = true;
              const className =
                hostElement.className && typeof hostElement.className === 'string'
                  ? '.' + hostElement.className.split(' ')[0]
                  : '';
              shadowHostInfo = `${hostElement.tagName}${hostElement.id ? '#' + hostElement.id : ''}${className} (depth: ${currentDepth})`;
              debug.log(LOG_PREFIX, 'Found element in Shadow DOM:', shadowHostInfo);
              return shadowElement;
            }

            const nestedResult = searchShadowRoots(hostElement.shadowRoot, currentDepth + 1);
            if (nestedResult) {
              return nestedResult;
            }
          } catch (shadowError) {
            debug.log(LOG_PREFIX, 'Shadow DOM query error:', shadowError);
          }
        }
      }

      return null;
    };

    const foundElement = searchShadowRoots(document, 1);
    if (foundElement) {
      element = foundElement;
    }
  }

  if (!element) {
    return null;
  }

  const inputType = (element as HTMLInputElement).type || '';
  const tagName = element.tagName.toLowerCase();

  return {
    element,
    foundInShadowDOM,
    shadowHostInfo,
    inputType,
    tagName,
  };
}

// ============================================================================
// ELEMENT VISIBILITY
// ============================================================================

/**
 * Check if element is visible and interactable
 */
export function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return !(
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0' ||
    element.offsetWidth === 0 ||
    element.offsetHeight === 0
  );
}

/**
 * Scroll element into view with optimal positioning
 */
export function scrollIntoView(element: HTMLElement): void {
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: 'nearest',
  });
}

// ============================================================================
// FOCUS AND HIGHLIGHT
// ============================================================================

/**
 * Focus element and highlight it
 */
export function focusAndHighlight(
  element: HTMLElement,
  duration: number = DEFAULT_HIGHLIGHT_DURATION_MS,
  moveCursor: boolean = false,
): void {
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
  }, duration);
}

// ============================================================================
// TEXT STREAMING
// ============================================================================

/**
 * Stream text into an element with typing effect
 */
export async function streamText(
  element: HTMLElement,
  value: string,
  options: StreamingOptions = {
    speed: 20,
    triggerInputEvents: true,
    triggerChangeEvents: true,
    triggerKeyboardEvents: false,
    triggerSelectionChange: false,
  },
): Promise<void> {
  const chars = value.split('');
  const typingSpeed = Math.max(TYPING_SPEED.MIN_MS, Math.min(TYPING_SPEED.MAX_MS, options.speed));

  for (let i = 0; i < chars.length; i++) {
    const currentValue = value.substring(0, i + 1);

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      (element as HTMLInputElement | HTMLTextAreaElement).value = currentValue;
    } else if (element.hasAttribute('contenteditable')) {
      element.textContent = currentValue;
    }

    if (options.triggerInputEvents) {
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }

    if (options.triggerKeyboardEvents) {
      element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }));
    }

    if (options.triggerSelectionChange) {
      document.dispatchEvent(new Event('selectionchange'));
    }

    await new Promise(resolve => setTimeout(resolve, typingSpeed));
  }

  if (options.triggerChangeEvents) {
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }
}

// ============================================================================
// FEEDBACK
// ============================================================================

/**
 * Show success feedback animation
 */
export function showSuccessFeedback(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();

  // Ensure animation style exists (only add once)
  let styleEl = document.getElementById('__copilot_input_success_style__');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = '__copilot_input_success_style__';
    styleEl.textContent = `
      @keyframes copilotInputSuccess {
        0% { 
          transform: scale(0) translateY(0); 
          opacity: 1; 
        }
        50% { 
          transform: scale(1.2) translateY(-5px); 
          opacity: 1; 
        }
        100% { 
          transform: scale(1) translateY(-15px); 
          opacity: 0; 
        }
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

  setTimeout(() => {
    inputFeedback.remove();
  }, FEEDBACK_ANIMATION_DURATION_MS);
}

// ============================================================================
// FRAMEWORK DETECTION
// ============================================================================

/**
 * Detect modern web framework and component type
 */
export function detectModernInput(element: HTMLElement): ModernInputDetection {
  const detection: ModernInputDetection = {
    isReactComponent: false,
    isVueComponent: false,
    isCustomInput: false,
    framework: 'vanilla' as FrameworkType,
  };

  const frameworkElement = element as FrameworkElement;
  const elementKeys = Object.keys(frameworkElement);

  // Check for React
  const reactKey = elementKeys.find(
    key => key.startsWith('__reactInternalInstance') || key.startsWith('_reactInternalFiber'),
  );
  if (reactKey) {
    detection.isReactComponent = true;
    detection.framework = 'react';

    const reactInstance = frameworkElement[reactKey] as ReactInstance | undefined;
    if (reactInstance?.type?.displayName) {
      detection.componentName = reactInstance.type.displayName;
    } else if (reactInstance?.type?.name) {
      detection.componentName = reactInstance.type.name;
    }
  }

  // Check for Vue
  const vueKey = elementKeys.find(key => key.startsWith('__vue__'));
  if (vueKey) {
    detection.isVueComponent = true;
    detection.framework = 'vue';

    const vueInstance = frameworkElement[vueKey] as VueInstance | undefined;
    if (vueInstance?.$options?.name) {
      detection.componentName = vueInstance.$options.name;
    }
  }

  // Check for Angular
  if (frameworkElement.__ngContext__ !== undefined) {
    detection.framework = 'angular';
  }

  // Check for Svelte
  if (frameworkElement.__svelte_meta !== undefined) {
    detection.framework = 'svelte';
  }

  // Check for custom input patterns
  const hasCustomClasses =
    element.className.includes('input') ||
    element.className.includes('field') ||
    element.className.includes('form-control');
  const hasDataAttributes = Array.from(element.attributes).some(
    attr => attr.name.startsWith('data-') && (attr.name.includes('input') || attr.name.includes('field')),
  );

  if (hasCustomClasses || hasDataAttributes) {
    detection.isCustomInput = true;
  }

  return detection;
}

// ============================================================================
// ELEMENT VALUE
// ============================================================================

/**
 * Get element's current value
 */
export function getElementValue(element: HTMLElement): string {
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

// ============================================================================
// EVENT TRIGGERING
// ============================================================================

/**
 * Trigger all relevant events for an input element
 */
export function triggerInputEvents(element: HTMLElement, eventTypes: string[] = ['input', 'change']): void {
  eventTypes.forEach(eventType => {
    element.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
  });
}

// ============================================================================
// CURSOR MOVEMENT
// ============================================================================

/**
 * Move cursor to the specified element
 */
export function moveCursorToElement(element: HTMLElement): void {
  try {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const mouseMoveEvent = new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: centerX,
      clientY: centerY,
      screenX: centerX + window.screenX,
      screenY: centerY + window.screenY,
    });

    element.dispatchEvent(mouseMoveEvent);

    // Try to set the cursor position if it's a text input
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      const inputElement = element as HTMLInputElement | HTMLTextAreaElement;
      if (inputElement.setSelectionRange) {
        const length = inputElement.value.length;
        inputElement.setSelectionRange(length, length);
      }
    }

    debug.log(LOG_PREFIX, 'Cursor moved to element:', element.tagName, element.id || element.className);
  } catch (error) {
    debug.error(LOG_PREFIX, 'Error moving cursor to element:', error);
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate input value based on element type and constraints
 */
export function validateInputValue(element: HTMLElement, value: string): { valid: boolean; error?: string } {
  if (element.tagName === 'INPUT') {
    const inputElement = element as HTMLInputElement;
    const type = inputElement.type;

    // Number validation
    if (type === 'number' || type === 'range') {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) {
        return { valid: false, error: 'Value must be a valid number' };
      }

      const min = parseFloat(inputElement.min);
      const max = parseFloat(inputElement.max);

      if (!isNaN(min) && numValue < min) {
        return { valid: false, error: `Value must be at least ${min}` };
      }

      if (!isNaN(max) && numValue > max) {
        return { valid: false, error: `Value must be at most ${max}` };
      }
    }

    // Email validation
    if (type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return { valid: false, error: 'Value must be a valid email address' };
      }
    }

    // URL validation
    if (type === 'url') {
      try {
        new URL(value);
      } catch {
        return { valid: false, error: 'Value must be a valid URL' };
      }
    }

    // Max length validation
    const maxLength = inputElement.maxLength;
    if (maxLength > 0 && value.length > maxLength) {
      return { valid: false, error: `Value must be at most ${maxLength} characters` };
    }
  }

  return { valid: true };
}
