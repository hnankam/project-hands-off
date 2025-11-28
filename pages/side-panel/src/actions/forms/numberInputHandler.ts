/**
 * Number Input Handler
 *
 * Specialized handler for number inputs (number, range).
 * Handles numeric validation, formatting, and modern web app patterns.
 */

import { debug as baseDebug } from '@extension/shared';
import { InputHandler, InputDataResult, NumberInputOptions, InputType } from './types';
import {
  findElement,
  isElementVisible,
  scrollIntoView,
  focusAndHighlight,
  streamText,
  showSuccessFeedback,
  triggerInputEvents,
  detectModernInput,
  moveCursorToElement,
} from './utils';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for consistent logging */
const LOG_PREFIX = '[NumberInput]';

/** Supported input types */
const SUPPORTED_TYPES: InputType[] = ['number', 'range'];

/** Default animation steps for range input */
const DEFAULT_ANIMATION_STEPS = 50;

/** Default animation duration in ms */
const DEFAULT_ANIMATION_DURATION_MS = 1000;

/** Float comparison epsilon */
const FLOAT_EPSILON = 0.0001;

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
  const tag = element.tagName;
  return `${tag}:${id}:${name}:${value}`;
}

// ============================================================================
// NUMBER INPUT HANDLER CLASS
// ============================================================================

/**
 * Specialized handler for number inputs (number, range)
 * Handles numeric validation, formatting, and modern web app patterns
 */
export class NumberInputHandler implements InputHandler {
  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return SUPPORTED_TYPES.includes(inputType) && element.tagName === 'INPUT';
  }

  async handle(element: HTMLElement, value: string, options: NumberInputOptions = {}): Promise<InputDataResult> {
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
    options: NumberInputOptions,
  ): Promise<InputDataResult> {
    try {
      const inputElement = element as HTMLInputElement;
      const inputType = inputElement.type;

      debug.log(LOG_PREFIX, 'Handling number input:', { type: inputType, value });

      // Move cursor to element if requested
      if (options.moveCursor) {
        moveCursorToElement(element);
      }
      if (!isElementVisible(inputElement)) {
        await scrollIntoView(inputElement);
      }
      await focusAndHighlight(inputElement);

      // Parse and validate the number
      const numberValue = this.parseNumber(value, options);

      if (numberValue === null) {
        return {
          status: 'error',
          message: `Invalid number format: "${value}". Expected a valid number.`,
        };
      }

      // Validate against input constraints
      const validation = this.validateNumber(numberValue, inputElement, options);
      if (!validation.valid) {
        return {
          status: 'error',
          message: validation.error ?? 'Number validation failed',
        };
      }

      // Format the number based on precision
      const formattedValue = this.formatNumber(numberValue, options);

      // Clear field if requested
      if (options.clearFirst !== false) {
        inputElement.value = '';
      }

      // Handle different number input types
      if (inputType === 'range') {
        return await this.handleRangeInput(inputElement, formattedValue, options);
      } else {
        return await this.handleNumberInput(inputElement, formattedValue, options);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling ${(element as HTMLInputElement).type} input: ${errorMessage}`,
      };
    }
  }

  private async handleNumberInput(
    inputElement: HTMLInputElement,
    formattedValue: string,
    options: NumberInputOptions,
  ): Promise<InputDataResult> {
    const modernDetection = detectModernInput(inputElement);

    // For number inputs, we can use direct value assignment or streaming
    if (options.typingSpeed && options.typingSpeed > 0) {
      // Use streaming for visual effect
      await streamText(inputElement, formattedValue, {
        speed: options.typingSpeed,
        triggerInputEvents: options.triggerEvents !== false,
        triggerChangeEvents: options.triggerEvents !== false,
        triggerKeyboardEvents: modernDetection.isReactComponent,
      });
    } else {
      // Direct assignment for better performance
      inputElement.value = formattedValue;

      // Trigger events
      const events = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];
      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }
      triggerInputEvents(inputElement, events);
    }

    // Show success feedback
    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    debug.log(LOG_PREFIX, 'Number input successful:', formattedValue);

    return {
      status: 'success',
      message: `Number input successful: ${formattedValue}`,
      elementInfo: {
        tag: inputElement.tagName,
        type: inputElement.type,
        id: inputElement.id,
        name: inputElement.name || '',
        value: formattedValue,
      },
    };
  }

  private async handleRangeInput(
    inputElement: HTMLInputElement,
    formattedValue: string,
    options: NumberInputOptions,
  ): Promise<InputDataResult> {
    const modernDetection = detectModernInput(inputElement);

    // For range inputs, we typically want immediate value setting
    inputElement.value = formattedValue;

    // Trigger events for range inputs
    const events = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];
    if (modernDetection.isReactComponent) {
      events.push('focus', 'blur');
    }
    triggerInputEvents(inputElement, events);

    // Show success feedback
    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    debug.log(LOG_PREFIX, 'Range input set to:', formattedValue);

    return {
      status: 'success',
      message: `Range input set to: ${formattedValue}`,
      elementInfo: {
        tag: inputElement.tagName,
        type: inputElement.type,
        id: inputElement.id,
        name: inputElement.name || '',
        value: formattedValue,
      },
    };
  }

  private parseNumber(value: string, _options: NumberInputOptions): number | null {
    // Remove thousands separators and normalize decimal delimiter
    // Note: Using simpler regex without lookbehind for broader browser support
    let normalized = value.trim().replace(/\s/g, '');

    // Remove grouping commas (e.g., 1,234,567 -> 1234567)
    // This handles commas followed by exactly 3 digits
    normalized = normalized.replace(/,(\d{3})(?=,|\D|$)/g, '$1');

    // Allow only digits, minus, and dot
    const cleanValue = normalized.replace(/[^\d.-]/g, '');

    // Handle empty string
    if (cleanValue === '' || cleanValue === '-') {
      return null;
    }

    // Parse the number
    const number = parseFloat(cleanValue);

    // Check if it's a valid number
    if (isNaN(number)) {
      return null;
    }

    return number;
  }

  private validateNumber(
    number: number,
    inputElement: HTMLInputElement,
    options: NumberInputOptions,
  ): { valid: boolean; error?: string } {
    // Check min constraint
    const min = options.min ?? parseFloat(inputElement.min);
    if (!isNaN(min) && number < min) {
      return { valid: false, error: `Number must be at least ${min}` };
    }

    // Check max constraint
    const max = options.max ?? parseFloat(inputElement.max);
    if (!isNaN(max) && number > max) {
      return { valid: false, error: `Number must be at most ${max}` };
    }

    // Check step constraint
    const step = options.step ?? parseFloat(inputElement.step);
    if (!isNaN(step) && step > 0) {
      const remainder = (number - (min || 0)) % step;
      if (Math.abs(remainder) > FLOAT_EPSILON && Math.abs(remainder - step) > FLOAT_EPSILON) {
        return { valid: false, error: `Number must be a multiple of ${step}` };
      }
    }

    return { valid: true };
  }

  private formatNumber(number: number, options: NumberInputOptions): string {
    const precision = options.precision;

    if (precision !== undefined) {
      return number.toFixed(precision);
    }

    // Default formatting - keep as-is
    return number.toString();
  }

  /**
   * Handle number input with increment/decrement
   */
  async handleNumberIncrement(
    selector: string,
    increment: number,
    options: NumberInputOptions = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const inputElement = elementInfo.element as HTMLInputElement;
      const currentValue = parseFloat(inputElement.value) || 0;
      const newValue = currentValue + increment;

      debug.log(LOG_PREFIX, 'Incrementing:', { from: currentValue, by: increment, to: newValue });

      return await this.handle(inputElement, newValue.toString(), options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error incrementing number:', errorMessage);
      return {
        status: 'error',
        message: `Error incrementing number: ${errorMessage}`,
      };
    }
  }

  /**
   * Handle range input with smooth animation
   */
  async handleRangeWithAnimation(
    selector: string,
    targetValue: number,
    duration: number = DEFAULT_ANIMATION_DURATION_MS,
    options: NumberInputOptions = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const inputElement = elementInfo.element as HTMLInputElement;
      const startValue = parseFloat(inputElement.value) || 0;
      const difference = targetValue - startValue;
      const steps = DEFAULT_ANIMATION_STEPS;
      const stepDuration = duration / steps;
      const stepIncrement = difference / steps;

      debug.log(LOG_PREFIX, 'Animating range:', { from: startValue, to: targetValue, steps, duration });

      // Animate the range input
      for (let i = 0; i <= steps; i++) {
        const currentValue = startValue + stepIncrement * i;
        inputElement.value = this.formatNumber(currentValue, options);

        // Trigger input event for each step
        inputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

        // Wait for next step
        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }

      // Final change event
      inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(inputElement);
      }

      const finalValue = this.formatNumber(targetValue, options);

      return {
        status: 'success',
        message: `Range animated to: ${finalValue}`,
        elementInfo: {
          tag: inputElement.tagName,
          type: inputElement.type,
          id: inputElement.id,
          name: inputElement.name || '',
          value: finalValue,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error animating range:', errorMessage);
      return {
        status: 'error',
        message: `Error animating range: ${errorMessage}`,
      };
    }
  }

  /**
   * Handle number input with currency formatting
   */
  async handleCurrencyInput(
    selector: string,
    value: string,
    currency: string = 'USD',
    options: NumberInputOptions = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const inputElement = elementInfo.element as HTMLInputElement;

      // Parse currency value
      const numberValue = this.parseCurrency(value);
      if (numberValue === null) {
        return {
          status: 'error',
          message: `Invalid currency format: ${value}`,
        };
      }

      // Format as currency
      const formattedValue = this.formatCurrency(numberValue, currency, options);

      debug.log(LOG_PREFIX, 'Currency input:', { value, currency, formatted: formattedValue });

      // Set the value
      inputElement.value = formattedValue;

      // Trigger events
      const modernDetection = detectModernInput(inputElement);
      const events = ['input', 'change'];
      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }
      triggerInputEvents(inputElement, events);

      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(inputElement);
      }

      return {
        status: 'success',
        message: `Currency input successful: ${formattedValue}`,
        elementInfo: {
          tag: inputElement.tagName,
          type: inputElement.type,
          id: inputElement.id,
          name: inputElement.name || '',
          value: formattedValue,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error handling currency input:', errorMessage);
      return {
        status: 'error',
        message: `Error handling currency input: ${errorMessage}`,
      };
    }
  }

  private parseCurrency(value: string): number | null {
    // Remove currency symbols and formatting
    const cleanValue = value.replace(/[^\d.-]/g, '');
    return this.parseNumber(cleanValue, {});
  }

  private formatCurrency(number: number, currency: string, options: NumberInputOptions): string {
    const precision = options.precision ?? 2;

    // Basic currency formatting
    switch (currency.toUpperCase()) {
      case 'USD':
        return `$${number.toFixed(precision)}`;
      case 'EUR':
        return `€${number.toFixed(precision)}`;
      case 'GBP':
        return `£${number.toFixed(precision)}`;
      case 'JPY':
        return `¥${number.toFixed(0)}`; // JPY typically doesn't use decimals
      default:
        return `${number.toFixed(precision)} ${currency}`;
    }
  }
}
