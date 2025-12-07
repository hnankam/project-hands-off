/**
 * Model-related types shared across admin components
 */

export interface ModelOption {
  id: string;
  name: string;
  enabled?: boolean;
  modelKey?: string;
}

export interface ModelSummary {
  id: string;
  modelKey: string;
  name: string;
  teams: Array<{ id: string; name: string }>;
  enabled: boolean;
}

