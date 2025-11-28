/**
 * ContentEditable Handler
 *
 * Specialized handler for contenteditable elements.
 * Handles rich text editing, HTML content, and modern web app patterns.
 */

import { debug as baseDebug } from '@extension/shared';
import { InputHandler, InputDataResult, ContentEditableOptions, InputType } from './types';
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
const LOG_PREFIX = '[ContentEditable]';

/** Minimum typing speed (ms per character) */
const MIN_TYPING_SPEED_MS = 10;

/** Maximum typing speed (ms per character) */
const MAX_TYPING_SPEED_MS = 50;

/** Default typing speed (ms per character) */
const DEFAULT_TYPING_SPEED_MS = 20;

/** Character limit warning threshold (percentage) */
const CHAR_LIMIT_WARNING_THRESHOLD = 0.9;

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
  const tagName = element.tagName;
  // Use first 50 chars of value for key
  const valueKey = value.substring(0, 50);
  return `contenteditable:${id}:${tagName}:${valueKey}`;
}

// ============================================================================
// HANDLER CLASS
// ============================================================================

/**
 * Specialized handler for contenteditable elements
 * Handles rich text editing, HTML content, and modern web app patterns
 */
export class ContentEditableHandler implements InputHandler {
  private supportedTypes: InputType[] = ['contenteditable'];

  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return this.supportedTypes.includes(inputType) && element.hasAttribute('contenteditable');
  }

  async handle(element: HTMLElement, value: string, options: ContentEditableOptions = {}): Promise<InputDataResult> {
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
    options: ContentEditableOptions,
  ): Promise<InputDataResult> {
    try {
      debug.log(LOG_PREFIX, 'Handling:', { id: element.id, valueLen: value.length });

      // Ensure interactable state
      if (!isElementVisible(element)) {
        await scrollIntoView(element);
      }
      await focusAndHighlight(element);

      const insertMode = options.insertMode || 'replace';
      const htmlContent = options.htmlContent || false;

      // Move cursor to element if requested
      if (options.moveCursor) {
        moveCursorToElement(element);
      }

      // Clear content if replacing
      if (insertMode === 'replace' && options.clearFirst !== false) {
        this.clearContent(element);
      }

      // Handle different content types
      if (htmlContent) {
        return await this.handleHtmlContent(element, value, options);
      } else {
        return await this.handleTextContent(element, value, options);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling contenteditable: ${errorMessage}`,
      };
    }
  }

  private async handleTextContent(
    element: HTMLElement,
    value: string,
    options: ContentEditableOptions,
  ): Promise<InputDataResult> {
    const insertMode = options.insertMode || 'replace';
    const preserveFormatting = options.preserveFormatting || false;

    // Prepare content based on insert mode
    let contentToInsert = value;

    if (insertMode === 'append') {
      const existingContent = element.textContent || '';
      contentToInsert = existingContent + value;
    } else if (insertMode === 'prepend') {
      const existingContent = element.textContent || '';
      contentToInsert = value + existingContent;
    }

    // Handle formatting preservation
    if (preserveFormatting) {
      contentToInsert = this.preserveTextFormatting(element, contentToInsert);
    }

    // Use streaming for text content if typing speed specified
    if (options.typingSpeed && options.typingSpeed > 0) {
      await this.streamTextContent(element, contentToInsert, options);
    } else {
      // Direct content setting
      element.textContent = contentToInsert;
      this.triggerContentEditableEvents(element, options);
    }

    // Show success feedback
    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(element);
    }

    debug.log(LOG_PREFIX, 'Text content updated');

    return {
      status: 'success',
      message: 'Contenteditable text content updated successfully',
      elementInfo: {
        tag: element.tagName,
        type: 'contenteditable',
        id: element.id,
        name: element.getAttribute('name') || '',
        value: element.textContent || '',
      },
    };
  }

  private async handleHtmlContent(
    element: HTMLElement,
    value: string,
    options: ContentEditableOptions,
  ): Promise<InputDataResult> {
    const insertMode = options.insertMode || 'replace';

    // Prepare HTML content based on insert mode
    let contentToInsert = value;

    if (insertMode === 'append') {
      const existingContent = element.innerHTML || '';
      contentToInsert = existingContent + value;
    } else if (insertMode === 'prepend') {
      const existingContent = element.innerHTML || '';
      contentToInsert = value + existingContent;
    }

    // Set HTML content directly
    element.innerHTML = contentToInsert;

    // Trigger events
    this.triggerContentEditableEvents(element, options);

    // Show success feedback
    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(element);
    }

    debug.log(LOG_PREFIX, 'HTML content updated');

    return {
      status: 'success',
      message: 'Contenteditable HTML content updated successfully',
      elementInfo: {
        tag: element.tagName,
        type: 'contenteditable',
        id: element.id,
        name: element.getAttribute('name') || '',
        value: element.textContent || '',
      },
    };
  }

  private async streamTextContent(
    element: HTMLElement,
    content: string,
    options: ContentEditableOptions,
  ): Promise<void> {
    const chars = content.split('');
    const typingSpeed = Math.max(
      MIN_TYPING_SPEED_MS,
      Math.min(MAX_TYPING_SPEED_MS, options.typingSpeed || DEFAULT_TYPING_SPEED_MS),
    );

    for (let i = 0; i < chars.length; i++) {
      const currentContent = content.substring(0, i + 1);
      element.textContent = currentContent;
      // Fire events during streaming for framework bindings
      this.triggerContentEditableEvents(element, options, i === chars.length - 1);

      await new Promise(resolve => setTimeout(resolve, typingSpeed));
    }
  }

  private triggerContentEditableEvents(
    element: HTMLElement,
    options: ContentEditableOptions,
    isFinal: boolean = true,
  ): void {
    const modernDetection = detectModernInput(element);
    const events = ['input'];

    if (modernDetection.isReactComponent) {
      events.unshift('focus');
      events.push('keyup');
      if (isFinal) events.push('blur');
    }
    if (modernDetection.isVueComponent) {
      events.push('keyup');
    }

    // Some editors rely on selection changes
    document.dispatchEvent(new Event('selectionchange'));
    triggerInputEvents(element, events);
  }

  private clearContent(element: HTMLElement): void {
    element.textContent = '';
    element.innerHTML = '';
    this.triggerContentEditableEvents(element, {}, false);
  }

  private preserveTextFormatting(element: HTMLElement, content: string): string {
    const currentFormatting = this.getCurrentFormatting();

    let formattedContent = content;

    if (currentFormatting.bold) {
      formattedContent = `<strong>${formattedContent}</strong>`;
    }
    if (currentFormatting.italic) {
      formattedContent = `<em>${formattedContent}</em>`;
    }
    if (currentFormatting.underline) {
      formattedContent = `<u>${formattedContent}</u>`;
    }

    return formattedContent;
  }

  private getCurrentFormatting(): {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    fontSize: string;
    fontFamily: string;
    color: string;
  } {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return {
        bold: false,
        italic: false,
        underline: false,
        fontSize: '',
        fontFamily: '',
        color: '',
      };
    }

    const range = selection.getRangeAt(0);

    if (range.collapsed) {
      return {
        bold: false,
        italic: false,
        underline: false,
        fontSize: '',
        fontFamily: '',
        color: '',
      };
    }

    // Get formatting from current selection
    // Note: execCommand is deprecated but still works for querying state
    const isBold = document.queryCommandState('bold');
    const isItalic = document.queryCommandState('italic');
    const isUnderline = document.queryCommandState('underline');

    return {
      bold: isBold,
      italic: isItalic,
      underline: isUnderline,
      fontSize: '',
      fontFamily: '',
      color: '',
    };
  }

  /**
   * Handle rich text formatting
   * Note: Uses deprecated execCommand API - consider modern alternatives for new features
   */
  async applyFormatting(
    selector: string,
    formatting: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      fontSize?: string;
      fontFamily?: string;
      color?: string;
    },
    options: ContentEditableOptions = {},
  ): Promise<InputDataResult> {
    try {
      debug.log(LOG_PREFIX, 'Applying formatting:', { selector, formatting });

      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const element = elementInfo.element;

      if (!element.hasAttribute('contenteditable')) {
        return {
          status: 'error',
          message: 'Element is not contenteditable',
        };
      }

      // Focus the element
      element.focus();

      // Apply formatting commands (deprecated but still functional)
      if (formatting.bold !== undefined) {
        document.execCommand('bold', false, undefined);
      }
      if (formatting.italic !== undefined) {
        document.execCommand('italic', false, undefined);
      }
      if (formatting.underline !== undefined) {
        document.execCommand('underline', false, undefined);
      }
      if (formatting.fontSize) {
        document.execCommand('fontSize', false, '3');
      }
      if (formatting.color) {
        document.execCommand('foreColor', false, formatting.color);
      }

      // Trigger events
      this.triggerContentEditableEvents(element, options);

      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(element);
      }

      debug.log(LOG_PREFIX, 'Formatting applied');

      return {
        status: 'success',
        message: 'Formatting applied successfully',
        elementInfo: {
          tag: element.tagName,
          type: 'contenteditable',
          id: element.id,
          name: element.getAttribute('name') || '',
          value: element.textContent || '',
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Formatting error:', errorMessage);
      return {
        status: 'error',
        message: `Error applying formatting: ${errorMessage}`,
      };
    }
  }

  /**
   * Handle contenteditable with placeholder text
   */
  async handleWithPlaceholder(
    selector: string,
    value: string,
    placeholder: string,
    options: ContentEditableOptions = {},
  ): Promise<InputDataResult> {
    try {
      debug.log(LOG_PREFIX, 'Handling with placeholder:', { selector, placeholder });

      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const element = elementInfo.element;

      // Check if element is empty or contains only placeholder
      const currentContent = element.textContent || '';
      const isEmpty = currentContent === '' || currentContent === placeholder;

      if (isEmpty && options.clearFirst !== false) {
        element.textContent = '';
      }

      // Insert the value
      const insertMode = options.insertMode || 'replace';
      let contentToInsert = value;

      if (insertMode === 'append') {
        contentToInsert = currentContent + value;
      } else if (insertMode === 'prepend') {
        contentToInsert = value + currentContent;
      }

      // Set content
      if (options.typingSpeed && options.typingSpeed > 0) {
        await this.streamTextContent(element, contentToInsert, options);
      } else {
        element.textContent = contentToInsert;
        this.triggerContentEditableEvents(element, options);
      }

      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(element);
      }

      debug.log(LOG_PREFIX, 'Placeholder content updated');

      return {
        status: 'success',
        message: 'Contenteditable with placeholder updated successfully',
        elementInfo: {
          tag: element.tagName,
          type: 'contenteditable',
          id: element.id,
          name: element.getAttribute('name') || '',
          value: element.textContent || '',
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Placeholder handling error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling contenteditable with placeholder: ${errorMessage}`,
      };
    }
  }

  /**
   * Handle contenteditable with auto-save functionality
   */
  async handleWithAutoSave(
    selector: string,
    value: string,
    saveCallback?: (content: string) => void,
    options: ContentEditableOptions = {},
  ): Promise<InputDataResult> {
    try {
      debug.log(LOG_PREFIX, 'Handling with auto-save:', { selector });

      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const element = elementInfo.element;

      // Set content
      const result = await this.handle(element, value, options);

      if (result.status === 'success' && saveCallback) {
        // Trigger auto-save
        saveCallback(element.textContent || '');
        debug.log(LOG_PREFIX, 'Auto-save triggered');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Auto-save handling error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling contenteditable with auto-save: ${errorMessage}`,
      };
    }
  }

  /**
   * Handle contenteditable with character limit
   */
  async handleWithCharacterLimit(
    selector: string,
    value: string,
    maxLength: number,
    options: ContentEditableOptions = {},
  ): Promise<InputDataResult> {
    try {
      debug.log(LOG_PREFIX, 'Handling with character limit:', { selector, maxLength, valueLen: value.length });

      if (value.length > maxLength) {
        return {
          status: 'error',
          message: `Content exceeds character limit of ${maxLength}. Content length: ${value.length}`,
        };
      }

      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const element = elementInfo.element;

      // Set content with character limit validation
      const result = await this.handle(element, value, options);

      if (result.status === 'success') {
        // Add character count display
        this.addCharacterCountDisplay(element, maxLength);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Character limit handling error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling contenteditable with character limit: ${errorMessage}`,
      };
    }
  }

  private addCharacterCountDisplay(element: HTMLElement, maxLength: number): void {
    // Check if character count display already exists
    const existingCounter = element.parentElement?.querySelector('.character-counter');
    if (existingCounter) {
      return;
    }

    // Create character counter
    const counter = document.createElement('div');
    counter.className = 'character-counter';
    counter.style.cssText = `
      font-size: 12px;
      color: #666;
      text-align: right;
      margin-top: 5px;
    `;

    const updateCounter = () => {
      const currentLength = element.textContent?.length || 0;
      counter.textContent = `${currentLength}/${maxLength}`;

      if (currentLength > maxLength * CHAR_LIMIT_WARNING_THRESHOLD) {
        counter.style.color = '#ff9800';
      } else if (currentLength > maxLength) {
        counter.style.color = '#f44336';
      } else {
        counter.style.color = '#666';
      }
    };

    // Insert counter after the element
    element.parentElement?.insertBefore(counter, element.nextSibling);

    // Update counter initially and on input
    updateCounter();
    element.addEventListener('input', updateCounter);
  }
}
