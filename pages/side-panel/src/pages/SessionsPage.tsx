import React, { useEffect, useState, useCallback } from 'react';
import { ChatSessionContainer } from '../components/ChatSessionContainer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ChatSkeleton } from '../components/LoadingStates';
import type { SessionType } from '@extension/storage';
import { sessionStorage } from '@extension/storage';
import { generateSessionName } from '@extension/shared';
import {
  cn,
  Button,
  SessionTabs,
  SessionList,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownSubmenu,
} from '@extension/ui';

interface SessionsPageProps {
  isLight: boolean;
  sessions: SessionType[];
  currentSessionId: string | null;
  publicApiKey: string;
  contextMenuMessage: string | null;
  onGoHome: () => void;
  onClose: () => void;
  onOpenAbout: () => void;
}

export const SessionsPage: React.FC<SessionsPageProps> = ({
  isLight,
  sessions,
  currentSessionId,
  publicApiKey,
  contextMenuMessage,
  onGoHome,
  onClose,
  onOpenAbout,
}) => {
  // Loading state for initial render
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [clearMessagesConfirmOpen, setClearMessagesConfirmOpen] = useState(false);
  const [resetSessionConfirmOpen, setResetSessionConfirmOpen] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  // Track live message counts per session (same as status bar)
  const [sessionMessageCounts, setSessionMessageCounts] = useState<Record<string, number>>({});
  const [clearSessionsConfirmOpen, setClearSessionsConfirmOpen] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  
  // Ref to store reset functions per session
  const resetFunctionsRef = React.useRef<Record<string, () => void>>({});

  // Initialize with a default session if none exist
  useEffect(() => {
    if (sessions.length === 0) {
      sessionStorage.addSession(generateSessionName());
    }
    // Set initial loading to false after sessions are loaded
    setIsInitialLoading(false);
  }, [sessions.length]);

  // Callback to receive live message counts from ChatSessionContainer
  const handleMessagesCountChange = useCallback((sessionId: string, count: number) => {
    setSessionMessageCounts(prev => ({
      ...prev,
      [sessionId]: count,
    }));
  }, []);
  
  // Callback to register reset function from ChatSessionContainer
  const handleRegisterResetFunction = useCallback((sessionId: string, resetFn: () => void) => {
    resetFunctionsRef.current[sessionId] = resetFn;
  }, []);

  const handleNewSession = () => {
    sessionStorage.addSession(generateSessionName());
  };

  const handleCloseSession = () => {
    if (currentSessionId) {
      sessionStorage.closeSession(currentSessionId);
    }
  };

  const handleCopySessionId = async (e: React.MouseEvent) => {
    // Prevent dropdown from closing immediately
    e.stopPropagation();
    
    if (currentSessionId) {
      try {
        await navigator.clipboard.writeText(currentSessionId);
        setCopiedSessionId(true);
        // Reset the copied state after 1.5 seconds, then allow dropdown to close
        setTimeout(() => {
          setCopiedSessionId(false);
        }, 1500);
      } catch (error) {
        console.error('[SessionsPage] Failed to copy session ID:', error);
      }
    }
  };

  const handleResetSession = () => {
    // Use the live count tracked from ChatSessionContainer (same as StatusBar)
    const count = currentSessionId ? sessionMessageCounts[currentSessionId] || 0 : 0;
    setMessageCount(count);

    // Small delay to ensure dropdown closes first
    setTimeout(() => {
      setResetSessionConfirmOpen(true);
    }, 60);
  };
  
  const handleConfirmResetSession = () => {
    if (!currentSessionId) {
      console.error('[SessionsPage] No current session to reset');
      return;
    }
    
    // Call the reset function for this session
    const resetFn = resetFunctionsRef.current[currentSessionId];
    if (resetFn) {
      console.log('[SessionsPage] Resetting session:', currentSessionId);
      resetFn();
      setResetSessionConfirmOpen(false);
    } else {
      console.error('[SessionsPage] No reset function found for session:', currentSessionId);
    }
  };

  const handleClearAllMessages = () => {
    // Use the live count tracked from ChatSessionContainer (same as StatusBar)
    const count = currentSessionId ? sessionMessageCounts[currentSessionId] || 0 : 0;
    setMessageCount(count);

    // Small delay to ensure dropdown closes first
    setTimeout(() => {
      setClearMessagesConfirmOpen(true);
    }, 60);
  };

  const handleConfirmClearMessages = async () => {
    const CHAT_STORAGE_KEY = 'copilot-chat-messages';
    try {
      if (!currentSessionId) {
        console.error('[SessionsPage] No current session to clear messages from');
        return;
      }

      // Clear messages from Chrome local storage for the current session only
      const result = await chrome.storage.local.get([CHAT_STORAGE_KEY]);
      const storedData = result[CHAT_STORAGE_KEY] || {};
      delete storedData[currentSessionId];
      await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: storedData });

      // Clear allMessages from the current session in sessionStorage
      await sessionStorage.updateAllMessages(currentSessionId, []);

      // Reload the page to reflect changes
      window.location.reload();
    } catch (error) {
      console.error('[SessionsPage] Failed to clear messages:', error);
    }
  };

  const exportFile = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSessionAsHTML = () => {
    if (!currentSessionId) return;
    const current = sessions.find(s => s.id === currentSessionId);
    const messages = sessionStorage.getAllMessages(currentSessionId);
    const safeTitle = (current?.title || 'session').replace(/[^a-z0-9\-_]+/gi, '-').toLowerCase();
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${current?.title || 'Session'}</title><style>body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;padding:16px}pre{white-space:pre-wrap;word-break:break-word}</style></head><body><h1>${current?.title || 'Session'}</h1><pre>${JSON.stringify(messages, null, 2)}</pre></body></html>`;
    exportFile(`${safeTitle}.html`, new Blob([html], { type: 'text/html' }));
  };

  const handleExportSessionAsPDF = () => {
    if (!currentSessionId) return;
    const current = sessions.find(s => s.id === currentSessionId);
    const messages = sessionStorage.getAllMessages(currentSessionId);
    const doc = window.open('', '_blank');
    if (!doc) return;
    doc.document.write(
      `<!doctype html><html><head><meta charset="utf-8"/><title>${current?.title || 'Session PDF'}</title><style>body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;padding:24px}h1{margin-top:0}pre{white-space:pre-wrap;word-break:break-word}</style></head><body><h1>${current?.title || 'Session'}</h1><pre>${JSON.stringify(messages, null, 2)}</pre></body></html>`,
    );
    doc.document.close();
    // Give the new window a moment to render, then open print dialog
    setTimeout(() => {
      try {
        doc.focus();
        doc.print();
      } catch {}
    }, 200);
  };

  const handleExportSessionAsImage = async () => {
    try {
      // Capture visible tab as a quick image export
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
      const current = sessions.find(s => s.id === currentSessionId || '');
      const safeTitle = (current?.title || 'session').replace(/[^a-z0-9\-_]+/gi, '-').toLowerCase();
      const res = await fetch(dataUrl as string);
      const blob = await res.blob();
      exportFile(`${safeTitle}.png`, blob);
    } catch (e) {
      console.error('[SessionsPage] Failed to export session as image:', e);
    }
  };

  const openClearSessionsConfirm = () => {
    setTimeout(() => setClearSessionsConfirmOpen(true), 60);
  };

  const handleConfirmClearSessions = async () => {
    try {
      const CHAT_STORAGE_KEY = 'copilot-chat-messages';

      // Snapshot session IDs to avoid mutation during deletion
      const sessionIds = sessions.map(s => s.id);

      // Purge messages for all sessions from Chrome storage
      const result = await chrome.storage.local.get([CHAT_STORAGE_KEY]);
      const storedData = result[CHAT_STORAGE_KEY] || {};
      for (const id of sessionIds) {
        if (storedData[id]) {
          delete storedData[id];
        }
      }
      await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: storedData });

      // Delete all sessions sequentially to avoid race conditions
      for (const id of sessionIds) {
        await sessionStorage.deleteSession(id);
      }

      setClearSessionsConfirmOpen(false);
      // Reload the page to reflect changes fully
      window.location.reload();
    } catch (err) {
      console.error('[SessionsPage] Failed to clear all sessions:', err);
    }
  };

  // Close confirmation modal on escape key
  useEffect(() => {
    if (!clearMessagesConfirmOpen && !clearSessionsConfirmOpen && !resetSessionConfirmOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (clearMessagesConfirmOpen) setClearMessagesConfirmOpen(false);
        if (clearSessionsConfirmOpen) setClearSessionsConfirmOpen(false);
        if (resetSessionConfirmOpen) setResetSessionConfirmOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [clearMessagesConfirmOpen, clearSessionsConfirmOpen, resetSessionConfirmOpen]);

  return (
    <>
      {/* Sessions Page Header */}
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between border-b px-2 py-[0.4em]',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <div className="mr-2 flex min-w-0 flex-1 items-center overflow-hidden">
          <SessionTabs isLight={isLight} className="flex-1" />
        </div>

        <div className="flex flex-shrink-0 items-center space-x-1">
          {/* Add New Session Button */}
          <button
            onClick={handleNewSession}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded transition-colors',
              isLight
                ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
            )}
            title="Add new session">
            <svg
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Home Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onGoHome}
            title="Home"
            className={cn(
              'h-6 w-6 p-0',
              isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
            )}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M11.47 3.84a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 0 1-.53 1.28H19.5V21a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-3.75h-6V21a.75.75 0 0 1-.75.75h-3A.75.75 0 0 1 5.25 21v-7.19H3.31a.75.75 0 0 1-.53-1.28l8.69-8.69Z" />
            </svg>
          </Button>

          {/* More Options Dropdown */}
          <DropdownMenu
            align="right"
            isLight={isLight}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-6 w-6 p-0',
                  isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
                )}>
                <svg
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </Button>
            }>
            <DropdownMenuItem 
              onClick={handleResetSession}
              disabled={!currentSessionId || (sessionMessageCounts[currentSessionId] || 0) === 0}
              isLight={isLight}
            >
              Reset Session
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCloseSession} shortcut="⌘ C" isLight={isLight}>
              Close Session
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleClearAllMessages} isLight={isLight}>Clear All Session Messages</DropdownMenuItem>
            <DropdownMenuItem onClick={openClearSessionsConfirm} isLight={isLight}>Clear All Sessions</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownSubmenu label="Export Session" isLight={isLight}>
              <DropdownMenuItem onClick={handleExportSessionAsHTML} isLight={isLight}>Export as HTML</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportSessionAsPDF} isLight={isLight}>Export as PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportSessionAsImage} isLight={isLight}>Export as Image</DropdownMenuItem>
            </DropdownSubmenu>
            <DropdownMenuItem 
              onClick={handleCopySessionId}
              isLight={isLight}
              className={cn(
                'transition-all duration-200',
                copiedSessionId && (isLight ? 'bg-green-50' : 'bg-green-900/20')
              )}
            >
              <div className="flex items-center gap-2 w-full">
                <span className={cn(
                  'flex-1 transition-colors duration-200',
                  copiedSessionId && (isLight ? 'text-green-700' : 'text-green-400')
                )}>
                  {copiedSessionId ? 'Session ID Copied!' : 'Copy Session ID'}
                </span>
                {copiedSessionId ? (
                  <svg
                    className={cn(
                      'h-3 w-3 flex-shrink-0 transition-all duration-200',
                      isLight ? 'text-green-600' : 'text-green-400'
                    )}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ animation: 'scale-in 0.2s ease-out' }}>
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg
                    className={cn('h-3 w-3 flex-shrink-0 opacity-60', isLight ? 'text-gray-500' : 'text-gray-400')}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem isLight={isLight}>Give Feedback</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem isLight={isLight}>Session Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenAbout} isLight={isLight}>About Project Hands-Off</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClose} isLight={isLight}>Close Panel</DropdownMenuItem>
          </DropdownMenu>
        </div>
      </div>

      {/* Session Content Area */}
      <div className="relative flex-1 overflow-hidden">
        {isInitialLoading ? (
          <ChatSkeleton />
        ) : sessions.length > 0 ? (
          sessions.map(session => (
            <div
              key={session.id}
              className="absolute inset-0 flex flex-col overflow-hidden"
              style={{
                visibility: session.id === currentSessionId ? 'visible' : 'hidden',
                zIndex: session.id === currentSessionId ? 1 : 0,
              }}>
              <ErrorBoundary
                level="component"
                fallback={
                  <div className="flex flex-1 items-center justify-center p-4">
                    <div className="text-center">
                      <p className="mb-2 text-red-600 dark:text-red-400">Session Error</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        This session encountered an error. Try switching to another session.
                      </p>
                    </div>
                  </div>
                }>
                <ChatSessionContainer
                  sessionId={session.id}
                  isLight={isLight}
                  publicApiKey={publicApiKey}
                  isActive={session.id === currentSessionId}
                  contextMenuMessage={session.id === currentSessionId ? contextMenuMessage : null}
                  onMessagesCountChange={handleMessagesCountChange}
                  onRegisterResetFunction={handleRegisterResetFunction}
                />
              </ErrorBoundary>
            </div>
          ))
        ) : (
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <p>No active session</p>
              <p className="text-sm">Create a new session to start chatting</p>
            </div>
          </div>
        )}
      </div>

      {/* Session List - Fixed at bottom */}
      <div
        className={cn(
          'flex-shrink-0 border-t p-2',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <SessionList isLight={isLight} />
      </div>

      {/* Clear Messages Confirmation Modal */}
      {clearMessagesConfirmOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setClearMessagesConfirmOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Clear All Session Messages
                </h2>
                <button
                  onClick={() => setClearMessagesConfirmOpen(false)}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}>
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="space-y-3 px-3 py-4">
                {/* Warning Icon */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                      isLight ? 'bg-red-100' : 'bg-red-900/30',
                    )}>
                    <svg
                      className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')}
                      fill="currentColor"
                      viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>

                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Permanently delete session messages?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      All <strong>{messageCount}</strong> {messageCount === 1 ? 'message' : 'messages'} from "
                      {sessions.find(s => s.id === currentSessionId)?.title || 'this session'}" will be permanently
                      deleted from storage and cannot be recovered.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 border-t px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <button
                  onClick={() => setClearMessagesConfirmOpen(false)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}>
                  Cancel
                </button>
                <button
                  onClick={handleConfirmClearMessages}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-red-600 text-white hover:bg-red-700',
                  )}>
                  Delete All
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Reset Session Confirmation Modal */}
      {resetSessionConfirmOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setResetSessionConfirmOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Reset Session
                </h2>
                <button
                  onClick={() => setResetSessionConfirmOpen(false)}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}>
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="space-y-3 px-3 py-4">
                {/* Warning Icon */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                      isLight ? 'bg-orange-100' : 'bg-orange-900/30',
                    )}>
                    <svg
                      className={cn('h-3.5 w-3.5', isLight ? 'text-orange-600' : 'text-orange-400')}
                      fill="currentColor"
                      viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>

                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Clear all messages in this session?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      All <strong>{messageCount}</strong> {messageCount === 1 ? 'message' : 'messages'} in "
                      {sessions.find(s => s.id === currentSessionId)?.title || 'this session'}" will be cleared from
                      the chat. This action cannot be undone, but messages may still exist in storage.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 border-t px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <button
                  onClick={() => setResetSessionConfirmOpen(false)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}>
                  Cancel
                </button>
                <button
                  onClick={handleConfirmResetSession}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-orange-600 text-white hover:bg-orange-700',
                  )}>
                  Reset Session
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Clear Sessions Confirmation Modal */}
      {clearSessionsConfirmOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setClearSessionsConfirmOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Clear All Sessions
                </h2>
                <button
                  onClick={() => setClearSessionsConfirmOpen(false)}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}>
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="space-y-3 px-3 py-4">
                {/* Warning Icon */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                      isLight ? 'bg-red-100' : 'bg-red-900/30',
                    )}>
                    <svg
                      className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')}
                      fill="currentColor"
                      viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>

                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Permanently delete all sessions?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      This will remove all sessions and their messages from storage and cannot be undone.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 border-t px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <button
                  onClick={() => setClearSessionsConfirmOpen(false)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}>
                  Cancel
                </button>
                <button
                  onClick={handleConfirmClearSessions}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-red-600 text-white hover:bg-red-700',
                  )}>
                  Delete All
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
