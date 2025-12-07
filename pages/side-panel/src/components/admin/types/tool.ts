/**
 * Tool-related types shared across admin components
 */

export type ToolType = 'frontend' | 'backend' | 'builtin' | 'mcp';

export interface McpServer {
  id: string;
  serverKey: string;
  displayName: string;
  transport: string;
}

export interface ToolOption {
  id: string;
  name: string;
  type: string;
  toolKey?: string;
  teams?: Array<{ id: string; name?: string }>;
  enabled?: boolean;
  mcpServer?: McpServer | null;
}

export interface ToolSummary {
  id: string;
  toolKey: string;
  name: string;
  type: ToolType;
  teams: Array<{ id: string; name: string }>;
  enabled: boolean;
  readonly: boolean;
  mcpServer?: McpServer | null;
}

/**
 * Get display label for tool type
 */
export const getToolTypeLabel = (type: ToolType): string => {
  const labels: Record<ToolType, string> = {
    frontend: 'Frontend Tools',
    backend: 'Backend Tools',
    builtin: 'Built-in Tools',
    mcp: 'MCP Tools',
  };
  return labels[type] || type;
};

