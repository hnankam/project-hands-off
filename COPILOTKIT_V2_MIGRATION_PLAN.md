# CopilotKit v2 Migration Plan

## Overview

This document provides a comprehensive migration plan for upgrading from CopilotKit v1 (`1.10.6`) to CopilotKit v2 (`1.50.0-beta.7`) for the `copilot-runtime-server` and `side-panel` projects.

### Key Architecture Changes

| Aspect | v1 | v2 |
|--------|----|----|
| **Communication Protocol** | GraphQL | AG-UI Protocol |
| **Provider Component** | `CopilotKit` | `CopilotKitProvider` |
| **Primary Chat Hook** | `useCopilotChatHeadless_c` | `useAgent` |
| **Agent Hook** | `useCoAgent` | `useAgent` |
| **Server Endpoint** | `copilotRuntimeNodeExpressEndpoint` | `createCopilotEndpoint` (Hono-based) |
| **Import Path** | `@copilotkit/runtime` | `@copilotkit/runtime/v2` |
| **Client Import Path** | `@copilotkit/react-core` | `@copilotkit/react-core/v2` |

### Critical Compatibility Note

**The v1 client API (`useCopilotChatHeadless_c`, `useCoAgent`, etc.) is NOT compatible with the v2 server API.** If you migrate the server to v2, you MUST also migrate all client-side code to use v2 hooks and components.

---

## Package Version Updates

### `copilot-runtime-server/package.json`

```json
// Before
"@copilotkit/runtime": "1.10.6"

// After
"@copilotkit/runtime": "1.50.0-beta.7"
```

### `pages/side-panel/package.json`

```json
// Before
"@copilotkit/react-core": "1.10.6",
"@copilotkit/react-ui": "1.10.6",
"@copilotkit/runtime-client-gql": "^1.10.6",
"@copilotkit/shared": "1.10.6"

// After
"@copilotkit/react-core": "1.50.0-beta.7",
"@copilotkit/react-ui": "1.50.0-beta.7",
"@copilotkit/shared": "1.50.0-beta.7"
// Note: @copilotkit/runtime-client-gql can be removed (v2 uses AG-UI, not GraphQL)
```

---

## Server-Side Migration

### 1. `copilot-runtime-server/server.js`

#### Current v1 Implementation

```javascript
import { CopilotRuntime } from "@copilotkit/runtime";

const runtime = new CopilotRuntime({
  agents: {
    "dynamic_agent": defaultAgent,
  },
});

const copilotKitEndpoint = createCopilotKitEndpoint(serviceAdapter, runtime);
app.use('/api/copilotkit', dynamicRoutingMiddleware);
app.use('/api/copilotkit', captureRequestContext);
app.use('/api/copilotkit', copilotKitEndpoint);
```

#### Required v2 Changes

```javascript
import { CopilotRuntime, InMemoryAgentRunner } from "@copilotkit/runtime/v2";

// Create an agent runner with your agents
const agentRunner = new InMemoryAgentRunner({
  agents: [defaultAgent], // Array of agents, not object
});

const runtime = new CopilotRuntime({
  agentRunner,
});

// Note: Endpoint creation changes significantly (see below)
```

### 2. `copilot-runtime-server/routes/copilotkit.js`

#### Current v1 Implementation

```javascript
import { copilotRuntimeNodeExpressEndpoint } from "@copilotkit/runtime";

export function createCopilotKitEndpoint(serviceAdapter, runtime) {
  return copilotRuntimeNodeExpressEndpoint({
    endpoint: '/api/copilotkit',
    serviceAdapter,
    runtime,
  });
}
```

#### Required v2 Changes

The v2 API uses Hono internally. To maintain Express compatibility, you have two options:

**Option A: Hono Adapter for Express**

```javascript
import { createCopilotEndpoint } from "@copilotkit/runtime/v2";
import { Hono } from "hono";

// Create Hono app with CopilotKit endpoint
const honoApp = new Hono();
honoApp.route("/api/copilotkit", createCopilotEndpoint({ runtime }));

// Use hono/node-server adapter to integrate with Express
// Or mount Hono as middleware
```

**Option B: Keep Express, Use Fetch Handler**

```javascript
import { CopilotRuntime, InMemoryAgentRunner } from "@copilotkit/runtime/v2";

// The v2 runtime can handle raw fetch requests
// You'll need to adapt your Express route to convert req/res to fetch format
```

**Option C: Full Hono Server with Dynamic Agent Routing (RECOMMENDED)**

This approach mirrors the v1 `dynamicRouting.js` middleware pattern:

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import {
  CopilotRuntime,
  createCopilotEndpoint,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";

const AGENT_BASE_URL = process.env.AGENT_BASE_URL || "http://localhost:8000";
const DEFAULT_AGENT = "my_agent";

// ============================================================================
// Exclusive Lock for Concurrent Request Handling (mirrors v1 pattern)
// ============================================================================

let agentUpdateChain = Promise.resolve();

const runExclusive = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = agentUpdateChain.then(() => fn());
  agentUpdateChain = run.catch(() => {}) as Promise<void>;
  return run;
};

// ============================================================================
// Dynamic Agent Factory
// ============================================================================

function createDynamicHttpAgent(context: {
  agentType: string;
  modelType: string;
  threadId?: string;
  authContext: Record<string, string | undefined>;
  requestId: string;
}): HttpAgent {
  const headers: Record<string, string> = {
    "x-copilot-agent-type": context.agentType,
    "x-copilot-model-type": context.modelType,
    "x-request-id": context.requestId,
  };

  // Forward thread ID
  if (context.threadId) headers["x-copilot-thread-id"] = context.threadId;
  
  // Forward auth context (like v1)
  Object.entries(context.authContext).forEach(([key, value]) => {
    if (value) headers[`x-copilot-${key}`] = value;
  });

  return new HttpAgent({ url: `${AGENT_BASE_URL}/`, headers }) as any;
}

// ============================================================================
// Shared Runtime (updated dynamically per request)
// ============================================================================

const sharedRuntime = new CopilotRuntime({
  agents: {
    [DEFAULT_AGENT]: new HttpAgent({ url: `${AGENT_BASE_URL}/` }) as any,
  },
  runner: new InMemoryAgentRunner(),
});

const defaultAgent = (sharedRuntime as any).agents[DEFAULT_AGENT];

// ============================================================================
// Hono Application
// ============================================================================

const app = new Hono();

app.use("*", cors({
  origin: ["http://localhost:3000"],
  credentials: true,
  allowHeaders: [
    "Content-Type",
    "x-copilot-agent-type",
    "x-copilot-model-type",
    "x-copilot-thread-id",
    "x-copilot-user-id",
    "x-copilot-organization-id",
    "x-copilot-team-id",
  ],
}));

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// CopilotKit endpoint with dynamic routing
const copilotEndpoint = createCopilotEndpoint({
  runtime: sharedRuntime,
  basePath: "/api/copilotkit",
});

app.all("/api/copilotkit/*", async (c) => {
  const requestId = `rt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Extract context from headers (like v1 dynamicRouting.js)
  const context = {
    agentType: c.req.header("x-copilot-agent-type") || DEFAULT_AGENT,
    modelType: c.req.header("x-copilot-model-type") || "default",
    threadId: c.req.header("x-copilot-thread-id"),
    requestId,
    authContext: {
      "user-id": c.req.header("x-copilot-user-id"),
      "organization-id": c.req.header("x-copilot-organization-id"),
      "team-id": c.req.header("x-copilot-team-id"),
    },
  };

  console.log(`[${requestId}] Agent: ${context.agentType} | Model: ${context.modelType}`);

  // Update agent using exclusive lock (prevents race conditions)
  return runExclusive(async () => {
    try {
      // Dynamically update the runtime's agent
      (sharedRuntime as any).agents[DEFAULT_AGENT] = createDynamicHttpAgent(context);
      
      // Forward to CopilotKit handler
      return await copilotEndpoint.fetch(c.req.raw);
    } finally {
      // Restore default agent
      (sharedRuntime as any).agents[DEFAULT_AGENT] = defaultAgent;
    }
  });
});

// Start server
serve({ fetch: app.fetch, port: 4000 });
console.log("🚀 CopilotKit v2 Server running on http://localhost:4000");
```

**Required dependencies:**
```json
{
  "hono": "^4.10.8",
  "@hono/node-server": "^1.19.7",
  "@copilotkit/runtime": "1.50.0-beta.7",
  "@ag-ui/client": "^0.0.42"
}
```

### 3. `copilot-runtime-server/agents/dynamic.js`

#### Current v1 Implementation

```javascript
import { HttpAgent } from '@ag-ui/client';

export function createDynamicAgent(getAgentUrl) {
  return new HttpAgent({
    url: getAgentUrl,
  });
}
```

#### v2 Assessment

The `HttpAgent` from `@ag-ui/client` remains compatible with v2. No changes required to the agent creation itself. However, ensure:

- The agent URL returns AG-UI compliant responses
- The agent is registered with `InMemoryAgentRunner` instead of the old `CopilotRuntime` constructor

### 4. `copilot-runtime-server/adapters/dynamic.js`

#### Current v1 Implementation

Uses `createDynamicServiceAdapter` with provider-specific adapters (OpenAI, Anthropic, Google, Azure).

#### v2 Assessment

Service adapters may need verification. The v2 API may handle LLM routing differently. Check if:

- `OpenAIAdapter`, `AnthropicAdapter`, etc. are still exported from `@copilotkit/runtime/v2`
- The adapter interface is compatible with `createCopilotEndpoint`

### 5. Service Adapter Files

| File | v1 Adapter | Import |
|------|------------|--------|
| `adapters/anthropic.js` | `AnthropicAdapter` | `@copilotkit/runtime` |
| `adapters/openai.js` | `OpenAIAdapter` | `@copilotkit/runtime` |
| `adapters/google.js` | `GoogleGenerativeAIAdapter` | `@copilotkit/runtime` |

#### Migration Notes

**V1 Import:**
```javascript
import { AnthropicAdapter } from "@copilotkit/runtime";
import { OpenAIAdapter } from "@copilotkit/runtime";
import { GoogleGenerativeAIAdapter } from "@copilotkit/runtime";
```

**V2 Solution - Use BasicAgent Instead:**
```javascript
// Service adapters are NOT available in v2!
// Use BasicAgent from @copilotkitnext/agent instead

import { BasicAgent } from "@copilotkitnext/agent";

// BasicAgent has built-in multi-provider support
const agent = new BasicAgent({
  model: "openai/gpt-4o",      // or "anthropic/claude-sonnet-4" or "google/gemini-2.5-flash"
  prompt: "You are a helpful assistant.",
  temperature: 0.7,
});
```

**Verification Status:**
- [x] ~~Confirm adapters are exported from `@copilotkit/runtime/v2`~~ ❌ NOT AVAILABLE - Use BasicAgent
- [x] ~~Verify adapter constructor signatures remain compatible~~ ❌ NOT APPLICABLE - Use BasicAgent
- [x] ~~Test dynamic adapter selection pattern with v2~~ ✅ Use BasicAgent with dynamic model string

---

## Client-Side Migration

### Hook & Component Migration Matrix

| v1 Hook/Component | v2 Equivalent | Import Path | Status |
|-------------------|---------------|-------------|--------|
| `CopilotKit` | `CopilotKitProvider` | `@copilotkit/react-core/v2` | ✅ |
| `useCopilotChatHeadless_c` | `useAgent` + `useCopilotKit` + `useSuggestions` | `@copilotkit/react-core/v2` | ✅ |
| `useCoAgent` | `useAgent` | `@copilotkit/react-core/v2` | ✅ |
| `useCoAgentStateRender` | `renderActivityMessages` prop | `CopilotKitProvider` | ✅ |
| `useCopilotContext` | `useCopilotKit` | `@copilotkit/react-core/v2` | ✅ |
| `useFrontendTool` | `useFrontendTool` | `@copilotkit/react-core/v2` | ✅ |
| `useHumanInTheLoop` | `useHumanInTheLoop` | `@copilotkit/react-core/v2` | ✅ |
| `useDefaultTool` | `WildcardToolCallRender` or `name: "*"` | `@copilotkit/react-core/v2` | ✅ |
| `useCopilotReadable` | `useAgentContext` | `@copilotkit/react-core/v2` | ✅ |
| `useRenderToolCall` | `defineToolCallRenderer` prop | `CopilotKitProvider` | ✅ |
| `useCopilotChatSuggestions` | `useConfigureSuggestions` | `@copilotkit/react-core/v2` | ✅ |
| `CopilotChat` | `CopilotChat` or `CopilotSidebar` | `@copilotkit/react-core/v2` | ✅ |
| `useChatContext` | `useCopilotChatConfiguration` | `@copilotkit/react-core/v2` | ✅ |
| `Markdown` | `CopilotChatAssistantMessage.MarkdownRenderer` | `@copilotkit/react-core/v2` | ✅ Uses `Streamdown` |
| `ImageRenderer` | ❌ Not in v2 | - | Handle in custom message |
| - | `useSuggestions` (new) | `@copilotkit/react-core/v2` | ✅ |
| - | `useRenderToolCall` (hook version) | `@copilotkit/react-core/v2` | ✅ |
| - | `useRenderActivityMessage` (new) | `@copilotkit/react-core/v2` | ✅ |
| - | `useRenderCustomMessages` (new) | `@copilotkit/react-core/v2` | ✅ |

### UI Type Exports

| V1 Type | V2 Equivalent | Package | Status |
|---------|---------------|---------|--------|
| `InputProps` | `CopilotChatInputProps` | `@copilotkit/react-core/v2` | ✅ Available |
| `MessagesProps` | `CopilotChatMessageViewProps` | `@copilotkit/react-core/v2` | ✅ Available |
| `UserMessageProps` | `CopilotChatUserMessageProps` | `@copilotkit/react-core/v2` | ✅ Available |
| `AssistantMessageProps` | `CopilotChatAssistantMessageProps` | `@copilotkit/react-core/v2` | ✅ Available |
| `Message` | `Message` | `@ag-ui/core` | ✅ From AG-UI |

### CSS/Styles ✅ VERIFIED

**V2 requires importing BOTH stylesheets:**

| Import | Package | Purpose |
|--------|---------|---------|
| `@copilotkit/react-ui/styles.css` | `@copilotkit/react-ui` | Markdown, ImageRenderer, legacy components |
| `@copilotkitnext/react/styles.css` | `@copilotkitnext/react` | **NEW** - v2 CopilotChat styles |

**Migration in `SidePanel.tsx`:**
```typescript
// Before (v1)
import '@copilotkit/react-ui/styles.css';

// After (v2) - Need BOTH!
import '@copilotkit/react-ui/styles.css';
import '@copilotkitnext/react/styles.css';
```

**New package dependency required:**
```json
"@copilotkitnext/react": "0.0.27"
```

---

## File-by-File Migration Guide

### 1. `pages/side-panel/src/context/SessionRuntimeContext.tsx`

This is the **most critical file** as it manages multiple CopilotKit runtime instances.

#### Current v1 Code

```typescript
import { CopilotKit, useCopilotChatHeadless_c } from '@copilotkit/react-core';

// Provider setup
const copilotProps = {
  runtimeUrl: config.runtimeUrl,
  agent: 'dynamic_agent',
  headers: { /* ... */ },
  publicLicenseKey: config.publicApiKey,
  threadId: config.sessionId,
} as const;

return (
  <CopilotKit {...copilotProps}>
    <RuntimeStateBridge sessionId={config.sessionId} updateRuntimeState={updateRuntimeState} />
    {container && renderContent ? createPortal(renderContent(), container) : null}
  </CopilotKit>
);

// RuntimeStateBridge usage
const { messages, isLoading } = useCopilotChatHeadless_c();
```

#### Required v2 Changes

```typescript
import { CopilotKitProvider, useAgent } from '@copilotkit/react-core/v2';

// Build headers to forward to the runtime server (same as v1)
const headers = useMemo(() => {
  const h: Record<string, string> = {
    'x-copilot-agent-type': config.agentType,
    'x-copilot-model-type': config.modelType,
  };
  if (config.sessionId) h['x-copilot-thread-id'] = config.sessionId;
  if (config.organizationId) h['x-copilot-organization-id'] = config.organizationId;
  if (config.teamId) h['x-copilot-team-id'] = config.teamId;
  return h;
}, [config]);

return (
  <CopilotKitProvider
    runtimeUrl={config.runtimeUrl}
    headers={headers}  // ✅ Headers prop works same as v1
    // Note: publicApiKey/publicLicenseKey removed if using self-hosted runtime
  >
    <RuntimeStateBridge sessionId={config.sessionId} updateRuntimeState={updateRuntimeState} />
    {container && renderContent ? createPortal(renderContent(), container) : null}
  </CopilotKitProvider>
);

// RuntimeStateBridge usage
function RuntimeStateBridge({ sessionId, updateRuntimeState }) {
  const { agent } = useAgent({
    agentId: 'my_agent',
    updates: ['OnStateChanged'] as any,  // Subscribe to state changes
  });
  
  // Access state with proper typing
  const state = agent.state;
  
  useEffect(() => {
    updateRuntimeState({
      messages: /* access via copilotkit core */,
      isLoading: /* access via copilotkit core */,
    });
  }, [state]);
  
  return null;
}
```

**V2 CopilotKitProvider Props:**
```typescript
interface CopilotKitProviderProps {
  children: ReactNode;
  runtimeUrl?: string;
  headers?: Record<string, string>;  // ✅ Supports custom headers
  properties?: Record<string, unknown>;
  useSingleEndpoint?: boolean;
  agents__unsafe_dev_only?: Record<string, AbstractAgent>;
  renderToolCalls?: ReactToolCallRenderer<any>[];
  renderActivityMessages?: ReactActivityMessageRenderer<any>[];
  renderCustomMessages?: ReactCustomMessageRenderer[];
  frontendTools?: ReactFrontendTool[];
  humanInTheLoop?: ReactHumanInTheLoop[];
  showDevConsole?: boolean | "auto";
}
```

#### Key Changes

1. `CopilotKit` → `CopilotKitProvider`
2. `useCopilotChatHeadless_c()` → Distributed across `useAgent`, `useSuggestions`, `useCopilotKit`
3. `publicLicenseKey` → Removed for self-hosted (or use `publicApiKey` for cloud)
4. `agent` prop on provider → `agentId` in `useAgent` hook
5. `threadId` → Pass via `x-copilot-thread-id` header
6. **Headers** → Same pattern works in v2 via `headers` prop

---

### 2. `pages/side-panel/src/components/chat/ChatInner.tsx`

This file has the **most extensive CopilotKit usage**.

#### Current v1 Imports

```typescript
import {
  useCoAgent,
  useCoAgentStateRender,
  useCopilotReadable,
  useCopilotChatHeadless_c,
  useFrontendTool,
  useHumanInTheLoop,
  useDefaultTool,
  useRenderToolCall,
} from '@copilotkit/react-core';
import { CopilotChat, useCopilotChatSuggestions } from '@copilotkit/react-ui';
```

#### Required v2 Imports

```typescript
import {
  useAgent,
  useFrontendTool,
  useHumanInTheLoop,
  useDefaultTool,
  useConfigureSuggestions,
  useAgentContext, // v2 replacement for useCopilotReadable
} from '@copilotkit/react-core/v2';
import { CopilotSidebar } from '@copilotkit/react-ui'; // or adapted CopilotChat
```

#### Hook Migrations

##### `useCopilotChatHeadless_c` → `useAgent`

**Before:**
```typescript
const {
  messages,
  setMessages,
  isLoading,
  generateSuggestions,
  reloadMessages,
  reset,
  stopGeneration,
} = useCopilotChatHeadless_c();
```

**After:**
```typescript
import { useAgent, useSuggestions, useCopilotKit } from '@copilotkit/react-core/v2';

// Agent state and access
const { agent } = useAgent({
  agentId: 'my_agent',
  updates: ['OnStateChanged'] as any,
});

// Suggestions (equivalent to generateSuggestions)
const {
  suggestions,
  reloadSuggestions,  // equivalent to generateSuggestions
  clearSuggestions,
  isLoading: suggestionsLoading,
} = useSuggestions({ agentId: 'my_agent' });

// Low-level CopilotKit core access
const { copilotkit } = useCopilotKit();

// V2 Feature Mapping:
// - messages: Managed internally by CopilotChat/CopilotSidebar
// - setMessages: Not directly available (chat manages internally)
// - isLoading: Track via copilotkit.subscribe() events
// - generateSuggestions: useSuggestions().reloadSuggestions()
// - reloadMessages: copilotkit.runAgent() to re-run
// - reset: Managed by chat component
// - stopGeneration: copilotkit.stopAgent()
```

**V2 `useSuggestions` Hook:**
```typescript
interface UseSuggestionsResult {
  suggestions: Suggestion[];
  reloadSuggestions: () => void;  // Equivalent to v1's generateSuggestions
  clearSuggestions: () => void;
  isLoading: boolean;
}

const { suggestions, reloadSuggestions, clearSuggestions, isLoading } = useSuggestions({
  agentId: 'my_agent',  // Optional, defaults to active agent
});
```

##### `useCoAgent` → `useAgent`

**Before:**
```typescript
const { state, setState } = useCoAgent<AgentStepState>({
  name: 'dynamic_agent',
  initialState: { /* ... */ },
});
```

**After:**
```typescript
const agent = useAgent({ agentId: 'dynamic_agent' });
// State is accessed via agent.state
// setState may need a different approach in v2
```

##### `useCoAgentStateRender` → Direct state observation

**Before:**
```typescript
useCoAgentStateRender<UnifiedAgentState>({
  name: 'dynamic_agent',
  render: ({ state: unifiedState }) => {
    // Render based on state
    return <SomeComponent />;
  },
});
```

**After:**
```typescript
const agent = useAgent({ agentId: 'dynamic_agent' });

// In render or useEffect:
useEffect(() => {
  // React to state changes
  const unifiedState = agent.state;
  // Handle state-based rendering
}, [agent.state]);
```

##### `useRenderToolCall` → `defineToolCallRenderer` prop

**Before:**
```typescript
useRenderToolCall({
  name: 'some_tool',
  render: ({ args, result }) => <ToolResult args={args} result={result} />,
});
```

**After:**
```typescript
// In CopilotKitProvider setup (SessionRuntimeContext.tsx)
<CopilotKitProvider
  defineToolCallRenderer={(toolCall) => {
    if (toolCall.name === 'some_tool') {
      return <ToolResult args={toolCall.args} result={toolCall.result} />;
    }
    return null;
  }}
>
```

##### `useCopilotChatSuggestions` → `useConfigureSuggestions`

**Before:**
```typescript
useCopilotChatSuggestions({
  instructions: showSuggestions ? CHAT_SUGGESTIONS_INSTRUCTIONS : '',
  minSuggestions: 3,
  maxSuggestions: 5,
});
```

**After:**
```typescript
useConfigureSuggestions({
  enabled: showSuggestions,
  instructions: CHAT_SUGGESTIONS_INSTRUCTIONS,
  // API structure may differ - verify v2 docs
});
```

##### `useFrontendTool`

**Before:**
```typescript
useFrontendTool(
  wrapToolConfig(createSearchPageContentAction(actionDeps)) as Parameters<typeof useFrontendTool>[0],
  [actionDeps, wrapToolConfig]
);
```

**After:**
```typescript
import { useFrontendTool } from '@copilotkit/react-core/v2';

useFrontendTool(
  wrapToolConfig(createSearchPageContentAction(actionDeps)),
  [actionDeps, wrapToolConfig]
);
// Verify API compatibility - function signature may have slight changes
```

##### `useHumanInTheLoop`

**Before:**
```typescript
useHumanInTheLoop({
  tool: 'confirm_action',
  handler: async (args) => {
    // Handle human confirmation
    return { confirmed: true };
  },
});
```

**After:**
```typescript
import { useHumanInTheLoop } from '@copilotkit/react-core/v2';

useHumanInTheLoop({
  tool: 'confirm_action',
  handler: async (args) => {
    return { confirmed: true };
  },
});
// Verify API compatibility
```

##### `useDefaultTool`

**Before:**
```typescript
useDefaultTool({
  name: 'default_tool',
  description: 'Default tool description',
  handler: async (args) => {
    return { result: 'done' };
  },
});
```

**After:**
```typescript
import { useDefaultTool } from '@copilotkit/react-core/v2';

useDefaultTool({
  name: 'default_tool',
  description: 'Default tool description',
  handler: async (args) => {
    return { result: 'done' };
  },
});
// Verify API compatibility
```

##### `useCopilotReadable` → `useAgentContext`

**Status: ✅ CONFIRMED - v2 equivalent is `useAgentContext`**

The v2 equivalent of `useCopilotReadable` is `useAgentContext`, which uses the AG-UI `Context` type.

**V1 Context Type:**
```typescript
interface UseCopilotReadableOptions {
  description: string;
  value: any;           // Auto-stringified if object
  parentId?: string;
  categories?: string[];
  convert?: (value: unknown) => string;
}
```

**V2 Context Type (from AG-UI):**
```typescript
type Context = {
  description: string;
  value: string;        // Must be a string (no auto-stringify)
}
```

**Before (v1):**
```typescript
import { useCopilotReadable } from '@copilotkit/react-core';

useCopilotReadable({
  description: 'Multi-page context including current page...',
  value: multiPageMetadata, // Can be an object
  parentId: 'parent-123',
  categories: ['context'],
});
```

**After (v2):**
```typescript
import { useAgentContext } from '@copilotkit/react-core/v2';

useAgentContext({
  description: 'Multi-page context including current page...',
  value: JSON.stringify(multiPageMetadata), // Must be stringified
});
```

**Key Differences:**
1. **Value must be a string** - Objects must be explicitly stringified
2. **No `parentId`** - Not available in v2 base Context type
3. **No `categories`** - Not available in v2 base Context type
4. **No `convert`** - Handle conversion yourself before passing

**Centralized Hook Migration:**
The `useCopilotReadableData` hook in `src/hooks/copilotkit/` handles this automatically:

```typescript
// V2 implementation in useCopilotReadableData.ts
import { useAgentContext } from '@copilotkit/react-core/v2';

export function useCopilotReadableData({
  description,
  value,
}: CopilotReadableDataConfig): void {
  const stringValue = typeof value === 'string' 
    ? value 
    : JSON.stringify(value);

  useAgentContext({
    description,
    value: stringValue,
  });
}
```

##### `useChatContext` → `useCopilotChatConfiguration`

**Status: ✅ CONFIRMED - v2 equivalent is `useCopilotChatConfiguration`**

The v2 equivalent of `useChatContext` from `@copilotkit/react-ui` is `useCopilotChatConfiguration` from `@copilotkit/react-core/v2`.

**V1 Interface:**
```typescript
interface ChatContext {
  labels: Required<CopilotChatLabels>;
  icons: Required<CopilotChatIcons>;
  open: boolean;
  setOpen: (open: boolean) => void;
}
```

**V2 Interface:**
```typescript
interface CopilotChatConfigurationValue {
  labels: CopilotChatLabels;
  agentId: string;
  threadId: string;
  isModalOpen: boolean;           // replaces 'open'
  setModalOpen: (open: boolean) => void;  // replaces 'setOpen'
  isModalDefaultOpen: boolean;
}
```

**Before (v1):**
```typescript
import { useChatContext } from '@copilotkit/react-ui';

const { labels, icons, open, setOpen } = useChatContext();
```

**After (v2):**
```typescript
import { useCopilotChatConfiguration } from '@copilotkit/react-core/v2';

const config = useCopilotChatConfiguration();
// Returns null if used outside CopilotChat context

if (config) {
  const { 
    labels,           // Chat labels (placeholder, title, etc.)
    isModalOpen,      // Whether modal is open (replaces 'open')
    setModalOpen,     // Toggle modal (replaces 'setOpen')
    agentId,          // Current agent ID (new)
    threadId,         // Current thread ID (new)
    isModalDefaultOpen 
  } = config;
}
```

**Key Differences:**
1. **No `icons`** - Icons are handled internally by v2 components
2. **`open` → `isModalOpen`** - Renamed for clarity
3. **`setOpen` → `setModalOpen`** - Renamed for clarity
4. **New fields** - `agentId`, `threadId`, `isModalDefaultOpen`
5. **Returns `null`** if called outside the chat context

**V2 Labels Available:**
```typescript
type CopilotChatLabels = {
  chatInputPlaceholder: string;
  chatInputToolbarStartTranscribeButtonLabel: string;
  chatInputToolbarCancelTranscribeButtonLabel: string;
  chatInputToolbarFinishTranscribeButtonLabel: string;
  chatInputToolbarAddButtonLabel: string;
  chatInputToolbarToolsButtonLabel: string;
  assistantMessageToolbarCopyCodeLabel: string;
  assistantMessageToolbarCopyCodeCopiedLabel: string;
  assistantMessageToolbarCopyMessageLabel: string;
  chatToggleOpenLabel: string;
  chatToggleCloseLabel: string;
  modalHeaderTitle: string;
};
```

---

### 3. `pages/side-panel/src/components/chat/CustomMessages.tsx`

#### Current v1 Code

```typescript
import { useCopilotChatHeadless_c } from '@copilotkit/react-core';
import { useChatContext } from '@copilotkit/react-ui';
import type { MessagesProps } from '@copilotkit/react-ui';
import type { Message } from '@copilotkit/shared';

const { messages: visibleMessages, interrupt } = useCopilotChatHeadless_c();
```

#### Required v2 Changes

```typescript
import { useAgent } from '@copilotkit/react-core/v2';
import { useChatContext } from '@copilotkit/react-ui'; // verify v2 availability
import type { MessagesProps } from '@copilotkit/react-ui';
import type { Message } from '@copilotkit/shared';

const agent = useAgent({ agentId: 'dynamic_agent' });
const visibleMessages = agent.messages;
// interrupt - verify v2 equivalent in agent object
```

---

### 4. `pages/side-panel/src/components/chat/CustomInput.tsx`

#### Current v1 Code

```typescript
import type { InputProps } from '@copilotkit/react-ui';
import { useChatContext } from '@copilotkit/react-ui';
import { useCopilotContext } from '@copilotkit/react-core';
```

#### Required v2 Changes

```typescript
import type { InputProps } from '@copilotkit/react-ui';
import { useChatContext } from '@copilotkit/react-ui'; // verify v2 availability
import { useCopilotKit } from '@copilotkit/react-core/v2';
```

---

### 5. `pages/side-panel/src/components/chat/CustomAssistantMessage.tsx` & `CustomUserMessage.tsx`

#### Current v1 Code

**CustomAssistantMessage.tsx:**
```typescript
import type { AssistantMessageProps } from '@copilotkit/react-ui';
import { useChatContext, Markdown } from '@copilotkit/react-ui';
import { useCopilotChatHeadless_c } from '@copilotkit/react-core';

const { messages, setMessages, reloadMessages } = useCopilotChatHeadless_c();
```

**CustomUserMessage.tsx:**
```typescript
import { ImageRenderer, type UserMessageProps } from '@copilotkit/react-ui';

// ImageRenderer is used to render image attachments in user messages
<ImageRenderer imageUrl={attachment.url} />
```

#### Required v2 Changes

**CustomAssistantMessage.tsx:**
```typescript
import type { AssistantMessageProps } from '@copilotkit/react-ui';
import { useChatContext, Markdown } from '@copilotkit/react-ui'; // verify v2 availability
import { useAgent } from '@copilotkit/react-core/v2';

const agent = useAgent({ agentId: 'dynamic_agent' });
const messages = agent.messages;
// setMessages, reloadMessages - verify v2 equivalents
```

**CustomUserMessage.tsx:**
```typescript
import { ImageRenderer, type UserMessageProps } from '@copilotkit/react-ui'; // verify v2 availability

// Verify ImageRenderer API remains the same in v2
```

#### UI Components in v2 ✅ VERIFIED

| Component | Usage | v2 Status |
|-----------|-------|-----------|
| `ImageRenderer` | Render image attachments | ✅ Still from `@copilotkit/react-ui` |
| `Markdown` | Render markdown content | ✅ Still from `@copilotkit/react-ui` |
| `useChatContext` | Access chat context | ✅ → `useCopilotChatConfiguration` |

---

### 6. `pages/side-panel/src/hooks/useAgentStateManagement.ts`

#### Current v1 Code

```typescript
import { useCoAgent } from '@copilotkit/react-core';

const { state: rawDynamicAgentState, setState: setRawDynamicAgentState } = useCoAgent<AgentStepState>({
  name: 'dynamic_agent',
  initialState: { /* ... */ },
});
```

#### Required v2 Changes

```typescript
import { useAgent } from '@copilotkit/react-core/v2';

const agent = useAgent({ agentId: 'dynamic_agent' });
const rawDynamicAgentState = agent.state as AgentStepState;
// setState handling - determine v2 pattern for updating agent state
```

---

### 7. `pages/side-panel/src/SidePanel.tsx`

#### Current v1 Code

```typescript
import '@copilotkit/react-ui/styles.css';

const COPILOTKIT_PUBLIC_KEY = 'ck_pub_c94e406d9327510d0463f3dbe3c1f2e8';
```

#### Required v2 Changes

**CSS Import:** The styles import path may change in v2. Verify the correct path:
```typescript
// v1 (current)
import '@copilotkit/react-ui/styles.css';

// v2 (verify - may be the same or different)
import '@copilotkit/react-ui/styles.css';
// OR potentially:
// import '@copilotkit/react-ui/dist/styles.css';
```

**Public Key:** The key is passed down to `SessionsPage` which eventually reaches `CopilotKitProvider`. The prop name may change:
- v1: `publicLicenseKey` or `publicApiKey`
- v2: Verify prop name on `CopilotKitProvider`

---

## Props Migration Reference

This section documents how to migrate props from v1 to v2 for all major components.

### CopilotKitProvider Props Migration

| V1 Prop | V2 Prop | Notes |
|---------|---------|-------|
| `runtimeUrl` | `runtimeUrl` | ✅ Same |
| `headers` | `headers` | ✅ Same - `Record<string, string>` |
| `agent` | ❌ Removed | Use `agentId` in `useAgent` or `CopilotChat` instead |
| `publicLicenseKey` | ❌ Removed | Not needed for self-hosted; use headers for auth |
| `publicApiKey` | ❌ Removed | Not needed for self-hosted |
| `threadId` | ❌ Removed | Pass via `x-copilot-thread-id` header or `threadId` prop on `CopilotChat` |
| `showDevConsole` | `showDevConsole` | ✅ Same - `boolean \| "auto"` |
| `transcribeAudioUrl` | `onStartTranscribe` callback on `CopilotChatInput` | Handled via input component |
| `textToSpeechUrl` | `onReadAloud` callback on `CopilotChatAssistantMessage` | Handled via message component |
| `onError` | ❌ Removed | Use error handling via hooks/subscription |
| - | `properties` | 🆕 New - `Record<string, unknown>` |
| - | `useSingleEndpoint` | 🆕 New - `boolean` |
| - | `agents__unsafe_dev_only` | 🆕 New - For dev-only agent injection |
| - | `renderToolCalls` | 🆕 New - Replaces `useRenderToolCall` |
| - | `renderActivityMessages` | 🆕 New - Replaces `useCoAgentStateRender` |
| - | `renderCustomMessages` | 🆕 New - For custom message rendering |
| - | `frontendTools` | 🆕 New - Replaces `useFrontendTool` (declarative) |
| - | `humanInTheLoop` | 🆕 New - Replaces `useHumanInTheLoop` (declarative) |

**V1 Example:**
```typescript
<CopilotKit
  runtimeUrl={config.runtimeUrl}
  agent="dynamic_agent"
  headers={{
    'x-copilot-agent-type': config.agentType,
    'x-copilot-model-type': config.modelType,
    'x-copilot-thread-id': config.sessionId,
  }}
  publicLicenseKey={config.publicApiKey}
  showDevConsole={false}
  threadId={config.sessionId}
  transcribeAudioUrl="/api/transcribe"
  textToSpeechUrl="/api/tts"
  onError={(e) => console.error(e)}
>
  {children}
</CopilotKit>
```

**V2 Example:**
```typescript
<CopilotKitProvider
  runtimeUrl={config.runtimeUrl}
  headers={{
    'x-copilot-agent-type': config.agentType,
    'x-copilot-model-type': config.modelType,
    'x-copilot-thread-id': config.sessionId,
    'x-copilot-organization-id': config.organizationId,
    'x-copilot-team-id': config.teamId,
  }}
  showDevConsole={false}
  renderToolCalls={[
    defineToolCallRenderer({
      name: 'get_weather',
      args: z.object({ location: z.string() }),
      render: (props) => <WeatherCard {...props} />,
    }),
  ]}
  renderActivityMessages={[
    {
      activityType: 'task_progress',
      content: z.object({ progress: z.number() }),
      render: ({ content }) => <ProgressBar value={content.progress} />,
    },
  ]}
>
  {children}
</CopilotKitProvider>
```

### CopilotChat/CopilotSidebar Props Migration

| V1 Prop | V2 Prop | Notes |
|---------|---------|-------|
| - | `agentId` | 🆕 Required - Specifies which agent to use |
| - | `threadId` | 🆕 Optional - For conversation persistence |
| - | `labels` | 🆕 Partial labels customization |
| `imageUploadsEnabled` | `onAddFile` callback on `CopilotChatInput` | File handling via callback |
| `onSubmitMessage` | ❌ Removed | Handled internally |
| `onInProgress` | ❌ Removed | Use `useCopilotKit` to subscribe to events |
| `renderError` | ❌ Removed | Handle via error boundaries |
| `markdownTagRenderers` | `markdownRenderer` slot on `CopilotChatAssistantMessage` | Uses Streamdown library |
| `AssistantMessage` | `messageView` slot | Use slot-based customization |
| `UserMessage` | `messageView` slot | Use slot-based customization |
| `Messages` | `messageView` slot | Use slot-based customization |
| `Input` | `input` slot | Use slot-based customization |
| `suggestions` | ❌ Removed | Use `useConfigureSuggestions` hook |
| - | `chatView` | 🆕 Slot for entire chat view override |
| - | `autoScroll` | 🆕 Boolean to enable auto-scroll |
| - | `inputProps` | 🆕 Props to pass to input component |

**V1 Example:**
```typescript
<CopilotChat
  imageUploadsEnabled={false}
  onSubmitMessage={handleSubmitMessage}
  onInProgress={handleInProgress}
  renderError={renderError}
  markdownTagRenderers={customRenderers}
  AssistantMessage={CustomAssistantMessage}
  UserMessage={CustomUserMessage}
  Messages={MessagesComponent}
  Input={ScopedInput}
  suggestions={mySuggestions}
/>
```

**V2 Example:**
```typescript
<CopilotChat
  agentId="my_agent"
  threadId={sessionId}
  labels={{
    chatInputPlaceholder: "Ask me anything...",
    modalHeaderTitle: "AI Assistant",
  }}
  autoScroll={true}
  inputProps={{
    placeholder: "Type your message...",
  }}
/>

// OR with slot overrides
<CopilotSidebar
  agentId="my_agent"
  header={(props) => <CustomHeader {...props} />}
  width={400}
  defaultOpen={true}
/>
```

### CopilotSidebar-Specific Props

| V1 Prop | V2 Prop | Notes |
|---------|---------|-------|
| `defaultOpen` | `defaultOpen` | ✅ Same |
| - | `header` | 🆕 Slot for header customization |
| - | `width` | 🆕 Width of sidebar |

### Labels Customization (V2)

V2 provides a comprehensive `labels` prop for text customization:

```typescript
type CopilotChatLabels = {
  chatInputPlaceholder: string;
  chatInputToolbarStartTranscribeButtonLabel: string;
  chatInputToolbarCancelTranscribeButtonLabel: string;
  chatInputToolbarFinishTranscribeButtonLabel: string;
  chatInputToolbarAddButtonLabel: string;
  chatInputToolbarToolsButtonLabel: string;
  assistantMessageToolbarCopyCodeLabel: string;
  assistantMessageToolbarCopyCodeCopiedLabel: string;
  assistantMessageToolbarCopyMessageLabel: string;
  chatToggleOpenLabel: string;
  chatToggleCloseLabel: string;
  modalHeaderTitle: string;
};

// Usage
<CopilotChat
  agentId="my_agent"
  labels={{
    chatInputPlaceholder: "Ask me about weather...",
    modalHeaderTitle: "Weather Assistant",
  }}
/>
```

### Slot-Based Customization (V2)

V2 uses a slot-based pattern for component customization instead of direct prop overrides:

```typescript
// V2 slot pattern
<CopilotChatView
  messageView={(props) => <CustomMessageView {...props} />}
  input={(props) => <CustomInput {...props} />}
  scrollView={(props) => <CustomScrollView {...props} />}
  suggestionView={(props) => <CustomSuggestionView {...props} />}
  disclaimer={(props) => <CustomDisclaimer {...props} />}
/>

// Or use the built-in components with customization
<CopilotSidebar
  header={(props) => (
    <CopilotModalHeader {...props} title="My AI Assistant">
      <CopilotModalHeader.Title>Custom Title</CopilotModalHeader.Title>
      <CopilotModalHeader.CloseButton />
    </CopilotModalHeader>
  )}
/>
```

### Key Migration Patterns

#### 1. Agent Selection (CRITICAL CHANGE)

```typescript
// V1: Agent specified on provider
<CopilotKit agent="dynamic_agent">
  <CopilotChat />
</CopilotKit>

// V2: Agent specified on chat component or hook
<CopilotKitProvider>
  <CopilotChat agentId="my_agent" />
</CopilotKitProvider>

// Or via hook
const { agent } = useAgent({ agentId: 'my_agent' });
```

#### 2. Thread ID / Session Management

```typescript
// V1: threadId on provider
<CopilotKit threadId={sessionId}>

// V2: threadId via headers OR on chat component
<CopilotKitProvider headers={{ 'x-copilot-thread-id': sessionId }}>
  <CopilotChat threadId={sessionId} />
</CopilotKitProvider>
```

#### 3. Custom Tool Rendering

```typescript
// V1: useRenderToolCall hook
useRenderToolCall({
  name: 'get_weather',
  render: ({ args, result }) => <WeatherCard {...args} result={result} />,
});

// V2: renderToolCalls prop on provider
<CopilotKitProvider
  renderToolCalls={[
    defineToolCallRenderer({
      name: 'get_weather',
      args: z.object({ location: z.string() }),
      render: (props) => <WeatherCard {...props} />,
    }),
  ]}
>
```

#### 4. Suggestions

```typescript
// V1: useCopilotChatSuggestions hook
useCopilotChatSuggestions({
  instructions: 'Generate helpful suggestions',
  minSuggestions: 3,
  maxSuggestions: 5,
});

// V2: useConfigureSuggestions hook
useConfigureSuggestions({
  instructions: 'Generate helpful suggestions',
});

// Or access via useSuggestions for programmatic control
const { suggestions, reloadSuggestions } = useSuggestions({ agentId: 'my_agent' });
```

---

## CopilotChat Component Migration

### Current v1 Usage

```typescript
<CopilotChat
  imageUploadsEnabled={false}
  onSubmitMessage={handleSubmitMessage}
  onInProgress={handleInProgress}
  renderError={renderError}
  markdownTagRenderers={customMarkdownTagRenderers}
  AssistantMessage={CustomAssistantMessage}
  UserMessage={CustomUserMessage}
  Messages={MessagesComponent}
  Input={ScopedInput}
/>
```

### v2 Considerations

1. **Component Name**: May remain `CopilotChat` or become `CopilotSidebar`
2. **Props Changes**:
   - `onSubmitMessage` → verify v2 equivalent
   - `onInProgress` → may be replaced by observing `agent.isLoading`
   - `renderError` → verify v2 equivalent
   - `markdownTagRenderers` → verify v2 equivalent
   - Custom message components → verify v2 prop names

### Recommended Approach

1. First, check if `CopilotChat` is exported from `@copilotkit/react-ui` in v2
2. Compare prop interfaces between v1 and v2
3. Adapt custom components (AssistantMessage, UserMessage, Messages, Input) to v2 interfaces

---

## Migration Steps (Recommended Order)

### Phase 1: Preparation

1. **Create a new branch** for the migration
2. **Update all `@copilotkit/*` packages** to `1.50.0-beta.7`
3. **Review breaking changes** in CopilotKit v2 changelog/documentation

### Phase 2: Server-Side Migration

1. Update `copilot-runtime-server/server.js`:
   - Import from `@copilotkit/runtime/v2`
   - Create `InMemoryAgentRunner`
   - Update `CopilotRuntime` initialization

2. Update `copilot-runtime-server/routes/copilotkit.js`:
   - Implement Hono-Express bridge or
   - Use fetch handler approach

3. Verify `copilot-runtime-server/adapters/dynamic.js`:
   - Check service adapter compatibility

4. **Test server independently** before client migration

### Phase 3: Client-Side Migration (Core)

1. **Start with `SessionRuntimeContext.tsx`**:
   - Replace `CopilotKit` with `CopilotKitProvider`
   - Replace `useCopilotChatHeadless_c` with `useAgent`
   - Update all prop names and configurations

2. **Update `useAgentStateManagement.ts`**:
   - Replace `useCoAgent` with `useAgent`

### Phase 4: Client-Side Migration (Components)

1. **Update `ChatInner.tsx`**:
   - Migrate all hooks systematically
   - Update `CopilotChat` component usage
   - Handle tool renderers via `defineToolCallRenderer`

2. **Update Custom Message Components**:
   - `CustomMessages.tsx`
   - `CustomAssistantMessage.tsx`
   - `CustomUserMessage.tsx`

3. **Update `CustomInput.tsx`**:
   - Replace `useCopilotContext` with `useCopilotKit`

### Phase 5: Testing & Validation

1. **Unit test** individual components
2. **Integration test** full chat flow
3. **Verify agent state synchronization**
4. **Test all custom tools and actions**
5. **Validate message persistence/threading**

---

## Risk Assessment

### High Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| Multiple runtime instances | v2 may handle session management differently | Test multi-session scenarios thoroughly |
| Custom message components | Interface changes may break rendering | Prepare fallback components |
| Tool rendering | `useRenderToolCall` → `defineToolCallRenderer` is a significant pattern change | Migrate incrementally |
| Express integration | v2 is Hono-based | Consider Hono adapter or hybrid approach |

### Medium Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| State management | `useCoAgent` → `useAgent` API differences | Create abstraction layer |
| Chat suggestions | API changes | Verify `useConfigureSuggestions` API |
| Service adapters | May need updates for v2 | Test each provider adapter |

### Low Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| Package updates | Straightforward version bump | Use lockfile for consistency |
| Agent creation | `HttpAgent` remains compatible | Minor adjustments |
| Styling | CSS imports unchanged | None needed |

---

## Open Questions for CopilotKit Team

1. ~~Is `useCopilotReadable` available in v2?~~ ✅ **RESOLVED**: Use `useAgentContext` from `@copilotkit/react-core/v2` (value must be string)
2. ~~What is the v2 equivalent for `setMessages` and `reloadMessages` from `useCopilotChatHeadless_c`?~~ ✅ **RESOLVED**: 
   - Messages are managed internally by `CopilotChat`/`CopilotSidebar` components
   - Use `copilotkit.runAgent()` to re-run, `copilotkit.stopAgent()` to stop
   - Use `useSuggestions().reloadSuggestions()` for suggestion regeneration
3. ~~How does v2 handle conversation threading (`threadId`)?~~ ✅ **RESOLVED**: Pass via `x-copilot-thread-id` header in `CopilotKitProvider`
4. ~~Is there official Express adapter support for `createCopilotEndpoint`?~~ ✅ **RESOLVED**: Use Hono with `@hono/node-server` - see Option C in server migration
5. ~~What's the recommended pattern for updating agent state from the client in v2?~~ ✅ **RESOLVED**: Use `agent.setState()` from `useAgent` hook
6. ~~Is `useChatContext` available in v2?~~ ✅ **RESOLVED**: Use `useCopilotChatConfiguration` from `@copilotkit/react-core/v2`

### Remaining Questions

1. ~~What is the v2 equivalent for `useCoAgentStateRender` for rendering state-based UI?~~ ✅ **RESOLVED**: Use `renderActivityMessages` prop on `CopilotKitProvider` with `ReactActivityMessageRenderer`

   ```typescript
   import { CopilotKitProvider, ReactActivityMessageRenderer } from '@copilotkit/react-core/v2';
   import { z } from 'zod';

   const activityRenderers: ReactActivityMessageRenderer<any>[] = [
     {
       activityType: 'task_progress',  // or '*' for wildcard
       agentId: 'my_agent',            // optional - scope to specific agent
       content: z.object({
         taskName: z.string(),
         progress: z.number(),
       }),
       render: ({ content, status }) => (
         <TaskProgressCard taskName={content.taskName} progress={content.progress} />
       ),
     },
   ];

   <CopilotKitProvider renderActivityMessages={activityRenderers}>
   ```

2. ~~What is the v2 equivalent for `useDefaultTool` (default render for all tools)?~~ ✅ **RESOLVED**: Use `WildcardToolCallRender` or `defineToolCallRenderer` with `name: "*"`

   ```typescript
   import { WildcardToolCallRender, defineToolCallRenderer } from '@copilotkit/react-core/v2';
   import { z } from 'zod';

   // Option 1: Use built-in WildcardToolCallRender
   <CopilotKitProvider renderToolCalls={[WildcardToolCallRender]}>

   // Option 2: Custom wildcard renderer
   const wildcardRenderer = defineToolCallRenderer({
     name: '*',  // Wildcard - matches any tool
     args: z.any(),
     render: ({ name, args, status, result }) => (
       <DefaultToolCard name={name} args={args} status={status} result={result} />
     ),
   });

   <CopilotKitProvider renderToolCalls={[wildcardRenderer]}>
   ```

3. ~~How to access raw messages array programmatically in v2 (like `visibleMessages` in v1)?~~ ✅ **RESOLVED**: Use `copilotkit.getStateByRun()` or `copilotkit.getStatesForThread()`

   ```typescript
   import { useCopilotKit } from '@copilotkit/react-core/v2';

   const { copilotkit } = useCopilotKit();

   // Get state (including messages) for a specific run
   const state = copilotkit.getStateByRun('my_agent', 'thread-id', 'run-id');
   const messages = state?.messages ?? [];

   // Get all states for a thread (Map<runId, State>)
   const allStates = copilotkit.getStatesForThread('my_agent', 'thread-id');
   ```

### All Questions Resolved! 🎉

---

## Comprehensive Server-Side V1 Items Review

This section documents all v1-specific items found in `copilot-runtime-server/` that require attention during migration.

### Package Dependencies (package.json)

| Package | V1 Version | V2 Version | Notes |
|---------|------------|------------|-------|
| `@copilotkit/runtime` | `1.10.6` | `1.50.0-beta.7` | Major API changes |
| `@ag-ui/client` | `0.0.39` | `0.0.42+` | Type compatibility |
| `openai` | `4.104.0` | `4.x` or `6.x` | Check peer deps |

### V1 Imports to Change

#### 1. `server.js` - Main Entry Point

```javascript
// V1 (Current)
import { CopilotRuntime } from "@copilotkit/runtime";

const runtime = new CopilotRuntime({
  agents: {
    "dynamic_agent": defaultAgent,
  },
});

// V2 (Required)
import { CopilotRuntime, InMemoryAgentRunner } from "@copilotkit/runtime/v2";

const runtime = new CopilotRuntime({
  agents: {
    "dynamic_agent": defaultAgent,
  },
  runner: new InMemoryAgentRunner(),  // NEW: Required in v2
});
```

#### 2. `routes/copilotkit.js` - Express Endpoint

```javascript
// V1 (Current)
import { copilotRuntimeNodeExpressEndpoint } from "@copilotkit/runtime";

export function createCopilotKitEndpoint(serviceAdapter, runtime) {
  return copilotRuntimeNodeExpressEndpoint({
    endpoint: '/api/copilotkit',
    serviceAdapter,
    runtime,
  });
}

// V2 (Required - Use Hono)
import { createCopilotEndpoint } from "@copilotkit/runtime/v2";
import { Hono } from "hono";

// See "Option C: Full Hono Server" section for complete implementation
```

#### 3. `adapters/openai.js` - OpenAI Adapter

```javascript
// V1 (Current)
import { OpenAIAdapter } from "@copilotkit/runtime";

return new OpenAIAdapter({ openai });

// V2 - VERIFY if adapters are still available
import { OpenAIAdapter } from "@copilotkit/runtime/v2";  // May not exist!

// NOTE: V2 uses AG-UI protocol - adapters may work differently
// The runtime forwards to HttpAgent instead of using service adapters directly
```

#### 4. `adapters/anthropic.js` - Anthropic Adapter

```javascript
// V1 (Current)
import { AnthropicAdapter } from "@copilotkit/runtime";

return new AnthropicAdapter({
  anthropic: anthropicClient,
  model: bedrockModelId,
  promptCaching: { enabled: true, debug: DEBUG }
});

// V2 - VERIFY availability
// Service adapters may be deprecated in favor of AG-UI HttpAgent
```

#### 5. `adapters/google.js` - Google Gemini Adapter

```javascript
// V1 (Current)
import { GoogleGenerativeAIAdapter } from "@copilotkit/runtime";

return new GoogleGenerativeAIAdapter({
  model: modelId,
  apiKey: apiKey,
  promptCaching: { enabled: true, debug: DEBUG }
});

// V2 - VERIFY availability
```

### V1 Patterns to Migrate

#### 1. Dynamic Service Adapter Pattern (`adapters/dynamic.js`)

**V1 Pattern:**
```javascript
// Custom service adapter with process() method
export async function createDynamicServiceAdapter() {
  return {
    async process(request) {
      const model = request.model || await getDefaultModel();
      
      if (isClaudeModel(model)) {
        const adapter = await createAnthropicAdapter(model);
        return adapter.process(request);
      }
      // ... similar for other models
    }
  };
}
```

**V2 Migration Notes:**
- V2 may not use service adapters the same way
- The CopilotRuntime in v2 works with AG-UI agents (HttpAgent)
- Model selection may need to happen at the Python backend level
- **INVESTIGATION NEEDED**: Check if `createCopilotEndpoint` accepts service adapters

#### 2. Runtime Agent Mutation (`middleware/dynamicRouting.js`)

**V1 Pattern:**
```javascript
// Direct mutation of runtime.agents
await runExclusive(async () => {
  const previousAgent = runtime.agents['dynamic_agent'];
  runtime.agents['dynamic_agent'] = await createHttpAgent(agent, model, authContext);
  
  await new Promise((resolve) => {
    res.once('finish', () => {
      runtime.agents['dynamic_agent'] = previousAgent;
      resolve();
    });
    next();
  });
});
```

**V2 Pattern:**
```javascript
// Similar pattern but with type assertions
await runExclusive(async () => {
  const previousAgent = (sharedRuntime.agents as Record<string, AbstractAgent>)[DEFAULT_AGENT];
  (sharedRuntime.agents as Record<string, AbstractAgent>)[DEFAULT_AGENT] = newAgent;
  
  // Cleanup on response end
  res.once('finish', () => {
    (sharedRuntime.agents as Record<string, AbstractAgent>)[DEFAULT_AGENT] = previousAgent;
  });
  next();
});
```

#### 3. Request Context Capture (`adapters/dynamic.js`)

**V1 Pattern:**
```javascript
// Global context storage
let currentRequestContext = { 
  organizationId: null, 
  teamId: null,
  agent: null,
  model: null
};

export function captureRequestContext(req, res, next) {
  currentRequestContext = {
    organizationId: req.authContext?.organizationId,
    teamId: req.authContext?.teamId,
    agent: req.headers['x-copilot-agent-type'],
    model: req.headers['x-copilot-model-type'],
  };
  next();
}
```

**V2 Notes:**
- This pattern may still work in v2
- Context is forwarded via HttpAgent headers to the Python backend
- The Python backend handles actual LLM provider selection

### Files Requiring Migration

| File | V1 Items | Migration Effort |
|------|----------|-----------------|
| `server.js` | `CopilotRuntime` import, no `runner` | Medium |
| `routes/copilotkit.js` | `copilotRuntimeNodeExpressEndpoint` | High - Hono conversion |
| `adapters/openai.js` | `OpenAIAdapter` | High - May be deprecated |
| `adapters/anthropic.js` | `AnthropicAdapter` | High - May be deprecated |
| `adapters/google.js` | `GoogleGenerativeAIAdapter` | High - May be deprecated |
| `adapters/dynamic.js` | Custom service adapter | High - Architecture change |
| `middleware/dynamicRouting.js` | `runtime.agents` mutation | Low - Same pattern works |
| `agents/dynamic.js` | `HttpAgent` from `@ag-ui/client` | Low - Compatible |

### ✅ Solution: Use `BasicAgent` Instead of Service Adapters

**V2 introduces `BasicAgent` which replaces the need for service adapters!**

According to the [CopilotKit v1.50 Pre-Release Packet](https://copilotkit.notion.site/CopilotKit-v1-50-Pre-Release-Packet-2b23aa381852800fae86ca323de6fc1e), `BasicAgent` provides direct LLM integration with built-in multi-provider support.

**V1 Architecture (Service Adapters):**
```
Client → Express → serviceAdapter.process(request) → LLM Provider
                          ↓
              Dynamic model selection (Claude/GPT/Gemini)
```

**V2 Architecture (BasicAgent - RECOMMENDED):**
```
Client → Hono/Express → CopilotRuntime → BasicAgent → LLM Provider (direct)
                                              ↓
                              Built-in multi-provider support!
```

**V2 Architecture (HttpAgent - for complex agents):**
```
Client → Hono/Express → CopilotRuntime → HttpAgent → Python Backend → LLM Provider
```

### BasicAgent Implementation

```typescript
import { BasicAgent } from "@copilotkitnext/agent";
import { CopilotRuntime, InMemoryAgentRunner } from "@copilotkit/runtime/v2";

const runtime = new CopilotRuntime({
  agents: {
    myAgent: new BasicAgent({
      model: "openai/gpt-4o",  // Built-in multi-provider support!
      prompt: "You are a helpful AI assistant.",
      temperature: 0.7,
      tools: [...]  // Optional tools
    }),
  },
  runner: new InMemoryAgentRunner(),
});
```

**Supported Models (built-in):**

| Provider | Models |
|----------|--------|
| **OpenAI** | `openai/gpt-5`, `openai/gpt-4.1`, `openai/gpt-4o`, `openai/gpt-4o-mini`, `openai/o3`, `openai/o3-mini`, `openai/o4-mini` |
| **Anthropic** | `anthropic/claude-sonnet-4.5`, `anthropic/claude-sonnet-4`, `anthropic/claude-opus-4.1`, `anthropic/claude-opus-4`, `anthropic/claude-3.7-sonnet`, `anthropic/claude-3.5-haiku` |
| **Google** | `google/gemini-2.5-pro`, `google/gemini-2.5-flash`, `google/gemini-2.5-flash-lite` |

**Package:** `@copilotkitnext/agent@0.0.28`

### Migration Options

1. **Option A: Use `BasicAgent` for direct LLM access (Simplest)**
   - No Python backend needed for simple use cases
   - Built-in multi-provider support (OpenAI, Anthropic, Google)
   - Shared state support via `useAgent` hook on frontend
   - **Replaces:** `OpenAIAdapter`, `AnthropicAdapter`, `GoogleGenerativeAIAdapter`

2. **Option B: Use `HttpAgent` for Python backend (Current approach)**
   - For complex agentic workflows (LangGraph, PydanticAI, CrewAI)
   - Model selection happens in Python
   - Node.js server forwards requests with auth headers

3. **Option C: Hybrid BasicAgent + HttpAgent**
   - Use BasicAgent for simple queries (fast, low latency)
   - Use HttpAgent for complex agent workflows (multi-step reasoning)

### Dynamic Model Selection with BasicAgent

To replicate the v1 dynamic adapter pattern:

```typescript
import { BasicAgent } from "@copilotkitnext/agent";

// Dynamic agent factory based on model type
function createDynamicBasicAgent(modelKey: string, systemPrompt: string) {
  const modelMap: Record<string, string> = {
    'gpt-4o': 'openai/gpt-4o',
    'gpt-4o-mini': 'openai/gpt-4o-mini',
    'claude-4.5-haiku': 'anthropic/claude-3.5-haiku',
    'claude-4.5-sonnet': 'anthropic/claude-sonnet-4.5',
    'gemini-2.5-flash': 'google/gemini-2.5-flash',
    'gemini-2.5-flash-lite': 'google/gemini-2.5-flash-lite',
  };

  return new BasicAgent({
    model: modelMap[modelKey] || 'openai/gpt-4o',
    prompt: systemPrompt,
    temperature: 0.7,
  });
}

// In middleware, swap agents based on request headers
const requestedModel = req.headers['x-copilot-model-type'] || 'gpt-4o';
runtime.agents['dynamic_agent'] = createDynamicBasicAgent(requestedModel, systemPrompt);
```

### Auth Context Headers (COMPATIBLE)

The header forwarding pattern works the same in v2:

```javascript
const authContextHeaders = {
  'x-copilot-user-id': authContext.userId,
  'x-copilot-user-email': authContext.userEmail,
  'x-copilot-user-name': authContext.userName,
  'x-copilot-organization-id': authContext.organizationId,
  'x-copilot-organization-name': authContext.organizationName,
  'x-copilot-organization-slug': authContext.organizationSlug,
  'x-copilot-member-role': authContext.memberRole,
  'x-copilot-team-id': authContext.teamId,
  'x-copilot-team-name': authContext.teamName,
  'x-copilot-session-id': authContext.sessionId,
  'x-copilot-thread-id': threadId,
};

// These are forwarded via HttpAgent headers to Python backend
new HttpAgent({ url: targetUrl, headers: authContextHeaders });
```

### Exclusive Lock Pattern (COMPATIBLE)

The `runExclusive` pattern for preventing race conditions works in both versions:

```javascript
let agentUpdateChain = Promise.resolve();

const runExclusive = (fn) => {
  const run = agentUpdateChain.then(() => fn());
  agentUpdateChain = run.catch(() => {});
  return run;
};
```

### Multi-Tenant Configuration (COMPATIBLE)

The configuration loading pattern remains unchanged:
- Database-stored provider configurations
- Organization/team scoped settings
- Model configuration caching

---

## Resources

- [CopilotKit v2 Migration Guide](https://docs.copilotkit.ai/migration) (verify URL)
- [AG-UI Protocol Documentation](https://ag-ui.dev)
- [Beta Test App Reference](/Users/hnankam/Downloads/data/beta-test/)

---

## Appendix: Complete Import Changes Summary

### Server (`copilot-runtime-server`)

```javascript
// Before
import { CopilotRuntime } from "@copilotkit/runtime";
import { copilotRuntimeNodeExpressEndpoint } from "@copilotkit/runtime";

// After
import { CopilotRuntime, InMemoryAgentRunner, createCopilotEndpoint } from "@copilotkit/runtime/v2";
```

### Client (`side-panel`)

```typescript
// Before (v1)
import { CopilotKit, useCopilotChatHeadless_c, useCoAgent, useCoAgentStateRender, useCopilotContext, useCopilotReadable, useFrontendTool, useHumanInTheLoop, useDefaultTool, useRenderToolCall } from '@copilotkit/react-core';
import { CopilotChat, useCopilotChatSuggestions, useChatContext, Markdown } from '@copilotkit/react-ui';

// After (v2)
import { CopilotKitProvider, useAgent, useCopilotKit, useFrontendTool, useHumanInTheLoop, useDefaultTool, useConfigureSuggestions, useAgentContext } from '@copilotkit/react-core/v2';
import { CopilotSidebar, useChatContext, Markdown } from '@copilotkit/react-ui';
// Note: useRenderToolCall is replaced by defineToolCallRenderer prop on CopilotKitProvider
// Note: useAgentContext replaces useCopilotReadable (value must be stringified)

// After
import { CopilotKitProvider, useAgent, useCopilotKit, useFrontendTool, useHumanInTheLoop, useDefaultTool, useConfigureSuggestions } from '@copilotkit/react-core/v2';
import { CopilotSidebar, useChatContext, Markdown } from '@copilotkit/react-ui'; // verify exports
// Note: useRenderToolCall is replaced by defineToolCallRenderer prop on CopilotKitProvider
```

---

## Pre-Migration Verification Checklist

Before proceeding with migration, verify the following exports/APIs exist in CopilotKit v2:

### Server-Side (`@copilotkit/runtime/v2`)

- [x] `CopilotRuntime` class ✅
- [x] `InMemoryAgentRunner` class ✅
- [x] `createCopilotEndpoint` function ✅
- [x] `BasicAgent` class ✅ From `@copilotkitnext/agent` - **Replaces service adapters!**
- ❌ `AnthropicAdapter` class - **Deprecated, use BasicAgent**
- ❌ `OpenAIAdapter` class - **Deprecated, use BasicAgent**
- ❌ `GoogleGenerativeAIAdapter` class - **Deprecated, use BasicAgent**
- [x] Express compatibility (Hono adapter) ✅ Use `hono` + `@hono/node-server`

### Client-Side (`@copilotkit/react-core/v2`)

- [x] `CopilotKitProvider` component ✅
- [x] `useAgent` hook ✅
- [x] `useCopilotKit` hook ✅
- [x] `useFrontendTool` hook ✅
- [x] `useHumanInTheLoop` hook ✅
- [x] `WildcardToolCallRender` ✅ (replaces `useDefaultTool`)
- [x] `useConfigureSuggestions` hook ✅
- [x] `useAgentContext` hook ✅
- [x] `defineToolCallRenderer` prop on `CopilotKitProvider` ✅
- [x] `useSuggestions` hook ✅ (new in v2)
- [x] `useCopilotChatConfiguration` hook ✅ (replaces `useChatContext`)
- [x] `useRenderToolCall` hook ✅ (new in v2)
- [x] `useRenderActivityMessage` hook ✅ (new in v2)
- [x] `useRenderCustomMessages` hook ✅ (new in v2)
- [x] `renderActivityMessages` prop on `CopilotKitProvider` ✅ (replaces `useCoAgentStateRender`)
- [x] `copilotkit.getStateByRun()` ✅ (for messages access)
- [x] `copilotkit.getStatesForThread()` ✅ (for messages access)

### UI Components (`@copilotkit/react-ui` - STILL WORKS IN V2!)

- [x] `CopilotChat` component ✅ Moves to `@copilotkit/react-core/v2`
- [x] `CopilotSidebar` component ✅ Available from `@copilotkit/react-core/v2`
- [x] `useCopilotChatConfiguration` hook ✅ Replaces `useChatContext`
- [x] `CopilotChatAssistantMessage.MarkdownRenderer` ✅ Replaces `Markdown` (uses `Streamdown`)
- ❌ `ImageRenderer` - Not available in v2, handle in custom message component
- [x] `CopilotChatInputProps` type ✅ Replaces `InputProps`
- [x] `CopilotChatMessageViewProps` type ✅ Replaces `MessagesProps`
- [x] `CopilotChatUserMessageProps` type ✅ Replaces `UserMessageProps`
- [x] `CopilotChatAssistantMessageProps` type ✅ Replaces `AssistantMessageProps`

### V2 Additional Components Available

- [x] `CopilotChatInput` - Input component with transcribe support
- [x] `CopilotChatAssistantMessage` - Assistant message with toolbar
- [x] `CopilotChatUserMessage` - User message with edit/branch support
- [x] `CopilotChatMessageView` - Message list container
- [x] `CopilotChatSuggestionView` - Suggestions display
- [x] `CopilotChatToolCallsView` - Tool calls display
- [x] `CopilotModalHeader` - Header for modals
- [x] `CopilotChatToggleButton` - Open/close toggle

### CSS Styles

- [x] `@copilotkitnext/react/styles.css` ✅ **REQUIRED** for v2 CopilotChat styling
- Note: V1 `@copilotkit/react-ui/styles.css` not needed if using only v2 components

### New V2 Packages to Install

- [x] `@copilotkitnext/react` (0.0.27+) - V2 React components
- [x] `@copilotkitnext/core` (0.0.27+) - Core v2 functionality
- [x] `@copilotkitnext/agent` (0.0.28+) - BasicAgent for direct LLM access
- [x] `@ag-ui/client` (^0.0.42) - AG-UI protocol client
- [x] `@ag-ui/core` (0.0.42) - AG-UI core types
- [x] `hono` (^4.10.8) - For v2 runtime server
- [x] `@hono/node-server` (^1.19.7) - Node.js adapter for Hono

### Shared Types

- [x] `Message` type ✅ From `@ag-ui/core` (not `@copilotkit/shared`)

---

*Document created: December 9, 2025*
*Last updated: December 9, 2025*

**Changelog:**
- Added `useChatContext` → `useCopilotChatConfiguration` migration
- Added `useSuggestions` hook documentation  
- Added Hono server implementation (Option C)
- Resolved `useCoAgentStateRender` → `renderActivityMessages` prop
- Resolved `useDefaultTool` → `WildcardToolCallRender`
- Resolved messages access via `copilotkit.getStateByRun()`
- **All open questions resolved!**
- Added comprehensive `copilot-runtime-server` V1 items review
- **NEW:** Added `BasicAgent` as solution for service adapter replacement
  - Package: `@copilotkitnext/agent@0.0.28`
  - Built-in support for OpenAI, Anthropic, Google models
  - Model format: `provider/model-name` (e.g., `openai/gpt-4o`)
  - Replaces need for `OpenAIAdapter`, `AnthropicAdapter`, `GoogleGenerativeAIAdapter`
- **NEW:** Added comprehensive Props Migration Reference
  - `CopilotKitProvider` props mapping (v1 → v2)
  - `CopilotChat`/`CopilotSidebar` props mapping
  - Labels customization guide
  - Slot-based customization patterns
  - Key migration patterns (agent selection, thread ID, tool rendering, suggestions)
- **FINAL REVIEW:** All open items resolved
  - `Markdown` → `CopilotChatAssistantMessage.MarkdownRenderer` (uses Streamdown)
  - `ImageRenderer` → Handle in custom message component (not in v2)
  - `Message` type → From `@ag-ui/core`
  - UI Type exports → All have v2 equivalents with `CopilotChat*Props` naming
  - `transcribeAudioUrl` → `onStartTranscribe` callback
  - `textToSpeechUrl` → `onReadAloud` callback
  - `imageUploadsEnabled` → `onAddFile` callback
  - `markdownTagRenderers` → `markdownRenderer` slot (uses Streamdown)

*Based on analysis of CopilotKit v1.10.6 → v1.50.0-beta.7 migration*
*Reference: [CopilotKit v1.50 Pre-Release Packet](https://copilotkit.notion.site/CopilotKit-v1-50-Pre-Release-Packet-2b23aa381852800fae86ca323de6fc1e)*

