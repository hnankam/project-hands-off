/**
 * Custom Cursor Component for CopilotKit V2
 * 
 * A pulsing dot indicator shown during message streaming.
 * Matches V1 activity dots color scheme.
 */

import React from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { useCopilotChat } from '../../../hooks/copilotkit';

export type CustomCursorProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * CustomCursor - Streaming indicator dot
 * 
 * Features:
 * - 11px x 11px circular dot
 * - Pulse animation (scale 1x to 1.5x, opacity 1 to 0.8)
 * - Theme-aware colors - matches assistant message text color
 * - Light mode: Gray (#374151) - matches assistant message text
 * - Dark mode: Light Gray (#d1d5db) - matches assistant message text
 * - Adaptive margin: larger top margin when no messages exist (initial state)
 * 
 * This cursor appears automatically when isRunning is true in CopilotKit.
 */
export function CustomCursor({ 
  className = '', 
  style,
  ...props 
}: CustomCursorProps): React.JSX.Element {
  const { isLight } = useStorage(themeStorage);
  const { messages } = useCopilotChat();
  
  // Cursor color matches assistant message text color
  const cursorColor = isLight ? '#374151' : '#d1d5db'; // gray-700 / gray-300
  
  // Adaptive margin: larger when no messages (initial state), smaller when continuing conversation
  const hasMessages = messages.length > 0;
  const marginTop = hasMessages ? '0' : '0.75rem';
  
  return (
    <div
      className={className}
      style={{
        width: '11px',
        height: '11px',
        borderRadius: '50%',
        backgroundColor: cursorColor,
        marginLeft: '4px',
        marginTop,
        animation: 'pulse-cursor 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        ...style,
      }}
      {...props}
    />
  );
}

