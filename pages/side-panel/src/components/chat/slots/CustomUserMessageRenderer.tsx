/**
 * Custom User Message Renderer for CopilotKit V2
 * 
 * Renders user message content with V1 styling (border, background colors)
 * and full width support.
 */

import React from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

export interface CustomUserMessageRendererProps {
  content: string;
  className?: string;
}

/**
 * CustomUserMessageRenderer - Full width message renderer with V1 styling
 * 
 * Features:
 * - Full width content (100% width, max-width 100%)
 * - Word wrapping for long content
 * - V1 border and background colors (theme-aware)
 * - Matches copilotKitUserMessage styling from V1
 */
export const CustomUserMessageRenderer: React.FC<CustomUserMessageRendererProps> = ({
  content,
  className = '',
}) => {
  const { isLight } = useStorage(themeStorage);
  
  // V1 styling colors
  const styles = React.useMemo(() => {
    if (isLight) {
      // Light mode: matches V1 copilotKitUserMessage
      return {
        width: '100%',
        maxWidth: '100%',
        wordBreak: 'break-word' as const,
        overflowWrap: 'break-word' as const,
        backgroundColor: '#f9fafb', // Light mode background
        border: '1px solid #e5e7eb', // Light mode border
        borderRadius: '10px',
        padding: '0.5rem',
        color: '#374151', // Light mode text color
      };
    } else {
      // Dark mode: matches V1 copilotKitUserMessage
      return {
        width: '100%',
        maxWidth: '100%',
        wordBreak: 'break-word' as const,
        overflowWrap: 'break-word' as const,
        backgroundColor: '#151C24', // Dark mode background (copilot-kit-secondary-color equivalent)
        border: '1px solid #374151', // Dark mode border
        borderRadius: '10px',
        padding: '0.5rem',
        color: '#d1d5db', // Dark mode text color
      };
    }
  }, [isLight]);
  
  return (
    <div 
      className={className}
      style={styles}
    >
      {content}
    </div>
  );
};

export default CustomUserMessageRenderer;

