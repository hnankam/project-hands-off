/**
 * MessageOperationsContext
 *
 * Provides stable references to setMessages and reloadMessages so that
 * individual message components (CustomAssistantMessageV2, CustomUserMessageV2)
 * do NOT need to call useCopilotChat() directly.
 *
 * Why this matters: useCopilotChat() subscribes the calling component to
 * CopilotKit's global messages state. When the session loads (SSE stream
 * delivers hundreds of events), CopilotKit updates messages frequently, and
 * EVERY component that called useCopilotChat() re-renders each time. With
 * 200 mounted message components, that is 200× the re-render count.
 *
 * This context provides:
 * - setMessages / reloadMessages: stable function refs from ChatInner's
 *   useCopilotChat() call (the one place where we MUST subscribe).
 * - getMessages(): reads messages via a ref — no subscription, no re-render.
 *
 * Message components use getMessages() only at interaction time (click handlers,
 * not during render), so stale-value risk is negligible.
 */

import { createContext, useContext } from 'react';
import type { Message } from '@ag-ui/core';

export interface MessageOperations {
  /** Read current messages without subscribing to state updates. Safe to call in event handlers. */
  getMessages: () => Message[];
  setMessages: (messages: Message[]) => void;
  reloadMessages: (messageId?: string) => void;
}

const noop = () => {};

const MessageOperationsContext = createContext<MessageOperations>({
  getMessages: () => [],
  setMessages: noop,
  reloadMessages: noop,
});

export const MessageOperationsProvider = MessageOperationsContext.Provider;

export const useMessageOperations = (): MessageOperations =>
  useContext(MessageOperationsContext);
