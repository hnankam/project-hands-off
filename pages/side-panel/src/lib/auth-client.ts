/**
 * Better Auth Client Configuration
 * 
 * This file sets up the Better Auth client with organization plugin for the frontend.
 */

/// <reference types="vite/client" />

import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

// Get the base URL from environment or use default
const baseURL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
 */
export type Session = Awaited<ReturnType<typeof authClient.getSession>>['data'];
export type User = NonNullable<Session>['user'];
export type Organization = any; // Will be properly typed at runtime
export type Member = any; // Will be properly typed at runtime  
export type Team = any; // Will be properly typed at runtime

export default authClient;

