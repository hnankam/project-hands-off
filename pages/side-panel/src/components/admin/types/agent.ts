/**
 * Agent-related types shared across admin components
 */

export interface AgentOption {
  id: string;
  agentType: string;
  agentName: string;
  enabled?: boolean;
}

export type AuxiliaryAgentType = 
  | 'image_generation'
  | 'web_search'
  | 'code_execution'
  | 'url_context'
  | 'memory';

export interface AuxiliaryAgentsConfig {
  image_generation?: { agent_type: string };
  web_search?: { agent_type: string };
  code_execution?: { agent_type: string };
  url_context?: { agent_type: string };
  memory?: { agent_type: string };
}

export const AUX_TYPE_LABELS: Record<AuxiliaryAgentType, { label: string; description: string }> = {
  image_generation: {
    label: 'Image Generation',
    description: 'Generate images from text prompts',
  },
  web_search: {
    label: 'Web Search',
    description: 'Search the web for information',
  },
  code_execution: {
    label: 'Code Execution',
    description: 'Execute code snippets',
  },
  url_context: {
    label: 'URL Context',
    description: 'Load content from URLs',
  },
  memory: {
    label: 'Memory',
    description: 'Store and retrieve information',
  },
};

export type AgentScope = 'organization' | 'team';

export interface AgentRecord {
  id: string;
  agentType: string;
  agentName: string;
  description: string | null;
  promptTemplate: string;
  organizationId: string;
  teams: Array<{ id: string; name: string }>;
  enabled: boolean;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  modelIds: string[];
  toolIds: string[];
}

