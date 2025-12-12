/**
 * Custom Assistant Message Buttons for CopilotKit V2
 * 
 * Custom CopyButton and RegenerateButton components matching V1 styling and behavior.
 */

import React, { useState, useEffect } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

export interface CustomCopyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  copied?: boolean;
}

/**
 * CustomCopyButton - Copy button matching V1 design
 * 
 * Features:
 * - V1 size and styling (28px x 28px)
 * - Hover scale effect (1.15x)
 * - Copy feedback with checkmark icon
 * - Theme-aware colors
 */
export const CustomCopyButton: React.FC<CustomCopyButtonProps> = ({
  copied = false,
  onClick,
  ...props
}) => {
  const { isLight } = useStorage(themeStorage);
  const [showCopyFeedback, setShowCopyFeedback] = useState(copied);
  
  // Sync with external copied prop
  useEffect(() => {
    setShowCopyFeedback(copied);
    if (copied) {
      const timer = setTimeout(() => setShowCopyFeedback(false), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [copied]);
  
  const buttonStyles: React.CSSProperties = {
    width: '28px',
    height: '28px',
    padding: '0.5rem',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'transparent',
    // Muted text colors matching message text
    color: showCopyFeedback ? '#22c55e' : isLight ? '#374151' : '#d1d5db',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  };
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e);
    }
    // Show feedback even if onClick doesn't handle it
    if (!copied) {
      setShowCopyFeedback(true);
      setTimeout(() => setShowCopyFeedback(false), 2000);
    }
  };
  
  return (
    <button
      {...props}
      className=""
      title="Copy message"
      style={buttonStyles}
      onClick={handleClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {showCopyFeedback ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="16"
          height="16"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="16"
          height="16"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
};

export interface CustomRegenerateButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * CustomRegenerateButton - Regenerate button matching V1 design
 * 
 * Features:
 * - V1 size and styling (28px x 28px)
 * - Hover scale effect (1.15x)
 * - Theme-aware colors
 */
export const CustomRegenerateButton: React.FC<CustomRegenerateButtonProps> = ({
  ...props
}) => {
  const { isLight } = useStorage(themeStorage);
  
  const buttonStyles: React.CSSProperties = {
    width: '28px',
    height: '28px',
    padding: '0.5rem',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'transparent',
    // Muted text colors matching message text
    color: isLight ? '#374151' : '#d1d5db',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  };
  
  return (
    <button
      {...props}
      className=""
      title="Regenerate response"
      style={buttonStyles}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="16"
        height="16"
      >
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  );
};

export interface CustomThumbsUpButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * CustomThumbsUpButton - Thumbs up button matching V1 design
 * 
 * Features:
 * - V1 size and styling (28px x 28px)
 * - Hover scale effect (1.15x)
 * - Theme-aware colors
 */
export const CustomThumbsUpButton: React.FC<CustomThumbsUpButtonProps> = ({
  ...props
}) => {
  const { isLight } = useStorage(themeStorage);
  
  const buttonStyles: React.CSSProperties = {
    width: '28px',
    height: '28px',
    padding: '0.5rem',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'transparent',
    color: isLight ? '#374151' : '#d1d5db',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  };
  
  return (
    <button
      {...props}
      className=""
      title="Good response"
      style={buttonStyles}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="16"
        height="16"
      >
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
      </svg>
    </button>
  );
};

export interface CustomThumbsDownButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * CustomThumbsDownButton - Thumbs down button matching V1 design
 * 
 * Features:
 * - V1 size and styling (28px x 28px)
 * - Hover scale effect (1.15x)
 * - Theme-aware colors
 */
export const CustomThumbsDownButton: React.FC<CustomThumbsDownButtonProps> = ({
  ...props
}) => {
  const { isLight } = useStorage(themeStorage);
  
  const buttonStyles: React.CSSProperties = {
    width: '28px',
    height: '28px',
    padding: '0.5rem',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'transparent',
    color: isLight ? '#374151' : '#d1d5db',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  };
  
  return (
    <button
      {...props}
      className=""
      title="Bad response"
      style={buttonStyles}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="16"
        height="16"
      >
        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
      </svg>
    </button>
  );
};

export interface CustomReadAloudButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * CustomReadAloudButton - Read aloud button matching V1 design
 * 
 * Features:
 * - V1 size and styling (28px x 28px)
 * - Hover scale effect (1.15x)
 * - Theme-aware colors
 */
export const CustomReadAloudButton: React.FC<CustomReadAloudButtonProps> = ({
  ...props
}) => {
  const { isLight } = useStorage(themeStorage);
  
  const buttonStyles: React.CSSProperties = {
    width: '28px',
    height: '28px',
    padding: '0.5rem',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'transparent',
    color: isLight ? '#374151' : '#d1d5db',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  };
  
  return (
    <button
      {...props}
      className=""
      title="Read aloud"
      style={buttonStyles}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="16"
        height="16"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    </button>
  );
};

