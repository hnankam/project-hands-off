/**
 * Centralized CopilotKit Readable Data Hook
 *
 * V2 Implementation using useAgentContext from @copilotkit/react-core/v2.
 * Automatically stringifies non-string values.
 */

import { useAgentContext } from '@copilotkit/react-core/v2';
import { useMemo } from 'react';

export interface CopilotReadableDataConfig {
  /** Description of the data for the AI agent */
  description: string;
  /** The data value to share (auto-stringified if not a string) */
  value: unknown;
}

/**
 * Share data with the CopilotKit agent.
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
}: CopilotReadableDataConfig): void {
  // V2 requires value to be a string - stringify objects
  const stringValue = useMemo(() => {
    if (typeof value === 'string') {
      return value;
    }
    if (value === null || value === undefined) {
      return '';
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }, [value]);

  useAgentContext({
    description,
    value: stringValue,
  });
}
