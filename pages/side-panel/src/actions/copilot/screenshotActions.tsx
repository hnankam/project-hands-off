/**
 * Screenshot CopilotKit Actions
 * 
 * Actions for capturing screenshots of the current tab
 */

import React from 'react';
import { debug } from '@extension/shared';
import { ActionStatus } from '../../components/ActionStatus';
import { handleTakeScreenshot } from '../index';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

interface ScreenshotActionDependencies {
  isLight: boolean;
}

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
  render: ({ status, args, result }: any) => {
    const isFullPage = (args as any)?.captureFullPage;
    const format = (args as any)?.format || 'jpeg';
    const quality = (args as any)?.quality || 20;
    const captureType = isFullPage ? 'full page' : 'viewport';
    const details = format === 'jpeg' ? `${format.toUpperCase()}, Q${quality}` : format.toUpperCase();
    
    // Extract screenshot info from result
    const screenshotInfo = status === 'complete' && result ? (result as any)?.screenshotInfo : null;
    const dimensions = screenshotInfo?.dimensions;
    const sizeKB = screenshotInfo?.sizeKB;
    
    // Build complete message with dimensions and size
    let completeMessage = `Screenshot captured: ${captureType}, ${details}`;
    if (dimensions && sizeKB) {
      const width = dimensions.width;
      const height = dimensions.height;
      completeMessage += ` • ${width}×${height}px, ${sizeKB}KB`;
    }
    
    // Camera icon with colorful gradient
    const cameraIcon = (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, marginRight: 6 }}
      >
        <defs>
          <linearGradient id="cameraBodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#4A90E2', stopOpacity: 1 }} />
            <stop offset="50%" style={{ stopColor: '#7B68EE', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#9370DB', stopOpacity: 1 }} />
          </linearGradient>
          <linearGradient id="cameraLensGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#FF6B6B', stopOpacity: 1 }} />
            <stop offset="50%" style={{ stopColor: '#FFA500', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#FFD700', stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        {/* Camera body in cool blue-purple gradient, lens in warm red-orange-gold gradient */}
        <path stroke="url(#cameraBodyGradient)" d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <circle stroke="url(#cameraLensGradient)" cx="12" cy="13" r="3" />
      </svg>
    );
    
    return (
      <ActionStatus
        toolName={`Screenshot (${captureType}, ${details})`}
        status={status as any}
        isLight={isLight}
        icon={cameraIcon}
        messages={{
          pending: `Taking ${captureType} screenshot (${details})`,
          inProgress: `Capturing ${captureType} screenshot (${details})`,
          complete: completeMessage
        }}
      />
    );
  },
  handler: async ({ 
    captureFullPage = false, 
    format = 'jpeg', 
    quality = 20 
  }: { 
    captureFullPage?: boolean; 
    format?: 'png' | 'jpeg'; 
    quality?: number;
  }) => {
    const result = await handleTakeScreenshot(captureFullPage, format as 'png' | 'jpeg', quality);
    debug.log(ts(), '[Agent Response] takeScreenshot:', result);
    return result;
  },
});

