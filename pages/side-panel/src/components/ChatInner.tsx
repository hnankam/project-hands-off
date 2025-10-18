import type { FC } from 'react';
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useCopilotChat, useCoAgent, useCoAgentStateRender, useCopilotAction, useCopilotReadable, useCopilotChatHeadless_c, useFrontendTool, useHumanInTheLoop, useRenderToolCall, useCopilotContext} from "@copilotkit/react-core";
import { ComponentsMap, CopilotChat, useCopilotChatSuggestions } from "@copilotkit/react-ui";
import { debug, useStorage, cosineSimilarity, embeddingService } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { WeatherCard } from './WeatherCard';
import { AgentState } from '../lib/types';
import { SemanticSearchManager } from '../lib/SemanticSearchManager';
import { ProverbsCard } from './Proverbs';
import { MoonCard } from './Moon';
import { TaskProgressCard, AgentStepState } from './TaskProgressCard';
import { CustomUserMessage } from './CustomUserMessage';
import { z } from "zod";

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
  handleVerifySelector
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
  onAgentStepStateChange
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

  const { threadId, setThreadId, chatInstructions, setChatInstructions, additionalInstructions, setAdditionalInstructions, runtimeClient } = useCopilotContext(); 
  
  // 🪁 Chat Headless Hook: Access messages between user and agent
  const { messages, setMessages, isLoading, generateSuggestions } = useCopilotChatHeadless_c();
  
    // 🪁 Shared State: https://docs.copilotkit.ai/pydantic-ai/shared-state
    const { state, setState } = useCoAgent<AgentState>({
      name: "dynamic_agent",
      initialState: {
        proverbs: [
          "CopilotKit may be new, but its the best thing since sliced bread.",
        ],
      },
    })

  // Update parent component with loading state
  useEffect(() => {
    setIsAgentLoading(isLoading);
  }, [isLoading, setIsAgentLoading]);

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

  // Sanitize messages to prevent errors and clean up invalid data
  // Only sanitize messages except the last 5 to preserve recent context
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    let needsSanitization = false;

    // retain only the last 500 messages
    const retainedMessages = messages;
    if (messages.length > 500) {
      const retainedMessages = messages.slice(-500);
    }

    const sanitizedMessages = retainedMessages.map((message, index) => {
      // Skip sanitization for the last 5 messages
      // if (index >= messages.length - 5) {
      //   return message;
      // }

      const sanitized = { ...message };
      if (sanitized.role == 'tool' && sanitized.id.includes('result') && sanitized.content.length > 100) {
        const tool_name = sanitized.toolName || '';
        if(['searchPageContent', 'searchFormData', 'searchDOMUpdates', 'searchClickableElements', 'takeScreenshot'].includes(tool_name)) {
          console.log('[ChatInner] Cleaning content for tool call: ', tool_name, sanitized);
          sanitized.content = sanitized.content.substring(0, 90) + '...';
          needsSanitization = true;
        }
        
      }
      return sanitized;
      
    });

    // Remove duplicate tool messages by id, retain only the last one
    const seenToolIds = new Map<string, number>();
    const finalMessages = sanitizedMessages.filter((message, index) => {
      if (message.role === 'tool' && message.id) {
        const lastIndex = seenToolIds.get(message.id);
        seenToolIds.set(message.id, index);
        // If we've seen this id before, mark the previous occurrence for removal
        if (lastIndex !== undefined) {
          needsSanitization = true;
          return false; // Remove this duplicate (keep the later one)
        }
      }
      return true;
    }).filter((message, index, arr) => {
      // Second pass: remove duplicates that appeared before the last occurrence
      if (message.role === 'tool' && message.id) {
        const lastIndex = seenToolIds.get(message.id);
        return index === arr.findIndex(m => m.id === message.id && m.role === 'tool');
      }
      return true;
    });

    // Only update if something changed
    if (needsSanitization) {
      setMessages(finalMessages);
    }

  }, [messages, setMessages]);

  // PERFORMANCE OPTIMIZATION: Memoize filtered messages to avoid duplicate filtering
  // This runs only once per message change instead of twice
  const filteredMessages = useMemo(() => {
    if (!messages || messages.length === 0) {
      return [];
    }
    
    // Filter out thinking messages (those starting with **)
    return messages.filter((message) => {
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

  // Expose save functionality through ref - returns both ALL messages and filtered messages
  // ALL messages will be stored, filtered messages will be used for the counter
  useEffect(() => {
    saveMessagesRef.current = () => ({
      allMessages: messages || [],
      filteredMessages: filteredMessages
    });
  }, [messages, filteredMessages, saveMessagesRef]);

  // Expose restore functionality through ref
  useEffect(() => {
    restoreMessagesRef.current = (messagesToRestore: any[]) => {
      if (messagesToRestore && messagesToRestore.length > 0) {
        debug.log(`[ChatInner] Restoring ${messagesToRestore.length} messages`);
        setMessages(messagesToRestore);
        // Log current messages after a short delay to verify they were set
        setTimeout(() => {
          debug.log(`[ChatInner] Messages after restore: ${messages.length}`);
        }, 100);
      }
    };
  }, [setMessages, restoreMessagesRef, messages.length]);

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
        dataSource: 'no-content'
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
      embeddingChunksCount: pageContentEmbedding?.chunks?.length || 0,
      timestamp: currentPageContent.timestamp
    });
    
    return {
      pageTitle,
      pageURL,
      hasContent: true,
      hasEmbeddings: !!pageContentEmbedding,
      embeddingChunksCount: pageContentEmbedding?.chunks?.length || 0,
      documentInfo,
      windowInfo,
      timestamp: currentPageContent.timestamp || Date.now(),
      dataSource: 'chrome-extension-live-extraction',
    };
  }, [currentPageContent, pageContentEmbedding]);

  // Log the page metadata for debugging
  useEffect(() => {
    if (pageMetadataForAgent && pageMetadataForAgent.dataSource !== 'no-content') {
      debug.log('📄 [ChatSession] Page Metadata for Agent:', {
        pageTitle: pageMetadataForAgent.pageTitle,
        pageURL: pageMetadataForAgent.pageURL,
        hasContent: pageMetadataForAgent.hasContent,
        hasEmbeddings: pageMetadataForAgent.hasEmbeddings,
        embeddingChunksCount: pageMetadataForAgent.embeddingChunksCount,
        documentInfo: pageMetadataForAgent.documentInfo,
        windowInfo: pageMetadataForAgent.windowInfo,
        timestamp: new Date(pageMetadataForAgent.timestamp).toISOString(),
      });
    }
  }, [pageMetadataForAgent, currentPageContent]);

  // 🪁 Trigger suggestion generation when page content is refreshed
  useEffect(() => {
    if (showSuggestions && pageMetadataForAgent && pageMetadataForAgent.dataSource !== 'no-content' && generateSuggestions) {
      debug.log('🔄 [ChatInner] Page content refreshed, generating new suggestions');
      generateSuggestions();
    }
  }, [pageMetadataForAgent, generateSuggestions, showSuggestions]);

  // DOM updates are now stored in database and don't trigger suggestion regeneration
  // Suggestions will regenerate when agent actions complete

  useCopilotReadable({
    description: "Current web page metadata including: pageTitle (page title), pageURL (current URL), hasContent (whether page content is loaded), hasEmbeddings (whether semantic search is available), embeddingChunksCount (number of searchable content chunks), documentInfo (page info like domain, referrer, characterSet), windowInfo (viewport dimensions, scroll position, userAgent, language, platform), and timestamp. Use the searchPageContent action to semantically search the page content when you need to find specific information or understand page structure.",
    value: pageMetadataForAgent,
  });

  // 🪁 Readable 2: Latest Incremental DOM Update
  // This contains ONLY the recent DOM changes (added/removed elements, text changes)
  // DOM updates are now stored in the database with embeddings and can be searched via searchDOMUpdates action
  // No longer passed directly to avoid bloating context


  /*** Define CopilotKit Actions ***/


  useCopilotAction({
    name: "setThemeColor",
    description: "Set the theme color for the chat interface. Use hex color codes like #FF5733 or color names.",
    parameters: [{
      name: "themeColor",
      description: "The theme color to set. Make sure to pick nice colors.",
      required: true, 
    }],
    handler: async ({ themeColor }) => {
      setThemeColor(themeColor || '');
    },
  });

  // 🪁 Action: Search Page Content Semantically
  useCopilotAction({
    name: "searchPageContent",
    description: `Semantically search the current page content to find relevant information. This uses AI embeddings to find content that matches the meaning of your query, not just keyword matching.
    
    Use this action to:
    - Find specific information on the page
    - Understand page structure and content
    - Locate forms, buttons, or interactive elements
    - Extract relevant data from the page
    - Answer questions about the page content
    
    IMPORTANT: Transform the user's request into an effective search query. Extract the key concepts and entities.
    Examples:
    - User: "What is the main purpose of this page?" → Query: "main content purpose overview description"
    - User: "Find pricing information" → Query: "pricing plans cost subscription price"
    - User: "Show me the contact form" → Query: "contact form email message submit"
    
    Returns the most relevant HTML sections from the page that match your query.`,
    parameters: [
      {
        name: "query",
        type: "string",
        description: "A semantically rich search query with key concepts and entities. Transform the user's natural language request into focused search terms (nouns, adjectives, domain terms). DO NOT use full sentences or action verbs like 'find', 'show', 'get'.",
        required: true,
      },
      {
        name: "topK",
        type: "number",
        description: "Number of results to return (default: 3, max: 10)",
        required: false,
      }
    ],
    handler: async ({ query, topK = 3 }) => {
      return await searchManager.searchPageContent(query, topK);
    },
  });

  // 🪁 Action: Search Form Data
  useCopilotAction({
    name: "searchFormData",
    description: `Search through all form fields on the page to find inputs, textareas, selects, checkboxes, and radio buttons.
    
    Use this action to:
    - Find form fields by purpose (email, password, username, etc.)
    - Locate inputs by their labels or placeholders
    - Discover form structure
    - Get field selectors for filling forms
    
    IMPORTANT: Transform the user's request into a field-focused search query. Extract the field type and purpose.
    Examples:
    - User: "Fill in my email address" → Query: "email address input field"
    - User: "Enter password" → Query: "password input field"
    - User: "Select my country" → Query: "country select dropdown"
    - User: "What's my username field?" → Query: "username login input"
    - User: "Find the search box" → Query: "search query input text"
    
    Returns form field information including selectors, types, names, IDs, values, and placeholders.`,
    parameters: [
      {
        name: "query",
        type: "string",
        description: "A field-focused search query describing the form field's purpose and type. Focus on: field purpose (email, password, name, etc.), field type (input, select, textarea, checkbox), and context (login, registration, search, etc.). Use descriptive nouns, not action verbs.",
        required: true,
      },
      {
        name: "topK",
        type: "number",
        description: "Number of results to return (default: 5, max: 20)",
        required: false,
      }
    ],
    handler: async ({ query, topK = 5 }) => {
      return await searchManager.searchFormData(query, topK);
    },
  });

  // 🪁 Action: Search DOM Updates (Recent Page Changes)
  useCopilotAction({
    name: "searchDOMUpdates",
    description: `Search through recent DOM changes on the page to find what was added, removed, or modified. This is useful for tracking dynamic page updates, form submissions, error messages, notifications, modal appearances, etc.
    
    Use this action to:
    - Check what happened after performing an action (clicking, submitting, etc.)
    - Find error messages or success notifications
    - Track dynamic content loading
    - Verify action results without full page refresh
    - Discover modal dialogs or popups that appeared
    
    IMPORTANT: Recent changes are prioritized automatically via recency scoring. Focus your query on WHAT you're looking for.
    Examples:
    - User: "Did the form submit successfully?" → Query: "success confirmation message submitted"
    - User: "Are there any errors?" → Query: "error message alert warning"
    - User: "What changed after I clicked?" → Query: "new elements added changed"
    - User: "Did a modal appear?" → Query: "modal dialog popup window"
    
    Returns recent DOM changes with their summaries, timestamps, and recency scores.`,
    parameters: [
      {
        name: "query",
        type: "string",
        description: "A search query describing what type of change you're looking for. Focus on: change type (added/removed/modified), element types, content keywords, purpose. Use descriptive nouns, not action verbs.",
        required: true,
      },
      {
        name: "topK",
        type: "number",
        description: "Number of results to return (default: 5, max: 10)",
        required: false,
      }
    ],
    handler: async ({ query, topK = 5 }) => {
      return await searchManager.searchDOMUpdates(query, topK);
    },
  });

  // 🪁 Action: Search Clickable Elements
  useCopilotAction({
    name: "searchClickableElements",
    description: `Search through all clickable elements on the page including buttons, links, and interactive elements.
    
    Use this action to:
    - Find buttons by their text or purpose
    - Locate links by their text or destination
    - Discover navigation elements
    - Get selectors for clicking elements
    
    IMPORTANT: Transform the user's request into an element-focused search query. Extract the element type and purpose.
    Examples:
    - User: "Click the login button" → Query: "login sign in button"
    - User: "Find the submit button" → Query: "submit button"
    - User: "Navigate to pricing page" → Query: "pricing plans link navigation"
    - User: "Click sign up" → Query: "sign up register button link"
    - User: "Open the menu" → Query: "menu navigation toggle button"
    
    Returns clickable element information including selectors, text, aria labels, and hrefs.`,
    parameters: [
      {
        name: "query",
        type: "string",
        description: "An element-focused search query describing the clickable element's purpose and type. Focus on: element text/label, action purpose (login, submit, navigate, etc.), element type (button, link, etc.), and context. Use descriptive nouns and key terms, not action verbs like 'click', 'find', 'open'.",
        required: true,
      },
      {
        name: "topK",
        type: "number",
        description: "Number of results to return (default: 5, max: 20)",
        required: false,
      }
    ],
    handler: async ({ query, topK = 5 }) => {
      return await searchManager.searchClickableElements(query, topK);
    },
  });

  // 🪁 Action 1: Move Cursor to Element
  useCopilotAction({
    name: "moveCursorToElement",
    description: `Move the cursor to a specific element on the current web page. The cursor will stay visible for 5 minutes and auto-hide afterwards.
    
      To find elements:
      1. Use searchPageContent() FIRST to find relevant content and understand page structure
      2. Search results will help you identify element types and locations
      3. Based on search results, construct appropriate CSS selectors
      4. If you're unsure about selector validity, use verifySelector() FIRST to test it
      
      Best practices for selectors:
        - selector: The CSS selector to use (REQUIRED)
        - text: Visible text content
        - ariaLabel: Accessibility label
        - title: Tooltip text
        - href: Link URL (for links)
        - tagName: HTML tag name
        - role: ARIA role
        
      ALWAYS use the exact selector from clickableElements - never create your own!
      
      Example clickableElements data:
      [
        {
          "selector": "#create-account-btn",
          "text": "Create Account",
          "tagName": "button",
          "role": "button"
        },
        {
          "selector": ".card.manual-setup",
          "text": "Manual Setup",
          "tagName": "div",
          "role": "button"
        }
      ]
      
      To move cursor to "Create Account" button, use selector: "#create-account-btn"
      To move cursor to "Manual Setup" card, use selector: ".card.manual-setup"
      
      NOTE: The cursor will automatically hide after 5 minutes. Do NOT call removeCursorIndicator() unless the user explicitly asks.
      
      RETURN FORMAT: This action returns an object with:
      - status: 'success' | 'error'
      - message: string (descriptive message about the result)
      - elementInfo?: object (when successful, contains tag, text, id, className, foundInShadowDOM, shadowHost)`,
    parameters: [{
      name: "cssSelector",
      type: "string",
      description: "A CSS selector to identify the element (e.g., '#create-account-btn', '.card.manual-setup'). Use searchPageContent() to find appropriate selectors.",
      required: true,
    }],
    handler: async ({ cssSelector }) => {
      const result = await handleMoveCursorToElement(cssSelector);
      debug.log('[Agent Response] moveCursorToElement:', result);
      return result;
    },
  });

  // 🪁 Action 1c: Get Fresh Page Content
  useCopilotAction({
    name: "refreshPageContent",
    description: `Force refresh the page HTML content. Use this when you need the most up-to-date page content, especially when:
      - The page has dynamic content that may have changed
      - You need fresh page content for semantic search
      - The current page content seems outdated
      - You're having trouble finding elements that should be present
      
      RETURN FORMAT: This action returns an object with:
      - status: 'success' | 'error'
      - message: string (descriptive message about the result)
      - pageInfo?: object (when successful, contains title, url, htmlLength)`,
    parameters: [],
    handler: async () => {
      const result = await handleRefreshPageContent(pageDataRef.current.pageContent);
      debug.log('[Agent Response] refreshPageContent:', result);
      return result;
    },
  });

  // 🪁 Action 2: Clean Up Extension UI
  useCopilotAction({
    name: "cleanupExtensionUI",
    description: `Remove all extension UI elements from the page including cursor indicator, click ripple animations, drag & drop effects, and their styles. Use this to clean up visual feedback elements or when the user asks to remove/hide the cursor. Note: The cursor auto-hides after 5 minutes, so you don't need to call this automatically.

      This action cleans up:
      - Cursor indicator and styles
      - Click ripple animation styles
      - Drag & drop animation styles
      - Global cursor state and auto-hide timers
      - Any orphaned visual feedback elements
      
      RETURN FORMAT: This action returns an object with:
      - status: 'success' | 'error'
      - message: string (descriptive message about the result)
      - cleanupInfo?: object (when successful, contains elementsRemoved, stateCleared, totalElementsRemoved)`,
    parameters: [],
    handler: async () => {
      const result = await handleCleanupExtensionUI();
      debug.log('[Agent Response] cleanupExtensionUI:', result);
      return result;
    },
  });

  // 🪁 Action 3: Click Element
  useCopilotAction({
    name: "clickElement",
    description: `Click on a specific element on the current web page.

      Steps to use this action:
      1. Use searchPageContent() FIRST to find the button and understand its location
      2. Based on search results, construct an appropriate CSS selector
      3. If you're unsure about selector validity, use verifySelector() FIRST to test it
      4. If verifySelector shows the element exists, proceed with clickElement
      7. Each clickableElements item contains:
        - selector: The CSS selector to use (REQUIRED)
        - text: Visible text content
        - ariaLabel: Accessibility label
        - title: Tooltip text
        - href: Link URL (for links)
        - tagName: HTML tag name
        - role: ARIA role
        
      Example clickableElements data:
      [
        {
          "selector": "#create-account-btn",
          "text": "Create Account",
          "tagName": "button",
          "role": "button"
        },
        {
          "selector": ".card.manual-setup",
          "text": "Manual Setup",
          "tagName": "div",
          "role": "button"
        }
      ]
      
      To click "Create Account" button, use selector: "#create-account-btn"
      To click "Manual Setup" card, use selector: ".card.manual-setup"
      
      ALWAYS use the exact selector from clickableElements - never create your own!
      If you're uncertain about a selector's validity, use verifySelector() to test it first.

      RETURN FORMAT: This action returns an object with:
      - status: 'success' | 'error'
      - message: string (descriptive message about the result)
      - elementInfo?: object (when successful, contains tag, text, id, href, foundInShadowDOM, shadowHost)`,
    parameters: [{
      name: "cssSelector",
      type: "string",
      description: "A CSS selector to identify the element (e.g., '#create-account-btn', '.card.manual-setup'). Use searchPageContent() to find appropriate selectors.",
      required: true,
    }, {
      name: "autoMoveCursor",
      type: "boolean",
      description: "Whether to automatically move the cursor to the element before clicking (default: true).",
      required: false,
    }],
    handler: async ({ cssSelector, autoMoveCursor }) => {
      const result = await handleClickElement(cssSelector, autoMoveCursor);
      debug.log('[Agent Response] clickElement:', result);
      return result;
    },
  });

  // 🪁 Action 3b: Verify Selector
  useCopilotAction({
    name: "verifySelector",
    description: `Verify if a CSS selector is valid and can find elements in the current page's DOM or Shadow DOM.
    
      This action helps validate selectors before using them in other actions like clickElement or inputData.
      It provides detailed information about:
      - Whether the selector syntax is valid
      - How many elements match the selector
      - Whether elements are found in main DOM or Shadow DOM
      - Details about the found elements (tag, text, id, class)
      - Information about shadow hosts if elements are in Shadow DOM
      
      Use cases:
      - Test selectors before using them in other actions
      - Debug why a selector isn't working
      - Find out if elements exist in Shadow DOM
      - Get element details for better understanding
      - Validate selector syntax
      
      Examples:
      - verifySelector("#submit-button") - Check if submit button exists
      - verifySelector(".menu-item") - Check all menu items
      - verifySelector("input[type='email']") - Check email input fields
      - verifySelector("button:contains('Save')") - Check for Save buttons
      
      RETURN FORMAT: This action returns an object with:
      - status: 'success' | 'error'
      - message: string (descriptive message about the result)
      - selectorInfo?: object (when successful, contains validation details and element information)`,
    parameters: [
      {
        name: "cssSelector",
        type: "string",
        description: "The CSS selector to verify (e.g., '#submit-btn', '.menu-item', 'input[type=\"email\"]').",
        required: true,
      }
    ],
    handler: async ({ cssSelector }) => {
      const result = await handleVerifySelector(cssSelector);
      debug.log('[Agent Response] verifySelector:', result);
      return result;
    },
  });

  // 🪁 Action 4: Input Data into Form Field
  useCopilotAction({
    name: "inputData",
    description: `Input data into a form field on the current web page. Supports input, textarea, select, and contenteditable elements. Automatically searches both main DOM and Shadow DOM for elements.

      CRITICAL: You MUST provide a valid CSS selector from the pageHTML, NOT a description.
      
      Steps to use this action:
      1. Use searchPageContent() FIRST to find form fields and their properties
      2. If pageHTML is empty, call refreshPageContent() FIRST
      3. Analyze the pageHTML or allFormData to find the input field in the HTML
      4. For allFormData: Use the provided selectors or bestSelector field (RECOMMENDED)
        - Each form element now includes a 'selectors' array with valid CSS selectors
        - Use the 'bestSelector' field for the most reliable selector
        - If ID contains special characters (like colons), use the attribute selector from 'selectors'
        - If multiple elements have the same bestSelector, use placeholder or nth-of-type selectors from 'selectors'
        - Check the 'isUnique' field to see if the selector uniquely identifies the element
      5. For pageHTML: Build a CSS selector using EXACT attribute values:
        - If field has ID: use '#fieldId' (only if ID contains no special characters)
        - If field has ID with special characters: use '[id="fieldId"]' (attribute selector)
        - If field has name: use 'input[name="exact-name"]'
        - If field has classes: use complete class names
      6. If you're unsure about selector validity, use verifySelector() FIRST to test it
      
      Supported field types:
      - Text inputs: input[type="text"], input[type="email"], input[type="password"], etc.
      - Textareas: textarea elements
      - Select dropdowns: select elements (provide option value or text)
      - Custom dropdowns: button[data-slot="select-trigger"] or button[role="combobox"] (provide option value or text)
      - Checkboxes/Radio: input[type="checkbox"], input[type="radio"] (use "true"/"false" as value)
      - ContentEditable: elements with contenteditable attribute
      
      IMPORTANT: For dropdowns (both traditional select and custom dropdowns), use inputData with the desired option value, NOT clickElement. The inputData action will handle opening the dropdown and selecting the option automatically.
      
      Examples:
      - Text field: <input id="username" type="text"> → use '#username' or from allFormData: use bestSelector
      - Email field: <input name="email" type="email"> → use 'input[name="email"]' or from allFormData: use bestSelector
      - Textarea: <textarea id="message" class="form-control"> → use '#message' or from allFormData: use bestSelector
      - Select: <select name="country"> → use 'select[name="country"]' with value like "USA" or from allFormData: use bestSelector
      - Custom dropdown: <button data-slot="select-trigger">2025</button> → use 'button[data-slot="select-trigger"]:nth-of-type(1)' with value "2026" or from allFormData: use bestSelector
      - Checkbox: <input type="checkbox" id="agree"> → use '#agree' with value "true" or "false" or from allFormData: use bestSelector
      - Special characters: <input id=":rbg:-form-item"> → use '[id=":rbg:-form-item"]' (attribute selector) or from allFormData: use bestSelector
      - Non-unique selectors: If multiple elements have same bestSelector, use placeholder or nth-of-type from selectors array
      
      The clearFirst parameter (default: true) determines whether to clear the field before inputting.
      Set to false if you want to append to existing content.
      
      The moveCursor parameter (default: true) determines whether to move the mouse cursor to the input element.
      Set to false if you don't want the cursor to move.
      
      RETURN FORMAT: This action returns an object with:
      - status: 'success' | 'error'
      - message: string (descriptive message about the result)
      - elementInfo?: object (when successful, contains tag, type, id, name, value, foundInShadowDOM, shadowHost)`,
    parameters: [
      {
        name: "cssSelector",
        type: "string",
        description: "A valid CSS selector for the input field (e.g., '#email', 'input[name=\"username\"]', '#message').",
        required: true,
      },
      {
        name: "value",
        type: "string",
        description: "The value to input into the field. For checkboxes/radio, use 'true' or 'false'. For select, use option value or text.",
        required: true,
      },
      {
        name: "clearFirst",
        type: "boolean",
        description: "Whether to clear the field before inputting (default: true). Set to false to append.",
        required: false,
      },
      {
        name: "moveCursor",
        type: "boolean",
        description: "Whether to move the mouse cursor to the input element (default: true). Set to false to disable cursor movement.",
        required: false,
      }
    ],
    handler: async ({ cssSelector, value, clearFirst = true, moveCursor = true }) => {
      const result = await handleInputData(cssSelector, value, clearFirst, moveCursor);
      debug.log('[Agent Response] inputData:', result);
      return result;
    },
  });

  // 🪁 Action 5: Open New Tab
  useCopilotAction({
    name: "openNewTab",
    description: `Open a new browser tab with the specified URL.
    
      Use this action to navigate to a different website or open a link in a new tab.
      The URL will be automatically validated, formatted, and checked for security.
      
      Security Features:
      - Only HTTP/HTTPS URLs are allowed (blocks javascript:, data:, vbscript:, file:)
      - Domain format validation for better security
      - Automatic https:// protocol addition if missing
      
      Examples:
      - Open Google: url="https://google.com"
      - Open GitHub: url="github.com" (https:// will be added automatically)
      - Open specific page: url="https://example.com/page"
      - Background tab: url="https://example.com", active=false
      
      The active parameter (default: true) determines whether the new tab becomes the active tab.
      Set to false to open the tab in the background.
      
      RETURN FORMAT: This action returns an object with:
      - status: 'success' | 'error'
      - message: string (descriptive message about the result)
      - tabInfo?: object (when successful, contains tabId, url, domain, path, isActive)`,
    parameters: [
      {
        name: "url",
        type: "string",
        description: "The URL to open in the new tab (e.g., 'https://google.com', 'github.com', 'https://example.com/page').",
        required: true,
      },
      {
        name: "active",
        type: "boolean",
        description: "Whether to make the new tab active (default: true). Set to false to open in background.",
        required: false,
      }
    ],
    handler: async ({ url, active = true }) => {
      const result = await handleOpenNewTab(url, active);
      debug.log('[Agent Response] openNewTab:', result);
      return result;
    },
  });

  // 🪁 Action 6: Scroll Page or Element
  useCopilotAction({
    name: "scroll",
    description: `Scroll the page, within a specific element, or TO a specific element.
    
      This action supports three scroll modes:
      1. Page scrolling: Scroll the entire page (leave cssSelector empty)
      2. Element scrolling: Scroll within a scrollable element (cssSelector + scrollTo=false)
      3. Scroll TO element: Scroll the page to bring a specific element into view (cssSelector + scrollTo=true or direction="to")
      
      Direction options:
      - "up": Scroll up by specified amount (default: 300px)
      - "down": Scroll down by specified amount (default: 300px)
      - "left": Scroll left by specified amount (default: 300px)
      - "right": Scroll right by specified amount (default: 300px)
      - "top": Scroll to the very top (amount is ignored)
      - "bottom": Scroll to the very bottom (amount is ignored)
      - "to": Scroll to bring the specified element into view (amount is ignored)
      
      CSS Selector (optional):
      - Leave empty to scroll the entire page
      - Provide a CSS selector to scroll within a specific element (scrollTo=false)
      - Provide a CSS selector to scroll TO a specific element (scrollTo=true or direction="to")
      - If element is not scrollable, automatically scrolls TO the element instead
      - Supports Shadow DOM elements (searches both main DOM and Shadow DOM)
      - If you're unsure about selector validity, use verifySelector() FIRST to test it
      
      Examples:
      - Scroll page down: direction="down", amount=500
      - Scroll to top of page: direction="top"
      - Scroll within table: cssSelector="table.data-table", direction="down", scrollTo=false
      - Scroll to element: cssSelector="#important-section", scrollTo=true
      - Scroll to element (alternative): cssSelector="#important-section", direction="to"
      - Scroll div right: cssSelector="#content-area", direction="right", amount=200, scrollTo=false
      - Auto-scroll to non-scrollable element: cssSelector="#button", direction="down" (automatically scrolls TO the button)
      
      The action provides visual feedback with an arrow indicator showing the scroll direction.
      
      RETURN FORMAT: This action returns an object with:
      - status: 'success' | 'error'
      - message: string (descriptive message about the result)
      - scrollInfo?: object (when successful, contains target, direction, before, after, scrolled, max)`,
    parameters: [
      {
        name: "cssSelector",
        type: "string",
        description: "Optional CSS selector for the element to scroll within or scroll to. Leave empty to scroll the page.",
        required: false,
      },
      {
        name: "direction",
        type: "string",
        description: "Direction to scroll: 'up', 'down', 'left', 'right', 'top', 'bottom', or 'to'. Default: 'down'.",
        required: false,
      },
      {
        name: "amount",
        type: "number",
        description: "Amount to scroll in pixels (for up/down/left/right). Default: 300. Ignored for 'top', 'bottom', and 'to'.",
        required: false,
      },
      {
        name: "scrollTo",
        type: "boolean",
        description: "If true, scrolls TO the element (brings it into view). If false, scrolls WITHIN the element. Default: false.",
        required: false,
      }
    ],
    handler: async ({ cssSelector = '', direction = 'down', amount = 300, scrollTo = false }) => {
      const result = await handleScroll(
        cssSelector, 
        direction as 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom' | 'to', 
        amount,
        scrollTo
      );
      debug.log('[Agent Response] scroll:', result);
      return result;
    },
  });

  // 🪁 Action 7: Drag and Drop
  useCopilotAction({
    name: "dragAndDrop",
    description: `Drag an element from a source location and drop it onto a target element. Automatically searches both main DOM and Shadow DOM for elements.
    
      CRITICAL: You MUST provide valid CSS selectors from the pageHTML for BOTH source and target.
      
      This action simulates a complete drag and drop operation with visual feedback:
      - Highlights both source (orange) and target (green) elements
      - Shows animated drag path with a moving indicator
      - Dispatches all necessary drag events (dragstart, dragenter, dragover, drop, dragend)
      - Also dispatches mouse events for compatibility
      
      Steps to use this action:
      1. Use searchPageContent() to verify page content is available
      2. If pageHTML is empty, call refreshPageContent() FIRST
      3. Analyze the pageHTML to find BOTH the source element to drag AND the target drop zone
      4. Extract CSS selectors for both elements using their IDs, classes, or attributes
      5. If you're unsure about selector validity, use verifySelector() FIRST to test both selectors
      6. Optionally provide offset values to adjust the drop position relative to target center
      
      Use cases:
      - Drag and drop files into upload zones
      - Reorder list items in sortable lists
      - Move cards between columns in kanban boards
      - Drag elements into containers or drop zones
      - Rearrange dashboard widgets
      
      Examples:
      - Drag file to upload: sourceCssSelector="#file-item-1", targetCssSelector=".upload-zone"
      - Reorder list item: sourceCssSelector="li[data-id='3']", targetCssSelector="li[data-id='1']"
      - Move card: sourceCssSelector=".card.task-1", targetCssSelector=".column.in-progress"
      - Drag with offset: sourceCssSelector="#item", targetCssSelector="#container", offsetX=20, offsetY=-10
      
      The action provides rich visual feedback with animated drag path and drop ripple effect.
      
      RETURN FORMAT: This action returns an object with:
      - status: 'success' | 'error'
      - message: string (descriptive message about the result)
      - dragInfo?: object (when successful, contains source and target info with selectors, tags, text, positions, foundInShadowDOM, shadowHost)`,
    parameters: [
      {
        name: "sourceCssSelector",
        type: "string",
        description: "CSS selector for the element to drag (e.g., '#draggable-item', '.card[data-id=\"123\"]').",
        required: true,
      },
      {
        name: "targetCssSelector",
        type: "string",
        description: "CSS selector for the drop target element (e.g., '.drop-zone', '#target-container').",
        required: true,
      },
      {
        name: "offsetX",
        type: "number",
        description: "Optional horizontal offset in pixels from target center (default: 0). Positive = right, negative = left.",
        required: false,
      },
      {
        name: "offsetY",
        type: "number",
        description: "Optional vertical offset in pixels from target center (default: 0). Positive = down, negative = up.",
        required: false,
      }
    ],
    handler: async ({ sourceCssSelector, targetCssSelector, offsetX = 0, offsetY = 0 }) => {
      const result = await handleDragAndDrop(sourceCssSelector, targetCssSelector, offsetX, offsetY);
      debug.log('[Agent Response] dragAndDrop:', result);
      return result;
    },
  });

  // 🪁 Action 8: Take Screenshot
  useCopilotAction({
    name: "takeScreenshot",
    description: `Capture a screenshot of the current browser tab.
    
      This action captures the visual state of the current page:
      - Captures the visible viewport area by default
      - Can optionally capture the full scrollable page (coming soon)
      - Supports PNG (lossless) and JPEG (lossy, smaller file size) formats
      - Returns image as data URL for analysis
      
      Use cases:
      - Document the current state of the UI
      - Capture visual confirmation of completed actions
      - Compare before/after states of page changes
      - Record visual bugs or issues
      - Save important information displayed on screen
      - Create visual documentation of workflows
      
      The screenshot includes everything visible in the browser viewport,
      including any visual feedback from extension actions (highlights, indicators, etc.).
      
      Examples:
      - Quick screenshot: No parameters needed (captures full page as JPEG quality 25 by default)
      - High quality: format="png"
      - Better compression: format="jpeg", quality=15
      - Higher quality: format="jpeg", quality=50
      - Visible area only: captureFullPage=false
      
      RETURN FORMAT: This action returns an object with:
      - status: 'success' | 'error'
      - message: string (descriptive message about the result)
      - screenshotInfo?: object (when successful, contains format, dimensions, sizeKB, quality, isFullPage, dataUrl)`,
    parameters: [
      {
        name: "captureFullPage",
        type: "boolean",
        description: "If true, captures entire scrollable page. If false, captures only visible viewport (default: true). Note: Full page capture is experimental.",
        required: false,
      },
      {
        name: "format",
        type: "string",
        description: "Image format: 'png' for lossless quality or 'jpeg' for smaller file size (default: 'jpeg' for optimal compression).",
        required: false,
      },
      {
        name: "quality",
        type: "number",
        description: "JPEG quality from 0-100, only applies when format is 'jpeg' (default: 25 for optimal compression). Higher = better quality but larger file. Typical values: 15 (high compression), 25 (balanced), 50 (higher quality).",
        required: false,
      }
    ],
    handler: async ({ captureFullPage = false, format = 'jpeg', quality = 25 }) => {
      const result = await handleTakeScreenshot(captureFullPage, format as 'png' | 'jpeg', quality);
      debug.log('[Agent Response] takeScreenshot:', result);
      return result;
    },
  });

  // 🪁 Generative UI: Weather card action
  useCopilotAction({
    name: "get_weather",
    description: "Get the weather for a given location.",
    available: "disabled",
    parameters: [
      { name: "location", type: "string", required: true },
    ],
    render: ({ args }) => {
      return <WeatherCard location={args.location} themeColor={themeColor} />
    },
  }, [themeColor]);

  // 🪁 Human In the Loop: https://docs.copilotkit.ai/pydantic-ai/human-in-the-loop
  useCopilotAction({
    name: "go_to_moon",
    description: "Go to the moon on request.",
    renderAndWaitForResponse: ({ respond, status}) => {
      return <MoonCard themeColor={themeColor} status={status} respond={respond} />
    },
  }, [themeColor]);

  useCopilotAction({
    name: "go_to_moon",
    description: "Go to the moon on request.",
    render: ({ args }) => {
      return <div style={{ backgroundColor: themeColor }} className="h-screen flex justify-center items-center flex-col transition-colors duration-300">
        <ProverbsCard state={state} setState={setState} />
      </div>
    },
  }, [themeColor]);

  // 🪁 Shared State for dynamic_agent: https://docs.copilotkit.ai/reference/hooks/useCoAgent
  // State is automatically synced to backend on next agent interaction
  const { state: dynamicAgentState, setState: setDynamicAgentState } = useCoAgent<AgentStepState>({
    name: "dynamic_agent",
    initialState: initialAgentStepState || {
      steps: [],
    },
  })
  
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
    name: "dynamic_agent",
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
      <div className={`thinking-block my-3 rounded-lg border p-3 ${
        isLight 
          ? 'bg-blue-50 border-blue-200' 
          : 'bg-blue-900/20 border-blue-800'
      }`}>
        <div className="flex items-start gap-2">
          <svg 
            className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
              isLight ? 'text-blue-600' : 'text-blue-400'
            }`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" 
            />
          </svg>
          <div className={`flex-1 text-sm ${
            isLight ? 'text-blue-900' : 'text-blue-100'
          }`}>
            <div className={`font-medium mb-1 ${
              isLight ? 'text-blue-700' : 'text-blue-300'
            }`}>
              Thinking...
            </div>
            <div className="whitespace-pre-wrap">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // The markdownTagRenderers configuration object.
  const customMarkdownTagRenderers = {
    "thinking": ThinkingBlock,
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* CopilotChat with inline historical cards and floating progress card */}
      <div className="flex-1 min-h-0 copilot-chat-wrapper relative">
        {/* Floating TaskProgressCard - sticks to top and floats above messages */}
        {dynamicAgentState.steps && dynamicAgentState.steps.length > 0 && showProgressBar && (
          <div 
            className="sticky top-0 z-10 px-2 pt-2 pb-1 backdrop-blur-sm" 
            style={{ 
              backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(12, 17, 23, 0.95)'
            }}
          >
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
          }}
          onError={(errorEvent) => {
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
        />
      </div>
    </div>
  );
};

