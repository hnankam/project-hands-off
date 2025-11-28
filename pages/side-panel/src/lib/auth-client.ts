/**
 * Better Auth Client Configuration
 * 
 * This file sets up the Better Auth client with organization plugin for the frontend.
 */

import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

// Constants
const DEFAULT_API_URL = "http://localhost:3001";
const baseURL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

/**
 * Better Auth client instance
 */
export const authClient = createAuthClient({
  baseURL: `${baseURL}/api/auth`,
  
  // Configure fetch options for Chrome extension compatibility
  fetchOptions: {
    credentials: 'include',
  },
  
  plugins: [
    organizationClient({
      teams: {
        enabled: true,
      },
    }),
  ],
});

/**
 * Type definitions for Better Auth
 * 
 * These types are inferred from the authClient session data.
 * They provide type safety for user, session, and organization data.
 */
export type Session = Awaited<ReturnType<typeof authClient.getSession>>['data'];
export type User = NonNullable<Session>['user'];

/**
 * Organization type from Better Auth organization plugin
 */
export interface Organization {
  id: string;
  name: string;
  slug?: string;
  logo?: string | null;
  metadata?: any;
  createdAt: Date;
}

/**
 * Member type representing user membership in an organization
 */
export interface Member {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  email?: string;
  createdAt: Date;
  user?: User;
}

/**
 * Team type for team-based organization structure
 */
export interface Team {
  id: string;
  name: string;
  organizationId: string;
  slug?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}
