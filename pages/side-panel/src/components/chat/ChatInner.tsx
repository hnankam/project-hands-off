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
  useAgentWithErrorBanner, // v1.5+ automatic error detection
  // Tool hooks (centralized for v2 migration)
  useFrontendTool,
  useHumanInTheLoop,
} from '../../hooks/copilotkit';

// Extension Utilities & Storage
import { debug, useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { cn } from '@extension/ui';

// UI Components
import type { AgentStepState } from '../cards';
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
import { CustomInputV2, PageSelectorProvider } from './CustomInputV2';
import { 
  CustomScrollToBottomButton,
  CustomFeather,
  CustomDisclaimer,
  CustomSuggestionView,
  CustomCursor,
  CustomInputContainer,
} from './slots';

// Custom Hooks
import { useMessageSanitization, MessageData } from '../../hooks/useMessageSanitization';
import { useContextMenuPrefill } from '../../hooks/useContextMenuPrefill';
import { useProgressBarState } from '../../hooks/useProgressBarState';
import type { PageContent } from '../../hooks/usePageMetadata';
import { useMultiPageMetadata } from '../../hooks/useMultiPageMetadata';
import { useProgressCardCollapse } from '../../hooks/useProgressCardCollapse';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';

// Context
import { ChatSessionIdProvider } from '../../context/ChatSessionIdContext';
import { useAgentStateManagement } from '../../hooks/useAgentStateManagement';
import { useAuth } from '../../context/AuthContext';

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

// Conditional readable data components
const SelectedNotesContext: React.FC<{ notes: any[] }> = ({ notes }) => {
  useCopilotReadableData({
    description:
      'User-selected workspace notes with full content. These are the notes the user explicitly selected to add as context. Use this information directly when answering questions.',
    value: {
      selectedNotes: notes.map(note => ({
        id: note.id,
        title: note.title,
        content: note.content,
        folder: note.folder,
        tags: note.tags,
        updated: note.updated_at,
      })),
    },
  });
  return null;
};

const SelectedCredentialsContext: React.FC<{ credentials: any[] }> = ({ credentials }) => {
  useCopilotReadableData({
    description:
      'User-selected credentials (API keys, passwords, tokens). These are sensitive credentials the user explicitly selected to add as context for API calls or authentication. Handle with care.',
    value: {
      selectedCredentials: credentials.map(cred => ({
        id: cred.id,
        name: cred.name,
        type: cred.type,
        key: cred.key,
        password: cred.password,
      })),
    },
  });
  return null;
};

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
  selectedPageURLs: string[];
  currentPageURL: string | null;
  onPagesChange: (urls: string[]) => void;
  themeColor: string;
  setThemeColor: (color: string) => void;
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
  /** Ref to expose setDynamicAgentState for activity renderers */
  setDynamicAgentStateRef?: React.MutableRefObject<((state: AgentStepState) => void) | null>;
  contextMenuMessage?: string | null;
  triggerManualRefresh?: () => void;
  isAgentAndModelSelected?: boolean;
  agentType?: string;
  modelType?: string;
  organizationId?: string;
  teamId?: string;
  /** Set of enabled frontend tool names. If undefined, all tools are enabled. */
  enabledFrontendTools?: Set<string>;
  // Workspace context items
  selectedNotes?: any[];
  selectedCredentials?: any[];
  selectedFiles?: any[];
  onNotesChange?: (notes: any[]) => void;
  onCredentialsChange?: (credentials: any[]) => void;
  onFilesChange?: (files: any[]) => void;
}

// ================================================================================
// COMPONENT DEFINITION
// ================================================================================

const ChatInnerComponent: FC<ChatInnerProps> = ({
  sessionId,
  // Removed: sessionTitle (was never used)
  currentPageContent,
  pageContentEmbedding,
  selectedPageURLs,
  currentPageURL,
  onPagesChange,
  themeColor,
  setThemeColor,
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
  setDynamicAgentStateRef,
  contextMenuMessage,
  dbTotals,
  triggerManualRefresh,
  isAgentAndModelSelected = true,
  enabledFrontendTools,
  selectedNotes = [],
  selectedCredentials = [],
  selectedFiles = [],
  onNotesChange,
  onCredentialsChange,
  onFilesChange,
}) => {
  // ================================================================================
  // THEME & STORAGE
  // ================================================================================
  const { isLight } = useStorage(themeStorage);

  // ================================================================================
  // AGENT ERROR SUBSCRIPTION (v1.5+ Automatic Error Detection)
  // ================================================================================
  
  // Automatic error detection via agent event subscription
  // Replaces manual renderError callback that was never connected
  const { error: agentError, handleRetry: handleAgentRetry, handleDismiss: handleAgentDismiss } = useAgentWithErrorBanner({
    agentId: 'dynamic_agent',
    errorBannerAutoDismissMs: 15000,
    debug: process.env.NODE_ENV === 'development',
    
    // Retry logic: reload last assistant or user message
    onRetry: () => {
      debug.log('[ChatInner] Error retry triggered');
      
      const currentMessages = messages || [];
      let sanitizedMessagesArr: unknown[] = currentMessages;

      // Sanitize messages before retry
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

      // Find last message to reload
      const validMessages = filterValidMessages(sanitizedMessagesArr);

      if (validMessages.length === 0) {
        debug.error('[ChatInner] No valid messages to reload');
        return;
      }

      // Try last assistant message first, then last user message
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
    },
    
    // Log errors for analytics/monitoring
    onError: (error) => {
      // ============================================================================
      // SPECIFIC filter for anyio cancel scope errors (backup safety net)
      const errorMsg = error.error.message || '';
      const lowerMsg = errorMsg.toLowerCase();
      
      const isAnyCancelScopeError = 
        (lowerMsg.includes('attempted to exit') && lowerMsg.includes('cancel scope')) ||
        (lowerMsg.includes('exit cancel scope') && lowerMsg.includes('different task'));
      
      if (isAnyCancelScopeError) {
        debug.log('[ChatInner] ✅ Filtered anyio cancel scope error (backup filter)');
        return; // Don't log or track - this is expected
      }
      
      // Log all other errors for debugging and analytics
      debug.error('[ChatInner] Agent error occurred:', errorMsg, error.code);
      // Could send to error tracking service here
      // trackError('agent_run_failed', { message: error.error.message, code: error.code });
    },
  });

  // ================================================================================
  // AUTH CONTEXT
  // ================================================================================
  const { user, organization, member } = useAuth();

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

  // Expose setDynamicAgentState via ref for activity renderers
  useEffect(() => {
    if (setDynamicAgentStateRef) {
      setDynamicAgentStateRef.current = setDynamicAgentState;
    }
  }, [setDynamicAgentState, setDynamicAgentStateRef]);

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

  // Note: Message persistence is handled automatically by CopilotKit v1.50 via PostgresAgentRunner
  // No manual persistence needed when messages are deleted

  // Comprehensive ref cleanup on session change
  useEffect(() => {
    debug.log('[ChatInner] Session changed, cleaning up refs');

    cachedSanitizedRef.current = null;
    wasStreamingRef.current = false;
    pageDataRef.current = { embeddings: null, pageContent: null };

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
    enableLogging: true,
  });

  // Share multi-page metadata with agent (includes current page + selected pages)
  useCopilotReadableData({
    description:
      'Multi-page context including current page (full metadata) and selected indexed pages (lightweight summaries). Current page: pageTitle, pageURL, hasContent, hasEmbeddings, totalHtmlChunks, totalFormChunks, totalClickableChunks, documentInfo, windowInfo. Selected pages: array of page summaries with URL, title, chunk counts, lastIndexed. Use searchPageContent to query current page content. Additional pages provide context awareness.',
    value: multiPageMetadata,
  });

  // ================================================================================
  // WORKSPACE CONTEXT
  // ================================================================================

  const { context: workspaceContext } = useWorkspaceContext();

  // Add user details to context
  useCopilotReadableData({
    description:
      'Current authenticated user information including personal details, organization, and team membership. Use this when the user asks about themselves, their organization, their role, or their team.',
    value: user
      ? {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt,
          },
          organization: organization
            ? {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                logo: organization.logo,
                createdAt: organization.createdAt,
              }
            : null,
          member: member
            ? {
                role: member.role,
                createdAt: member.createdAt,
              }
            : null,
        }
      : null,
  });


  useCopilotReadableData({
    description:
      'User personal workspace with uploaded files and notes. Use workspace tools (search_workspace_files, get_file_content, search_workspace_notes, get_note_content) when user references their files or notes. Files can be PDFs, documents, images. Notes are personal text notes created by the user.',
    value: workspaceContext
      ? {
          files: {
            count: workspaceContext.file_count,
            recent: workspaceContext.recent_files.map(f => ({
              id: f.id,
              name: f.file_name,
              type: f.file_type,
              uploaded: f.created_at,
            })),
          },
          notes: {
            count: workspaceContext.note_count,
            recent: workspaceContext.recent_notes.map(n => ({
              id: n.id,
              title: n.title,
              created: n.created_at,
              updated: n.updated_at,
            })),
          },
          connections: {
            count: workspaceContext.connection_count,
            active: workspaceContext.active_connections.map(c => ({
              id: c.id,
              name: c.connection_name,
              service: c.service_name,
              status: c.status,
            })),
          },
          storage_used: workspaceContext.total_size,
        }
      : null,
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
  useCopilotSuggestions({
    enabled: showSuggestions,
    instructions: CHAT_SUGGESTIONS_INSTRUCTIONS,
    providerAgentId: 'dynamic_agent',
    available: 'after-first-message',
  });

  // ================================================================================
  // PROGRESS BAR STATE
  // ================================================================================

  const hasProgressBar = !!(dynamicAgentState.plans && Object.values(dynamicAgentState.plans).some(p => p.steps?.length > 0));
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
  // NOTE: We pass selectedPageURLs directly (not via ref) so ContextSelector receives updates,
  // but use refs for callbacks to prevent unnecessary remounts
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
        selectedPageURLs={selectedPageURLs}
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
    selectedPageURLs, // Include selectedPageURLs so ContextSelector receives updates
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

      // Note: Message persistence is handled automatically by CopilotKit v1.50
    },
    [],
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

        // Note: Message persistence is handled automatically by CopilotKit v1.50
        // Note: V2 suggestions are generated automatically via useConfigureSuggestions
      } catch (e) {
        debug.warn?.('[ChatInner] Message sanitization on stop failed:', e);
      }
    },
    [
      saveMessagesRef,
      cachedSanitizedRef,
      sanitizeMessages,
      setMessages,
    ],
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

  // Stabilize chatView to prevent unnecessary rerenders
  const chatView = useMemo(() => ({
    scrollToBottomButton: CustomScrollToBottomButton,
    feather: CustomFeather,
    disclaimer: CustomDisclaimer,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    suggestionView: CustomSuggestionView as any,
    input: CustomInputV2,
    inputContainer: CustomInputContainer,
    messageView: {
      assistantMessage: CustomAssistantMessageV2,
      userMessage: CustomUserMessageV2,
      cursor: CustomCursor,
    },
  }), []);


  // Memoize context value to prevent unnecessary re-renders while ensuring updates propagate
  const pageSelectorContextValue = useMemo(() => ({
        selectedPageURLs,
        onPagesChange,
        currentPageURL,
        agentState: {
          plans: dynamicAgentState.plans,
          graphs: dynamicAgentState.graphs,
        },
        selectedNotes,
        selectedCredentials,
        selectedFiles,
        onNotesChange,
        onCredentialsChange,
        onFilesChange,
  }), [
    selectedPageURLs,
    onPagesChange,
    currentPageURL,
    dynamicAgentState.plans,
    dynamicAgentState.graphs,
    selectedNotes,
    selectedCredentials,
    selectedFiles,
    onNotesChange,
    onCredentialsChange,
    onFilesChange,
  ]);

  return (
    <ChatSessionIdProvider sessionId={sessionId}>
      <PageSelectorProvider value={pageSelectorContextValue}>
        {/* Conditionally add selected notes to context */}
        {selectedNotes.length > 0 && <SelectedNotesContext notes={selectedNotes} />}
        
        {/* Conditionally add selected credentials to context */}
        {selectedCredentials.length > 0 && <SelectedCredentialsContext credentials={selectedCredentials} />}
        
        <div className="flex h-full flex-col overflow-hidden">
          {/* Error Banner - Automatically appears when agent errors occur */}
          {agentError && (
            <ChatErrorDisplay
              error={agentError}
              retry={handleAgentRetry}
              isLight={isLight}
              autoDismissMs={15000}
            />
          )}
          
          <div
            className={cn(
              'copilot-chat-wrapper relative min-h-0 flex-1 overflow-hidden',
              !isAgentAndModelSelected && 'chat-input-disabled',
            )}>
            <CopilotChat
              agentId="dynamic_agent"
              threadId={sessionId}
              chatView={chatView}
            />
          </div>
        </div>
      </PageSelectorProvider>
    </ChatSessionIdProvider>
  );
};

export const ChatInner = React.memo(ChatInnerComponent);
