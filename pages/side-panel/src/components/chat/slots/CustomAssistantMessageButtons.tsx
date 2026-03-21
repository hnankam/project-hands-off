/**
 * Custom Assistant Message Buttons for CopilotKit V2
 *
 * Custom CopyButton and RegenerateButton components matching V1 styling and behavior.
 */

import * as React from 'react';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
export const CustomCopyButton: React.FC<CustomCopyButtonProps> = ({ copied = false, onClick, ...props }) => {
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
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
      }}>
      {showCopyFeedback ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="16"
          height="16">
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
          height="16">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
};

export interface CustomRegenerateButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export interface CustomRetryKeepButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * CustomRetryKeepButton - Retry without deleting messages
 * Re-runs the agent with current conversation (no message deletion).
 */
export const CustomRetryKeepButton: React.FC<CustomRetryKeepButtonProps> = ({ ...props }) => {
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
      title="Retry without deleting messages"
      style={buttonStyles}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
      }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="16"
        height="16">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    </button>
  );
};

/**
 * CustomRegenerateButton - Regenerate button matching V1 design
 *
 * Features:
 * - V1 size and styling (28px x 28px)
 * - Hover scale effect (1.15x)
 * - Theme-aware colors
 */
export const CustomRegenerateButton: React.FC<CustomRegenerateButtonProps> = ({ ...props }) => {
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
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
      }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="16"
        height="16">
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
export const CustomThumbsUpButton: React.FC<CustomThumbsUpButtonProps> = ({ ...props }) => {
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
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
      }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="16"
        height="16">
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
export const CustomThumbsDownButton: React.FC<CustomThumbsDownButtonProps> = ({ ...props }) => {
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
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
      }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="16"
        height="16">
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
export const CustomReadAloudButton: React.FC<CustomReadAloudButtonProps> = ({ ...props }) => {
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
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.15)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
      }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="16"
        height="16">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    </button>
  );
};

export interface CustomAssistantMoreOptionsButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onRegenerate?: () => void;
  onRetryKeep?: () => void;
}

/**
 * More options (horizontal …) for assistant messages — Regenerate and Retry (keep) in a dropdown,
 * matching CustomMoreOptionsButton styling/behavior.
 */
export const CustomAssistantMoreOptionsButton: React.FC<CustomAssistantMoreOptionsButtonProps> = ({
  onRegenerate,
  onRetryKeep,
  onClick,
  ...props
}) => {
  const { isLight } = useStorage(themeStorage);
  const [open, setOpen] = useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const buttonStyles: React.CSSProperties = React.useMemo(
    () => ({
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
      margin: '0px',
      position: 'relative',
      zIndex: 10002,
    }),
    [isLight],
  );

  const dropdownStyles: React.CSSProperties = React.useMemo(
    () => ({
      position: 'fixed',
      top: '0px',
      right: '0px',
      marginTop: '0',
      backgroundColor: isLight ? '#f9fafb' : '#151C24',
      border: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
      borderRadius: '6px',
      boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
      zIndex: 10002,
      minWidth: '200px',
      maxWidth: '260px',
      width: 'auto',
      overflow: 'visible',
      visibility: 'visible',
      opacity: 1,
      pointerEvents: 'auto',
    }),
    [isLight],
  );

  const menuItemBaseStyles = React.useMemo(
    () => ({
      width: '100%',
      padding: '0.5rem 0.75rem',
      border: 'none',
      backgroundColor: 'transparent',
      fontSize: '12px',
      textAlign: 'left' as const,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      whiteSpace: 'nowrap' as const,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    }),
    [],
  );

  const menuItemTextColor = isLight ? '#374151' : '#d1d5db';
  const menuItemBorderColor = isLight ? '#e5e7eb' : '#374151';
  const menuItemHoverBg = isLight ? '#f3f4f6' : '#1f2937';

  React.useEffect(() => {
    if (open && btnRef.current && menuRef.current) {
      requestAnimationFrame(() => {
        if (btnRef.current && menuRef.current) {
          const r = btnRef.current.getBoundingClientRect();
          menuRef.current.style.top = `${r.bottom + 4}px`;
          menuRef.current.style.right = `${window.innerWidth - r.right}px`;
        }
      });
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside, true);
    return () => document.removeEventListener('mousedown', handleOutside, true);
  }, [open]);

  const handleToggle = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      onClick?.(e);
      setOpen(v => !v);
    },
    [onClick],
  );

  return (
    <>
      <button
        {...props}
        ref={btnRef}
        type="button"
        className=""
        title="More options"
        style={buttonStyles}
        onClick={handleToggle}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.15)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)';
        }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="16"
          height="16"
          aria-hidden={true}>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="copilotKitMoreOptionsDropdownMenu copilotKitAssistantMoreOptionsDropdownMenu"
            style={dropdownStyles}>
            {onRegenerate && (
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRegenerate();
                  setOpen(false);
                }}
                style={{
                  ...menuItemBaseStyles,
                  color: menuItemTextColor,
                  borderBottom: onRetryKeep ? `1px solid ${menuItemBorderColor}` : undefined,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = menuItemHoverBg;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="14"
                  height="14">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate
              </button>
            )}
            {onRetryKeep && (
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRetryKeep();
                  setOpen(false);
                }}
                style={{
                  ...menuItemBaseStyles,
                  color: menuItemTextColor,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = menuItemHoverBg;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="14"
                  height="14">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Retry without deleting
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
};

CustomAssistantMoreOptionsButton.displayName = 'CustomAssistantMoreOptionsButton';
