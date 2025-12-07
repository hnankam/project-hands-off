import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ChatSessionContainer } from '../components/chat/ChatSessionContainer';
import { ErrorBoundary } from '../components/utilities/ErrorBoundary';
import { ChatSkeleton, MessagesOnlySkeleton, StatusBarSkeleton, SelectorsBarSkeleton } from '../components/feedback/LoadingStates';
import type { SessionMetadata } from '@extension/shared';
import { sessionStorageDBWrapper, generateSessionName } from '@extension/shared';
import { useAuth } from '../context/AuthContext';
import { getCurrentViewMode } from '../utils/windowManager';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { cn, SessionList } from '@extension/ui';
import { SessionRuntimeProvider } from '../context/SessionRuntimeContext';
import { SKELETON_TIMINGS } from '../constants/ui';
import { SessionHeader } from '../components/sessions';
import { useSessionLoadingState } from '../hooks/useSessionLoadingState';
import { useSessionActions } from '../hooks/useSessionActions';

// ============================================================================
// TYPES
// ============================================================================

interface SessionsPageProps {
  isLight: boolean;
  sessions: SessionMetadata[];
  currentSessionId: string | null;
  sessionsLoading?: boolean;
  publicApiKey: string;
  contextMenuMessage: string | null;
  onGoHome: () => void;
  onClose: () => void;
  onOpenAbout: () => void;
  onGoAdmin?: (tab?: 'organizations' | 'teams' | 'users' | 'providers' | 'models' | 'agents') => void;
}

export const SessionsPage: React.FC<SessionsPageProps> = ({
  isLight,
  sessions: sessionsProp,
  currentSessionId,
  sessionsLoading = false,
  publicApiKey,
  contextMenuMessage,
  onGoHome,
  onClose,
  onOpenAbout,
  onGoAdmin,
}) => {
  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';
  
  // Detect current view mode for conditional styling
  const viewMode = getCurrentViewMode();

  // Auth
  const { user } = useAuth();
  
  // Ensure sessions is always an array (defensive programming)
  const sessions = useMemo(() => {
    return Array.isArray(sessionsProp) ? sessionsProp : [];
  }, [sessionsProp]);
  
  // Loading state for initial render
  const [isEnsuringInitialSession, setIsEnsuringInitialSession] = useState(false);
  
  // Track live message counts per session
  const [sessionMessageCounts, setSessionMessageCounts] = useState<Record<string, number>>({});
  
  // Session loading states (managed by custom hook)
  const {
    isSessionReady,
    isMessagesLoading,
    handleSessionReady,
    handleMessagesLoadingChange,
  } = useSessionLoadingState(currentSessionId);

  // Session actions (managed by custom hook)
  const {
    handleNewSession,
    handleCloseSession,
    handleSaveMessages,
    handleLoadMessages,
    handleCopySessionId,
    handleExportAsMarkdown,
    handleExportAsHTML,
    handleResetSession,
    handleConfirmResetSession,
    resetSessionConfirmOpen,
    setResetSessionConfirmOpen,
    handleClearAllMessages,
    handleConfirmClearMessages,
    clearMessagesConfirmOpen,
    setClearMessagesConfirmOpen,
    openClearSessionsConfirm,
    handleConfirmClearSessions,
    clearSessionsConfirmOpen,
    setClearSessionsConfirmOpen,
    messageCount,
    copiedSessionId,
    handleRegisterResetFunction,
    handleRegisterSaveFunction,
    handleRegisterLoadFunction,
    hasAttemptedInitialSessionRef,
  } = useSessionActions(currentSessionId, sessions, sessionMessageCounts);
  
  const lastStorageUserIdRef = useRef<string | null>(null);
  const hasSeenSessionsForCurrentUserRef = useRef<boolean>(false);

  // Track when the storage userId changes; require at least one sessions fetch after change
  useEffect(() => {
    const storageUserId = sessionStorageDBWrapper.getCurrentUserId();
    
    if (!user?.id || !storageUserId) {
      return;
    }
    if (lastStorageUserIdRef.current !== storageUserId) {
      lastStorageUserIdRef.current = storageUserId;
      hasSeenSessionsForCurrentUserRef.current = false;
      hasAttemptedInitialSessionRef.current = false;
    }
  }, [user?.id, hasAttemptedInitialSessionRef]);

  // Mark that we've observed at least one sessions snapshot for the current user
  useEffect(() => {
    const storageUserId = sessionStorageDBWrapper.getCurrentUserId();
    
    if (!user?.id || !storageUserId) {
      return;
    }
    if (lastStorageUserIdRef.current === storageUserId) {
      hasSeenSessionsForCurrentUserRef.current = true;
    }
  }, [sessions, user?.id]);

  // Initialize with a default session if none exist
  useEffect(() => {
    const storageUserId = sessionStorageDBWrapper.getCurrentUserId();

    // Don't check for sessions while still loading or before the user context is ready
    if (sessionsLoading || !user?.id || !storageUserId) {
      return;
    }

    // Require that we've seen at least one sessions snapshot for this user
    if (!hasSeenSessionsForCurrentUserRef.current) {
      return;
    }

    if (sessions.length > 0) {
      hasAttemptedInitialSessionRef.current = true;
      return;
    }

    if (isEnsuringInitialSession || hasAttemptedInitialSessionRef.current) {
      return;
    }

    let isCancelled = false;
    hasAttemptedInitialSessionRef.current = true;

    const ensureInitialSession = async () => {
      setIsEnsuringInitialSession(true);
      try {
        await sessionStorageDBWrapper.addSession(generateSessionName());
      } catch (error) {
        console.error('[SessionsPage] Failed to ensure initial session:', error);
        if (!isCancelled) {
          hasAttemptedInitialSessionRef.current = false;
        }
      } finally {
        setIsEnsuringInitialSession(false);
      }
    };

    ensureInitialSession();

    return () => {
      isCancelled = true;
    };
  }, [sessions.length, isEnsuringInitialSession, sessionsLoading, user?.id, hasAttemptedInitialSessionRef]);

  // Callback to receive live message counts from ChatSessionContainer
  const handleMessagesCountChange = useCallback((sessionId: string, count: number) => {
    setSessionMessageCounts(prev => {
      if (prev[sessionId] !== count) {
        return { ...prev, [sessionId]: count };
      }
      return prev;
    });
  }, []);

  const activeSession = useMemo(() => {
    if (!currentSessionId) {
      return null;
    }
    return sessions.find(session => session.id === currentSessionId) || null;
  }, [sessions, currentSessionId]);

  const hasSessions = sessions.length > 0;
  const isWaitingForFirstSession = !hasSessions && !hasAttemptedInitialSessionRef.current;
  const shouldShowSkeleton = isEnsuringInitialSession || isWaitingForFirstSession || (!!currentSessionId && !isSessionReady);
  // Full skeleton overlay only for initial loading states (not for session transitions)
  const shouldShowSkeletonOverlay = Boolean(activeSession) && (isEnsuringInitialSession || isWaitingForFirstSession);
  const shouldShowStandaloneSkeleton = !activeSession && shouldShowSkeleton;

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
  }, [clearMessagesConfirmOpen, clearSessionsConfirmOpen, resetSessionConfirmOpen, setClearMessagesConfirmOpen, setClearSessionsConfirmOpen, setResetSessionConfirmOpen]);

  // Get current session title for modals
  const currentSessionTitle = sessions.find(s => s.id === currentSessionId)?.title || 'this session';

  return (
    <SessionRuntimeProvider>
      {/* Sessions Page Header */}
      <SessionHeader
        isLight={isLight}
        viewMode={viewMode}
        currentSessionId={currentSessionId}
        currentSessionTitle={currentSessionTitle}
        sessionMessageCount={currentSessionId ? sessionMessageCounts[currentSessionId] || 0 : 0}
        copiedSessionId={copiedSessionId}
        onNewSession={handleNewSession}
        onCloseSession={handleCloseSession}
        onResetSession={handleResetSession}
        onSaveMessages={handleSaveMessages}
        onLoadMessages={handleLoadMessages}
        onClearAllMessages={handleClearAllMessages}
        onClearAllSessions={openClearSessionsConfirm}
        onExportAsMarkdown={handleExportAsMarkdown}
        onExportAsHTML={handleExportAsHTML}
        onCopySessionId={handleCopySessionId}
        onOpenAbout={onOpenAbout}
        onClose={onClose}
        onGoHome={onGoHome}
        onGoAdmin={onGoAdmin}
      />

      {/* Session Content Area */}
      <div className="relative flex-1 overflow-hidden">
        {activeSession ? (
          <div className={cn('absolute inset-0 z-0 flex flex-col overflow-hidden animate-fadeIn')}>
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
                  sessionId={activeSession.id}
                  isLight={isLight}
                  publicApiKey={publicApiKey}
                  isActive
                  contextMenuMessage={contextMenuMessage}
                  onMessagesCountChange={handleMessagesCountChange}
                  onRegisterResetFunction={handleRegisterResetFunction}
                  onRegisterSaveFunction={handleRegisterSaveFunction}
                  onRegisterLoadFunction={handleRegisterLoadFunction}
                  onReady={handleSessionReady}
                  onMessagesLoadingChange={handleMessagesLoadingChange}
                />
            </ErrorBoundary>
          </div>
        ) : shouldShowStandaloneSkeleton ? (
          <ChatSkeleton isLight={isLight} />
        ) : hasSessions ? (
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <p>Select a session to begin</p>
              <p className="text-sm">Choose a session from the list below to continue chatting</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <p>No active session</p>
              <p className="text-sm">Create a new session to start chatting</p>
            </div>
          </div>
        )}

        {/* Full skeleton overlay when session is loading */}
        {shouldShowSkeletonOverlay && (
            <div className="pointer-events-auto absolute inset-0 z-20 flex flex-col overflow-hidden">
              <ChatSkeleton isLight={isLight} />
            </div>
        )}
        
        {/* Individual skeletons during session transitions (covers all three sections) */}
        {activeSession && shouldShowSkeleton && !shouldShowSkeletonOverlay && (
          <>
            {/* Status Bar Skeleton - positioned at top, h-[34px] */}
            <div className="pointer-events-auto absolute left-0 right-0 top-0 z-[15]">
              <StatusBarSkeleton isLight={isLight} />
            </div>
            
            {/* Messages Skeleton - positioned in middle (between status bar and selectors bar) */}
            <div className="pointer-events-auto absolute bottom-[48px] left-0 right-0 top-[34px] z-[15] flex flex-col overflow-hidden">
              <MessagesOnlySkeleton isLight={isLight} />
            </div>
            
            {/* Selectors Bar Skeleton - positioned at bottom, approximately h-[48px] */}
            <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-[15]">
              <SelectorsBarSkeleton isLight={isLight} />
            </div>
          </>
        )}
      </div>

      {/* Session List - Fixed at bottom */}
      <div
        className={cn(
          'flex-shrink-0 border-t px-1',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <SessionList isLight={isLight} />
      </div>

      {/* Clear Messages Confirmation Modal */}
      <ConfirmationModal
        isOpen={clearMessagesConfirmOpen}
        onClose={() => setClearMessagesConfirmOpen(false)}
        onConfirm={handleConfirmClearMessages}
        title="Clear All Session Messages"
        message={`Permanently delete session messages?<br/><br/>All <strong>${messageCount}</strong> ${messageCount === 1 ? 'message' : 'messages'} from "<strong>${currentSessionTitle}</strong>" will be permanently deleted from storage and cannot be recovered.`}
        confirmLabel="Delete All"
        cancelLabel="Cancel"
        variant="danger"
        isLight={isLight}
        mainTextColor={mainTextColor}
      />

      {/* Reset Session Confirmation Modal */}
      <ConfirmationModal
        isOpen={resetSessionConfirmOpen}
        onClose={() => setResetSessionConfirmOpen(false)}
        onConfirm={handleConfirmResetSession}
        title="Reset Session"
        message={`Clear all messages in this session?<br/><br/>All <strong>${messageCount}</strong> ${messageCount === 1 ? 'message' : 'messages'} in "<strong>${currentSessionTitle}</strong>" will be cleared from the chat. This action cannot be undone, but messages may still exist in storage.`}
        confirmLabel="Reset Session"
        cancelLabel="Cancel"
        variant="warning"
        isLight={isLight}
        mainTextColor={mainTextColor}
      />

      {/* Clear Sessions Confirmation Modal */}
      <ConfirmationModal
        isOpen={clearSessionsConfirmOpen}
        onClose={() => setClearSessionsConfirmOpen(false)}
        onConfirm={handleConfirmClearSessions}
        title="Clear All Sessions"
        message="Permanently delete all sessions?<br/><br/>This will remove all sessions and their messages from storage and cannot be undone."
        confirmLabel="Delete All"
        cancelLabel="Cancel"
        variant="danger"
        isLight={isLight}
        mainTextColor={mainTextColor}
      />

    </SessionRuntimeProvider>
  );
};
