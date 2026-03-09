# CopilotKit v1.52 Upgrade Plan

**Prepared:** March 5, 2025  
**Target Version:** v1.52.0  
**Current Version:** v1.51.2  
**Release Notes:** [CopilotKit v1.52.0](https://github.com/CopilotKit/CopilotKit/releases/tag/v1.52.0)

---

## Executive Summary

The codebase is already well-structured for CopilotKit upgrades with a centralized abstraction layer in `pages/side-panel/src/hooks/copilotkit/`. The v1.52 release is **zero breaking changes** per the release notes. This plan documents the current usage, potential impact areas, and recommended verification steps.

---

## 1. Current CopilotKit Usage Overview

### 1.1 Package Dependencies

| Package | Location | Current Version |
|---------|-----------|-----------------|
| `@copilotkit/react-core` | Root + side-panel | ^1.51.2 |
| `@copilotkit/react-ui` | Root + side-panel | ^1.51.2 |
| `@copilotkit/shared` | side-panel | ^1.51.2 |
| `@copilotkitnext/core` | side-panel | ^1.51.2 |
| `@copilotkitnext/react` | side-panel | ^1.51.2 |
| `@copilotkit/runtime` | copilot-runtime-server | ^1.51.2 |
| `@copilotkitnext/sqlite-runner` | copilot-runtime-server | ^1.51.2 |

### 1.2 Architecture

- **V2-first:** The codebase already uses v2 APIs via `@copilotkit/react-core/v2` and `@copilotkitnext/react`
- **Abstraction layer:** `hooks/copilotkit/` provides stable wrappers; consuming code imports from this layer
- **Provider pattern:** `CopilotKitProvider` with `renderToolCalls` and `renderActivityMessages` for backend tool/activity rendering

### 1.3 Key Integration Points

| Area | Files | Notes |
|------|-------|-------|
| **Provider & Chat** | `ChatSessionContainer.tsx`, `ChatInner.tsx` | CopilotKitProvider, CopilotChat, SharedAgentProvider |
| **Frontend Tools** | `ChatInner.tsx`, `useCopilotTools.ts` | 20+ useFrontendTool registrations with `available` prop |
| **Human-in-the-Loop** | `ChatInner.tsx`, `utilityActions.tsx` | useHumanInTheLoop + createConfirmActionHumanInTheLoop |
| **Backend Tool Renderers** | `builtinToolActions.tsx`, `ChatSessionContainer.tsx` | renderToolCalls with 8 named + wildcard renderer |
| **Activity Renderers** | `activityRenderers.tsx`, `ChatSessionContainer.tsx` | renderActivityMessages for plans/graphs/aux messages |
| **Custom Input** | `CustomInputV2.tsx` | CopilotChatInput from @copilotkitnext/react |
| **Agent State** | `useCopilotAgent.ts`, `useAgentEventSubscriber.ts` | useAgent from @copilotkit/react-core/v2 |
| **Runtime Server** | `copilot-runtime-server/server.js` | CopilotRuntime, PostgresAgentRunner, createCopilotEndpoint |

---

## 2. v1.52 Release Changes (Relevant to This Codebase)

### 2.1 New Features (Optional Adoption)

| Feature | Description | Relevance |
|---------|-------------|-----------|
| **useComponent** | Register custom UI components in chat context | Could simplify custom message/activity rendering |
| **useRenderTool** | Named tool renderer with Zod args, lifecycle-aware | Alternative to renderToolCalls array; more granular |
| **useDefaultRenderTool** | Wildcard catch-all for unhandled tools | Could replace wildcard entry in createAllToolRenderers |
| **useInterrupt** | First-class interrupt handling (render, handler, enabled, agentId) | useLangGraphInterrupt now delegates here; useHumanInTheLoop may relate |
| **available prop** | `useFrontendTool({ available: 'enabled' \| 'disabled' })` | **Already used** via wrapToolConfig in ChatInner.tsx |
| **Reasoning messages** | Model thinking steps rendered by default | Verify no conflict with custom message slots |

### 2.2 Bug Fixes

| Fix | Impact |
|-----|--------|
| **Tailwind style scoping** | `cpk` prefix on CopilotKit internal utility classes; prevents style leaks into host app |
| **Style generation pipeline** | Better CSS isolation |

### 2.3 Under the Hood

- v1 hooks are thin wrappers around v2 implementations
- useLangGraphInterrupt delegates to useInterrupt
- Zero breaking changes per release notes

---

## 3. Potential Impact Areas

### 3.1 DOM Selectors & Class Names

**Risk: Medium** — Verify after upgrade.

The app uses DOM selectors and CSS targeting CopilotKit class names:

| Selector/Class | Location | Purpose |
|----------------|----------|---------|
| `.copilotKitInput textarea` | ChatSessionContainer.tsx:844 | Focus input programmatically |
| `.copilotKitMessagesContainer` | useProgressCardCollapse.ts, CustomMessages.tsx, sessionExport.ts | Scroll container, export |
| `.copilotKitMessages` | CustomMessages.tsx, sessionExport.ts | Message list |
| `.copilotKitInput`, `.copilotKitInputControls`, `.copilotKitInputControlButton` | content.css, animations.css | Input styling |
| `.copilotKitUserMessage`, `.copilotKitAssistantMessage` | chat-messages.v2.css, CustomUserMessageRenderer | Message styling |
| `.copilotKitCodeBlock`, `.copilotKitCodeBlockToolbar` | code-blocks.v2.css | Code block styling |

**Note:** The v1.52 `cpk` prefix applies to **Tailwind utility classes** (e.g., `flex`, `p-4`) used internally by CopilotKit, not necessarily to semantic class names like `copilotKitInput`. If CopilotKit changes semantic class names, these selectors would need updates.

**Action:** After upgrade, run full UI flows and verify:
- Input focus works (e.g., keyboard shortcut)
- Progress card collapse works
- Session export captures messages
- Custom styles apply correctly

### 3.2 useHumanInTheLoop vs useInterrupt

**Risk: Low** — No change expected.

- **useHumanInTheLoop:** Used for `confirmAction` tool (user confirmation before proceeding)
- **useInterrupt:** New v2 hook for LangGraph interrupt events (confirmation dialogs, approval forms)
- Release notes say `useLangGraphInterrupt` delegates to `useInterrupt`; `useHumanInTheLoop` is a separate tool-confirmation hook

**Action:** Confirm `confirmAction` flow still works after upgrade.

### 3.3 Tool Renderers (renderToolCalls)

**Risk: Low** — No change expected.

- Current pattern: Array of renderers passed to `CopilotKitProvider.renderToolCalls`
- v1.52 adds `useRenderTool` and `useDefaultRenderTool` as **alternative** registration patterns
- Existing `renderToolCalls` prop should remain supported

**Action:** Verify all backend tools (web_search, code_execution, url_context, run_graph, generate_images, file creation/update, wildcard) render correctly.

### 3.4 Reasoning Messages

**Risk: Low** — May need styling tweaks.

- v1.52 adds default reasoning/thinking step rendering
- If the agent uses reasoning, new UI may appear
- Custom message slots may need to accommodate or style reasoning blocks

**Action:** Test with an agent that emits reasoning; verify layout and styling.

### 3.5 Custom Styles

**Risk: Low** — Likely improvement.

- App uses custom classes: `copilot-action-sparkle-text`, `copilot-chat-container`, `copilotKit*` (app-defined)
- CopilotKit’s internal Tailwind classes now use `cpk` prefix
- Should reduce conflicts; app styles should be unaffected

**Action:** Visual regression check for chat, input, tool cards, activity cards.

---

## 4. Upgrade Steps

### Phase 1: Version Bump (Low Risk)

1. **Update package.json versions** (root and workspaces):
   - `@copilotkit/react-core`: ^1.51.2 → ^1.52.0
   - `@copilotkit/react-ui`: ^1.51.2 → ^1.52.0
   - `@copilotkit/shared`: ^1.51.2 → ^1.52.0 (side-panel)
   - `@copilotkitnext/core`: ^1.51.2 → ^1.52.0 (side-panel)
   - `@copilotkitnext/react`: ^1.51.2 → ^1.52.0 (side-panel)
   - `@copilotkit/runtime`: ^1.51.2 → ^1.52.0 (copilot-runtime-server)
   - `@copilotkitnext/sqlite-runner`: ^1.51.2 → ^1.52.0 (copilot-runtime-server)

2. **Install:**
   ```bash
   pnpm install
   ```

3. **Build:**
   ```bash
   pnpm build
   ```

4. **Type-check:**
   ```bash
   pnpm type-check
   ```

### Phase 2: Verification Checklist

| # | Test | Expected |
|---|------|----------|
| 1 | Chat loads, messages display | No errors, messages render |
| 2 | Send message, receive response | Streaming works, assistant message appears |
| 3 | Frontend tools (search, DOM, wait, etc.) | Tools execute, render correctly |
| 4 | confirmAction (human-in-the-loop) | Confirmation card appears, approve/deny works |
| 5 | Backend tools (web_search, code_execution, etc.) | Tool cards render with correct status |
| 6 | Activity messages (plans, graphs) | Plan/Graph cards render |
| 7 | Custom input (Tiptap, slash commands) | Input works, send works |
| 8 | Session export | Exported HTML includes messages |
| 9 | Progress card collapse | Older cards collapse as expected |
| 10 | Input focus (if shortcut exists) | `.copilotKitInput textarea` focus works |
| 11 | Dark/light theme | Styles apply correctly |
| 12 | Runtime server | Agent requests succeed, persistence works |

### Phase 3: Optional Enhancements (Post-Upgrade)

Consider in a follow-up PR:

1. **useInterrupt** — If LangGraph interrupts are used, migrate from useLangGraphInterrupt to useInterrupt for clearer API.
2. **useDefaultRenderTool** — Evaluate moving wildcard tool rendering from `renderToolCalls` to `useDefaultRenderTool` for consistency with v2 patterns.
3. **Reasoning message styling** — Add custom styles if reasoning blocks need to match app design.

---

## 5. Rollback Plan

If issues arise:

1. Revert package.json version changes
2. Run `pnpm install`
3. Run `pnpm build`
4. File an issue with CopilotKit if the problem appears to be in the library

---

## 6. Files to Monitor During Upgrade

| File | Purpose |
|------|---------|
| `pages/side-panel/src/hooks/copilotkit/useCopilotTools.ts` | useFrontendTool, useHumanInTheLoop, useRenderToolCall wrappers |
| `pages/side-panel/src/hooks/copilotkit/components.ts` | CopilotKitProvider, CopilotChat exports |
| `pages/side-panel/src/components/chat/ChatSessionContainer.tsx` | Provider config, renderToolCalls, renderActivityMessages |
| `pages/side-panel/src/components/chat/ChatInner.tsx` | useFrontendTool, useHumanInTheLoop, useCopilotSuggestions |
| `pages/side-panel/src/components/chat/CustomInputV2.tsx` | CopilotChatInput from @copilotkitnext/react |
| `pages/side-panel/src/actions/copilot/builtinToolActions.tsx` | Backend tool renderers |
| `pages/side-panel/src/actions/copilot/activityRenderers.tsx` | Activity message renderers |
| `pages/side-panel/src/actions/copilot/utilityActions.tsx` | confirmAction human-in-the-loop |
| `pages/side-panel/src/index.css` | CopilotKit style imports |
| `copilot-runtime-server/server.js` | CopilotRuntime, createCopilotEndpoint |

---

## 7. Summary

- **Risk level:** Low — v1.52 is backward compatible
- **Effort:** ~1–2 hours for version bump + verification
- **Main verification:** DOM selectors, tool rendering, human-in-the-loop, custom styles
- **Optional:** Adopt new v2 hooks (useInterrupt, useDefaultRenderTool) in a later iteration
