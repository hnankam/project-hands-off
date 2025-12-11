/**
 * Navigation CopilotKit Actions
 *
 * Actions for page navigation (opening tabs, scrolling, drag and drop)
 * V2: Uses Zod schemas for parameter definitions.
 */

import React from 'react';
import { z } from 'zod';
import { debug } from '@extension/shared';
import { ActionStatus } from '../../components/feedback/ActionStatus';
import { handleOpenNewTab, handleScroll, handleDragAndDrop } from '../index';

// ============================================================================
// ZOD SCHEMAS FOR TOOL PARAMETERS
// ============================================================================

/** Schema for openNewTab parameters */
export const openNewTabSchema = z.object({
  url: z.string().describe(
    "The URL to open in the new tab (e.g., 'https://google.com', 'github.com', 'https://example.com/page')."
  ),
  active: z.boolean().optional().describe('Whether to make the new tab active (default: true). Set to false to open in background.'),
});

/** Schema for scroll parameters */
export const scrollSchema = z.object({
  cssSelector: z.string().optional().describe(
    'Optional CSS selector for the element to scroll within or scroll to. Leave empty to scroll the page.'
  ),
  direction: z.enum(['up', 'down', 'left', 'right', 'top', 'bottom', 'to']).optional().describe(
    "Direction to scroll: 'up', 'down', 'left', 'right', 'top', 'bottom', or 'to'. Default: 'down'."
  ),
  amount: z.number().optional().describe(
    "Amount to scroll in pixels (for up/down/left/right). Default: 300. Ignored for 'top', 'bottom', and 'to'."
  ),
  scrollTo: z.boolean().optional().describe(
    'If true, scrolls TO the element (brings it into view). If false, scrolls WITHIN the element. Default: false.'
  ),
});

/** Schema for dragAndDrop parameters */
export const dragAndDropSchema = z.object({
  sourceCssSelector: z.string().describe(
    "CSS selector for the element to drag (e.g., '#draggable-item', 'document > x-app >> .card')."
  ),
  targetCssSelector: z.string().describe(
    "CSS selector for the drop target element (e.g., '.drop-zone', 'document > x-app >> #container')."
  ),
  offsetX: z.number().optional().describe(
    'Optional horizontal offset in pixels from target center (default: 0). Positive = right, negative = left.'
  ),
  offsetY: z.number().optional().describe(
    'Optional vertical offset in pixels from target center (default: 0). Positive = down, negative = up.'
  ),
});

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum length for URL display */
const MAX_URL_LENGTH = 56;

/** Maximum length for selector display */
const MAX_SELECTOR_LENGTH = 40;

/** Maximum length for drag selector display */
const MAX_DRAG_SELECTOR_LENGTH = 32;

/** Default scroll amount in pixels */
const DEFAULT_SCROLL_AMOUNT = 300;

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

/** Scroll direction options */
type ScrollDirection = 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom' | 'to';

/** Props passed to action render functions */
interface ActionRenderProps<TArgs = Record<string, unknown>> {
  status: ActionPhase;
  args?: TArgs;
  result?: unknown;
  error?: Error | string;
}

/** Arguments for openNewTab action */
interface OpenNewTabArgs {
  url?: string;
  active?: boolean;
}

/** Arguments for scroll action */
interface ScrollArgs {
  cssSelector?: string;
  direction?: ScrollDirection;
  amount?: number;
  scrollTo?: boolean;
}

/** Arguments for dragAndDrop action */
interface DragAndDropArgs {
  sourceCssSelector?: string;
  targetCssSelector?: string;
  offsetX?: number;
  offsetY?: number;
}

/** Dependencies for navigation actions */
interface NavigationActionDependencies {
  isLight: boolean;
  clipText: (text: string, maxLength?: number) => string;
  yesNo: (value: boolean | undefined) => string;
}

/** Dependencies without yesNo */
type BasicNavigationDependencies = Omit<NavigationActionDependencies, 'yesNo'>;

// ============================================================================
// ACTION CREATORS
// ============================================================================

/**
 * Creates the openNewTab action
 * Opens a new browser tab with the specified URL
 */
export const createOpenNewTabAction = ({ isLight, clipText }: BasicNavigationDependencies) => ({
  name: 'openNewTab',
  description: 'Open a new tab with the given URL (validated and normalized).',
  parameters: openNewTabSchema,
  render: ({ status, args, result, error }: ActionRenderProps<OpenNewTabArgs>) => {
    const url = clipText(args?.url ?? '', MAX_URL_LENGTH);
    const isActive = args?.active ?? true;
    const activeText = isActive ? 'and made active' : 'in background';

    return (
      <ActionStatus
        toolName={`Open ${url}`}
        status={status}
        isLight={isLight}
        messages={{
          pending: `Opening ${url} on a new tab`,
          inProgress: `Opening ${url} on a new tab`,
          complete: `Opened ${url} on new tab ${activeText}`,
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ url, active = true }: { url: string; active?: boolean }) => {
    debug.log(ts(), LOG_PREFIX.request, 'openNewTab:', { url, active });
    const result = await handleOpenNewTab(url, active);
    debug.log(ts(), LOG_PREFIX.response, 'openNewTab:', result);
    return result;
  },
});

/**
 * Creates the scroll action
 * Scrolls the page or a specific element
 */
export const createScrollAction = ({ isLight, clipText, yesNo }: NavigationActionDependencies) => ({
  name: 'scroll',
  description: 'Scroll the page or an element, or scroll the page to an element.',
  parameters: scrollSchema,
  render: ({ status, args, result, error }: ActionRenderProps<ScrollArgs>) => {
    const selector = args?.cssSelector ?? 'page';
    const direction = args?.direction ?? 'down';
    const amount = args?.amount;
    const scrollTo = args?.scrollTo;

    // Build tool name parts
    const targetDisplay = clipText(selector, MAX_SELECTOR_LENGTH);
    const amountDisplay = amount ? ` by ${amount}px` : '';
    const scrollToDisplay = typeof scrollTo === 'boolean' ? ` (to=${yesNo(scrollTo)})` : '';
    const toolName = `Scroll ${targetDisplay} ${direction}${amountDisplay}${scrollToDisplay}`;

    return (
      <ActionStatus
        toolName={toolName}
        status={status}
        isLight={isLight}
        messages={{ pending: 'Scrolling…', inProgress: 'Scrolling…', complete: 'Scroll complete' }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({
    cssSelector = '',
    direction = 'down',
    amount = DEFAULT_SCROLL_AMOUNT,
    scrollTo = false,
  }: {
    cssSelector?: string;
    direction?: ScrollDirection;
    amount?: number;
    scrollTo?: boolean;
  }) => {
    debug.log(ts(), LOG_PREFIX.request, 'scroll:', { cssSelector, direction, amount, scrollTo });
    const result = await handleScroll(cssSelector, direction, amount, scrollTo);
    debug.log(ts(), LOG_PREFIX.response, 'scroll:', result);
    return result;
  },
});

/**
 * Creates the dragAndDrop action
 * Drags an element from source to target
 */
export const createDragAndDropAction = ({ isLight, clipText }: BasicNavigationDependencies) => ({
  name: 'dragAndDrop',
  description:
    'Drag from source selector and drop on target selector (supports offsets and canvas cases). Supports Shadow DOM with >> notation.',
  parameters: dragAndDropSchema,
  render: ({ status, args, result, error }: ActionRenderProps<DragAndDropArgs>) => {
    const source = clipText(args?.sourceCssSelector ?? '', MAX_DRAG_SELECTOR_LENGTH);
    const target = clipText(args?.targetCssSelector ?? '', MAX_DRAG_SELECTOR_LENGTH);

    return (
      <ActionStatus
        toolName={`Drag ${source} → ${target}`}
        status={status}
        isLight={isLight}
        messages={{
          pending: 'Dragging and dropping…',
          inProgress: 'Dragging and dropping…',
          complete: 'Drag-and-drop complete',
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({
    sourceCssSelector,
    targetCssSelector,
    offsetX = 0,
    offsetY = 0,
  }: {
    sourceCssSelector: string;
    targetCssSelector: string;
    offsetX?: number;
    offsetY?: number;
  }) => {
    debug.log(ts(), LOG_PREFIX.request, 'dragAndDrop:', { sourceCssSelector, targetCssSelector, offsetX, offsetY });
    const result = await handleDragAndDrop(sourceCssSelector, targetCssSelector, offsetX, offsetY);
    debug.log(ts(), LOG_PREFIX.response, 'dragAndDrop:', result);
    return result;
  },
});
