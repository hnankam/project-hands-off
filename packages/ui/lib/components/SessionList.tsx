import { cn } from '../utils';
import { useSessionStorageDB, sessionStorageDBWrapper } from '@extension/shared';
import type { SessionMetadata } from '@extension/shared';
import { useState, useEffect } from 'react';

interface SessionListProps {
  className?: string;
  isLight?: boolean;
}

export const SessionList = ({ className, isLight = true }: SessionListProps) => {
  const { sessions, currentSessionId } = useSessionStorageDB();
  const [isExpanded, setIsExpanded] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; title: string } | null>(null);

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

  const handleSessionClick = (sessionId: string) => {
    // Don't trigger setActiveSession if the session is already active
    // This prevents unnecessary re-renders and counter resets
    if (sessionId === currentSessionId) {
      return;
    }
    sessionStorageDBWrapper.setActiveSession(sessionId);
  };

  const handleDeleteSession = (sessionId: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete({ id: sessionId, title });
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (sessionToDelete) {
      sessionStorageDBWrapper.deleteSession(sessionToDelete.id);
      setDeleteConfirmOpen(false);
      setSessionToDelete(null);
    }
  };

  const handleViewAll = () => {
    sessionStorageDBWrapper.openAllSessions();
  };

  // Close on escape key
  useEffect(() => {
    if (!deleteConfirmOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDeleteConfirmOpen(false);
        setSessionToDelete(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [deleteConfirmOpen]);

  return (
    <>
      <div className={cn("flex flex-col", className)}>
        <div className="flex items-center justify-between px-2 h-[34px]">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-xs"
          >
            <span
              className={cn(
                "transition-colors",
                isLight ? "hover:text-gray-900" : "hover:text-gray-100"
            )}
              style={{ color: isLight ? '#4b5563' : '#6b7280', fontWeight: 500 }}
            >
              Past Sessions
            </span>
            <svg
              className={cn(
                "h-3 w-3 transition-transform",
                isExpanded ? "rotate-180" : ""
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button 
            onClick={handleViewAll}
            className={cn(
              "text-xs",
              isLight
                ? "hover:text-gray-700"
                : "hover:text-gray-300"
            )}
            style={{ color: isLight ? '#4b5563' : '#6b7280' }}
          >
            View All
          </button>
        </div>

        {isExpanded && (
          <div className="space-y-0 max-h-[200px] overflow-y-auto">
            {sessions.map((session, index) => (
              <div
                key={session.id}
                onClick={() => handleSessionClick(session.id)}
                className={cn(
                  "group flex items-center justify-between px-2 py-2 text-xs cursor-pointer transition-colors rounded",
                  index === sessions.length - 1 && "rounded-bl-xl rounded-br-xl",
                  session.id === currentSessionId
                    ? isLight
                      ? "bg-gray-200 text-gray-900"
                      : "bg-gray-800/60 text-gray-100"
                    : isLight
                      ? "text-gray-600 hover:bg-gray-100"
                      : "text-gray-500 hover:bg-gray-700/50"
                )}
                style={session.id !== currentSessionId ? { color: isLight ? '#4b5563' : '#6b7280' } : undefined}
              >
                <div
                  className="flex-1 min-w-0 truncate pr-2 transition-colors"
                  style={session.id !== currentSessionId ? { color: isLight ? '#4b5563' : '#6b7280' } : undefined}
                >
                  {session.title}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span 
                    className={cn(
                    "text-xs",
                      isLight ? "hover:text-gray-700" : "hover:text-gray-300"
                    )}
                    style={{ color: isLight ? '#4b5563' : '#6b7280' }}
                  >
                    {formatTimestamp(session.timestamp)}
                  </span>
                  <button
                    onClick={(e) => handleDeleteSession(session.id, session.title, e)}
                    className={cn(
                      "opacity-0 group-hover:opacity-100 p-0.5 transition-opacity",
                      isLight
                        ? "text-gray-400 hover:text-red-500"
                        : "text-gray-500 hover:text-red-400"
                    )}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && sessionToDelete && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[10000] backdrop-blur-sm"
            onClick={() => {
              setDeleteConfirmOpen(false);
              setSessionToDelete(null);
            }}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight
                  ? 'bg-gray-50 border border-gray-200'
                  : 'bg-[#151C24] border border-gray-700'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between px-3 py-2 border-b',
                  isLight ? 'border-gray-200' : 'border-gray-700'
                )}
              >
                <h2
                  className={cn(
                    'text-sm font-semibold',
                    isLight ? 'text-gray-900' : 'text-gray-100'
                  )}
                >
                  Delete Session
                </h2>
                <button
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    setSessionToDelete(null);
                  }}
                  className={cn(
                    'p-0.5 rounded-md transition-colors',
                    isLight
                      ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  )}
                >
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="px-3 py-4 space-y-3">
                {/* Warning Icon */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center',
                      isLight ? 'bg-red-100' : 'bg-red-900/30'
                    )}
                  >
                    <svg
                      className={cn(
                        'w-4 h-4',
                        isLight ? 'text-red-600' : 'text-red-400'
                      )}
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>

                  <div className="flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        isLight ? 'text-gray-900' : 'text-gray-100'
                      )}
                    >
                      Permanently delete session?
                    </p>
                    <p
                      className={cn(
                        'text-xs mt-1',
                        isLight ? 'text-gray-600' : 'text-gray-400'
                      )}
                    >
                      "{sessionToDelete.title}" and all its messages will be permanently deleted and cannot be recovered.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 px-3 py-2 border-t',
                  isLight ? 'border-gray-200' : 'border-gray-700'
                )}
              >
                <button
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    setSessionToDelete(null);
                  }}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    'bg-red-600 text-white hover:bg-red-700'
                  )}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
