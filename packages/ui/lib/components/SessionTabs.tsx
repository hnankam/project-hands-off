import { cn } from '../utils';
import { useStorage, generateSessionName } from '@extension/shared';
import { sessionStorage, type SessionType } from '@extension/storage';
import { useEffect, useRef, useState, useCallback } from 'react';

interface SessionTabsProps {
  className?: string;
  isLight: boolean;
}

export const SessionTabs = ({ className, isLight }: SessionTabsProps) => {
  const { sessions, currentSessionId } = useStorage(sessionStorage);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousCurrentSessionId = useRef(currentSessionId);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [tabsNeedingFade, setTabsNeedingFade] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleSessionClick = (sessionId: string) => {
    sessionStorage.setActiveSession(sessionId);
  };

  const handleCloseSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    sessionStorage.closeSession(sessionId);
  };

  const handleNewSession = () => {
    sessionStorage.addSession(generateSessionName());
  };

  const handleDoubleClick = (sessionId: string, currentTitle: string) => {
    setEditingSessionId(sessionId);
    setEditValue(currentTitle);
  };

  const handleEditSubmit = () => {
    if (editingSessionId && editValue.trim()) {
      sessionStorage.updateSessionTitle(editingSessionId, editValue.trim());
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

  // Check if tabs need fade effect based on overflow
  const checkTabOverflow = useCallback(() => {
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
            // For inactive tabs, use the 80px limit minus fade width
            const textWidth = span.scrollWidth;
            if (textWidth > 60) { // 80px - 20px fade width
              newTabsNeedingFade.add(sessionId);
            }
          }
        }
      }
    });
    
    setTabsNeedingFade(newTabsNeedingFade);
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
    if (currentSessionId && currentSessionId !== previousCurrentSessionId.current && scrollContainerRef.current) {
      // Find the active session element and scroll to it
      const activeSessionElement = scrollContainerRef.current.querySelector(`[data-session-id="${currentSessionId}"]`);
      if (activeSessionElement) {
        setTimeout(() => {
          if (scrollContainerRef.current && activeSessionElement) {
            activeSessionElement.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
              inline: 'end'
            });
          }
        }, 100);
      } else {
        // Fallback: scroll to the end if we can't find the specific element
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
          }
        }, 100);
      }
    }
    previousCurrentSessionId.current = currentSessionId;
  }, [currentSessionId]);

  return (
    <div className={cn("flex items-center w-full", className)}>
      {/* Session Tabs */}
      <div 
        ref={scrollContainerRef}
        className="flex items-center space-x-1 overflow-x-auto flex-1 min-w-0 max-w-full session-tabs-scroll"
      >
        {sessions.filter(s => s.isOpen).map((session, index) => (
          <div
            key={session.id}
            data-session-id={session.id}
            onClick={() => handleSessionClick(session.id)}
            onDoubleClick={() => handleDoubleClick(session.id, session.title)}
            className={cn(
              "group flex items-center space-x-1 px-2 py-1 text-xs rounded cursor-pointer transition-colors whitespace-nowrap flex-shrink-0",
              index === 0 && "rounded-tl-xl",
              session.id === currentSessionId
                ? isLight 
                  ? "bg-gray-200 text-gray-900" 
                  : "bg-gray-700 text-gray-100"
                : isLight
                  ? "text-gray-700 hover:bg-gray-100"
                  : "text-gray-300 hover:bg-gray-700"
            )}
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
                  "bg-transparent border-none outline-none text-xs py-0 px-1 min-w-0 max-w-20",
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
                  session.id === currentSessionId ? 'max-w-none' : 'max-w-20 overflow-hidden'
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
                <span className={`block whitespace-nowrap ${
                  tabsNeedingFade.has(session.id) ? 'tab-fade-text' : ''
                }`}>{session.title}</span>
              </div>
            )}
            <button
              onClick={(e) => handleCloseSession(session.id, e)}
              className={cn(
                "opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity flex-shrink-0",
                isLight 
                  ? "text-gray-400 hover:text-red-500 hover:bg-red-50" 
                  : "text-gray-500 hover:text-red-400 hover:bg-red-900"
              )}
            >
              <svg className="h-2 w-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
