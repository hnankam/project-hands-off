/**
 * User-related types shared across admin components
 */

export interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: string | Date | null;
}

export interface Member {
  id: string;
  userId: string;
  organizationId: string;
  role: string | string[];
  user: User;
  createdAt: string | Date;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  status: string;
  expiresAt: string | Date;
  inviterId: string;
  createdAt: string | Date;
}

