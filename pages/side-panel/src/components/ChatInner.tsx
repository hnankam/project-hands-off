import type { FC } from 'react';
import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  useCopilotChat,
  useCoAgent,
  useCoAgentStateRender,
  useCopilotAction,
  useCopilotReadable,
  useCopilotChatHeadless_c,
  useFrontendTool,
  useHumanInTheLoop,
  useRenderToolCall,
  useCopilotContext,
} from '@copilotkit/react-core';
import { ComponentsMap, CopilotChat, useCopilotChatSuggestions } from '@copilotkit/react-ui';
import { debug, useStorage, cosineSimilarity, embeddingService } from '@extension/shared';
import { embeddingsStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { WeatherCard } from './WeatherCard';
import { ActionStatus } from './ActionStatus';
import { WaitCountdown } from './WaitCountdown';
import { AgentState } from '../lib/types';
import { SemanticSearchManager } from '../lib/SemanticSearchManager';
import { TaskProgressCard, AgentStepState } from './TaskProgressCard';
import { CustomUserMessage } from './CustomUserMessage';
import { CustomInput } from './CustomInput';
import { z } from 'zod';

import {
  handleMoveCursorToElement,
  handleCleanupExtensionUI,
  handleClickElement,
  handleInputData,
  handleOpenNewTab,
  handleScroll,
  handleDragAndDrop,
  handleRefreshPageContent,
  handleTakeScreenshot,
  handleVerifySelector,
  handleGetSelectorAtPoint,
  handleGetSelectorsAtPoints,
} from '../actions';

// Message data structure returned by saveMessagesRef
export interface MessageData {
  allMessages: any[];
  filteredMessages: any[];
}

// ChatInner Props Interface
export interface ChatInnerProps {
  sessionId: string;
  sessionTitle: string | undefined;
  currentPageContent: any;
  dbTotals?: { html: number; form: number; click: number };
  pageContentEmbedding?: {
    fullEmbedding: number[];
    chunks?: Array<{ text: string; html: string; embedding: number[] }>;
    timestamp: number;
  } | null;
  latestDOMUpdate: any;
  themeColor: string;
  setThemeColor: (color: string) => void;
  setCurrentMessages: (messages: any[]) => void;
  saveMessagesToStorage: (messages: any[]) => Promise<void>;
  setHeadlessMessagesCount: (count: number) => void;
  saveMessagesRef: React.MutableRefObject<(() => MessageData) | null>;
  restoreMessagesRef: React.MutableRefObject<((messages: any[]) => void) | null>;
  setIsAgentLoading: (loading: boolean) => void;
  showSuggestions: boolean;
  // Progress bar state callbacks
  onProgressBarStateChange?: (hasProgressBar: boolean, showProgressBar: boolean, onToggle: () => void) => void;
  // Agent step state management
  initialAgentStepState?: AgentStepState;
  onAgentStepStateChange?: (state: AgentStepState) => void;
  // Context menu message to send
  contextMenuMessage?: string | null;
}

/**
 * ChatInner Component
 *
 * Inner component that uses CopilotKit hooks - MUST be inside <CopilotKit> wrapper
 * Handles all agent interactions, actions, and chat functionality
 */
export const ChatInner: FC<ChatInnerProps> = ({
  sessionId,
  sessionTitle,
  currentPageContent,
  pageContentEmbedding,
  latestDOMUpdate,
  themeColor,
  setThemeColor,
  setCurrentMessages,
  saveMessagesToStorage,
  setHeadlessMessagesCount,
  saveMessagesRef,
  restoreMessagesRef,
  setIsAgentLoading,
  showSuggestions,
  onProgressBarStateChange,
  initialAgentStepState,
  onAgentStepStateChange,
  contextMenuMessage,
  dbTotals,
}) => {
  // 🎨 Theme
  const { isLight } = useStorage(exampleThemeStorage);
  const theme = isLight ? 'light' : 'dark';

  // Store embeddings and content for semantic search (not sent to agent)
  const pageDataRef = useRef<{
    embeddings: {
      fullEmbedding: number[];
      chunks?: Array<{ text: string; html: string; embedding: number[] }>;
      timestamp: number;
    } | null;
    pageContent: any;
  }>({
    embeddings: null,
    pageContent: null,
  });

  // Create semantic search manager
  const searchManager = useMemo(() => new SemanticSearchManager(pageDataRef), []);

  const {
    threadId,
    setThreadId,
    chatInstructions,
    setChatInstructions,
    additionalInstructions,
    setAdditionalInstructions,
    runtimeClient,
  } = useCopilotContext();

  // 🪁 Chat Headless Hook: Access messages between user and agent
  const { messages, setMessages, isLoading, generateSuggestions } = useCopilotChatHeadless_c();

  // 🪁 Shared State: https://docs.copilotkit.ai/pydantic-ai/shared-state
  const { state, setState } = useCoAgent<AgentState>({
    name: 'dynamic_agent',
    initialState: {
      proverbs: ['CopilotKit may be new, but its the best thing since sliced bread.'],
    },
  });

  // Update parent component with loading state
  useEffect(() => {
    setIsAgentLoading(isLoading);
  }, [isLoading, setIsAgentLoading]);

  // Totals for DB-backed counts
  const [totals, setTotals] = useState<{ html: number; form: number; click: number }>({ html: 0, form: 0, click: 0 });

  // If container provided totals from embed time, prefer those immediately
  useEffect(() => {
    if (dbTotals && (dbTotals.html || dbTotals.form || dbTotals.click)) {
      setTotals(dbTotals);
      debug.log('[ChatInner] Adopted embed-time totals from container:', dbTotals);
    }
  }, [dbTotals?.html, dbTotals?.form, dbTotals?.click]);

  // Track context menu message to populate input field
  // Use a ref that CustomInput can access directly instead of prop drilling
  const inputPrefillRef = useRef<{ text: string; timestamp: number } | null>(null);
  const contextMenuUsedRef = useRef<string | null>(null);
  const pendingAnimationFrameRef = useRef<number | null>(null);

  // Handle context menu messages - populate input field instead of sending directly
  useEffect(() => {
    if (!contextMenuMessage || !contextMenuMessage.trim()) return;
    if (contextMenuMessage === contextMenuUsedRef.current) return;

    // Cancel any pending animation frame to prevent duplicate dispatches
    if (pendingAnimationFrameRef.current !== null) {
      cancelAnimationFrame(pendingAnimationFrameRef.current);
      pendingAnimationFrameRef.current = null;
    }

    debug.log('[ChatInner] Received context menu message, setting prefill ref:', contextMenuMessage.substring(0, 100));
    const timestamp = Date.now();
    inputPrefillRef.current = { text: contextMenuMessage, timestamp };

    // Mark as used IMMEDIATELY to prevent duplicate processing
    contextMenuUsedRef.current = contextMenuMessage;

    // Use requestAnimationFrame to defer the event dispatch to avoid triggering during render
    pendingAnimationFrameRef.current = requestAnimationFrame(() => {
      pendingAnimationFrameRef.current = null;
      const event = new CustomEvent('copilot-prefill-text', {
        detail: { text: contextMenuMessage, timestamp, sessionId },
        bubbles: false, // Don't bubble
        cancelable: false, // Can't be cancelled
      });
      window.dispatchEvent(event);
      debug.log('[ChatInner] Dispatched copilot-prefill-text event');
    });
  }, [contextMenuMessage]);

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

  // Track last sanitized signature and time to prevent loops/thrashing
  const lastSanitizedRef = useRef<string>('');
  const lastSanitizeAtRef = useRef<number>(0);
  const cachedSanitizedRef = useRef<{ signature: string; result: { messages: any[]; hasChanges: boolean } } | null>(
    null,
  );

  // Compute a compact signature representing the relevant message content
  const computeMessagesSignature = (list: any[]) => {
    try {
      return JSON.stringify(
        list.map((m: any) => ({ id: m.id, role: m.role, len: typeof m.content === 'string' ? m.content.length : 0 })),
      );
    } catch {
      return String(list?.length || 0);
    }
  };

  // To  move to send message callback
  // // Auto-sanitize and deduplicate messages in the UI
  // // Note: This runs continuously to clean up any duplicates or large content
  // // The actual sanitization happens in sanitizeMessages helper
  // useEffect(() => {
  //   if (!messages || messages.length === 0) return;

  //   // Compute a lightweight signature for messages (ids + content length)
  //   const signature = computeMessagesSignature(messages);

  //   if (signature === lastSanitizedRef.current) {
  //     return;
  //   }

  //   // Throttle sanitization to at most once every 200ms
  //   const now = Date.now();
  //   if (now - lastSanitizeAtRef.current < 200) {
  //     return;
  //   }

  //   const result = sanitizeAndDeduplicateMessages(messages);

  //   // Only update if something actually changed
  //   if (result.hasChanges) {
  //     const resultSignature = computeMessagesSignature(result.messages);
  //     if (resultSignature !== signature) {
  //       console.log('[ChatInner] Auto-sanitization: updating messages from', messages.length, 'to', result.messages.length);
  //       lastSanitizedRef.current = resultSignature;
  //       lastSanitizeAtRef.current = now;
  //       setMessages(result.messages);
  //     } else {
  //       // No effective change in signature
  //       lastSanitizedRef.current = signature;
  //       lastSanitizeAtRef.current = now;
  //     }
  //   } else {
  //     // No changes; store current signature to prevent reprocessing
  //     lastSanitizedRef.current = signature;
  //     lastSanitizeAtRef.current = now;
  //   }
  // }, [messages, setMessages]);

  // PERFORMANCE OPTIMIZATION: Memoize filtered messages to avoid duplicate filtering
  // This runs only once per message change instead of twice
  const filteredMessages = useMemo(() => {
    if (!messages || messages.length === 0) {
      return [];
    }

    // Filter out thinking messages (those starting with **)
    return messages.filter(message => {
      if (typeof message.content === 'string') {
        return !message.content.startsWith('**') && message.content.trim() !== '';
      } else if (typeof message.content === 'object' && message.content !== null) {
        try {
          const contentStr = JSON.stringify(message.content);
          return !contentStr.includes('"**');
        } catch (e) {
          // If can't stringify, filter it out
          return false;
        }
      } else if (message.content === undefined || message.content === null) {
        return false;
      }
      return true;
    });
  }, [messages]);

  // Helper function to sanitize and deduplicate messages
  // Use useCallback to avoid recreating on every render
  // Returns { messages, hasChanges } to track if actual modifications were made
  const sanitizeMessages = React.useCallback((messagesToProcess: any[]) => {
    console.log('[ChatInner] Sanitizing and deduplicating messages...');

    let hasChanges = false;

    // Retain only the last 500 messages
    let retainedMessages = messagesToProcess;
    if (messagesToProcess.length > 500) {
      retainedMessages = messagesToProcess.slice(-500);
      hasChanges = true;
      console.log('[ChatInner] Retained last 500 messages from', messagesToProcess.length);
    }

    // Sanitize large tool call content - only create new objects if we modify something
    const sanitizedMessages = retainedMessages.map((message, index) => {
      if (message.role === 'tool' && message.id?.includes('result') && message.content?.length > 100) {
        const tool_name = message.toolName || '';
        if (
          [
            'searchPageContent',
            'searchFormData',
            'searchDOMUpdates',
            'searchClickableElements',
            'takeScreenshot',
          ].includes(tool_name)
        ) {
          // Check if content needs truncation
          if (!message.content.endsWith('...')) {
            console.log('[ChatInner] Truncating content for tool call:', tool_name, message.id);
            hasChanges = true;
            return { ...message, content: message.content.substring(0, 90) + '...' };
          }
        }
      }
      // Return original object if no changes needed
      return message;
    });

    // Client-side deduplication disabled: keep all sanitized messages as-is
    const finalMessages = sanitizedMessages;

    console.log('[ChatInner] Sanitization complete:', {
      original: messagesToProcess.length,
      retained: retainedMessages.length,
      sanitized: sanitizedMessages.length,
      final: finalMessages.length,
      removed: messagesToProcess.length - finalMessages.length,
      hasChanges,
    });

    return { messages: finalMessages, hasChanges };
  }, []);

  // Expose save functionality through ref - returns both ALL messages and filtered messages
  // ALL messages will be sanitized, deduplicated, filtered messages will be used for the counter
  useEffect(() => {
    saveMessagesRef.current = () => {
      const signature = computeMessagesSignature(messages || []);
      let result: { messages: any[]; hasChanges: boolean };
      if (cachedSanitizedRef.current && cachedSanitizedRef.current.signature === signature) {
        result = cachedSanitizedRef.current.result;
      } else {
        result = sanitizeMessages(messages || []);
        cachedSanitizedRef.current = { signature, result };
      }
      return {
        allMessages: result.messages,
        filteredMessages: filteredMessages,
      };
    };
  }, [messages, filteredMessages, saveMessagesRef, sanitizeMessages]);

  // Expose restore functionality through ref - sanitize and deduplicate on restore
  useEffect(() => {
    restoreMessagesRef.current = (messagesToRestore: any[]) => {
      if (messagesToRestore && messagesToRestore.length > 0) {
        const result = sanitizeMessages(messagesToRestore);
        // Guard: only update if content actually changed compared to current state
        const currentSig = computeMessagesSignature(messages || []);
        const nextSig = computeMessagesSignature(result.messages || []);
        if (result.hasChanges || currentSig !== nextSig) {
          setMessages(result.messages);
        } else {
          // No-op when nothing changed
        }
      }
    };
  }, [setMessages, restoreMessagesRef, messages.length, sanitizeMessages]);

  // Update message count whenever filtered messages change
  // PERFORMANCE: Only updates if count actually changed
  const previousCountRef = useRef(0);
  useEffect(() => {
    const newCount = filteredMessages.length;
    if (newCount !== previousCountRef.current) {
      setHeadlessMessagesCount(newCount);
      previousCountRef.current = newCount;
    }
  }, [filteredMessages, setHeadlessMessagesCount]);

  // Update pageDataRef when embeddings or content changes (store locally, not sent to agent)
  useEffect(() => {
    pageDataRef.current.embeddings = pageContentEmbedding || null;
    pageDataRef.current.pageContent = currentPageContent;
  }, [pageContentEmbedding, currentPageContent]);

  // 🪁 Page Metadata for Agent: Minimal metadata only (no large HTML/form data)
  const pageMetadataForAgent = useMemo(() => {
    if (!currentPageContent) {
      debug.log('📭 [ChatSession] No currentPageContent available');
      return {
        pageTitle: 'No page loaded',
        pageURL: '',
        hasContent: false,
        hasEmbeddings: false,
        timestamp: 0,
        dataSource: 'no-content',
      };
    }

    const pageTitle = currentPageContent.title || 'Untitled Page';
    const pageURL = currentPageContent.url || '';
    const documentInfo = currentPageContent.allDOMContent?.documentInfo || null;
    const windowInfo = currentPageContent.allDOMContent?.windowInfo || null;

    debug.log('📦 [ChatSession] Page metadata prepared for agent:', {
      pageTitle,
      pageURL,
      hasEmbeddings: !!pageContentEmbedding,
      timestamp: currentPageContent.timestamp,
    });

    return {
      pageTitle,
      pageURL,
      hasContent: true,
      hasEmbeddings: !!pageContentEmbedding,
      // DB-backed totals
      totalHtmlChunks: totals.html,
      totalClickableChunks: totals.click,
      totalFormChunks: totals.form,
      documentInfo,
      windowInfo,
      timestamp: currentPageContent.timestamp || Date.now(),
      dataSource: 'chrome-extension-live-extraction',
    };
  }, [currentPageContent, pageContentEmbedding, totals]);

  // Log the page metadata for debugging
  useEffect(() => {
    if (pageMetadataForAgent && pageMetadataForAgent.dataSource !== 'no-content') {
      debug.log('📄 [ChatSession] Page Metadata for Agent:', {
        pageTitle: pageMetadataForAgent.pageTitle,
        pageURL: pageMetadataForAgent.pageURL,
        hasContent: pageMetadataForAgent.hasContent,
        hasEmbeddings: pageMetadataForAgent.hasEmbeddings,
        totalHtmlChunks: (pageMetadataForAgent as any).totalHtmlChunks,
        totalClickableChunks: (pageMetadataForAgent as any).totalClickableChunks,
        totalFormChunks: (pageMetadataForAgent as any).totalFormChunks,
        documentInfo: pageMetadataForAgent.documentInfo,
        windowInfo: pageMetadataForAgent.windowInfo,
        timestamp: new Date(pageMetadataForAgent.timestamp).toISOString(),
      });
    }
  }, [pageMetadataForAgent, currentPageContent]);

  // No DB queries for totals here; ChatSessionContainer provides authoritative totals after insert

  // 🪁 Trigger suggestion generation when page content is refreshed
  useEffect(() => {
    if (
      showSuggestions &&
      pageMetadataForAgent &&
      pageMetadataForAgent.dataSource !== 'no-content' &&
      generateSuggestions
    ) {
      debug.log('🔄 [ChatInner] Page content refreshed, generating new suggestions');
      generateSuggestions();
    }
  }, [pageMetadataForAgent, generateSuggestions, showSuggestions]);

  // DOM updates are now stored in database and don't trigger suggestion regeneration
  // Suggestions will regenerate when agent actions complete

  useCopilotReadable({
    description:
      'Current web page metadata including: pageTitle, pageURL, hasContent, hasEmbeddings, totalHtmlChunks, totalFormChunks, totalClickableChunks, documentInfo, windowInfo, and timestamp. Use searchPageContent to semantically search page content when needed.',
    value: pageMetadataForAgent,
  });

  /*** Define CopilotKit Actions ***/

  useCopilotAction({
    name: 'setThemeColor',
    description: 'Set the theme color for the chat interface. Use hex color codes like #FF5733 or color names.',
    parameters: [
      {
        name: 'themeColor',
        description: 'The theme color to set. Make sure to pick nice colors.',
        required: true,
      },
    ],
    handler: async ({ themeColor }) => {
      setThemeColor(themeColor || '');
    },
  });

  // 🪁 Action: Search Page Content Semantically
  useCopilotAction({
    name: 'searchPageContent',
    description: 'Semantic search over current page content. Returns top‑K relevant HTML chunks.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description:
          "A semantically rich search query with key concepts and entities. Transform the user's natural language request into focused search terms (nouns, adjectives, domain terms). DO NOT use full sentences or action verbs like 'find', 'show', 'get'.",
        required: true,
      },
      {
        name: 'topK',
        type: 'number',
        description: 'Number of results to return (default: 3, max: 10)',
        required: false,
      },
    ],
    handler: async ({ query, topK = 3 }) => {
      return await searchManager.searchPageContent(query, topK);
    },
  });

  // 🪁 Action: Get HTML chunks by index range
  useCopilotAction({
    name: 'getHtmlChunksByRange',
    description: 'Fetch HTML chunks by chunk index range (inclusive).',
    parameters: [
      { name: 'start', type: 'number', description: 'Start chunk index (>=0)', required: true },
      { name: 'end', type: 'number', description: 'End chunk index (>=start)', required: true },
    ],
    handler: async ({ start, end }) => {
      const url = currentPageContent?.url || '';
      if (!url) return { status: 'error', message: 'No page URL' };
      const s = Math.max(0, Number(start));
      const e = Math.max(s, Number(end));
      try {
        debug.log('[AgentAction] getHtmlChunksByRange → querying DB:', { url: url.substring(0, 80), start: s, end: e });
        const rows = await embeddingsStorage.fetchHTMLChunksByRange(url, s, e);
        debug.log('[AgentAction] getHtmlChunksByRange → fetched:', rows.length);
        return { status: 'success', message: `Fetched ${rows.length} chunk(s)`, chunks: rows };
      } catch (err) {
        debug.error('[AgentAction] getHtmlChunksByRange error:', err);
        return { status: 'error', message: 'DB query failed' };
      }
    },
  });

  // 🪁 Action: Get Form chunks (groups) by range
  useCopilotAction({
    name: 'getFormChunksByRange',
    description: 'Fetch form chunks (groups) by group index range (inclusive).',
    parameters: [
      { name: 'start', type: 'number', description: 'Start group index (>=0)', required: true },
      { name: 'end', type: 'number', description: 'End group index (>=start)', required: true },
    ],
    handler: async ({ start, end }) => {
      const url = currentPageContent?.url || '';
      if (!url) return { status: 'error', message: 'No page URL' };
      const s = Math.max(0, Number(start));
      const e = Math.max(s, Number(end));
      try {
        debug.log('[AgentAction] getFormChunksByRange → querying DB:', { url: url.substring(0, 80), start: s, end: e });
        const rows = await embeddingsStorage.fetchFormChunksByRange(url, s, e);
        debug.log('[AgentAction] getFormChunksByRange → fetched:', rows.length);
        return { status: 'success', message: `Fetched ${rows.length} chunk(s)`, chunks: rows };
      } catch (err) {
        debug.error('[AgentAction] getFormChunksByRange error:', err);
        return { status: 'error', message: 'DB query failed' };
      }
    },
  });

  // 🪁 Action: Get Clickable chunks (groups) by range
  useCopilotAction({
    name: 'getClickableChunksByRange',
    description: 'Fetch clickable chunks (groups) by group index range (inclusive).',
    parameters: [
      { name: 'start', type: 'number', description: 'Start group index (>=0)', required: true },
      { name: 'end', type: 'number', description: 'End group index (>=start)', required: true },
    ],
    handler: async ({ start, end }) => {
      const url = currentPageContent?.url || '';
      if (!url) return { status: 'error', message: 'No page URL' };
      const s = Math.max(0, Number(start));
      const e = Math.max(s, Number(end));
      try {
        debug.log('[AgentAction] getClickableChunksByRange → querying DB:', {
          url: url.substring(0, 80),
          start: s,
          end: e,
        });
        const rows = await embeddingsStorage.fetchClickableChunksByRange(url, s, e);
        debug.log('[AgentAction] getClickableChunksByRange → fetched:', rows.length);
        return { status: 'success', message: `Fetched ${rows.length} chunk(s)`, chunks: rows };
      } catch (err) {
        debug.error('[AgentAction] getClickableChunksByRange error:', err);
        return { status: 'error', message: 'DB query failed' };
      }
    },
  });

  // 🪁 Action: Search Form Data
  useCopilotAction({
    name: 'searchFormData',
    description: 'Search form fields (inputs, textareas, selects, checkboxes/radios). Returns fields with selectors.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description:
          "A field-focused search query describing the form field's purpose and type. Focus on: field purpose (email, password, name, etc.), field type (input, select, textarea, checkbox), and context (login, registration, search, etc.). Use descriptive nouns, not action verbs.",
        required: true,
      },
      {
        name: 'topK',
        type: 'number',
        description: 'Number of results to return (default: 5, max: 20)',
        required: false,
      },
    ],
    handler: async ({ query, topK = 5 }) => {
      return await searchManager.searchFormData(query, topK);
    },
  });

  // 🪁 Action: Search DOM Updates (Recent Page Changes)
  useCopilotAction({
    name: 'searchDOMUpdates',
    description: 'Search recent DOM changes (added/removed/modified). Returns summaries with timestamps.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description:
          "A search query describing what type of change you're looking for. Focus on: change type (added/removed/modified), element types, content keywords, purpose. Use descriptive nouns, not action verbs.",
        required: true,
      },
      {
        name: 'topK',
        type: 'number',
        description: 'Number of results to return (default: 5, max: 10)',
        required: false,
      },
    ],
    handler: async ({ query, topK = 5 }) => {
      return await searchManager.searchDOMUpdates(query, topK);
    },
  });

  // 🪁 Action: Search Clickable Elements
  useCopilotAction({
    name: 'searchClickableElements',
    description: 'Search clickable elements (buttons/links/etc.). Returns items with reliable selectors.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description:
          "An element-focused search query describing the clickable element's purpose and type. Focus on: element text/label, action purpose (login, submit, navigate, etc.), element type (button, link, etc.), and context. Use descriptive nouns and key terms, not action verbs like 'click', 'find', 'open'.",
        required: true,
      },
      {
        name: 'topK',
        type: 'number',
        description: 'Number of results to return (default: 5, max: 20)',
        required: false,
      },
    ],
    handler: async ({ query, topK = 5 }) => {
      return await searchManager.searchClickableElements(query, topK);
    },
  });

  // 🪁 Action 1: Move Cursor to Element
  useCopilotAction({
    name: 'moveCursorToElement',
    description: 'Show/move cursor to the element matching the selector. Auto-hides after 5 minutes.',
    parameters: [
      {
        name: 'cssSelector',
        type: 'string',
        description:
          "A CSS selector to identify the element (e.g., '#create-account-btn', '.card.manual-setup'). Use searchPageContent() to find appropriate selectors.",
        required: true,
      },
    ],
    handler: async ({ cssSelector }) => {
      const result = await handleMoveCursorToElement(cssSelector);
      debug.log('[Agent Response] moveCursorToElement:', result);
      return result;
    },
  });

  // 🪁 Action 1c: Get Fresh Page Content
  useCopilotAction({
    name: 'refreshPageContent',
    description: 'Refresh current page HTML (for latest content/embeddings).',
    parameters: [],
    handler: async () => {
      const result = await handleRefreshPageContent(pageDataRef.current.pageContent);
      debug.log('[Agent Response] refreshPageContent:', result);
      return result;
    },
  });

  // 🪁 Action 2: Clean Up Extension UI
  useCopilotAction({
    name: 'cleanupExtensionUI',
    description: 'Remove all extension UI elements and styles from the page.',
    parameters: [],
    handler: async () => {
      const result = await handleCleanupExtensionUI();
      debug.log('[Agent Response] cleanupExtensionUI:', result);
      return result;
    },
  });

  // 🪁 Action 3: Click Element
  useCopilotAction({
    name: 'clickElement',
    description: 'Click the element matching the provided CSS selector.',
    parameters: [
      {
        name: 'cssSelector',
        type: 'string',
        description:
          "A CSS selector to identify the element (e.g., '#create-account-btn', '.card.manual-setup'). Use searchPageContent() to find appropriate selectors.",
        required: true,
      },
      {
        name: 'autoMoveCursor',
        type: 'boolean',
        description: 'Whether to automatically move the cursor to the element before clicking (default: true).',
        required: false,
      },
    ],
    handler: async ({ cssSelector, autoMoveCursor }) => {
      const result = await handleClickElement(cssSelector, autoMoveCursor);
      debug.log('[Agent Response] clickElement:', result);
      return result;
    },
  });

  // 🪁 Action 3b: Verify Selector
  useCopilotAction({
    name: 'verifySelector',
    description: 'Validate a CSS selector (syntax, match count, shadow DOM info, element details).',
    parameters: [
      {
        name: 'cssSelector',
        type: 'string',
        description: "The CSS selector to verify (e.g., '#submit-btn', '.menu-item', 'input[type=\"email\"]').",
        required: true,
      },
    ],
    handler: async ({ cssSelector }) => {
      const result = await handleVerifySelector(cssSelector);
      debug.log('[Agent Response] verifySelector:', result);
      return result;
    },
  });

  // 🪁 Action: Get Selector At Point
  useCopilotAction({
    name: 'getSelectorAtPoint',
    description: `Return a unique CSS selector for the element at the given viewport coordinates (x, y). Coordinates are in CSS pixels relative to the viewport (0,0 is top-left).`,
    parameters: [
      { name: 'x', type: 'number', description: 'Viewport X coordinate in CSS px', required: true },
      { name: 'y', type: 'number', description: 'Viewport Y coordinate in CSS px', required: true },
    ],
    handler: async ({ x, y }) => {
      const result = await handleGetSelectorAtPoint(Number(x), Number(y));
      debug.log('[Agent Response] getSelectorAtPoint:', result);
      return result;
    },
  });

  // 🪁 Action: Get Selectors At Points (batch)
  useCopilotAction({
    name: 'getSelectorsAtPoints',
    description: `Return unique CSS selectors for elements at the provided list of viewport coordinates. Each item is { x, y } in CSS pixels relative to the viewport.`,
    parameters: [
      { name: 'points', type: 'object[]', description: 'Array of points {x:number,y:number}', required: true },
    ],
    handler: async ({ points }) => {
      const safe = Array.isArray(points) ? points.map((p: any) => ({ x: Number(p.x), y: Number(p.y) })) : [];
      const result = await handleGetSelectorsAtPoints(safe);
      debug.log('[Agent Response] getSelectorsAtPoints:', result);
      return result;
    },
  });

  // 🪁 Action 4: Input Data into Form Field
  useCopilotAction({
    name: 'inputData',
    description: 'Fill a form field matched by selector (inputs, textareas, selects, checkboxes, contenteditable).',
    parameters: [
      {
        name: 'cssSelector',
        type: 'string',
        description:
          "A valid CSS selector for the input field (e.g., '#email', 'input[name=\"username\"]', '#message').",
        required: true,
      },
      {
        name: 'value',
        type: 'string',
        description:
          "The value to input into the field. For checkboxes/radio, use 'true' or 'false'. For select, use option value or text.",
        required: true,
      },
      {
        name: 'clearFirst',
        type: 'boolean',
        description: 'Whether to clear the field before inputting (default: true). Set to false to append.',
        required: false,
      },
      {
        name: 'moveCursor',
        type: 'boolean',
        description:
          'Whether to move the mouse cursor to the input element (default: true). Set to false to disable cursor movement.',
        required: false,
      },
    ],
    handler: async ({ cssSelector, value, clearFirst = true, moveCursor = true }) => {
      const result = await handleInputData(cssSelector, value, clearFirst, moveCursor);
      debug.log('[Agent Response] inputData:', result);
      return result;
    },
  });

  // 🪁 Action 5: Open New Tab
  useCopilotAction({
    name: 'openNewTab',
    description: 'Open a new tab with the given URL (validated and normalized).',
    parameters: [
      {
        name: 'url',
        type: 'string',
        description:
          "The URL to open in the new tab (e.g., 'https://google.com', 'github.com', 'https://example.com/page').",
        required: true,
      },
      {
        name: 'active',
        type: 'boolean',
        description: 'Whether to make the new tab active (default: true). Set to false to open in background.',
        required: false,
      },
    ],
    handler: async ({ url, active = true }) => {
      const result = await handleOpenNewTab(url, active);
      debug.log('[Agent Response] openNewTab:', result);
      return result;
    },
  });

  // 🪁 Action 6: Scroll Page or Element
  useCopilotAction({
    name: 'scroll',
    description: 'Scroll the page or an element, or scroll the page to an element.',
    parameters: [
      {
        name: 'cssSelector',
        type: 'string',
        description:
          'Optional CSS selector for the element to scroll within or scroll to. Leave empty to scroll the page.',
        required: false,
      },
      {
        name: 'direction',
        type: 'string',
        description: "Direction to scroll: 'up', 'down', 'left', 'right', 'top', 'bottom', or 'to'. Default: 'down'.",
        required: false,
      },
      {
        name: 'amount',
        type: 'number',
        description:
          "Amount to scroll in pixels (for up/down/left/right). Default: 300. Ignored for 'top', 'bottom', and 'to'.",
        required: false,
      },
      {
        name: 'scrollTo',
        type: 'boolean',
        description:
          'If true, scrolls TO the element (brings it into view). If false, scrolls WITHIN the element. Default: false.',
        required: false,
      },
    ],
    handler: async ({ cssSelector = '', direction = 'down', amount = 300, scrollTo = false }) => {
      const result = await handleScroll(
        cssSelector,
        direction as 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom' | 'to',
        amount,
        scrollTo,
      );
      debug.log('[Agent Response] scroll:', result);
      return result;
    },
  });

  // 🪁 Action 7: Drag and Drop
  useCopilotAction({
    name: 'dragAndDrop',
    description: 'Drag from source selector and drop on target selector (supports offsets and canvas cases).',
    parameters: [
      {
        name: 'sourceCssSelector',
        type: 'string',
        description: "CSS selector for the element to drag (e.g., '#draggable-item', '.card[data-id=\"123\"]').",
        required: true,
      },
      {
        name: 'targetCssSelector',
        type: 'string',
        description: "CSS selector for the drop target element (e.g., '.drop-zone', '#target-container').",
        required: true,
      },
      {
        name: 'offsetX',
        type: 'number',
        description:
          'Optional horizontal offset in pixels from target center (default: 0). Positive = right, negative = left.',
        required: false,
      },
      {
        name: 'offsetY',
        type: 'number',
        description:
          'Optional vertical offset in pixels from target center (default: 0). Positive = down, negative = up.',
        required: false,
      },
    ],
    handler: async ({ sourceCssSelector, targetCssSelector, offsetX = 0, offsetY = 0 }) => {
      const result = await handleDragAndDrop(sourceCssSelector, targetCssSelector, offsetX, offsetY);
      debug.log('[Agent Response] dragAndDrop:', result);
      return result;
    },
  });

  // 🪁 Action 8: Take Screenshot
  useCopilotAction({
    name: 'takeScreenshot',
    description: 'Capture screenshot of the current tab (viewport by default; JPEG/PNG).',
    parameters: [
      {
        name: 'captureFullPage',
        type: 'boolean',
        description:
          'If true, captures entire scrollable page. If false, captures only visible viewport (default: true). Note: Full page capture is experimental.',
        required: false,
      },
      {
        name: 'format',
        type: 'string',
        description:
          "Image format: 'png' for lossless quality or 'jpeg' for smaller file size (default: 'jpeg' for optimal compression).",
        required: false,
      },
      {
        name: 'quality',
        type: 'number',
        description:
          "JPEG quality from 0-100, only applies when format is 'jpeg' (default: 25 for optimal compression). Higher = better quality but larger file. Typical values: 15 (high compression), 25 (balanced), 50 (higher quality).",
        required: false,
      },
    ],
    handler: async ({ captureFullPage = false, format = 'jpeg', quality = 25 }) => {
      const result = await handleTakeScreenshot(captureFullPage, format as 'png' | 'jpeg', quality);
      debug.log('[Agent Response] takeScreenshot:', result);
      return result;
    },
  });

  // 🪁 Generative UI: Weather card action
  useCopilotAction(
    {
      name: 'get_weather',
      description: 'Get the weather for a given location.',
      available: 'disabled',
      parameters: [{ name: 'location', type: 'string', required: true }],
      render: ({ args }) => {
        return <WeatherCard location={args.location} themeColor={themeColor} />;
      },
    },
    [themeColor],
  );

  // moved WaitCountdown to ./WaitCountdown

  // 🪁 Utility: Wait for a given number of seconds (agent-controlled pause)
  useCopilotAction({
    name: 'wait',
    description: 'Pause execution for N seconds (use for page loads/embedding).',
    parameters: [{ name: 'seconds', type: 'number', description: 'Seconds to wait (0-30)', required: true }],
    render: ({ args, status }) => {
      const raw = Number((args as any)?.seconds ?? 0);
      const s = Math.max(0, Math.min(30, Math.floor(isNaN(raw) ? 0 : raw)));
      return <WaitCountdown seconds={s} isLight={isLight} status={status as any} />;
    },
    handler: async ({ seconds }) => {
      const s = Math.max(0, Math.min(30, Math.floor(Number(seconds) || 0)));
      debug.log('[Agent Action] wait called:', s, 'seconds');
      await new Promise(resolve => setTimeout(resolve, s * 1000));
      debug.log('[Agent Response] wait complete:', s, 'seconds');
      return { status: 'success', waitedSeconds: s } as const;
    },
  });

  // 🪁 Human In the Loop: https://docs.copilotkit.ai/pydantic-ai/human-in-the-loop
  // 🪁 Shared State for dynamic_agent: https://docs.copilotkit.ai/reference/hooks/useCoAgent
  // State is automatically synced to backend on next agent interaction
  const { state: dynamicAgentState, setState: setDynamicAgentState } = useCoAgent<AgentStepState>({
    name: 'dynamic_agent',
    initialState: initialAgentStepState || {
      steps: [],
    },
  });

  // Notify parent component when agent step state changes
  useEffect(() => {
    if (onAgentStepStateChange && dynamicAgentState) {
      onAgentStepStateChange(dynamicAgentState);
    }
  }, [dynamicAgentState, onAgentStepStateChange]);

  // State for progress bar visibility
  const [showProgressBar, setShowProgressBar] = useState(true);
  const hasProgressBar = dynamicAgentState.steps && dynamicAgentState.steps.length > 0;

  // Create stable toggle function
  const toggleProgressBarFn = React.useCallback(() => {
    setShowProgressBar(prev => !prev);
  }, []);

  // Notify parent component of progress bar state changes (only when values actually change)
  const prevStateRef = useRef({ hasProgressBar: false, showProgressBar: true });
  useEffect(() => {
    // Only notify if values actually changed
    if (
      onProgressBarStateChange &&
      (prevStateRef.current.hasProgressBar !== hasProgressBar ||
        prevStateRef.current.showProgressBar !== showProgressBar)
    ) {
      prevStateRef.current = { hasProgressBar, showProgressBar };
      onProgressBarStateChange(hasProgressBar, showProgressBar, toggleProgressBarFn);
    }
  }, [hasProgressBar, showProgressBar, onProgressBarStateChange, toggleProgressBarFn]);

  // Render inline with chat messages using useCoAgentStateRender (without controls)
  useCoAgentStateRender<AgentStepState>({
    name: 'dynamic_agent',
    render: ({ state }) => {
      // Check if state has steps, if not return null
      if (!state.steps || state.steps.length === 0) {
        return null;
      }

      //console.log('[useCoAgentStateRender] Rendering inline with state:', state);

      // Render the TaskProgressCard inline (without controls - read-only)
      // New cards start expanded and non-historical
      // MutationObserver will collapse and mark older cards as historical
      return (
        <div data-task-progress="true" data-timestamp={Date.now()} className="w-full pt-2">
          <TaskProgressCard
            state={state}
            setState={setDynamicAgentState}
            isCollapsed={false}
            isHistorical={false}
            showControls={false}
          />
        </div>
      );
    },
  });

  // Use MutationObserver to collapse older progress cards and mark them as historical
  useEffect(() => {
    const collapsedCards = new Set<Element>();

    const updateProgressCards = () => {
      const allCards = document.querySelectorAll('[data-task-progress="true"]');
      // Mark all cards except the last one as historical
      allCards.forEach((card, index) => {
        if (index < allCards.length - 1) {
          // Mark as historical
          card.setAttribute('data-historical', 'true');

          // Auto-collapse card only once (don't interfere with manual expansion)
          if (!collapsedCards.has(card)) {
            const cardContainer = card as HTMLElement;
            // Find the collapse button if card is expanded and click it
            const collapseButton = cardContainer.querySelector('button[aria-label="Collapse"]');
            if (collapseButton) {
              (collapseButton as HTMLButtonElement).click();
              collapsedCards.add(card);
            }
          }
        } else {
          // Remove historical marker from the latest card
          card.removeAttribute('data-historical');
          // If this card was previously marked as collapsed, remove it from the set
          collapsedCards.delete(card);
        }
      });
    };

    // Run initially
    updateProgressCards();

    // Observe DOM changes to catch new progress cards
    const observer = new MutationObserver(() => {
      updateProgressCards();
    });

    // Start observing the document body for child additions
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also run on interval as a fallback
    const intervalId = setInterval(updateProgressCards, 100);

    return () => {
      observer.disconnect();
      clearInterval(intervalId);
    };
  }, []);

  // 🪁 Chat Suggestions: Smart suggestions based on context
  // Suggestions automatically regenerate when useCopilotReadable values change
  // (pageMetadataForAgent is already provided via useCopilotReadable)
  // Hide suggestions by setting maxSuggestions to 0 when showSuggestions is false
  useCopilotChatSuggestions({
    instructions: `Generate helpful suggestions for the user based on the current chat session and page content. 
        
    The agent can semantically search page content and interact with the page.
    
    Available search actions:
    - searchPageContent(query, topK) - Search page content, returns HTML chunks with text
    - searchFormData(query, topK) - Search form fields (inputs, textareas, selects), returns field info with selectors
    - searchClickableElements(query, topK) - Search buttons and links, returns element info with selectors
    - searchDOMUpdates(query, topK) - Search recent page changes, returns summaries of added/removed/modified elements with timestamps and recency scores
    
    Available interaction actions:
    - Set theme colors
    - Move cursor to elements (use selectors from search results)
    - Click elements (use selectors from search results)
    - Input data into form fields (use selectors from searchFormData)
    - Scroll the page or specific elements (up, down, left, right, top, bottom)
    - Drag and drop elements (with animated visual feedback)
    - Open new tabs with URLs
    - Remove cursor indicator
    
    IMPORTANT: Always use search actions FIRST:
    - Use searchPageContent() to understand page structure and content
    - Use searchFormData() to find form fields before filling them
    - Use searchClickableElements() to find buttons/links before clicking them
    
    Search results provide ready-to-use selectors and HTML snippets.
    
    Examples:
    - "What is this page about?"
    - "Set the theme to blue"
    - "Click the Manual Setup card"
    - "Move cursor to the submit button"
    - "Fill in the username field with 'john.doe'"
    - "Enter 'test@example.com' in the email field"
    - "Select 'United States' from the country dropdown"
    - "Check the terms and conditions checkbox"
    - "Scroll down the page"
    - "Scroll to the bottom"
    - "Scroll the table to the right"
    - "Drag the first item to the second position"
    - "Move the card to the completed column"
    - "Open Google in a new tab"
    - "Navigate to github.com"
    - "Remove the cursor"
    - "Clean up the UI updates"
    Keep suggestions concise and actionable.`,
    maxSuggestions: showSuggestions ? 3 : 0,
  });

  const ThinkingBlock: FC<{ children?: React.ReactNode }> = ({ children }) => {
    const { isLight } = useStorage(exampleThemeStorage);

    return (
      <div
        className={`thinking-block my-3 rounded-lg border p-3 ${
          isLight ? 'border-blue-200 bg-blue-50' : 'border-blue-800 bg-blue-900/20'
        }`}>
        <div className="flex items-start gap-2">
          <svg
            className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isLight ? 'text-blue-600' : 'text-blue-400'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <div className={`flex-1 text-sm ${isLight ? 'text-blue-900' : 'text-blue-100'}`}>
            <div className={`mb-1 font-medium ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>Thinking...</div>
            <div className="whitespace-pre-wrap">{children}</div>
          </div>
        </div>
      </div>
    );
  };

  // The markdownTagRenderers configuration object.
  const customMarkdownTagRenderers = {
    thinking: ThinkingBlock,
  };

  // Create a stable, session-scoped Input component to avoid remounts
  const ScopedInput = useMemo(() => {
    const Comp = (props: any) => <CustomInput {...props} listenSessionId={sessionId} />;
    return Comp;
  }, [sessionId]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* CopilotChat with inline historical cards and floating progress card */}
      <div className="copilot-chat-wrapper relative min-h-0 flex-1">
        {/* Floating TaskProgressCard - sticks to top and floats above messages */}
        {dynamicAgentState.steps && dynamicAgentState.steps.length > 0 && showProgressBar && (
          <div
            className="sticky top-0 z-10 px-2 pb-1 pt-2 backdrop-blur-sm"
            style={{
              backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(12, 17, 23, 0.95)',
            }}>
            <TaskProgressCard
              state={dynamicAgentState}
              setState={setDynamicAgentState}
              isCollapsed={false}
              isHistorical={false}
              showControls={true}
            />
          </div>
        )}

        <CopilotChat
          // labels={{
          //   title: sessionTitle || `Session ${sessionId.slice(0, 8)}`,
          //   initial: `Work in autopilot mode.`,
          // }}
          imageUploadsEnabled={true}
          onSubmitMessage={(message: string) => {
            debug.log('[ChatInner] User submitted message:', message);
            try {
              // Sanitize current messages immediately after user submits a prompt
              const current = messages || [];
              const signature = computeMessagesSignature(current);
              // Use cached result when possible to avoid redundant work
              let result: { messages: any[]; hasChanges: boolean };
              if (cachedSanitizedRef.current && cachedSanitizedRef.current.signature === signature) {
                result = cachedSanitizedRef.current.result;
              } else {
                result = sanitizeMessages(current);
                cachedSanitizedRef.current = { signature, result };
              }
              if (result.hasChanges) {
                const resultSignature = computeMessagesSignature(result.messages);
                if (resultSignature !== signature) {
                  setMessages(result.messages);
                  debug.log('[ChatInner] onSubmit sanitization applied. Count:', result.messages.length);
                }
              }
            } catch (e) {
              debug.warn?.('[ChatInner] onSubmit sanitization skipped due to error:', e);
            }
          }}
          onError={errorEvent => {
            console.log('[ChatInner] Error:', errorEvent);
          }}
          // onInProgress={(isInProgress) => {
          //     console.log('[ChatInner] In progress:', isInProgress);
          // }}
          // onReloadMessages={() => {
          //   console.log('[ChatInner] Reload messages');
          // }}
          // onRegenerate={() => {
          //   console.log('[ChatInner] Regenerate');
          // }}
          // onCopy={(text: string) => {
          //   console.log('[ChatInner] Copy:', text);
          // }}
          // onStopGeneration={() => {
          //   console.log('[ChatInner] Stop generation');
          // }}
          // onThumbsDown={() => {
          //   console.log('[ChatInner] Thumbs down');
          // }}
          // onThumbsUp={() => {
          //   console.log('[ChatInner] Thumbs up');
          // }}
          markdownTagRenderers={customMarkdownTagRenderers}
          UserMessage={CustomUserMessage}
          Input={ScopedInput}
        />
      </div>
    </div>
  );
};
