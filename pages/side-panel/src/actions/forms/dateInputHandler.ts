import { InputHandler, InputDataResult, InputHandlerOptions, DateInputOptions, InputType } from './types';
import { 
  findElement, 
  isElementVisible, 
  scrollIntoView, 
  focusAndHighlight, 
  streamText, 
  showSuccessFeedback, 
  getElementValue,
  triggerInputEvents,
  detectModernInput,
  moveCursorToElement
} from './utils';

/**
 * Specialized handler for date inputs (date, datetime-local, time, month, week)
 * Handles various date formats and modern web app patterns
 */
export class DateInputHandler implements InputHandler {
  private supportedTypes: InputType[] = ['date', 'datetime-local', 'time', 'month', 'week'];

  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return this.supportedTypes.includes(inputType) && element.tagName === 'INPUT';
  }

  async handle(
    element: HTMLElement, 
    value: string, 
    options: DateInputOptions = {}
  ): Promise<InputDataResult> {
    try {
      const inputElement = element as HTMLInputElement;
      const inputType = inputElement.type;
      
      // Move cursor to element if requested
      if (options.moveCursor) {
        moveCursorToElement(element);
      }
      
      // Parse and format the date value
      const formattedValue = this.formatDateValue(value, inputType, options);
      
      if (!formattedValue) {
        return {
          status: 'error',
          message: `Invalid date format for ${inputType} input. Expected format: ${this.getExpectedFormat(inputType)}`
        };
      }

      // Clear field if requested
      if (options.clearFirst !== false) {
        inputElement.value = '';
      }

      // Set the formatted value
      inputElement.value = formattedValue;
      
      // Trigger events for modern frameworks
      const modernDetection = detectModernInput(inputElement);
      const events = ['input', 'change'];
      
      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }
      
      triggerInputEvents(inputElement, events);
      
      // Show success feedback
      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(inputElement);
      }
      
      return {
        status: 'success',
        message: `${inputType} input successful`,
        elementInfo: {
          tag: inputElement.tagName,
          type: inputType,
          id: inputElement.id,
          name: inputElement.name || '',
          value: formattedValue
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling ${(element as HTMLInputElement).type} input: ${error instanceof Error ? error.message : 'Unknown error'}`
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
          return this.formatDate(date, options);
        case 'datetime-local':
          return this.formatDateTimeLocal(date, options);
        case 'time':
          return this.formatTime(date, options);
        case 'month':
          return this.formatMonth(date, options);
        case 'week':
          return this.formatWeek(date, options);
        default:
          return null;
      }
    } catch (error) {
      console.error('Error formatting date value:', error);
      return null;
    }
  }

  private parseDate(value: string, options: DateInputOptions): Date | null {
    // Try to parse various date formats
    const formats = [
      // ISO formats
      /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO datetime
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, // ISO datetime without seconds
      
      // US formats
      /^\d{1,2}\/\d{1,2}\/\d{4}$/, // MM/DD/YYYY
      /^\d{1,2}-\d{1,2}-\d{4}$/, // MM-DD-YYYY
      
      // EU formats
      /^\d{1,2}\.\d{1,2}\.\d{4}$/, // DD.MM.YYYY
      /^\d{1,2}\/\d{1,2}\/\d{4}$/, // DD/MM/YYYY
      
      // Time formats
      /^\d{1,2}:\d{2}$/, // HH:MM
      /^\d{1,2}:\d{2}:\d{2}$/, // HH:MM:SS
      
      // Relative dates
      /^(today|now)$/i,
      /^(tomorrow|next day)$/i,
      /^(yesterday|previous day)$/i,
      /^(\d+)\s*(days?|weeks?|months?|years?)\s*(ago|from now)$/i
    ];
    
    // Try native Date parsing first
    let date = new Date(value);
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
      
      const date = new Date();
      const multiplier = direction === 'ago' ? -1 : 1;
      
      switch (unit) {
        case 'day':
        case 'days':
          date.setDate(date.getDate() + (amount * multiplier));
          break;
        case 'week':
        case 'weeks':
          date.setDate(date.getDate() + (amount * 7 * multiplier));
          break;
        case 'month':
        case 'months':
          date.setMonth(date.getMonth() + (amount * multiplier));
          break;
        case 'year':
        case 'years':
          date.setFullYear(date.getFullYear() + (amount * multiplier));
          break;
      }
      
      return date;
    }
    
    // Try parsing with different formats
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
    // Try ISO format parsing
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoMatch) {
      const [, year, month, day, hour = '0', minute = '0', second = '0'] = isoMatch;
      return new Date(
        parseInt(year),
        parseInt(month) - 1, // Month is 0-indexed
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );
    }
    return null;
  }

  private parseUSDate(value: string): Date | null {
    // MM/DD/YYYY or MM-DD-YYYY
    const usMatch = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (usMatch) {
      const [, month, day, year] = usMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return null;
  }

  private parseEUDate(value: string): Date | null {
    // DD.MM.YYYY or DD/MM/YYYY
    const euMatch = value.match(/^(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})/);
    if (euMatch) {
      const [, day, month, year] = euMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return null;
  }

  private parseCustomDate(value: string, format?: string): Date | null {
    // Basic custom format parsing - can be extended
    if (!format) return null;
    
    // This is a simplified implementation
    // In a real-world scenario, you might want to use a library like date-fns or moment.js
    return new Date(value);
  }

  private formatDate(date: Date, options: DateInputOptions): string {
    // HTML date input expects YYYY-MM-DD format
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateTimeLocal(date: Date, options: DateInputOptions): string {
    // HTML datetime-local input expects YYYY-MM-DDTHH:MM format
    const dateStr = this.formatDate(date, options);
    const timeStr = this.formatTime(date, options);
    return `${dateStr}T${timeStr}`;
  }

  private formatTime(date: Date, options: DateInputOptions): string {
    // HTML time input expects HH:MM format
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private formatMonth(date: Date, options: DateInputOptions): string {
    // HTML month input expects YYYY-MM format
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private formatWeek(date: Date, options: DateInputOptions): string {
    // HTML week input expects YYYY-W## format
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  private getWeekNumber(date: Date): number {
    // Calculate ISO week number
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
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
    options: DateInputOptions = {}
  ): Promise<InputDataResult> {
    try {
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
      
      return {
        status: 'success',
        message: `Date range set successfully: ${fromValue} to ${toValue}`,
        elementInfo: {
          tag: 'INPUT',
          type: 'date',
          id: `${fromSelector} to ${toSelector}`,
          name: 'date-range',
          value: `${fromValue} to ${toValue}`
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling date range: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async handleDateBySelector(
    selector: string,
    value: string,
    options: DateInputOptions
  ): Promise<InputDataResult> {
    const elementInfo = findElement(selector);
    if (!elementInfo) {
      return {
        status: 'error',
        message: `Element not found with selector: ${selector}`
      };
    }
    
    if (!isElementVisible(elementInfo.element)) {
      return {
        status: 'error',
        message: `Element is not visible: ${selector}`
      };
    }
    
    scrollIntoView(elementInfo.element);
    focusAndHighlight(elementInfo.element);
    
    return await this.handle(elementInfo.element, value, options);
  }
}
