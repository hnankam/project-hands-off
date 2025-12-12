/**
 * Centralized CopilotKit Component Re-exports
 *
 * V2 Implementation:
 * - CopilotKit (provider) → CopilotKitProvider from @copilotkit/react-core/v2
 * - CopilotChat moves from react-ui to @copilotkit/react-core/v2
 * - Markdown, ImageRenderer remain in @copilotkit/react-ui
 * 
 * CSS STYLES - Need BOTH in V2:
 * ```typescript
 * import '@copilotkit/react-ui/styles.css';      // For Markdown, ImageRenderer
 * import '@copilotkitnext/react/styles.css';     // For new V2 CopilotChat styles
 * ```
 */

// =============================================================================
// Provider Component (V2)
// =============================================================================

// V2: CopilotKitProvider from @copilotkit/react-core/v2
// Aliased as CopilotKit for backwards compatibility
export { CopilotKitProvider as CopilotKit } from '@copilotkit/react-core/v2';

// Also export the proper V2 name
export { CopilotKitProvider } from '@copilotkit/react-core/v2';

// =============================================================================
// Chat Components (V2)
// =============================================================================

// V2: CopilotChat moves to @copilotkit/react-core/v2
export { CopilotChat, CopilotChatAssistantMessage, CopilotChatUserMessage } from '@copilotkit/react-core/v2';

// V2: CopilotSidebar is also available as alternative
export { CopilotSidebar } from '@copilotkit/react-core/v2';

// =============================================================================
// UI Components (STILL FROM react-ui in V2!)
// =============================================================================

// ✅ Markdown is still exported from @copilotkit/react-ui in V2
export { Markdown } from '@copilotkit/react-ui';

// ✅ ImageRenderer is still exported from @copilotkit/react-ui in V2
export { ImageRenderer } from '@copilotkit/react-ui';

// =============================================================================
// V2 Provider Props Example
// =============================================================================
//
// <CopilotKitProvider
//   runtimeUrl={runtimeUrl}
//   headers={{
//     'x-copilot-agent-type': agentType,
//     'x-copilot-model-type': modelType,
//     'x-copilot-thread-id': sessionId,
//   }}
//   showDevConsole={false}
//   renderToolCalls={toolRenderers}
//   renderActivityMessages={activityRenderers}
// >
//   <CopilotChat agentId="my_agent" threadId={sessionId} />
// </CopilotKitProvider>
