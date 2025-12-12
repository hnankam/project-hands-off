/**
 * Custom Cursor Component for CopilotKit V2
 * 
 * A pulsing dot indicator shown during message streaming.
 * Matches V1 activity dots color scheme.
 */

import React from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

export type CustomCursorProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * CustomCursor - Streaming indicator dot
 * 
 * Features:
 * - 11px x 11px circular dot
 * - Pulse animation (scale 1x to 1.5x, opacity 1 to 0.8)
 * - Theme-aware colors matching V1 activity dots
 * - Light mode: Blue (#3b82f6) - matches loading/activity indicators
 * - Dark mode: Blue (#60a5fa) - lighter shade for visibility
 * 
 * This cursor appears automatically when isRunning is true in CopilotKit.
 */
export function CustomCursor({ 
  className = '', 
  style,
  ...props 
}: CustomCursorProps): React.JSX.Element {
  const { isLight } = useStorage(themeStorage);
  
  // Activity dot colors matching V1
  const cursorColor = isLight ? '#3b82f6' : '#60a5fa'; // Blue-500 / Blue-400
  
  return (
    <div
      className={className}
      style={{
        width: '11px',
        height: '11px',
        borderRadius: '50%',
        backgroundColor: cursorColor,
        marginLeft: '4px',
        animation: 'pulse-cursor 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        ...style,
      }}
      {...props}
    />
  );
}

