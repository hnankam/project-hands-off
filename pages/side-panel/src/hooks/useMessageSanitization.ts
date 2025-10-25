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
   * 3. Track if any changes were made
   * 
   * @param messagesToProcess - Array of messages to sanitize
   * @returns Object with sanitized messages and hasChanges flag
   */
  const sanitizeMessages = useCallback((messagesToProcess: any[]): SanitizationResult => {
    console.log('[useMessageSanitization] Sanitizing and deduplicating messages...');

    let hasChanges = false;

    // Retain only the last 500 messages
    let retainedMessages = messagesToProcess;
    if (messagesToProcess.length > 500) {
      retainedMessages = messagesToProcess.slice(-500);
      hasChanges = true;
      console.log('[useMessageSanitization] Retained last 500 messages from', messagesToProcess.length);
    }

    // Helper: normalize <thinking> tags in assistant content so only the content between
    // the first well-formed pair renders inside ThinkingBlock, preventing the entire
    // assistant response from being captured when tags are malformed or repeated.
    const normalizeThinking = (text: string): { text: string; changed: boolean } => {
      try {
        const openRe = /<thinking\s*>/i;
        const closeRe = /<\/thinking\s*>/i;
        const openMatch = text.match(openRe);
        if (!openMatch) return { text, changed: false };

        const openIndex = openMatch.index ?? -1;
        const afterOpen = text.slice(openIndex + openMatch[0].length);
        const closeMatch = afterOpen.match(closeRe);

        let thinkingContent: string;
        let rest: string;
        if (closeMatch && closeMatch.index !== undefined) {
          thinkingContent = afterOpen.slice(0, closeMatch.index);
          rest = afterOpen.slice(closeMatch.index + closeMatch[0].length);
        } else {
          // If no explicit close tag, heuristically close at first double newline or end
          const dblNl = afterOpen.search(/\r?\n\r?\n/);
          if (dblNl >= 0) {
            thinkingContent = afterOpen.slice(0, dblNl);
            rest = afterOpen.slice(dblNl);
          } else {
            thinkingContent = afterOpen;
            rest = '';
          }
        }

        // Remove any stray thinking tags from the rest of the content
        const cleanedRest = rest.replace(/<\/?thinking\s*>/gi, '');
        const normalized = `${text.slice(0, openIndex)}<thinking>${thinkingContent}</thinking>${cleanedRest}`;
        return { text: normalized, changed: true };
      } catch {
        return { text, changed: false };
      }
    };

    // Sanitize large tool call content and normalize assistant thinking tags - only create new objects if we modify something
    const sanitizedMessages = retainedMessages.map((message) => {
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
            console.log('[useMessageSanitization] Truncating content for tool call:', tool_name, message.id);
            hasChanges = true;
            return { ...message, content: message.content.substring(0, 90) + '...' };
          }
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
      // Return original object if no changes needed
      return message;
    });

    // Client-side deduplication disabled: keep all sanitized messages as-is
    const finalMessages = sanitizedMessages;

    console.log('[useMessageSanitization] Sanitization complete:', {
      original: messagesToProcess.length,
      retained: retainedMessages.length,
      sanitized: sanitizedMessages.length,
      final: finalMessages.length,
      removed: messagesToProcess.length - finalMessages.length,
      hasChanges,
    });

    return { messages: finalMessages, hasChanges };
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

