/**
 * Centralized CopilotKit Readable Data Hook
 *
 * This abstraction layer enables easy migration to CopilotKit v2.
 * When upgrading to v2, only this file needs to change.
 *
 * v1: Uses useCopilotReadable
 * v2: Uses useAgentContext (AG-UI Context type)
 */

import { useCopilotReadable } from '@copilotkit/react-core';

export interface CopilotReadableDataConfig {
  /** Description of the data for the AI agent */
  description: string;
  /** The data value to share with the agent */
  value: unknown;
  /** Optional parent ID for hierarchical data (v1 only, not available in v2) */
  parentId?: string;
  /** Optional categories for filtering (v1 only, not available in v2) */
  categories?: string[];
  /** Optional flag to convert to JSON string */
  convert?: (value: unknown) => string;
}

/**
 * Centralized hook for sharing data with the CopilotKit agent.
 *
 * Makes data available to the AI agent for context-aware responses.
 *
 * @example
 * ```tsx
 * useCopilotReadableData({
 *   description: 'Current page metadata',
 *   value: { title: 'Home', url: 'https://example.com' },
 * });
 * ```
 */
export function useCopilotReadableData({
  description,
  value,
  parentId,
  categories,
  convert,
}: CopilotReadableDataConfig): void {
  // v1 implementation using useCopilotReadable
  useCopilotReadable({
    description,
    value,
    parentId,
    categories,
    convert,
  });
}

// === V2 MIGRATION ===
// The v2 equivalent is `useAgentContext` from '@copilotkit/react-core/v2'
//
// Key differences:
// - v2 Context type only has { description: string, value: string }
// - value MUST be a string (no auto-stringify like v1)
// - parentId and categories are NOT available in v2
//
// import { useAgentContext } from '@copilotkit/react-core/v2';
//
// export function useCopilotReadableData({
//   description,
//   value,
// }: CopilotReadableDataConfig): void {
//   // V2 requires value to be a string
//   const stringValue = typeof value === 'string'
//     ? value
//     : JSON.stringify(value);
//
//   useAgentContext({
//     description,
//     value: stringValue,
//   });
// }

