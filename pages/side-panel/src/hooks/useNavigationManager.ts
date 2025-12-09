/**
 * Navigation Manager Hook
 * 
 * Consolidates all navigation-related logic including:
 * - Page navigation (home, sessions, admin)
 * - URL hash synchronization
 * - State persistence
 * - Invitation flow
 */

import { useState, useCallback, useEffect } from 'react';
import { debug } from '@extension/shared';

// ============================================================================
// TYPES
// ============================================================================

export type PageType = 'home' | 'sessions' | 'admin';
export type AdminTab = 'organizations' | 'teams' | 'users' | 'providers' | 'models' | 'agents' | 'usage';

export type OAuthProvider = 'google' | 'microsoft' | 'github';

export interface NavigationState {
  activePage: PageType;
  adminInitialTab: AdminTab;
  invitationId: string | null;
  resetPasswordToken: string | null;
  oauthProvider: OAuthProvider | null;
  ssoEmail: string | null;
  isPageRestored: boolean;
}

export interface NavigationActions {
  navigateToHome: () => void;
  navigateToSessions: () => void;
  navigateToAdmin: (tab?: AdminTab) => void;
  setInvitationId: (id: string | null) => void;
  setResetPasswordToken: (token: string | null) => void;
  setOAuthProvider: (provider: OAuthProvider | null) => void;
  setSSOEmail: (email: string | null) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Valid page types for navigation and storage */
const VALID_PAGES: readonly PageType[] = ['home', 'sessions', 'admin'] as const;

/** Storage key for persisting last visited page */
const LAST_VISITED_PAGE_KEY = 'lastVisitedPage';

/** Hash route patterns for page matching */
const HASH_ROUTES = {
  HOME: '#/home',
  SESSIONS: '#/sessions',
  ADMIN: '#/admin',
  INVITATION: '#/accept-invitation/',
  RESET_PASSWORD: '#/reset-password',
  OAUTH: '#/oauth/',
  SSO: '#/sso',
} as const;

/** Valid OAuth providers */
const VALID_OAUTH_PROVIDERS: readonly OAuthProvider[] = ['google', 'microsoft', 'github'] as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Checks if a hash matches a specific route pattern.
 * Uses exact matching to avoid false positives.
 */
function matchesRoute(hash: string, route: string): boolean {
  return hash.startsWith(route);
}

/**
 * Extracts page type from hash URL.
 * Returns null if no valid page route is found.
 */
function getPageFromHash(hash: string): PageType | null {
  if (matchesRoute(hash, HASH_ROUTES.ADMIN)) return 'admin';
  if (matchesRoute(hash, HASH_ROUTES.SESSIONS)) return 'sessions';
  if (matchesRoute(hash, HASH_ROUTES.HOME)) return 'home';
  return null;
}

/**
 * Checks if hash contains an invitation route.
 */
function hasInvitationRoute(hash: string): boolean {
  return hash.includes(HASH_ROUTES.INVITATION);
}

/**
 * Checks if hash contains a reset password route.
 */
function hasResetPasswordRoute(hash: string): boolean {
  return hash.includes(HASH_ROUTES.RESET_PASSWORD);
}

/**
 * Extracts reset password token from URL.
 * Handles both hash-based and query string-based tokens.
 */
function getResetPasswordToken(): string | null {
  // Check query string first (for direct links from email)
  const urlParams = new URLSearchParams(window.location.search);
  const queryToken = urlParams.get('token');
  if (queryToken) return queryToken;
  
  // Check hash-based route (for in-app navigation)
  const hash = window.location.hash;
  const tokenMatch = hash.match(/reset-password\?token=([a-zA-Z0-9_-]+)/);
  if (tokenMatch) return tokenMatch[1];
  
  return null;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Navigation Manager Hook
 * 
 * Manages application navigation state, URL hash synchronization,
 * and persistence of navigation state to chrome.storage.
 * 
 * Features:
 * - Page navigation with hash synchronization
 * - Automatic restoration of last visited page
 * - Hash change listening and routing
 * - Invitation flow support
 * - State persistence to chrome.storage.local
 * 
 * @returns Navigation state and actions
 * 
 * @example
 * ```tsx
 * const {
 *   activePage,
 *   isPageRestored,
 *   navigateToSessions,
 *   navigateToAdmin
 * } = useNavigationManager();
 * 
 * // Navigate to admin panel
 * navigateToAdmin('teams');
 * ```
 */
export function useNavigationManager(): NavigationState & NavigationActions {
  // ============================================================================
  // STATE
  // ============================================================================

  const [activePage, setActivePage] = useState<PageType>('sessions');
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTab>('organizations');
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [resetPasswordToken, setResetPasswordToken] = useState<string | null>(null);
  const [oauthProvider, setOAuthProvider] = useState<OAuthProvider | null>(null);
  const [ssoEmail, setSSOEmail] = useState<string | null>(null);
  const [isPageRestored, setIsPageRestored] = useState(false);
  
  // ============================================================================
  // NAVIGATION HANDLERS
  // ============================================================================

  const navigateToHome = useCallback(() => {
    debug.log('[NavigationManager] Navigating to home');
    setActivePage('home');
    window.location.hash = HASH_ROUTES.HOME;
  }, []);
  
  const navigateToSessions = useCallback(() => {
    debug.log('[NavigationManager] Navigating to sessions');
    setActivePage('sessions');
    window.location.hash = HASH_ROUTES.SESSIONS;
  }, []);
  
  const navigateToAdmin = useCallback((tab: AdminTab = 'organizations') => {
    debug.log('[NavigationManager] Navigating to admin:', tab);
    setAdminInitialTab(tab);
    setActivePage('admin');
    window.location.hash = HASH_ROUTES.ADMIN;
  }, []);
  
  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Restore last visited page on mount
  useEffect(() => {
    const restoreLastPage = async () => {
      try {
        const hash = window.location.hash;
        
        // Check for reset password token first (can come from query string or hash)
        const token = getResetPasswordToken();
        if (token) {
          debug.log('[NavigationManager] Reset password token detected');
          setResetPasswordToken(token);
          setIsPageRestored(true);
          return;
        }
        
        // If there's already a hash route, let the hash checker handle it
        if (hash && (getPageFromHash(hash) || hasInvitationRoute(hash) || hasResetPasswordRoute(hash))) {
          debug.log('[NavigationManager] Hash route detected, skipping restoration:', hash);
          setIsPageRestored(true);
          return;
        }
        
        // Otherwise, restore from storage
        const result = await chrome.storage.local.get([LAST_VISITED_PAGE_KEY]);
        const storedPage = result[LAST_VISITED_PAGE_KEY];
        
        if (storedPage && VALID_PAGES.includes(storedPage as PageType)) {
          debug.log('[NavigationManager] Restoring last visited page:', storedPage);
          setActivePage(storedPage as PageType);
        } else {
          debug.log('[NavigationManager] No valid stored page, using default (sessions)');
        }
      } catch (error) {
        debug.error('[NavigationManager] Failed to restore last page:', error);
      } finally {
        setIsPageRestored(true);
      }
    };
    
    restoreLastPage();
  }, []);
  
  // Save current page to storage whenever it changes
  useEffect(() => {
    if (!isPageRestored) return; // Don't save during initial restoration
    
    debug.log('[NavigationManager] Saving last visited page:', activePage);
    chrome.storage.local.set({ [LAST_VISITED_PAGE_KEY]: activePage }).catch((error) => {
      debug.error('[NavigationManager] Failed to save last page:', error);
    });
  }, [activePage, isPageRestored]);
  
  // Handle URL hash changes and routing
  useEffect(() => {
    if (!isPageRestored) return; // Wait for page restoration before checking hash
    
    const checkHash = () => {
      const hash = window.location.hash;
      
      debug.log('[NavigationManager] Checking hash:', hash);
      
      // Check for SSO route first (#/sso?email=...)
      if (hash.startsWith(HASH_ROUTES.SSO)) {
        const urlParams = new URLSearchParams(hash.split('?')[1] || '');
        const email = urlParams.get('email');
        if (email) {
          debug.log('[NavigationManager] SSO route detected:', email);
          setSSOEmail(decodeURIComponent(email));
          return;
        }
      }
      
      // Check for OAuth route (#/oauth/{provider})
      const oauthMatch = hash.match(/oauth\/(google|microsoft|github)/);
      if (oauthMatch) {
        const provider = oauthMatch[1] as OAuthProvider;
        if (VALID_OAUTH_PROVIDERS.includes(provider)) {
          debug.log('[NavigationManager] OAuth route detected:', provider);
          setOAuthProvider(provider);
          return;
        }
      }
      
      // Check for reset password token
      const token = getResetPasswordToken();
      if (token) {
        debug.log('[NavigationManager] Reset password token detected');
        setResetPasswordToken(token);
        return;
      }
      
      // Check for #/accept-invitation/{invitationId}
      const invitationMatch = hash.match(/accept-invitation\/([a-zA-Z0-9_-]+)/);
      if (invitationMatch) {
        debug.log('[NavigationManager] Invitation route detected:', invitationMatch[1]);
        setInvitationId(invitationMatch[1]);
        return;
      }
      
      // Check for page routes using utility function
      const page = getPageFromHash(hash);
      if (page) {
        debug.log('[NavigationManager] Page route detected:', page);
        setActivePage(page);
      }
    };
    
    // Run initial check
    checkHash();
    
    // Listen for hash changes
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [isPageRestored]);
  
  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    activePage,
    adminInitialTab,
    invitationId,
    resetPasswordToken,
    oauthProvider,
    ssoEmail,
    isPageRestored,
    navigateToHome,
    navigateToSessions,
    navigateToAdmin,
    setInvitationId,
    setResetPasswordToken,
    setOAuthProvider,
    setSSOEmail,
  };
}

