import * as React from 'react';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ChatSessionContainer } from '../components/chat/ChatSessionContainer';
import { ErrorBoundary } from '../components/utilities/ErrorBoundary';
import {
  ChatSkeleton,
  MessagesOnlySkeleton,
  StatusBarSkeleton,
  SelectorsBarSkeleton,
} from '../components/feedback/LoadingStates';
import type { SessionMetadata } from '@extension/shared';
import { sessionStorageDBWrapper, generateSessionName, debug } from '@extension/shared';
import { useAuth } from '../context/AuthContext';
import { getCurrentViewMode } from '../utils/windowManager';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { cn, SessionList } from '@extension/ui';
import { SKELETON_TIMINGS, SESSION_CACHE } from '../constants/ui';
import { SessionHeader } from '../components/sessions';
import { SessionsPanel } from '../components/panels/SessionsPanel';
import { useSessionLoadingState } from '../hooks/useSessionLoadingState';
import { useSessionActions } from '../hooks/useSessionActions';
import { useSessionCache } from '../hooks/useSessionCache';
import { CopilotKitProvider, SharedAgentProvider } from '../hooks/copilotkit';
import { COPIOLITKIT_CONFIG, API_CONFIG } from '../constants';
import { createAllToolRenderers } from '../actions/copilot/builtinToolActions';
import { createActivityMessageRenderers } from '../actions/copilot/activityRenderers';

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
  isVisible?: boolean; // Track if the page is currently visible
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
  isVisible = true,
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
  const { isSessionReady, isMessagesLoading, handleSessionReady, handleMessagesLoadingChange } =
    useSessionLoadingState(currentSessionId);

  // Session actions (managed by custom hook)
  const {
    handleNewSession,
    handleCloseSession,
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
    handleRegisterGetMessagesFunction,
    hasAttemptedInitialSessionRef,
  } = useSessionActions(currentSessionId, sessions, sessionMessageCounts);

  // Sessions panel (left side - open chats list) - persisted to localStorage
  const [showSessionsPanel, setShowSessionsPanel] = useState(() => {
    try {
      const stored = localStorage.getItem('sessionsPanelOpen');
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const [sessionsPanelWidth, setSessionsPanelWidth] = useState(() => {
    try {
      const stored = localStorage.getItem('sessionsPanelWidth');
      const w = stored ? parseInt(stored, 10) : 280;
      return !isNaN(w) && w >= 220 && w <= 400 ? w : 280;
    } catch {
      return 280;
    }
  });
  const [sessionsPanelSplitRatio, setSessionsPanelSplitRatio] = useState(() => {
    try {
      const stored = localStorage.getItem('sessionsPanelSplitRatio');
      const r = stored ? parseFloat(stored) : 0.55;
      return !isNaN(r) && r >= 0.22 && r <= 0.82 ? r : 0.55;
    } catch {
      return 0.55;
    }
  });
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const [isSessionsPanelSmallView, setIsSessionsPanelSmallView] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 600 : true,
  );
  const SESSIONS_PANEL_SMALL_VIEW_THRESHOLD = 600; // Match ConfigPanel threshold

  // Persist sessions panel state to localStorage (restore on tab open)
  useEffect(() => {
    try {
      localStorage.setItem('sessionsPanelOpen', String(showSessionsPanel));
    } catch (e) {
      console.error('[SessionsPage] Failed to persist sessionsPanelOpen', e);
    }
  }, [showSessionsPanel]);
  useEffect(() => {
    try {
      localStorage.setItem('sessionsPanelWidth', String(sessionsPanelWidth));
    } catch (e) {
      console.error('[SessionsPage] Failed to persist sessionsPanelWidth', e);
    }
  }, [sessionsPanelWidth]);
  useEffect(() => {
    try {
      localStorage.setItem('sessionsPanelSplitRatio', String(sessionsPanelSplitRatio));
    } catch (e) {
      console.error('[SessionsPage] Failed to persist sessionsPanelSplitRatio', e);
    }
  }, [sessionsPanelSplitRatio]);

  useEffect(() => {
    const el = contentAreaRef.current;
    if (!el) return;

    const checkSize = () => {
      const width = el.offsetWidth || el.clientWidth || window.innerWidth;
      setIsSessionsPanelSmallView(width < SESSIONS_PANEL_SMALL_VIEW_THRESHOLD);
    };

    checkSize();
    const ro = new ResizeObserver(checkSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ref to open settings modal from header (registered by active ChatSessionContainer)
  const openSettingsRef = useRef<Record<string, () => void>>({});
  const handleRegisterOpenSettings = useCallback((sessionId: string, openFn: () => void) => {
    openSettingsRef.current[sessionId] = openFn;
  }, []);
  const handleOpenSettings = useCallback(() => {
    if (currentSessionId && openSettingsRef.current[currentSessionId]) {
      openSettingsRef.current[currentSessionId]();
    }
  }, [currentSessionId]);

  // Config panel state for header button and layout (registered by active ChatSessionContainer)
  const [configPanelState, setConfigPanelState] = useState<
    Record<string, { isOpen: boolean; width: number; toggle: () => void }>
  >({});
  const handleRegisterConfigPanel = useCallback(
    (sessionId: string, state: { isOpen: boolean; width: number; toggle: () => void }) => {
      setConfigPanelState(prev => ({ ...prev, [sessionId]: state }));
    },
    [],
  );
  const handleToggleConfigPanel = useCallback(() => {
    configPanelState[currentSessionId ?? '']?.toggle?.();
  }, [currentSessionId, configPanelState]);

  // Effective config panel state: use current session's state if registered; otherwise fall back to any session with panel open.
  // Fixes layout when switching sessions—new session may not have registered yet, so we preserve margin until it does.
  const effectiveConfigPanelState = useMemo(() => {
    const current = configPanelState[currentSessionId ?? ''];
    if (current) return current;
    const fallback = Object.values(configPanelState).find(s => s.isOpen);
    return fallback ?? null;
  }, [configPanelState, currentSessionId]);

  // Portal container for ConfigPanel - same parent as content column (like SessionsPanel) so marginRight pushes footer
  const configPanelPortalRef = useRef<HTMLDivElement>(null);

  // Delete session from SessionsPanel (with confirmation)
  const [deleteSessionConfirmOpen, setDeleteSessionConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; title: string } | null>(null);
  const handleDeleteSessionFromPanel = useCallback(
    (sessionId: string) => {
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        setSessionToDelete({ id: sessionId, title: session.title });
        setDeleteSessionConfirmOpen(true);
      }
    },
    [sessions],
  );
  const handleConfirmDeleteSessionFromPanel = useCallback(async () => {
    if (!sessionToDelete) return;
    try {
      await sessionStorageDBWrapper.deleteSession(sessionToDelete.id, API_CONFIG.BASE_URL);
      setDeleteSessionConfirmOpen(false);
      setSessionToDelete(null);
    } catch (err) {
      console.error('[SessionsPage] Failed to delete session:', err);
    }
  }, [sessionToDelete]);

  const lastStorageUserIdRef = useRef<string | null>(null);
  const hasSeenSessionsForCurrentUserRef = useRef<boolean>(false);

  // PERFORMANCE FIX: Combine two useEffects that both check storage user ID
  // This reduces redundant getCurrentUserId() calls
  useEffect(() => {
    const storageUserId = sessionStorageDBWrapper.getCurrentUserId();

    if (!user?.id || !storageUserId) {
      return;
    }

    // Track when the storage userId changes; require at least one sessions fetch after change
    if (lastStorageUserIdRef.current !== storageUserId) {
      lastStorageUserIdRef.current = storageUserId;
      hasSeenSessionsForCurrentUserRef.current = false;
      hasAttemptedInitialSessionRef.current = false;
    }

    // Mark that we've observed at least one sessions snapshot for the current user
    if (lastStorageUserIdRef.current === storageUserId) {
      hasSeenSessionsForCurrentUserRef.current = true;
    }
  }, [sessions, user?.id, hasAttemptedInitialSessionRef]);

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
        await sessionStorageDBWrapper.addSession(generateSessionName(), API_CONFIG.BASE_URL);
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

  // Session cache with LRU eviction - keeps visited sessions mounted
  const { mountedSessionIds, getCacheStats } = useSessionCache({
    sessions,
    currentSessionId,
    maxCachedSessions: SESSION_CACHE.maxCachedSessions,
  });

  // Get sessions that should be rendered (mounted)
  const sessionsToRender = useMemo(() => {
    return sessions.filter(s => s.isOpen && mountedSessionIds.has(s.id));
  }, [sessions, mountedSessionIds]);

  // PERFORMANCE FIX: Log cache stats only when size changes, not on every update
  // This prevents excessive logging on every session switch
  const prevCacheSizeRef = useRef(0);
  useEffect(() => {
    const stats = getCacheStats();
    if (stats.size !== prevCacheSizeRef.current) {
      debug.log('[SessionsPage] Session cache size changed:', {
        size: stats.size,
        maxSize: stats.maxSize,
        ids: stats.ids.map(id => id.slice(0, 8)),
      });
      prevCacheSizeRef.current = stats.size;
    }
  }, [getCacheStats, mountedSessionIds]);

  const hasSessions = sessions.length > 0;
  const isWaitingForFirstSession = !hasSessions && !hasAttemptedInitialSessionRef.current;
  const shouldShowSkeleton =
    isEnsuringInitialSession || isWaitingForFirstSession || (!!currentSessionId && !isSessionReady);
  // Full skeleton overlay only for initial loading states (not for session transitions)
  const shouldShowSkeletonOverlay = Boolean(activeSession) && (isEnsuringInitialSession || isWaitingForFirstSession);
  const shouldShowStandaloneSkeleton = !activeSession && shouldShowSkeleton;

  // Add/remove skeleton-loading class on body to hide disclaimer during loading
  useEffect(() => {
    if (shouldShowSkeleton) {
      document.body.classList.add('skeleton-loading');
    } else {
      document.body.classList.remove('skeleton-loading');
    }
    return () => {
      document.body.classList.remove('skeleton-loading');
    };
  }, [shouldShowSkeleton]);

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
  }, [
    clearMessagesConfirmOpen,
    clearSessionsConfirmOpen,
    resetSessionConfirmOpen,
    setClearMessagesConfirmOpen,
    setClearSessionsConfirmOpen,
    setResetSessionConfirmOpen,
  ]);

  // Get current session title for modals
  const currentSessionTitle = sessions.find(s => s.id === currentSessionId)?.title || 'this chat';

  return (
    <div className="sessions-page flex min-h-0 flex-1 flex-col">
      {/* Chats Page Header */}
      <SessionHeader
        isLight={isLight}
        viewMode={viewMode}
        apiBaseUrl={API_CONFIG.BASE_URL}
        currentSessionId={currentSessionId}
        currentSessionTitle={currentSessionTitle}
        sessionMessageCount={currentSessionId ? sessionMessageCounts[currentSessionId] || 0 : 0}
        copiedSessionId={copiedSessionId}
        isVisible={isVisible}
        onNewSession={handleNewSession}
        onCloseSession={handleCloseSession}
        onResetSession={handleResetSession}
        onClearAllMessages={handleClearAllMessages}
        onClearAllSessions={openClearSessionsConfirm}
        onExportAsMarkdown={handleExportAsMarkdown}
        onExportAsHTML={handleExportAsHTML}
        onCopySessionId={handleCopySessionId}
        onOpenAbout={onOpenAbout}
        onOpenSettings={handleOpenSettings}
        onClose={onClose}
        onGoHome={onGoHome}
        onGoAdmin={onGoAdmin}
        sessionsPanelOpen={showSessionsPanel}
        onToggleSessionsPanel={() => setShowSessionsPanel(p => !p)}
        configPanelOpen={effectiveConfigPanelState?.isOpen ?? false}
        onToggleConfigPanel={handleToggleConfigPanel}
      />

      {/* Session Content Area - with optional left SessionsPanel and right ConfigPanel (same parent) */}
      <div ref={contentAreaRef} className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* z-[55] wrappers sit above the chat column (z-50) so small-view backdrops paint on top */}
        {showSessionsPanel && (
          <div className="pointer-events-none absolute inset-0 z-[55]">
            <SessionsPanel
              isLight={isLight}
              isOpen={showSessionsPanel}
              onClose={() => setShowSessionsPanel(false)}
              sessions={sessions}
              currentSessionId={currentSessionId}
              onNewSession={handleNewSession}
              onOpenSession={id => sessionStorageDBWrapper.setActiveSession(id)}
              onCloneSession={id => sessionStorageDBWrapper.cloneSession(id, API_CONFIG.BASE_URL)}
              onArchiveSession={id => sessionStorageDBWrapper.closeSession(id)}
              onDeleteSession={handleDeleteSessionFromPanel}
              onWidthChange={setSessionsPanelWidth}
              initialWidth={sessionsPanelWidth}
              initialSplitRatio={sessionsPanelSplitRatio}
              onSplitRatioChange={setSessionsPanelSplitRatio}
              isSmallView={isSessionsPanelSmallView}
              apiBaseUrl={API_CONFIG.BASE_URL}
            />
          </div>
        )}
        {/* Portal target for ConfigPanel — z-[55] above chat (z-50) so overlay + backdrop stack correctly */}
        <div ref={configPanelPortalRef} className="pointer-events-none absolute inset-0 z-[55]" aria-hidden />
        {/* Content column: z-50 — in-panel UI; side/config overlays use z-[55] siblings */}
        <div
          className="relative z-50 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            marginLeft: isSessionsPanelSmallView ? 0 : showSessionsPanel ? `${sessionsPanelWidth}px` : 0,
            marginRight: isSessionsPanelSmallView
              ? 0
              : effectiveConfigPanelState?.isOpen
                ? (effectiveConfigPanelState.width ?? 384)
                : 0,
            transition: 'margin-left 0.22s ease-out, margin-right 0.22s ease-out',
          }}>
          <div className="relative flex-1 overflow-hidden">
            {/* Render all cached sessions (hide inactive ones) */}
            {sessionsToRender.map(session => {
              const isActive = session.id === currentSessionId;
              return (
                <div
                  key={session.id}
                  className={cn('absolute inset-0 z-0 flex flex-col overflow-hidden', isActive && 'animate-fadeIn')}
                  style={{ display: isActive ? 'flex' : 'none' }}>
                  <ErrorBoundary
                    level="component"
                    fallback={
                      <div className="flex flex-1 items-center justify-center p-4">
                        <div className="text-center">
                          <p className="mb-2 text-red-600 dark:text-red-400">Chat Error</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            This chat encountered an error. Try switching to another chat.
                          </p>
                        </div>
                      </div>
                    }>
                    <ChatSessionContainer
                      sessionId={session.id}
                      isLight={isLight}
                      publicApiKey={publicApiKey}
                      initialMetadata={session}
                      isActive={isActive}
                      contextMenuMessage={isActive ? contextMenuMessage : null}
                      onMessagesCountChange={handleMessagesCountChange}
                      onRegisterResetFunction={handleRegisterResetFunction}
                      onRegisterOpenSettings={handleRegisterOpenSettings}
                      onRegisterConfigPanel={handleRegisterConfigPanel}
                      onRegisterGetMessagesFunction={handleRegisterGetMessagesFunction}
                      onReady={handleSessionReady}
                      onMessagesLoadingChange={handleMessagesLoadingChange}
                      configPanelPortalRef={configPanelPortalRef}
                      configPanelOpenOverride={
                        isActive && !configPanelState[session.id] && (effectiveConfigPanelState?.isOpen ?? false)
                      }
                      moreOptionsMenu={
                        isActive
                          ? {
                              isLight,
                              currentSessionId,
                              sessionMessageCount: sessionMessageCounts[currentSessionId ?? ''] ?? 0,
                              copiedSessionId,
                              onResetSession: handleResetSession,
                              onCloseSession: handleCloseSession,
                              onClearAllMessages: handleClearAllMessages,
                              onClearAllSessions: openClearSessionsConfirm,
                              onExportAsMarkdown: handleExportAsMarkdown,
                              onExportAsHTML: handleExportAsHTML,
                              onCopySessionId: handleCopySessionId,
                              onOpenSettings: handleOpenSettings,
                              onOpenAbout,
                              onClose,
                            }
                          : undefined
                      }
                    />
                  </ErrorBoundary>
                </div>
              );
            })}

            {/* Empty states when no sessions are mounted */}
            {sessionsToRender.length === 0 &&
              (shouldShowStandaloneSkeleton ? (
                <ChatSkeleton isLight={isLight} />
              ) : hasSessions ? (
                <div className="flex flex-1 items-center justify-center overflow-hidden">
                  <div className="text-center text-gray-500 dark:text-gray-400">
                    <p>Select a chat to begin</p>
                    <p className="text-sm">Choose a chat from the list below to continue</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center overflow-hidden">
                  <div className="text-center text-gray-500 dark:text-gray-400">
                    <p>No active chat</p>
                    <p className="text-sm">Create a new chat to start</p>
                  </div>
                </div>
              ))}

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
                <div className="pointer-events-auto absolute top-0 right-0 left-0 z-[15]">
                  <StatusBarSkeleton isLight={isLight} />
                </div>

                {/* Messages Skeleton - positioned in middle (between status bar and selectors bar) */}
                <div className="pointer-events-auto absolute top-[34px] right-0 bottom-[48px] left-0 z-[15] flex flex-col overflow-hidden">
                  <MessagesOnlySkeleton isLight={isLight} />
                </div>

                {/* Selectors Bar Skeleton - positioned at bottom, approximately h-[48px] */}
                <div className="pointer-events-auto absolute right-0 bottom-0 left-0 z-[15]">
                  <SelectorsBarSkeleton isLight={isLight} />
                </div>
              </>
            )}
          </div>

          {/* Past Chats bar — hidden when sessions panel is open (same as session tabs in header) */}
          {!showSessionsPanel && (
            <div
              className={cn(
                'flex-shrink-0 border-t px-3',
                isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
              )}>
              <SessionList isLight={isLight} viewMode={viewMode} />
            </div>
          )}
        </div>
      </div>

      {/* Delete Session from Panel Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteSessionConfirmOpen}
        onClose={() => {
          setDeleteSessionConfirmOpen(false);
          setSessionToDelete(null);
        }}
        onConfirm={handleConfirmDeleteSessionFromPanel}
        title="Delete Chat"
        message={
          sessionToDelete
            ? `Permanently delete "<strong>${sessionToDelete.title}</strong>"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLight={isLight}
        mainTextColor={mainTextColor}
      />

      {/* Clear Messages Confirmation Modal */}
      <ConfirmationModal
        isOpen={clearMessagesConfirmOpen}
        onClose={() => setClearMessagesConfirmOpen(false)}
        onConfirm={handleConfirmClearMessages}
        title="Clear All Chat Messages"
        message={`Permanently delete chat messages?<br/><br/>All <strong>${messageCount}</strong> ${messageCount === 1 ? 'message' : 'messages'} from "<strong>${currentSessionTitle}</strong>" will be permanently deleted from storage and cannot be recovered.`}
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
        title="Reset Chat"
        message={`Clear all messages in this chat?<br/><br/>All <strong>${messageCount}</strong> ${messageCount === 1 ? 'message' : 'messages'} in "<strong>${currentSessionTitle}</strong>" will be cleared from the chat. This action cannot be undone, but messages may still exist in storage.`}
        confirmLabel="Reset Chat"
        cancelLabel="Cancel"
        variant="warning"
        isLight={isLight}
        mainTextColor={mainTextColor}
      />

      {/* Clear Chats Confirmation Modal */}
      <ConfirmationModal
        isOpen={clearSessionsConfirmOpen}
        onClose={() => setClearSessionsConfirmOpen(false)}
        onConfirm={handleConfirmClearSessions}
        title="Clear All Chats"
        message="Permanently delete all chats?<br/><br/>This will remove all chats and their messages from storage and cannot be undone."
        confirmLabel="Delete All"
        cancelLabel="Cancel"
        variant="danger"
        isLight={isLight}
        mainTextColor={mainTextColor}
      />
    </div>
  );
};
