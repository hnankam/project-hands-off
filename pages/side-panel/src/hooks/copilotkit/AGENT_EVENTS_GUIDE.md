# Agent Event Subscription System Guide

## Overview

The agent event subscription system provides comprehensive monitoring and error handling for CopilotKit v1.5+ agents. It includes two main hooks:

1. **`useAgentEventSubscriber`** - Low-level comprehensive event subscription
2. **`useAgentWithErrorBanner`** - High-level convenience hook for error banner display

## Architecture

```
┌─────────────────────────────────────────────────────┐
│         CopilotKit Agent (v1.5+)                   │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  AbstractAgent.subscribe()                   │  │
│  │  • Lifecycle events (init, failed, finalized)│  │
│  │  • Run events (started, finished, error)     │  │
│  │  • Step events (LangGraph)                   │  │
│  │  • Tool events (start, end, result)          │  │
│  │  • State events (snapshot, delta, changed)   │  │
│  │  • Message events (changed, snapshot)        │  │
│  │  • Activity events (snapshot, delta)         │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│      useAgentEventSubscriber                        │
│      (Comprehensive Event Subscription)             │
│                                                     │
│  • Subscribes to all agent events                  │
│  • Tracks lifecycle state                          │
│  • Manages error state                             │
│  • Tracks active tool executions                   │
│  • Provides debug logging                          │
│  • Auto-dismisses errors                           │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│      useAgentWithErrorBanner                        │
│      (Convenience Hook)                             │
│                                                     │
│  • Simplifies error banner display                 │
│  • Handles retry logic                             │
│  • Provides dismiss functionality                  │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│      ChatErrorDisplay Component                     │
│      (UI Banner)                                    │
│                                                     │
│  • Displays error message                          │
│  • Shows retry button                              │
│  • Auto-dismiss animation                          │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### Option 1: Simple Error Banner (Recommended)

Use `useAgentWithErrorBanner` for straightforward error display:

```typescript
import { useAgentWithErrorBanner } from '@/hooks/copilotkit';
import { ChatErrorDisplay } from '@/components/chat/ChatErrorDisplay';

function MyComponent() {
  const { error, handleRetry, handleDismiss, isRunning } = useAgentWithErrorBanner({
    agentId: 'dynamic_agent',
    errorBannerAutoDismissMs: 15000,
    debug: true,
    onRetry: () => {
      // Your retry logic (e.g., reload messages)
      reloadMessages();
    },
  });

  return (
    <>
      {error && (
        <ChatErrorDisplay
          error={error}
          retry={handleRetry}
          isLight={isLight}
          autoDismissMs={15000}
        />
      )}
      
      {/* Your chat UI */}
    </>
  );
}
```

### Option 2: Advanced Event Handling

Use `useAgentEventSubscriber` for comprehensive event monitoring:

```typescript
import { useAgentEventSubscriber } from '@/hooks/copilotkit';

function MyComponent() {
  const {
    agent,
    lifecycle,
    error,
    clearError,
    activeTools,
    isRunning,
  } = useAgentEventSubscriber({
    agentId: 'dynamic_agent',
    debug: true,
    
    // Lifecycle callbacks
    onRunStarted: (event, state, messages) => {
      console.log('Agent run started:', event.runId);
    },
    
    onRunFinished: (event, state, messages) => {
      console.log('Agent run completed successfully');
    },
    
    onRunFailed: (error, state, messages) => {
      console.error('Agent run failed:', error.message);
    },
    
    // Tool callbacks
    onToolCallStarted: (event) => {
      console.log('Tool started:', event.name);
    },
    
    onToolCallFinished: (event, toolName, args) => {
      console.log('Tool finished:', toolName, args);
    },
    
    // State callbacks
    onStateChanged: (state, messages) => {
      console.log('State updated:', state);
    },
    
    onMessagesChanged: (messages, state) => {
      console.log('Messages updated:', messages.length);
    },
    
    // Error callback
    onError: (error) => {
      console.error('Error occurred:', error.error.message);
      // Send to error tracking service
      trackError(error);
    },
  });

  return (
    <>
      {/* Display lifecycle phase */}
      <div>Phase: {lifecycle.phase}</div>
      
      {/* Display active tools */}
      <div>Active tools: {activeTools.size}</div>
      
      {/* Error banner */}
      {error && (
        <ChatErrorDisplay
          error={error.error}
          retry={() => { /* retry logic */ }}
          isLight={isLight}
        />
      )}
    </>
  );
}
```

## Event Types

### 1. Lifecycle Events

| Event | When Fired | Use Case |
|-------|-----------|----------|
| `onRunInitialized` | Agent run starts initializing | Clear previous state, show loading |
| `onRunFailed` | **Agent run fails** | **Display error banner** |
| `onRunFinalized` | Agent run completes (success or failure) | Cleanup, final state update |

### 2. Run Events

| Event | When Fired | Use Case |
|-------|-----------|----------|
| `onRunStartedEvent` | Run officially starts | Track run ID, start timer |
| `onRunFinishedEvent` | Run completes successfully | Show success message |
| `onRunErrorEvent` | **Error event received** | **Log specific error details** |

### 3. Step Events (LangGraph)

| Event | When Fired | Use Case |
|-------|-----------|----------|
| `onStepStarted` | LangGraph step starts | Show step progress |
| `onStepFinished` | LangGraph step finishes | Update step status |

### 4. Tool Events

| Event | When Fired | Use Case |
|-------|-----------|----------|
| `onToolCallStarted` | Tool execution begins | Show tool in progress |
| `onToolCallFinished` | Tool execution ends | Display tool result |
| `onToolCallResult` | Tool result received | Check for tool errors |

### 5. State Events

| Event | When Fired | Use Case |
|-------|-----------|----------|
| `onStateChanged` | Agent state updates | Sync UI with agent state |
| `onMessagesChanged` | Messages array updates | Re-render message list |

### 6. Activity Events

| Event | When Fired | Use Case |
|-------|-----------|----------|
| `onActivityUpdate` | Activity message received | Display progress cards |

## Error Handling Flow

```
┌──────────────────┐
│  Agent Run Fails │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────┐
│  onRunFailed callback   │
│  • Error captured       │
│  • Error state set      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Error State Updated    │
│  • error: AgentError    │
│  • lifecycle: 'failed'  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Component Re-renders   │
│  • error !== null       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  ChatErrorDisplay       │
│  • Shows error banner   │
│  • Provides retry btn   │
│  • Auto-dismiss timer   │
└─────────────────────────┘
         │
         ├──► User clicks "Retry"
         │    → handleRetry()
         │    → clearError()
         │    → onRetry callback
         │
         ├──► User clicks "Dismiss"
         │    → handleDismiss()
         │    → clearError()
         │
         └──► Auto-dismiss timeout
              → clearError()
```

## Configuration Options

### useAgentWithErrorBanner

```typescript
interface AgentWithErrorBannerConfig {
  // Required
  agentId: string;
  
  // Optional
  debug?: boolean;
  errorBannerAutoDismissMs?: number; // default: 15000 (15s)
  
  // Callbacks (all optional)
  onRetry?: () => void;
  onRunStarted?: (event, state, messages) => void;
  onRunFinished?: (event, state, messages) => void;
  onRunFailed?: (error, state, messages) => void;
  onStepStarted?: (event, state) => void;
  onStepFinished?: (event, state) => void;
  onToolCallStarted?: (event) => void;
  onToolCallFinished?: (event, toolName, args) => void;
  onToolCallResult?: (event) => void;
  onStateChanged?: (state, messages) => void;
  onMessagesChanged?: (messages, state) => void;
  onActivityUpdate?: (event) => void;
  onError?: (error: AgentError) => void;
}
```

### useAgentEventSubscriber

Same as above, but with `errorAutoDismissMs` instead of `errorBannerAutoDismissMs`.

## Best Practices

### 1. Choose the Right Hook

- **Use `useAgentWithErrorBanner`** for: Simple error display, most use cases
- **Use `useAgentEventSubscriber`** for: Advanced monitoring, custom error handling, analytics

### 2. Error Handling

```typescript
// ✅ Good: Use onRunFailed for critical errors
onRunFailed: (error, state, messages) => {
  // Display error banner
  // Log to error tracking
  // Show modal for critical errors
}

// ✅ Good: Use onRunErrorEvent for specific error codes
onRunErrorEvent: (event) => {
  if (event.code === 'RATE_LIMIT') {
    // Handle rate limiting specifically
  }
}

// ⚠️ Caution: Tool errors may not need banners
onToolCallResult: (event) => {
  // Only show banner for critical tool failures
  // Most tool errors can be shown inline
}
```

### 3. Performance

```typescript
// ✅ Good: Enable debug only in development
debug: process.env.NODE_ENV === 'development'

// ✅ Good: Only subscribe to events you need
// If you don't need tool tracking, don't provide tool callbacks

// ✅ Good: Use stable callback references
const onRunFailed = useCallback((error) => {
  handleError(error);
}, [handleError]);
```

### 4. Cleanup

The hooks automatically handle cleanup - no manual unsubscribe needed:

```typescript
// ✅ Automatic cleanup on unmount
useEffect(() => {
  // Subscription is created
  return () => {
    // Subscription is automatically cleaned up
  };
}, [agent]);
```

## Integration with ChatInner

See example in `ChatInner.tsx`:

```typescript
// Replace manual error handling with:
const { error, handleRetry, handleDismiss } = useAgentWithErrorBanner({
  agentId: 'dynamic_agent',
  debug: true,
  errorBannerAutoDismissMs: 15000,
  onRetry: () => {
    // Existing retry logic
    const validMessages = filterValidMessages(messages);
    const lastAssistant = findLastMessageByRole(validMessages, 'assistant');
    if (lastAssistant?.id) {
      reloadMessages(lastAssistant.id);
    }
  },
});

// In render:
{error && (
  <ChatErrorDisplay
    error={error}
    retry={handleRetry}
    isLight={isLight}
    autoDismissMs={15000}
  />
)}
```

## Troubleshooting

### Error banner not showing

1. Check agent is initialized: `agent !== null`
2. Check error state: `error !== null`
3. Enable debug logging: `debug: true`
4. Check console for subscription logs

### Error not clearing

1. Check auto-dismiss is enabled: `errorAutoDismissMs > 0`
2. Check `handleDismiss` is called
3. Check for re-renders causing error re-set

### Multiple error banners

1. Only use one error handling hook per agent
2. Check for duplicate agent subscriptions
3. Verify component isn't remounting unnecessarily

## Migration from Old System

### Before (Manual error handling)

```typescript
const renderError = useCallback((err) => {
  return <ChatErrorDisplay error={err} retry={handleRetry} />;
}, []);

// Not connected to CopilotChat
```

### After (Event-based system)

```typescript
const { error, handleRetry, handleDismiss } = useAgentWithErrorBanner({
  agentId: 'dynamic_agent',
  onRetry: handleRetry,
});

// Automatically catches all agent errors
{error && <ChatErrorDisplay error={error} retry={handleRetry} />}
```

## Testing

```typescript
// Mock the hook in tests
jest.mock('@/hooks/copilotkit', () => ({
  useAgentWithErrorBanner: () => ({
    error: null,
    handleRetry: jest.fn(),
    handleDismiss: jest.fn(),
    isRunning: false,
    lifecyclePhase: 'idle',
    activeToolsCount: 0,
  }),
}));
```

## Further Reading

- [CopilotKit v1.5 Documentation](https://docs.copilotkit.ai)
- [AG-UI Client Documentation](https://github.com/CopilotKit/ag-ui)
- [Observable Pattern](https://rxjs.dev/guide/observable)

