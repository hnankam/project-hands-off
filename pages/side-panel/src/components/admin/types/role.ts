/**
 * Role-related types shared across admin components
 */

export interface Role {
  value: string;
  label: string;
  description?: string;
}

/**
 * Default available roles with descriptions
 */
export const DEFAULT_ROLES: Role[] = [
  { value: 'member', label: 'Member', description: 'Standard access' },
  { value: 'admin', label: 'Admin', description: 'Full management access' },
  { value: 'owner', label: 'Owner', description: 'Complete control' },
];

