/**
 * Form Manipulation CopilotKit Actions
 *
 * Actions for filling form fields (inputs, textareas, selects, checkboxes, contenteditable)
 * V2: Uses Zod schemas for parameter definitions.
 */

import * as React from 'react';
import { z } from 'zod';
import { debug } from '@extension/shared';
import { ActionStatus } from '../../components/feedback/ActionStatus';
import { handleInputData } from '../index';

// ============================================================================
// ZOD SCHEMAS FOR TOOL PARAMETERS
// ============================================================================

/** Schema for inputData parameters */
export const inputDataSchema = z.object({
  cssSelector: z.string().describe(
    "A valid CSS selector for the input field (e.g., '#email', 'document > x-app >> #message'). Use searchPageContent() to find appropriate selectors."
  ),
  value: z.string().describe(
    "The value to input into the field. For checkboxes/radio, use 'true' or 'false'. For select, use option value or text."
  ),
  clearFirst: z.boolean().optional().describe('Whether to clear the field before inputting (default: true). Set to false to append.'),
  moveCursor: z.boolean().optional().describe('Whether to move the mouse cursor to the input element (default: true).'),
});

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum length for selector display */
const MAX_SELECTOR_LENGTH = 52;

/** Maximum length for value display */
const MAX_VALUE_LENGTH = 24;

/** Log prefix for agent actions */
const LOG_PREFIX = {
  request: '[Agent Request]',
  response: '[Agent Response]',
} as const;

// ============================================================================
// TYPES
// ============================================================================

/** Timestamp helper for consistent logging */
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

/** Status values for action render */
type ActionPhase = 'pending' | 'inProgress' | 'complete' | 'error';

/** Props passed to action render functions */
interface ActionRenderProps {
  status: ActionPhase;
  args?: InputDataArgs;
  result?: unknown;
  error?: Error | string;
}

/** Arguments for inputData action */
interface InputDataArgs {
  cssSelector?: string;
  value?: string;
  clearFirst?: boolean;
  moveCursor?: boolean;
}

/** Handler arguments for inputData */
interface InputDataHandlerArgs {
  cssSelector: string;
  value: string;
  clearFirst?: boolean;
  moveCursor?: boolean;
}

/** Dependencies for form actions */
interface FormActionDependencies {
  isLight: boolean;
  clipText: (text: string, maxLength?: number) => string;
}

// ============================================================================
// ACTION CREATORS
// ============================================================================

/**
 * Creates the inputData action
 * Fills a form field with the provided value
 */
export const createInputDataAction = ({ isLight, clipText }: FormActionDependencies) => ({
  name: 'inputData',
  description:
    'Fill a form field matched by selector (inputs, textareas, selects, checkboxes, contenteditable). Supports Shadow DOM with >> notation.',
  parameters: inputDataSchema,
  render: ({ status, args, result, error }: ActionRenderProps) => {
    const selector = args?.cssSelector ?? '';
    const value = args?.value ?? '';

    return (
      <ActionStatus
        toolName={`Input into ${clipText(selector, MAX_SELECTOR_LENGTH)}: "${clipText(value, MAX_VALUE_LENGTH)}"`}
        status={status}
        messages={{ pending: 'Filling field…', inProgress: 'Filling field…', complete: 'Field filled' }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ cssSelector, value, clearFirst = true, moveCursor = true }: InputDataHandlerArgs) => {
    debug.log(ts(), LOG_PREFIX.request, 'inputData:', { cssSelector, value, clearFirst, moveCursor });
    const result = await handleInputData(cssSelector, value, clearFirst, moveCursor);
    debug.log(ts(), LOG_PREFIX.response, 'inputData:', result);
    return result;
  },
});
