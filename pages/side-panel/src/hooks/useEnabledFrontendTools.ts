/**
 * Hook to fetch and track enabled frontend tools based on agent configuration.
 *
 * This hook fetches the list of enabled tools from the backend for a specific
 * agent/model combination and returns a Set of frontend tool names that are enabled.
 * Frontend tools not in this set should not be registered with CopilotKit.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface ToolDefinition {
  key?: string; // Tool identifier (e.g., "clickElement")
  name: string; // Display name (e.g., "Click Element")
  source: string;
  available: 'enabled' | 'disabled';
}

interface UseEnabledFrontendToolsParams {
  agentType?: string;
  modelType?: string;
  organizationId?: string;
  teamId?: string;
}

interface UseEnabledFrontendToolsResult {
  /** Set of enabled frontend tool names. Undefined means all tools are enabled (no filtering). */
  enabledFrontendTools: Set<string> | undefined;
  /** Whether tools are currently being fetched */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manually refetch tools */
  refetch: () => Promise<void>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Complete list of all frontend tool names that can be conditionally enabled.
 * This maps to the tool names as registered in the copilot action files.
 */
export const ALL_FRONTEND_TOOL_NAMES = [
  // Search Actions
  'searchPageContent',
  'searchFormData',
  'searchDOMUpdates',
  'searchClickableElements',

  // Data Retrieval Actions
  'getHtmlChunksByRange',
  'getFormChunksByRange',
  'getClickableChunksByRange',

  // DOM Manipulation Actions
  'moveCursorToElement',
  'refreshPageContent',
  'cleanupExtensionUI',
  'clickElement',
  'verifySelector',
  'getSelectorAtPoint',
  'getSelectorsAtPoints',
  'sendKeystrokes',

  // Form Actions
  'inputData',

  // Navigation Actions
  'openNewTab',
  'scroll',
  'dragAndDrop',

  // Screenshot Actions
  'takeScreenshot',

  // Image Generation Actions
  'generate_images',

  // Utility Actions
  'wait',
  'confirmAction',
] as const;

/** Type for frontend tool names */
export type FrontendToolName = (typeof ALL_FRONTEND_TOOL_NAMES)[number];

/** Pre-built Set for O(1) lookup */
const FRONTEND_TOOL_KEYS = new Set<string>(ALL_FRONTEND_TOOL_NAMES);

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useEnabledFrontendTools({
  agentType,
  modelType,
  organizationId,
  teamId,
}: UseEnabledFrontendToolsParams): UseEnabledFrontendToolsResult {
  const [enabledTools, setEnabledTools] = useState<Set<string> | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track previous params to avoid redundant fetches
  const prevParamsRef = useRef<string>('');

  const backendUrl = useMemo(() => import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001', []);

  const canFetch = Boolean(agentType && modelType && organizationId && teamId);

  const fetchTools = useCallback(async () => {
    if (!canFetch || !agentType || !modelType || !organizationId || !teamId) {
      setEnabledTools(undefined);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${backendUrl}/tools/${agentType}/${modelType}`, {
        headers: {
          'x-copilot-organization-id': organizationId,
          'x-copilot-team-id': teamId,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to load tools (${response.status})`);
      }

      const data = await response.json();
      const fetchedTools: ToolDefinition[] = Array.isArray(data?.tools) ? data.tools : [];

      // Filter for enabled frontend tools, matching by key identifier
      const enabledFrontendToolNames = new Set<string>();
      let hasFrontendTools = false;

      for (const tool of fetchedTools) {
        if (tool.source === 'frontend') {
          hasFrontendTools = true;
          if (tool.available === 'enabled' && tool.key && FRONTEND_TOOL_KEYS.has(tool.key)) {
            enabledFrontendToolNames.add(tool.key);
          }
        }
      }

      // If no frontend tools in response, enable all (backward compatibility)
      if (!hasFrontendTools) {
        setEnabledTools(undefined);
        return;
      }

      setEnabledTools(enabledFrontendToolNames);
    } catch (err) {
      console.error('[useEnabledFrontendTools] Failed to fetch tools:', err);
      setError(err instanceof Error ? err.message : 'Failed to load enabled tools');
      // On error, allow all tools to prevent breaking functionality
      setEnabledTools(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [agentType, backendUrl, canFetch, modelType, organizationId, teamId]);

  // Fetch tools when parameters change
  useEffect(() => {
    const paramsKey = `${agentType}:${modelType}:${organizationId}:${teamId}`;

    if (paramsKey === prevParamsRef.current) {
      return;
    }

    prevParamsRef.current = paramsKey;
    setEnabledTools(undefined);
    setError(null);

    if (canFetch) {
      fetchTools().catch(() => {
        // Error already handled in fetchTools
      });
    }
  }, [agentType, modelType, organizationId, teamId, canFetch, fetchTools]);

  return {
    enabledFrontendTools: enabledTools,
    isLoading,
    error,
    refetch: fetchTools,
  };
}
