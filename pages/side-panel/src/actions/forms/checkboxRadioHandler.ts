/**
 * Checkbox and Radio Input Handler
 *
 * Specialized handler for checkbox and radio inputs.
 * Handles modern web app patterns and grouped radio buttons.
 */

import { debug as baseDebug } from '@extension/shared';
import { InputHandler, InputDataResult, CheckboxRadioOptions, InputType } from './types';
import {
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
const LOG_PREFIX = '[CheckboxRadio]';

/** Timeout for verifying checked state (ms) */
const VERIFY_STATE_TIMEOUT_MS = 600;

/** Retry interval for state verification (ms) */
const VERIFY_RETRY_INTERVAL_MS = 50;

/** Boolean-like true values */
const TRUTHY_VALUES = ['true', '1', 'yes', 'on', 'checked', 'select', 'enable'] as const;

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
  return `checkbox:${id}:${name}:${value}`;
}

// ============================================================================
// HANDLER CLASS
// ============================================================================

/**
 * Specialized handler for checkbox and radio inputs
 * Handles modern web app patterns and grouped radio buttons
 */
export class CheckboxRadioHandler implements InputHandler {
  private supportedTypes: InputType[] = ['checkbox', 'radio'];

  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return this.supportedTypes.includes(inputType) && element.tagName === 'INPUT';
  }

  async handle(element: HTMLElement, value: string, options: CheckboxRadioOptions = {}): Promise<InputDataResult> {
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
    options: CheckboxRadioOptions,
  ): Promise<InputDataResult> {
    try {
      const inputElement = element as HTMLInputElement;
      const inputType = inputElement.type;

      debug.log(LOG_PREFIX, 'Handling:', { type: inputType, id: inputElement.id, value });

      // Move cursor to element if requested
      if (options.moveCursor) {
        moveCursorToElement(element);
      }

      // Ensure element is visible and scrolled into view
      if (!isElementVisible(inputElement)) {
        await scrollIntoView(inputElement);
      }
      await focusAndHighlight(inputElement);

      // Parse the value to determine if it should be checked
      const shouldCheck = this.parseCheckValue(value, options);

      // Handle radio button groups vs checkboxes
      if (inputType === 'radio') {
        return await this.handleRadioButton(inputElement, shouldCheck, options);
      } else {
        return await this.handleCheckbox(inputElement, shouldCheck, options);
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

  private async handleCheckbox(
    inputElement: HTMLInputElement,
    shouldCheck: boolean,
    options: CheckboxRadioOptions,
  ): Promise<InputDataResult> {
    const modernDetection = detectModernInput(inputElement);

    // Early exit when no change is needed
    if (inputElement.checked === shouldCheck && !inputElement.indeterminate) {
      debug.log(LOG_PREFIX, 'Checkbox already in desired state');
      return {
        status: 'success',
        message: `Checkbox already ${shouldCheck ? 'checked' : 'unchecked'}`,
        elementInfo: {
          tag: inputElement.tagName,
          type: inputElement.type,
          id: inputElement.id,
          name: inputElement.name || '',
          value: shouldCheck ? 'checked' : 'unchecked',
        },
      };
    }

    // Clear indeterminate state if present
    if (inputElement.indeterminate) {
      inputElement.indeterminate = false;
    }

    // Primary approach: set property then dispatch realistic event sequence
    inputElement.checked = shouldCheck;
    const baseEvents = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];
    if (modernDetection.isReactComponent) {
      baseEvents.unshift('focus');
      baseEvents.push('blur');
    }
    triggerInputEvents(inputElement, baseEvents);

    // Verify the state; if not applied, try label click/click fallback
    const verified = await this.verifyCheckedState(inputElement, shouldCheck, VERIFY_STATE_TIMEOUT_MS);
    if (!verified) {
      debug.log(LOG_PREFIX, 'State not verified, trying fallback');
      // Try clicking associated <label for="id">
      const label = inputElement.id ? this.findLabelForElement(inputElement.id) : null;
      if (label) {
        label.click();
      } else {
        inputElement.click();
      }
    }

    // Final verification
    const finalStateOk = await this.verifyCheckedState(inputElement, shouldCheck, VERIFY_STATE_TIMEOUT_MS);

    if (options.showSuccessFeedback !== false && finalStateOk) {
      showSuccessFeedback(inputElement);
    }

    debug.log(LOG_PREFIX, 'Checkbox result:', { success: finalStateOk, checked: inputElement.checked });

    return {
      status: finalStateOk ? 'success' : 'error',
      message: finalStateOk
        ? `Checkbox ${shouldCheck ? 'checked' : 'unchecked'} successfully`
        : 'Failed to set checkbox state',
      elementInfo: {
        tag: inputElement.tagName,
        type: inputElement.type,
        id: inputElement.id,
        name: inputElement.name || '',
        value: inputElement.checked ? 'checked' : 'unchecked',
      },
    };
  }

  private async handleRadioButton(
    inputElement: HTMLInputElement,
    shouldCheck: boolean,
    options: CheckboxRadioOptions,
  ): Promise<InputDataResult> {
    const modernDetection = detectModernInput(inputElement);

    if (shouldCheck) {
      if (inputElement.checked) {
        debug.log(LOG_PREFIX, 'Radio already selected');
        return {
          status: 'success',
          message: 'Radio button already selected',
          elementInfo: {
            tag: inputElement.tagName,
            type: inputElement.type,
            id: inputElement.id,
            name: inputElement.name || '',
            value: 'selected',
          },
        };
      }

      // Uncheck other radio buttons in the same group
      this.uncheckRadioGroup(inputElement);

      // Check this radio button
      inputElement.checked = true;

      // Trigger events
      const events = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];
      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }
      triggerInputEvents(inputElement, events);

      // Show success feedback
      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(inputElement);
      }

      debug.log(LOG_PREFIX, 'Radio button selected');

      return {
        status: 'success',
        message: 'Radio button selected successfully',
        elementInfo: {
          tag: inputElement.tagName,
          type: inputElement.type,
          id: inputElement.id,
          name: inputElement.name || '',
          value: 'selected',
        },
      };
    } else {
      // Cannot uncheck radio buttons directly
      debug.warn(LOG_PREFIX, 'Cannot uncheck radio button');
      return {
        status: 'error',
        message:
          'Cannot uncheck a radio button. Radio buttons are part of a group and one must always be selected. Use a different radio button in the group to change the selection.',
      };
    }
  }

  private parseCheckValue(value: string, options: CheckboxRadioOptions): boolean {
    // If explicit boolean provided via options, honor it first
    if (typeof options.value === 'boolean') {
      return options.value;
    }

    const interpretAs = options.interpretAs || 'boolean';
    const lowerValue = value.toLowerCase().trim();

    switch (interpretAs) {
      case 'boolean': {
        return TRUTHY_VALUES.includes(lowerValue as (typeof TRUTHY_VALUES)[number]);
      }

      case 'string': {
        return lowerValue !== '' && lowerValue !== 'false' && lowerValue !== '0';
      }

      case 'number': {
        const numValue = parseFloat(value);
        return !isNaN(numValue) && numValue !== 0;
      }

      default:
        return false;
    }
  }

  /**
   * Find label element for input by ID
   */
  private findLabelForElement(elementId: string): HTMLLabelElement | null {
    try {
      return document.querySelector(`label[for="${CSS.escape(elementId)}"]`) as HTMLLabelElement | null;
    } catch {
      // CSS.escape not available, try without escaping
      return document.querySelector(`label[for="${elementId}"]`) as HTMLLabelElement | null;
    }
  }

  private uncheckRadioGroup(selectedRadio: HTMLInputElement): void {
    const groupName = selectedRadio.name;

    if (!groupName) {
      return;
    }

    // Find all radio buttons in the same group
    const radioGroup = document.querySelectorAll(`input[type="radio"][name="${groupName}"]`);

    // Uncheck all except selected
    radioGroup.forEach(radio => {
      if (radio !== selectedRadio) {
        (radio as HTMLInputElement).checked = false;

        // Trigger change event for modern frameworks
        const modernDetection = detectModernInput(radio as HTMLElement);
        if (modernDetection.isReactComponent || modernDetection.isVueComponent) {
          radio.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        }
      }
    });
  }

  /**
   * Verify checkbox/radio checked state with retries
   */
  private async verifyCheckedState(element: HTMLInputElement, expected: boolean, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (element.checked === expected) return true;
      await new Promise(r => setTimeout(r, VERIFY_RETRY_INTERVAL_MS));
    }
    return element.checked === expected;
  }

  /**
   * Handle checkbox groups (multiple checkboxes with the same name)
   */
  async handleCheckboxGroup(
    selector: string,
    values: string[],
    options: CheckboxRadioOptions = {},
  ): Promise<InputDataResult> {
    try {
      debug.log(LOG_PREFIX, 'Handling checkbox group:', { selector, values });

      const checkboxes = document.querySelectorAll(selector) as NodeListOf<HTMLInputElement>;

      if (checkboxes.length === 0) {
        return {
          status: 'error',
          message: `No checkboxes found with selector: ${selector}`,
        };
      }

      let successCount = 0;
      const results: string[] = [];

      // Process each checkbox
      checkboxes.forEach(checkbox => {
        const shouldCheck =
          values.includes(checkbox.value) ||
          values.includes(checkbox.id) ||
          values.includes(checkbox.getAttribute('data-value') || '');

        if (shouldCheck !== checkbox.checked) {
          checkbox.checked = shouldCheck;

          // Trigger events
          const modernDetection = detectModernInput(checkbox);
          const events = ['input', 'change'];
          if (modernDetection.isReactComponent) {
            events.push('focus', 'blur');
          }
          triggerInputEvents(checkbox, events);
          successCount++;
        }

        results.push(`${checkbox.value || checkbox.id}: ${checkbox.checked ? 'checked' : 'unchecked'}`);
      });

      if (options.showSuccessFeedback !== false && successCount > 0) {
        const firstChanged = Array.from(checkboxes).find(cb => values.includes(cb.value) || values.includes(cb.id));
        if (firstChanged) {
          showSuccessFeedback(firstChanged);
        }
      }

      debug.log(LOG_PREFIX, 'Checkbox group result:', { successCount, total: checkboxes.length });

      return {
        status: 'success',
        message: `Processed ${successCount} checkboxes in group`,
        elementInfo: {
          tag: 'INPUT',
          type: 'checkbox',
          id: selector,
          name: checkboxes[0]?.name || '',
          value: results.join(', '),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Checkbox group error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling checkbox group: ${errorMessage}`,
      };
    }
  }

  /**
   * Handle radio button group selection by value
   */
  async handleRadioGroup(
    groupName: string,
    value: string,
    options: CheckboxRadioOptions = {},
  ): Promise<InputDataResult> {
    try {
      debug.log(LOG_PREFIX, 'Handling radio group:', { groupName, value });

      const radioButtons = document.querySelectorAll(
        `input[type="radio"][name="${groupName}"]`,
      ) as NodeListOf<HTMLInputElement>;

      if (radioButtons.length === 0) {
        return {
          status: 'error',
          message: `No radio buttons found with name: ${groupName}`,
        };
      }

      // Find the radio button to select
      const targetRadio = Array.from(radioButtons).find(
        radio => radio.value === value || radio.id === value || radio.getAttribute('data-value') === value,
      );

      if (!targetRadio) {
        return {
          status: 'error',
          message: `No radio button found with value: ${value} in group: ${groupName}`,
        };
      }

      // Uncheck all in group
      this.uncheckRadioGroup(targetRadio);

      // Check target
      targetRadio.checked = true;

      // Trigger events
      const modernDetection = detectModernInput(targetRadio);
      const events = ['input', 'change'];
      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }
      triggerInputEvents(targetRadio, events);

      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(targetRadio);
      }

      debug.log(LOG_PREFIX, 'Radio group selected:', { value, id: targetRadio.id });

      return {
        status: 'success',
        message: `Radio button "${value}" selected in group "${groupName}"`,
        elementInfo: {
          tag: 'INPUT',
          type: 'radio',
          id: targetRadio.id,
          name: targetRadio.name,
          value: targetRadio.value,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Radio group error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling radio group: ${errorMessage}`,
      };
    }
  }
}
