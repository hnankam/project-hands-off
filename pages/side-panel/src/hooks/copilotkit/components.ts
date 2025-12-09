/**
 * Centralized CopilotKit Component Re-exports
 *
 * This module re-exports CopilotKit components to:
 * 1. Provide a single import location for all CopilotKit components
 * 2. Enable easy migration to CopilotKit v2
 * 3. Allow for component wrapping/customization if needed
 *
 * v1: Components from @copilotkit/react-core and @copilotkit/react-ui
 * v2: Provider/Chat from @copilotkit/react-core/v2, UI components still from react-ui
 */

// =============================================================================
// Provider Component
// =============================================================================

// v1: CopilotKit provider
export { CopilotKit } from '@copilotkit/react-core';

// v2: Will be CopilotKitProvider from @copilotkit/react-core/v2
// export { CopilotKitProvider } from '@copilotkit/react-core/v2';

// =============================================================================
// Chat Components
// =============================================================================

// v1: CopilotChat component from react-ui
export { CopilotChat } from '@copilotkit/react-ui';

// v2: CopilotChat moves to @copilotkit/react-core/v2
// export { CopilotChat, CopilotSidebar } from '@copilotkit/react-core/v2';

// =============================================================================
// UI Components (STILL FROM react-ui in v2!)
// =============================================================================

// ✅ CONFIRMED: Markdown is still exported from @copilotkit/react-ui in v2
export { Markdown } from '@copilotkit/react-ui';

// ✅ CONFIRMED: ImageRenderer is still exported from @copilotkit/react-ui in v2
export { ImageRenderer } from '@copilotkit/react-ui';

// =============================================================================
// V2 MIGRATION NOTES (VERIFIED FROM BETA-TEST APP)
// =============================================================================
//
// CSS STYLES - Need BOTH in v2:
// ```typescript
// import '@copilotkit/react-ui/styles.css';      // For Markdown, ImageRenderer
// import '@copilotkitnext/react/styles.css';     // For new v2 CopilotChat styles
// ```
//
// PROVIDER CHANGES:
// - CopilotKit → CopilotKitProvider (from @copilotkit/react-core/v2)
// - New props: renderToolCalls, renderActivityMessages
// - headers prop still works the same
//
// CHAT COMPONENT CHANGES:
// - CopilotChat MOVES from react-ui to @copilotkit/react-core/v2
// - CopilotSidebar also available as alternative
//
// UI COMPONENTS (NO CHANGE!):
// - ✅ Markdown: Still from @copilotkit/react-ui
// - ✅ ImageRenderer: Still from @copilotkit/react-ui
// - These components work with BOTH v1 and v2!
//
// NEW PACKAGES in v2:
// - @copilotkitnext/react (provides MarkdownRenderer alternative)
// - @copilotkitnext/core
// - @copilotkitnext/agent
//
// Example v2 migration:
//
// import { CopilotKitProvider, CopilotChat } from '@copilotkit/react-core/v2';
// import { Markdown, ImageRenderer } from '@copilotkit/react-ui'; // SAME!
//
// <CopilotKitProvider
//   runtimeUrl={runtimeUrl}
//   headers={headers}
//   renderToolCalls={toolRenderers}
// >
//   <CopilotChat agentId="my_agent" />
// </CopilotKitProvider>

