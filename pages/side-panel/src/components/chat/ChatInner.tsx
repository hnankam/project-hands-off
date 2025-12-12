/**
 * ================================================================================
 * ChatInner Component
 * ================================================================================
 *
 * Core chat interface component that integrates CopilotKit for AI agent interactions.
 * Handles all agent actions, semantic search, message management, and UI state.
 *
 * Key Responsibilities:
 * - AI agent communication via CopilotKit hooks
 * - Semantic search over page content (HTML, forms, clickable elements)
 * - DOM manipulation actions (click, scroll, input, etc.)
 * - Message sanitization and persistence
 * - Progress bar and agent state management
 * - Context menu integration
 *
 * Architecture:
 * - Custom hooks for state management (useMessageSanitization, useContextMenuPrefill, etc.)
 * - CopilotKit actions for agent capabilities
 * - SemanticSearchManager for embeddings-based search
 * - Message persistence via storage layer
 *
 * @module ChatInner
 * ================================================================================
 */

// ================================================================================
// IMPORTS
// ================================================================================

import type { FC } from 'react';
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';

// Centralized CopilotKit Hooks, Components & Types (v2 migration ready)
import {
  // Components
  CopilotChat,
  // Types
  type InputProps,
  type MessagesProps,
  // Hooks
  useCopilotChat,
  useCopilotReadableData,
  useCopilotSuggestions,
  // Tool hooks (centralized for v2 migration)
  useFrontendTool,
  useHumanInTheLoop,
} from '../../hooks/copilotkit';

// Extension Utilities & Storage
import { debug, useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { cn } from '@extension/ui';

// UI Components
import type { AgentStepState } from '../cards/TaskProgressCard';
// Note: Graph state rendering is handled by renderActivityMessages at Provider level
// Custom components available for future use after V2 styles import:
// import { CustomUserMessage } from './CustomUserMessage';
// import { CustomAssistantMessage } from './CustomAssistantMessage';
import { CustomInput } from './CustomInput';
import { CustomMessages } from './CustomMessages';
import { ThinkingBlock } from './ThinkingBlock';
import { MermaidBlock } from './MermaidBlock';
import { ChatErrorDisplay } from './ChatErrorDisplay';
import { CustomAssistantMessageV2 } from './CustomAssistantMessageV2';
import { CustomUserMessageV2 } from './CustomUserMessageV2';
import { 
  CustomScrollToBottomButton,
  CustomFeather,
  CustomDisclaimer,
  CustomSuggestionView,
} from './slots';

// Custom Hooks
import { useMessageSanitization, MessageData } from '../../hooks/useMessageSanitization';
import { useContextMenuPrefill } from '../../hooks/useContextMenuPrefill';
import { useProgressBarState } from '../../hooks/useProgressBarState';
import type { PageContent } from '../../hooks/usePageMetadata';
import { useMultiPageMetadata } from '../../hooks/useMultiPageMetadata';
import { useProgressCardCollapse } from '../../hooks/useProgressCardCollapse';

// Context
import { ChatSessionIdProvider } from '../../context/ChatSessionIdContext';
import { useAgentStateManagement } from '../../hooks/useAgentStateManagement';

// Utilities
import {
  runCachedSanitization,
  applySanitizationIfChanged,
  filterValidMessages,
  findLastMessageByRole,
  computeMessagesSignature,
} from '../../utils/sanitizationHelper';

// Constants
import { CHAT_SUGGESTIONS_INSTRUCTIONS } from '../../constants/chatSuggestions';

// CopilotKit Action Creators
import {
  createSearchPageContentAction,
  createSearchFormDataAction,
  createSearchDOMUpdatesAction,
  createSearchClickableElementsAction,
} from '../../actions/copilot/searchActions';
import {
  createGetHtmlChunksByRangeAction,
  createGetFormChunksByRangeAction,
  createGetClickableChunksByRangeAction,
} from '../../actions/copilot/dataRetrievalActions';
import {
  createMoveCursorToElementAction,
  createRefreshPageContentAction,
  createCleanupExtensionUIAction,
  createClickElementAction,
  createVerifySelectorAction,
  createGetSelectorAtPointAction,
  createGetSelectorsAtPointsAction,
  createSendKeystrokesAction,
} from '../../actions/copilot/domActions';
import { createInputDataAction } from '../../actions/copilot/formActions';
import {
  createOpenNewTabAction,
  createScrollAction,
  createDragAndDropAction,
} from '../../actions/copilot/navigationActions';
import { createTakeScreenshotAction } from '../../actions/copilot/screenshotActions';
import { createWaitAction, createConfirmActionHumanInTheLoop } from '../../actions/copilot/utilityActions';
// Note: Backend tool renderers are configured at CopilotKitProvider level via
// renderToolCalls prop. See ChatSessionContainer.tsx and builtinToolActions.tsx.

// Types & Libraries
import { SemanticSearchManager } from '../../lib/SemanticSearchManager';

// Empty component for hiding thinking blocks
const EmptyThinkingBlock: React.FC<{ children?: React.ReactNode }> = () => null;

// ================================================================================
// TYPES & INTERFACES
// ================================================================================

export interface ChatInnerProps {
  sessionId: string;
  // Removed: sessionTitle (was never used in the component)
  currentPageContent: PageContent | null;
  dbTotals?: { html: number; form: number; click: number };
  pageContentEmbedding?: {
    fullEmbedding: number[];
    chunks?: Array<{ text: string; html: string; embedding: number[] }>;
    timestamp: number;
  } | null;
  latestDOMUpdate: unknown;
  selectedPageURLs: string[];
  currentPageURL: string | null;
  onPagesChange: (urls: string[]) => void;
  themeColor: string;
  setThemeColor: (color: string) => void;
  saveMessagesToStorage: (messages: unknown[]) => Promise<void>;
  setMessageCounts: (counts: { userCount: number; assistantCount: number }) => void;
  saveMessagesRef: React.MutableRefObject<(() => MessageData) | null>;
  restoreMessagesRef: React.MutableRefObject<((messages: unknown[]) => void) | null>;
  resetChatRef: React.MutableRefObject<(() => void) | null>;
  setIsAgentLoading: (loading: boolean) => void;
  showSuggestions: boolean;
  showThoughtBlocks: boolean;
  agentModeChat: boolean;
  onProgressBarStateChange?: (hasProgressBar: boolean, showProgressBar: boolean, onToggle: () => void) => void;
  initialAgentStepState?: AgentStepState;
  onAgentStepStateChange?: (state: AgentStepState) => void;
  contextMenuMessage?: string | null;
  triggerManualRefresh?: () => void;
  isAgentAndModelSelected?: boolean;
  agentType?: string;
  modelType?: string;
  organizationId?: string;
  teamId?: string;
  /** Set of enabled frontend tool names. If undefined, all tools are enabled. */
  enabledFrontendTools?: Set<string>;
}

// ================================================================================
// COMPONENT DEFINITION
// ================================================================================

const ChatInnerComponent: FC<ChatInnerProps> = ({
  sessionId,
  // Removed: sessionTitle (was never used)
  currentPageContent,
  pageContentEmbedding,
  latestDOMUpdate,
  selectedPageURLs,
  currentPageURL,
  onPagesChange,
  themeColor,
  setThemeColor,
  saveMessagesToStorage,
  setMessageCounts,
  saveMessagesRef,
  restoreMessagesRef,
  resetChatRef,
  setIsAgentLoading,
  showSuggestions,
  showThoughtBlocks,
  agentModeChat,
  onProgressBarStateChange,
  initialAgentStepState,
  onAgentStepStateChange,
  contextMenuMessage,
  dbTotals,
  triggerManualRefresh,
  isAgentAndModelSelected = true,
  enabledFrontendTools,
}) => {
  // ================================================================================
  // THEME & STORAGE
  // ================================================================================
  const { isLight } = useStorage(themeStorage);

  // ================================================================================
  // REFS FOR STABLE COMPONENT IDENTITY
  // ================================================================================
  // These refs prevent ScopedInput from being recreated when page selection changes,
  // which would cause PagesSelector to remount and lose its isOpen state
  const selectedPageURLsRef = useRef(selectedPageURLs);
  const currentPageURLRef = useRef(currentPageURL);
  const onPagesChangeRef = useRef(onPagesChange);

  // Keep refs updated with latest values
  selectedPageURLsRef.current = selectedPageURLs;
  currentPageURLRef.current = currentPageURL;
  onPagesChangeRef.current = onPagesChange;

  // ================================================================================
  // STATE MANAGEMENT
  // ================================================================================

  // Store embeddings and content for semantic search (not sent to agent)
  const pageDataRef = useRef<{
    embeddings: {
      fullEmbedding: number[];
      chunks?: Array<{ text: string; html: string; embedding: number[] }>;
      timestamp: number;
    } | null;
    pageContent: unknown;
  }>({
    embeddings: null,
    pageContent: null,
  });

  // Semantic search manager for embeddings-based queries
  const searchManager = useMemo(() => new SemanticSearchManager(pageDataRef), []);

  // ================================================================================
  // COPILOTKIT HOOKS
  // ================================================================================

  const { messages, setMessages, isLoading, reloadMessages, reset, stopGeneration } =
    useCopilotChat();

  // Track streaming state to avoid restoring messages after edits/deletes
  const wasStreamingRef = useRef(false);

  // Loading state ref for callbacks
  const isLoadingRef = useRef(false);

  // ================================================================================
  // CUSTOM HOOKS
  // ================================================================================

  // Agent state management (extracted to hook)
  const { dynamicAgentState, setDynamicAgentState, latestAssistantMessageIdRef } = useAgentStateManagement({
    sessionId,
    messages,
    initialAgentStepState,
    onAgentStepStateChange,
  });

  // Totals for DB-backed counts (HTML, form, clickable element chunks)
  const [totals, setTotals] = useState<{ html: number; form: number; click: number }>({ html: 0, form: 0, click: 0 });

  // ================================================================================
  // EFFECTS & SIDE EFFECTS
  // ================================================================================

  // Update parent component with loading state
  useEffect(() => {
    setIsAgentLoading(isLoading);
    isLoadingRef.current = isLoading;
  }, [isLoading, setIsAgentLoading]);

  // Expose reset function via ref
  useEffect(() => {
    if (resetChatRef) {
      resetChatRef.current = reset;
    }
  }, [reset, resetChatRef]);

  // Clear streaming flag when messages are cleared
  useEffect(() => {
    if (messages.length === 0) {
      wasStreamingRef.current = false;
    }
  }, [messages.length]);

  // Persist immediately when messages are removed (e.g., user deletion)
  // NOTE: All persistence goes through useMessagePersistence.saveMessagesToStorage
  const previousMessageCountRef = useRef(messages.length);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

    if (isLoading || messages.length >= previousCount) {
      return;
    }

    try {
      const data = saveMessagesRef?.current ? saveMessagesRef.current() : null;
      const sanitizedMessages =
        (data && Array.isArray(data.allMessages) && data.allMessages.length >= 0 ? data.allMessages : messages) ?? [];

      // Always use saveMessagesToStorage (from useMessagePersistence) for persistence
      // This ensures consistent data handling and prevents race conditions
      void saveMessagesToStorage(sanitizedMessages as unknown[]);
    } catch (error) {
      debug.warn?.('[ChatInner] Failed to persist messages after deletion:', error);
    }
  }, [messages, isLoading, saveMessagesRef, saveMessagesToStorage]);

  // Comprehensive ref cleanup on session change
  useEffect(() => {
    debug.log('[ChatInner] Session changed, cleaning up refs');

    cachedSanitizedRef.current = null;
    wasStreamingRef.current = false;
    pageDataRef.current = { embeddings: null, pageContent: null };
    previousMessageCountRef.current = 0;

    debug.log('[ChatInner] Ref cleanup complete');
  }, [sessionId]);

  // Adopt embed-time totals from container if available
  useEffect(() => {
    if (dbTotals && (dbTotals.html || dbTotals.form || dbTotals.click)) {
      setTotals(dbTotals);
      debug.log('[ChatInner] Adopted embed-time totals:', dbTotals);
    }
  }, [dbTotals?.html, dbTotals?.form, dbTotals?.click]);

  // Context menu prefill handling
  useContextMenuPrefill(sessionId, contextMenuMessage);

  // Add/remove class to body to hide suggestions via CSS
  useEffect(() => {
    if (!showSuggestions) {
      document.body.classList.add('hide-copilot-suggestions');
    } else {
      document.body.classList.remove('hide-copilot-suggestions');
    }

    return () => {
      document.body.classList.remove('hide-copilot-suggestions');
    };
  }, [showSuggestions]);

  // ========================================
  // MESSAGE SANITIZATION & FILTERING
  // ========================================
  const { filteredMessages, sanitizeMessages, cachedSanitizedRef } = useMessageSanitization(
    messages,
    setMessages,
    saveMessagesRef,
    restoreMessagesRef,
    setMessageCounts,
  );

  // Update pageDataRef when embeddings or content changes
  useEffect(() => {
    pageDataRef.current.embeddings = pageContentEmbedding || null;
    pageDataRef.current.pageContent = currentPageContent;
  }, [pageContentEmbedding, currentPageContent]);

  // ================================================================================
  // PAGE METADATA
  // ================================================================================

  // Multi-page metadata for enhanced agent context (includes current page metadata)
  const multiPageMetadata = useMultiPageMetadata({
    selectedPageURLs,
    currentPageURL,
    currentPageContent,
    pageContentEmbedding,
    currentPageTotals: totals,
    enableLogging: false,
  });

  // Share multi-page metadata with agent (includes current page + selected pages)
  useCopilotReadableData({
    description:
      'Multi-page context including current page (full metadata) and selected indexed pages (lightweight summaries). Current page: pageTitle, pageURL, hasContent, hasEmbeddings, totalHtmlChunks, totalFormChunks, totalClickableChunks, documentInfo, windowInfo. Selected pages: array of page summaries with URL, title, chunk counts, lastIndexed. Use searchPageContent to query current page content. Additional pages provide context awareness.',
    value: multiPageMetadata,
  });

  // ================================================================================
  // HELPER FUNCTIONS
  // ================================================================================

  const clipText = useCallback((v: unknown, n: number = 60) => {
    const s = typeof v === 'string' ? v : String(v ?? '');
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  }, []);

  const yesNo = useCallback((b: unknown) => (b ? 'yes' : 'no'), []);

  /**
   * Check if a frontend tool is enabled based on agent configuration.
   * If enabledFrontendTools is undefined, all tools are enabled (default behavior).
   */
  const isToolEnabled = useCallback(
    (toolName: string): boolean => {
      return enabledFrontendTools === undefined || enabledFrontendTools.has(toolName);
    },
    [enabledFrontendTools],
  );

  /**
   * Wrap a tool configuration to set its availability based on agent config.
   * Uses CopilotKit's `available` property to control tool visibility.
   * See: https://docs.copilotkit.ai/reference/hooks/useFrontendTool
   */
  const wrapToolConfig = useCallback(
    <T extends { name: string }>(config: T): T & { available: 'enabled' | 'disabled' } => {
      return {
        ...config,
        available: isToolEnabled(config.name) ? 'enabled' : 'disabled',
      };
    },
    [isToolEnabled],
  );

  // ================================================================================
  // COPILOTKIT ACTIONS
  // ================================================================================
  // Note: Default tool rendering is now handled by renderToolCalls at Provider level
  // See ChatSessionContainer.tsx - createAllToolRenderers includes wildcard '*' renderer

  const actionDeps = useMemo(
    () => ({
      searchManager,
      isLight,
      clipText,
      yesNo,
      currentPageContent,
      pageDataRef,
      themeColor,
      selectedPageURLs,
    }),
    [searchManager, isLight, clipText, yesNo, currentPageContent, themeColor, selectedPageURLs],
  );

  // Search Actions - conditionally enabled based on agent config
  useFrontendTool(
    wrapToolConfig(createSearchPageContentAction(actionDeps)) as any,
    [actionDeps, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createSearchFormDataAction(actionDeps)) as any,
    [actionDeps, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createSearchDOMUpdatesAction(actionDeps)) as any,
    [actionDeps, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createSearchClickableElementsAction(actionDeps)) as any,
    [actionDeps, wrapToolConfig],
  );

  // Data Retrieval Actions - conditionally enabled based on agent config
  const retrievalDeps = useMemo(() => ({ currentPageContent, isLight }), [currentPageContent, isLight]);
  useFrontendTool(
    wrapToolConfig(createGetHtmlChunksByRangeAction(retrievalDeps)) as any,
    [retrievalDeps, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createGetFormChunksByRangeAction(retrievalDeps)) as any,
    [retrievalDeps, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createGetClickableChunksByRangeAction(retrievalDeps)) as any,
    [retrievalDeps, wrapToolConfig],
  );

  // DOM Manipulation Actions - conditionally enabled based on agent config
  const domDeps = useMemo(
    () => ({ isLight, clipText, pageDataRef, triggerManualRefresh }),
    [isLight, clipText, triggerManualRefresh],
  );
  useFrontendTool(
    wrapToolConfig(createMoveCursorToElementAction({ isLight, clipText })) as any,
    [domDeps, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(
      createRefreshPageContentAction({ isLight, pageDataRef, triggerManualRefresh }),
    ) as any,
    [domDeps, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createCleanupExtensionUIAction({ isLight })) as any,
    [isLight, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createClickElementAction({ isLight, clipText })) as any,
    [domDeps, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createVerifySelectorAction({ isLight, clipText })) as any,
    [domDeps, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createGetSelectorAtPointAction({ isLight })) as any,
    [isLight, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createGetSelectorsAtPointsAction({ isLight })) as any,
    [isLight, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createSendKeystrokesAction({ isLight, clipText })) as any,
    [domDeps, wrapToolConfig],
  );

  // Form Actions - conditionally enabled based on agent config
  useFrontendTool(
    wrapToolConfig(createInputDataAction({ isLight, clipText })) as any,
    [isLight, clipText, wrapToolConfig],
  );

  // Navigation Actions - conditionally enabled based on agent config
  useFrontendTool(
    wrapToolConfig(createOpenNewTabAction({ isLight, clipText })) as any,
    [isLight, clipText, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createScrollAction({ isLight, clipText, yesNo })) as any,
    [isLight, clipText, yesNo, wrapToolConfig],
  );
  useFrontendTool(
    wrapToolConfig(createDragAndDropAction({ isLight, clipText })) as any,
    [isLight, clipText, wrapToolConfig],
  );

  // Screenshot Actions - conditionally enabled based on agent config
  useFrontendTool(
    wrapToolConfig(createTakeScreenshotAction({ isLight })) as any,
    [isLight, wrapToolConfig],
  );

  // Utility Actions - conditionally enabled based on agent config
  useFrontendTool(
    wrapToolConfig(createWaitAction({ isLight })) as any,
    [isLight, wrapToolConfig],
  );

  // Human in the Loop - conditionally enabled based on agent config
  // Uses CopilotKit's `available` property for proper tool visibility control
  const confirmActionConfig = useMemo(
    () => {
      const config = createConfirmActionHumanInTheLoop({ isLight });
      const isEnabled = enabledFrontendTools === undefined || enabledFrontendTools.has('confirmAction');
      return {
        ...config,
        available: isEnabled ? ('enabled' as const) : ('disabled' as const),
      };
    },
    [isLight, enabledFrontendTools],
  );
  useHumanInTheLoop(confirmActionConfig as Parameters<typeof useHumanInTheLoop>[0]);

  // ================================================================================
  // AGENT STATE RENDERING - Handled by renderActivityMessages at Provider level
  // ================================================================================
  // V2: Agent state (plan/graph) is now rendered via CopilotKitProvider's
  // renderActivityMessages prop. See ChatSessionContainer.tsx.

  // Auto-collapse older progress cards
  useProgressCardCollapse();

  // ================================================================================
  // CHAT SUGGESTIONS
  // ================================================================================
  // Note: Hook must be called unconditionally per React rules.
  // We control behavior via the enabled parameter.
  useCopilotSuggestions({
    enabled: showSuggestions,
    instructions: CHAT_SUGGESTIONS_INSTRUCTIONS,
  });

  // ================================================================================
  // PROGRESS BAR STATE
  // ================================================================================

  const hasProgressBar = dynamicAgentState.steps && dynamicAgentState.steps.length > 0;
  const { showProgressBar, toggleProgressBar: toggleProgressBarFn } = useProgressBarState(
    hasProgressBar,
    onProgressBarStateChange,
  );

  // ================================================================================
  // COMPONENT CONFIGURATION
  // ================================================================================

  const customMarkdownTagRenderers = useMemo(
    () => ({
      think: showThoughtBlocks ? ThinkingBlock : EmptyThinkingBlock,
      thinking: showThoughtBlocks ? ThinkingBlock : EmptyThinkingBlock,
      mermaid: MermaidBlock,
    }),
    [showThoughtBlocks],
  );

  // Scoped Input component - receives InputProps from CopilotChat
  // NOTE: selectedPageURLs, onPagesChange, currentPageURL are accessed via refs to prevent
  // component remounting when page selection changes (which would reset PagesSelector's isOpen state)
  const ScopedInput = useMemo(() => {
    const Comp = (props: InputProps) => (
      <CustomInput
        {...props}
        listenSessionId={sessionId}
        isAgentAndModelSelected={isAgentAndModelSelected}
        taskProgressState={dynamicAgentState}
        onTaskProgressStateChange={setDynamicAgentState}
        showTaskProgress={showProgressBar}
        sessionId={sessionId}
        onToggleTaskProgress={toggleProgressBarFn}
        selectedPageURLs={selectedPageURLsRef.current}
        onSelectedPageURLsChange={urls => onPagesChangeRef.current?.(urls)}
        currentPageURL={currentPageURLRef.current}
      />
    );
    return Comp;
  }, [
    sessionId,
    isAgentAndModelSelected,
    dynamicAgentState,
    setDynamicAgentState,
    showProgressBar,
    toggleProgressBarFn,
  ]);

  // ================================================================================
  // EVENT HANDLERS
  // ================================================================================

  /**
   * Handle message submission
   *
   * NOTE: Sanitization disabled on submit - only runs when streaming ends
   * Auto-save is still active to persist user messages immediately
   */
  const handleSubmitMessage = useCallback(
    (message: string) => {
      debug.log('[ChatInner] User submitted message');

      // COMMENTED OUT: Sanitization on submit - only sanitize when streaming ends
      // try {
      //   const current = messages || [];
      //   const result = runCachedSanitization(current, cachedSanitizedRef, sanitizeMessages as (msgs: unknown[]) => { messages: unknown[]; hasChanges: boolean });
      //
      //   if (result.hasChanges) {
      //     const currentSignature = computeMessagesSignature(current);
      //     applySanitizationIfChanged(result, currentSignature, setMessages);
      //   }
      // } catch (e) {
      //   debug.warn?.('[ChatInner] onSubmit sanitization skipped:', e);
      // }

      // ACTIVE: Auto-save shortly after submit (without sanitization)
      setTimeout(() => {
        try {
          const fn = saveMessagesRef?.current;
          if (!fn) return;
          const data = fn();
          const all = (data && data.allMessages) || [];
          if (all.length > 0) {
            void saveMessagesToStorage(all as unknown[]);
          }
        } catch (e) {
          debug.warn?.('[ChatInner] Auto-save after submit failed:', e);
        }
      }, 100);
    },
    [saveMessagesRef, saveMessagesToStorage],
  );

  /**
   * Handle progress state changes
   */
  const handleInProgress = useCallback(
    async (inProgress: boolean) => {
      if (inProgress) {
        wasStreamingRef.current = true;
        return;
      }

      if (!wasStreamingRef.current) {
        return;
      }

      wasStreamingRef.current = false;

      try {
        const fn = saveMessagesRef?.current;
        if (!fn) return;

        const data = fn();
        const all = (data && data.allMessages) || [];

        const result = runCachedSanitization(
          all,
          cachedSanitizedRef,
          sanitizeMessages as (msgs: unknown[]) => { messages: unknown[]; hasChanges: boolean },
        );

        if (result.hasChanges) {
          const currentSignature = computeMessagesSignature(all);
          applySanitizationIfChanged(result, currentSignature, setMessages);
        }

        if (all.length > 0) {
          void saveMessagesToStorage(all as unknown[]);
        }
        // Note: V2 suggestions are generated automatically via useConfigureSuggestions
      } catch (e) {
        debug.warn?.('[ChatInner] Auto-save on stop failed:', e);
      }
    },
    [
      saveMessagesRef,
      saveMessagesToStorage,
      cachedSanitizedRef,
      sanitizeMessages,
      setMessages,
    ],
  );

  /**
   * Handle error display with retry functionality
   */
  const renderError = useCallback(
    (err: { message: string; operation?: string }) => {
      const { message, operation } = err;
      const error = new Error(operation ? `${operation}: ${message}` : message);
      error.name = operation || 'Error';

      const handleRetry = () => {
        debug.log('[ChatInner] Retrying...');

        const currentMessages = messages || [];
        let sanitizedMessagesArr: unknown[] = currentMessages;

        try {
          const result = runCachedSanitization(
            currentMessages,
            cachedSanitizedRef,
            sanitizeMessages as (msgs: unknown[]) => { messages: unknown[]; hasChanges: boolean },
          );
          sanitizedMessagesArr = result.messages;

          if (result.hasChanges) {
            const currentSignature = computeMessagesSignature(currentMessages);
            const newSignature = computeMessagesSignature(result.messages);
            if (newSignature !== currentSignature) {
              setMessages(result.messages as typeof messages);
            }
          }
        } catch (err) {
          debug.warn?.('[ChatInner] Failed to sanitize before retry:', err);
        }

        const validMessages = filterValidMessages(sanitizedMessagesArr);

        if (validMessages.length === 0) {
          debug.error('[ChatInner] No valid messages to reload');
          return;
        }

        const lastAssistant = findLastMessageByRole(validMessages, 'assistant');
        if (lastAssistant?.id) {
          debug.log('[ChatInner] Reloading from assistant message:', lastAssistant.id);
          reloadMessages(lastAssistant.id);
        } else {
          const lastUser = findLastMessageByRole(validMessages, 'user');
          if (lastUser?.id) {
            debug.log('[ChatInner] Reloading from user message:', lastUser.id);
            reloadMessages(lastUser.id);
          } else {
            debug.warn?.('[ChatInner] No valid message found to reload');
          }
        }
      };

      return <ChatErrorDisplay error={error} retry={handleRetry} isLight={isLight} autoDismissMs={15000} />;
    },
    [isLight, reloadMessages, messages, sanitizeMessages, cachedSanitizedRef, setMessages],
  );

  /**
   * Custom Messages wrapper - receives MessagesProps from CopilotChat
   */
  const MessagesComponent = useCallback(
    (props: MessagesProps) => <CustomMessages {...props} agentMode={agentModeChat} />,
    [agentModeChat],
  );

  // ================================================================================
  // RENDER
  // ================================================================================

  return (
    <ChatSessionIdProvider sessionId={sessionId}>
      <div className="flex h-full flex-col overflow-hidden">
        <div
          className={cn(
            'copilot-chat-wrapper relative min-h-0 flex-1 overflow-hidden',
            !isAgentAndModelSelected && 'chat-input-disabled',
          )}>
          <CopilotChat
            agentId="dynamic_agent"
            threadId={sessionId}
            messageView={{
              assistantMessage: CustomAssistantMessageV2,
              userMessage: CustomUserMessageV2,
            }}
            chatView={{
              scrollToBottomButton: CustomScrollToBottomButton,
              feather: CustomFeather,
              disclaimer: CustomDisclaimer,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              suggestionView: CustomSuggestionView as any,
            }}
          />
        </div>
      </div>
    </ChatSessionIdProvider>
  );
};

export const ChatInner = React.memo(ChatInnerComponent);
