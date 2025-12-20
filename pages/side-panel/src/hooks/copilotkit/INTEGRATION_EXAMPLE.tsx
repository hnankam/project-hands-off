/**
 * Integration Example: Using Agent Event Subscription with Error Banner
 * 
 * This file shows how to integrate the new agent event subscription system
 * into the ChatInner component for error banner display.
 * 
 * BEFORE: Manual error handling (not connected to agent events)
 * AFTER: Automatic error detection and banner display
 */

import React from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { useAgentWithErrorBanner } from './useAgentWithErrorBanner';
import { ChatErrorDisplay } from '../../components/chat/ChatErrorDisplay';
import { CopilotChat } from './components';
import { useCopilotChat } from './useCopilotChat';

// ============================================================================
// OPTION 1: Simple Integration (Recommended)
// ============================================================================

export function ChatInnerWithErrorBanner() {
  const { isLight } = useStorage(themeStorage);
  const { messages, reloadMessages } = useCopilotChat();
  
  // Simple error banner integration
  const { 
    error, 
    handleRetry, 
    handleDismiss, 
    isRunning 
  } = useAgentWithErrorBanner({
    agentId: 'dynamic_agent',
    debug: true,
    errorBannerAutoDismissMs: 15000,
    
    // Retry logic - reload last message
    onRetry: () => {
      const lastAssistantMsg = messages
        .filter(m => m.role === 'assistant')
        .pop();
      
      if (lastAssistantMsg?.id) {
        reloadMessages(lastAssistantMsg.id);
      }
    },
  });

  return (
    <>
      {/* Error Banner - Auto-appears on agent errors */}
      {error && (
        <ChatErrorDisplay
          error={error}
          retry={handleRetry}
          isLight={isLight}
          autoDismissMs={15000}
        />
      )}
      
      {/* Your chat UI */}
      <CopilotChat
        agentId="dynamic_agent"
        threadId="session-123"
      />
    </>
  );
}

// ============================================================================
// OPTION 2: Advanced Integration with Custom Error Handling
// ============================================================================

export function ChatInnerWithAdvancedErrorHandling() {
  const { isLight } = useStorage(themeStorage);
  const { messages, reloadMessages } = useCopilotChat();
  
  // Advanced configuration with custom callbacks
  const { 
    error, 
    handleRetry, 
    handleDismiss,
    lifecyclePhase,
    activeToolsCount,
  } = useAgentWithErrorBanner({
    agentId: 'dynamic_agent',
    debug: true,
    errorBannerAutoDismissMs: 15000,
    
    // Lifecycle callbacks
    onRunStarted: (event, state, messages) => {
      console.log('[Agent] Run started:', event.runId);
      // Could show loading indicator here
    },
    
    onRunFinished: (event, state, messages) => {
      console.log('[Agent] Run completed successfully');
      // Could show success toast here
    },
    
    onRunFailed: (error, state, messages) => {
      console.error('[Agent] Run failed:', error.message);
      // Could send to error tracking service
      // trackError('agent_run_failed', { error, messages: messages.length });
    },
    
    // Tool callbacks
    onToolCallStarted: (event) => {
      console.log('[Agent] Tool started:', event.name);
      // Could show tool progress indicator
    },
    
    onToolCallFinished: (event, toolName, args) => {
      console.log('[Agent] Tool completed:', toolName);
      // Could log tool usage for analytics
    },
    
    // State callbacks
    onStateChanged: (state, messages) => {
      console.log('[Agent] State updated');
      // Could sync state to storage
    },
    
    // Error callback (in addition to banner)
    onError: (agentError) => {
      console.error('[Agent] Error event:', agentError);
      
      // Could categorize errors and handle differently
      if (agentError.code === 'RATE_LIMIT') {
        // Show specific rate limit message
      } else if (agentError.code === 'AUTH_ERROR') {
        // Redirect to login
      }
    },
    
    // Retry logic
    onRetry: () => {
      const lastAssistantMsg = messages
        .filter(m => m.role === 'assistant')
        .pop();
      
      if (lastAssistantMsg?.id) {
        reloadMessages(lastAssistantMsg.id);
      } else {
        // No assistant message, try last user message
        const lastUserMsg = messages
          .filter(m => m.role === 'user')
          .pop();
        
        if (lastUserMsg?.id) {
          reloadMessages(lastUserMsg.id);
        }
      }
    },
  });

  return (
    <>
      {/* Status indicator */}
      <div style={{ 
        padding: 8, 
        background: isLight ? '#f3f4f6' : '#1f2937',
        fontSize: 11,
      }}>
        Phase: {lifecyclePhase} | 
        Running: {isRunning ? 'Yes' : 'No'} | 
        Active Tools: {activeToolsCount}
      </div>
      
      {/* Error Banner */}
      {error && (
        <ChatErrorDisplay
          error={error}
          retry={handleRetry}
          isLight={isLight}
          autoDismissMs={15000}
        />
      )}
      
      {/* Chat UI */}
      <CopilotChat
        agentId="dynamic_agent"
        threadId="session-123"
      />
    </>
  );
}

// ============================================================================
// OPTION 3: Using Low-Level useAgentEventSubscriber
// ============================================================================

import { useAgentEventSubscriber } from './useAgentEventSubscriber';

export function ChatInnerWithFullControl() {
  const { isLight } = useStorage(themeStorage);
  const { messages, reloadMessages } = useCopilotChat();
  
  // Full control over event subscriptions
  const {
    agent,
    lifecycle,
    error,
    clearError,
    activeTools,
    isRunning,
    triggerError,
  } = useAgentEventSubscriber({
    agentId: 'dynamic_agent',
    debug: true,
    errorAutoDismissMs: 15000,
    
    // All the same callbacks as above...
    onRunStarted: (event) => {
      console.log('Run started');
    },
    
    // ... etc
  });

  const handleRetry = () => {
    clearError();
    // Your retry logic
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.id) {
      reloadMessages(lastMsg.id);
    }
  };

  return (
    <>
      {/* Custom error display with full control */}
      {error && (
        <div>
          <h3>Error: {error.error.name}</h3>
          <p>{error.error.message}</p>
          {error.code && <p>Code: {error.code}</p>}
          {error.context && <p>Context: {error.context}</p>}
          <button onClick={handleRetry}>Retry</button>
          <button onClick={clearError}>Dismiss</button>
        </div>
      )}
      
      {/* Show active tools */}
      {activeTools.size > 0 && (
        <div>
          <h4>Active Tools:</h4>
          {Array.from(activeTools.values()).map(tool => (
            <div key={tool.toolCallId}>
              {tool.toolName} - {Date.now() - tool.startTime}ms
            </div>
          ))}
        </div>
      )}
      
      {/* Chat UI */}
      <CopilotChat
        agentId="dynamic_agent"
        threadId="session-123"
      />
    </>
  );
}

// ============================================================================
// MIGRATION PATH FROM OLD SYSTEM
// ============================================================================

/**
 * OLD SYSTEM (Before v1.5):
 */
/*
const renderError = useCallback((err: { message: string; operation?: string }) => {
  const error = new Error(err.operation ? `${err.operation}: ${err.message}` : err.message);
  error.name = err.operation || 'Error';

  const handleRetry = () => {
    // ... retry logic
  };

  return <ChatErrorDisplay error={error} retry={handleRetry} isLight={isLight} />;
}, [isLight, reloadMessages, messages]);

// Problem: renderError was never connected to CopilotChat
// Errors weren't automatically detected
*/

/**
 * NEW SYSTEM (v1.5+):
 */
export function MigratedChatInner() {
  const { isLight } = useStorage(themeStorage);
  const { messages, reloadMessages } = useCopilotChat();
  
  // ✅ Automatic error detection via event subscription
  const { error, handleRetry, handleDismiss } = useAgentWithErrorBanner({
    agentId: 'dynamic_agent',
    errorBannerAutoDismissMs: 15000,
    onRetry: () => {
      // Same retry logic as before
      const validMessages = messages.filter(m => m.role === 'assistant' || m.role === 'user');
      const lastAssistant = validMessages.filter(m => m.role === 'assistant').pop();
      
      if (lastAssistant?.id) {
        reloadMessages(lastAssistant.id);
      } else {
        const lastUser = validMessages.filter(m => m.role === 'user').pop();
        if (lastUser?.id) {
          reloadMessages(lastUser.id);
        }
      }
    },
  });

  return (
    <>
      {/* ✅ Error banner appears automatically on agent errors */}
      {error && (
        <ChatErrorDisplay
          error={error}
          retry={handleRetry}
          isLight={isLight}
          autoDismissMs={15000}
        />
      )}
      
      <CopilotChat
        agentId="dynamic_agent"
        threadId="session-123"
      />
    </>
  );
}

