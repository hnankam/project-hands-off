/**
 * @fileoverview Navigation Manager Hook
 * 
 * Consolidates all navigation-related logic including:
 * - Page navigation (home, sessions, admin)
 * - URL hash synchronization
 * - State persistence
 * - Invitation flow
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { sessionStorageDBWrapper } from '@extension/shared';

export type PageType = 'home' | 'sessions' | 'admin';
export type AdminTab = 'organizations' | 'teams' | 'users' | 'providers' | 'models' | 'agents' | 'usage';

export interface NavigationState {
  activePage: PageType;
  adminInitialTab: AdminTab;
  invitationId: string | null;
  isPageRestored: boolean;
}

export interface NavigationActions {
  navigateToHome: () => void;
  navigateToSessions: () => void;
  navigateToAdmin: (tab?: AdminTab) => void;
  navigateToInvitation: () => void;
  setInvitationId: (id: string | null) => void;
}

export function useNavigationManager(): NavigationState & NavigationActions {
  const [activePage, setActivePage] = useState<PageType>('sessions');
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTab>('organizations');
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [isPageRestored, setIsPageRestored] = useState(false);
  
  // Navigation handlers
  const navigateToHome = useCallback(() => {
    setActivePage('home');
    window.location.hash = '#/home';
  }, []);
  
  const navigateToSessions = useCallback(() => {
    setActivePage('sessions');
    window.location.hash = '#/sessions';
  }, []);
  
  const navigateToAdmin = useCallback((tab: AdminTab = 'organizations') => {
    setAdminInitialTab(tab);
    setActivePage('admin');
    window.location.hash = '#/admin';
  }, []);
  
  const navigateToInvitation = useCallback(() => {
    // This will be handled by InvitationModal opening
    // The actual navigation happens after validation
  }, []);
  
  // Restore last visited page on mount
  useEffect(() => {
    const restoreLastPage = async () => {
      try {
        const hash = window.location.hash;
        
        // If there's already a hash route, let the hash checker handle it
        if (hash && (hash.includes('admin') || hash.includes('sessions') || hash.includes('home') || hash.includes('accept-invitation'))) {
          setIsPageRestored(true);
          return;
        }
        
        // Otherwise, restore from storage
        const result = await chrome.storage.local.get(['lastVisitedPage']);
        if (result.lastVisitedPage && ['home', 'sessions', 'admin'].includes(result.lastVisitedPage)) {
          setActivePage(result.lastVisitedPage as PageType);
        }
      } catch (error) {
        console.error('[NavigationManager] Failed to restore last page:', error);
      } finally {
        setIsPageRestored(true);
      }
    };
    
    restoreLastPage();
  }, []);
  
  // Save current page to storage whenever it changes
  useEffect(() => {
    if (!isPageRestored) return; // Don't save during initial restoration
    
    chrome.storage.local.set({ lastVisitedPage: activePage }).catch((error) => {
      console.error('[NavigationManager] Failed to save last page:', error);
    });
  }, [activePage, isPageRestored]);
  
  // Handle URL hash changes and routing
  useEffect(() => {
    if (!isPageRestored) return; // Wait for page restoration before checking hash
    
    const checkHash = () => {
      const hash = window.location.hash;
      
      // Check for #/accept-invitation/{invitationId}
      const invitationMatch = hash.match(/accept-invitation\/([a-zA-Z0-9_-]+)/);
      if (invitationMatch) {
        setInvitationId(invitationMatch[1]);
        return;
      }
      
      // Check for page routes
      if (hash.includes('admin')) {
        setActivePage('admin');
      } else if (hash.includes('sessions')) {
        setActivePage('sessions');
      } else if (hash.includes('home')) {
        setActivePage('home');
      }
    };
    
    checkHash();
    
    // Listen for hash changes
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [isPageRestored]);
  
  return {
    activePage,
    adminInitialTab,
    invitationId,
    isPageRestored,
    navigateToHome,
    navigateToSessions,
    navigateToAdmin,
    navigateToInvitation,
    setInvitationId,
  };
}

