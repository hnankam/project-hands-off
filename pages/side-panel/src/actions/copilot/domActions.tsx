/**
 * DOM Manipulation CopilotKit Actions
 *
 * Actions for interacting with page DOM elements (cursor movement, clicks, verification, etc.)
 * V2: Uses Zod schemas for parameter definitions.
 */

import React from 'react';
import { z } from 'zod';
import { debug } from '@extension/shared';
import { ActionStatus } from '../../components/feedback/ActionStatus';
import {
  handleMoveCursorToElement,
  handleRefreshPageContent,
  handleCleanupExtensionUI,
  handleClickElement,
  handleVerifySelector,
  handleGetSelectorAtPoint,
  handleGetSelectorsAtPoints,
  handleKeystrokeSequence,
} from '../index';

// ============================================================================
// ZOD SCHEMAS FOR TOOL PARAMETERS
// ============================================================================

/** Schema for moveCursorToElement parameters */
export const moveCursorToElementSchema = z.object({
  cssSelector: z.string().describe(
    "A CSS selector to identify the element (e.g., '#create-account-btn', 'document > x-app >> #input'). Use searchPageContent() to find appropriate selectors."
  ),
});

/** Schema for clickElement parameters */
export const clickElementSchema = z.object({
  cssSelector: z.string().describe(
    "A CSS selector to identify the element (e.g., '#create-account-btn', 'document > x-app >> #input'). Use searchPageContent() to find appropriate selectors."
  ),
  autoMoveCursor: z.boolean().optional().describe('Whether to automatically move the cursor to the element before clicking (default: true).'),
});

/** Schema for verifySelector parameters */
export const verifySelectorSchema = z.object({
  cssSelector: z.string().describe(
    "The CSS selector to verify (e.g., '#submit-btn', 'document > x-app >> #input'). Use >> to traverse shadow DOM."
  ),
});

/** Schema for getSelectorAtPoint parameters */
export const getSelectorAtPointSchema = z.object({
  x: z.number().describe('Viewport X coordinate in CSS px'),
  y: z.number().describe('Viewport Y coordinate in CSS px'),
});

/** Schema for getSelectorsAtPoints parameters */
export const getSelectorsAtPointsSchema = z.object({
  points: z.array(z.object({ x: z.number(), y: z.number() })).describe('Array of points {x:number,y:number}'),
});

/** Schema for keystroke */
const keystrokeSchema = z.object({
  key: z.string(),
  ctrl: z.boolean().optional(),
  meta: z.boolean().optional(),
  alt: z.boolean().optional(),
  shift: z.boolean().optional(),
  repeat: z.number().optional(),
});

/** Schema for sendKeystrokes parameters */
export const sendKeystrokesSchema = z.object({
  sequence: z.array(keystrokeSchema).describe(
    "Array of keystrokes. Each item: { key: string, ctrl?: boolean, meta?: boolean, alt?: boolean, shift?: boolean, repeat?: number }. Example: [{ key: 'k', meta: true }] for Cmd+K."
  ),
  targetSelector: z.string().optional().describe('Optional CSS selector to focus before typing. Supports Shadow DOM with >> notation.'),
  delayMs: z.number().optional().describe('Optional delay between keystrokes in milliseconds (default 20ms, max 250ms).'),
});

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum length for selector display */
const MAX_SELECTOR_LENGTH = 60;

/** Maximum length for target selector display */
const MAX_TARGET_SELECTOR_LENGTH = 40;

/** Maximum keystroke repeat count */
const MAX_KEYSTROKE_REPEAT = 50;

/** Icon size in pixels */
const ICON_SIZE = 14;

/** Icon margin right in pixels */
const ICON_MARGIN_RIGHT = 6;

/** Icon colors by theme */
const ICON_COLORS = {
  light: '#4b5563',
  dark: '#6b7280',
} as const;

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

/** Page content structure - accepts any object with optional url/pageURL */
interface PageContentLike {
  url?: string;
  pageURL?: string;
}

/** Page data reference structure */
interface PageDataRef {
  embeddings: unknown;
  pageContent: PageContentLike | unknown;
}

/** Props passed to action render functions */
interface ActionRenderProps<TArgs = Record<string, unknown>, TResult = unknown> {
  status: ActionPhase;
  args?: TArgs;
  result?: TResult;
  error?: Error | string;
}

/** Single keystroke definition */
interface Keystroke {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  repeat?: number;
}

/** Normalized keystroke for handler */
interface NormalizedKeystroke {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  repeat: number;
}

/** Point coordinates */
interface Point {
  x: number;
  y: number;
}


/** Dependencies for DOM actions */
interface DOMActionDependencies {
  isLight: boolean;
  clipText: (text: string, maxLength?: number) => string;
  pageDataRef: React.MutableRefObject<PageDataRef>;
  triggerManualRefresh?: () => void;
}

/** Dependencies for actions that need clipText */
type ClipTextDependencies = Pick<DOMActionDependencies, 'isLight' | 'clipText'>;

/** Dependencies for simple actions (isLight only) */
type SimpleDependencies = Pick<DOMActionDependencies, 'isLight'>;

/** Dependencies for refresh action */
type RefreshDependencies = Pick<DOMActionDependencies, 'isLight' | 'pageDataRef' | 'triggerManualRefresh'>;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get icon style based on theme
 */
function getIconStyle(isLight: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    marginRight: ICON_MARGIN_RIGHT,
    color: isLight ? ICON_COLORS.light : ICON_COLORS.dark,
  };
}

/**
 * Common SVG props for all icons
 */
const svgProps = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/**
 * Format a keystroke for display
 */
function formatKeystroke(stroke: Partial<Keystroke>): string {
  const mods: string[] = [];
  if (stroke.ctrl) mods.push('Ctrl');
  if (stroke.meta) mods.push('Cmd');
  if (stroke.alt) mods.push('Alt');
  if (stroke.shift) mods.push('Shift');
  const key = String(stroke.key ?? '');
  const repeat = stroke.repeat && stroke.repeat > 1 ? `×${stroke.repeat}` : '';
  return mods.length > 0 ? `${mods.join('+')}+${key}${repeat}` : `${key}${repeat}`;
}

/**
 * Safely convert to number with fallback
 */
function safeNumber(value: unknown, fallback: number = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Normalize keystroke sequence for handler
 */
function normalizeKeystrokeSequence(sequence: unknown[]): NormalizedKeystroke[] {
  if (!Array.isArray(sequence)) return [];

  return sequence
    .map((s): NormalizedKeystroke | null => {
      if (!s || typeof s !== 'object') return null;
      const stroke = s as Partial<Keystroke>;
      const key = String(stroke.key ?? '');
      if (!key) return null;

      return {
        key,
        ctrl: Boolean(stroke.ctrl),
        meta: Boolean(stroke.meta),
        alt: Boolean(stroke.alt),
        shift: Boolean(stroke.shift),
        repeat: Math.max(1, Math.min(MAX_KEYSTROKE_REPEAT, safeNumber(stroke.repeat, 1))),
      };
    })
    .filter((s): s is NormalizedKeystroke => s !== null);
}

/**
 * Normalize points array for handler
 */
function normalizePoints(points: unknown): Point[] {
  if (!Array.isArray(points)) return [];

  return points
    .map((p): Point | null => {
      if (!p || typeof p !== 'object') return null;
      const point = p as Partial<Point>;
      return {
        x: safeNumber(point.x),
        y: safeNumber(point.y),
      };
    })
    .filter((p): p is Point => p !== null);
}

// ============================================================================
// ICONS
// ============================================================================

/** Keyboard icon for keystroke actions */
function KeyboardIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <rect stroke="currentColor" x="2" y="6" width="20" height="12" rx="2" />
      <line stroke="currentColor" strokeWidth="1.5" x1="6" y1="10" x2="6" y2="10" opacity="0.7" />
      <line stroke="currentColor" strokeWidth="1.5" x1="10" y1="10" x2="10" y2="10" opacity="0.7" />
      <line stroke="currentColor" strokeWidth="1.5" x1="14" y1="10" x2="14" y2="10" opacity="0.7" />
      <line stroke="currentColor" strokeWidth="1.5" x1="18" y1="10" x2="18" y2="10" opacity="0.7" />
      <line stroke="currentColor" strokeWidth="1.5" x1="8" y1="14" x2="16" y2="14" opacity="0.7" />
    </svg>
  );
}

// ============================================================================
// ACTION CREATORS
// ============================================================================

/**
 * Creates the moveCursorToElement action
 * Shows/moves cursor to a specific element on the page
 */
export const createMoveCursorToElementAction = ({ isLight, clipText }: ClipTextDependencies) => ({
  name: 'moveCursorToElement',
  description:
    'Show/move cursor to the element matching the selector. Supports Shadow DOM with >> notation. Auto-hides after 5 minutes.',
  parameters: moveCursorToElementSchema,
  render: ({ status, args, result, error }: ActionRenderProps<{ cssSelector?: string }>) => {
    const selector = args?.cssSelector ?? '';
    return (
      <ActionStatus
        toolName={`Move cursor to ${clipText(selector, MAX_SELECTOR_LENGTH)}`}
        status={status}
        isLight={isLight}
        messages={{ pending: 'Moving cursor…', inProgress: 'Moving cursor…', complete: 'Cursor moved' }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ cssSelector }: { cssSelector: string }) => {
    debug.log(ts(), LOG_PREFIX.request, 'moveCursorToElement:', { cssSelector });
    const result = await handleMoveCursorToElement(cssSelector);
    debug.log(ts(), LOG_PREFIX.response, 'moveCursorToElement:', result);
    return result;
  },
});

/**
 * Creates the refreshPageContent action
 * Refreshes current page HTML for latest content/embeddings
 */
export const createRefreshPageContentAction = ({ isLight, pageDataRef, triggerManualRefresh }: RefreshDependencies) => ({
  name: 'refreshPageContent',
  description: 'Refresh current page HTML (for latest content/embeddings).',
  parameters: z.object({}),
  render: ({ status, args, result, error }: ActionRenderProps) => (
    <ActionStatus
      toolName="Refresh page content"
      status={status}
      isLight={isLight}
      messages={{
        pending: 'Refreshing page content…',
        inProgress: 'Refreshing page content…',
        complete: 'Page refreshed',
      }}
      args={args}
      result={result}
      error={error}
    />
  ),
  handler: async () => {
    debug.log(ts(), LOG_PREFIX.request, 'refreshPageContent');
    const getCurrentPageContent = () => pageDataRef.current?.pageContent ?? undefined;
    const result = await handleRefreshPageContent(getCurrentPageContent, triggerManualRefresh);
    debug.log(ts(), LOG_PREFIX.response, 'refreshPageContent:', result);
    return result;
  },
});

/**
 * Creates the cleanupExtensionUI action
 * Removes all extension UI elements and styles from the page
 */
export const createCleanupExtensionUIAction = ({ isLight }: SimpleDependencies) => ({
  name: 'cleanupExtensionUI',
  description: 'Remove all extension UI elements and styles from the page.',
  parameters: z.object({}),
  render: ({ status, args, result, error }: ActionRenderProps) => (
    <ActionStatus
      toolName="Clean up UI"
      status={status}
      isLight={isLight}
      messages={{ pending: 'Cleaning up UI…', inProgress: 'Cleaning up UI…', complete: 'UI cleaned' }}
      args={args}
      result={result}
      error={error}
    />
  ),
  handler: async () => {
    debug.log(ts(), LOG_PREFIX.request, 'cleanupExtensionUI');
    const result = await handleCleanupExtensionUI();
    debug.log(ts(), LOG_PREFIX.response, 'cleanupExtensionUI:', result);
    return result;
  },
});

/**
 * Creates the clickElement action
 * Clicks an element on the page
 */
export const createClickElementAction = ({ isLight, clipText }: ClipTextDependencies) => ({
  name: 'clickElement',
  description:
    'Click the element matching the provided CSS selector. Supports Shadow DOM with >> notation (e.g., "shadowPath >> #element").',
  parameters: clickElementSchema,
  render: ({ status, args, result, error }: ActionRenderProps<{ cssSelector?: string; autoMoveCursor?: boolean }>) => {
    const selector = args?.cssSelector ?? '';
    return (
      <ActionStatus
        toolName={`Click ${clipText(selector, MAX_SELECTOR_LENGTH)}`}
        status={status}
        isLight={isLight}
        messages={{ pending: 'Clicking…', inProgress: 'Clicking…', complete: 'Click done' }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({
    cssSelector,
    autoMoveCursor,
  }: {
    cssSelector: string;
    autoMoveCursor?: boolean;
  }) => {
    debug.log(ts(), LOG_PREFIX.request, 'clickElement:', { cssSelector, autoMoveCursor });
    const result = await handleClickElement(cssSelector, autoMoveCursor);
    debug.log(ts(), LOG_PREFIX.response, 'clickElement:', result);
    return result;
  },
});

/**
 * Creates the verifySelector action
 * Validates a CSS selector (syntax, match count, shadow DOM info, element details)
 */
export const createVerifySelectorAction = ({ isLight, clipText }: ClipTextDependencies) => ({
  name: 'verifySelector',
  description:
    'Validate a CSS selector (syntax, match count, shadow DOM info, element details). Supports Shadow DOM with >> notation.',
  parameters: verifySelectorSchema,
  render: ({ status, args, result, error }: ActionRenderProps<{ cssSelector?: string }>) => {
    const selector = args?.cssSelector ?? '';
    return (
      <ActionStatus
        toolName={`Verify ${clipText(selector, MAX_SELECTOR_LENGTH)}`}
        status={status}
        isLight={isLight}
        messages={{
          pending: 'Verifying selector…',
          inProgress: 'Verifying selector…',
          complete: 'Selector verified',
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ cssSelector }: { cssSelector: string }) => {
    debug.log(ts(), LOG_PREFIX.request, 'verifySelector:', { cssSelector });
    const result = await handleVerifySelector(cssSelector);
    debug.log(ts(), LOG_PREFIX.response, 'verifySelector:', result);
    return result;
  },
});

/**
 * Creates the getSelectorAtPoint action
 * Returns a unique CSS selector for the element at given viewport coordinates
 */
export const createGetSelectorAtPointAction = ({ isLight }: SimpleDependencies) => ({
  name: 'getSelectorAtPoint',
  description:
    'Return a unique CSS selector for the element at the given viewport coordinates (x, y). Coordinates are in CSS pixels relative to the viewport (0,0 is top-left).',
  parameters: getSelectorAtPointSchema,
  render: ({ status, args, result, error }: ActionRenderProps<{ x?: number; y?: number }>) => {
    const x = safeNumber(args?.x);
    const y = safeNumber(args?.y);
    return (
      <ActionStatus
        toolName={`Selector at (${x}, ${y})`}
        status={status}
        isLight={isLight}
        messages={{
          pending: 'Finding selector at point…',
          inProgress: 'Finding selector at point…',
          complete: 'Selector found',
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ x, y }: { x: number; y: number }) => {
    debug.log(ts(), LOG_PREFIX.request, 'getSelectorAtPoint:', { x, y });
    const result = await handleGetSelectorAtPoint(safeNumber(x), safeNumber(y));
    debug.log(ts(), LOG_PREFIX.response, 'getSelectorAtPoint:', result);
    return result;
  },
});

/**
 * Creates the getSelectorsAtPoints action
 * Returns unique CSS selectors for elements at multiple viewport coordinates
 */
export const createGetSelectorsAtPointsAction = ({ isLight }: SimpleDependencies) => ({
  name: 'getSelectorsAtPoints',
  description:
    'Return unique CSS selectors for elements at the provided list of viewport coordinates. Each item is { x, y } in CSS pixels relative to the viewport.',
  parameters: getSelectorsAtPointsSchema,
  render: ({ status, args, result, error }: ActionRenderProps<{ points?: unknown[] }>) => {
    const pointCount = Array.isArray(args?.points) ? args.points.length : 0;
    return (
      <ActionStatus
        toolName={`Selectors at ${pointCount} point(s)`}
        status={status}
        isLight={isLight}
        messages={{ pending: 'Finding selectors…', inProgress: 'Finding selectors…', complete: 'Selectors found' }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ points }: { points: unknown[] }) => {
    debug.log(ts(), LOG_PREFIX.request, 'getSelectorsAtPoints:', { pointsCount: points?.length });
    const normalizedPoints = normalizePoints(points);
    const result = await handleGetSelectorsAtPoints(normalizedPoints);
    debug.log(ts(), LOG_PREFIX.response, 'getSelectorsAtPoints:', result);
    return result;
  },
});

/**
 * Creates the sendKeystrokes action
 * Sends keyboard shortcuts and sequences to the active page (supports modifiers and repeats)
 */
export const createSendKeystrokesAction = ({ isLight, clipText }: ClipTextDependencies) => ({
  name: 'sendKeystrokes',
  description:
    'Send keyboard shortcuts or sequences to the page. Supports modifiers (ctrl/meta/alt/shift), repeats, optional target focus via selector (supports shadow >>), and per-key delay.',
  parameters: sendKeystrokesSchema,
  render: ({
    status,
    args,
    result,
    error,
  }: ActionRenderProps<{ sequence?: Keystroke[]; targetSelector?: string; delayMs?: number }>) => {
    const sequence = args?.sequence ?? [];
    const formattedKeys = Array.isArray(sequence) && sequence.length > 0 ? sequence.map(formatKeystroke).join(' ') : '';
    const targetSelector = args?.targetSelector;

    // Build tool name with keys
    const keysDisplay = formattedKeys ? `: ${clipText(formattedKeys, MAX_SELECTOR_LENGTH)}` : '';
    const targetDisplay = targetSelector ? ` to ${clipText(targetSelector, MAX_TARGET_SELECTOR_LENGTH)}` : '';
    const toolName = `Send keystrokes${keysDisplay}${targetDisplay}`;

    // Build messages with keys
    const keysMsg = formattedKeys ? ` (${clipText(formattedKeys, MAX_SELECTOR_LENGTH)})` : '';

    return (
      <ActionStatus
        toolName={toolName}
        status={status}
        isLight={isLight}
        icon={<KeyboardIcon style={getIconStyle(isLight)} />}
        messages={{
          pending: `Sending keystrokes${keysMsg}…`,
          inProgress: `Sending keystrokes${keysMsg}…`,
          complete: `Keystrokes sent${keysMsg}`,
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({
    sequence,
    targetSelector,
    delayMs,
  }: {
    sequence: Keystroke[];
    targetSelector?: string;
    delayMs?: number;
  }) => {
    // Validate sequence is not empty
    if (!Array.isArray(sequence) || sequence.length === 0) {
      debug.log(ts(), LOG_PREFIX.request, 'sendKeystrokes: ERROR - empty sequence');
      return { status: 'error', message: 'Keystroke sequence cannot be empty' };
    }

    // Format keystrokes for logging
    const formattedKeys = sequence.map(formatKeystroke).join(' ');
    debug.log(ts(), LOG_PREFIX.request, `sendKeystrokes: ${formattedKeys}`, { targetSelector, delayMs });

    // Normalize sequence
    const normalizedSequence = normalizeKeystrokeSequence(sequence);

    // Double-check after filtering
    if (normalizedSequence.length === 0) {
      debug.log(ts(), LOG_PREFIX.response, 'sendKeystrokes: ERROR - no valid keys after filtering');
      return { status: 'error', message: 'No valid keystrokes in sequence' };
    }

    const request = {
      sequence: normalizedSequence,
      targetSelector: targetSelector ? String(targetSelector) : undefined,
      delayMs: safeNumber(delayMs),
    };

    const result = await handleKeystrokeSequence(request);
    debug.log(ts(), LOG_PREFIX.response, 'sendKeystrokes:', result);
    return result;
  },
});
