/**
 * Shared Entity Types
 * 
 * Centralized type definitions for common entities used across the application.
 * Import these types instead of defining them locally in each file.
 */

// ============================================================================
// ORGANIZATION TYPES
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string | Date;
}

// ============================================================================
// TEAM TYPES
// ============================================================================

export interface Team {
  id: string;
  name: string;
  organizationId: string;
  createdAt?: string | Date;
}

// ============================================================================
// USER TYPES
// ============================================================================

export interface User {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  banned?: boolean;
  banReason?: string | null;
  banExpires?: string | Date | null;
}

export interface Member {
  id: string;
  userId: string;
  organizationId: string;
  role: string | string[];
  createdAt?: string | Date;
  user?: User;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'rejected' | 'canceled';
  expiresAt: string | Date;
  inviterId: string;
  organizationId: string;
  teamId?: string | null;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

// ============================================================================
// MODEL & AGENT TYPES
// ============================================================================

export interface ModelSummary {
  id: string;
  modelKey: string;
  name: string;
  teams: Array<{ id: string; name: string }>;
  enabled: boolean;
}

export interface AgentSummary {
  id: string;
  agentType: string;
  name: string;
  teams: Array<{ id: string; name: string }>;
  enabled: boolean;
}

export interface ToolSummary {
  id: string;
  toolKey: string;
  name: string;
  teams: Array<{ id: string; name: string }>;
  enabled: boolean;
}

export interface ProviderSummary {
  id: string;
  providerKey: string;
  providerType: string;
  teams: Array<{ id: string; name: string }>;
}

// ============================================================================
// USAGE TYPES
// ============================================================================

export interface UsageSnapshot {
  request: number;
  response: number;
  total: number;
  requestCount: number;
}

export interface CumulativeUsage {
  request: number;
  response: number;
  total: number;
  requestCount: number;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertMessage {
  type: AlertType;
  text: string;
  id?: string;
}

export type TabKey = string;

// ============================================================================
// ADMIN TAB TYPES
// ============================================================================

export type AdminTabKey =
  | 'organizations'
  | 'teams'
  | 'users'
  | 'usage'
  | 'providers'
  | 'models'
  | 'tools'
  | 'agents'
  | 'deployments';

export type HomeTabKey = 'sessions' | 'usage' | 'insights';

