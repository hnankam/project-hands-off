/**
 * Centralized CopilotKit Chat Hook
 *
 * V2 Implementation using shared agent from SharedAgentProvider.
 * Requires SharedAgentProvider to be present in the component tree.
 * Suggestions are configured separately via useCopilotSuggestions hook.
 */

import { useCopilotKit } from '@copilotkit/react-core/v2';
import type { Message } from '@ag-ui/core';
import { useMemo, useCallback } from 'react';
import { useCopilotAgent } from './useCopilotAgent';
import { useCopilotChatContext } from './useCopilotChatContext';
import { API_CONFIG } from '../../constants';

/**
 * Helper function to delete messages from backend
 * Shared between reloadMessages and delete operations
 * Reuses the same "delete all below" API endpoint
 */
export async function deleteMessagesFromBackend(
  threadId: string,
  messageIds: string[]
): Promise<void> {
  if (messageIds.length === 0) return;
  
  // Use single delete endpoint for efficiency when only one message
  if (messageIds.length === 1) {
    const response = await fetch(
      `${API_CONFIG.BASE_URL}/api/messages/${threadId}/${messageIds[0]}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete message' }));
      throw new Error(error.error || `Failed to delete message: ${response.status}`);
    }
    return;
  }
  
  // Use bulk delete endpoint for multiple messages (same as "delete all below")
  try {
    const response = await fetch(
      `${API_CONFIG.BASE_URL}/api/messages/${threadId}/bulk-delete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ messageIds }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete messages' }));
      throw new Error(error.error || `Failed to delete messages: ${response.status}`);
    }
  } catch (error) {
    console.error('[useCopilotChat] Error deleting messages from backend:', error);
    throw error;
  }
}

// Re-export Message type for convenience
export type { Message };

/**
 * Return type for the centralized chat hook.
 * Provides a stable interface regardless of CopilotKit version.
 */
export interface CopilotChatState {
  // Messages
  /** The messages that are currently in the chat */
  messages: Message[];

  /** Replace all messages in the chat */
  setMessages: (messages: Message[]) => void;

  /** Remove a specific message by ID */
  deleteMessage: (messageId: string) => void;

  // Loading state
  /** Whether the chat is currently generating a response */
  isLoading: boolean;

  // Actions
  /**
   * Send a new message to the chat.
   * Note: In V2, this is handled via CopilotChat component's input.
   * This method runs the agent which processes the last user message.
   */
  sendMessage: (message: Message) => Promise<void>;

  /** Regenerate the response for a specific message */
  reloadMessages: (messageId?: string) => Promise<void>;

  /** Clear all messages and reset chat state */
  reset: () => void;

  /** Stop the current message generation */
  stopGeneration: () => void;
}

// Default agent ID used throughout the application
const DEFAULT_AGENT_ID = 'dynamic_agent';

/**
 * Centralized hook for CopilotKit chat functionality.
 *
 * @example
 * ```tsx
 * const { messages, isLoading, reset } = useCopilotChat();
 * ```
 */
export function useCopilotChat(agentId: string = DEFAULT_AGENT_ID): CopilotChatState {
  // ARCHITECTURE CHANGE: Use useCopilotAgent which supports SharedAgentProvider context
  // This ensures multiple hooks share a single connection to the runtime server
  const { 
    agent, 
    messages: agentMessages, 
    setMessages: agentSetMessages, 
    running: agentIsRunning 
  } = useCopilotAgent({ agentId });

  // CopilotKit core for stopAgent and other utilities
  const { copilotkit } = useCopilotKit();
  
  // Get threadId (sessionId) from context for backend deletion
  const { threadId } = useCopilotChatContext();

  // Memoize messages to prevent unnecessary re-renders
  const messages = useMemo(() => {
    return (agentMessages ?? []) as Message[];
  }, [agentMessages]);

  // Set messages
  const setMessages = useCallback((newMessages: Message[]) => {
    agentSetMessages(newMessages);
  }, [agentSetMessages]);

  // Delete message by ID - filter and use agent.setMessages()
  const deleteMessage = useCallback((messageId: string) => {
    const filtered = (agentMessages ?? []).filter((m: Message) => m.id !== messageId);
    agentSetMessages(filtered);
  }, [agentMessages, agentSetMessages]);

  // Send a new message - V2 implementation
  // Call agent.runAgent() directly to bypass CopilotKit runtime caching
  const sendMessage = useCallback(async (message: Message) => {
    if (!agent) {
      console.warn('[useCopilotChat] sendMessage: agent not available');
      return;
    }
    
    try {
      // Add message to agent's message list
      if (typeof agent.addMessage === 'function') {
        agent.addMessage(message);
      }
      
      if (typeof agent.runAgent === 'function') {
        await agent.runAgent();
      }
      
    } catch (error) {
      console.error('[useCopilotChat] Error sending message:', error);
      throw error;
    }
  }, [agent]);

  // Reload/regenerate messages
  // If messageId is provided, filter messages to include only up to that message
  // For user messages: include all messages up to and including that user message
  // For assistant messages: find the triggering user message and include all messages up to and including that user message
  // Also deletes old messages from backend before regenerating to ensure persistence
  const reloadMessages = useCallback(async (messageId?: string) => {
    if (!agent) return;
    
    const currentMessages = (agent.messages ?? []) as Message[];
    
    if (!messageId || currentMessages.length === 0) {
      // No messageId provided or no messages - just run agent with all messages
      if (typeof agent.runAgent === 'function') {
        await agent.runAgent();
      }
      return;
    }
    
    // Find the message by ID
    const messageIndex = currentMessages.findIndex((m: Message) => m.id === messageId);
    if (messageIndex === -1) {
      console.warn('[useCopilotChat] Message not found for reload:', messageId);
      return;
    }
    
    const targetMessage = currentMessages[messageIndex];
    const targetRole = (targetMessage as any)?.role;
    
    let filteredMessages: Message[];
    let messagesToDelete: Message[] = [];
    
    if (targetRole === 'user') {
      // For user messages: include all messages up to and including this user message
      // Exclude the assistant response and any subsequent messages
      filteredMessages = currentMessages.slice(0, messageIndex + 1);
      messagesToDelete = currentMessages.slice(messageIndex + 1);
    } else if (targetRole === 'assistant') {
      // For assistant messages: find the user message that triggered this assistant response
      // Include all messages up to and including that user message
      // Exclude the assistant response and any subsequent messages
      
      // Find the previous user message before this assistant message
      let userMessageIndex = -1;
      for (let i = messageIndex - 1; i >= 0; i--) {
        const role = (currentMessages[i] as any)?.role;
        if (role === 'user') {
          userMessageIndex = i;
          break;
        }
      }
      
      if (userMessageIndex === -1) {
        // No user message found before this assistant message - use all messages up to this assistant message
        filteredMessages = currentMessages.slice(0, messageIndex);
        messagesToDelete = currentMessages.slice(messageIndex);
      } else {
        // Include all messages up to and including the triggering user message
        filteredMessages = currentMessages.slice(0, userMessageIndex + 1);
        messagesToDelete = currentMessages.slice(userMessageIndex + 1);
      }
    } else {
      // For other message types (tool, system, etc.), just use all messages up to this message
      filteredMessages = currentMessages.slice(0, messageIndex + 1);
      messagesToDelete = currentMessages.slice(messageIndex + 1);
    }
    
    // Delete old messages from backend before regenerating (equivalent to "delete all below")
    // This ensures that when the page reloads, the old messages won't be loaded
    if (messagesToDelete.length > 0 && threadId) {
      const messageIdsToDelete = messagesToDelete
        .map(msg => msg.id)
        .filter((id): id is string => Boolean(id));
      
      if (messageIdsToDelete.length > 0) {
        try {
          await deleteMessagesFromBackend(threadId, messageIdsToDelete);
        } catch (error) {
          console.error('[useCopilotChat] Failed to delete messages before reload:', error);
          // Continue anyway - frontend state will be updated
        }
      }
    }
    
    // Update agent messages with filtered list
    if (typeof agent.setMessages === 'function') {
      agent.setMessages(filteredMessages);
    }
    
    // Run agent with filtered messages
    if (typeof agent.runAgent === 'function') {
      await agent.runAgent();
    }
  }, [agent, threadId]);

  // Reset chat state
  const reset = useCallback(() => {
    agentSetMessages([]);
  }, [agentSetMessages]);

  // Stop current generation
  const stopGeneration = useCallback(() => {
    if (copilotkit) {
      copilotkit.stopAgent({ agent: agentId as any });
    }
  }, [copilotkit, agentId]);

  // Loading state - derive from agent state
  const isLoading = agentIsRunning;

  return {
    messages,
    setMessages,
    deleteMessage,
    isLoading,
    sendMessage,
    reloadMessages,
    reset,
    stopGeneration,
  };
}
