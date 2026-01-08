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

/** Configuration for a built-in auxiliary agent type */
export interface BuiltinAuxiliaryAgentConfig {
  agent_id: string;
}

/** Configuration for a custom auxiliary agent */
export interface CustomAuxiliaryAgent {
  /** Unique key for this custom agent (e.g., "research_assistant") */
  key: string;
  /** Database ID of the agent to use */
  agent_id: string;
  /** Description of what this agent does (shown to the main agent) */
  description: string;
}

export interface AuxiliaryAgentsConfig {
  // Built-in auxiliary agent types
  image_generation?: BuiltinAuxiliaryAgentConfig;
  web_search?: BuiltinAuxiliaryAgentConfig;
  code_execution?: BuiltinAuxiliaryAgentConfig;
  url_context?: BuiltinAuxiliaryAgentConfig;
  memory?: BuiltinAuxiliaryAgentConfig;
  // Custom auxiliary agents
  custom?: CustomAuxiliaryAgent[];
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

