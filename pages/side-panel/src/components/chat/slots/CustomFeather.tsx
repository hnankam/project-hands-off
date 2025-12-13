/**
 * Custom Feather Component for CopilotKit V2
 * 
 * Creates a gradient fade effect at the bottom of the chat scroll area
 * to smoothly transition content into the input area.
 */
import React from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

export interface CustomFeatherProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * CustomFeather - Gradient fade effect at bottom of chat
 * 
 * Styling:
 * - Positioned absolutely at bottom
 * - 24px height (h-24)
 * - Gradient from solid to transparent (going upward)
 * - pointer-events-none so it doesn't block clicks
 * - z-10 for layering
 * - Background matches message container: #ffffff (light) / #0D1117 (dark)
 */
export const CustomFeather: React.FC<CustomFeatherProps> = ({ 
  className = '', 
  style, 
  ...props 
}) => {
  const themeState = useStorage(themeStorage);
  const isLight = themeState.isLight;

  // Message container background colors - matches messages area for seamless transition
  const bgColor = isLight ? '#ffffff' : '#0D1117';

  return (
    <div
      className={`absolute bottom-0 left-0 right-4 h-24 pointer-events-none z-10 ${className}`.trim()}
      style={{
        background: `linear-gradient(to top, ${bgColor} 0%, ${bgColor} 50%, transparent 100%)`,
        ...style,
      }}
      {...props}
    />
  );
};

export default CustomFeather;
