/**
 * Textarea Handler
 *
 * Specialized handler for textarea elements.
 * Handles multi-line text input, auto-resize, and modern web app patterns.
 */

import { debug as baseDebug } from '@extension/shared';
import { InputHandler, InputDataResult, TextInputOptions, InputType, ModernInputDetection } from './types';
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
const LOG_PREFIX = '[Textarea]';

/** Supported input types */
const SUPPORTED_TYPES: InputType[] = ['textarea'];

/** Default typing speed in ms */
const DEFAULT_TYPING_SPEED_MS = 20;

/** Minimum lines for auto-resize */
const MIN_AUTO_RESIZE_LINES = 3;

/** Default line height fallback */
const DEFAULT_LINE_HEIGHT_PX = 20;

/** Default auto-save delay in ms */
const DEFAULT_AUTO_SAVE_DELAY_MS = 2000;

/** Character limit warning threshold (90%) */
const LIMIT_WARNING_THRESHOLD = 0.9;

/** Value preview length for success message */
const VALUE_PREVIEW_LENGTH = 100;

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

/** Textarea element with auto-save timeout */
interface TextareaWithAutoSave extends HTMLTextAreaElement {
  __autoSaveTimeout?: ReturnType<typeof setTimeout>;
}

/** Counter options */
interface CounterOptions {
  showCharacterCount?: boolean;
  showWordCount?: boolean;
  maxCharacters?: number;
  maxWords?: number;
}

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
  const name = (element as HTMLTextAreaElement).name || '';
  const tag = element.tagName;
  return `${tag}:${id}:${name}:${value.substring(0, 50)}`;
}

// ============================================================================
// TEXTAREA HANDLER CLASS
// ============================================================================

/**
 * Specialized handler for textarea elements
 * Handles multi-line text input, auto-resize, and modern web app patterns
 */
export class TextareaHandler implements InputHandler {
  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return SUPPORTED_TYPES.includes(inputType) && element.tagName === 'TEXTAREA';
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
      const textareaElement = element as HTMLTextAreaElement;

      debug.log(LOG_PREFIX, 'Handling textarea:', { id: textareaElement.id, valueLength: value.length });

      if (!isElementVisible(textareaElement)) {
        scrollIntoView(textareaElement);
      }
      await focusAndHighlight(textareaElement);

      // Move cursor to element if requested
      if (options.moveCursor) {
        moveCursorToElement(element);
      }

      // Handle line breaks and formatting
      const formattedValue = this.formatTextareaValue(value, options);

      // Validate max length
      if (options.maxLength && formattedValue.length > options.maxLength) {
        return {
          status: 'error',
          message: `Text exceeds maximum length of ${options.maxLength} characters. Current length: ${formattedValue.length}`,
        };
      }

      // Clear field if requested
      if (options.clearFirst !== false) {
        textareaElement.value = '';
      }

      // Handle auto-resize if enabled
      if (this.isAutoResizeEnabled(textareaElement)) {
        this.handleAutoResize(textareaElement, formattedValue);
      }

      // Insert content with streaming or direct assignment
      if (options.typingSpeed && options.typingSpeed > 0) {
        await this.streamTextareaContent(textareaElement, formattedValue, options);
      } else {
        textareaElement.value = formattedValue;
        this.triggerTextareaEvents(textareaElement);
      }

      // Show success feedback
      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(textareaElement);
      }

      const previewValue =
        formattedValue.substring(0, VALUE_PREVIEW_LENGTH) + (formattedValue.length > VALUE_PREVIEW_LENGTH ? '...' : '');

      debug.log(LOG_PREFIX, 'Content updated successfully');

      return {
        status: 'success',
        message: 'Textarea content updated successfully',
        elementInfo: {
          tag: textareaElement.tagName,
          type: 'textarea',
          id: textareaElement.id,
          name: textareaElement.name || '',
          value: previewValue,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling textarea: ${errorMessage}`,
      };
    }
  }

  private formatTextareaValue(value: string, options: TextInputOptions): string {
    let formattedValue = value;

    // Convert different line break formats to standard \n
    formattedValue = formattedValue.replace(/\r\n/g, '\n'); // Windows
    formattedValue = formattedValue.replace(/\r/g, '\n'); // Mac

    // Handle text mask if provided
    if (options.mask) {
      formattedValue = this.applyTextareaMask(formattedValue, options.mask);
    }

    // Handle validation
    if (options.validation) {
      const lines = formattedValue.split('\n');
      const validLines = lines.filter(line => options.validation!.test(line));
      formattedValue = validLines.join('\n');
    }

    return formattedValue;
  }

  private applyTextareaMask(value: string, mask: string): string {
    const lines = value.split('\n');
    const maskedLines = lines.map(line => {
      let maskedLine = '';
      let valueIndex = 0;

      for (let i = 0; i < mask.length && valueIndex < line.length; i++) {
        if (mask[i] === '#') {
          maskedLine += line[valueIndex];
          valueIndex++;
        } else if (mask[i] === 'A') {
          if (/[a-zA-Z]/.test(line[valueIndex])) {
            maskedLine += line[valueIndex];
            valueIndex++;
          }
        } else if (mask[i] === '9') {
          if (/[0-9]/.test(line[valueIndex])) {
            maskedLine += line[valueIndex];
            valueIndex++;
          }
        } else {
          maskedLine += mask[i];
        }
      }

      return maskedLine;
    });

    return maskedLines.join('\n');
  }

  private isAutoResizeEnabled(textareaElement: HTMLTextAreaElement): boolean {
    const hasAutoResize =
      textareaElement.classList.contains('auto-resize') ||
      textareaElement.hasAttribute('data-auto-resize') ||
      textareaElement.style.resize === 'none';

    return hasAutoResize;
  }

  private handleAutoResize(textareaElement: HTMLTextAreaElement, content: string): void {
    textareaElement.style.height = 'auto';

    const computedStyle = window.getComputedStyle(textareaElement);
    const lineHeight = parseInt(computedStyle.lineHeight) || DEFAULT_LINE_HEIGHT_PX;
    const paddingTop = parseInt(computedStyle.paddingTop) || 0;
    const paddingBottom = parseInt(computedStyle.paddingBottom) || 0;
    const padding = paddingTop + paddingBottom;

    const lines = content.split('\n').length;
    const minHeight = lineHeight * MIN_AUTO_RESIZE_LINES + padding;
    const contentHeight = lineHeight * lines + padding;
    const newHeight = Math.max(minHeight, contentHeight);

    textareaElement.style.height = `${newHeight}px`;
  }

  private async streamTextareaContent(
    textareaElement: HTMLTextAreaElement,
    content: string,
    options: TextInputOptions,
  ): Promise<void> {
    const modernDetection = detectModernInput(textareaElement);
    const streamByLines = content.includes('\n') && content.length > VALUE_PREVIEW_LENGTH;

    if (streamByLines) {
      await this.streamByLines(textareaElement, content, options, modernDetection);
    } else {
      await streamText(textareaElement, content, {
        speed: options.typingSpeed ?? DEFAULT_TYPING_SPEED_MS,
        triggerInputEvents: options.triggerEvents !== false,
        triggerChangeEvents: options.triggerEvents !== false,
        triggerKeyboardEvents: modernDetection.isReactComponent,
      });
    }
  }

  private async streamByLines(
    textareaElement: HTMLTextAreaElement,
    content: string,
    options: TextInputOptions,
    modernDetection: ModernInputDetection,
  ): Promise<void> {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (i > 0) {
        textareaElement.value += '\n';
      }

      await streamText(textareaElement, line, {
        speed: options.typingSpeed ?? DEFAULT_TYPING_SPEED_MS,
        triggerInputEvents: options.triggerEvents !== false,
        triggerChangeEvents: false,
        triggerKeyboardEvents: modernDetection.isReactComponent,
      });

      if (this.isAutoResizeEnabled(textareaElement)) {
        this.handleAutoResize(textareaElement, textareaElement.value);
      }
    }

    if (options.triggerEvents !== false) {
      textareaElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
  }

  private triggerTextareaEvents(textareaElement: HTMLTextAreaElement): void {
    const modernDetection = detectModernInput(textareaElement);
    const events = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];

    if (modernDetection.isReactComponent) {
      events.push('focus', 'blur', 'keyup');
    }
    if (modernDetection.isVueComponent) {
      events.push('keyup');
    }

    triggerInputEvents(textareaElement, events);
  }

  /**
   * Handle textarea with placeholder text
   */
  async handleWithPlaceholder(
    selector: string,
    value: string,
    placeholder: string,
    options: TextInputOptions = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const textareaElement = elementInfo.element as HTMLTextAreaElement;
      const currentContent = textareaElement.value || '';
      const isEmpty = currentContent === '' || currentContent === placeholder;

      if (isEmpty && options.clearFirst !== false) {
        textareaElement.value = '';
      }

      return await this.handle(textareaElement, value, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error handling textarea with placeholder:', errorMessage);
      return {
        status: 'error',
        message: `Error handling textarea with placeholder: ${errorMessage}`,
      };
    }
  }

  /**
   * Handle textarea with character/word count
   */
  async handleWithCounters(
    selector: string,
    value: string,
    options: TextInputOptions & CounterOptions = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const textareaElement = elementInfo.element as HTMLTextAreaElement;

      // Validate limits
      if (options.maxCharacters && value.length > options.maxCharacters) {
        return {
          status: 'error',
          message: `Text exceeds maximum character limit of ${options.maxCharacters}. Current length: ${value.length}`,
        };
      }

      if (options.maxWords) {
        const wordCount = value
          .trim()
          .split(/\s+/)
          .filter(word => word.length > 0).length;
        if (wordCount > options.maxWords) {
          return {
            status: 'error',
            message: `Text exceeds maximum word limit of ${options.maxWords}. Current word count: ${wordCount}`,
          };
        }
      }

      const result = await this.handle(textareaElement, value, options);

      if (result.status === 'success') {
        if (options.showCharacterCount || options.showWordCount) {
          this.addCounters(textareaElement, options);
        }
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error handling textarea with counters:', errorMessage);
      return {
        status: 'error',
        message: `Error handling textarea with counters: ${errorMessage}`,
      };
    }
  }

  private addCounters(textareaElement: HTMLTextAreaElement, options: CounterOptions): void {
    const existingCounters = textareaElement.parentElement?.querySelector('.textarea-counters');
    if (existingCounters) {
      return;
    }

    const counterContainer = document.createElement('div');
    counterContainer.className = 'textarea-counters';
    counterContainer.style.cssText = `
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    `;

    const updateCounters = () => {
      const content = textareaElement.value;
      const characterCount = content.length;
      const wordCount = content
        .trim()
        .split(/\s+/)
        .filter(word => word.length > 0).length;

      let counterText = '';

      if (options.showCharacterCount) {
        const charLimit = options.maxCharacters ? `/${options.maxCharacters}` : '';
        counterText += `Characters: ${characterCount}${charLimit}`;
      }

      if (options.showWordCount) {
        if (counterText) counterText += ' | ';
        const wordLimit = options.maxWords ? `/${options.maxWords}` : '';
        counterText += `Words: ${wordCount}${wordLimit}`;
      }

      counterContainer.textContent = counterText;

      // Color coding for limits
      if (options.maxCharacters && characterCount > options.maxCharacters * LIMIT_WARNING_THRESHOLD) {
        counterContainer.style.color = characterCount > options.maxCharacters ? '#f44336' : '#ff9800';
      } else if (options.maxWords && wordCount > options.maxWords * LIMIT_WARNING_THRESHOLD) {
        counterContainer.style.color = wordCount > options.maxWords ? '#f44336' : '#ff9800';
      } else {
        counterContainer.style.color = '#666';
      }
    };

    textareaElement.parentElement?.insertBefore(counterContainer, textareaElement.nextSibling);
    updateCounters();
    textareaElement.addEventListener('input', updateCounters);
  }

  /**
   * Handle textarea with auto-save functionality
   */
  async handleWithAutoSave(
    selector: string,
    value: string,
    saveCallback?: (content: string) => void,
    options: TextInputOptions & { autoSaveDelay?: number } = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const textareaElement = elementInfo.element as TextareaWithAutoSave;
      const result = await this.handle(textareaElement, value, options);

      if (result.status === 'success' && saveCallback) {
        const delay = options.autoSaveDelay ?? DEFAULT_AUTO_SAVE_DELAY_MS;

        // Clear any existing auto-save timeout
        if (textareaElement.__autoSaveTimeout) {
          clearTimeout(textareaElement.__autoSaveTimeout);
        }

        // Set up new auto-save timeout
        textareaElement.__autoSaveTimeout = setTimeout(() => {
          saveCallback(textareaElement.value);
        }, delay);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error handling textarea with auto-save:', errorMessage);
      return {
        status: 'error',
        message: `Error handling textarea with auto-save: ${errorMessage}`,
      };
    }
  }

  /**
   * Handle textarea with syntax highlighting (for code editors)
   */
  async handleWithSyntaxHighlighting(
    selector: string,
    value: string,
    language: string = 'plaintext',
    options: TextInputOptions = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const textareaElement = elementInfo.element as HTMLTextAreaElement;
      const result = await this.handle(textareaElement, value, options);

      if (result.status === 'success') {
        if (!textareaElement.classList.contains('syntax-highlighted')) {
          textareaElement.classList.add('syntax-highlighted');
          textareaElement.setAttribute('data-language', language);
        }
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error handling textarea with syntax highlighting:', errorMessage);
      return {
        status: 'error',
        message: `Error handling textarea with syntax highlighting: ${errorMessage}`,
      };
    }
  }
}
