import { useRef, useMemo, useCallback, useEffect } from 'react';

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
   * PERFORMANCE OPTIMIZATION: Memoize filtered messages to avoid duplicate filtering
   * Filters out:
   * - "Thinking" messages (content starting with **)
   * - Empty messages
   * - Messages with invalid content
   */
  const filteredMessages = useMemo(() => {
    if (!messages || messages.length === 0) {
      return [];
    }

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

  /**
   * Sanitize and deduplicate messages
   * 
   * Operations performed:
   * 1. Retain only last 500 messages
   * 2. Truncate large tool message content (>100 chars)
   * 3. Normalize thinking tags in assistant messages
   * 
   * @param messagesToProcess - Array of messages to sanitize
   * @returns Object with sanitized messages and hasChanges flag
   */
  const sanitizeMessages = useCallback((messagesToProcess: any[]): SanitizationResult => {
    let hasChanges = false;

    // Retain only the last 500 messages
    let retainedMessages = messagesToProcess;
    if (messagesToProcess.length > 500) {
      retainedMessages = messagesToProcess.slice(-500);
      hasChanges = true;
    }

    // PERFORMANCE: Pre-compile regex patterns once (outside the inner function)
    const THINKING_OPEN_RE = /<thinking\s*>/i;
    const THINKING_CLOSE_RE = /<\/thinking\s*>/i;
    const THINKING_TAGS_RE = /<\/?thinking\s*>/gi;
    const DOUBLE_NEWLINE_RE = /\r?\n\r?\n/;
    
    // PERFORMANCE: Use Set for O(1) lookup instead of array.includes()
    const TRUNCATABLE_TOOLS = new Set([
      'searchPageContent',
      'searchFormData',
      'searchDOMUpdates',
      'searchClickableElements',
      'takeScreenshot',
    ]);

    // Helper: normalize <thinking> tags in assistant content
    const normalizeThinking = (text: string): { text: string; changed: boolean } => {
      try {
        // PERFORMANCE: Early exit if no thinking tags present
        if (!text.includes('<thinking')) return { text, changed: false };
        
        const openMatch = text.match(THINKING_OPEN_RE);
        if (!openMatch) return { text, changed: false };

        const openIndex = openMatch.index ?? -1;
        const beforeThinking = text.slice(0, openIndex);
        const afterOpen = text.slice(openIndex + openMatch[0].length);
        const closeMatch = afterOpen.match(THINKING_CLOSE_RE);

        let thinkingContent: string;
        let afterThinking: string;
        
        if (closeMatch && closeMatch.index !== undefined) {
          thinkingContent = afterOpen.slice(0, closeMatch.index);
          afterThinking = afterOpen.slice(closeMatch.index + closeMatch[0].length);
        } else {
          // If no explicit close tag, heuristically close at first double newline or end
          const dblNl = afterOpen.search(DOUBLE_NEWLINE_RE);
          if (dblNl >= 0) {
            thinkingContent = afterOpen.slice(0, dblNl);
            afterThinking = afterOpen.slice(dblNl);
          } else {
            thinkingContent = afterOpen;
            afterThinking = '';
          }
        }

        // Remove any stray thinking tags from content
        let cleanedThinking = thinkingContent.replace(THINKING_TAGS_RE, '').trim();
        const cleanedAfter = afterThinking.replace(THINKING_TAGS_RE, '').trim();
        
        // Collapse multiple blank lines inside the thinking content to a single newline
        cleanedThinking = cleanedThinking.replace(/(\r?\n)\s*(\r?\n)+/g, '$1');
        
        // Reconstruct: thinking block MUST be isolated with blank lines
        const parts = [];
        if (beforeThinking.trim()) parts.push(beforeThinking.trim());
        
        // Critical: Thinking block must be completely isolated with newlines
        if (cleanedThinking) {
          parts.push(`<thinking>\n\n${cleanedThinking}\n\n</thinking>`);
        }
        
        if (cleanedAfter) parts.push(cleanedAfter);
        
        // Join with double newline for paragraph separation
        return { text: parts.join('\n\n'), changed: true };
      } catch {
        return { text, changed: false };
      }
    };

    // Helper: Smart truncate tool results preserving JSON structure and counts
    const truncateToolResult = (content: string, toolName: string): string => {
      try {
        const parsed = JSON.parse(content);
        
        // Special handling for takeScreenshot - different structure (no results array)
        if (toolName === 'takeScreenshot') {
          const truncated: any = {
            status: parsed.status,
            message: parsed.message,
          };
          
          // Preserve screenshotInfo metadata, but truncate dataUrl
          if (parsed.screenshotInfo) {
            truncated.screenshotInfo = {
              format: parsed.screenshotInfo.format,
              dimensions: parsed.screenshotInfo.dimensions,
              sizeKB: parsed.screenshotInfo.sizeKB,
              quality: parsed.screenshotInfo.quality,
              isFullPage: parsed.screenshotInfo.isFullPage,
              url: parsed.screenshotInfo.url,
              // Truncate the large dataUrl base64 string
              dataUrl: parsed.screenshotInfo.dataUrl 
                ? '...truncated base64 data...' 
                : undefined,
            };
          }
          
          return JSON.stringify(truncated);
        }
        
        // For search tools: Preserve COMPLETE top-level structure
        const truncated: any = {};
        
        // Preserve all top-level fields in original order
        if (parsed.success !== undefined) truncated.success = parsed.success;
        if (parsed.query !== undefined) truncated.query = parsed.query;
        if (parsed.resultsCount !== undefined) truncated.resultsCount = parsed.resultsCount; // Critical for ActionStatus
        if (parsed.error !== undefined) truncated.error = parsed.error;
        
        // Truncate results array while preserving structure
        if (Array.isArray(parsed.results)) {
          truncated.results = parsed.results.map((item: any, index: number) => {
            // Keep only first 2 results with essential fields
            if (index >= 2) return { _note: '...truncated...' };
            
            // Preserve essential fields based on tool type
            if (toolName === 'searchPageContent') {
              return { 
                rank: item.rank, 
                similarity: item.similarity,
                text: typeof item.text === 'string' ? item.text.substring(0, 100) + '...' : item.text 
              };
            } else if (toolName === 'searchFormData') {
              return { 
                rank: item.rank, 
                similarity: item.similarity,
                selector: item.selector, 
                type: item.type, 
                name: item.name 
              };
            } else if (toolName === 'searchClickableElements') {
              return { 
                rank: item.rank, 
                similarity: item.similarity,
                selector: item.selector, 
                text: typeof item.text === 'string' ? item.text.substring(0, 50) : item.text 
              };
            } else if (toolName === 'searchDOMUpdates') {
              return { 
                rank: item.rank, 
                similarity: item.similarity,
                summary: typeof item.summary === 'string' ? item.summary.substring(0, 100) : item.summary, 
                timeAgo: item.timeAgo 
              };
            }
            
            // Generic truncation for other tools - keep essential fields
            const { rank, similarity, selector, text, name, type, ...rest } = item;
            return { rank, similarity, selector, text, name, type, _truncated: true };
          });
        } else if (parsed.results !== undefined) {
          // results exists but is not an array (e.g. null or empty) - preserve as-is
          truncated.results = parsed.results;
        }
        
        return JSON.stringify(truncated);
      } catch {
        // Not JSON or parse failed, do simple truncation
        return content.substring(0, 90) + '...';
      }
    };

    // Helper: Check if content is already truncated
    const isAlreadyTruncated = (content: string): boolean => {
      try {
        const parsed = JSON.parse(content);
        
        // Check for takeScreenshot truncation marker
        if (parsed.screenshotInfo?.dataUrl === '...truncated base64 data...') {
          return true;
        }
        
        // Check if results array contains truncation markers
        return Array.isArray(parsed.results) && parsed.results.some((r: any) => 
          r?._note === '...truncated...' || r?._truncated === true
        );
      } catch {
        // Not JSON, check simple string truncation
        return content.endsWith('...');
      }
    };

    // PERFORMANCE: Sanitize in single pass - only create new objects if modified
    const sanitizedMessages = retainedMessages.map((message) => {
      // Truncate large tool message content
      if (message.role === 'tool' && message.id?.includes('result') && message.content?.length > 100) {
        const tool_name = message.toolName || '';
        // PERFORMANCE: Use Set.has() instead of array.includes() - O(1) vs O(n)
        if (TRUNCATABLE_TOOLS.has(tool_name) && !isAlreadyTruncated(message.content)) {
            hasChanges = true;
          const truncatedContent = truncateToolResult(message.content, tool_name);
          return { ...message, content: truncatedContent };
        }
      }

      // Normalize assistant content thinking tags
      if (message.role === 'assistant' && typeof message.content === 'string') {
        const normalized = normalizeThinking(message.content);
        if (normalized.changed) {
          hasChanges = true;
          return { ...message, content: normalized.text };
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
      if (messagesToRestore && messagesToRestore.length > 0) {
        const result = sanitizeMessages(messagesToRestore);
        
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
      }
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
  }, [filteredMessages, setHeadlessMessagesCount]);

  return {
    filteredMessages,
    sanitizeMessages,
    computeMessagesSignature,
    lastSanitizedRef,
    lastSanitizeAtRef,
    cachedSanitizedRef,
  };
};

