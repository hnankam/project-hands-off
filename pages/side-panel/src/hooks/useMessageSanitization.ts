import { useRef, useMemo, useCallback, useEffect } from 'react';
import { computeMessagesSignature } from '../utils/sanitizationHelper';
import { debug } from '@extension/shared';

// [FREEZE-DEBUG] module-level counters (survive re-renders without ref)
let _saveRefEffectCount = 0;
let _restoreRefEffectCount = 0;

// ============================================================================
// CONSTANTS
// ============================================================================

const TRUNCATION_SUFFIX = '... [output truncated]';

/** Tools that support smart truncation of large outputs */
const TRUNCATABLE_TOOLS = new Set([
  'searchPageContent',
  'searchFormData',
  'searchDOMUpdates',
  'searchClickableElements',
  'takeScreenshot',
]);

/** Truncation limits for different content types */
const TRUNCATION_LIMITS = {
  SHORT_TEXT: 100,      // Short text fields
  MEDIUM_TEXT: 200,     // Medium text fields (text, html in results)
  LONG_TEXT: 500,       // Long text fields and generic strings
  MESSAGE: 1000,        // Screenshot message field
  DATA_URL_SAMPLE: 50,  // Sample size for data URLs
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Checks if content has already been truncated.
 */
const isAlreadyTruncated = (content: string): boolean => {
  return typeof content === 'string' && content.endsWith(TRUNCATION_SUFFIX);
};

/**
 * Smart truncation that preserves JSON structure and stats.
 * Only truncates large content fields (text, html, dataUrl) while keeping metadata.
 * 
 * @param content - Tool result content to truncate
 * @param toolName - Name of the tool (determines truncation strategy)
 * @returns Truncated content preserving structure
 */
function truncateToolResult(content: any, toolName: string): any {
  // If it's not an object and not a string, return as is
  if (typeof content !== 'object' && typeof content !== 'string') {
    return content;
  }

  // If it's null, return as is
  if (content === null) {
    return content;
  }

  // If it's a string, try to parse it as JSON first
  let parsed: any = content;
  let wasString = false;
  
  if (typeof content === 'string') {
    wasString = true;
    // Try to parse as JSON
    try {
      parsed = JSON.parse(content);
    } catch {
      // Not JSON, treat as plain string
      if (content.length <= TRUNCATION_LIMITS.SHORT_TEXT) return content;
      return `${content.slice(0, TRUNCATION_LIMITS.SHORT_TEXT)}${TRUNCATION_SUFFIX}`;
    }
  }

  // At this point, parsed is an object
  if (typeof parsed !== 'object' || parsed === null) {
    return content;
  }

  // Check if already truncated (look for truncation suffix in any string field)
  const contentStr = JSON.stringify(parsed);
  if (contentStr.includes(TRUNCATION_SUFFIX)) {
    return content; // Return original format
  }

  // Clone the object to avoid mutating original
  let truncated: any;
  try {
    truncated = JSON.parse(JSON.stringify(parsed));
  } catch {
    return content;
  }

  // Tool-specific truncation logic
  if (toolName === 'searchPageContent' || toolName === 'searchFormData' || 
      toolName === 'searchDOMUpdates' || toolName === 'searchClickableElements') {
    // Structure: { success, query, resultsCount, results: [{rank, similarity, text, html, ...}] }
    // Preserve: success, query, resultsCount, rank, similarity
    // Truncate: text, html fields in results array
    if (Array.isArray(truncated.results)) {
      truncated.results = truncated.results.map((result: any) => {
        const truncatedResult = { ...result };
        
        // Truncate text field
        if (typeof result.text === 'string' && result.text.length > TRUNCATION_LIMITS.MEDIUM_TEXT) {
          truncatedResult.text = result.text.slice(0, TRUNCATION_LIMITS.MEDIUM_TEXT) + TRUNCATION_SUFFIX;
        }
        
        // Truncate html field
        if (typeof result.html === 'string' && result.html.length > TRUNCATION_LIMITS.MEDIUM_TEXT) {
          truncatedResult.html = result.html.slice(0, TRUNCATION_LIMITS.MEDIUM_TEXT) + TRUNCATION_SUFFIX;
        }
        
        // Truncate any other large string fields (preserve important metadata)
        Object.keys(truncatedResult).forEach(key => {
          if (typeof truncatedResult[key] === 'string' && 
              truncatedResult[key].length > TRUNCATION_LIMITS.LONG_TEXT &&
              key !== 'selector' && // Keep selectors intact
              key !== 'name' && 
              key !== 'id' &&
              key !== 'type') {
            truncatedResult[key] = truncatedResult[key].slice(0, TRUNCATION_LIMITS.MEDIUM_TEXT) + TRUNCATION_SUFFIX;
          }
        });
        
        return truncatedResult;
      });
    }
  } else if (toolName === 'takeScreenshot') {
    // Structure: { status, message, screenshotInfo: { format, dimensions, sizeKB, quality, isFullPage, dataUrl, url } }
    // Preserve: ALL metadata (status, message, screenshotInfo with all fields except dataUrl)
    // Truncate: only dataUrl if present
    if (truncated.screenshotInfo?.dataUrl) {
      const dataUrl = truncated.screenshotInfo.dataUrl;
      if (dataUrl.length > TRUNCATION_LIMITS.SHORT_TEXT) {
        // Keep the data URL prefix (data:image/jpeg;base64,) and truncate the base64 part
        const prefixMatch = dataUrl.match(/^(data:image\/[^;]+;base64,)/);
        if (prefixMatch) {
          truncated.screenshotInfo.dataUrl = 
            prefixMatch[1] + 
            dataUrl.slice(prefixMatch[1].length, prefixMatch[1].length + TRUNCATION_LIMITS.DATA_URL_SAMPLE) + 
            TRUNCATION_SUFFIX;
        } else {
          truncated.screenshotInfo.dataUrl = dataUrl.slice(0, TRUNCATION_LIMITS.SHORT_TEXT) + TRUNCATION_SUFFIX;
        }
      }
    }
    
    // Truncate message if extremely long (preserve attachment manifest)
    if (typeof truncated.message === 'string' && truncated.message.length > TRUNCATION_LIMITS.MESSAGE) {
      const attachmentMatch = truncated.message.match(/(<!--ATTACHMENTS:[\s\S]*?-->)/);
      if (attachmentMatch) {
        const mainMessage = truncated.message.slice(0, truncated.message.indexOf(attachmentMatch[0]));
        truncated.message = 
          (mainMessage.length > TRUNCATION_LIMITS.LONG_TEXT 
            ? mainMessage.slice(0, TRUNCATION_LIMITS.LONG_TEXT) + TRUNCATION_SUFFIX 
            : mainMessage) + 
          attachmentMatch[0];
      } else {
        truncated.message = truncated.message.slice(0, TRUNCATION_LIMITS.LONG_TEXT) + TRUNCATION_SUFFIX;
      }
    }
  } else {
    // Generic truncation for other tools
    Object.keys(truncated).forEach(key => {
      if (typeof truncated[key] === 'string' && truncated[key].length > TRUNCATION_LIMITS.LONG_TEXT) {
        truncated[key] = truncated[key].slice(0, TRUNCATION_LIMITS.MEDIUM_TEXT) + TRUNCATION_SUFFIX;
      } else if (Array.isArray(truncated[key])) {
        // Recursively truncate array items
        truncated[key] = truncated[key].map((item: any) => {
          if (typeof item === 'string' && item.length > TRUNCATION_LIMITS.LONG_TEXT) {
            return item.slice(0, TRUNCATION_LIMITS.MEDIUM_TEXT) + TRUNCATION_SUFFIX;
          } else if (typeof item === 'object') {
            return truncateToolResult(item, toolName);
          }
          return item;
        });
      }
    });
  }

  // Return in same format as input (string → string, object → object)
  if (wasString) {
    try {
      return JSON.stringify(truncated);
    } catch {
      return truncated;
    }
  }
  
  return truncated;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Message data structure returned by saveMessages.
 */
export interface MessageData {
  allMessages: any[];
  filteredMessages: any[];
}

/**
 * Result from sanitization operations.
 */
interface SanitizationResult {
  messages: any[];
  hasChanges: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Message Sanitization Hook
 * 
 * Handles message sanitization, deduplication, and filtering for chat messages.
 * Provides methods to save and restore messages while maintaining data integrity.
 * 
 * Features:
 * - Truncates large tool messages to reduce memory
 * - Retains only last 500 messages to prevent unbounded growth
 * - Filters out pure "thinking" messages (containing only <think> or <thinking> tags)
 * - Caches sanitization results to avoid redundant processing
 * - Provides stable refs for save/restore operations
 * - Normalizes tool_use blocks to prevent API rejection
 * 
 * @param messages - Current array of chat messages
 * @param setMessages - Function to update messages
 * @param saveMessagesRef - Ref to expose save functionality
 * @param restoreMessagesRef - Ref to expose restore functionality
 * @param setMessageCounts - Callback to update user and assistant message counts
 * 
 * @returns Object containing:
 *   - filteredMessages: Messages excluding "thinking" and empty messages
 *   - sanitizeMessages: Function to sanitize and deduplicate messages
 *   - computeMessagesSignature: Function to compute message signature (from helper)
 */
export const useMessageSanitization = (
  messages: any[],
  setMessages: (messages: any[]) => void,
  saveMessagesRef: React.MutableRefObject<(() => MessageData) | null>,
  restoreMessagesRef: React.MutableRefObject<((messages: any[]) => void) | null>,
  setMessageCounts: (counts: { userCount: number; assistantCount: number }) => void
) => {
  // Caching and tracking refs
  const cachedSanitizedRef = useRef<{ signature: string; result: SanitizationResult } | null>(null);
  const previousUserCountRef = useRef(0);
  const previousAssistantCountRef = useRef(0);
  const previousMessagesRef = useRef<any[]>([]);
  const cachedFilteredRef = useRef<{ messages: any[]; filtered: any[] }>({ messages: [], filtered: [] });


  /**
   * Filters out thinking messages and empty messages.
   * Thinking messages contain <think> or <thinking> tags.
   * Caches results to avoid redundant filtering on reference-only changes.
   */
  // [FREEZE-DEBUG] filteredMessages memo call counter
  const filterMemoCallRef = useRef(0);
  const filterCacheHitRef = useRef(0);

  const filteredMessages = useMemo(() => {
    filterMemoCallRef.current += 1;
    const callNum = filterMemoCallRef.current;

    if (!messages || messages.length === 0) {
      previousMessagesRef.current = [];
      cachedFilteredRef.current = { messages: [], filtered: [] };
      return [];
    }

    // If only reference changed but elements are identical objects, return cached
    if (previousMessagesRef.current !== messages &&
        cachedFilteredRef.current.messages.length === messages.length) {
      const contentUnchanged = messages.every((msg, idx) => {
        const cachedMsg = cachedFilteredRef.current.messages[idx];
        // Use reference equality first (fast path), then fall back to ID comparison.
        // Avoid JSON.stringify here — it's O(content_size) per message and runs on
        // every streaming update, causing hundreds of expensive serializations per load.
        return msg === cachedMsg || msg?.id === cachedMsg?.id;
      });

      if (contentUnchanged) {
        filterCacheHitRef.current += 1;
        if (callNum % 200 === 0) {
          debug.log(
            `[FREEZE-DEBUG] filteredMessages memo call #${callNum}`,
            `| CACHE HIT (${filterCacheHitRef.current} total hits)`,
            `| msgs: ${messages.length}`,
          );
        }
        previousMessagesRef.current = messages;
        return cachedFilteredRef.current.filtered;
      }
    }

    // Filter out thinking messages (containing <think> or <thinking> tags), empty messages, and invalid content
    const filtered = messages.filter(message => {
      const { content } = message;
      
      if (content === undefined || content === null) {
        // Allow tool-call-only assistant messages (null content but has toolCalls) so
        // their tool call cards are rendered between user messages instead of being invisible.
        if (
          message.role === 'assistant' &&
          Array.isArray((message as any).toolCalls) &&
          (message as any).toolCalls.length > 0
        ) {
          return true;
        }
        return false;
      }
      
      if (typeof content === 'string') {
        // Filter out empty strings
        if (content.trim() === '') return false;
        
        // Filter out messages that are ONLY thinking blocks (no other content)
        // Keep messages that have thinking blocks + other content
        const hasThinkTag = content.includes('<think>') || content.includes('<thinking>');
        if (hasThinkTag) {
          // Remove thinking blocks and check if there's any remaining content
          const withoutThinking = content
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .trim();
          return withoutThinking.length > 0;
        }
        
        return true;
      }
      
      if (typeof content === 'object' && content !== null) {
        // Object content (multimodal arrays, tool results) never contains raw thinking
        // block tags — those only appear in assistant string messages. Skip the expensive
        // JSON.stringify check here; it was serializing entire tool results on every render.
        return true;
      }
      
      return true;
    });

    previousMessagesRef.current = messages;
    cachedFilteredRef.current = { messages, filtered };
    return filtered;
  }, [messages]);

  /**
   * Normalize tool_use blocks to include a tool_result block if the next block is missing.
   * This helps prevent Anthropic API rejection for transcripts.
   */
  const normalizeToolUse = (messages: any[]): { messages: any[]; changed: boolean } => {
    let anyChanged = false;

    const patched = messages.map((message) => {
      if (
        !message ||
        message.role !== 'assistant' ||
        !Array.isArray(message.content)
      ) {
        return message;
      }

      const newBlocks: any[] = [];
      const blocks = message.content as Array<{ type: string; [key: string]: any }>;
      let messageChanged = false;

      blocks.forEach((block, blockIndex) => {
        newBlocks.push(block);
        if (block?.type !== 'tool_use') {
          return;
        }

        const nextBlock = blocks[blockIndex + 1];
        const hasToolResult = nextBlock && nextBlock.type === 'tool_result';
        if (hasToolResult) {
          return;
        }

        const toolResult = {
          type: 'tool_result',
          tool_use_id: block?.id,
          content: [{ type: 'text', text: 'Completed with no explicit result.' }],
        };

        messageChanged = true;
        anyChanged = true;
        newBlocks.push(toolResult);
      });

      // Only create new object if this message was changed
      if (!messageChanged) {
        return message;
      }

      return {
        ...message,
        content: newBlocks,
      };
    });

    return { messages: patched, changed: anyChanged };
  };

  /**
   * Sanitize and deduplicate messages.
   * 
   * Operations:
   * 1. Filter out messages with invalid/missing role
   * 2. Normalize tool_use blocks to prevent API rejection
   * 3. Truncate large tool message content
   * 4. Normalize assistant content newlines
   * 
   * @param inputMessages - Array of messages to sanitize
   * @returns Object with sanitized messages and hasChanges flag
   */
  const sanitizeMessages = useCallback((inputMessages: any[]): SanitizationResult => {
    let hasChanges = false;
    
    // Step 1: Filter out null/undefined/non-object messages only
    // NOTE: We no longer filter by role - CopilotKit v1.50 manages its own message
    // types and we should preserve all valid messages
    const validMessages = inputMessages.filter(msg => {
      if (!msg || typeof msg !== 'object') {
        hasChanges = true;
        return false;
      }
      return true;
    });
    
    // Step 2: Normalize tool_use blocks (single call)
    const normalizedResult = normalizeToolUse(validMessages);
    if (normalizedResult.changed) {
      hasChanges = true;
    }
    
    // Step 3: Truncate and normalize content
    const sanitizedMessages = normalizedResult.messages.map((message: any) => {

      // Truncate large tool message content
      if (message.role === 'tool' && message.id?.includes('result') && TRUNCATABLE_TOOLS.has(message.toolName || '')) {
          const needsTruncation = 
          (typeof message.content === 'string' && 
           message.content.length > TRUNCATION_LIMITS.SHORT_TEXT && 
           !isAlreadyTruncated(message.content)) ||
            (typeof message.content === 'object' && message.content !== null && 
           JSON.stringify(message.content).length > TRUNCATION_LIMITS.LONG_TEXT && 
             !JSON.stringify(message.content).includes(TRUNCATION_SUFFIX));
          
          if (needsTruncation) {
            hasChanges = true;
          return { ...message, content: truncateToolResult(message.content, message.toolName) };
        }
      }

      // Normalize assistant content newlines (max 2 consecutive newlines)
      if (message.role === 'assistant' && typeof message.content === 'string') {
        const normalizedNewlines = message.content.replace(/(\r?\n)(?:\s*\r?\n){2,}/g, '\n\n');
        if (normalizedNewlines !== message.content) {
          hasChanges = true;
          return { ...message, content: normalizedNewlines };
        }
      }
      
      // Return original reference when unchanged (no copy)
      return message;
    });

    // Return sanitized messages
    return { messages: sanitizedMessages, hasChanges };
  }, []);

  /**
   * Expose save functionality through ref
   * Returns both ALL messages (sanitized) and filtered messages
   * Uses caching to avoid redundant sanitization
   */
  useEffect(() => {
    saveMessagesRef.current = () => {
      const signature = computeMessagesSignature(messages || []);
      let result: SanitizationResult;
      
      // Use cached result if signature matches
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
  }, [messages, filteredMessages, saveMessagesRef, sanitizeMessages, computeMessagesSignature]);

  /**
   * Expose restore functionality through ref
   * Sanitizes and deduplicates on restore
   * Only updates if content actually changed
   */
  useEffect(() => {
    restoreMessagesRef.current = (messagesToRestore: any[]) => {
      const safeMessages = Array.isArray(messagesToRestore) ? messagesToRestore : [];
      const result = sanitizeMessages(safeMessages);

      // Guard: only update if content actually changed compared to current state
      const currentSig = computeMessagesSignature(messages || []);
      const nextSig = computeMessagesSignature(result.messages || []);

      if (result.hasChanges || currentSig !== nextSig) {
        setMessages(result.messages);

        // Auto-close all ThinkingBlock instances after restore
        try {
          // Dispatch immediately
          window.dispatchEvent(new CustomEvent('thinking-close-all'));
          // Schedule another dispatch for after render completes
          if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
            requestAnimationFrame(() => {
              window.dispatchEvent(new CustomEvent('thinking-close-all'));
            });
          }
        } catch {}
      }
    };
  }, [setMessages, restoreMessagesRef, messages, sanitizeMessages, computeMessagesSignature]);

  /**
   * Update message counts whenever filtered messages change
   * Counts USER and ASSISTANT messages separately (ignores tool calls and other types)
   * PERFORMANCE: Only updates if counts actually changed
   */
  useEffect(() => {
    let userCount = 0;
    let assistantCount = 0;
    for (const msg of filteredMessages) {
      if (!msg) continue;
      if (msg.role === 'user') userCount++;
      else if (msg.role === 'assistant') assistantCount++;
    }

    if (userCount !== previousUserCountRef.current || assistantCount !== previousAssistantCountRef.current) {
      setMessageCounts({ userCount, assistantCount });
      previousUserCountRef.current = userCount;
      previousAssistantCountRef.current = assistantCount;
    }
  }, [filteredMessages, setMessageCounts]);

  return {
    filteredMessages,
    sanitizeMessages,
    computeMessagesSignature,
    cachedSanitizedRef,
  };
};

