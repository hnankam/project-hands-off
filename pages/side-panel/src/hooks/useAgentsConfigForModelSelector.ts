import { useState, useEffect } from 'react';
import { API_CONFIG } from '../constants';

/** Agent row from GET /api/config/agents (subset used by chat UI) */
export type AgentConfigEntry = {
  id: string;
  allowedModels?: string[] | null;
  /** From agent metadata; chat UI warning only (not sent to pydantic backend as instructions) */
  requiredWorkspaceCredentials?: RequiredWorkspaceCredentialMeta[] | null;
};

export type RequiredWorkspaceCredentialMeta = {
  credential_type?: string;
  type?: string;
  description?: string;
};

/**
 * Fetches /api/config/agents once (credentials included) for ModelSelector's allowedModels.
 * Shared by SelectorsBar and chat input inline selectors.
 */
export function useAgentsConfigForModelSelector(enabled = true): AgentConfigEntry[] {
  const [agents, setAgents] = useState<AgentConfigEntry[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const fetchAgents = async () => {
      try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/api/config/agents`, {
          credentials: 'include',
        });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (!cancelled) {
          setAgents(data.agents || []);
        }
      } catch (error) {
        console.error('[useAgentsConfigForModelSelector] Failed to fetch agents:', error);
      }
    };

    void fetchAgents();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return agents;
}
