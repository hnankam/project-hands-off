import React, { createContext, useContext } from 'react';

/**
 * Context to provide session ID to deeply nested chat components
 * This allows components like CustomUserMessage to access the session ID
 * without prop drilling through CopilotKit's component hierarchy
 */
interface ChatSessionIdContextValue {
  sessionId: string;
}

const ChatSessionIdContext = createContext<ChatSessionIdContextValue | null>(null);

export const ChatSessionIdProvider: React.FC<{
  sessionId: string;
  children: React.ReactNode;
}> = ({ sessionId, children }) => {
  return <ChatSessionIdContext.Provider value={{ sessionId }}>{children}</ChatSessionIdContext.Provider>;
};

export const useChatSessionId = (): string => {
  const context = useContext(ChatSessionIdContext);
  if (!context) {
    throw new Error('useChatSessionId must be used within a ChatSessionIdProvider');
  }
  return context.sessionId;
};

/**
 * Safe version that returns null if not in provider
 * Useful for components that may be used outside the chat context
 */
export const useChatSessionIdSafe = (): string | null => {
  const context = useContext(ChatSessionIdContext);
  return context?.sessionId ?? null;
};
