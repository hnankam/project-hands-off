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
import * as React from 'react';
import { useEffect, useRef, useMemo, useState, useCallback } from 'react';

// Centralized CopilotKit Hooks, Components & Types (v2 migration ready)
import {
  // Components
  CopilotChat,
  // Types
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
// V2 components are used via chatView slots below
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
      })),
    },
  });
  return null;
};

const SelectedCredentialsContext: React.FC<{ credentials: any[] }> = ({ credentials }) => {
  useCopilotReadableData({
    description:
      `Available credentials for API calls. The user has explicitly selected these credentials for use in this session.
      
      IMPORTANT SECURITY NOTES:
      - You can see credential metadata (ID, name, type, key identifier) but NOT the actual passwords/secrets
      - Never ask the user for credential values - they are securely stored server-side
      - The backend will handle authentication automatically when you use the credential
      
      The 'key' field contains public identifiers only (like username, API key ID) - never the actual secret.`,
    value: {
      selectedCredentials: credentials.map(cred => ({
        id: cred.id,
        name: cred.name,
        type: cred.type,
        key: cred.key, // Public identifier only (username, API key ID, etc.)
        // ✅ SECURITY: password/secret field removed - never sent to LLM
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
  // Initial workspace item IDs for restoring session state
  initialSelectedNoteIds?: string[];
  initialSelectedCredentialIds?: string[];
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
  initialSelectedNoteIds = [],
  initialSelectedCredentialIds = [],
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
    errorBannerAutoDismissMs: 60 * 60 * 1000, // 1 hour
    debug: process.env.NODE_ENV === 'development',
    
    // Retry logic: same as regenerate button on last message - find last message,
    // if assistant find preceding user and reload from user, else reload from that message
    onRetry: () => {
      debug.log('[ChatInner] Error retry triggered (same as regenerate on last message)');

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

      const validMessages = filterValidMessages(sanitizedMessagesArr);

      if (validMessages.length === 0) {
        debug.error('[ChatInner] No valid messages to reload');
        return;
      }

      // Same logic as CustomAssistantMessageV2 handleRegenerate: use last message in conversation
      const lastMessage = validMessages[validMessages.length - 1] as { id?: string; role?: string };
      const lastMessageId = lastMessage?.id;
      if (!lastMessageId) {
        debug.warn?.('[ChatInner] Last message has no id');
        return;
      }

      const lastRole = lastMessage?.role;
      if (lastRole === 'assistant') {
        // Find preceding user message (same as regenerate button)
        let userMessageIndex = -1;
        for (let i = validMessages.length - 2; i >= 0; i--) {
          const role = (validMessages[i] as { role?: string })?.role;
          if (role === 'user') {
            userMessageIndex = i;
            break;
          }
        }
        const userMessage = userMessageIndex >= 0 ? (validMessages[userMessageIndex] as { id?: string }) : null;
        if (userMessage?.id) {
          debug.log('[ChatInner] Reloading from user message (same as regenerate):', userMessage.id);
          reloadMessages(userMessage.id);
        } else {
          debug.log('[ChatInner] Reloading from assistant message (fallback):', lastMessageId);
          reloadMessages(lastMessageId);
        }
      } else if (lastRole === 'user') {
        debug.log('[ChatInner] Reloading from user message:', lastMessageId);
        reloadMessages(lastMessageId);
      } else {
        debug.log('[ChatInner] Last message is not user/assistant, reloading from it:', lastMessageId);
        reloadMessages(lastMessageId);
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
      'Current authenticated user information including personal details and organization. Use this when the user asks about themselves or their organization.',
    value: user
      ? {
          user: {
            name: user.name,
            email: user.email,
          },
          organization: organization
            ? {
                name: organization.name,
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
            })),
          },
          notes: {
            count: workspaceContext.note_count,
            recent: workspaceContext.recent_notes.map(n => ({
              id: n.id,
              title: n.title,
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
        initialSelectedNoteIds,
        initialSelectedCredentialIds,
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
    initialSelectedNoteIds,
    initialSelectedCredentialIds,
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
              autoDismissMs={60 * 60 * 1000}
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
