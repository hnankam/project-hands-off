/**
 * ================================================================================
 * Sanitization Helper
 * ================================================================================
 * 
 * Provides reusable message sanitization logic to avoid code duplication.
 * Used by both onSubmitMessage and onInProgress callbacks in ChatInner.
 * 
 * @module sanitizationHelper
 * ================================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Valid message roles
 */
export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';

/**
 * Valid message roles as a readonly array for type guards
 */
const VALID_ROLES: readonly MessageRole[] = ['user', 'assistant', 'tool', 'system'] as const;

/**
 * Message interface with common fields
 */
export interface Message {
  id?: string;
  role?: string;
  content?: unknown;
}

/**
 * Type guard to check if a message has a valid role
 */
export function hasValidRole(message: unknown): message is Message & { role: MessageRole } {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  const msg = message as Message;
  return (
    typeof msg.role === 'string' &&
    (VALID_ROLES as readonly string[]).includes(msg.role)
  );
}

/**
 * Type guard to check if value is a Message
 */
export function isMessage(value: unknown): value is Message {
  return (
    value !== null &&
    typeof value === 'object' &&
    ('id' in value || 'role' in value || 'content' in value)
  );
}

/**
 * Sanitization result with typed messages
 */
export interface SanitizationResult {
  messages: unknown[];
  hasChanges: boolean;
}

/**
 * Cached sanitization with signature
 */
export interface CachedSanitization {
  signature: string;
  result: SanitizationResult;
}

/**
 * Generic mutable ref type (React-compatible without requiring React import)
 */
export interface MutableRefObject<T> {
  current: T;
}

// ============================================================================
// SIGNATURE COMPUTATION
// ============================================================================

/**
 * Compute a compact signature for a message array.
 * Used to detect if messages have changed and avoid redundant processing.
 * 
 * @param list - Array of messages
 * @returns Signature string
 * 
 * @example
 * ```typescript
 * const sig1 = computeMessagesSignature(messages);
 * const sig2 = computeMessagesSignature(messages); // Same signature if unchanged
 * ```
 */
export const computeMessagesSignature = (list: unknown[]): string => {
  try {
    const signatures = list.map((m) => {
      if (!isMessage(m)) {
        return null;
      }
      return {
        id: m.id,
        role: m.role,
        len: typeof m.content === 'string' ? m.content.length : 0
      };
    });
    
    return JSON.stringify(signatures);
  } catch (error) {
    // Fallback to length-based signature if JSON serialization fails
    return String(list?.length || 0);
  }
};

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

/**
 * Run sanitization with caching to avoid redundant work.
 * Returns cached result if signature matches, otherwise sanitizes and caches.
 * 
 * @param messages - Messages to sanitize
 * @param cachedRef - Mutable ref to store cached results
 * @param sanitizeMessages - Function to perform actual sanitization
 * @returns Sanitization result (from cache or fresh)
 * 
 * @example
 * ```typescript
 * const result = runCachedSanitization(
 *   messages,
 *   sanitizationCacheRef,
 *   (msgs) => ({ messages: sanitize(msgs), hasChanges: true })
 * );
 * ```
 */
export const runCachedSanitization = (
  messages: unknown[],
  cachedRef: MutableRefObject<CachedSanitization | null>,
  sanitizeMessages: (msgs: unknown[]) => SanitizationResult
): SanitizationResult => {
  const signature = computeMessagesSignature(messages);
  
  // Return cached result if signature matches
  if (cachedRef.current && cachedRef.current.signature === signature) {
    return cachedRef.current.result;
  }
  
  // Run sanitization and cache result
  const result = sanitizeMessages(messages);
  cachedRef.current = { signature, result };
  
  return result;
};

/**
 * Apply sanitization result to messages if changes were detected.
 * Uses requestAnimationFrame for non-blocking updates.
 * 
 * @param result - Sanitization result
 * @param currentSignature - Signature of current messages
 * @param setMessages - Function to update messages (accepts any type of message array)
 * 
 * @example
 * ```typescript
 * applySanitizationIfChanged(
 *   sanitizationResult,
 *   computeMessagesSignature(currentMessages),
 *   setMessages
 * );
 * ```
 */
export const applySanitizationIfChanged = <T = unknown>(
  result: SanitizationResult,
  currentSignature: string,
  setMessages: (msgs: T[]) => void
): void => {
  if (!result.hasChanges) return;
  
  const resultSignature = computeMessagesSignature(result.messages);
  if (resultSignature === currentSignature) return;
  
  // Schedule for next animation frame to avoid blocking
  if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
    requestAnimationFrame(() => setMessages(result.messages as T[]));
  } else {
    setMessages(result.messages as T[]);
  }
};

// ============================================================================
// MESSAGE FILTERING AND SEARCH
// ============================================================================

/**
 * Filter messages to only include those with valid roles.
 * Used before reloading messages to prevent API errors.
 * 
 * @param messages - Messages to filter
 * @returns Array of messages with valid roles
 * 
 * @example
 * ```typescript
 * const validMessages = filterValidMessages(allMessages);
 * // Only messages with 'user', 'assistant', 'tool', or 'system' roles
 * ```
 */
export const filterValidMessages = (messages: unknown[]): unknown[] => {
  return messages.filter(hasValidRole);
};

/**
 * Find the last message with a specific role.
 * Iterates backward through the array for efficiency.
 * 
 * @param messages - Messages to search
 * @param role - Role to find
 * @returns Last message with the specified role, or undefined
 * 
 * @example
 * ```typescript
 * const lastUserMessage = findLastMessageByRole(messages, 'user');
 * if (lastUserMessage) {
 *   console.log('Last user message:', lastUserMessage.content);
 * }
 * ```
 */
export const findLastMessageByRole = (
  messages: unknown[],
  role: MessageRole
): Message | undefined => {
  // Iterate backward without creating a new array (more efficient)
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (isMessage(message) && message.role === role) {
      return message;
    }
  }
  
  return undefined;
};
