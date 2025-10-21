import { debug } from '@extension/shared';
import { handleInputData as newHandleInputData } from './inputDispatcher';
import { InputDataResult, InputHandlerOptions } from './types';

// Backward-compat wrapper + ergonomic options form
// Preferred usage: handleInputData(selector, value, { clearFirst, moveCursor, ...futureOptions })
export async function handleInputData(
  cssSelector: string,
  value: string,
  options?: InputHandlerOptions
): Promise<InputDataResult>;

// Legacy usage signature: handleInputData(selector, value, clearFirst?, moveCursor?)
export async function handleInputData(
  cssSelector: string,
  value: string,
  clearFirst?: boolean,
  moveCursor?: boolean
): Promise<InputDataResult>;

export async function handleInputData(
  cssSelector: string,
  value: string,
  third?: boolean | InputHandlerOptions,
  fourth?: boolean
): Promise<InputDataResult> {
  try {
    // Normalize arguments
    let normalizedClearFirst = true;
    let normalizedMoveCursor = true;

    if (typeof third === 'object' && third !== null) {
      normalizedClearFirst = third.clearFirst !== false;
      normalizedMoveCursor = third.moveCursor !== false;
    } else {
      normalizedClearFirst = third !== false; // default true
      normalizedMoveCursor = fourth !== false; // default true
    }

    return await newHandleInputData(cssSelector, value, normalizedClearFirst, normalizedMoveCursor);
  } catch (err) {
    debug.error?.('[handleInputData] Failed:', err);
    return {
      status: 'error',
      message: 'Failed to input data',
    };
  }
}

