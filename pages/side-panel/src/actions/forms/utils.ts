import { ElementInfo, ModernInputDetection, StreamingOptions } from './types';

/**
 * Utility functions for input handling
 */

/**
 * Find element in DOM or Shadow DOM
 */
export function findElement(selector: string): ElementInfo | null {
  // First try to find element in main DOM
  let element = document.querySelector(selector) as HTMLElement;
  let foundInShadowDOM = false;
  let shadowHostInfo = '';
  
  // If not found in main DOM, search in Shadow DOM
  if (!element) {
    console.log('[InputUtils] Element not found in main DOM, searching Shadow DOM...');
    
    // Search through all shadow roots with early exit
    for (const hostElement of Array.from(document.querySelectorAll('*'))) {
      if (hostElement.shadowRoot && !element) {
        try {
          const shadowElement = hostElement.shadowRoot.querySelector(selector) as HTMLElement;
          if (shadowElement) {
            element = shadowElement;
            foundInShadowDOM = true;
            shadowHostInfo = `${hostElement.tagName}${hostElement.id ? '#' + hostElement.id : ''}${hostElement.className ? '.' + hostElement.className.split(' ')[0] : ''}`;
            console.log('[InputUtils] Found element in Shadow DOM:', shadowHostInfo);
            break; // Early exit - stop searching once element is found
          }
        } catch (shadowError) {
          // Ignore shadow DOM query errors (invalid selectors, etc.)
          console.log('[InputUtils] Shadow DOM query error:', shadowError);
        }
      }
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
    tagName
  };
}

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
    inline: 'nearest' 
  });
}

/**
 * Focus element and highlight it
 */
export function focusAndHighlight(element: HTMLElement, duration: number = 2000, moveCursor: boolean = false): void {
  // Store original styles
  const originalStyle = element.style.cssText;
  const originalOutline = element.style.outline;
  const originalOutlineOffset = element.style.outlineOffset;
  const originalBackground = element.style.backgroundColor;
  
  // Focus the element
  element.focus();
  
  // Move cursor to element if requested
  if (moveCursor) {
    moveCursorToElement(element);
  }
  
  // Highlight the element
  element.style.outline = '3px solid #2196F3';
  element.style.outlineOffset = '4px';
  element.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
  element.style.transition = 'all 0.3s ease';
  
  // Remove highlight after duration
  setTimeout(() => {
    element.style.outline = originalOutline;
    element.style.outlineOffset = originalOutlineOffset;
    element.style.backgroundColor = originalBackground;
    element.style.transition = '';
  }, duration);
}

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
    triggerKeyboardEvents: false
  }
): Promise<void> {
  const chars = value.split('');
  const typingSpeed = Math.max(10, Math.min(50, options.speed));
  
  for (let i = 0; i < chars.length; i++) {
    const currentValue = value.substring(0, i + 1);
    
    // Set value based on element type
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      (element as HTMLInputElement | HTMLTextAreaElement).value = currentValue;
    } else if (element.hasAttribute('contenteditable')) {
      element.textContent = currentValue;
    }
    
    // Trigger events
    if (options.triggerInputEvents) {
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }
    
    if (options.triggerKeyboardEvents) {
      element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }));
    }
    
    // Small delay between characters
    await new Promise(resolve => setTimeout(resolve, typingSpeed));
  }
  
  // Final events after streaming completes
  if (options.triggerChangeEvents) {
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }
}

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
  
  // Create feedback element
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

  // Remove after animation completes
  setTimeout(() => {
    inputFeedback.remove();
  }, 800);
}

/**
 * Detect modern web framework and component type
 */
export function detectModernInput(element: HTMLElement): ModernInputDetection {
  const detection: ModernInputDetection = {
    isReactComponent: false,
    isVueComponent: false,
    isCustomInput: false,
    framework: 'vanilla'
  };

  // Check for React
  const reactKey = Object.keys(element).find(key => key.startsWith('__reactInternalInstance') || key.startsWith('_reactInternalFiber'));
  if (reactKey) {
    detection.isReactComponent = true;
    detection.framework = 'react';
    
    // Try to get component name
    const reactInstance = (element as any)[reactKey];
    if (reactInstance?.type?.displayName) {
      detection.componentName = reactInstance.type.displayName;
    } else if (reactInstance?.type?.name) {
      detection.componentName = reactInstance.type.name;
    }
  }

  // Check for Vue
  const vueKey = Object.keys(element).find(key => key.startsWith('__vue__'));
  if (vueKey) {
    detection.isVueComponent = true;
    detection.framework = 'vue';
    
    const vueInstance = (element as any)[vueKey];
    if (vueInstance?.$options?.name) {
      detection.componentName = vueInstance.$options.name;
    }
  }

  // Check for Angular
  if ((element as any).__ngContext__) {
    detection.framework = 'angular';
  }

  // Check for Svelte
  if ((element as any).__svelte_meta) {
    detection.framework = 'svelte';
  }

  // Check for custom input patterns
  const hasCustomClasses = element.className.includes('input') || 
                          element.className.includes('field') ||
                          element.className.includes('form-control');
  const hasDataAttributes = Array.from(element.attributes).some(attr => 
    attr.name.startsWith('data-') && (attr.name.includes('input') || attr.name.includes('field'))
  );

  if (hasCustomClasses || hasDataAttributes) {
    detection.isCustomInput = true;
  }

  return detection;
}

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

/**
 * Trigger all relevant events for an input element
 */
export function triggerInputEvents(element: HTMLElement, eventTypes: string[] = ['input', 'change']): void {
  eventTypes.forEach(eventType => {
    element.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
  });
}

/**
 * Move cursor to the specified element
 */
export function moveCursorToElement(element: HTMLElement): void {
  try {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Create and dispatch a mouse move event
    const mouseMoveEvent = new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: centerX,
      clientY: centerY,
      screenX: centerX + window.screenX,
      screenY: centerY + window.screenY
    });
    
    // Dispatch the event on the element
    element.dispatchEvent(mouseMoveEvent);
    
    // Also try to set the cursor position if it's a text input
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      const inputElement = element as HTMLInputElement | HTMLTextAreaElement;
      if (inputElement.setSelectionRange) {
        const length = inputElement.value.length;
        inputElement.setSelectionRange(length, length);
      }
    }
    
    console.log('[InputUtils] Cursor moved to element:', element.tagName, element.id || element.className);
  } catch (error) {
    console.error('[InputUtils] Error moving cursor to element:', error);
  }
}

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
