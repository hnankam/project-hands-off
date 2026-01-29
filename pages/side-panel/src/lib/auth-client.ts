/**
 * Better Auth Client Configuration
 * 
 * This file sets up the Better Auth client with organization plugin for the frontend.
 * Includes password reset functionality for both user-initiated and admin-initiated flows.
 * Supports social login via Google, Microsoft, and GitHub.
 * Supports SSO (OIDC/SAML) for enterprise organizations.
 */

import { createAuthClient } from "better-auth/client";
import { organizationClient, adminClient } from "better-auth/client/plugins";
import { ssoClient } from "@better-auth/sso/client";

// Constants
const DEFAULT_API_URL = "http://localhost:3001";
const baseURL = process.env.CEB_API_URL || DEFAULT_API_URL;

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
    ssoClient(),
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
 * Direct SSO sign-in using Better Auth client.
 * This initiates the SSO redirect flow directly.
 * Used by SSOPage component when opened in a popup.
 * @param email - User's email address for domain matching
 * @returns Promise with success status or error
 */
export async function signInWithSSODirect(email: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const signIn = (authClient as any).signIn;
    if (!signIn || !signIn.sso) {
      return { error: 'SSO not available' };
    }
    
    // Use the server's OAuth success callback
    const callbackURL = `${baseURL}/api/auth/oauth-success`;
    
    const { error } = await signIn.sso({
      email,
      callbackURL,
    });
    
    if (error) {
      return { error: error.message || 'Failed to sign in with SSO' };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('SSO login error:', error);
    return { error: error.message || 'An error occurred during SSO login' };
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

// ============================================================================
// SSO (Single Sign-On) Types and Functions
// ============================================================================

/**
 * SSO Provider type for enterprise authentication
 */
export interface SSOProvider {
  id: string;
  providerId: string;
  issuer: string;
  domain: string;
  oidcConfig?: OIDCConfig;
  samlConfig?: SAMLConfig;
  userId: string;
  organizationId?: string;
  domainVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * OIDC Configuration for SSO providers
 */
export interface OIDCConfig {
  clientId: string;
  clientSecret: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksEndpoint?: string;
  discoveryEndpoint?: string;
  scopes?: string[];
  pkce?: boolean;
  mapping?: {
    id?: string;
    email?: string;
    emailVerified?: string;
    name?: string;
    image?: string;
    extraFields?: Record<string, string>;
  };
}

/**
 * SAML Configuration for SSO providers
 */
export interface SAMLConfig {
  entryPoint: string;
  cert: string;
  callbackUrl?: string;
  audience?: string;
  wantAssertionsSigned?: boolean;
  signatureAlgorithm?: 'sha256' | 'sha512';
  digestAlgorithm?: 'sha256' | 'sha512';
  identifierFormat?: string;
  idpMetadata?: {
    metadata?: string;
    privateKey?: string;
    privateKeyPass?: string;
    isAssertionEncrypted?: boolean;
    encPrivateKey?: string;
    encPrivateKeyPass?: string;
  };
}

/**
 * Register an SSO provider for an organization (OIDC)
 * @param config - SSO provider configuration
 * @returns Promise with the created provider or error
 */
export async function registerSSOProvider(config: {
  providerId: string;
  issuer: string;
  domain: string;
  organizationId?: string;
  oidcConfig?: OIDCConfig;
  samlConfig?: SAMLConfig;
}): Promise<{ data?: SSOProvider; error?: string }> {
  try {
    const sso = (authClient as any).sso;
    if (!sso || !sso.register) {
      return { error: 'SSO not available' };
    }
    
    console.log('[SSO Register] Config being sent:', JSON.stringify(config, null, 2));
    
    const { data, error } = await sso.register(config);
    
    console.log('[SSO Register] Response:', { data, error });
    
    if (error) {
      return { error: error.message || 'Failed to register SSO provider' };
    }
    
    return { data };
  } catch (error: any) {
    console.error('SSO registration error:', error);
    return { error: error.message || 'An error occurred during SSO registration' };
  }
}

/**
 * Update an existing SSO provider
 * @param providerId - The provider ID to update
 * @param config - Updated configuration
 * @returns Promise with the updated provider or error
 */
export async function updateSSOProvider(
  providerId: string,
  config: Partial<{
    issuer: string;
    domain: string;
    oidcConfig?: OIDCConfig;
    samlConfig?: SAMLConfig;
  }>
): Promise<{ data?: SSOProvider; error?: string }> {
  try {
    const sso = (authClient as any).sso;
    if (!sso || !sso.update) {
      return { error: 'SSO not available' };
    }
    
    const { data, error } = await sso.update({
      providerId,
      ...config,
    });
    
    if (error) {
      return { error: error.message || 'Failed to update SSO provider' };
    }
    
    return { data };
  } catch (error: any) {
    console.error('SSO update error:', error);
    return { error: error.message || 'An error occurred during SSO update' };
  }
}

/**
 * Delete an SSO provider
 * Uses custom endpoint since ssoClient may not have delete method
 * @param providerId - The provider ID to delete
 * @returns Promise with success status or error
 */
export async function deleteSSOProvider(providerId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseURL}/api/auth/delete-sso-provider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ providerId }),
    });
    
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      return { error: result?.error || 'Failed to delete SSO provider' };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('SSO deletion error:', error);
    return { error: error.message || 'An error occurred during SSO deletion' };
  }
}

/**
 * List SSO providers for the current user's organization
 * Queries the ssoProvider table directly via custom endpoint
 * @param organizationId - Optional organization ID to filter by
 * @returns Promise with the list of providers or error
 */
export async function listSSOProviders(organizationId?: string): Promise<{ data?: SSOProvider[]; error?: string }> {
  try {
    const url = `${baseURL}/api/auth/list-sso-providers${organizationId ? `?organizationId=${organizationId}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { data: [] };
      }
      const result = await response.json().catch(() => ({}));
      return { error: result?.message || result?.error || 'Failed to list SSO providers' };
    }
    
    const data = await response.json();
    return { data: data.providers || data || [] };
  } catch (error: any) {
    console.error('[SSO] Error listing providers:', error);
    return { data: [] };
  }
}

/**
 * Get a specific SSO provider by ID
 * @param providerId - The provider ID to fetch
 * @returns Promise with the provider or error
 */
export async function getSSOProvider(providerId: string): Promise<{ data?: SSOProvider; error?: string }> {
  try {
    const sso = (authClient as any).sso;
    if (!sso || !sso.getProvider) {
      return { error: 'SSO not available' };
    }
    
    const { data, error } = await sso.getProvider({ providerId });
    
    if (error) {
      return { error: error.message || 'Failed to get SSO provider' };
    }
    
    return { data };
  } catch (error: any) {
    console.error('SSO get error:', error);
    return { error: error.message || 'An error occurred while fetching SSO provider' };
  }
}

/**
 * Request domain verification for an SSO provider
 * @param providerId - The provider ID to verify domain for
 * @returns Promise with verification token info or error
 */
export async function requestDomainVerification(providerId: string): Promise<{ 
  data?: { token: string; expiresAt?: Date }; 
  error?: string 
}> {
  try {
    const sso = (authClient as any).sso;
    if (!sso || !sso.requestDomainVerification) {
      return { error: 'SSO not available' };
    }
    
    const { data, error } = await sso.requestDomainVerification({ providerId });
    
    if (error) {
      return { error: error.message || 'Failed to request domain verification' };
    }
    
    // Normalize the response - API returns domainVerificationToken
    const normalizedData = {
      token: data?.domainVerificationToken || data?.token,
      expiresAt: data?.expiresAt,
    };
    
    return { data: normalizedData };
  } catch (error: any) {
    console.error('Domain verification request error:', error);
    return { error: error.message || 'An error occurred while requesting domain verification' };
  }
}

/**
 * Verify domain ownership for an SSO provider
 * @param providerId - The provider ID to verify
 * @returns Promise with verification result or error
 */
export async function verifyDomain(providerId: string): Promise<{ 
  data?: { verified: boolean }; 
  error?: string 
}> {
  try {
    const sso = (authClient as any).sso;
    if (!sso || !sso.verifyDomain) {
      return { error: 'SSO not available' };
    }
    
    const { data, error } = await sso.verifyDomain({ providerId });
    
    if (error) {
      return { error: error.message || 'Failed to verify domain' };
    }
    
    return { data };
  } catch (error: any) {
    console.error('Domain verification error:', error);
    return { error: error.message || 'An error occurred during domain verification' };
  }
}

/**
 * Sign in with SSO using email domain detection
 * Automatically routes to the appropriate SSO provider based on email domain
 * @param email - User's email address
 * @param options - Optional sign-in options
 * @returns Promise with success status or error
 */
export async function signInWithSSO(
  email: string,
  options?: { 
    callbackURL?: string;
    requestSignUp?: boolean;
  }
): Promise<{ success?: boolean; error?: string; redirectUrl?: string }> {
  try {
    const signIn = (authClient as any).signIn;
    if (!signIn || !signIn.sso) {
      return { error: 'SSO not available' };
    }
    
    // For Chrome extensions, use popup pattern like social login
    if (isExtensionContext()) {
      // Open the extension's SSO page in a popup
      // This page will initiate the SSO flow with proper cookie context
      const extensionId = chrome.runtime.id;
      const ssoUrl = `chrome-extension://${extensionId}/side-panel/index.html#/sso?email=${encodeURIComponent(email)}`;
      
      // Open SSO in a popup window
      const popup = window.open(
        ssoUrl,
        'sso-popup',
        'width=500,height=700,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        return { error: 'Popup blocked. Please allow popups for this extension.' };
      }
      
      // Poll for popup close and session
      return new Promise((resolve) => {
        const checkInterval = setInterval(async () => {
          try {
            if (popup.closed) {
              clearInterval(checkInterval);
              await new Promise(r => setTimeout(r, 500));
              
              const session = await authClient.getSession();
              if (session?.data?.user) {
                resolve({ success: true });
              } else {
                resolve({ error: 'Authentication cancelled' });
              }
            }
          } catch (e) {
            // Continue polling
          }
        }, 500);
        
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!popup.closed) popup.close();
          resolve({ error: 'Authentication timed out' });
        }, 5 * 60 * 1000);
      });
    }
    
    // For regular web context
    const { data, error } = await signIn.sso({
      email,
      callbackURL: options?.callbackURL || window.location.origin,
      requestSignUp: options?.requestSignUp,
    });
    
    if (error) {
      return { error: error.message || 'Failed to initiate SSO sign-in' };
    }
    
    if (data?.url) {
      return { success: true, redirectUrl: data.url };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('SSO sign-in error:', error);
    return { error: error.message || 'An error occurred during SSO sign-in' };
  }
}

/**
 * Sign in with a specific SSO provider
 * @param providerId - The provider ID to use
 * @param options - Optional sign-in options
 * @returns Promise with success status or error
 */
export async function signInWithSSOProvider(
  providerId: string,
  options?: {
    callbackURL?: string;
    requestSignUp?: boolean;
  }
): Promise<{ success?: boolean; error?: string; redirectUrl?: string }> {
  try {
    // According to Better Auth docs, use authClient.signIn.sso() with providerId
    const signIn = (authClient as any).signIn;
    if (!signIn || !signIn.sso) {
      return { error: 'SSO not available' };
    }
    
    const callbackURL = options?.callbackURL || 
      (isExtensionContext() ? `${baseURL}/api/auth/oauth-success` : window.location.origin);
    
    const { data, error } = await signIn.sso({
      providerId,
      callbackURL,
      requestSignUp: options?.requestSignUp,
    });
    
    if (error) {
      return { error: error.message || 'Failed to initiate SSO sign-in' };
    }
    
    // Handle popup for Chrome extension
    if (isExtensionContext() && data?.url) {
      const popup = window.open(
        data.url,
        'sso-popup',
        'width=500,height=700,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        return { error: 'Popup blocked. Please allow popups for this extension.' };
      }
      
      return new Promise((resolve) => {
        const checkInterval = setInterval(async () => {
          try {
            if (popup.closed) {
              clearInterval(checkInterval);
              await new Promise(r => setTimeout(r, 500));
              
              const session = await authClient.getSession();
              if (session?.data?.user) {
                resolve({ success: true });
              } else {
                resolve({ error: 'Authentication cancelled' });
              }
            }
          } catch (e) {
            // Continue polling
          }
        }, 500);
        
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!popup.closed) popup.close();
          resolve({ error: 'Authentication timed out' });
        }, 5 * 60 * 1000);
      });
    }
    
    if (data?.url) {
      return { success: true, redirectUrl: data.url };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('SSO provider sign-in error:', error);
    return { error: error.message || 'An error occurred during SSO sign-in' };
  }
}
