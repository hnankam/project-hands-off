/**
 * Data Retrieval CopilotKit Actions
 *
 * Actions for fetching HTML, form, and clickable element chunks by index range.
 * V2: Uses Zod schemas for parameter definitions.
 */

import React from 'react';
import { z } from 'zod';
import { debug, embeddingsStorage } from '@extension/shared';
import { ActionStatus } from '../../components/feedback/ActionStatus';

// ============================================================================
// ZOD SCHEMAS FOR TOOL PARAMETERS
// ============================================================================

/** Schema for chunk range parameters */
export const chunkRangeSchema = z.object({
  start: z.number().describe('Start index (>=0)'),
  end: z.number().describe('End index (>=start)'),
});

// ============================================================================
// CONSTANTS
// ============================================================================

/** Icon size in pixels */
const ICON_SIZE = 14;

/** Icon margin right in pixels */
const ICON_MARGIN_RIGHT = 6;

/** Icon colors by theme and state */
const ICON_COLORS = {
  enabled: {
    light: '#374151', // gray-700
    dark: '#d1d5db',  // gray-300
  },
  disabled: {
    light: '#9ca3af', // gray-400
    dark: '#6b7280',  // gray-500
  },
} as const;

/** Maximum URL length for logging */
const MAX_URL_LOG_LENGTH = 80;

/** Log prefix for agent actions */
const LOG_PREFIX = '[AgentAction]';

// ============================================================================
// TYPES
// ============================================================================

/** Status values for action render */
type ActionPhase = 'pending' | 'inProgress' | 'complete' | 'error';

/** Page content with URL information - accepts any object with url/pageURL */
interface PageContentLike {
  url?: string;
  pageURL?: string;
}

/** Props passed to action render functions */
interface ActionRenderProps {
  status: ActionPhase;
  result?: ChunkResult;
  args?: RangeArgs;
  error?: Error | string;
}

/** Arguments for range-based chunk fetching */
interface RangeArgs {
  start: number;
  end: number;
}

/** Result from chunk fetching operations */
interface ChunkResult {
  status: 'success' | 'error';
  message: string;
  chunks?: unknown[];
}

/** Dependencies required by data retrieval actions */
export interface DataRetrievalDependencies {
  currentPageContent: PageContentLike | null | undefined;
  isLight: boolean;
}

/** Configuration for a chunk range action */
interface ChunkRangeActionConfig {
  name: string;
  description: string;
  toolNamePrefix: string;
  chunkType: string;
  icon: (isLight: boolean, status: ActionPhase) => React.ReactElement;
  fetchFn: (url: string, start: number, end: number) => Promise<unknown[]>;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Timestamp helper for consistent logging */
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

/**
 * Get icon style based on theme and status
 * Icons are disabled (muted) when not complete, enabled when complete
 */
function getIconStyle(isLight: boolean, status: ActionPhase): React.CSSProperties {
  const colorSet = status === 'complete' ? ICON_COLORS.enabled : ICON_COLORS.disabled;
  return {
    flexShrink: 0,
    marginRight: ICON_MARGIN_RIGHT,
    color: isLight ? colorSet.light : colorSet.dark,
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
 * Safely extract URL from page content
 */
function getPageUrl(pageContent: PageContentLike | null | undefined): string {
  return pageContent?.url ?? pageContent?.pageURL ?? '';
}

/**
 * Truncate URL for logging
 */
function truncateUrl(url: string): string {
  return url.length > MAX_URL_LOG_LENGTH ? url.substring(0, MAX_URL_LOG_LENGTH) + '...' : url;
}

/**
 * Normalize range values to ensure valid range
 */
function normalizeRange(start: number, end: number): { start: number; end: number } {
  const s = Math.max(0, Number(start) || 0);
  const e = Math.max(s, Number(end) || 0);
  return { start: s, end: e };
}

/**
 * Get error message from unknown error
 */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}

// ============================================================================
// ICONS
// ============================================================================

/** Document icon for HTML chunks */
function DocumentIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <path stroke="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path stroke="currentColor" d="M14 2v6h6" />
      <path stroke="currentColor" strokeWidth="1.5" d="M16 13H8M16 17H8M10 9H8" opacity="0.5" />
    </svg>
  );
}

/** Clipboard icon for form chunks */
function ClipboardIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <path stroke="currentColor" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path stroke="currentColor" d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
      <path stroke="currentColor" strokeWidth="1.5" d="M9 12h6M9 16h6" opacity="0.5" />
    </svg>
  );
}

/** Link icon for clickable chunks */
function LinkIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <path stroke="currentColor" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path stroke="currentColor" d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

// ============================================================================
// GENERIC FACTORY
// ============================================================================

/**
 * Creates a chunk range action with the specified configuration
 */
function createChunkRangeAction(
  config: ChunkRangeActionConfig,
  { currentPageContent, isLight }: DataRetrievalDependencies
) {
  const { name, description, toolNamePrefix, chunkType, icon, fetchFn } = config;

  return {
    name,
    description,
    parameters: chunkRangeSchema,

    render: ({ status, result, args, error }: ActionRenderProps) => {
      const start = Number(args?.start ?? 0);
      const end = Number(args?.end ?? 0);
      // Parse result if it's a JSON string
      const parsedResult = typeof result === 'string' ? (() => {
        try { return JSON.parse(result); } catch { return result; }
      })() : result;
      const numChunks = status === 'complete' && parsedResult?.chunks ? parsedResult.chunks.length : 0;

      const instanceId = `${name}-${start}-${end}`;

      return (
        <ActionStatus
          toolName={`${toolNamePrefix} ${start}–${end}`}
          status={status}
          icon={icon(isLight, status)}
          messages={{
            pending: `Fetching ${chunkType} chunks ${start}–${end}`,
            inProgress: `Fetching ${chunkType} chunks ${start}–${end}`,
            complete: `Fetched ${numChunks} ${chunkType} chunk${numChunks !== 1 ? 's' : ''}`,
          }}
          args={args}
          result={result}
          error={error}
          instanceId={instanceId}
        />
      );
    },

    handler: async ({ start, end }: RangeArgs): Promise<ChunkResult> => {
      const url = getPageUrl(currentPageContent);

      if (!url) {
        debug.warn(ts(), LOG_PREFIX, name, '→ No page URL available');
        return { status: 'error', message: 'No page URL' };
      }

      const range = normalizeRange(start, end);

      try {
        debug.log(ts(), LOG_PREFIX, name, '→ querying DB:', {
          url: truncateUrl(url),
          start: range.start,
          end: range.end,
        });

        const rows = await fetchFn(url, range.start, range.end);

        debug.log(ts(), LOG_PREFIX, name, '→ fetched:', rows.length);
        return {
          status: 'success',
          message: `Fetched ${rows.length} chunk(s)`,
          chunks: rows,
        };
      } catch (err) {
        debug.error(ts(), LOG_PREFIX, name, '→ error:', getErrorMessage(err));
        return { status: 'error', message: 'DB query failed' };
      }
    },
  };
}

// ============================================================================
// ACTION CREATORS
// ============================================================================

/**
 * Creates the getHtmlChunksByRange action
 * Fetches HTML chunks by chunk index range from the database
 */
export const createGetHtmlChunksByRangeAction = (deps: DataRetrievalDependencies) =>
  createChunkRangeAction(
    {
      name: 'getHtmlChunksByRange',
      description: 'Fetch HTML chunks by chunk index range (inclusive).',
      toolNamePrefix: 'HTML chunks',
      chunkType: 'HTML',
      icon: (isLight, status) => <DocumentIcon style={getIconStyle(isLight, status)} />,
      // Wrap in arrow function to preserve `this` binding
      fetchFn: (url, start, end) => embeddingsStorage.fetchHTMLChunksByRange(url, start, end),
    },
    deps
  );

/**
 * Creates the getFormChunksByRange action
 * Fetches form chunks by group index range from the database
 */
export const createGetFormChunksByRangeAction = (deps: DataRetrievalDependencies) =>
  createChunkRangeAction(
    {
      name: 'getFormChunksByRange',
      description: 'Fetch form chunks (groups) by group index range (inclusive).',
      toolNamePrefix: 'Form chunks',
      chunkType: 'form',
      icon: (isLight, status) => <ClipboardIcon style={getIconStyle(isLight, status)} />,
      // Wrap in arrow function to preserve `this` binding
      fetchFn: (url, start, end) => embeddingsStorage.fetchFormChunksByRange(url, start, end),
    },
    deps
  );

/**
 * Creates the getClickableChunksByRange action
 * Fetches clickable element chunks by group index range from the database
 */
export const createGetClickableChunksByRangeAction = (deps: DataRetrievalDependencies) =>
  createChunkRangeAction(
    {
      name: 'getClickableChunksByRange',
      description: 'Fetch clickable chunks (groups) by group index range (inclusive).',
      toolNamePrefix: 'Clickable chunks',
      chunkType: 'clickable',
      icon: (isLight, status) => <LinkIcon style={getIconStyle(isLight, status)} />,
      // Wrap in arrow function to preserve `this` binding
      fetchFn: (url, start, end) => embeddingsStorage.fetchClickableChunksByRange(url, start, end),
    },
    deps
  );
