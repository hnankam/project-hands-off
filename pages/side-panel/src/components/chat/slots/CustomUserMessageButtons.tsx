/**
 * Custom User Message Buttons for CopilotKit V2
 * 
 * Custom CopyButton and EditButton components matching V1 styling and behavior.
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

export interface CustomEditButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * CustomEditButton - Edit button matching V1 design
 * 
 * Features:
 * - V1 size and styling (28px x 28px)
 * - Hover scale effect (1.15x)
 * - Theme-aware colors
 */
export const CustomEditButton: React.FC<CustomEditButtonProps> = ({
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
      title="Edit message"
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
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </button>
  );
};

/**
 * CustomRerunButton - Rerun button matching V1 design
 * 
 * Features:
 * - V1 size and styling (28px x 28px)
 * - Hover scale effect (1.15x)
 * - Muted text colors
 */
export interface CustomRerunButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onRerun?: () => void;
}

export const CustomRerunButton: React.FC<CustomRerunButtonProps> = ({
  onRerun,
  onClick,
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
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e);
    }
    if (onRerun) {
      onRerun();
    }
  };
  
  return (
    <button
      {...props}
      className=""
      title="Rerun response"
      style={buttonStyles}
      onClick={handleClick}
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

/**
 * CustomUndoButton - Undo button matching V1 design
 * 
 * Features:
 * - V1 size and styling (28px x 28px)
 * - Hover scale effect (1.15x)
 * - Muted text colors
 */
export interface CustomUndoButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onUndo?: () => void;
}

export const CustomUndoButton: React.FC<CustomUndoButtonProps> = ({
  onUndo,
  onClick,
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
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e);
    }
    if (onUndo) {
      onUndo();
    }
  };
  
  return (
    <button
      {...props}
      className=""
      title="Undo last edit"
      style={buttonStyles}
      onClick={handleClick}
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
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
      </svg>
    </button>
  );
};

/**
 * CustomMoreOptionsButton - More options button with dropdown menu
 * 
 * Features:
 * - V1 size and styling (28px x 28px)
 * - Hover scale effect (1.15x)
 * - Muted text colors
 * - Dropdown menu with portal containing Refresh and Delete options
 */
export interface CustomMoreOptionsButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onRerun?: () => void;
  onDelete?: (type: 'this' | 'above' | 'below') => void;
  messageIndex?: number;
  isLast?: boolean;
}

export const CustomMoreOptionsButton: React.FC<CustomMoreOptionsButtonProps> = ({
  onRerun,
  onDelete,
  messageIndex = 0,
  isLast = false,
  onClick,
  ...props
}) => {
  const { isLight } = useStorage(themeStorage);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreButtonRef = React.useRef<HTMLButtonElement>(null);
  const moreDropdownRef = React.useRef<HTMLDivElement>(null);
  
  // Memoize button styles to prevent recreation on every render
  const buttonStyles: React.CSSProperties = React.useMemo(() => ({
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
    margin: '0px',
    position: 'relative',
    zIndex: 10002,
  }), [isLight]);
  
  // Memoize dropdown styles to prevent recreation on every render
  const dropdownStyles: React.CSSProperties = React.useMemo(() => ({
    position: 'fixed',
    top: '0px',
    right: '0px',
    marginTop: '0',
    backgroundColor: isLight ? '#f9fafb' : '#151C24',
    border: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
    borderRadius: '6px',
    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
    zIndex: 10002,
    minWidth: '160px',
    maxWidth: '200px',
    width: 'auto',
    overflow: 'visible',
    visibility: 'visible',
    opacity: 1,
    pointerEvents: 'auto',
  }), [isLight]);
  
  // Memoize menu item base styles
  const menuItemBaseStyles = React.useMemo(() => ({
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
  }), []);
  
  const menuItemTextColor = React.useMemo(() => 
    isLight ? '#374151' : '#d1d5db', [isLight]);
  const menuItemBorderColor = React.useMemo(() => 
    isLight ? '#e5e7eb' : '#374151', [isLight]);
  const menuItemHoverBg = React.useMemo(() => 
    isLight ? '#f3f4f6' : '#1f2937', [isLight]);
  const menuItemDisabledColor = React.useMemo(() => 
    isLight ? '#9ca3af' : '#6b7280', [isLight]);
  
  // Position dropdown when it opens
  React.useEffect(() => {
    if (showMoreMenu && moreButtonRef.current && moreDropdownRef.current) {
      requestAnimationFrame(() => {
        if (moreButtonRef.current && moreDropdownRef.current) {
          const buttonRect = moreButtonRef.current.getBoundingClientRect();
          const top = buttonRect.bottom + 4;
          const right = window.innerWidth - buttonRect.right;
          moreDropdownRef.current.style.top = `${top}px`;
          moreDropdownRef.current.style.right = `${right}px`;
        }
      });
    }
  }, [showMoreMenu]);
  
  // Close menu when clicking outside
  React.useEffect(() => {
    if (!showMoreMenu) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const element = target as Element;
      
      // Check if click is inside dropdown or button
      const clickedInsideButton = moreButtonRef.current?.contains(target);
      const clickedInsideDropdown = moreDropdownRef.current?.contains(target);
      
      // Also check if clicking on a button element (for portal buttons)
      const isButton = element.tagName === 'BUTTON' || element.closest('button');
      
      // Don't close if clicking inside dropdown, button, or on a button element
      if (!clickedInsideButton && !clickedInsideDropdown && !isButton) {
        setShowMoreMenu(false);
      }
    };
    
    // Use capture phase but check carefully
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showMoreMenu]);
  
  // Handlers - directly use the callbacks since parent has stabilized them
  const handleClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (onClick) {
      onClick(e);
    }
    setShowMoreMenu(prev => !prev);
  }, [onClick]);
  
  const handleRerun = React.useCallback(() => {
    if (onRerun) {
      onRerun();
    }
    setShowMoreMenu(false);
  }, [onRerun]);
  
  const handleDelete = React.useCallback((type: 'this' | 'above' | 'below') => {
    if (onDelete) {
      onDelete(type);
    }
    setShowMoreMenu(false);
  }, [onDelete]);
  
  return (
    <>
      <button
        {...props}
        ref={moreButtonRef}
        className=""
        title="More options"
        style={buttonStyles}
        onClick={handleClick}
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
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      
      {/* More Options Dropdown Menu - Rendered as Portal */}
      {showMoreMenu &&
        createPortal(
          <div
            ref={moreDropdownRef}
            className="copilotKitMoreOptionsDropdownMenu"
            style={dropdownStyles}
          >
            {/* Refresh/Rerun Option */}
            {onRerun && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRerun();
                }}
                style={{
                  ...menuItemBaseStyles,
                  color: menuItemTextColor,
                  borderBottom: `1px solid ${menuItemBorderColor}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = menuItemHoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="14"
                  height="14"
                >
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh response
              </button>
            )}
            
            {/* Delete Options */}
            {onDelete && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete('this');
                  }}
                  style={{
                    ...menuItemBaseStyles,
                    color: menuItemTextColor,
                    borderBottom: `1px solid ${menuItemBorderColor}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = menuItemHoverBg;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width="14"
                    height="14"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  Delete this message
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete('above');
                  }}
                  disabled={messageIndex === 0}
                  style={{
                    ...menuItemBaseStyles,
                    color: messageIndex === 0 ? menuItemDisabledColor : menuItemTextColor,
                    cursor: messageIndex === 0 ? 'not-allowed' : 'pointer',
                    borderBottom: `1px solid ${menuItemBorderColor}`,
                  }}
                  onMouseEnter={(e) => {
                    if (messageIndex !== 0) {
                      e.currentTarget.style.backgroundColor = menuItemHoverBg;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width="14"
                    height="14"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  Delete all above
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete('below');
                  }}
                  disabled={isLast}
                  style={{
                    ...menuItemBaseStyles,
                    color: isLast ? menuItemDisabledColor : menuItemTextColor,
                    cursor: isLast ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLast) {
                      e.currentTarget.style.backgroundColor = menuItemHoverBg;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width="14"
                    height="14"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  Delete all below
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
};

CustomMoreOptionsButton.displayName = 'CustomMoreOptionsButton';

/**
 * CustomDeleteButton - Delete button with dropdown menu matching V1 design
 * 
 * Features:
 * - V1 size and styling (28px x 28px)
 * - Hover scale effect (1.15x)
 * - Muted text colors
 * - Dropdown menu with portal
 * 
 * @deprecated Use CustomMoreOptionsButton instead
 */
export interface CustomDeleteButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onDelete?: (type: 'this' | 'above' | 'below') => void;
  messageIndex?: number;
  isLast?: boolean;
}

export const CustomDeleteButton: React.FC<CustomDeleteButtonProps> = ({
  onDelete,
  messageIndex = 0,
  isLast = false,
  onClick,
  ...props
}) => {
  const { isLight } = useStorage(themeStorage);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const deleteButtonRef = React.useRef<HTMLButtonElement>(null);
  const deleteDropdownRef = React.useRef<HTMLDivElement>(null);
  
  // Position dropdown when it opens
  React.useEffect(() => {
    if (showDeleteMenu && deleteButtonRef.current && deleteDropdownRef.current) {
      requestAnimationFrame(() => {
        if (deleteButtonRef.current && deleteDropdownRef.current) {
          const buttonRect = deleteButtonRef.current.getBoundingClientRect();
          const top = buttonRect.bottom + 4;
          const right = window.innerWidth - buttonRect.right;
          deleteDropdownRef.current.style.top = `${top}px`;
          deleteDropdownRef.current.style.right = `${right}px`;
        }
      });
    }
  }, [showDeleteMenu]);
  
  // Close menu when clicking outside
  React.useEffect(() => {
    if (!showDeleteMenu) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !deleteButtonRef.current?.contains(target) &&
        !deleteDropdownRef.current?.contains(target)
      ) {
        setShowDeleteMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showDeleteMenu]);
  
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
    margin: '0px',
    position: 'relative',
    zIndex: 10002,
  };
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onClick) {
      onClick(e);
    }
    setShowDeleteMenu(!showDeleteMenu);
  };
  
  const handleDelete = (type: 'this' | 'above' | 'below') => {
    if (onDelete) {
      onDelete(type);
    }
    setShowDeleteMenu(false);
  };
  
  return (
    <>
      <button
        {...props}
        ref={deleteButtonRef}
        className=""
        title="Delete options"
        style={buttonStyles}
        onClick={handleClick}
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
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
      
      {/* Delete Dropdown Menu - Rendered as Portal */}
      {showDeleteMenu &&
        createPortal(
          <div
            ref={deleteDropdownRef}
            className="copilotKitDeleteDropdownMenu"
            style={{
              position: 'fixed',
              top: '0px',
              right: '0px',
              marginTop: '0',
              backgroundColor: isLight ? '#f9fafb' : '#151C24',
              border: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
              borderRadius: '6px',
              boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
              zIndex: 10002,
              minWidth: '160px',
              maxWidth: '200px',
              width: 'auto',
              overflow: 'visible',
              visibility: 'visible',
              opacity: 1,
              pointerEvents: 'auto',
            }}
          >
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDelete('this');
              }}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: 'none',
                backgroundColor: 'transparent',
                color: isLight ? '#374151' : '#d1d5db',
                fontSize: '12px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                borderBottom: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#1f2937';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Delete this message
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDelete('above');
              }}
              disabled={messageIndex === 0}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: 'none',
                backgroundColor: 'transparent',
                color:
                  messageIndex === 0
                    ? isLight
                      ? '#9ca3af'
                      : '#6b7280'
                    : isLight
                    ? '#374151'
                    : '#d1d5db',
                fontSize: '12px',
                textAlign: 'left',
                cursor: messageIndex === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                borderBottom: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (messageIndex !== 0) {
                  e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#1f2937';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Delete all above
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDelete('below');
              }}
              disabled={isLast}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: 'none',
                backgroundColor: 'transparent',
                color: isLast ? (isLight ? '#9ca3af' : '#6b7280') : isLight ? '#374151' : '#d1d5db',
                fontSize: '12px',
                textAlign: 'left',
                cursor: isLast ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (!isLast) {
                  e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#1f2937';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Delete all below
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};

