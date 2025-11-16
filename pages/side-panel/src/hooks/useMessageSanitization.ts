import { useRef, useMemo, useCallback, useEffect } from 'react';

const TRUNCATION_SUFFIX = '... [output truncated]';
const TRUNCATABLE_TOOLS = new Set([
  'searchPageContent',
  'searchFormData',
  'searchDOMUpdates',
  'searchClickableElements',
  'takeScreenshot',
]);

const isAlreadyTruncated = (content: string): boolean => {
  return typeof content === 'string' && content.endsWith(TRUNCATION_SUFFIX);
};

/**
 * Smart truncation that preserves JSON structure and stats
 * Only truncates large content fields (text, html, dataUrl) while keeping metadata
 */
const truncateToolResult = (content: any, toolName: string): any => {
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
      if (content.length <= 100) return content;
      return `${content.slice(0, 100)}${TRUNCATION_SUFFIX}`;
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
        
        // Truncate text field (keep first 200 chars)
        if (typeof result.text === 'string' && result.text.length > 200) {
          truncatedResult.text = result.text.slice(0, 200) + TRUNCATION_SUFFIX;
        }
        
        // Truncate html field (keep first 200 chars)
        if (typeof result.html === 'string' && result.html.length > 200) {
          truncatedResult.html = result.html.slice(0, 200) + TRUNCATION_SUFFIX;
        }
        
        // Truncate any other large string fields
        Object.keys(truncatedResult).forEach(key => {
          if (typeof truncatedResult[key] === 'string' && 
              truncatedResult[key].length > 500 &&
              key !== 'selector' && // Keep selectors intact
              key !== 'name' && 
              key !== 'id' &&
              key !== 'type') {
            truncatedResult[key] = truncatedResult[key].slice(0, 200) + TRUNCATION_SUFFIX;
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
      if (dataUrl.length > 100) {
        // Keep the data URL prefix (data:image/jpeg;base64,) and truncate the base64 part
        const prefixMatch = dataUrl.match(/^(data:image\/[^;]+;base64,)/);
        if (prefixMatch) {
          truncated.screenshotInfo.dataUrl = prefixMatch[1] + dataUrl.slice(prefixMatch[1].length, prefixMatch[1].length + 50) + TRUNCATION_SUFFIX;
        } else {
          truncated.screenshotInfo.dataUrl = dataUrl.slice(0, 100) + TRUNCATION_SUFFIX;
        }
      }
    }
    
    // Truncate message if it's extremely long (but keep attachment manifest)
    if (typeof truncated.message === 'string' && truncated.message.length > 1000) {
      // Try to preserve the attachment manifest at the end
      const attachmentMatch = truncated.message.match(/(<!--ATTACHMENTS:[\s\S]*?-->)/);
      if (attachmentMatch) {
        const mainMessage = truncated.message.slice(0, truncated.message.indexOf(attachmentMatch[0]));
        truncated.message = (mainMessage.length > 500 ? mainMessage.slice(0, 500) + TRUNCATION_SUFFIX : mainMessage) + attachmentMatch[0];
      } else {
        truncated.message = truncated.message.slice(0, 500) + TRUNCATION_SUFFIX;
      }
    }
  } else {
    // Generic truncation for other tools
    // Truncate any string fields longer than 500 chars
    Object.keys(truncated).forEach(key => {
      if (typeof truncated[key] === 'string' && truncated[key].length > 500) {
        truncated[key] = truncated[key].slice(0, 200) + TRUNCATION_SUFFIX;
      } else if (Array.isArray(truncated[key])) {
        // Recursively truncate array items
        truncated[key] = truncated[key].map((item: any) => {
          if (typeof item === 'string' && item.length > 500) {
            return item.slice(0, 200) + TRUNCATION_SUFFIX;
          } else if (typeof item === 'object') {
            return truncateToolResult(item, toolName);
          }
          return item;
        });
      }
    });
  }

  // Return in the same format as input
  // If input was a JSON string, return a JSON string
  // If input was an object, return an object
  if (wasString) {
    try {
      return JSON.stringify(truncated);
    } catch {
      return truncated;
    }
  }
  
  return truncated;
};

// normalizeThinking removed - CustomAssistantMessage handles tag extraction and rendering directly

/**
 * Message data structure returned by saveMessages
 */
export interface MessageData {
  allMessages: any[];
  filteredMessages: any[];
}

/**
 * Result from sanitization operations
 */
interface SanitizationResult {
  messages: any[];
  hasChanges: boolean;
}

/**
 * useMessageSanitization Hook
 * 
 * Handles message sanitization, deduplication, and filtering for chat messages.
 * Provides methods to save and restore messages while maintaining data integrity.
 * 
 * Features:
 * - Truncates large tool messages (>100 chars) to reduce memory
 * - Retains only last 500 messages to prevent unbounded growth
 * - Filters out "thinking" messages (content starting with **)
 * - Caches sanitization results to avoid redundant processing
 * - Provides stable refs for save/restore operations
 * 
 * @param messages - Current array of chat messages
 * @param setMessages - Function to update messages
 * @param saveMessagesRef - Ref to expose save functionality
 * @param restoreMessagesRef - Ref to expose restore functionality
 * @param setHeadlessMessagesCount - Callback to update filtered message count
 * 
 * @returns Object containing:
 *   - filteredMessages: Messages excluding "thinking" and empty messages
 *   - sanitizeMessages: Function to sanitize and deduplicate messages
 *   - computeMessagesSignature: Function to compute message signature for comparison
 */
export const useMessageSanitization = (
  messages: any[],
  setMessages: (messages: any[]) => void,
  saveMessagesRef: React.MutableRefObject<(() => MessageData) | null>,
  restoreMessagesRef: React.MutableRefObject<((messages: any[]) => void) | null>,
  setHeadlessMessagesCount: (count: number) => void
) => {
  // Track last sanitized signature and time to prevent loops/thrashing
  const lastSanitizedRef = useRef<string>('');
  const lastSanitizeAtRef = useRef<number>(0);
  const cachedSanitizedRef = useRef<{ signature: string; result: SanitizationResult } | null>(null);
  const previousCountRef = useRef(0);
  const previousMessagesLengthRef = useRef(0);
  const previousMessagesRef = useRef<any[]>([]);
  const cachedFilteredRef = useRef<{ messages: any[]; filtered: any[] }>({ messages: [], filtered: [] });

  /**
   * Compute a compact signature representing the relevant message content
   * Used to detect if messages have changed and avoid redundant processing
   */
  const computeMessagesSignature = useCallback((list: any[]) => {
    try {
      return JSON.stringify(
        list.map((m: any) => ({ id: m.id, role: m.role, len: typeof m.content === 'string' ? m.content.length : 0 }))
      );
    } catch {
      return String(list?.length || 0);
    }
  }, []);

  /**
   * Track when messages array changes (even if content is the same)
   * This helps identify CopilotKit reference changes
   */
  useEffect(() => {
    const currentLength = messages?.length || 0;
    previousMessagesLengthRef.current = currentLength;
  }, [messages]);

  /**
   * PERFORMANCE OPTIMIZATION: Memoize filtered messages to avoid duplicate filtering
   * Filters out:
   * - "Thinking" messages (content starting with **)
   * - Empty messages
   * - Messages with invalid content
   */
  const filteredMessages = useMemo(() => {
    if (!messages || messages.length === 0) {
      console.log('🔍 [useMessageSanitization] Messages empty, returning empty filtered array');
      previousMessagesRef.current = [];
      cachedFilteredRef.current = { messages: [], filtered: [] };
      return [];
    }

    // Check if this is a reference change vs content change
    const isReferenceChange = previousMessagesRef.current !== messages;
    
    // If only reference changed but content is identical, return cached result
    if (isReferenceChange && cachedFilteredRef.current.messages.length === messages.length) {
      const contentUnchanged = messages.every((msg, idx) => {
        const cachedMsg = cachedFilteredRef.current.messages[idx];
        return (
          msg === cachedMsg ||
          (msg?.id === cachedMsg?.id && JSON.stringify(msg?.content) === JSON.stringify(cachedMsg?.content))
        );
      });

      if (contentUnchanged) {
        // Reference-only change detected - return cached result without logging
        previousMessagesRef.current = messages;
        return cachedFilteredRef.current.filtered;
      }
    }

    const isContentChange = isReferenceChange && (
      previousMessagesRef.current.length !== messages.length ||
      !previousMessagesRef.current.every((msg, idx) => 
        msg === messages[idx] || 
        (msg?.id === messages[idx]?.id && JSON.stringify(msg?.content) === JSON.stringify(messages[idx]?.content))
      )
    );

    // Content changed - filtering messages

    const filtered = messages.filter(message => {
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

    previousMessagesRef.current = messages;
    cachedFilteredRef.current = { messages, filtered };
    return filtered;
  }, [messages]);

  /**
   * Normalize tool_use blocks to include a tool_result block if the next block is missing.
   * This helps prevent Anthropic API rejection for transcripts.
   */
  const normalizeToolUse = (messages: any[]): { messages: any[]; changed: boolean } => {
    let changed = false;

    const patched = messages.map((message, index) => {
      if (
        !message ||
        message.role !== 'assistant' ||
        !Array.isArray(message.content)
      ) {
        return message;
      }

      const newBlocks: any[] = [];
      const blocks = message.content as Array<{ type: string; [key: string]: any }>;

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

        changed = true;
        newBlocks.push(toolResult);
      });

      if (!changed) {
        return message;
      }

      return {
        ...message,
        content: newBlocks,
      };
    });

    return { messages: patched, changed };
  };

  /**
   * Sanitize and deduplicate messages
   * 
   * Operations performed:
   * 1. Filter out messages with invalid/missing role property
   * 2. Retain only last 500 messages
   * 3. Truncate large tool message content (>100 chars)
   * 4. Normalize thinking tags in assistant messages
   * 
   * @param messagesToProcess - Array of messages to sanitize
   * @returns Object with sanitized messages and hasChanges flag
   */
  const sanitizeMessages = useCallback((inputMessages: any[]): SanitizationResult => {
    let hasChanges = false;
    
    // Step 1: Filter out messages with undefined/invalid role
    const validMessages = inputMessages.filter(msg => {
      if (!msg || typeof msg !== 'object') {
        hasChanges = true;
        return false;
      }
      // Ensure role property exists and is valid
      if (!msg.role || typeof msg.role !== 'string' || !['user', 'assistant', 'tool', 'system'].includes(msg.role)) {
        console.warn('[useMessageSanitization] Filtering out message with invalid role:', msg.role);
        hasChanges = true;
        return false;
      }
      return true;
    });
    
    const messages = normalizeToolUse(validMessages).messages;
    const normalizedMessages = normalizeToolUse(messages);
    if (normalizedMessages.changed) {
      hasChanges = true;
    }
    const sanitizedMessages = normalizedMessages.messages.map((message: any, index: number) => {
      const signature = computeMessagesSignature(message);
      const cached = cachedSanitizedRef.current?.result.messages[index];
      if (cached && cached.signature === signature) {
        return cached.result;
      }

      // Truncate large tool message content
      if (message.role === 'tool' && message.id?.includes('result')) {
        const tool_name = message.toolName || '';
        // PERFORMANCE: Use Set.has() instead of array.includes() - O(1) vs O(n)
        if (TRUNCATABLE_TOOLS.has(tool_name)) {
          // Check if content needs truncation (string > 100 chars OR object with large fields)
          const needsTruncation = 
            (typeof message.content === 'string' && message.content.length > 100 && !isAlreadyTruncated(message.content)) ||
            (typeof message.content === 'object' && message.content !== null && 
             JSON.stringify(message.content).length > 500 && 
             !JSON.stringify(message.content).includes(TRUNCATION_SUFFIX));
          
          if (needsTruncation) {
            hasChanges = true;
            const truncatedContent = truncateToolResult(message.content, tool_name);
            return { ...message, content: truncatedContent };
          }
        }
      }

      // Normalize assistant content newlines only (no tag processing needed)
      // CustomAssistantMessage handles tag extraction and rendering directly
      if (message.role === 'assistant' && typeof message.content === 'string') {
        // Apply general newline normalization: max 2 consecutive newlines
        const normalizedNewlines = message.content.replace(/(\r?\n)(?:\s*\r?\n){2,}/g, '\n\n');
        if (normalizedNewlines !== message.content) {
          hasChanges = true;
          return { ...message, content: normalizedNewlines };
        }
      }
      
      // PERFORMANCE: Return original reference (not a copy) when unchanged
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

        // Auto-close all ThinkingBlock instances immediately after restore
        try {
          window.dispatchEvent(new CustomEvent('thinking-close-all'));
          if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
            requestAnimationFrame(() => {
              window.dispatchEvent(new CustomEvent('thinking-close-all'));
            });
          } else {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('thinking-close-all'));
            }, 0);
          }
        } catch {}
      }
      // No-op when nothing changed
    };
  }, [setMessages, restoreMessagesRef, messages, sanitizeMessages, computeMessagesSignature]);

  /**
   * Update message count whenever filtered messages change
   * PERFORMANCE: Only updates if count actually changed
   */
  useEffect(() => {
    const newCount = filteredMessages.length;
    if (newCount !== previousCountRef.current) {
      setHeadlessMessagesCount(newCount);
      previousCountRef.current = newCount;
    }
  }, [filteredMessages, setHeadlessMessagesCount, messages]);

  return {
    filteredMessages,
    sanitizeMessages,
    computeMessagesSignature,
    lastSanitizedRef,
    lastSanitizeAtRef,
    cachedSanitizedRef,
  };
};

