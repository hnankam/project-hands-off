/**
 * Centralized CopilotKit Tool Hooks
 *
 * This module re-exports tool-related hooks from CopilotKit to:
 * 1. Provide a single import location for all tool hooks
 * 2. Enable easy migration to v2 by changing imports in one place
 *
 * v1: Imports from '@copilotkit/react-core'
 * v2: Will import from '@copilotkit/react-core/v2'
 *
 * Note: useRenderToolCall in v2 will be replaced by the
 * defineToolCallRenderer prop on CopilotKitProvider
 */

// Re-export tool hooks from CopilotKit v1
export {
  useFrontendTool,
  useHumanInTheLoop,
  useDefaultTool,
  useRenderToolCall,
} from '@copilotkit/react-core';

// Re-export types for convenience
export type {
  FrontendAction,
  ActionRenderProps,
  RenderFunctionStatus,
} from '@copilotkit/react-core';

// === V2 MIGRATION ===
//
// When migrating to v2:
//
// 1. Change imports to v2:
//    export {
//      useFrontendTool,
//      useHumanInTheLoop,
//      useDefaultTool,
//    } from '@copilotkit/react-core/v2';
//
// 2. useRenderToolCall is NOT available in v2!
//    It is replaced by the defineToolCallRenderer prop on CopilotKitProvider.
//    You'll need to:
//    - Remove useRenderToolCall from exports
//    - Move render logic to CopilotKitProvider's defineToolCallRenderer prop
//    - Create a centralized tool renderer configuration
//
// Example v2 CopilotKitProvider setup:
//
//    const toolRenderers = {
//      'generate_images': GenerateImagesRenderer,
//      'web_search': WebSearchRenderer,
//      'code_execution': CodeExecutionRenderer,
//      'url_context': UrlContextRenderer,
//    };
//
//    <CopilotKitProvider
//      defineToolCallRenderer={(toolCall) => {
//        const Renderer = toolRenderers[toolCall.name];
//        if (Renderer) {
//          return <Renderer {...toolCall} />;
//        }
//        return null;
//      }}
//    >
//      {children}
//    </CopilotKitProvider>

