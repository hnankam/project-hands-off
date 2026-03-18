import { cn } from '../utils';
import { useSessionStorageDB, sessionStorageDBWrapper, generateSessionName } from '@extension/shared';
import type { SessionMetadata } from '@extension/shared';
import { useEffect, useRef, useState, useCallback } from 'react';

interface SessionTabsProps {
  className?: string;
  isLight: boolean;
  viewMode?: 'sidepanel' | 'popup' | 'newtab' | 'fullscreen';
  isVisible?: boolean; // Track when the sessions page is visible
  apiBaseUrl?: string; // Optional API base URL to persist session titles to backend
}

export const SessionTabs = ({ className, isLight, viewMode = 'sidepanel', isVisible = true, apiBaseUrl }: SessionTabsProps) => {
  const { sessions, currentSessionId } = useSessionStorageDB();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousCurrentSessionId = useRef(currentSessionId);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [tabsNeedingFade, setTabsNeedingFade] = useState<Set<string>>(new Set());
  const [containerHasOverflow, setContainerHasOverflow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleSessionClick = (sessionId: string) => {
    // Don't trigger setActiveSession if the session is already active
    // This prevents unnecessary re-renders and counter resets
    if (sessionId === currentSessionId) {
      return;
    }
    sessionStorageDBWrapper.setActiveSession(sessionId);
  };

  const handleCloseSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    sessionStorageDBWrapper.closeSession(sessionId);
  };

  const handleNewSession = () => {
    sessionStorageDBWrapper.addSession(generateSessionName(), apiBaseUrl);
  };

  const handleDoubleClick = (sessionId: string, currentTitle: string) => {
    setEditingSessionId(sessionId);
    setEditValue(currentTitle);
  };

  const handleEditSubmit = () => {
    if (editingSessionId && editValue.trim()) {
      sessionStorageDBWrapper.updateSessionTitle(editingSessionId, editValue.trim(), apiBaseUrl);
    }
    setEditingSessionId(null);
    setEditValue('');
  };

  const handleEditCancel = () => {
    setEditingSessionId(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  };

  // Check if container and tabs need fade effect based on overflow
  const checkTabOverflow = useCallback(() => {
    // First check if the scroll container has overflow
    if (scrollContainerRef.current) {
      const hasOverflow = scrollContainerRef.current.scrollWidth > scrollContainerRef.current.clientWidth;
      setContainerHasOverflow(hasOverflow);
      
      // Only check individual tabs if container has overflow
      if (hasOverflow) {
    const newTabsNeedingFade = new Set<string>();
    
    tabRefs.current.forEach((tabElement, sessionId) => {
      if (tabElement) {
        const container = tabElement;
        const span = tabElement.querySelector('span');
        if (container && span) {
          const isActive = sessionId === currentSessionId;
          
          if (isActive) {
            // Active tabs should never have fade effect - always show full name
            // Skip adding to fade set
          } else {
                // For inactive tabs with max-w-30 (120px), check if text exceeds container
            const textWidth = span.scrollWidth;
                const containerWidth = 120; // max-w-30 = 120px
                // Apply fade if text is wider than container (with small buffer for fade gradient)
                if (textWidth > containerWidth - 15) { // 120px - 15px buffer for fade
              newTabsNeedingFade.add(sessionId);
            }
          }
        }
      }
    });
    
    setTabsNeedingFade(newTabsNeedingFade);
      } else {
        // No overflow, clear all fade effects
        setTabsNeedingFade(new Set());
      }
    }
  }, [currentSessionId]);

  // Check overflow when tabs change or active session changes
  useEffect(() => {
    const timer = setTimeout(checkTabOverflow, 0);
    return () => clearTimeout(timer);
  }, [sessions, currentSessionId, checkTabOverflow]);

  // Check overflow on window resize
  useEffect(() => {
    const handleResize = () => checkTabOverflow();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [checkTabOverflow]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingSessionId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingSessionId]);

  // Auto-scroll to the active session when it changes
  useEffect(() => {
    if (currentSessionId && scrollContainerRef.current) {
      // Find the active session element and scroll to it
      const activeSessionElement = scrollContainerRef.current.querySelector(`[data-session-id="${currentSessionId}"]`);
      
      if (activeSessionElement) {
        setTimeout(() => {
          activeSessionElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }, 100);
      }
    }
    previousCurrentSessionId.current = currentSessionId;
  }, [currentSessionId]);

  // Auto-scroll to active tab when page becomes visible or sessions load
  useEffect(() => {
    // Only proceed if the component is visible
    if (!isVisible) {
      return undefined;
    }
    
    // Helper to check if the scroll container is visible
    const isContainerVisible = () => {
      if (!scrollContainerRef.current) return false;
      const rect = scrollContainerRef.current.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    // Helper to perform scroll
    const scrollToActive = () => {
      if (!currentSessionId || !scrollContainerRef.current) return;
      
      const activeSessionElement = scrollContainerRef.current.querySelector(`[data-session-id="${currentSessionId}"]`);
      
      if (activeSessionElement && isContainerVisible()) {
        activeSessionElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    };

    // Scroll when sessions are available and container becomes visible
    if (currentSessionId && sessions.length > 0) {
      // Try immediately
      setTimeout(scrollToActive, 100);
      
      // Also try after a longer delay for page transitions
      const delayedTimeout = setTimeout(scrollToActive, 300);
      
      return () => clearTimeout(delayedTimeout);
    }
    
    return undefined;
  }, [isVisible, currentSessionId, sessions.length]);

  // Feather gradient - match header background (bg-gray-50 / bg-[#151C24])
  const featherBg = isLight ? '#f9fafb' : '#151C24';

  return (
    <div className={cn("flex items-center w-full", className)}>
      {/* Session Tabs with right feather for smooth fade before add button */}
      <div className="relative flex-1 min-w-0">
        <div 
          ref={scrollContainerRef}
          className={cn(
            "flex items-center space-x-1 overflow-x-auto max-w-full session-tabs-scroll",
            !containerHasOverflow && "justify-center"
          )}
        >
        {sessions.filter(s => s.isOpen).map((session) => (
          <div
            key={session.id}
            data-session-id={session.id}
            onClick={() => handleSessionClick(session.id)}
            onDoubleClick={() => handleDoubleClick(session.id, session.title)}
            className={cn(
              "group relative flex items-center px-2 py-1 pr-1 text-xs rounded cursor-pointer transition-colors whitespace-nowrap flex-shrink-0",
              session.id === currentSessionId
                ? isLight 
                  ? "bg-gray-200 text-gray-900" 
                  : "bg-gray-700 text-gray-100"
                : isLight
                  ? "text-gray-600 hover:bg-gray-100"
                  : "text-gray-500 hover:bg-gray-700"
            )}
            style={{
              '--close-feather-bg': session.id === currentSessionId
                ? (isLight ? '#e5e7eb' : '#374151')
                : (isLight ? '#f9fafb' : '#151C24'),
              '--close-feather-hover-bg': session.id === currentSessionId
                ? (isLight ? '#e5e7eb' : '#374151')
                : (isLight ? '#f3f4f6' : '#374151'),
            } as React.CSSProperties}
          >
            {editingSessionId === session.id ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleEditSubmit}
                onKeyDown={handleEditKeyDown}
                className={cn(
                  "bg-transparent border-none outline-none text-xs py-0 px-1 min-w-0 max-w-30",
                  isLight ? "text-gray-900" : "text-gray-100"
                )}
                style={{ width: `${Math.max(editValue.length * 6, 20)}px` }}
              />
            ) : (
              <div 
                ref={(el) => {
                  if (el) {
                    tabRefs.current.set(session.id, el);
                  } else {
                    tabRefs.current.delete(session.id);
                  }
                }}
                className={`relative ${
                  session.id === currentSessionId ? 'max-w-none' : 'max-w-30 overflow-hidden'
                }`}
                style={{
                  '--fade-bg-color': session.id === currentSessionId
                    ? (isLight ? '#e5e7eb' : '#374151') // Active: bg-gray-200 / bg-gray-700
                    : (isLight ? '#ffffff' : '#151C24'), // Inactive: bg-white / bg-[#151C24]
                  '--fade-hover-bg-color': session.id === currentSessionId
                    ? (isLight ? '#e5e7eb' : '#374151') // Active stays same on hover
                    : (isLight ? '#f3f4f6' : '#374151')  // Inactive hover: bg-gray-100 / bg-gray-700
                } as React.CSSProperties}
              >
                <span className={`block whitespace-nowrap pr-1 ${
                  tabsNeedingFade.has(session.id) ? 'tab-fade-text' : ''
                }`}>{session.title}</span>
              </div>
            )}
            {/* Floating close button with feather - overlays tab, minimal footprint, feather only on hover */}
            <div
              className="tab-close-feather absolute right-0 top-0 bottom-0 flex items-center justify-end pr-1 pl-8 rounded-r pointer-events-none group-hover:pointer-events-auto"
              style={{paddingRight: '3px'}}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseSession(session.id, e);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                className={cn(
                  "opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all flex items-center justify-center pointer-events-auto ml-auto shrink-0",
                  isLight 
                    ? "text-gray-400 hover:text-gray-700" 
                    : "text-gray-500 hover:text-gray-200"
                )}
                style={{ minWidth: '16px', minHeight: '16px'}}
              >
                <svg width="8" height="8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        </div>
        {/* Right feather - fades out at right edge before add button */}
        <div
          className="absolute right-0 top-0 bottom-0 w-6 z-10 pointer-events-none flex-shrink-0"
          style={{
            background: `linear-gradient(to right, transparent 0%, ${featherBg} 80%, ${featherBg} 100%)`,
          }}
          aria-hidden
        />
      </div>
    </div>
  );
};
