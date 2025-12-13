/**
 * Custom Input Container Component for CopilotKit V2
 * 
 * Wrapper around CopilotChatView.InputContainer that holds the chat input
 * and disclaimer at the bottom of the chat interface.
 * 
 * Currently maintains default behavior - customizations can be added later.
 */

import React from 'react';
import { CopilotChat } from '../../../hooks/copilotkit';

export type CustomInputContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

/**
 * CustomInputContainer - Fixed bottom container for input and disclaimer
 * 
 * Features:
 * - Absolute positioning at bottom of chat
 * - Keyboard-aware positioning (mobile/PWA)
 * - Dynamic height tracking via ResizeObserver
 * - Currently uses all default styling and behavior
 * 
 * Must be React.FC (not forwardRef) to match CopilotKit slot type
 */
export const CustomInputContainer: React.FC<CustomInputContainerProps> = ({ 
  children, 
  className, 
  style, 
  ...props 
}) => {
  return (
    <div
      className={className}
      style={{
        boxShadow: 'none',
        border: 'none',
        borderTop: 'none',
        borderBottom: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        pointerEvents: 'none',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

