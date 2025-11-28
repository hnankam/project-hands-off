/**
 * Date Input Handler
 *
 * Specialized handler for date inputs (date, datetime-local, time, month, week).
 * Handles various date formats and modern web app patterns.
 */

import { debug as baseDebug } from '@extension/shared';
import { InputHandler, InputDataResult, DateInputOptions, InputType } from './types';
import {
  findElement,
  isElementVisible,
  scrollIntoView,
  focusAndHighlight,
  showSuccessFeedback,
  triggerInputEvents,
  detectModernInput,
  moveCursorToElement,
} from './utils';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for consistent logging */
const LOG_PREFIX = '[DateInput]';

/** Milliseconds per week for week number calculation */
const MS_PER_WEEK = 604800000;

/** Supported date input types */
const SUPPORTED_DATE_TYPES: InputType[] = ['date', 'datetime-local', 'time', 'month', 'week'];

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

/** Active operation tracking to prevent duplicate executions */
const activeOperations = new Map<string, Promise<InputDataResult>>();

/**
 * Create operation key for deduplication
 */
function createOperationKey(element: HTMLElement, value: string): string {
  const id = element.id || '';
  const name = (element as HTMLInputElement).name || '';
  const type = (element as HTMLInputElement).type || '';
  return `date:${type}:${id}:${name}:${value}`;
}

// ============================================================================
// HANDLER CLASS
// ============================================================================

/**
 * Specialized handler for date inputs (date, datetime-local, time, month, week)
 * Handles various date formats and modern web app patterns
 */
export class DateInputHandler implements InputHandler {
  private supportedTypes: InputType[] = SUPPORTED_DATE_TYPES;

  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return this.supportedTypes.includes(inputType) && element.tagName === 'INPUT';
  }

  async handle(element: HTMLElement, value: string, options: DateInputOptions = {}): Promise<InputDataResult> {
    const operationKey = createOperationKey(element, value);

    // Check for in-flight operation
    const existingOperation = activeOperations.get(operationKey);
    if (existingOperation) {
      debug.log(LOG_PREFIX, 'Duplicate operation blocked, reusing existing');
      return existingOperation;
    }

    // Create and track operation
    const operation = this.executeHandle(element, value, options);
    activeOperations.set(operationKey, operation);

    // Cleanup after completion
    operation.finally(() => {
      activeOperations.delete(operationKey);
    });

    return operation;
  }

  private async executeHandle(
    element: HTMLElement,
    value: string,
    options: DateInputOptions,
  ): Promise<InputDataResult> {
    try {
      const inputElement = element as HTMLInputElement;
      const inputType = inputElement.type as InputType;

      debug.log(LOG_PREFIX, 'Handling:', { type: inputType, id: inputElement.id, value });

      // Move cursor to element if requested
      if (options.moveCursor) {
        moveCursorToElement(element);
      }

      // Ensure visible and focused for realistic interaction
      if (!isElementVisible(inputElement)) {
        await scrollIntoView(inputElement);
      }
      await focusAndHighlight(inputElement);

      // Parse and format the date value
      const formattedValue = this.formatDateValue(value, inputType, options);

      if (!formattedValue) {
        debug.warn(LOG_PREFIX, 'Invalid date format:', { value, type: inputType });
        return {
          status: 'error',
          message: `Invalid date format for ${inputType} input. Expected format: ${this.getExpectedFormat(inputType)}`,
        };
      }

      // Clear field if requested
      if (options.clearFirst !== false) {
        inputElement.value = '';
      }

      // Early exit if value already matches
      if (inputElement.value === formattedValue) {
        debug.log(LOG_PREFIX, 'Value already set');
        return {
          status: 'success',
          message: `${inputType} already set`,
          elementInfo: {
            tag: inputElement.tagName,
            type: inputType,
            id: inputElement.id,
            name: inputElement.name || '',
            value: formattedValue,
          },
        };
      }

      // Set the formatted value
      inputElement.value = formattedValue;

      // Trigger events for modern frameworks
      const modernDetection = detectModernInput(inputElement);
      const events = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];

      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }

      triggerInputEvents(inputElement, events);

      // Show success feedback
      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(inputElement);
      }

      debug.log(LOG_PREFIX, 'Date input successful:', { formattedValue });

      return {
        status: 'success',
        message: `${inputType} input successful`,
        elementInfo: {
          tag: inputElement.tagName,
          type: inputType,
          id: inputElement.id,
          name: inputElement.name || '',
          value: formattedValue,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling ${(element as HTMLInputElement).type} input: ${errorMessage}`,
      };
    }
  }

  private formatDateValue(value: string, inputType: InputType, options: DateInputOptions): string | null {
    try {
      const date = this.parseDate(value, options);

      if (!date || isNaN(date.getTime())) {
        return null;
      }

      switch (inputType) {
        case 'date':
          return this.formatDate(date);
        case 'datetime-local':
          return this.formatDateTimeLocal(date);
        case 'time':
          return this.formatTime(date);
        case 'month':
          return this.formatMonth(date);
        case 'week':
          return this.formatWeek(date);
        default:
          return null;
      }
    } catch (error) {
      debug.error(LOG_PREFIX, 'Error formatting date value:', error);
      return null;
    }
  }

  private parseDate(value: string, options: DateInputOptions): Date | null {
    // Try native Date parsing first
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Handle relative dates
    if (/^(today|now)$/i.test(value)) {
      return new Date();
    }

    if (/^(tomorrow|next day)$/i.test(value)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    if (/^(yesterday|previous day)$/i.test(value)) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }

    // Handle relative time expressions
    const relativeMatch = value.match(/^(\d+)\s*(days?|weeks?|months?|years?)\s*(ago|from now)$/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2].toLowerCase();
      const direction = relativeMatch[3].toLowerCase();

      const relativeDate = new Date();
      const multiplier = direction === 'ago' ? -1 : 1;

      switch (unit) {
        case 'day':
        case 'days':
          relativeDate.setDate(relativeDate.getDate() + amount * multiplier);
          break;
        case 'week':
        case 'weeks':
          relativeDate.setDate(relativeDate.getDate() + amount * 7 * multiplier);
          break;
        case 'month':
        case 'months':
          relativeDate.setMonth(relativeDate.getMonth() + amount * multiplier);
          break;
        case 'year':
        case 'years':
          relativeDate.setFullYear(relativeDate.getFullYear() + amount * multiplier);
          break;
      }

      return relativeDate;
    }

    // Try parsing with different formats based on options
    const format = options.format || 'ISO';

    switch (format) {
      case 'US':
        return this.parseUSDate(value);
      case 'EU':
        return this.parseEUDate(value);
      case 'custom':
        return this.parseCustomDate(value, options.customFormat);
      default:
        return this.parseISODate(value);
    }
  }

  private parseISODate(value: string): Date | null {
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoMatch) {
      const [, year, month, day, hour = '0', minute = '0', second = '0'] = isoMatch;
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second),
      );
    }
    return null;
  }

  private parseUSDate(value: string): Date | null {
    const usMatch = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (usMatch) {
      const [, month, day, year] = usMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return null;
  }

  private parseEUDate(value: string): Date | null {
    const euMatch = value.match(/^(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})/);
    if (euMatch) {
      const [, day, month, year] = euMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return null;
  }

  private parseCustomDate(value: string, _format?: string): Date | null {
    // Basic custom format parsing - returns native parse result
    // In production, consider using date-fns or similar
    if (!_format) return null;
    return new Date(value);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateTimeLocal(date: Date): string {
    const dateStr = this.formatDate(date);
    const timeStr = this.formatTime(date);
    return `${dateStr}T${timeStr}`;
  }

  private formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private formatMonth(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private formatWeek(date: Date): string {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  private getWeekNumber(date: Date): number {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / MS_PER_WEEK);
  }

  private getExpectedFormat(inputType: InputType): string {
    switch (inputType) {
      case 'date':
        return 'YYYY-MM-DD (e.g., 2024-12-25)';
      case 'datetime-local':
        return 'YYYY-MM-DDTHH:MM (e.g., 2024-12-25T14:30)';
      case 'time':
        return 'HH:MM (e.g., 14:30)';
      case 'month':
        return 'YYYY-MM (e.g., 2024-12)';
      case 'week':
        return 'YYYY-W## (e.g., 2024-W52)';
      default:
        return 'ISO format';
    }
  }

  /**
   * Handle date range inputs (from/to dates)
   */
  async handleDateRange(
    fromSelector: string,
    toSelector: string,
    fromValue: string,
    toValue: string,
    options: DateInputOptions = {},
  ): Promise<InputDataResult> {
    try {
      debug.log(LOG_PREFIX, 'Handling date range:', { fromSelector, toSelector, fromValue, toValue });

      // Handle from date
      const fromResult = await this.handleDateBySelector(fromSelector, fromValue, options);
      if (fromResult.status === 'error') {
        return fromResult;
      }

      // Handle to date
      const toResult = await this.handleDateBySelector(toSelector, toValue, options);
      if (toResult.status === 'error') {
        return toResult;
      }

      debug.log(LOG_PREFIX, 'Date range set successfully');

      return {
        status: 'success',
        message: `Date range set successfully: ${fromValue} to ${toValue}`,
        elementInfo: {
          tag: 'INPUT',
          type: 'date',
          id: `${fromSelector} to ${toSelector}`,
          name: 'date-range',
          value: `${fromValue} to ${toValue}`,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Date range error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling date range: ${errorMessage}`,
      };
    }
  }

  private async handleDateBySelector(
    selector: string,
    value: string,
    options: DateInputOptions,
  ): Promise<InputDataResult> {
    const elementInfo = findElement(selector);
    if (!elementInfo) {
      return {
        status: 'error',
        message: `Element not found with selector: ${selector}`,
      };
    }

    if (!isElementVisible(elementInfo.element)) {
      return {
        status: 'error',
        message: `Element is not visible: ${selector}`,
      };
    }

    scrollIntoView(elementInfo.element);
    focusAndHighlight(elementInfo.element);

    return await this.handle(elementInfo.element, value, options);
  }
}
