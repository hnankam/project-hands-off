/**
 * Team-related types shared across admin components
 */

export interface Team {
  id: string;
  name: string;
  organizationId: string;
  createdAt?: string | Date;
}

