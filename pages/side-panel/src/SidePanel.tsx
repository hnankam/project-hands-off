/**
 * @fileoverview Main Side Panel Component
 *
 * Root component for the side panel interface.
 * Manages authentication, routing, theming, and top-level state.
 *
 * Features:
 * - Multi-page navigation (Home, Chats, Admin)
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
import { FEATURES } from '@extension/platform';
import { useStorage, useSessionStorageDB, withErrorBoundary } from '@extension/shared';
import { themeStorage, apiConfigStorage } from '@extension/storage';
import { cn, ErrorDisplay } from '@extension/ui';
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
import { useNavigationManager, LOGIN_HASH_ROUTE } from './hooks/useNavigationManager';
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
  const handlePageChange = useCallback(
    (page: 'sessions') => {
      if (page === 'sessions') {
        navigateToSessions();
      }
    },
    [navigateToSessions],
  );

  // Session URL synchronization
  useSessionUrlSync({
    sessions,
    currentSessionId,
    activePage,
    onPageChange: handlePageChange,
    sessionsLoading,
    enabled: isAuthenticated,
  });

  // Canonical URL for sign-in: `/?…#/login` (hash routes). Fixes `/home?sessionId=…` style URLs.
  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) return;
    if (invitationId || resetPasswordToken || oauthProvider || ssoEmail) return;

    const hash = window.location.hash;
    if (
      hash.startsWith('#/accept-invitation') ||
      hash.startsWith('#/reset-password') ||
      hash.startsWith('#/oauth/') ||
      hash.startsWith('#/sso')
    ) {
      return;
    }

    const url = new URL(window.location.href);
    url.hash = LOGIN_HASH_ROUTE;
    url.searchParams.delete('sessionId');

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const path = url.pathname.replace(/\/$/, '') || '/';
      if (['/home', '/sessions', '/admin'].includes(path)) {
        url.pathname = '/';
      }
    }

    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== next) {
      window.history.replaceState({}, document.title, next);
    }
  }, [authLoading, isAuthenticated, invitationId, resetPasswordToken, oauthProvider, ssoEmail]);

  // After sign-in, leave `#/login` for the restored in-app route
  useEffect(() => {
    if (authLoading || !isAuthenticated || !isPageRestored) return;
    if (invitationId || resetPasswordToken || oauthProvider || ssoEmail) return;
    if (window.location.hash !== LOGIN_HASH_ROUTE) return;

    if (activePage === 'home') navigateToHome();
    else if (activePage === 'admin') navigateToAdmin(adminInitialTab);
    else navigateToSessions();
  }, [
    authLoading,
    isAuthenticated,
    isPageRestored,
    activePage,
    adminInitialTab,
    invitationId,
    resetPasswordToken,
    oauthProvider,
    ssoEmail,
    navigateToHome,
    navigateToSessions,
    navigateToAdmin,
  ]);

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
    if (FEATURES.extensionMessaging()) {
      chrome.runtime.sendMessage({ action: 'sidePanelClosed' });
      window.close();
    } else {
      navigateToSessions();
    }
  }, [navigateToSessions]);

  const openAbout = useCallback(() => {
    setAboutOpen(true);
  }, []);

  const handleInvitationSubmit = useCallback(
    (trimmedId: string) => {
      setInvitationId(trimmedId);
      window.location.hash = `#/accept-invitation/${trimmedId}`;
    },
    [setInvitationId],
  );

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
      <div
        className={cn(
          'flex h-screen w-full max-w-full min-w-0 items-center justify-center',
          isLight ? 'bg-white' : 'bg-[#0D1117]',
        )}>
        <div className="p-4 text-center">
          <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">Database Initialization Failed</h3>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{dbWorkerError.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            Reload Extension
          </button>
        </div>
      </div>
    );
  }

  // Show loading while checking authentication OR DB initialization
  if (authLoading || !dbWorkerReady) {
    return (
      <div className={cn('h-screen w-full max-w-full min-w-0', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
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
        onError={error => {
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
        onError={error => {
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
    return <AcceptInvitationPage invitationId={invitationId} onSuccess={handleInvitationSuccess} />;
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
    <div
      className={cn(
        'relative flex h-screen max-h-screen min-h-0 w-full max-w-full min-w-0 flex-col overflow-hidden',
        isLight ? 'bg-white' : 'bg-[#151C24]',
      )}>
      {/* Page Content - Chats page stays mounted to preserve session cache */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Chats Page - Always mounted once visited to preserve LRU session cache */}
        <div
          key="sessions"
          className={cn(
            'absolute inset-0 flex flex-col overflow-hidden',
            activePage === 'sessions' && 'animate-fadeIn',
          )}
          style={{ display: activePage === 'sessions' ? 'flex' : 'none' }}>
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
          <div key="admin" className="animate-fadeIn absolute inset-0 flex flex-col overflow-hidden">
            <AdminPage onGoHome={navigateToHome} onGoToSessions={navigateToSessions} initialTab={adminInitialTab} />
          </div>
        )}

        {/* Home Page - Conditionally rendered (no persistent state to preserve) */}
        {activePage === 'home' && (
          <div key="home" className="animate-fadeIn absolute inset-0 flex flex-col overflow-hidden">
            <HomePage isLight={isLight} onGoToSessions={navigateToSessions} onGoAdmin={navigateToAdmin} />
          </div>
        )}
      </div>

      {/* About Modal */}
      <AboutModal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} isLight={isLight} />
    </div>
  );
};

export default withErrorBoundary(SidePanel, ErrorDisplay);
