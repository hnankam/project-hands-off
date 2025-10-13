import { debug } from '@extension/shared';
import { handleInputData as newHandleInputData } from './inputDispatcher';
import { InputDataResult } from './types';

/**
 * Input data into a form field (input, textarea, select, or contenteditable element)
 * @param cssSelector - A valid CSS selector string for the input field
 * @param value - The value to input into the field
 * @param clearFirst - Whether to clear the field before inputting (default: true)
 * @param moveCursor - Whether to move cursor to the input element (default: true)
 * @returns Promise with status and message object
 */
export async function handleInputData(
  cssSelector: string, 
  value: string, 
  clearFirst: boolean = true,
  moveCursor: boolean = true
): Promise<InputDataResult> {
  // Use the new modular input system
  return newHandleInputData(cssSelector, value, clearFirst, moveCursor);
}

