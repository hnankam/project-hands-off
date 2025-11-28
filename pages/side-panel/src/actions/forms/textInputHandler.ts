/**
 * Text Input Handler
 *
 * Specialized handler for text inputs (text, email, password, search, tel, url).
 * Handles modern web app patterns and formatted input fields.
 */

import { debug as baseDebug } from '@extension/shared';
import { InputHandler, InputDataResult, TextInputOptions, InputType, ModernInputDetection } from './types';
import {
  isElementVisible,
  scrollIntoView,
  focusAndHighlight,
  streamText,
  showSuccessFeedback,
  getElementValue,
  triggerInputEvents,
  validateInputValue,
  detectModernInput,
  moveCursorToElement,
} from './utils';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for consistent logging */
const LOG_PREFIX = '[TextInput]';

/** Supported input types */
const SUPPORTED_TYPES: InputType[] = ['text', 'email', 'password', 'search', 'tel', 'url'];

/** Default typing speeds by input type in ms */
const TYPING_SPEEDS = {
  DEFAULT: 20,
  EMAIL: 25,
  PASSWORD: 15,
  SEARCH: 30,
  TEL: 20,
  URL: 25,
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
// HANDLER-LEVEL DEDUPLICATION
// ============================================================================

/** Active operations map for deduplication */
const activeOperations = new Map<string, Promise<InputDataResult>>();

/**
 * Create a unique operation key
 */
function createOperationKey(element: HTMLElement, value: string): string {
  const id = element.id || '';
  const name = (element as HTMLInputElement).name || '';
  const type = (element as HTMLInputElement).type || 'text';
  return `${type}:${id}:${name}:${value.substring(0, 50)}`;
}

// ============================================================================
// TEXT INPUT HANDLER CLASS
// ============================================================================

/**
 * Specialized handler for text inputs (text, email, password, search, tel, url)
 * Handles modern web app patterns and formatted input fields
 */
export class TextInputHandler implements InputHandler {
  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return SUPPORTED_TYPES.includes(inputType) && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA');
  }

  async handle(element: HTMLElement, value: string, options: TextInputOptions = {}): Promise<InputDataResult> {
    // Handler-level deduplication
    const opKey = createOperationKey(element, value);
    const existingOp = activeOperations.get(opKey);
    if (existingOp) {
      debug.log(LOG_PREFIX, 'Duplicate operation detected, reusing existing promise');
      return existingOp;
    }

    const operationPromise = this.executeHandle(element, value, options);
    activeOperations.set(opKey, operationPromise);

    try {
      return await operationPromise;
    } finally {
      activeOperations.delete(opKey);
    }
  }

  private async executeHandle(
    element: HTMLElement,
    value: string,
    options: TextInputOptions,
  ): Promise<InputDataResult> {
    try {
      const inputElement = element as HTMLInputElement | HTMLTextAreaElement;
      const inputType = (element as HTMLInputElement).type || 'text';

      debug.log(LOG_PREFIX, 'Handling input:', { type: inputType, id: inputElement.id });

      if (!isElementVisible(inputElement)) {
        scrollIntoView(inputElement);
      }
      await focusAndHighlight(inputElement);

      // Validate input value
      const validation = validateInputValue(element, value);
      if (!validation.valid) {
        return {
          status: 'error',
          message: validation.error ?? 'Invalid input value',
        };
      }

      // Detect modern framework
      const modernDetection = detectModernInput(element);

      // Move cursor to element if requested
      if (options.moveCursor) {
        moveCursorToElement(element);
      }

      // Clear field if requested
      if (options.clearFirst !== false) {
        inputElement.value = '';
      }

      // Handle different text input types with specialized logic
      switch (inputType) {
        case 'email':
          return await this.handleEmailInput(inputElement, value, options, modernDetection);
        case 'password':
          return await this.handlePasswordInput(inputElement, value, options, modernDetection);
        case 'search':
          return await this.handleSearchInput(inputElement, value, options, modernDetection);
        case 'tel':
          return await this.handleTelInput(inputElement, value, options, modernDetection);
        case 'url':
          return await this.handleUrlInput(inputElement, value, options, modernDetection);
        default:
          return await this.handleTextInput(inputElement, value, options, modernDetection);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling text input: ${errorMessage}`,
      };
    }
  }

  private async handleTextInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: ModernInputDetection,
  ): Promise<InputDataResult> {
    // Apply input mask if provided
    let processedValue = value;
    if (options.mask) {
      processedValue = this.applyInputMask(processedValue, options.mask);
    }

    // Handle max length
    if (options.maxLength && processedValue.length > options.maxLength) {
      processedValue = processedValue.substring(0, options.maxLength);
    }

    // Stream or set directly based on typingSpeed
    if (options.typingSpeed && options.typingSpeed > 0) {
      await streamText(inputElement, processedValue, {
        speed: options.typingSpeed ?? TYPING_SPEEDS.DEFAULT,
        triggerInputEvents: options.triggerEvents !== false,
        triggerChangeEvents: options.triggerEvents !== false,
        triggerKeyboardEvents: modernDetection.isReactComponent || modernDetection.isVueComponent,
      });
    } else {
      inputElement.value = processedValue;
      const events = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];
      if (modernDetection.isReactComponent) events.push('focus', 'blur');
      triggerInputEvents(inputElement, events);
    }

    // Show success feedback
    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    debug.log(LOG_PREFIX, 'Text input successful');

    return {
      status: 'success',
      message: 'Text input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: (inputElement as HTMLInputElement).type || 'text',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: getElementValue(inputElement),
      },
    };
  }

  private async handleEmailInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: ModernInputDetection,
  ): Promise<InputDataResult> {
    // Normalize email format
    const normalizedValue = value.toLowerCase().trim();

    // Stream email with validation
    await streamText(inputElement, normalizedValue, {
      speed: options.typingSpeed ?? TYPING_SPEEDS.EMAIL,
      triggerInputEvents: true,
      triggerChangeEvents: true,
      triggerKeyboardEvents: modernDetection.isReactComponent,
    });

    // Blur for validation
    if (modernDetection.isReactComponent) {
      inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    debug.log(LOG_PREFIX, 'Email input successful');

    return {
      status: 'success',
      message: 'Email input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: 'email',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: getElementValue(inputElement),
      },
    };
  }

  private async handlePasswordInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: ModernInputDetection,
  ): Promise<InputDataResult> {
    // For password fields, we don't show the actual value in feedback
    const displayValue = '•'.repeat(value.length);

    // Stream password (no visual feedback during typing for security)
    await streamText(inputElement, value, {
      speed: options.typingSpeed ?? TYPING_SPEEDS.PASSWORD,
      triggerInputEvents: true,
      triggerChangeEvents: true,
      triggerKeyboardEvents: false, // Don't trigger keyboard events for passwords
    });

    // Trigger password-specific events
    if (modernDetection.isReactComponent || modernDetection.isVueComponent) {
      inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    debug.log(LOG_PREFIX, 'Password input successful');

    return {
      status: 'success',
      message: 'Password input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: 'password',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: displayValue, // Don't expose actual password
      },
    };
  }

  private async handleSearchInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: ModernInputDetection,
  ): Promise<InputDataResult> {
    // Handle search-specific formatting
    const trimmedValue = value.trim();

    // Stream search term
    await streamText(inputElement, trimmedValue, {
      speed: options.typingSpeed ?? TYPING_SPEEDS.SEARCH,
      triggerInputEvents: true,
      triggerChangeEvents: true,
      triggerKeyboardEvents: modernDetection.isReactComponent,
    });

    // Trigger search-specific events
    if (modernDetection.isReactComponent) {
      // Simulate search button press or enter key
      inputElement.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
    }

    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    debug.log(LOG_PREFIX, 'Search input successful');

    return {
      status: 'success',
      message: 'Search input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: 'search',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: getElementValue(inputElement),
      },
    };
  }

  private async handleTelInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: ModernInputDetection,
  ): Promise<InputDataResult> {
    // Format phone number
    const formattedValue = this.formatPhoneNumber(value);

    // Stream phone number
    await streamText(inputElement, formattedValue, {
      speed: options.typingSpeed ?? TYPING_SPEEDS.TEL,
      triggerInputEvents: true,
      triggerChangeEvents: true,
      triggerKeyboardEvents: modernDetection.isReactComponent,
    });

    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    debug.log(LOG_PREFIX, 'Phone number input successful');

    return {
      status: 'success',
      message: 'Phone number input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: 'tel',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: getElementValue(inputElement),
      },
    };
  }

  private async handleUrlInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: ModernInputDetection,
  ): Promise<InputDataResult> {
    // Normalize URL format
    const normalizedValue = this.normalizeUrl(value);

    // Stream URL
    await streamText(inputElement, normalizedValue, {
      speed: options.typingSpeed ?? TYPING_SPEEDS.URL,
      triggerInputEvents: true,
      triggerChangeEvents: true,
      triggerKeyboardEvents: modernDetection.isReactComponent,
    });

    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    debug.log(LOG_PREFIX, 'URL input successful');

    return {
      status: 'success',
      message: 'URL input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: 'url',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: getElementValue(inputElement),
      },
    };
  }

  private applyInputMask(value: string, mask: string): string {
    let maskedValue = '';
    let valueIndex = 0;

    for (let i = 0; i < mask.length && valueIndex < value.length; i++) {
      if (mask[i] === '#') {
        // Placeholder for digit
        if (/[0-9]/.test(value[valueIndex])) {
          maskedValue += value[valueIndex];
          valueIndex++;
        }
      } else if (mask[i] === 'A') {
        // Placeholder for letter
        if (/[a-zA-Z]/.test(value[valueIndex])) {
          maskedValue += value[valueIndex];
          valueIndex++;
        }
      } else if (mask[i] === '*') {
        // Placeholder for any character
        maskedValue += value[valueIndex];
        valueIndex++;
      } else {
        // Literal character
        maskedValue += mask[i];
      }
    }

    return maskedValue;
  }

  private formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');

    // Format based on length
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }

    return phoneNumber; // Return as-is if not standard format
  }

  private normalizeUrl(url: string): string {
    let normalizedUrl = url.trim();

    // Add protocol if missing
    if (!normalizedUrl.match(/^https?:\/\//)) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    return normalizedUrl;
  }
}
