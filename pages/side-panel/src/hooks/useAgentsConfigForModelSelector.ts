import { useState, useEffect } from 'react';
import { API_CONFIG } from '../constants';

/** Minimal agent shape for ModelSelector allowed-models filtering */
export type AgentConfigEntry = { id: string; allowedModels?: string[] | null };

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
