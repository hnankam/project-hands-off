# 🚀 Agent Error System - Quick Reference

## TL;DR - Get Started in 30 Seconds

```typescript
// 1. Import
import { useAgentWithErrorBanner } from '@/hooks/copilotkit';

// 2. Use hook
const { error, handleRetry } = useAgentWithErrorBanner({
  agentId: 'dynamic_agent',
  onRetry: () => reloadMessages(),
});

// 3. Render
{error && <ChatErrorDisplay error={error} retry={handleRetry} />}
```

Done! Errors now auto-appear. ✅

---

## 📋 Common Patterns

### Pattern 1: Basic Error Banner
```typescript
const { error, handleRetry } = useAgentWithErrorBanner({
  agentId: 'dynamic_agent',
  errorBannerAutoDismissMs: 15000,
  onRetry: () => reloadMessages(),
});
```

### Pattern 2: Error Analytics
```typescript
useAgentWithErrorBanner({
  agentId: 'dynamic_agent',
  onError: (err) => trackError(err),
});
```

### Pattern 3: Custom Error Handling
```typescript
useAgentWithErrorBanner({
  agentId: 'dynamic_agent',
  onRunFailed: (error) => {
    if (error.message.includes('rate')) {
      showRateLimitModal();
    }
  },
});
```

### Pattern 4: Progress Monitoring
```typescript
const { lifecycle, activeTools } = useAgentEventSubscriber({
  agentId: 'dynamic_agent',
  onToolCallStarted: (e) => console.log(e.name),
});
```

---

## 🎯 Hook Comparison

| Feature | useAgentWithErrorBanner | useAgentEventSubscriber |
|---------|------------------------|------------------------|
| **Complexity** | ⭐ Simple | ⭐⭐⭐ Advanced |
| **Use Case** | Error display | Full monitoring |
| **Error Banner** | ✅ Built-in | ⚙️ Manual setup |
| **Event Callbacks** | ✅ All available | ✅ All available |
| **Lifecycle Tracking** | ✅ Via phase | ✅ Full object |
| **Tool Tracking** | ✅ Via count | ✅ Full Map |
| **When to Use** | 90% of cases | Advanced needs |

---

## 📦 What You Get

### Hook Returns

```typescript
// useAgentWithErrorBanner
{
  error: Error | null,           // Current error
  handleRetry: () => void,       // Retry handler
  handleDismiss: () => void,     // Dismiss handler
  isRunning: boolean,            // Agent running?
  lifecyclePhase: string,        // Current phase
  activeToolsCount: number,      // Active tools
}

// useAgentEventSubscriber
{
  agent: AbstractAgent | null,   // Agent instance
  lifecycle: AgentLifecycleState, // Full lifecycle
  error: AgentError | null,      // Current error
  clearError: () => void,        // Clear error
  activeTools: Map<>,            // Tool executions
  isRunning: boolean,            // Agent running?
  triggerError: (Error) => void, // Manual trigger
}
```

---

## 🎛️ Configuration Quick Ref

```typescript
{
  // Required
  agentId: string,
  
  // Error handling
  errorBannerAutoDismissMs?: number,  // default: 15000
  onRetry?: () => void,
  onError?: (error) => void,
  
  // Lifecycle
  onRunStarted?: (event, state, messages) => void,
  onRunFinished?: (event, state, messages) => void,
  onRunFailed?: (error, state, messages) => void,
  
  // Steps (LangGraph)
  onStepStarted?: (event, state) => void,
  onStepFinished?: (event, state) => void,
  
  // Tools
  onToolCallStarted?: (event) => void,
  onToolCallFinished?: (event, name, args) => void,
  onToolCallResult?: (event) => void,
  
  // State
  onStateChanged?: (state, messages) => void,
  onMessagesChanged?: (messages, state) => void,
  
  // Activity
  onActivityUpdate?: (event) => void,
  
  // Debug
  debug?: boolean,
}
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Error not showing | Check `error !== null`, enable `debug: true` |
| Error not clearing | Check auto-dismiss enabled |
| Multiple banners | Only one hook per agent |
| Performance issues | Only subscribe to needed events |
| Type errors | Update `@ag-ui/core` and `@ag-ui/client` |

---

## 📊 Event Types Quick Ref

### Error Events (Priority)
- ⚠️ `onRunFailed` - **Use for error banner**
- ⚠️ `onRunErrorEvent` - **Use for error logging**

### Lifecycle Events
- `onRunInitialized` - Run starts
- `onRunFinalized` - Run ends

### Run Events
- `onRunStartedEvent` - Run started
- `onRunFinishedEvent` - Run finished

### Tool Events
- `onToolCallStarted` - Tool starts
- `onToolCallFinished` - Tool ends
- `onToolCallResult` - Tool result (check for errors!)

### State Events
- `onStateChanged` - State updates
- `onMessagesChanged` - Messages update

---

## ⚡ Performance Tips

1. ✅ Enable debug only in dev: `debug: process.env.NODE_ENV === 'development'`
2. ✅ Use stable callbacks: `useCallback` for event handlers
3. ✅ Subscribe only to needed events: Don't add unused callbacks
4. ✅ Cleanup is automatic: No manual unsubscribe needed

---

## 🧪 Testing Cheat Sheet

```typescript
// Mock hook
jest.mock('@/hooks/copilotkit', () => ({
  useAgentWithErrorBanner: () => ({
    error: null,
    handleRetry: jest.fn(),
    handleDismiss: jest.fn(),
    isRunning: false,
  }),
}));

// Test error display
const mockError = new Error('Test');
(useAgentWithErrorBanner as jest.Mock).mockReturnValue({
  error: mockError,
  handleRetry: jest.fn(),
});
```

---

## 📚 Full Documentation

- **Comprehensive Guide**: `AGENT_EVENTS_GUIDE.md`
- **Implementation Summary**: `AGENT_ERROR_SYSTEM_SUMMARY.md`
- **Integration Examples**: `INTEGRATION_EXAMPLE.tsx`

---

## 🎓 Remember

1. Use `useAgentWithErrorBanner` for 90% of cases
2. Use `useAgentEventSubscriber` for advanced monitoring
3. Errors appear automatically via event subscription
4. Cleanup is automatic on unmount
5. Enable `debug: true` during development
6. All events are optional - only subscribe to what you need
7. Type-safe with full TypeScript support

---

**Need help?** Check the full documentation or integration examples! 🚀

