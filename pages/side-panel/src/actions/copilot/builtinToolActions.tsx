/**
 * Builtin Tool CopilotKit Actions
 *
 * Render hooks for web_search, code_execution, and url_context builtin tools
 */

import React from 'react';
import { ActionStatus } from '../../components/ActionStatus';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum length for prompt text display */
const MAX_PROMPT_LENGTH = 60;

/** Maximum length for URL text display */
const MAX_URL_LENGTH = 50;

/** Icon size in pixels */
const ICON_SIZE = 14;

/** Icon margin right in pixels */
const ICON_MARGIN_RIGHT = 6;

/** Icon colors by theme */
const ICON_COLORS = {
  light: '#4b5563',
  dark: '#6b7280',
} as const;

// ============================================================================
// TYPES
// ============================================================================

/** Status values for tool render */
type ToolStatus = 'pending' | 'inProgress' | 'complete' | 'error';

/** Props passed to tool render functions */
interface ToolRenderProps {
  args: Record<string, unknown>;
  status: ToolStatus;
  result?: unknown;
  error?: Error | string;
}

/** Dependencies required by builtin tool renderers */
interface BuiltinToolDependencies {
  isLight: boolean;
  clipText: (text: string, maxLength: number) => string;
}

/** Return type for tool render hooks */
interface ToolRenderHook {
  name: string;
  render: (props: ToolRenderProps) => React.ReactElement;
}

/** Messages displayed for each tool status */
interface StatusMessages {
  pending: string;
  inProgress: string;
  complete: string;
}

/** SVG icon component type */
type IconComponent = React.ReactElement;

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
 * Safely get first element from array
 */
function getFirstElement<T>(arr: unknown): T | undefined {
  if (Array.isArray(arr) && arr.length > 0) {
    return arr[0] as T;
  }
  return undefined;
}

/**
 * Generic factory to create tool render hooks
 */
function createToolRender(
  name: string,
  toolDisplayName: string,
  getIcon: (isLight: boolean) => IconComponent,
  getMessages: (displayText: string) => StatusMessages
): (deps: BuiltinToolDependencies) => ToolRenderHook {
  return ({ isLight, clipText }: BuiltinToolDependencies): ToolRenderHook => ({
    name,
    render: ({ args, status, result, error }: ToolRenderProps) => {
      const prompt = typeof args?.prompt === 'string' ? args.prompt : '';
      const displayText = prompt ? ` "${clipText(prompt, MAX_PROMPT_LENGTH)}"` : '';
      const messages = getMessages(displayText);

      return (
        <ActionStatus
          toolName={toolDisplayName}
          status={status}
          isLight={isLight}
          icon={getIcon(isLight)}
          messages={messages}
          args={args}
          result={result}
          error={error}
        />
      );
    },
  });
}

// ============================================================================
// ICONS
// ============================================================================

/** Globe icon for web search */
function GlobeIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <circle stroke="currentColor" cx="12" cy="12" r="10" />
      <path
        stroke="currentColor"
        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
      />
      <path stroke="currentColor" d="M2 12h20" />
    </svg>
  );
}

/** Terminal icon for code execution */
function TerminalIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <rect stroke="currentColor" x="2" y="4" width="20" height="16" rx="2" />
      <path stroke="currentColor" d="M6 10l4 4-4 4" />
      <line stroke="currentColor" x1="14" y1="14" x2="18" y2="14" />
    </svg>
  );
}

/** Link chain icon for URL context */
function LinkIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <path
        stroke="currentColor"
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
      />
      <path
        stroke="currentColor"
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      />
    </svg>
  );
}

// ============================================================================
// TOOL RENDERERS
// ============================================================================

/**
 * Creates the web_search render hook
 * Uses ActionStatus with a globe icon
 */
export const createWebSearchRender = createToolRender(
  'web_search',
  'Web Search',
  (isLight) => <GlobeIcon style={getIconStyle(isLight)} />,
  (displayText) => ({
    pending: `Starting web search${displayText}…`,
    inProgress: `Searching the web${displayText}…`,
    complete: `Web search complete${displayText}`,
  })
);

/**
 * Creates the code_execution render hook
 * Uses ActionStatus with a terminal icon
 */
export const createCodeExecutionRender = createToolRender(
  'code_execution',
  'Code Execution',
  (isLight) => <TerminalIcon style={getIconStyle(isLight)} />,
  (displayText) => ({
    pending: `Starting code execution${displayText}…`,
    inProgress: `Executing code${displayText}…`,
    complete: `Code execution complete${displayText}`,
  })
);

/**
 * Creates the url_context render hook
 * Uses ActionStatus with a link icon
 *
 * Note: This renderer has special handling for URLs array
 */
export const createUrlContextRender = ({ isLight, clipText }: BuiltinToolDependencies): ToolRenderHook => ({
  name: 'url_context',
  render: ({ args, status, result, error }: ToolRenderProps) => {
    const urls = args?.urls;
    const urlCount = Array.isArray(urls) ? urls.length : 0;
    const urlDisplay = urlCount > 0 ? ` (${urlCount} URL${urlCount !== 1 ? 's' : ''})` : '';

    // Safely get first URL
    const firstUrl = getFirstElement<string>(urls);
    const firstUrlDisplay = firstUrl ? ` - ${clipText(firstUrl, MAX_URL_LENGTH)}` : '';

    return (
      <ActionStatus
        toolName="Load URL Context"
        status={status}
        isLight={isLight}
        icon={<LinkIcon style={getIconStyle(isLight)} />}
        messages={{
          pending: `Starting URL context load${urlDisplay}…`,
          inProgress: `Loading URL context${urlDisplay}${firstUrlDisplay}…`,
          complete: `URL context loaded${urlDisplay}`,
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
});
