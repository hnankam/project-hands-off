import { cn } from '../utils';
import { useStorage } from '@extension/shared';
import { sessionStorage, type SessionType } from '@extension/storage';
import { useState } from 'react';

interface SessionListProps {
  className?: string;
  isLight?: boolean;
}

export const SessionList = ({ className, isLight = true }: SessionListProps) => {
  const { sessions, currentSessionId } = useStorage(sessionStorage);
  const [isExpanded, setIsExpanded] = useState(false);

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
    sessionStorage.setActiveSession(sessionId);
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    sessionStorage.deleteSession(sessionId);
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between px-2 py-1.5">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            isLight
              ? "text-gray-700 hover:text-gray-900"
              : "text-gray-300 hover:text-gray-100"
          )}
        >
          <span>Past Sessions</span>
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
        <button className={cn(
          "text-xs",
          isLight
            ? "text-gray-500 hover:text-gray-700"
            : "text-gray-400 hover:text-gray-300"
        )}>
          View All
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-0">
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
                    ? "text-gray-700 hover:bg-gray-100"
                    : "text-gray-300 hover:bg-gray-700/50"
              )}
            >
              <div className="flex-1 min-w-0 truncate pr-2">
                {session.title}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={cn(
                  "text-xs",
                  isLight ? "text-gray-500" : "text-gray-400"
                )}>
                  {formatTimestamp(session.timestamp)}
                </span>
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className={cn(
                    "opacity-0 group-hover:opacity-100 p-0.5 transition-opacity",
                    isLight
                      ? "text-gray-400 hover:text-red-500"
                      : "text-gray-500 hover:text-red-400"
                  )}
                >
                  <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
