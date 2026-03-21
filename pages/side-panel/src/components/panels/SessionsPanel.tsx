import * as React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@extension/ui';
import { sessionStorageDBWrapper } from '@extension/shared';
import type { SessionMetadata } from '@extension/shared';
import { API_CONFIG } from '../../constants';
import { fetchSessionUsageSummary, type SessionUsageSummary } from '../../lib/sessionUsageApi';

interface SessionsPanelProps {
  isLight: boolean;
  isOpen: boolean;
  onClose: () => void;
  sessions: SessionMetadata[];
  currentSessionId: string | null;
  onNewSession?: () => void;
  onOpenSession?: (sessionId: string) => void;
  onCloneSession?: (sessionId: string) => void;
  onArchiveSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onWidthChange?: (width: number) => void;
  initialWidth?: number;
  /** Fraction of the content area (below header) for the open-chats row; persisted like panel width */
  initialSplitRatio?: number;
  onSplitRatioChange?: (ratio: number) => void;
  isSmallView?: boolean;
  apiBaseUrl?: string;
}

interface SessionMoreOptionsButtonProps {
  session: SessionMetadata;
  isLight: boolean;
  isOpen: boolean;
  isArchived?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onClone: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

const SessionMoreOptionsButton: React.FC<SessionMoreOptionsButtonProps> = ({
  session,
  isLight,
  isOpen,
  isArchived = false,
  onToggle,
  onOpen,
  onClone,
  onArchive,
  onDelete,
}) => {
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && moreButtonRef.current && moreDropdownRef.current) {
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
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideButton = moreButtonRef.current?.contains(target);
      const clickedInsideDropdown = moreDropdownRef.current?.contains(target);
      if (!clickedInsideButton && !clickedInsideDropdown) onToggle();
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isOpen, onToggle]);

  const buttonClassName = cn(
    'rounded transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100 pt-1',
    isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300',
  );

  const dropdownStyles: React.CSSProperties = {
    position: 'fixed',
    top: '0px',
    right: '0px',
    backgroundColor: isLight ? '#f9fafb' : '#151C24',
    border: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
    borderRadius: '6px',
    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
    zIndex: 10002,
    minWidth: '160px',
    maxWidth: '200px',
    overflow: 'visible',
    visibility: 'visible',
    opacity: 1,
    pointerEvents: 'auto',
  };

  const menuItemBaseStyles: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '12px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  const menuItemTextColor = isLight ? '#374151' : '#d1d5db';
  const menuItemBorderColor = isLight ? '#e5e7eb' : '#374151';
  const menuItemHoverBg = isLight ? '#f3f4f6' : '#1f2937';

  const makeItem = (onClick: () => void, icon: React.ReactNode, label: string, isLast = false) => (
    <button
      type="button"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      style={{
        ...menuItemBaseStyles,
        color: menuItemTextColor,
        ...(!isLast && { borderBottom: `1px solid ${menuItemBorderColor}` }),
      }}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = menuItemHoverBg;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}>
      {icon}
      {label}
    </button>
  );

  return (
    <>
      <button
        ref={moreButtonRef}
        className={buttonClassName}
        title="More options"
        onClick={e => {
          e.stopPropagation();
          e.preventDefault();
          onToggle();
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
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {isOpen &&
        createPortal(
          <div ref={moreDropdownRef} style={dropdownStyles}>
            {makeItem(
              onOpen,
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="14"
                height="14">
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>,
              'Open Chat',
              false,
            )}
            {makeItem(
              onClone,
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="14"
                height="14">
                <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>,
              'Clone Chat',
              !isArchived,
            )}
            {!isArchived &&
              makeItem(
                onArchive,
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="14"
                  height="14">
                  <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>,
                'Archive Chat',
                false,
              )}
            {makeItem(
              onDelete,
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="14"
                height="14">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>,
              'Delete Chat',
              true,
            )}
          </div>,
          document.body,
        )}
    </>
  );
};

const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 400;
const DEFAULT_PANEL_WIDTH = 280;
const PANEL_ANIMATION_DURATION_MS = 220;

/** Total height of split drag row (py + 1px line) for flex track math */
const SPLIT_HANDLE_PX = 13;
const MIN_SPLIT_RATIO = 0.22;
const MAX_SPLIT_RATIO = 0.82;
const DEFAULT_SPLIT_RATIO = 0.55;

const formatTimestamp = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export const SessionsPanel: React.FC<SessionsPanelProps> = ({
  isLight,
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onNewSession,
  onOpenSession,
  onCloneSession,
  onArchiveSession,
  onDeleteSession,
  onWidthChange,
  initialWidth = DEFAULT_PANEL_WIDTH,
  initialSplitRatio = DEFAULT_SPLIT_RATIO,
  onSplitRatioChange,
  isSmallView = false,
  apiBaseUrl,
}) => {
  const [width, setWidth] = useState(initialWidth);
  const [splitRatio, setSplitRatio] = useState(initialSplitRatio);
  const [openMoreMenuSessionId, setOpenMoreMenuSessionId] = useState<string | null>(null);
  const [isArchivedExpanded, setIsArchivedExpanded] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [hoverRect, setHoverRect] = useState<{ left: number; top: number } | null>(null);
  const [hoverUsageStats, setHoverUsageStats] = useState<SessionUsageSummary | null | 'loading'>('loading');
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverFetchSessionRef = useRef<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(initialWidth);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const splitResizeStartY = useRef(0);
  const splitResizeStartRatio = useRef(DEFAULT_SPLIT_RATIO);

  /** Top scroll feather overlays content; hide at scrollTop 0 so the first row is not dimmed */
  const [showOpenListTopFeather, setShowOpenListTopFeather] = useState(false);
  const [showArchivedListTopFeather, setShowArchivedListTopFeather] = useState(false);

  const handleOpenSessionsScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setShowOpenListTopFeather(e.currentTarget.scrollTop > 2);
  }, []);

  const handleArchivedSessionsScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setShowArchivedListTopFeather(e.currentTarget.scrollTop > 2);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setShowOpenListTopFeather(false);
      setShowArchivedListTopFeather(false);
    }
  }, [isOpen]);

  const openSessions = React.useMemo(
    () => [...sessions.filter(s => s.isOpen)].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    [sessions],
  );
  const archivedSessions = React.useMemo(
    () => [...sessions.filter(s => !s.isOpen)].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    [sessions],
  );

  useEffect(() => {
    setShowOpenListTopFeather(false);
  }, [openSessions]);

  useEffect(() => {
    setShowArchivedListTopFeather(false);
  }, [archivedSessions, isArchivedExpanded]);

  // Opening animation: slide in from left
  useEffect(() => {
    if (!isOpen) return;
    setIsClosing(false);
    const frame = requestAnimationFrame(() => {
      setIsAnimatingIn(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCloseClick = useCallback(() => {
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, PANEL_ANIMATION_DURATION_MS);
  }, [onClose]);
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  // Update width when initialWidth changes
  React.useEffect(() => {
    if (isOpen && initialWidth !== width) {
      setWidth(initialWidth);
      resizeStartWidth.current = initialWidth;
    }
  }, [isOpen, initialWidth, width]);

  // Left panel: resize handle on RIGHT edge; dragging right increases width
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = width;
    },
    [width],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaX = e.clientX - resizeStartX.current;
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, resizeStartWidth.current + deltaX));
      setWidth(newWidth);
      onWidthChange?.(newWidth);
    },
    [isResizing, onWidthChange],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  React.useEffect(() => {
    if (!isResizing) return;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  React.useEffect(() => {
    if (isOpen && initialSplitRatio !== splitRatio) {
      setSplitRatio(initialSplitRatio);
    }
  }, [isOpen, initialSplitRatio, splitRatio]);

  const handleSplitMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = splitContainerRef.current;
      const h = el?.getBoundingClientRect().height ?? 0;
      if (h <= SPLIT_HANDLE_PX) return;
      setIsResizingSplit(true);
      splitResizeStartY.current = e.clientY;
      splitResizeStartRatio.current = splitRatio;
    },
    [splitRatio],
  );

  const handleSplitMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizingSplit) return;
      const el = splitContainerRef.current;
      const h = el?.getBoundingClientRect().height ?? 0;
      const track = Math.max(1, h - SPLIT_HANDLE_PX);
      const deltaY = e.clientY - splitResizeStartY.current;
      const deltaRatio = deltaY / track;
      const next = Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, splitResizeStartRatio.current + deltaRatio));
      setSplitRatio(next);
      onSplitRatioChange?.(next);
    },
    [isResizingSplit, onSplitRatioChange],
  );

  const handleSplitMouseUp = useCallback(() => {
    setIsResizingSplit(false);
  }, []);

  React.useEffect(() => {
    if (!isResizingSplit) return;
    document.addEventListener('mousemove', handleSplitMouseMove);
    document.addEventListener('mouseup', handleSplitMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleSplitMouseMove);
      document.removeEventListener('mouseup', handleSplitMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingSplit, handleSplitMouseMove, handleSplitMouseUp]);

  const handleSessionClick = useCallback(
    (sessionId: string) => {
      if (sessionId === currentSessionId) return;
      sessionStorageDBWrapper.setActiveSession(sessionId);
    },
    [currentSessionId],
  );

  const handleEditClick = useCallback((sessionId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingSessionId(sessionId);
    setEditValue(currentTitle);
  }, []);

  const handleEditSubmit = useCallback(() => {
    if (editingSessionId && editValue.trim()) {
      sessionStorageDBWrapper.updateSessionTitle(editingSessionId, editValue.trim(), apiBaseUrl);
    }
    setEditingSessionId(null);
    setEditValue('');
  }, [editingSessionId, editValue, apiBaseUrl]);

  const handleEditCancel = useCallback(() => {
    setEditingSessionId(null);
    setEditValue('');
  }, []);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleEditSubmit();
      } else if (e.key === 'Escape') {
        handleEditCancel();
      }
    },
    [handleEditSubmit, handleEditCancel],
  );

  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSessionId]);

  const handleSessionMouseEnter = useCallback(
    (sessionId: string, el: HTMLElement, e?: React.MouseEvent) => {
      if (editingSessionId && editingSessionId === sessionId) return;
      if (e?.target && (e.target as Element).closest?.('[data-tooltip-exclude]')) return;
      hoverTimeoutRef.current = setTimeout(async () => {
        const rect = el.getBoundingClientRect();
        setHoverRect({ left: rect.left + rect.width / 2, top: rect.bottom });
        setHoveredSessionId(sessionId);
        setHoverUsageStats('loading');
        hoverFetchSessionRef.current = sessionId;
        try {
          const baseUrl = apiBaseUrl ?? API_CONFIG.BASE_URL;
          const stats = await fetchSessionUsageSummary(baseUrl, sessionId);
          if (hoverFetchSessionRef.current === sessionId) {
            setHoverUsageStats(stats);
          }
        } catch {
          if (hoverFetchSessionRef.current === sessionId) {
            setHoverUsageStats(null);
          }
        }
      }, 150);
    },
    [editingSessionId, apiBaseUrl],
  );

  const handleSessionMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hoverFetchSessionRef.current = null;
    setHoveredSessionId(null);
    setHoverRect(null);
    setHoverUsageStats('loading');
  }, []);

  const handleTooltipExcludeMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredSessionId(null);
    setHoverRect(null);
    setHoverUsageStats('loading');
  }, []);

  useEffect(
    () => () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    },
    [],
  );

  const formatNumber = (n: number) => n.toLocaleString();

  if (!isOpen) {
    return null;
  }

  const hasArchivedSplit = archivedSessions.length > 0;

  const renderOpenChatsSection = () => (
    <>
      {onNewSession && (
        <button
          onClick={onNewSession}
          className={cn(
            'text-md mb-3 flex w-full flex-shrink-0 items-center gap-2 rounded px-3 py-3 font-bold uppercase transition-colors',
            hasArchivedSplit ? 'mt-1' : 'mt-3',
            isLight ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700',
          )}
          title="Start new chat">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Start New Chat</span>
        </button>
      )}
      {openSessions.length === 0 ? (
        <div className={cn('flex-shrink-0 px-4 py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
          <p>No open chats</p>
          <p className="mt-1 text-xs opacity-75">Create a new chat to get started.</p>
        </div>
      ) : (
        <div
          className={cn('sessions-panel-open-wrapper relative flex flex-col', hasArchivedSplit && 'min-h-0 flex-1')}
          style={
            {
              '--archived-feather-bg': isLight ? '#ffffff' : '#0D1117',
            } as React.CSSProperties
          }>
          <div
            className={cn(
              'sessions-panel-list recent-sessions-scroll space-y-0 overflow-y-auto pb-2',
              hasArchivedSplit ? 'min-h-0 flex-1' : 'max-h-[min(50vh,20rem)]',
            )}
            onScroll={handleOpenSessionsScroll}>
            {openSessions.map(session => (
              <div
                key={session.id}
                data-session-id={session.id}
                onClick={() => handleSessionClick(session.id)}
                onMouseEnter={e => handleSessionMouseEnter(session.id, e.currentTarget, e)}
                onMouseLeave={handleSessionMouseLeave}
                className={cn(
                  'group relative flex cursor-pointer items-center rounded px-3 py-2 text-xs transition-colors',
                  session.id === currentSessionId
                    ? isLight
                      ? 'bg-gray-50 font-semibold text-gray-700'
                      : 'bg-[#151C24] font-semibold text-gray-300'
                    : isLight
                      ? 'text-gray-600 hover:bg-gray-100'
                      : 'text-gray-500 hover:bg-gray-700/50',
                )}
                style={
                  {
                    '--close-feather-hover-bg':
                      session.id === currentSessionId
                        ? isLight
                          ? '#f9fafb'
                          : '#151C24'
                        : isLight
                          ? '#f3f4f6'
                          : '#1f2937',
                  } as React.CSSProperties
                }>
                {editingSessionId === session.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={handleEditSubmit}
                    onKeyDown={handleEditKeyDown}
                    onClick={e => e.stopPropagation()}
                    className={cn(
                      'min-w-0 flex-1 border-none bg-transparent px-1 py-0 text-xs outline-none',
                      isLight ? 'text-gray-900' : 'text-gray-100',
                    )}
                  />
                ) : (
                  <>
                    <div
                      className={cn(
                        'min-w-0 flex-1 truncate transition-colors',
                        session.id !== currentSessionId && (isLight ? 'text-gray-600' : 'text-gray-500'),
                      )}
                      style={session.id !== currentSessionId ? { color: isLight ? '#4b5563' : '#6b7280' } : undefined}>
                      {session.title}
                    </div>
                    <span
                      className={cn('ml-2 flex-shrink-0 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}
                      data-tooltip-exclude
                      onMouseEnter={handleTooltipExcludeMouseEnter}>
                      {formatTimestamp(session.timestamp)}
                    </span>
                    <div
                      className={cn(
                        'sessions-panel-close-feather pointer-events-none absolute top-0 right-0 bottom-0 flex items-center justify-end rounded-r pr-1 pl-12 group-hover:pointer-events-auto',
                        openMoreMenuSessionId === session.id && 'is-open pointer-events-auto',
                      )}>
                      <button
                        type="button"
                        data-tooltip-exclude
                        onMouseEnter={handleTooltipExcludeMouseEnter}
                        onClick={e => handleEditClick(session.id, session.title, e)}
                        className={cn(
                          'flex flex-shrink-0 items-center justify-center rounded p-1 transition-colors',
                          isLight ? 'text-gray-500 hover:text-gray-800' : 'text-gray-400 hover:text-gray-100',
                        )}
                        title="Edit chat title">
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      {(onOpenSession || onCloneSession || onArchiveSession || onDeleteSession) && (
                        <div
                          className="pointer-events-auto flex-shrink-0"
                          data-tooltip-exclude
                          onMouseEnter={handleTooltipExcludeMouseEnter}>
                          <SessionMoreOptionsButton
                            session={session}
                            isLight={isLight}
                            isOpen={openMoreMenuSessionId === session.id}
                            onToggle={() =>
                              setOpenMoreMenuSessionId(openMoreMenuSessionId === session.id ? null : session.id)
                            }
                            onOpen={() => {
                              setOpenMoreMenuSessionId(null);
                              onOpenSession?.(session.id);
                            }}
                            onClone={() => {
                              setOpenMoreMenuSessionId(null);
                              onCloneSession?.(session.id);
                            }}
                            onArchive={() => {
                              setOpenMoreMenuSessionId(null);
                              onArchiveSession?.(session.id);
                            }}
                            onDelete={() => {
                              setOpenMoreMenuSessionId(null);
                              onDeleteSession?.(session.id);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <div
            className={cn(
              'sessions-panel-scroll-feather-top pointer-events-none absolute top-0 right-0 left-0 z-10 h-2 transition-opacity duration-150',
              showOpenListTopFeather ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden
          />
          <div
            className="sessions-panel-archived-feather pointer-events-none absolute right-0 bottom-0 left-0 z-10 h-2"
            aria-hidden
          />
        </div>
      )}
    </>
  );

  return (
    <>
      {isSmallView && (
        <div
          className={cn(
            'absolute inset-0 z-30 bg-black/50 transition-opacity duration-[220ms] ease-out',
            isClosing ? 'opacity-0' : isAnimatingIn ? 'opacity-100' : 'opacity-0',
          )}
          onClick={handleCloseClick}
          style={{ pointerEvents: 'auto' }}
        />
      )}

      <div
        className={cn(
          'absolute top-0 bottom-0 left-0 z-40 flex flex-col border-r',
          isLight ? 'border-gray-200 bg-white' : 'border-gray-700',
        )}
        style={{
          backgroundColor: isLight ? '#ffffff' : '#0D1117',
          width: isSmallView ? '85vw' : `${width}px`,
          maxWidth: isSmallView ? '400px' : undefined,
          transition: isResizing || isResizingSplit ? 'none' : 'width 0.2s ease-in-out, transform 220ms ease-out',
          transform: isClosing ? 'translateX(-100%)' : isAnimatingIn ? 'translateX(0)' : 'translateX(-100%)',
          pointerEvents: 'auto',
        }}>
        {!isSmallView && (
          <div
            className={cn(
              'absolute top-0 right-0 bottom-0 w-1 cursor-ew-resize transition-colors hover:bg-blue-500/50',
              isResizing && 'bg-blue-500',
            )}
            onMouseDown={handleMouseDown}
          />
        )}

        {/* Header */}
        <div
          className={cn(
            'flex h-[34px] items-center border-b',
            isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
          )}
        />

        {/* Open chats row + optional vertical split + archived row */}
        {hasArchivedSplit ? (
          <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden py-2">
            <div
              className="flex min-h-0 flex-col overflow-hidden px-2"
              style={{ flex: `${splitRatio} 1 0`, minHeight: 0 }}>
              {renderOpenChatsSection()}
            </div>
            {/* Full panel width (no px on parent); 1px line matches border-r; row is draggable */}
            <div
              className={cn(
                'flex w-full flex-shrink-0 cursor-ns-resize flex-col justify-center py-1.5 transition-colors',
                'hover:bg-blue-500/40',
                isResizingSplit && 'bg-blue-500/50',
              )}
              onMouseDown={handleSplitMouseDown}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize between open chats and archived chats">
              <div className={cn('h-px w-full', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
            </div>
            <div
              className="flex min-h-0 flex-col overflow-hidden px-2"
              style={{ flex: `${1 - splitRatio} 1 0`, minHeight: 0 }}>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0.5">
                <button
                  type="button"
                  onClick={() => setIsArchivedExpanded(!isArchivedExpanded)}
                  className={cn(
                    'flex w-full flex-shrink-0 items-center justify-between gap-1 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-500 hover:bg-gray-700/50',
                  )}>
                  <span className="min-w-0 flex-1 truncate pr-1 text-left">Archived Chats</span>
                  <span
                    className={cn(
                      'flex flex-shrink-0 items-center gap-1',
                      isLight ? 'text-gray-500' : 'text-gray-500',
                    )}>
                    {archivedSessions.length}
                    <svg
                      className={cn('h-3 w-3 transition-transform', isArchivedExpanded && 'rotate-180')}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>
                {isArchivedExpanded && (
                  <div
                    className="sessions-panel-archived-wrapper relative mt-0.5 flex min-h-0 flex-1 flex-col"
                    style={
                      {
                        '--archived-feather-bg': isLight ? '#ffffff' : '#0D1117',
                      } as React.CSSProperties
                    }>
                    <div
                      className="sessions-panel-list recent-sessions-scroll min-h-0 flex-1 space-y-0 overflow-y-auto pb-2"
                      onScroll={handleArchivedSessionsScroll}>
                      {archivedSessions.map(session => (
                        <div
                          key={session.id}
                          data-session-id={session.id}
                          onClick={() => handleSessionClick(session.id)}
                          onMouseEnter={e => handleSessionMouseEnter(session.id, e.currentTarget, e)}
                          onMouseLeave={handleSessionMouseLeave}
                          className={cn(
                            'group relative flex cursor-pointer items-center rounded px-3 py-2 text-xs transition-colors',
                            isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-500 hover:bg-gray-700/50',
                          )}
                          style={
                            {
                              '--close-feather-hover-bg': isLight ? '#f3f4f6' : '#1f2937',
                            } as React.CSSProperties
                          }>
                          {editingSessionId === session.id ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={handleEditSubmit}
                              onKeyDown={handleEditKeyDown}
                              onClick={e => e.stopPropagation()}
                              className={cn(
                                'min-w-0 flex-1 border-none bg-transparent px-1 py-0 text-xs outline-none',
                                isLight ? 'text-gray-900' : 'text-gray-100',
                              )}
                            />
                          ) : (
                            <>
                              <div
                                className="min-w-0 flex-1 truncate"
                                style={{ color: isLight ? '#4b5563' : '#6b7280' }}>
                                {session.title}
                              </div>
                              <span
                                className={cn(
                                  'ml-2 flex-shrink-0 text-xs',
                                  isLight ? 'text-gray-500' : 'text-gray-400',
                                )}
                                data-tooltip-exclude
                                onMouseEnter={handleTooltipExcludeMouseEnter}>
                                {formatTimestamp(session.timestamp)}
                              </span>
                              <div
                                className={cn(
                                  'sessions-panel-close-feather pointer-events-none absolute top-0 right-0 bottom-0 flex items-center justify-end rounded-r pr-1 pl-12 group-hover:pointer-events-auto',
                                  openMoreMenuSessionId === session.id && 'is-open pointer-events-auto',
                                )}>
                                <button
                                  type="button"
                                  data-tooltip-exclude
                                  onMouseEnter={handleTooltipExcludeMouseEnter}
                                  onClick={e => handleEditClick(session.id, session.title, e)}
                                  className={cn(
                                    'flex flex-shrink-0 items-center justify-center rounded p-1 transition-colors',
                                    isLight ? 'text-gray-500 hover:text-gray-800' : 'text-gray-400 hover:text-gray-100',
                                  )}
                                  title="Edit chat title">
                                  <svg
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}>
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                    />
                                  </svg>
                                </button>
                                {(onOpenSession || onCloneSession || onDeleteSession) && (
                                  <div
                                    className="pointer-events-auto flex-shrink-0"
                                    data-tooltip-exclude
                                    onMouseEnter={handleTooltipExcludeMouseEnter}>
                                    <SessionMoreOptionsButton
                                      session={session}
                                      isLight={isLight}
                                      isArchived
                                      isOpen={openMoreMenuSessionId === session.id}
                                      onToggle={() =>
                                        setOpenMoreMenuSessionId(
                                          openMoreMenuSessionId === session.id ? null : session.id,
                                        )
                                      }
                                      onOpen={() => {
                                        setOpenMoreMenuSessionId(null);
                                        onOpenSession?.(session.id);
                                      }}
                                      onClone={() => {
                                        setOpenMoreMenuSessionId(null);
                                        onCloneSession?.(session.id);
                                      }}
                                      onArchive={() => {
                                        setOpenMoreMenuSessionId(null);
                                        onOpenSession?.(session.id);
                                      }}
                                      onDelete={() => {
                                        setOpenMoreMenuSessionId(null);
                                        onDeleteSession?.(session.id);
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    <div
                      className={cn(
                        'sessions-panel-scroll-feather-top pointer-events-none absolute top-0 right-0 left-0 z-10 h-2 transition-opacity duration-150',
                        showArchivedListTopFeather ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden
                    />
                    <div
                      className="sessions-panel-archived-feather pointer-events-none absolute right-0 bottom-0 left-0 z-10 h-2"
                      aria-hidden
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">{renderOpenChatsSection()}</div>
        )}
      </div>

      {/* Usage stats tooltip - same design as PlanStateCard plan items */}
      {hoveredSessionId !== null &&
        hoverRect &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: hoverRect.left,
              top: hoverRect.top + 6,
              transform: 'translateX(-50%)',
              zIndex: 100000,
              pointerEvents: 'none',
            }}>
            <div
              className={cn(
                'rounded-md border px-2 py-1.5 text-[11px] shadow-lg',
                isLight ? 'border-gray-200 bg-white text-gray-800' : 'border-gray-700 bg-[#151C24] text-gray-100',
              )}
              style={{ maxWidth: 280, whiteSpace: 'pre-wrap' }}>
              {hoverUsageStats === 'loading' ? (
                <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>Loading...</span>
              ) : hoverUsageStats ? (
                <div className="space-y-1">
                  <div className="flex justify-between gap-4">
                    <span className={isLight ? 'text-gray-600' : 'text-gray-400'}>Requests</span>
                    <span className="font-medium">{formatNumber(hoverUsageStats.requestCount)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className={isLight ? 'text-gray-600' : 'text-gray-400'}>Request tokens</span>
                    <span className="font-medium">{formatNumber(hoverUsageStats.request)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className={isLight ? 'text-gray-600' : 'text-gray-400'}>Response tokens</span>
                    <span className="font-medium">{formatNumber(hoverUsageStats.response)}</span>
                  </div>
                  <div
                    className={cn(
                      'flex justify-between gap-4 border-t pt-1',
                      isLight ? 'border-gray-200' : 'border-gray-600',
                    )}>
                    <span className={isLight ? 'text-gray-700' : 'text-gray-300'}>Total tokens</span>
                    <span className="font-semibold">{formatNumber(hoverUsageStats.total)}</span>
                  </div>
                </div>
              ) : (
                <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>No usage data</span>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
