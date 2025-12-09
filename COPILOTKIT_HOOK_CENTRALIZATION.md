# CopilotKit Hook Centralization Plan

## ✅ Implementation Status: FULLY COMPLETED

All CopilotKit hooks, components, and types have been centralized and integrated into the codebase.

### Implemented Files

#### Hooks

| File | Purpose | v2 Equivalent |
|------|---------|---------------|
| `src/hooks/copilotkit/useCopilotChat.ts` | Wraps `useCopilotChatHeadless_c` | `useAgent` + `useSuggestions` |
| `src/hooks/copilotkit/useCopilotAgent.ts` | Wraps `useCoAgent` | `useAgent` |
| `src/hooks/copilotkit/useCopilotAgentStateRender.ts` | Wraps `useCoAgentStateRender` | `renderActivityMessages` prop |
| `src/hooks/copilotkit/useCopilotRuntimeContext.ts` | Wraps `useCopilotContext` | `useCopilotKit` |
| `src/hooks/copilotkit/useCopilotReadableData.ts` | Wraps `useCopilotReadable` | `useAgentContext` |
| `src/hooks/copilotkit/useCopilotSuggestions.ts` | Wraps `useCopilotChatSuggestions` | `useConfigureSuggestions` |
| `src/hooks/copilotkit/useCopilotChatContext.ts` | Wraps `useChatContext` | `useCopilotChatConfiguration` |
| `src/hooks/copilotkit/useCopilotTools.ts` | Re-exports tool hooks | Various v2 hooks/props |

#### Components & Types

| File | Purpose |
|------|---------|
| `src/hooks/copilotkit/components.ts` | Re-exports `CopilotKit`, `CopilotChat`, `Markdown`, `ImageRenderer` |
| `src/hooks/copilotkit/types.ts` | Re-exports `Message`, `InputProps`, `MessagesProps`, `UserMessageProps`, `AssistantMessageProps` |
| `src/hooks/copilotkit/index.ts` | Central export for all hooks, components, and types |

### Updated Consumer Files

| File | Centralized Imports Used |
|------|-------------------------|
| `ChatInner.tsx` | `CopilotChat`, `InputProps`, `MessagesProps`, all hooks |
| `SessionRuntimeContext.tsx` | `CopilotKit`, `useCopilotChat` |
| `CustomMessages.tsx` | `useCopilotChat`, `useCopilotChatContext`, `MessagesProps`, `Message` |
| `CustomUserMessage.tsx` | `useCopilotChat`, `ImageRenderer`, `UserMessageProps` |
| `CustomAssistantMessage.tsx` | `useCopilotChat`, `useCopilotChatContext`, `Markdown`, `AssistantMessageProps` |
| `TaskProgressCard.tsx` | `useCopilotChat` |
| `CustomInput.tsx` | `useCopilotRuntimeContext`, `useCopilotChatContext`, `InputProps` |
| `useAgentStateManagement.ts` | `useCopilotAgent` |

---

## Overview

This document outlines a refactoring strategy to centralize CopilotKit hook usage across the codebase, making the v2 migration significantly easier. By creating abstraction layers, we ensure that when CopilotKit v2 is adopted, changes only need to be made in a single location.

---

## Current Usage Analysis

### Hook Usage Summary

| Hook | Files Using | Primary Usage |
|------|-------------|---------------|
| `useCopilotChatHeadless_c` | 6 files | Messages, loading state, chat actions |
| `useCoAgent` | 1 file | Agent state management |
| `useCoAgentStateRender` | 1 file | Rendering agent state |
| `useFrontendTool` | 1 file (~20 calls) | Registering frontend tools |
| `useRenderToolCall` | 1 file (4 calls) | Rendering tool results |
| `useDefaultTool` | 1 file (1 call) | Default tool rendering |
| `useHumanInTheLoop` | 1 file (1 call) | Human confirmation |
| `useCopilotContext` | 1 file (2 places) | API config access |
| `useCopilotReadable` | 1 file (1 call) | Sharing data with agent |
| `useCopilotChatSuggestions` | 1 file (1 call) | Chat suggestions |

### Detailed File Analysis

#### `useCopilotChatHeadless_c` Usage

| File | Properties Used |
|------|-----------------|
| `ChatInner.tsx` | `messages`, `setMessages`, `isLoading`, `generateSuggestions`, `reloadMessages`, `reset`, `stopGeneration` |
| `SessionRuntimeContext.tsx` | `messages`, `isLoading` |
| `CustomMessages.tsx` | `messages`, `interrupt` |
| `CustomUserMessage.tsx` | `messages`, `setMessages`, `reloadMessages` |
| `CustomAssistantMessage.tsx` | `messages` |
| `TaskProgressCard.tsx` | `sendMessage`, `isLoading` |

---

## Centralization Strategy

### 1. Create `useCopilotChat` Hook (HIGH PRIORITY)

**Purpose**: Centralize all `useCopilotChatHeadless_c` usage into a single abstraction.

**Location**: `src/hooks/copilotkit/useCopilotChat.ts`

```typescript
// src/hooks/copilotkit/useCopilotChat.ts
import { useCopilotChatHeadless_c } from '@copilotkit/react-core';
import type { Message } from '@copilotkit/shared';

export interface CopilotChatState {
  // Messages
  messages: Message[];
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  
  // Loading state
  isLoading: boolean;
  
  // Actions
  sendMessage: (message: string) => Promise<void>;
  reloadMessages: () => Promise<void>;
  reset: () => void;
  stopGeneration: () => void;
  interrupt: () => void;
  generateSuggestions: () => Promise<void>;
}

/**
 * Centralized hook for CopilotKit chat functionality.
 * 
 * This abstraction layer enables easy migration to CopilotKit v2.
 * When upgrading to v2, only this file needs to change.
 * 
 * v1: Uses useCopilotChatHeadless_c
 * v2: Will use useAgent({ agentId: 'dynamic_agent' })
 */
export function useCopilotChat(): CopilotChatState {
  // v1 implementation
  const {
    messages,
    setMessages,
    isLoading,
    sendMessage,
    reloadMessages,
    reset,
    stopGeneration,
    interrupt,
    generateSuggestions,
  } = useCopilotChatHeadless_c();

  return {
    messages,
    setMessages,
    isLoading,
    sendMessage,
    reloadMessages,
    reset,
    stopGeneration,
    interrupt,
    generateSuggestions,
  };
}

// === V2 MIGRATION ===
// When migrating to v2, replace the implementation:
//
// import { useAgent } from '@copilotkit/react-core/v2';
//
// export function useCopilotChat(): CopilotChatState {
//   const agent = useAgent({ agentId: 'dynamic_agent' });
//   
//   return {
//     messages: agent.messages,
//     setMessages: agent.setMessages, // verify v2 API
//     isLoading: agent.isLoading,
//     sendMessage: agent.sendMessage, // verify v2 API
//     reloadMessages: agent.reload, // verify v2 API
//     reset: agent.reset, // verify v2 API
//     stopGeneration: agent.stop, // verify v2 API
//     interrupt: agent.interrupt, // verify v2 API
//     generateSuggestions: agent.generateSuggestions, // verify v2 API
//   };
// }
```

**Files to Update**:
- `ChatInner.tsx`
- `SessionRuntimeContext.tsx`
- `CustomMessages.tsx`
- `CustomUserMessage.tsx`
- `CustomAssistantMessage.tsx`
- `TaskProgressCard.tsx`

---

### 2. Create `useCopilotAgent` Hook (HIGH PRIORITY)

**Purpose**: Centralize agent state management, already partially done in `useAgentStateManagement.ts`.

**Location**: `src/hooks/copilotkit/useCopilotAgent.ts`

```typescript
// src/hooks/copilotkit/useCopilotAgent.ts
import { useCoAgent } from '@copilotkit/react-core';

export interface CopilotAgentOptions<T> {
  agentId: string;
  initialState?: T;
}

export interface CopilotAgentState<T> {
  state: T;
  setState: (state: T | ((prev: T) => T)) => void;
}

/**
 * Centralized hook for CopilotKit agent state management.
 * 
 * v1: Uses useCoAgent
 * v2: Will use useAgent({ agentId })
 */
export function useCopilotAgent<T>({
  agentId,
  initialState,
}: CopilotAgentOptions<T>): CopilotAgentState<T> {
  // v1 implementation
  const { state, setState } = useCoAgent<T>({
    name: agentId,
    initialState,
  });

  return { state, setState };
}

// === V2 MIGRATION ===
// import { useAgent } from '@copilotkit/react-core/v2';
//
// export function useCopilotAgent<T>({ agentId, initialState }: CopilotAgentOptions<T>): CopilotAgentState<T> {
//   const agent = useAgent({ agentId });
//   return {
//     state: agent.state as T,
//     setState: (newState) => {
//       // v2 state update pattern - verify API
//       if (typeof newState === 'function') {
//         agent.setState((newState as Function)(agent.state));
//       } else {
//         agent.setState(newState);
//       }
//     },
//   };
// }
```

**Files to Update**:
- `useAgentStateManagement.ts` - Update to use `useCopilotAgent` instead of `useCoAgent`

---

### 3. Create `useCopilotAgentStateRender` Hook (MEDIUM PRIORITY)

**Purpose**: Centralize agent state rendering.

**Location**: `src/hooks/copilotkit/useCopilotAgentStateRender.ts`

```typescript
// src/hooks/copilotkit/useCopilotAgentStateRender.ts
import { useCoAgentStateRender } from '@copilotkit/react-core';
import { ReactNode } from 'react';

export interface AgentStateRenderOptions<T> {
  agentId: string;
  render: (params: { state: T }) => ReactNode;
}

/**
 * Centralized hook for rendering agent state.
 * 
 * v1: Uses useCoAgentStateRender
 * v2: Will observe agent.state directly or use v2 equivalent
 */
export function useCopilotAgentStateRender<T>({
  agentId,
  render,
}: AgentStateRenderOptions<T>): void {
  // v1 implementation
  useCoAgentStateRender<T>({
    name: agentId,
    render,
  });
}

// === V2 MIGRATION ===
// In v2, agent state rendering may work differently.
// You might need to:
// 1. Use useAgent to get state
// 2. Render based on state changes in the component directly
// 3. Or use a v2-specific rendering hook if available
```

**Files to Update**:
- `ChatInner.tsx`

---

### 4. Create `useCopilotRuntimeContext` Hook (LOW PRIORITY)

**Purpose**: Centralize access to CopilotKit runtime context.

**Location**: `src/hooks/copilotkit/useCopilotRuntimeContext.ts`

```typescript
// src/hooks/copilotkit/useCopilotRuntimeContext.ts
import { useCopilotContext } from '@copilotkit/react-core';

export interface CopilotRuntimeContext {
  copilotApiConfig: {
    transcribeAudioUrl?: string;
    // Add other API config properties as needed
  } | undefined;
}

/**
 * Centralized hook for accessing CopilotKit runtime context.
 * 
 * v1: Uses useCopilotContext
 * v2: Will use useCopilotKit
 */
export function useCopilotRuntimeContext(): CopilotRuntimeContext {
  // v1 implementation
  const context = useCopilotContext();
  
  return {
    copilotApiConfig: context.copilotApiConfig,
  };
}

// === V2 MIGRATION ===
// import { useCopilotKit } from '@copilotkit/react-core/v2';
//
// export function useCopilotRuntimeContext(): CopilotRuntimeContext {
//   const copilotKit = useCopilotKit();
//   return {
//     copilotApiConfig: copilotKit.apiConfig, // verify v2 API
//   };
// }
```

**Files to Update**:
- `CustomInput.tsx`

---

### 5. Create Tool Registration System (HIGH PRIORITY)

**Purpose**: Centralize all tool registrations to a single location.

#### Option A: `useCopilotTools` Hook (Declarative)

**Location**: `src/hooks/copilotkit/useCopilotTools.ts`

```typescript
// src/hooks/copilotkit/useCopilotTools.ts
import {
  useFrontendTool,
  useRenderToolCall,
  useDefaultTool,
  useHumanInTheLoop,
} from '@copilotkit/react-core';
import { useMemo, DependencyList } from 'react';

export interface ToolConfig {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  handler?: (...args: unknown[]) => unknown;
  render?: (props: unknown) => React.ReactNode;
  available?: 'enabled' | 'disabled';
}

export interface ToolRenderConfig {
  name: string;
  render: (props: { args: unknown; result: unknown }) => React.ReactNode;
}

export interface HumanInTheLoopConfig {
  tool: string;
  handler: (args: unknown) => Promise<unknown>;
  available?: 'enabled' | 'disabled';
}

export interface DefaultToolConfig {
  render: (props: unknown) => React.ReactNode;
}

export interface CopilotToolsConfig {
  frontendTools?: Array<{ config: ToolConfig; deps: DependencyList }>;
  toolRenderers?: Array<{ config: ToolRenderConfig; deps: DependencyList }>;
  humanInTheLoop?: { config: HumanInTheLoopConfig; deps: DependencyList };
  defaultTool?: { config: DefaultToolConfig; deps: DependencyList };
}

/**
 * Centralized hook for registering all CopilotKit tools.
 * 
 * Note: Due to React hooks rules, this can't dynamically register
 * variable numbers of tools. See CopilotToolsProvider for a better approach.
 */
export function useCopilotToolsRegistration(
  frontendTools: ToolConfig[],
  toolRenderers: ToolRenderConfig[],
  humanInTheLoopConfig: HumanInTheLoopConfig | null,
  defaultToolConfig: DefaultToolConfig | null,
  deps: DependencyList,
): void {
  // This pattern is problematic because React hooks must be called
  // unconditionally and in the same order. See CopilotToolsProvider instead.
  
  // For v1, we still call hooks individually but wrap the configuration
  // For v2, this will translate to different registration methods
}
```

#### Option B: `CopilotToolsProvider` Component (Recommended)

**Location**: `src/components/copilotkit/CopilotToolsProvider.tsx`

```typescript
// src/components/copilotkit/CopilotToolsProvider.tsx
import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import {
  useFrontendTool,
  useRenderToolCall,
  useDefaultTool,
  useHumanInTheLoop,
} from '@copilotkit/react-core';

// Tool registration happens via individual hooks called within this component
// This centralizes the registration while respecting React hooks rules

interface CopilotToolsContextValue {
  isRegistered: boolean;
}

const CopilotToolsContext = createContext<CopilotToolsContextValue>({ isRegistered: false });

export function useCopilotToolsContext() {
  return useContext(CopilotToolsContext);
}

interface CopilotToolsProviderProps {
  children: ReactNode;
  // Tool configuration passed as props
  toolDependencies: ToolDependencies;
}

interface ToolDependencies {
  searchManager: unknown;
  isLight: boolean;
  clipText: (text: string, maxLen: number) => string;
  yesNo: (val: boolean) => string;
  currentPageContent: unknown;
  pageDataRef: React.RefObject<unknown>;
  themeColor: string;
  selectedPageURLs: string[];
  triggerManualRefresh: () => void;
  enabledFrontendTools?: Set<string>;
}

/**
 * Centralizes all CopilotKit tool registrations.
 * 
 * When migrating to v2:
 * - useRenderToolCall calls move to defineToolCallRenderer prop on CopilotKitProvider
 * - useFrontendTool may have API changes
 * - useHumanInTheLoop may have API changes
 */
export function CopilotToolsProvider({ children, toolDependencies }: CopilotToolsProviderProps) {
  const {
    searchManager,
    isLight,
    clipText,
    yesNo,
    currentPageContent,
    pageDataRef,
    themeColor,
    selectedPageURLs,
    triggerManualRefresh,
    enabledFrontendTools,
  } = toolDependencies;

  // Import action creators
  // ... action creator imports ...

  // === SEARCH ACTIONS ===
  const actionDeps = useMemo(() => ({
    searchManager, isLight, clipText, yesNo, currentPageContent, pageDataRef, themeColor, selectedPageURLs,
  }), [searchManager, isLight, clipText, yesNo, currentPageContent, themeColor, selectedPageURLs]);

  useFrontendTool(/* createSearchPageContentAction(actionDeps) */, [actionDeps]);
  useFrontendTool(/* createSearchFormDataAction(actionDeps) */, [actionDeps]);
  // ... more search actions ...

  // === DATA RETRIEVAL ACTIONS ===
  const retrievalDeps = useMemo(() => ({ currentPageContent, isLight }), [currentPageContent, isLight]);
  useFrontendTool(/* createGetHtmlChunksByRangeAction(retrievalDeps) */, [retrievalDeps]);
  // ... more retrieval actions ...

  // === DOM MANIPULATION ACTIONS ===
  useFrontendTool(/* createMoveCursorToElementAction({ isLight, clipText }) */, [isLight, clipText]);
  // ... more DOM actions ...

  // === TOOL RENDERERS ===
  useRenderToolCall(/* createGenerateImagesAction({ themeColor }) */, [themeColor]);
  useRenderToolCall(/* createWebSearchRender({ isLight, clipText }) */, [isLight, clipText]);
  // ... more renderers ...

  // === HUMAN IN THE LOOP ===
  const confirmActionConfig = useMemo(() => {
    // ... config creation ...
  }, [isLight, enabledFrontendTools]);
  useHumanInTheLoop(/* confirmActionConfig */);

  // === DEFAULT TOOL ===
  useDefaultTool(/* { render: defaultToolRender } */, [/* deps */]);

  const contextValue = useMemo(() => ({ isRegistered: true }), []);

  return (
    <CopilotToolsContext.Provider value={contextValue}>
      {children}
    </CopilotToolsContext.Provider>
  );
}

// === V2 MIGRATION NOTES ===
//
// 1. useRenderToolCall → Move to CopilotKitProvider's defineToolCallRenderer prop:
//    <CopilotKitProvider
//      defineToolCallRenderer={(toolCall) => {
//        if (toolCall.name === 'generate_images') return <GenerateImagesRenderer {...toolCall} />;
//        if (toolCall.name === 'web_search') return <WebSearchRenderer {...toolCall} />;
//        // ... other renderers
//        return null;
//      }}
//    />
//
// 2. useFrontendTool → Import from '@copilotkit/react-core/v2' and verify API
//
// 3. useHumanInTheLoop → Import from '@copilotkit/react-core/v2' and verify API
//
// 4. useDefaultTool → Import from '@copilotkit/react-core/v2' and verify API
```

---

### 6. Create `useCopilotReadableData` Hook (LOW PRIORITY) ✅ IMPLEMENTED

**Purpose**: Centralize data sharing with agent.

**Location**: `src/hooks/copilotkit/useCopilotReadableData.ts`

**V2 Equivalent**: ✅ `useAgentContext` from `@copilotkit/react-core/v2`

```typescript
// src/hooks/copilotkit/useCopilotReadableData.ts
import { useCopilotReadable } from '@copilotkit/react-core';

export interface ReadableDataConfig {
  description: string;
  value: unknown;
  parentId?: string;    // v1 only, NOT available in v2
  categories?: string[];  // v1 only, NOT available in v2
}

/**
 * Centralized hook for sharing data with the CopilotKit agent.
 * 
 * v1: Uses useCopilotReadable
 * v2: Uses useAgentContext (AG-UI Context type)
 */
export function useCopilotReadableData(config: ReadableDataConfig): void {
  useCopilotReadable(config);
}

// === V2 MIGRATION ===
// The v2 equivalent is `useAgentContext` from '@copilotkit/react-core/v2'
//
// V2 Context type (from AG-UI @ag-ui/core):
// type Context = {
//   description: string;
//   value: string;  // Must be a string, NOT auto-stringified
// }
//
// import { useAgentContext } from '@copilotkit/react-core/v2';
//
// export function useCopilotReadableData({
//   description,
//   value,
// }: ReadableDataConfig): void {
//   const stringValue = typeof value === 'string'
//     ? value
//     : JSON.stringify(value);
//
//   useAgentContext({
//     description,
//     value: stringValue,
//   });
// }
//
// Key v1 → v2 differences:
// - value MUST be a string (no auto-stringify)
// - parentId NOT available in v2
// - categories NOT available in v2
```

**Files to Update**:
- `ChatInner.tsx`

---

### 7. Create `useCopilotSuggestions` Hook (LOW PRIORITY)

**Purpose**: Centralize chat suggestions configuration.

**Location**: `src/hooks/copilotkit/useCopilotSuggestions.ts`

```typescript
// src/hooks/copilotkit/useCopilotSuggestions.ts
import { useCopilotChatSuggestions } from '@copilotkit/react-ui';

export interface SuggestionsConfig {
  enabled: boolean;
  instructions: string;
  minSuggestions?: number;
  maxSuggestions?: number;
}

/**
 * Centralized hook for CopilotKit chat suggestions.
 * 
 * v1: Uses useCopilotChatSuggestions
 * v2: Will use useConfigureSuggestions
 */
export function useCopilotSuggestions({
  enabled,
  instructions,
  minSuggestions = 2,
  maxSuggestions = 5,
}: SuggestionsConfig): void {
  // v1 implementation
  useCopilotChatSuggestions({
    instructions: enabled ? instructions : '',
    minSuggestions: enabled ? minSuggestions : 0,
    maxSuggestions: enabled ? maxSuggestions : 0,
  });
}

// === V2 MIGRATION ===
// import { useConfigureSuggestions } from '@copilotkit/react-core/v2';
//
// export function useCopilotSuggestions(config: SuggestionsConfig): void {
//   useConfigureSuggestions({
//     enabled: config.enabled,
//     instructions: config.instructions,
//     // API structure may differ - verify v2 docs
//   });
// }
```

**Files to Update**:
- `ChatInner.tsx`

---

### 8. Create `useCopilotChatContext` Hook ✅ IMPLEMENTED

**Purpose**: Centralize access to chat context (labels, icons, modal state).

**Location**: `src/hooks/copilotkit/useCopilotChatContext.ts`

**V2 Equivalent**: ✅ `useCopilotChatConfiguration` from `@copilotkit/react-core/v2`

```typescript
// src/hooks/copilotkit/useCopilotChatContext.ts
import { useChatContext } from '@copilotkit/react-ui';

export interface CopilotChatContextValue {
  labels: CopilotChatLabels;
  icons: CopilotChatIcons;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  _rawContext: ReturnType<typeof useChatContext>;
}

export function useCopilotChatContext(): CopilotChatContextValue {
  const context = useChatContext();
  return {
    labels: context.labels,
    icons: context.icons,
    isOpen: context.open,
    setOpen: context.setOpen,
    _rawContext: context,
  };
}

// === V2 MIGRATION ===
// import { useCopilotChatConfiguration } from '@copilotkit/react-core/v2';
//
// export function useCopilotChatContext(): CopilotChatContextValue | null {
//   const config = useCopilotChatConfiguration();
//   if (!config) return null;
//
//   return {
//     labels: config.labels,
//     icons: {}, // Icons handled internally in v2
//     isOpen: config.isModalOpen,
//     setOpen: config.setModalOpen,
//     _rawContext: config,
//   };
// }
```

**Files Updated**:
- `CustomInput.tsx` ✅
- `CustomMessages.tsx` ✅
- `CustomAssistantMessage.tsx` ✅

---

### 9. Create Component Re-exports ✅ IMPLEMENTED

**Purpose**: Centralize all CopilotKit component imports.

**Location**: `src/hooks/copilotkit/components.ts`

```typescript
// Re-export components for centralized imports
export { CopilotKit } from '@copilotkit/react-core';
export { CopilotChat } from '@copilotkit/react-ui';
export { Markdown } from '@copilotkit/react-ui';
export { ImageRenderer } from '@copilotkit/react-ui';

// V2: Components move to @copilotkit/react-core/v2
// export { CopilotKitProvider, CopilotChat, CopilotSidebar } from '@copilotkit/react-core/v2';
```

**Files Updated**:
- `ChatInner.tsx` ✅ - Uses `CopilotChat`
- `SessionRuntimeContext.tsx` ✅ - Uses `CopilotKit`
- `CustomAssistantMessage.tsx` ✅ - Uses `Markdown`
- `CustomUserMessage.tsx` ✅ - Uses `ImageRenderer`

---

### 10. Create Type Re-exports ✅ IMPLEMENTED

**Purpose**: Centralize all CopilotKit type imports.

**Location**: `src/hooks/copilotkit/types.ts`

```typescript
// Re-export types for centralized imports
export type { Message } from '@copilotkit/shared';
export type { InputProps } from '@copilotkit/react-ui';
export type { MessagesProps } from '@copilotkit/react-ui';
export type { UserMessageProps } from '@copilotkit/react-ui';
export type { AssistantMessageProps } from '@copilotkit/react-ui';
```

**Files Updated**:
- `ChatInner.tsx` ✅ - Uses `InputProps`, `MessagesProps`
- `CustomInput.tsx` ✅ - Uses `InputProps`
- `CustomMessages.tsx` ✅ - Uses `MessagesProps`, `Message`
- `CustomUserMessage.tsx` ✅ - Uses `UserMessageProps`
- `CustomAssistantMessage.tsx` ✅ - Uses `AssistantMessageProps`

---

## ✅ Implemented Directory Structure

```
src/
├── hooks/
│   ├── copilotkit/
│   │   ├── index.ts                      # ✅ Central export for all hooks, components, types
│   │   ├── useCopilotChat.ts             # ✅ Wraps useCopilotChatHeadless_c
│   │   ├── useCopilotAgent.ts            # ✅ Wraps useCoAgent
│   │   ├── useCopilotAgentStateRender.ts # ✅ Wraps useCoAgentStateRender
│   │   ├── useCopilotRuntimeContext.ts   # ✅ Wraps useCopilotContext
│   │   ├── useCopilotReadableData.ts     # ✅ Wraps useCopilotReadable
│   │   ├── useCopilotSuggestions.ts      # ✅ Wraps useCopilotChatSuggestions
│   │   ├── useCopilotChatContext.ts      # ✅ Wraps useChatContext
│   │   ├── useCopilotTools.ts            # ✅ Re-exports tool hooks
│   │   ├── components.ts                 # ✅ Re-exports CopilotKit, CopilotChat, Markdown, ImageRenderer
│   │   └── types.ts                      # ✅ Re-exports Message, InputProps, MessagesProps, etc.
│   └── useAgentStateManagement.ts        # ✅ Updated to use useCopilotAgent
```

---

## Implementation Order

### Phase 1: Core Chat Abstraction (HIGHEST PRIORITY)

1. **Create `useCopilotChat` hook**
   - This has the highest impact as it's used in 6 files
   - Provides immediate benefit for v2 migration
   
2. **Update all consuming files**:
   ```typescript
   // Before
   import { useCopilotChatHeadless_c } from '@copilotkit/react-core';
   const { messages, isLoading } = useCopilotChatHeadless_c();
   
   // After
   import { useCopilotChat } from '@/hooks/copilotkit';
   const { messages, isLoading } = useCopilotChat();
   ```

### Phase 2: Agent State Abstraction

1. **Create `useCopilotAgent` hook**

2. **Update `useAgentStateManagement.ts`**

3. **Create `useCopilotAgentStateRender` hook**

4. **Update `ChatInner.tsx`**

### Phase 3: Tool Registration Centralization

1. **Create `CopilotToolsProvider` component**
   - Extract all tool registrations from `ChatInner.tsx`
   - Move to a dedicated provider component

2. **Update component tree**:
   ```typescript
   // In ChatInner.tsx or parent component
   <CopilotToolsProvider toolDependencies={deps}>
     <ChatUI />
   </CopilotToolsProvider>
   ```

### Phase 4: Remaining Hooks

1. **Create `useCopilotRuntimeContext` hook**
2. **Create `useCopilotReadableData` hook**
3. **Create `useCopilotSuggestions` hook**
4. **Update all consuming files**

---

## Benefits of Centralization

### For V2 Migration

| Aspect | Without Centralization | With Centralization |
|--------|------------------------|---------------------|
| Files to modify | 10+ files | 7 abstraction files |
| Risk of missing updates | High | Low |
| Testing effort | Full regression | Focused on abstractions |
| Rollback capability | Complex | Simple (swap implementations) |

### For Codebase Quality

1. **Single Source of Truth**: All CopilotKit integration in one place
2. **Easier Testing**: Mock the abstraction layer instead of CopilotKit internals
3. **Better TypeScript Support**: Define precise interfaces in abstractions
4. **Consistent API**: Consumers always use the same interface regardless of CopilotKit version

---

## Migration Checklist

### Pre-Centralization

- [ ] Create `src/hooks/copilotkit/` directory
- [ ] Create `src/components/copilotkit/` directory

### Phase 1: useCopilotChat

- [ ] Create `useCopilotChat.ts`
- [ ] Add unit tests for `useCopilotChat`
- [ ] Update `ChatInner.tsx`
- [ ] Update `SessionRuntimeContext.tsx`
- [ ] Update `CustomMessages.tsx`
- [ ] Update `CustomUserMessage.tsx`
- [ ] Update `CustomAssistantMessage.tsx`
- [ ] Update `TaskProgressCard.tsx`
- [ ] Verify all chat functionality works

### Phase 2: useCopilotAgent

- [ ] Create `useCopilotAgent.ts`
- [ ] Create `useCopilotAgentStateRender.ts`
- [ ] Update `useAgentStateManagement.ts`
- [ ] Update `ChatInner.tsx` (useCoAgentStateRender)
- [ ] Verify agent state management works

### Phase 3: CopilotToolsProvider

- [ ] Create `CopilotToolsProvider.tsx`
- [ ] Extract tool registrations from `ChatInner.tsx`
- [ ] Update component hierarchy
- [ ] Verify all tools work correctly

### Phase 4: Remaining Hooks

- [ ] Create `useCopilotRuntimeContext.ts`
- [ ] Create `useCopilotReadableData.ts`
- [ ] Create `useCopilotSuggestions.ts`
- [ ] Update `CustomInput.tsx`
- [ ] Update remaining hook usages in `ChatInner.tsx`

### Post-Centralization

- [ ] Run full test suite
- [ ] Verify all CopilotKit functionality
- [ ] Update migration plan with centralized approach
- [ ] Document new hook APIs

---

## Example: Before vs After

### Before (ChatInner.tsx)

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

// Direct usage of multiple CopilotKit hooks throughout the component
const { messages, setMessages, isLoading, /* ... */ } = useCopilotChatHeadless_c();
useCoAgentStateRender<UnifiedAgentState>({ name: 'dynamic_agent', render: /* ... */ });
useFrontendTool(/* 20 calls */);
useRenderToolCall(/* 4 calls */);
// ... etc
```

### After (ChatInner.tsx)

```typescript
import { 
  useCopilotChat, 
  useCopilotAgentStateRender,
  useCopilotSuggestions,
  useCopilotReadableData,
} from '@/hooks/copilotkit';
import { CopilotToolsProvider } from '@/components/copilotkit';

// Clean, centralized usage
const { messages, setMessages, isLoading, /* ... */ } = useCopilotChat();
useCopilotAgentStateRender({ agentId: 'dynamic_agent', render: /* ... */ });
useCopilotSuggestions({ enabled: showSuggestions, instructions: CHAT_SUGGESTIONS_INSTRUCTIONS });
useCopilotReadableData({ description: 'Page metadata', value: metadata });

// Tools registered via provider wrapping the component
// <CopilotToolsProvider toolDependencies={deps}>
//   <ChatInner />
// </CopilotToolsProvider>
```

---

*Document created: December 9, 2025*

