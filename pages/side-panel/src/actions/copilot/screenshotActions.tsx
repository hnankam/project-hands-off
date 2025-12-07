/**
 * Screenshot CopilotKit Actions
 *
 * Actions for capturing screenshots of the current tab
 */

import React from 'react';
import { debug } from '@extension/shared';
import { ActionStatus } from '../../components/feedback/ActionStatus';
import { handleTakeScreenshot } from '../index';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default JPEG quality */
const DEFAULT_JPEG_QUALITY = 20;

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

/** Image format options */
type ImageFormat = 'png' | 'jpeg';

/** Screenshot dimensions */
interface ScreenshotDimensions {
  width: number;
  height: number;
  devicePixelRatio?: number;
}

/** Screenshot info from result */
interface ScreenshotInfo {
  format: ImageFormat;
  dimensions?: ScreenshotDimensions;
  sizeKB?: number;
  quality?: number;
  isFullPage: boolean;
  url?: string;
}

/** Screenshot result */
interface ScreenshotResult {
  status: 'success' | 'error';
  message: string;
  screenshotInfo?: ScreenshotInfo;
}

/** Arguments for takeScreenshot action */
interface TakeScreenshotArgs {
  captureFullPage?: boolean;
  format?: ImageFormat;
  quality?: number;
}

/** Props passed to action render functions */
interface ActionRenderProps {
  status: ActionPhase;
  args?: TakeScreenshotArgs;
  result?: ScreenshotResult;
  error?: Error | string;
}

/** Dependencies for screenshot actions */
interface ScreenshotActionDependencies {
  isLight: boolean;
}

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
 * Common SVG props for icons
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

// ============================================================================
// ICONS
// ============================================================================

/** Camera icon for screenshot action */
function CameraIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <path
        stroke="currentColor"
        d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
      />
      <circle stroke="currentColor" cx="12" cy="13" r="3" />
    </svg>
  );
}

// ============================================================================
// ACTION CREATORS
// ============================================================================

/**
 * Creates the takeScreenshot action
 * Captures a screenshot of the current tab (viewport or full page)
 */
export const createTakeScreenshotAction = ({ isLight }: ScreenshotActionDependencies) => ({
  name: 'takeScreenshot',
  description: 'Capture screenshot of the current tab (viewport by default; JPEG/PNG).',
  parameters: [
    {
      name: 'captureFullPage',
      type: 'boolean',
      description:
        'If true, captures entire scrollable page. If false, captures only visible viewport (default: true). Note: Full page capture is experimental.',
      required: false,
    },
    {
      name: 'format',
      type: 'string',
      description:
        "Image format: 'png' for lossless quality or 'jpeg' for smaller file size (default: 'jpeg' for optimal compression).",
      required: false,
    },
    {
      name: 'quality',
      type: 'number',
      description:
        "JPEG quality from 0-100, only applies when format is 'jpeg' (default: 20 for optimal compression). Higher = better quality but larger file. Typical values: 10 (high compression), 20 (balanced), 35 (higher quality).",
      required: false,
    },
  ],
  render: ({ status, args, result, error }: ActionRenderProps) => {
    const isFullPage = args?.captureFullPage ?? false;
    const format = args?.format ?? 'jpeg';
    const quality = args?.quality ?? DEFAULT_JPEG_QUALITY;
    const captureType = isFullPage ? 'full page' : 'viewport';
    const details = format === 'jpeg' ? `${format.toUpperCase()}, Q${quality}` : format.toUpperCase();

    // Extract screenshot info from result
    const screenshotInfo = status === 'complete' ? result?.screenshotInfo : undefined;
    const dimensions = screenshotInfo?.dimensions;
    const sizeKB = screenshotInfo?.sizeKB;

    // Build complete message with dimensions and size
    let completeMessage = `Screenshot captured: ${captureType}, ${details}`;
    if (dimensions && sizeKB) {
      completeMessage += ` • ${dimensions.width}×${dimensions.height}px, ${sizeKB}KB`;
    }

    return (
      <ActionStatus
        toolName={`Screenshot (${captureType}, ${details})`}
        status={status}
        isLight={isLight}
        icon={<CameraIcon style={getIconStyle(isLight)} />}
        messages={{
          pending: `Taking ${captureType} screenshot (${details})`,
          inProgress: `Capturing ${captureType} screenshot (${details})`,
          complete: completeMessage,
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({
    captureFullPage = false,
    format = 'jpeg',
    quality = DEFAULT_JPEG_QUALITY,
  }: {
    captureFullPage?: boolean;
    format?: ImageFormat;
    quality?: number;
  }) => {
    debug.log(ts(), LOG_PREFIX.request, 'takeScreenshot:', { captureFullPage, format, quality });
    const result = await handleTakeScreenshot(captureFullPage, format, quality);
    debug.log(ts(), LOG_PREFIX.response, 'takeScreenshot:', result);
    return result;
  },
});
