import React, { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import type { FC, CSSProperties } from 'react';
import { useStorage, sessionStorageDBWrapper, debug } from '@extension/shared';
import { preferencesStorage } from '@extension/storage';
import { StatusBar } from '../layout/StatusBar';
import { ChatInner } from './ChatInner';
import { SelectorsBar } from '../selectors/SelectorsBar';
import { SettingsModal } from '../modals/SettingsModal';
import { UsagePopup } from '../menus/UsagePopup';
import type { AgentStepState } from '../cards';
import { useContentManager, type ContentState } from '../layout/ContentManager';
import { useTabManager } from '../layout/TabManager';
import { useMessagePersistence } from '../../hooks/useMessagePersistence';
import { usePanelVisibility } from '../../hooks/usePanelVisibility';
import { useContentRefresh } from '../../hooks/useContentRefresh';
import { useUsageStream, type UsageData } from '../../hooks/useUsageStream';
import { useSessionData, type UsageTotals } from '../../hooks/useSessionData';
import { useEmbeddingWorker } from '../../hooks/useEmbeddingWorker';
import { usePageContentEmbedding } from '../../hooks/usePageContentEmbedding';
import { useDOMUpdateEmbedding } from '../../hooks/useDOMUpdateEmbedding';
import { useAgentSwitching } from '../../hooks/useAgentSwitching';
import { useEnabledFrontendTools } from '../../hooks/useEnabledFrontendTools';
import { TIMING_CONSTANTS, COPIOLITKIT_CONFIG, ABLY_CONFIG } from '../../constants';
import { ts } from '../../utils/logging';
import { useAuth } from '../../context/AuthContext';
import { CopilotKitProvider, useCopilotChat } from '../../hooks/copilotkit';
import { createAllToolRenderers } from '../../actions/copilot/builtinToolActions';
import { createActivityMessageRenderers } from '../../actions/copilot/activityRenderers';

// Helper for text clipping (used by backend tool renderers)
const clipText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Helper component that syncs messages signature and streaming state from CopilotKit to parent.
 * Also handles session switching by resetting CopilotKit state when sessionId changes.
 * Must be rendered inside CopilotKitProvider.
 */
const ChatInnerWithSignatureSync: FC<{
  sessionId: string;
  onSignatureChange: (signature: string) => void;
  onStreamingChange: (isStreaming: boolean) => void;
  renderChatInner: () => React.ReactNode;
}> = ({ sessionId, onSignatureChange, onStreamingChange, renderChatInner }) => {
  const { messages, isLoading, reset } = useCopilotChat();
  const prevSessionIdRef = useRef(sessionId);

  // Handle session switch - reset CopilotKit messages when session changes
  // This allows CopilotKitProvider to remain stable (no key change) while still
  // clearing messages on session switch
  useEffect(() => {
    if (prevSessionIdRef.current !== sessionId) {
      debug.log(`[ChatInnerWithSignatureSync] Session changed: ${prevSessionIdRef.current?.slice(0, 8)} -> ${sessionId.slice(0, 8)}, resetting messages`);
      prevSessionIdRef.current = sessionId;
      // Reset CopilotKit's internal message state
      reset();
    }
  }, [sessionId, reset]);

  // Sync streaming state to parent
  useEffect(() => {
    onStreamingChange(isLoading);
  }, [isLoading, onStreamingChange]);

  // Compute and sync messages signature
  useEffect(() => {
    try {
      const signature = JSON.stringify(
        messages.map(message => ({
          id: (message as any)?.id ?? null,
          role: (message as any)?.role ?? null,
          hash: typeof (message as any)?.content === 'string' 
            ? (message as any).content.length 
            : JSON.stringify((message as any)?.content ?? '').length,
        })),
      );
      onSignatureChange(signature);
    } catch {
      onSignatureChange(`${messages.length}:${Date.now()}`);
    }
  }, [messages, onSignatureChange]);

  return <>{renderChatInner()}</>;
};

interface ChatSessionContainerProps {
  sessionId: string;
  isLight: boolean;
  publicApiKey: string;
  isActive?: boolean;
  contextMenuMessage?: string | null;
  onMessagesCountChange?: (sessionId: string, count: number) => void;
  onRegisterResetFunction?: (sessionId: string, resetFn: () => void) => void;
  onRegisterSaveFunction?: (sessionId: string, saveFn: () => void) => void;
  onRegisterLoadFunction?: (sessionId: string, loadFn: () => void) => void;
  onReady?: (sessionId: string) => void;
  onMessagesLoadingChange?: (sessionId: string, isLoading: boolean) => void;
}

/**
 * ChatSessionContainer Component
 *
 * Container component that orchestrates all chat session functionality
 * Manages content, tabs, messages, and panel visibility
 * Split from the original ChatSession.tsx for better maintainability
 */
export const ChatSessionContainer: FC<ChatSessionContainerProps> = memo(
  ({
    sessionId,
    isLight,
    publicApiKey,
    isActive = true,
    contextMenuMessage = null,
    onMessagesCountChange,
    onRegisterResetFunction,
    onRegisterSaveFunction,
    onRegisterLoadFunction,
    onReady,
    onMessagesLoadingChange,
  }) => {
    // ================================================================================
    // RENDER TRACKING
    // ================================================================================
    const renderCountRef = useRef(0);
    renderCountRef.current += 1;
    // debug.log(`[ChatSessionContainer] 🔄 RENDER #${renderCountRef.current} for session ${sessionId.slice(0, 8)}`, {
    //   isActive,
    //   timestamp: new Date().toISOString(),
    // });

    // Removed: const { sessions } = useSessionStorageDB();
    // This was causing unnecessary re-renders on every session update.
    // Agent/model loading is now handled by useSessionData hook.
    const { showAgentCursor, showSuggestions, showThoughtBlocks, agentModeChat, chatFontSize } = useStorage(preferencesStorage);
    const { organization, activeTeam } = useAuth();
    const [userMessagesCount, setUserMessagesCount] = useState<number>(0);
    const [assistantMessagesCount, setAssistantMessagesCount] = useState<number>(0);
    const [isCounterReady, setIsCounterReady] = useState<boolean>(false); // Hide counter until stable
    const [isLoading, setIsLoading] = useState(true);
    const [isAgentLoading, setIsAgentLoading] = useState(false);
    const [themeColor, setThemeColor] = useState('#374151'); // gray-700 for better visibility
    // Track if initial message count has been reported to prevent flickering after skeleton disappears
    const hasReportedInitialCountRef = useRef(false);
    const lastReportedCountRef = useRef<number>(0);
    const initialReportTimeRef = useRef<number>(0);
    const hydrationReadyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isUsagePopupOpen, setIsUsagePopupOpen] = useState(false);
    
    // Track messages signature for hydration (replaces useSessionRuntimeState)
    const [messagesSignature, setMessagesSignature] = useState<string>('');
    const messagesSignatureRef = useRef<string>('');
    
    // Track streaming state from CopilotKit (synced from ChatInnerWithSignatureSync)
    const [copilotIsStreaming, setCopilotIsStreaming] = useState<boolean>(false);

    // Track previous session ID to detect changes
    const prevSessionIdRef = useRef<string | null>(null);

    // Reset message count when session changes
    useEffect(() => {
      if (hydrationReadyTimeoutRef.current) {
        clearTimeout(hydrationReadyTimeoutRef.current);
        hydrationReadyTimeoutRef.current = null;
      }

      if (prevSessionIdRef.current && prevSessionIdRef.current !== sessionId) {
        debug.log(`[ChatSessionContainer] ========== SESSION SWITCHED ==========`);
        debug.log(`[ChatSessionContainer] From: ${prevSessionIdRef.current.slice(0, 8)}`);
        debug.log(`[ChatSessionContainer] To: ${sessionId.slice(0, 8)}`);
        debug.log(`[ChatSessionContainer] Resetting message count and agent state`);

        // OPTIMIZATION: Batch state updates using startTransition to reduce re-renders
        React.startTransition(() => {
          setUserMessagesCount(0);
          setAssistantMessagesCount(0);
          setIsCounterReady(false);
          hasReportedInitialCountRef.current = false;
          setCurrentAgentStepState({
            sessionId,
            plan: { steps: [] },
          });
        });

        debug.log(`[ChatSessionContainer] Session switch complete`);
      } else if (!prevSessionIdRef.current) {
        debug.log(`[ChatSessionContainer] ========== INITIAL SESSION MOUNT ==========`);
        debug.log(`[ChatSessionContainer] Session ID: ${sessionId.slice(0, 8)}`);
        debug.log(`[ChatSessionContainer] isActive: ${isActive}`);
      }
      prevSessionIdRef.current = sessionId;
    }, [sessionId]);

    // Note: Embedding state (pageContentEmbeddingRef, isEmbedding, embeddingStatus, dbTotals)
    // is now provided by usePageContentEmbedding hook (see line ~396)

    // ================================================================================
    // SESSION DATA MANAGEMENT (Consolidates metadata, usage, agent state loading)
    // ================================================================================
    const {
      selectedAgent,
      setSelectedAgent: setSelectedAgentInternal,
      selectedModel,
      setSelectedModel: setSelectedModelInternal,
      initialUsage,
      initialLastUsage,
      isUsageHydrating,
      currentAgentStepState,
      setCurrentAgentStepState,
      isLoadingMetadata,
      isLoadingFromDB,
      persistUsageStats,
    } = useSessionData(sessionId, isActive);

    // Wrap setters to maintain existing API
    const setSelectedAgent = useCallback(
      (agent: string) => {
        debug.log(`[ChatSessionContainer] User changed agent to: ${agent}`);
        setSelectedAgentInternal(agent);
      },
      [setSelectedAgentInternal],
    );

    const setSelectedModel = useCallback(
      (model: string) => {
        debug.log(`[ChatSessionContainer] User changed model to: ${model}`);
        setSelectedModelInternal(model);
      },
      [setSelectedModelInternal],
    );

    // Log when agent/model selections change
    useEffect(() => {
      debug.log(`[ChatSessionContainer] Agent/Model state for session ${sessionId.slice(0, 8)}:`, {
        selectedAgent: selectedAgent || '(empty)',
        selectedModel: selectedModel || '(empty)',
        isAgentAndModelSelected: selectedAgent !== '' && selectedModel !== '',
      });
    }, [selectedAgent, selectedModel, sessionId]);

    // Clear agent and model selections when there's no active team
    useEffect(() => {
      if (!organization?.id || !activeTeam) {
        debug.log(`[ChatSessionContainer] Clearing agent/model for session ${sessionId.slice(0, 8)} - no org/team`);
        setSelectedAgentInternal('');
        setSelectedModelInternal('');
      }
    }, [organization?.id, activeTeam, sessionId, setSelectedAgentInternal, setSelectedModelInternal]);

    // Agent switching is handled by useAgentSwitching hook

    // Message data structure returned by saveMessagesRef
    interface MessageData {
      allMessages: any[];
      filteredMessages: any[];
    }

    // Refs to access CopilotKit's setMessages from ChatInner
    const saveMessagesRef = useRef<(() => MessageData) | null>(null);
    const restoreMessagesRef = useRef<((messages: any[]) => void) | null>(null);
    const resetChatRef = useRef<(() => void) | null>(null);

    // Note: previousAgentRef and previousModelRef are now managed internally by useAgentSwitching hook

    // Content state management
    const [contentState, setContentState] = useState<ContentState>({
      current: null,
      previous: null,
      status: 'none',
      lastFetch: 0,
      error: undefined,
    });

    const [showStaleIndicator, setShowStaleIndicator] = useState(false);
    const [latestDOMUpdate, setLatestDOMUpdate] = useState<any>(null);

    // Multi-page context: Selected pages for agent context
    const [selectedPageURLs, setSelectedPageURLs] = useState<string[]>([]);

    // Tab management
    const [currentTabId, setCurrentTabId] = useState<number | null>(null);
    const [currentTabTitle, setCurrentTabTitle] = useState<string>('');
    const getCurrentTabTitle = useCallback(() => currentTabTitle, [currentTabTitle]);

    // Content cache ref for refresh operations
    const contentCacheRef = useRef<Map<string, any>>(new Map());

    // Content manager
    // Placeholder values; real values provided after usePanelVisibility below
    const {
      contentState: managedContentState,
      showStaleIndicator: managedStaleIndicator,
      latestDOMUpdate: managedDOMUpdate,
      fetchFreshPageContent,
      clearCache,
    } = useContentManager({
      currentTabId,
      isActive,
      isPanelInteractive: false,
      isPanelVisible: false,
      isPanelActive: false,
      isAgentLoading: false,
      onContentStateChange: setContentState,
      onStaleIndicatorChange: setShowStaleIndicator,
      onDOMUpdate: setLatestDOMUpdate,
    });

    // Tab manager
    const {
      currentTabId: managedTabId,
      currentTabTitle: managedTabTitle,
      currentTabUrl: managedTabUrl,
      setCurrentTabId: setManagedTabId,
      setCurrentTabTitle: setManagedTabTitle,
    } = useTabManager({
      isActive,
      isPanelInteractive: false, // Will be updated by panel visibility hook
      isPanelVisible: false, // Will be updated by panel visibility hook
      onTabChange: (tabId, title) => {
        setCurrentTabId(tabId);
        setCurrentTabTitle(title);
      },
      onContentRefresh: tabId => {
        fetchFreshPageContent(true, tabId);
      },
    });

    // Panel visibility hook (must be called before useMessagePersistence)
    const {
      isPanelVisible,
      setIsPanelVisible,
      isPanelInteractive,
      setIsPanelInteractive,
      isPanelActive,
      panelJustOpenedRef,
    } = usePanelVisibility({
      isActive,
      onVisibilityChange: isVisible => {
        if (!isVisible) {
          // debug.log(ts(), '[ChatSessionContainer] Panel hidden, clearing content cache');
          try {
            clearCache();
          } catch {}
        }
      },
      onClickInPanel: event => {
        // Handle click logic for content refresh and interaction
        const target = event?.target as HTMLElement;
        if (target) {
          const shouldSkipFocus =
            target.closest('button') ||
            target.closest('input') ||
            target.closest('textarea') ||
            target.closest('a') ||
            target.closest('[role="tab"]') ||
            target.closest('[role="button"]') ||
            target.closest('[data-session-id]') ||
            target.closest('.session-tabs-scroll') ||
            target.closest('[contenteditable="true"]') ||
            target.matches('button') ||
            target.matches('input') ||
            target.matches('textarea') ||
            target.matches('[contenteditable="true"]') ||
            (target.className &&
              typeof target.className === 'string' &&
              (target.className.includes('session') || target.className.includes('cursor-pointer')));

          if (shouldSkipFocus) {
            if (!isPanelInteractive) {
              setIsPanelInteractive(true);
              // debug.log(ts(), '[ChatSessionContainer] User clicked in panel, marking as interactive (no auto-focus)');
            }
            return;
          }
        }

        // User clicked inside the panel - mark as interactive
        const wasInactive = !isPanelInteractive;

        if (wasInactive) {
          setIsPanelInteractive(true);
          // debug.log(ts(), '[ChatSessionContainer] User clicked in panel, marking as interactive');

          // Trigger content refresh when becoming interactive (handles tab changes while panel was inactive)
          if (currentTabId) {
            // debug.log(ts(), '[ChatSessionContainer] Triggering content refresh on interaction');
            fetchFreshPageContent(false, currentTabId);
          }

          // Clear stale indicator if showing
          if (showStaleIndicator) {
            setShowStaleIndicator(false);
          }

          // Simple auto-focus attempt
          setTimeout(() => {
            const input = document.querySelector('.copilotKitInput textarea') as HTMLTextAreaElement;
            if (input && input.offsetParent !== null) {
              input.focus();
              // debug.log(ts(), '[ChatSessionContainer] ✅ Auto-focused chat input');
            }
          }, TIMING_CONSTANTS.AUTO_FOCUS_DELAY);
        }
      },
      onPanelBlur: () => {
        // debug.log(ts(), '[ChatSessionContainer] Panel lost focus');
      },
    });

    // Message persistence
    const {
      storedMessages,
      storedFilteredMessagesCount,
      setStoredMessages,
      handleSaveMessages,
      handleLoadMessages,
      saveMessagesToStorage,
      isHydrating,
      hydrationCompleted,
    } = useMessagePersistence({
      sessionId,
      isActive,
      isPanelVisible,
      isStreaming: copilotIsStreaming,
      saveMessagesRef,
      restoreMessagesRef,
      resetChatRef,
    });
    const readySignalTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hasSignaledReadyRef = useRef(false);

    // Notify parent when messages are loading
    useEffect(() => {
      if (onMessagesLoadingChange) {
        onMessagesLoadingChange(sessionId, isHydrating);
      }
    }, [sessionId, isHydrating, onMessagesLoadingChange]);

    // Handle session ID changes gracefully without full remount
    useEffect(() => {
      const prevSessionId = prevSessionIdRef.current;
      const sessionChanged = prevSessionId && prevSessionId !== sessionId;

      if (sessionChanged) {
        debug.log(
          `[ChatSessionContainer] Session changed from ${prevSessionId} to ${sessionId}, handling hydration...`,
        );

        const runtimeHasMessages = Boolean(messagesSignatureRef.current);

        if (isActive) {
          if (runtimeHasMessages) {
            debug.log('[ChatSessionContainer] Runtime already has messages, skipping storage reload');
            // Sync stored messages asynchronously to keep metadata accurate
            setTimeout(() => {
              const fn = saveMessagesRef.current;
              if (!fn) {
                return;
              }
              try {
                const data = fn();
                const allMessages = (data?.allMessages ?? []) as any[];
                if (allMessages.length > 0) {
                  void saveMessagesToStorage(allMessages as any);
                }
              } catch (error) {
                debug.warn('[ChatSessionContainer] Failed to sync runtime messages to storage', error);
              }
            }, 0);
          } else {
            debug.log('[ChatSessionContainer] Runtime empty, loading messages from storage');
            handleLoadMessages();
          }
        }

        // Removed: Duplicate agent/model loading from sessions array
        // This is now handled by useSessionData hook which loads from IndexedDB
        // const newSession = sessions.find(s => s.id === sessionId);
        // if (newSession) {
        //   setSelectedAgent(newSession.selectedAgent || '');
        //   setSelectedModel(newSession.selectedModel || '');
        // }

        prevSessionIdRef.current = sessionId;
        hasSignaledReadyRef.current = false;
        hasReportedInitialCountRef.current = false;
        setIsCounterReady(false);
        if (readySignalTimeoutRef.current) {
          clearTimeout(readySignalTimeoutRef.current);
          readySignalTimeoutRef.current = null;
        }
      } else if (!prevSessionId) {
        prevSessionIdRef.current = sessionId;
      }
    }, [
      sessionId,
      isActive,
      // Removed: sessions (no longer needed, reduces re-renders)
      messagesSignature,
      handleLoadMessages,
      saveMessagesToStorage,
    ]);

    useEffect(() => {
      const signature = messagesSignature;
      if (!signature || isCounterReady) {
        return;
      }

      if (!hydrationCompleted) {
        debug.log(
          '[ChatSessionContainer] Runtime signature detected but hydration not complete; waiting before marking counter ready',
          { sessionId: sessionId.slice(0, 8), signature },
        );
        return;
      }

      const awaitingCount = Boolean(onMessagesCountChange) && !hasReportedInitialCountRef.current;
      if (awaitingCount) {
        debug.log(
          '[ChatSessionContainer] Hydration complete but waiting for message count synchronization before marking ready',
          { sessionId: sessionId.slice(0, 8) },
        );
        return;
      }

      debug.log('[ChatSessionContainer] Hydration complete with runtime signature; marking counter ready', {
        sessionId: sessionId.slice(0, 8),
      });
      setIsCounterReady(true);
    }, [messagesSignature, isCounterReady, hydrationCompleted, onMessagesCountChange, sessionId]);

    useEffect(() => {
      if (!isActive) {
        return;
      }

      const signature = messagesSignature;
      if (!signature) {
        return;
      }

      if (hydrationCompleted && hasReportedInitialCountRef.current) {
        debug.log(
          '[ChatSessionContainer] Runtime reported messages update after hydration; ensuring skeleton is cleared',
          { sessionId: sessionId.slice(0, 8), signature },
        );
        setIsCounterReady(true);
      }
    }, [isActive, messagesSignature, hydrationCompleted, sessionId]);

    useEffect(() => {
      if (!onReady || !isActive) {
        if (hydrationReadyTimeoutRef.current) {
          clearTimeout(hydrationReadyTimeoutRef.current);
          hydrationReadyTimeoutRef.current = null;
        }
        return;
      }

      if (hasSignaledReadyRef.current) {
        if (hydrationReadyTimeoutRef.current) {
          clearTimeout(hydrationReadyTimeoutRef.current);
          hydrationReadyTimeoutRef.current = null;
        }
        return;
      }

      const signalReady = (reason: 'counter' | 'hydration') => {
        if (hasSignaledReadyRef.current) {
          return;
        }
        if (hydrationReadyTimeoutRef.current) {
          clearTimeout(hydrationReadyTimeoutRef.current);
          hydrationReadyTimeoutRef.current = null;
        }
        hasSignaledReadyRef.current = true;
        if (reason === 'hydration' && !isCounterReady) {
          setIsCounterReady(true);
        }
        debug.log(
          `[ChatSessionContainer] Signaling session ready via ${reason === 'counter' ? 'stable counter' : 'hydration fallback'} for ${sessionId}`,
        );
        onReady(sessionId);
      };

      if (isCounterReady) {
        signalReady('counter');
        return;
      }

      if (hydrationCompleted) {
        if (!hydrationReadyTimeoutRef.current) {
          hydrationReadyTimeoutRef.current = setTimeout(() => {
            hydrationReadyTimeoutRef.current = null;
            signalReady('hydration');
          }, HYDRATION_READY_FALLBACK_DELAY);
        }
      } else if (hydrationReadyTimeoutRef.current) {
        clearTimeout(hydrationReadyTimeoutRef.current);
        hydrationReadyTimeoutRef.current = null;
      }

      return () => {
        if (
          !hasSignaledReadyRef.current &&
          hydrationReadyTimeoutRef.current &&
          !isCounterReady &&
          !hydrationCompleted
        ) {
          clearTimeout(hydrationReadyTimeoutRef.current);
          hydrationReadyTimeoutRef.current = null;
        }
      };
    }, [onReady, isActive, isCounterReady, hydrationCompleted, sessionId]);

    // Note: Message loading is handled automatically by useMessagePersistence's auto-restore
    // No need to explicitly call handleLoadMessages here as it would cause double renders
    // The auto-restore triggers 50ms after session becomes active, allowing CopilotKit to initialize
    const HYDRATION_READY_FALLBACK_DELAY = 50; // milliseconds - reduced from 80ms for faster ready signal

    // ================================================================================
    // USAGE TRACKING (Uses data from useSessionData hook)
    // ================================================================================
    const {
      lastUsage,
      cumulativeUsage,
      isConnected: isUsageConnected,
      error: usageError,
      resetCumulative,
      setCumulative,
      setLastUsage,
    } = useUsageStream(
      sessionId,
      true,
      ABLY_CONFIG.API_KEY,
      initialUsage,
      initialLastUsage,
    );

    // Ref for backward compatibility
    const isUsageHydratingRef = useRef(isUsageHydrating);

    // Embedding worker for page content
    const {
      isInitialized: isEmbeddingInitialized,
      isInitializing: isEmbeddingInitializing,
      isProcessing: isEmbeddingProcessing,
      error: embeddingError,
      progress: embeddingProgress,
      initialize,
      embedPageContent,
      embedPageContentForTab,
      embedTexts,
    } = useEmbeddingWorker({
      autoInitialize: false,
      // Progress is logged by the hook itself, no need to log here
    });

    // Save cumulative usage to storage whenever it changes
    // Now handled by useSessionData hook
    useEffect(() => {
      if (cumulativeUsage) {
        persistUsageStats(cumulativeUsage, lastUsage);
      }
    }, [cumulativeUsage, lastUsage, persistUsageStats]);

    // Save agent step state to storage whenever it changes
    // Skip saving during hydration to prevent overwriting DB data with empty state
    useEffect(() => {
      if (!currentAgentStepState) {
        return;
      }
      if (currentAgentStepState.sessionId && currentAgentStepState.sessionId !== sessionId) {
        return;
      }
      // Don't save during initial hydration - wait for DB load to complete
      if (isUsageHydrating) {
        return;
      }
      // Save plan and graph state to storage
      sessionStorageDBWrapper.updateAgentStepState(sessionId, {
        sessionId,
        plan: currentAgentStepState.plan,
        graph: currentAgentStepState.graph,
        deferred_tool_requests: currentAgentStepState.deferred_tool_requests,
      } as any);
    }, [sessionId, currentAgentStepState, isUsageHydrating]);

    // Log usage errors if any
    useEffect(() => {
      if (usageError) {
        debug.log(ts(), 'Usage streaming error:', usageError);
      }
    }, [usageError]);

    // Log embedding errors if any
    useEffect(() => {
      if (embeddingError) {
        debug.log(ts(), 'Embedding error:', embeddingError);
      }
    }, [embeddingError]);

    // Log embedding worker state changes (only major state changes, not every progress update)
    useEffect(() => {
      // Always log initialization state for debugging
      debug.log(ts(), '[ChatSessionContainer] 📊 Embedding worker state:', {
        isInitialized: isEmbeddingInitialized,
        isInitializing: isEmbeddingInitializing,
        hasError: !!embeddingError,
      });

      // Only log when initialization state changes or errors occur
      if (embeddingError) {
        debug.error(ts(), '❌ [ChatSessionContainer] Embedding Error:', embeddingError.message);
      } else if (isEmbeddingInitialized && !isEmbeddingInitializing) {
        debug.log(ts(), '[ChatSessionContainer] ✅ Embedding worker ready and initialized');
      } else if (isEmbeddingInitializing) {
        debug.log(ts(), '[ChatSessionContainer] ⏳ Embedding worker initializing...');
      }
    }, [isEmbeddingInitialized, isEmbeddingInitializing, embeddingError]);

    // Derived state for backward compatibility (moved here to avoid "use before declaration" error)
    const currentPageContent = contentState.current || contentState.previous;
    const isContentFetching = contentState.status === 'loading' || contentState.status === 'refreshing';

    // ================================================================================
    // CUSTOM HOOKS FOR EMBEDDING, AGENT SWITCHING, AND AUTO-SAVE
    // ================================================================================

    // Page content embedding hook - replaces large embedding effect block
    const { pageContentEmbeddingRef, isEmbedding, embeddingStatus, dbTotals } = usePageContentEmbedding({
      currentPageContent,
      isEmbeddingInitialized,
      isEmbeddingProcessing,
      embedPageContentForTab,
      initialize,
      sessionId,
      currentTabId,
    });

    // Live ref that reflects whether embedding work is active right now
    const embeddingActiveRef = useRef<boolean>(false);
    useEffect(() => {
      embeddingActiveRef.current = Boolean(isEmbedding || isEmbeddingProcessing);
    }, [isEmbedding, isEmbeddingProcessing]);

    // DOM update embedding hook - stores incremental DOM changes
    useDOMUpdateEmbedding({
      latestDOMUpdate,
      isEmbeddingInitialized,
      currentPageContent,
      embedTexts,
      sessionId,
    });

    // Track the previous page URL to detect actual navigation changes
    const previousPageURLRef = useRef<string | null>(null);
    
    // Auto-add current page to selection only when user NAVIGATES to a new page
    // (not when they manually deselect - that should be respected)
    useEffect(() => {
      const currentURL = currentPageContent?.url;
      const previousURL = previousPageURLRef.current;
      
      // Only auto-add if the URL actually changed (user navigated to a new page)
      if (currentURL && currentURL !== previousURL) {
        previousPageURLRef.current = currentURL;
        
        // Add the new page to selection if not already there
        if (!selectedPageURLs.includes(currentURL)) {
          setSelectedPageURLs(prev => {
            if (!prev.includes(currentURL)) {
              return [...prev, currentURL];
            }
            return prev;
          });
        }
      }
    }, [currentPageContent?.url]); // Removed selectedPageURLs from deps - we don't want to re-run when selection changes

    // Agent switching hook - manages agent/model transitions without remounting
    const { activeAgent, activeModel } = useAgentSwitching({
      selectedAgent,
      selectedModel,
      sessionId,
    });


    // Enabled frontend tools hook - fetches which frontend tools are enabled for this agent
    const { enabledFrontendTools, isLoading: isLoadingFrontendTools } = useEnabledFrontendTools({
      agentType: activeAgent,
      modelType: activeModel,
      organizationId: organization?.id,
      teamId: activeTeam || undefined,
    });

    // Track if this is a user-initiated change - ONLY save when user explicitly changes agent/model
    // This ref is set to true ONLY by handleAgentChange/handleModelChange handlers
    const isUserInitiatedChange = useRef(false);

    // Reset user-initiated flag on session change to prevent carryover
    useEffect(() => {
      // Reset flag when session changes - new session should never inherit old flag
      isUserInitiatedChange.current = false;
    }, [sessionId]);

    // Memoize agent/model change handlers
    const handleAgentChange = useCallback((agent: string) => {
      debug.log(`[AGENT_MODEL_SYNC] User changed agent to: ${agent}`);
      isUserInitiatedChange.current = true; // Mark as user-initiated
      setSelectedAgent(agent);
    }, []);

    const handleModelChange = useCallback((model: string) => {
      debug.log(`[AGENT_MODEL_SYNC] User changed model to: ${model}`);
      isUserInitiatedChange.current = true; // Mark as user-initiated
      setSelectedModel(model);
    }, []);

    // Save agent/model selection to storage ONLY when user explicitly changes via UI
    // This prevents saving DB-loaded values back to DB (which was causing contamination)
    useEffect(() => {
      // ONLY save if this was a user-initiated change
      // DB loads, session switches, and initial mounts should NEVER trigger saves
      if (!isUserInitiatedChange.current) {
        // Reduced log level to avoid noise for expected behavior
        // debug.log(`[AGENT_MODEL_SYNC] Skipping save - not a user-initiated change for session ${sessionId}`);
        return;
      }

      debug.log(`[AGENT_MODEL_SYNC] Saving agent/model to DB for session ${sessionId}:`, {
        agent: selectedAgent,
        model: selectedModel,
      });

      // Debounce the save operation
      const timeoutId = setTimeout(() => {
        sessionStorageDBWrapper.updateSessionAgentAndModel(sessionId, selectedAgent, selectedModel);
        isUserInitiatedChange.current = false; // Reset after save
      }, 300); // 300ms debounce

      return () => clearTimeout(timeoutId);
    }, [selectedAgent, selectedModel, sessionId]);

    // Content refresh hook
    const { triggerManualRefresh } = useContentRefresh({
      setCurrentTabId: setManagedTabId,
      setCurrentTabTitle: setManagedTabTitle,
      currentTabTitle: managedTabTitle,
      contentCacheRef,
      fetchFreshPageContent,
      setIsPanelInteractive,
      isPanelInteractive,
      currentTabId,
    });

    /**
     * Enhanced refresh that waits for embeddings to complete
     * Used by the AI agent's refreshPageContent action
     */
    const triggerManualRefreshWithEmbeddingWait = useCallback(async () => {
      debug.log(ts(), '[ChatSessionContainer] Triggering manual refresh with embedding wait...');

      // Trigger the refresh
      await triggerManualRefresh();

      // Phase 1: wait briefly for embedding to START (content fetch -> effect kicks in)
      const maxStartWait = 3000; // 3s grace period to detect start
      const pollInterval = 100; // Check every 100ms for fast detection
      let waited = 0;
      while (!embeddingActiveRef.current && waited < maxStartWait) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        waited += pollInterval;
      }

      // Phase 2: once started, wait until it finishes (cap total to 30s)
      const maxFinishWait = 30000;
      const startTime = Date.now();
      while (embeddingActiveRef.current && Date.now() - startTime < maxFinishWait) {
        debug.log(ts(), '[ChatSessionContainer] Waiting for embeddings to complete...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (embeddingActiveRef.current) {
        debug.log(ts(), '[ChatSessionContainer]  Embeddings still processing after timeout');
      } else {
        debug.log(ts(), '[ChatSessionContainer] Embeddings finished');
      }
    }, [triggerManualRefresh, isEmbedding, isEmbeddingProcessing]);

    // Auto-refresh content when panel becomes active (visible or user interacts)
    const previousIsPanelVisibleRef = useRef(isPanelVisible);
    const previousIsPanelInteractiveRef = useRef(isPanelInteractive);

    // Update refs without triggering fetch (tracked for potential future use)
    useEffect(() => {
      previousIsPanelVisibleRef.current = isPanelVisible;
      previousIsPanelInteractiveRef.current = isPanelInteractive;
    }, [isPanelVisible, isPanelInteractive]);

    // OPTIMIZATION: Removed unnecessary setIsLoading effect (always false)
    // Loading state is now managed directly during mount
    useEffect(() => {
      if (prevSessionIdRef.current !== sessionId) {
        setIsLoading(false);
      }
    }, [sessionId]);

    // Status bar element (compute-only dependencies; avoid embedding refs to prevent rerenders)
    const statusBarElement = useMemo(
      () => (
        <StatusBar
          isLight={isLight}
          isPanelInteractive={isPanelInteractive}
          currentTabId={currentTabId}
          isPanelVisible={isPanelVisible}
          contentState={contentState}
          getCurrentTabTitle={getCurrentTabTitle}
          onRefreshClick={triggerManualRefresh}
          showStaleIndicator={showStaleIndicator}
          isContentFetching={isContentFetching}
          userMessagesCount={userMessagesCount}
          assistantMessagesCount={assistantMessagesCount}
          isCounterReady={isCounterReady}
          isEmbedding={isEmbedding}
          embeddingStatus={embeddingStatus}
          usageData={{
            lastUsage,
            cumulativeUsage,
            isConnected: isUsageConnected,
          }}
          onUsageClick={() => setIsUsagePopupOpen(true)}
          currentPageUrl={managedTabUrl}
        />
      ),
      [
        isLight,
        isPanelInteractive,
        currentTabId,
        isPanelVisible,
        contentState,
        getCurrentTabTitle,
        triggerManualRefresh,
        showStaleIndicator,
        isContentFetching,
        userMessagesCount,
        assistantMessagesCount,
        isCounterReady,
        isEmbedding,
        embeddingStatus,
        lastUsage,
        cumulativeUsage,
        isUsageConnected,
        managedTabUrl,
      ],
    );

    // Notify parent whenever message counts change
    // IMPORTANT: Only report count AFTER hydration completes to prevent flickering from transient zero counts
    // Total count (user + assistant) is reported to parent for backward compatibility
    const totalMessagesCount = userMessagesCount + assistantMessagesCount;
    
    useEffect(() => {
      debug.log(`[ChatSessionContainer] Message count effect triggered for session ${sessionId}:`, {
        userMessagesCount,
        assistantMessagesCount,
        totalMessagesCount,
        hydrationCompleted,
        hasReportedInitialCount: hasReportedInitialCountRef.current,
        willReport: hydrationCompleted && !hasReportedInitialCountRef.current,
      });

      if (!onMessagesCountChange) return;

      // Only report the count once after hydration is fully complete
      // This prevents reporting transient zero counts during restore
      if (hydrationCompleted && !hasReportedInitialCountRef.current) {
        debug.log(
          `[ChatSessionContainer] Reporting message count to parent: ${totalMessagesCount} for session ${sessionId}`,
        );
        onMessagesCountChange(sessionId, totalMessagesCount);
        hasReportedInitialCountRef.current = true;
        lastReportedCountRef.current = totalMessagesCount;
        initialReportTimeRef.current = Date.now();

        // Signal that counter is stable - this will trigger skeleton to hide
        setIsCounterReady(true);
        debug.log(`[ChatSessionContainer] Counter is stable for session ${sessionId}`);
      } else if (hydrationCompleted && hasReportedInitialCountRef.current) {
        // Grace period: Allow count changes within first 500ms after initial report (during hydration settling)
        const timeSinceInitialReport = Date.now() - initialReportTimeRef.current;
        const isInGracePeriod = timeSinceInitialReport < 500;

        // Special case: Always report when count changes significantly
        // This handles: 1) user deleted all messages (0), 2) force-restore after failed clear
        if (totalMessagesCount !== lastReportedCountRef.current) {
          debug.log(
            `[ChatSessionContainer] Reporting count change: ${lastReportedCountRef.current} → ${totalMessagesCount} for session ${sessionId}`,
          );
          onMessagesCountChange(sessionId, totalMessagesCount);
          lastReportedCountRef.current = totalMessagesCount;
          return;
        }

        // Only log if count changed significantly AND we're past the grace period
        const countDiff = Math.abs(totalMessagesCount - (lastReportedCountRef.current || 0));
        if (countDiff > 5 && !isInGracePeriod) {
          debug.warn(
            `[ChatSessionContainer] Significant message count change AFTER initial report (BLOCKED): ${totalMessagesCount} for session ${sessionId.slice(0, 8)} (diff: ${countDiff})`,
          );
        }

        // Update last reported count even during grace period (for future comparisons)
        if (isInGracePeriod) {
          lastReportedCountRef.current = totalMessagesCount;
        }
      }
      // After initial report, do NOT update anymore to prevent flickering
    }, [onMessagesCountChange, sessionId, totalMessagesCount, hydrationCompleted]);

    // Register reset function with parent when available
    // We register a wrapper that always calls the current value of resetChatRef.current
    // This ensures we always call the wrapped version (with manual reset tracking) even if
    // the ref was updated after registration
    useEffect(() => {
      if (onRegisterResetFunction) {
        const resetWrapper = () => {
          if (resetChatRef.current) {
            resetChatRef.current();
          }
        };
        onRegisterResetFunction(sessionId, resetWrapper);
      }
    }, [onRegisterResetFunction, sessionId]);

    // Register save function with parent when available
    useEffect(() => {
      if (onRegisterSaveFunction && handleSaveMessages) {
        onRegisterSaveFunction(sessionId, handleSaveMessages);
      }
    }, [onRegisterSaveFunction, sessionId, handleSaveMessages]);

    // Register load function with parent when available
    useEffect(() => {
      if (onRegisterLoadFunction && handleLoadMessages) {
        onRegisterLoadFunction(sessionId, handleLoadMessages);
      }
    }, [onRegisterLoadFunction, sessionId, handleLoadMessages]);

    // Callback to update message counts (user and assistant separately)
    const handleSetMessageCounts = useCallback(
      (counts: { userCount: number; assistantCount: number }) => {
        setUserMessagesCount(counts.userCount);
        setAssistantMessagesCount(counts.assistantCount);
      },
      [],
    );

    // Callback to update messages signature (for hydration detection)
    const handleMessagesSignatureChange = useCallback(
      (signature: string) => {
        if (messagesSignatureRef.current !== signature) {
          messagesSignatureRef.current = signature;
          setMessagesSignature(signature);
        }
      },
      [],
    );

    // Callback to update streaming state from CopilotKit
    const handleStreamingChange = useCallback(
      (isStreaming: boolean) => {
        setCopilotIsStreaming(isStreaming);
      },
      [],
    );

    // V2 CopilotKitProvider configuration
    const copilotHeaders = useMemo(() => ({
      'x-copilot-agent-type': activeAgent || '',
      'x-copilot-model-type': activeModel || '',
      'x-copilot-thread-id': sessionId,
      ...(organization?.id ? { 'x-copilot-organization-id': organization.id } : {}),
      ...(activeTeam ? { 'x-copilot-team-id': activeTeam } : {}),
    }), [activeAgent, activeModel, sessionId, organization?.id, activeTeam]);

    // V2: Tool renderers - create once and keep stable
    // ActionStatus reads theme from storage directly
    const toolRenderersRef = useRef<ReturnType<typeof createAllToolRenderers> | null>(null);
    if (!toolRenderersRef.current) {
      toolRenderersRef.current = createAllToolRenderers({ clipText });
    }

    // V2: Activity message renderers - recreate when session changes
    // Components now read theme from storage directly, so no need to recreate on theme change
    const lastActivitySessionRef = useRef<string | null>(null);
    const activityRenderersRef = useRef<ReturnType<typeof createActivityMessageRenderers> | null>(null);
    
    // Recreate activity renderers only when session changes
    if (
      !activityRenderersRef.current || 
      lastActivitySessionRef.current !== sessionId
    ) {
      activityRenderersRef.current = createActivityMessageRenderers({
        sessionId,
        setDynamicAgentState: setCurrentAgentStepState,
      });
      lastActivitySessionRef.current = sessionId;
    }

    const renderChatInner = useCallback(
      () => (
        <ChatInner
          // Key only includes session - agent/model changes are handled via props/headers
          // This prevents remounts when switching agents/models
          key={`chat-inner-${sessionId}`}
          sessionId={sessionId}
          currentPageContent={currentPageContent}
          pageContentEmbedding={pageContentEmbeddingRef.current}
          latestDOMUpdate={latestDOMUpdate}
          dbTotals={dbTotals}
          selectedPageURLs={selectedPageURLs}
          currentPageURL={currentPageContent?.url || null}
          onPagesChange={setSelectedPageURLs}
          themeColor={themeColor}
          setThemeColor={setThemeColor}
          saveMessagesToStorage={saveMessagesToStorage}
          setMessageCounts={handleSetMessageCounts}
          saveMessagesRef={saveMessagesRef}
          restoreMessagesRef={restoreMessagesRef}
          resetChatRef={resetChatRef}
          setIsAgentLoading={setIsAgentLoading}
          showSuggestions={showSuggestions}
          showThoughtBlocks={showThoughtBlocks}
          agentModeChat={agentModeChat}
          initialAgentStepState={currentAgentStepState}
          onAgentStepStateChange={setCurrentAgentStepState}
          contextMenuMessage={contextMenuMessage}
          triggerManualRefresh={triggerManualRefreshWithEmbeddingWait}
          isAgentAndModelSelected={selectedAgent !== '' && selectedModel !== ''}
          agentType={activeAgent}
          modelType={activeModel}
          organizationId={organization?.id || undefined}
          teamId={activeTeam || undefined}
          enabledFrontendTools={enabledFrontendTools}
        />
      ),
      [
        activeAgent,
        activeModel,
        activeTeam,
        contextMenuMessage,
        currentAgentStepState,
        currentPageContent,
        dbTotals,
        enabledFrontendTools,
        latestDOMUpdate,
        organization?.id,
        saveMessagesToStorage,
        selectedAgent,
        selectedModel,
        selectedPageURLs,
        setSelectedPageURLs,
        sessionId,
        handleSetMessageCounts,
        setIsAgentLoading,
        setThemeColor,
        showSuggestions,
        showThoughtBlocks,
        agentModeChat,
        themeColor,
        triggerManualRefreshWithEmbeddingWait,
      ],
    );

    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Save/Load buttons and Page Status - Fixed at top */}
        {statusBarElement}

        {/* Stale content notification banner */}
        {showStaleIndicator && isPanelActive && (
          <div
            className={`flex items-center gap-2 px-2 py-1.5 text-xs ${
              isLight
                ? 'border-b border-orange-200 bg-orange-50 text-orange-800'
                : 'border-b border-orange-800 bg-orange-900/20 text-orange-300'
            }`}>
            <svg className="h-3 w-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="flex-1">Page content changed</span>
            <button
              onClick={triggerManualRefresh}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                isLight
                  ? 'bg-orange-100 text-orange-900 hover:bg-orange-200'
                  : 'bg-orange-800 text-orange-100 hover:bg-orange-700'
              }`}>
              Refresh
            </button>
          </div>
        )}

        {/* Chat container */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Note: Agent switching modal removed - switching is now instant without remount */}

          <div
            className={`copilot-chat-container flex flex-1 flex-col overflow-hidden ${!isLight ? 'dark' : ''} font-size-${chatFontSize} transition-opacity duration-300`}
            style={
              {
                '--copilot-kit-primary-color': themeColor,
                opacity: isCounterReady ? 1 : 0,
                visibility: isCounterReady ? 'visible' : 'hidden',
              } as CSSProperties
            }>
            {/* Direct CopilotKitProvider - stable key for performance */}
            {/* Session switching handled internally via reset() in ChatInnerWithSignatureSync */}
            {activeAgent && activeModel ? (
              <CopilotKitProvider
                key="copilot-provider-stable"
                runtimeUrl={COPIOLITKIT_CONFIG.RUNTIME_URL}
                headers={copilotHeaders}
                showDevConsole={false}
                renderToolCalls={toolRenderersRef.current as any}
                renderActivityMessages={activityRenderersRef.current as any}
              >
                <ChatInnerWithSignatureSync
                  sessionId={sessionId}
                  onSignatureChange={handleMessagesSignatureChange}
                  onStreamingChange={handleStreamingChange}
                  renderChatInner={renderChatInner}
                />
              </CopilotKitProvider>
            ) : null}
          </div>

          {/* Agent and Model Selectors with Settings */}
          <SelectorsBar
            isLight={isLight}
            selectedAgent={selectedAgent}
            selectedModel={selectedModel}
            isLoadingSession={isLoadingMetadata || isLoadingFromDB}
            showSuggestions={showSuggestions}
            showThoughtBlocks={showThoughtBlocks}
            onAgentChange={handleAgentChange}
            onModelChange={handleModelChange}
            onShowSuggestionsChange={show => preferencesStorage.setShowSuggestions(show)}
            onShowThoughtBlocksChange={show => preferencesStorage.setShowThoughtBlocks(show)}
            onExpandSettingsClick={() => setIsSettingsOpen(true)}
          />
        </div>

        {/* Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          isLight={isLight}
          showAgentCursor={showAgentCursor}
          showSuggestions={showSuggestions}
          showThoughtBlocks={showThoughtBlocks}
          agentModeChat={agentModeChat}
          agentType={activeAgent}
          modelType={activeModel}
          organizationId={organization?.id || undefined}
          teamId={activeTeam || undefined}
          onClose={() => setIsSettingsOpen(false)}
          onShowAgentCursorChange={show => preferencesStorage.setShowAgentCursor(show)}
          onShowSuggestionsChange={show => preferencesStorage.setShowSuggestions(show)}
          onShowThoughtBlocksChange={show => preferencesStorage.setShowThoughtBlocks(show)}
          onAgentModeChatChange={enabled => preferencesStorage.setAgentModeChat(enabled)}
        />

        {/* Usage Popup */}
        <UsagePopup
          isOpen={isUsagePopupOpen}
          onClose={() => setIsUsagePopupOpen(false)}
          lastUsage={lastUsage}
          cumulativeUsage={cumulativeUsage}
          isConnected={isUsageConnected}
          isLight={isLight}
          onReset={resetCumulative}
          sessionId={sessionId}
        />
      </div>
    );
  },
  // Custom comparison function to prevent unnecessary re-renders
  (prevProps, nextProps) => {
    // Only re-render if these specific props change
    return (
      prevProps.sessionId === nextProps.sessionId &&
      prevProps.isLight === nextProps.isLight &&
      prevProps.publicApiKey === nextProps.publicApiKey &&
      prevProps.isActive === nextProps.isActive &&
      prevProps.contextMenuMessage === nextProps.contextMenuMessage
      // Note: We intentionally don't compare callback props as they're stable
    );
  },
);

ChatSessionContainer.displayName = 'ChatSessionContainer';
