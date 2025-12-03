/**
 * Better Auth Client Configuration
 * 
 * This file sets up the Better Auth client with organization plugin for the frontend.
 * Includes password reset functionality for both user-initiated and admin-initiated flows.
 * Supports social login via Google, Microsoft, and GitHub.
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
 * Ban a user (deactivate without deleting)
 * Uses a custom endpoint that checks organization-level permissions
 * @param userId - User ID to ban
 * @param organizationId - Organization ID (for authorization)
 * @param banReason - Optional reason for the ban
 * @returns Promise with success status or error
 */
export async function banUser(
  userId: string,
  organizationId: string,
  banReason?: string
): Promise<{ success?: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${baseURL}/api/auth/admin-ban-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId, organizationId, banReason }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      return { error: result?.error || 'Failed to ban user' };
    }
    
    return { success: true, message: result?.message };
  } catch (error: any) {
    console.error('Ban user error:', error);
    return { error: error.message || 'An error occurred while banning user' };
  }
}

/**
 * Unban a user (reactivate)
 * Uses a custom endpoint that checks organization-level permissions
 * @param userId - User ID to unban
 * @param organizationId - Organization ID (for authorization)
 * @returns Promise with success status or error
 */
export async function unbanUser(
  userId: string,
  organizationId: string
): Promise<{ success?: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${baseURL}/api/auth/admin-unban-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId, organizationId }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      return { error: result?.error || 'Failed to unban user' };
    }
    
    return { success: true, message: result?.message };
  } catch (error: any) {
    console.error('Unban user error:', error);
    return { error: error.message || 'An error occurred while unbanning user' };
  }
}

/**
 * Social login providers
 */
export type SocialProvider = 'google' | 'microsoft' | 'github';

/**
 * Check if running in a Chrome extension context
 */
function isExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && 
         typeof chrome.runtime !== 'undefined' && 
         !!chrome.runtime.id;
}

/**
 * Direct social sign-in using Better Auth client.
 * This initiates the OAuth redirect flow directly.
 * Used by OAuthPage component when opened in a popup.
 * @param provider - The social provider to use
 * @returns Promise with success status or error
 */
export async function signInWithSocialDirect(provider: SocialProvider): Promise<{ success?: boolean; error?: string }> {
  try {
    const signIn = (authClient as any).signIn;
    if (!signIn || !signIn.social) {
      return { error: 'Social login not available' };
    }
    
    // Use the server's OAuth success callback
    const callbackURL = `${baseURL}/api/auth/oauth-success`;
    
    const { error } = await signIn.social({
      provider,
      callbackURL,
    });
    
    if (error) {
      return { error: error.message || `Failed to sign in with ${provider}` };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error(`Social login error (${provider}):`, error);
    return { error: error.message || 'An error occurred during social login' };
  }
}

/**
 * Sign in with a social provider (Google, Microsoft, or GitHub)
 * For Chrome extensions, opens OAuth in a popup window with proper callback handling
 * @param provider - The social provider to use
 * @returns Promise with success status or error
 */
export async function signInWithSocial(provider: SocialProvider): Promise<{ success?: boolean; error?: string }> {
  try {
    const signIn = (authClient as any).signIn;
    if (!signIn || !signIn.social) {
      return { error: 'Social login not available' };
    }
    
    // For Chrome extensions, we need special handling
    if (isExtensionContext()) {
      // Open the extension's OAuth page in a popup
      // This page will initiate the OAuth flow with proper cookie context
      const extensionId = chrome.runtime.id;
      const oauthUrl = `chrome-extension://${extensionId}/side-panel/index.html#/oauth/${provider}`;
      
      // Open OAuth in a popup window
      const popup = window.open(
        oauthUrl,
        'oauth-popup',
        'width=420,height=600,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        return { error: 'Popup blocked. Please allow popups for this extension.' };
      }
      
      // Poll for popup close and session
      return new Promise((resolve) => {
        const checkInterval = setInterval(async () => {
          try {
            // Check if popup is closed
            if (popup.closed) {
              clearInterval(checkInterval);
              
              // Give a moment for cookies to be set, then check session
              await new Promise(r => setTimeout(r, 500));
              
              // Check if we're now authenticated
              const session = await authClient.getSession();
              if (session?.data?.user) {
                resolve({ success: true });
              } else {
                // User closed popup without completing OAuth
                resolve({ error: 'Authentication cancelled' });
              }
            }
          } catch (e) {
            // Popup is still open or cross-origin, continue polling
          }
        }, 500);
        
        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!popup.closed) {
            popup.close();
          }
          resolve({ error: 'Authentication timed out' });
        }, 5 * 60 * 1000);
      });
    }
    
    // For regular web context, use standard OAuth flow
    const { error } = await signIn.social({
      provider,
      callbackURL: window.location.origin,
    });
    
    if (error) {
      return { error: error.message || `Failed to sign in with ${provider}` };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error(`Social login error (${provider}):`, error);
    return { error: error.message || 'An error occurred during social login' };
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
