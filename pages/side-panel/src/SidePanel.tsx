/**
 * @fileoverview Main Side Panel Component
 * 
 * Root component for the side panel interface.
 * Manages authentication, routing, theming, and top-level state.
 * 
 * Features:
 * - Multi-page navigation (Home, Sessions, Admin)
 * - Authentication flow with login and invitation handling
 * - URL-based routing with hash navigation
 * - Theme management (light/dark/system)
 * - Context menu integration
 * - Auto-save on panel closing
 * - State persistence
 */

import './SidePanel.css';
// CopilotKit styles now imported in index.css (after Tailwind base for @layer support)
import * as React from 'react';
import { useCallback, useEffect } from 'react';
import {
  useStorage,
  useSessionStorageDB,
  withErrorBoundary,
} from '@extension/shared';
import { themeStorage, apiConfigStorage } from '@extension/storage';
import {
  cn,
  ErrorDisplay,
} from '@extension/ui';
import { HomePage } from './pages/HomePage';
import { SessionsPage } from './pages/SessionsPage';
import { AdminPage } from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import OAuthPage from './pages/OAuthPage';
import SSOPage from './pages/SSOPage';
import { useAuth } from './context/AuthContext';
import { useDBWorkerClient } from './hooks/useDBWorkerClient';
import { useNavigationManager } from './hooks/useNavigationManager';
import { useSessionUrlSync } from './hooks/useSessionUrlSync';
import { useThemeManager } from './hooks/useThemeManager';
import { useMessageHandlers } from './hooks/useMessageHandlers';
import { ChatSkeleton } from './components/feedback/LoadingStates';
import { InvitationModal } from './components/modals/InvitationModal';
import { AboutModal } from './components/modals/AboutModal';
import { initApiConfig } from './constants';

// TODO: Move to environment variable (VITE_COPILOTKIT_PUBLIC_KEY)
const COPILOTKIT_PUBLIC_KEY = 'ck_pub_c94e406d9327510d0463f3dbe3c1f2e8';

const SidePanel = () => {
  // ============================================================================
  // Core State & Hooks
  // ============================================================================
  
  // Authentication
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Database worker
  const { isReady: dbWorkerReady, error: dbWorkerError } = useDBWorkerClient();
  
  // Theme
  const { isLight, theme } = useStorage(themeStorage);
  useThemeManager(isLight, theme);
  
  // API config from Options page (overrides build-time .env defaults)
  const { apiUrl, backendUrl } = useStorage(apiConfigStorage);
  useEffect(() => {
    initApiConfig(apiUrl, backendUrl);
  }, [apiUrl, backendUrl]);
  
  // Sessions
  const { sessions, currentSessionId, isLoading: sessionsLoading } = useSessionStorageDB();
  
  // Navigation
  const {
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
  } = useNavigationManager();
  
  // Stable callback for page changes to prevent unnecessary re-renders
  const handlePageChange = useCallback((page: 'sessions') => {
    if (page === 'sessions') {
      navigateToSessions();
    }
  }, [navigateToSessions]);
  
  // Session URL synchronization
  useSessionUrlSync({
    sessions,
    currentSessionId,
    activePage,
    onPageChange: handlePageChange,
  });
  
  // Message handlers (context menu, close events)
  const { contextMenuMessage } = useMessageHandlers();
  
  // ============================================================================
  // UI State
  // ============================================================================
  
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [invitationModalOpen, setInvitationModalOpen] = React.useState(false);
  
  // ============================================================================
  // Event Handlers
  // ============================================================================
  
  const closeSidePanel = useCallback(() => {
    // Send message to popup to update its state
    chrome.runtime.sendMessage({ action: 'sidePanelClosed' });
    // Close the side panel
    window.close();
  }, []);
  
  const openAbout = useCallback(() => {
    setAboutOpen(true);
  }, []);
  
  const handleInvitationSubmit = useCallback((trimmedId: string) => {
    setInvitationId(trimmedId);
    window.location.hash = `#/accept-invitation/${trimmedId}`;
  }, [setInvitationId]);
  
  const handleInvitationSuccess = useCallback(() => {
    // Clear invitation ID
    setInvitationId(null);
    
    // If authenticated (after accepting), redirect to home and reload
    // If not authenticated (after declining), just return to login
    if (isAuthenticated) {
      window.location.hash = '#/home';
      window.location.reload();
    } else {
      // Just clearing invitationId will show the login page
      window.location.hash = '';
    }
  }, [isAuthenticated, setInvitationId]);
  
  const handleResetPasswordSuccess = useCallback(() => {
    // Clear the reset password token
    setResetPasswordToken(null);
    // Clear the URL (remove token from query string)
    window.history.replaceState({}, document.title, window.location.pathname);
    window.location.hash = '';
  }, [setResetPasswordToken]);
  
  const handleResetPasswordCancel = useCallback(() => {
    // Clear the reset password token and go back to login
    setResetPasswordToken(null);
    window.history.replaceState({}, document.title, window.location.pathname);
    window.location.hash = '';
  }, [setResetPasswordToken]);
  
  // ============================================================================
  // Loading & Error States
  // ============================================================================
  
  // Show error if DB worker failed
  if (dbWorkerError) {
    return (
      <div className={cn('h-screen flex items-center justify-center', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
        <div className="text-center p-4">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
            Database Initialization Failed
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{dbWorkerError.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Reload Extension
          </button>
        </div>
      </div>
    );
  }
  
  // Show loading while checking authentication OR DB initialization
  if (authLoading || !dbWorkerReady) {
    return (
      <div className={cn('h-screen', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
        <ChatSkeleton isLight={isLight} />
      </div>
    );
  }
  
  // ============================================================================
  // Route: OAuth (opened in popup for social login)
  // ============================================================================
  
  if (oauthProvider) {
    return (
      <OAuthPage
        provider={oauthProvider}
        onSuccess={() => {
          // OAuth redirect will handle success
        }}
        onError={(error) => {
          console.error('[OAuth] Error:', error);
        }}
      />
    );
  }
  
  // ============================================================================
  // Route: SSO (opened in popup for enterprise SSO login)
  // ============================================================================
  
  if (ssoEmail) {
    return (
      <SSOPage
        email={ssoEmail}
        onSuccess={() => {
          // SSO redirect will handle success
        }}
        onError={(error) => {
          console.error('[SSO] Error:', error);
        }}
      />
    );
  }
  
  // ============================================================================
  // Route: Password Reset
  // ============================================================================
  
  if (resetPasswordToken) {
    return (
      <ResetPasswordPage
        token={resetPasswordToken}
        onSuccess={handleResetPasswordSuccess}
        onCancel={handleResetPasswordCancel}
      />
    );
  }
  
  // ============================================================================
  // Route: Invitation Acceptance
  // ============================================================================
  
  if (invitationId) {
    return (
      <AcceptInvitationPage
        invitationId={invitationId}
        onSuccess={handleInvitationSuccess}
      />
    );
  }
  
  // ============================================================================
  // Route: Login (Unauthenticated)
  // ============================================================================
  
  if (!isAuthenticated) {
    return (
      <>
        <LoginPage onGoToInvitation={() => setInvitationModalOpen(true)} />
        
        <InvitationModal
          isOpen={invitationModalOpen}
          onClose={() => setInvitationModalOpen(false)}
          onSubmit={handleInvitationSubmit}
          isLight={isLight}
        />
      </>
    );
  }
  
  // ============================================================================
  // Main Authenticated UI
  // ============================================================================
  
  return (
    <div className={cn('flex h-screen max-h-screen min-h-0 flex-col overflow-hidden relative', isLight ? 'bg-white' : 'bg-[#151C24]')}>
      {/* Page Content - Sessions page stays mounted to preserve session cache */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        {/* Sessions Page - Always mounted once visited to preserve LRU session cache */}
        <div 
          key="sessions" 
          className={cn(
            'absolute inset-0 flex flex-col overflow-hidden',
            activePage === 'sessions' && 'animate-fadeIn'
          )}
          style={{ display: activePage === 'sessions' ? 'flex' : 'none' }}
        >
            <SessionsPage
              isLight={isLight}
              sessions={sessions}
              currentSessionId={currentSessionId}
              sessionsLoading={sessionsLoading}
              publicApiKey={COPILOTKIT_PUBLIC_KEY}
              contextMenuMessage={contextMenuMessage}
              isVisible={activePage === 'sessions'}
              onGoHome={navigateToHome}
              onClose={closeSidePanel}
              onOpenAbout={openAbout}
              onGoAdmin={navigateToAdmin}
            />
          </div>
        
        {/* Admin Page - Conditionally rendered (no persistent state to preserve) */}
        {activePage === 'admin' && (
          <div key="admin" className="absolute inset-0 flex flex-col overflow-hidden animate-fadeIn">
            <AdminPage onGoHome={navigateToHome} onGoToSessions={navigateToSessions} initialTab={adminInitialTab} />
          </div>
        )}
        
        {/* Home Page - Conditionally rendered (no persistent state to preserve) */}
        {activePage === 'home' && (
          <div key="home" className="absolute inset-0 flex flex-col overflow-hidden animate-fadeIn">
            <HomePage
              isLight={isLight}
              onGoToSessions={navigateToSessions}
              onGoAdmin={navigateToAdmin}
            />
          </div>
        )}
      </div>
      
      {/* About Modal */}
      <AboutModal
        isOpen={aboutOpen}
        onClose={() => setAboutOpen(false)}
        isLight={isLight}
      />
    </div>
  );
};

export default withErrorBoundary(SidePanel, ErrorDisplay);
