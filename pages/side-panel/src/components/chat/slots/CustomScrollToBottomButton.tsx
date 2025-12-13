/**
 * Custom Scroll To Bottom Button
 * 
 * A themed scroll-to-bottom button for CopilotKit V2 CopilotChat.
 * Matches the design language of other custom components (CodeBlock, etc.)
 * 
 * Usage: Pass to CopilotChat's scrollToBottomButton slot
 */
import React, { useState } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

/**
 * Theme colors matching CustomCodeBlock and other components
 */
const THEME_COLORS = {
  light: {
    background: '#ffffff',
    border: '#e5e7eb',
    hoverBackground: '#f9fafb',
    iconColor: '#6b7280',
  },
  dark: {
    background: '#151C24',
    border: '#374151',
    hoverBackground: '#0D1117',
    iconColor: '#9ca3af',
  },
} as const;

// Must match CopilotKit's expected type: ButtonHTMLAttributes<HTMLButtonElement>
export type CustomScrollToBottomButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * CustomScrollToBottomButton - Themed scroll-to-bottom button
 */
export const CustomScrollToBottomButton: React.FC<CustomScrollToBottomButtonProps> = (props) => {
  const { className, style, children: _children, onClick, ...rest } = props;
  
  // Note: We intentionally ignore children passed by CopilotKit to use our custom icon design
  void _children;
  
  const themeState = useStorage(themeStorage);
  const isLight = themeState.isLight;
  const colors = isLight ? THEME_COLORS.light : THEME_COLORS.dark;

  const [isHovered, setIsHovered] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <button
      type="button"
      {...rest}
      className={className}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '40px',
        padding: 0,
        borderRadius: '50%',
        backgroundColor: isHovered ? colors.hoverBackground : colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.iconColor,
        cursor: 'pointer',
        outline: 'none',
        transition: 'all 0.2s ease-in-out',
        boxShadow: isLight 
          ? '0 2px 8px rgba(0, 0, 0, 0.08)' 
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        zIndex: 9999,
        position: 'relative',
        pointerEvents: 'auto', // Override CopilotKit's pointer-events: none
        ...style,
      }}
      aria-label="Scroll to bottom"
      title="Scroll to bottom"
      data-custom-scroll-button="true"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          pointerEvents: 'none',
          animation: isHovered ? 'none' : 'customScrollBounce 1.5s ease-in-out infinite',
          transform: isHovered ? 'translateY(3px)' : 'translateY(0)',
          transition: 'transform 0.15s ease-out',
        }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
      <style>{`
        @keyframes customScrollBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(4px); }
        }
      `}</style>
    </button>
  );
};

CustomScrollToBottomButton.displayName = 'CustomScrollToBottomButton';

export default CustomScrollToBottomButton;
