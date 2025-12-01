/**
 * Better Auth Client Configuration
 * 
 * This file sets up the Better Auth client with organization plugin for the frontend.
 * Includes password reset functionality for both user-initiated and admin-initiated flows.
 */

import { createAuthClient } from "better-auth/client";
import { organizationClient, adminClient } from "better-auth/client/plugins";

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
    adminClient(),
  ],
});

/**
 * Request a password reset email (forgot password flow)
 * Uses Better Auth's built-in forgetPassword method
 * @param email - User's email address
 * @returns Promise with success status or error
 */
export async function requestPasswordReset(email: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const { error } = await (authClient as any).forgetPassword({
      email,
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    
    if (error) {
      console.error('Password reset error:', error);
    }
    
    // Always return success to prevent email enumeration
    return { success: true };
  } catch (error: any) {
    console.error('Password reset request error:', error);
    // Still return success to prevent email enumeration
    return { success: true };
  }
}

/**
 * Reset password using a token from email link
 * Uses Better Auth's built-in resetPassword method
 * @param token - Reset token from email
 * @param newPassword - New password to set
 * @returns Promise with success status or error
 */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<{ success?: boolean; error?: string }> {
  try {
    // Use Better Auth's built-in resetPassword method
    const { error } = await (authClient as any).resetPassword({
      newPassword,
      token,
    });
    
    if (error) {
      return { error: error.message || 'Failed to reset password' };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('Password reset error:', error);
    return { error: error.message || 'An error occurred' };
  }
}

/**
 * Admin-initiated password reset for a user in their organization
 * This uses a custom endpoint (not built-in Better Auth)
 * @param userId - User ID to reset password for
 * @param organizationId - Organization ID (for authorization)
 * @returns Promise with success status or error
 */
export async function adminResetPassword(userId: string, organizationId: string): Promise<{ success?: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${baseURL}/api/auth/admin-reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId, organizationId }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      return { error: result?.error || 'Failed to reset password' };
    }
    
    return { success: true, message: result?.message };
  } catch (error: any) {
    console.error('Admin password reset error:', error);
    return { error: error.message || 'An error occurred' };
  }
}

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
