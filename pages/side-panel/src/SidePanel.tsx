import './SidePanel.css';
import '@copilotkit/react-ui/styles.css';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  PROJECT_URL_OBJECT,
  useStorage,
  useSessionStorageDB,
  withErrorBoundary,
  sessionStorageDBWrapper,
} from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import {
  cn,
  ErrorDisplay,
} from '@extension/ui';
import { HomePage } from './pages/HomePage';
import { SessionsPage } from './pages/SessionsPage';
import { AdminPage } from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import { useAuth } from './context/AuthContext';
import { useDBWorkerClient } from './hooks/useDBWorkerClient';
import { ChatSkeleton } from './components/LoadingStates';
import { getCurrentViewMode, getSessionIdFromUrl } from './utils/windowManager';

const SidePanel = () => {
  // Authentication
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();

  // Initialize DB worker client (required for embeddings storage)
  const { isReady: dbWorkerReady, error: dbWorkerError } = useDBWorkerClient();

  // Defensive check for React
  if (typeof React === 'undefined' || !React || !React.useState) {
    console.error('[SidePanel] React is not properly loaded!', { React, hasUseState: !!(React as any)?.useState });
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h3>Critical Error: React not loaded</h3>
        <p>Please reload the extension.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  const { isLight, theme } = useStorage(exampleThemeStorage);
  const { sessions, currentSessionId, isLoading: sessionsLoading } = useSessionStorageDB();

  // Debug: Log state to understand what's blocking
  useEffect(() => {
    console.log('[SidePanel] State:', { 
      authLoading, 
      dbWorkerReady, 
      dbWorkerError: dbWorkerError?.message,
      sessionsCount: sessions.length,
      currentSessionId,
      isAuthenticated
    });
  }, [authLoading, dbWorkerReady, dbWorkerError, sessions.length, currentSessionId, isAuthenticated]);

  // Simple in-panel navigation between Home, Sessions, and Admin
  const [activePage, setActivePage] = useState<'home' | 'sessions' | 'admin'>('sessions');
  const [adminInitialTab, setAdminInitialTab] = useState<'organizations' | 'teams' | 'users' | 'providers' | 'models' | 'agents' | 'usage'>('organizations');
  const [isPageRestored, setIsPageRestored] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutText, setAboutText] = useState('');
  const [contextMenuMessage, setContextMenuMessage] = useState<string | null>(null);
  
  // Invitation handling
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [invitationModalOpen, setInvitationModalOpen] = useState(false);
  const [invitationIdInput, setInvitationIdInput] = useState('');
  const [invitationValidationError, setInvitationValidationError] = useState<string | null>(null);
  const [isValidatingInvitation, setIsValidatingInvitation] = useState(false);

  // CopilotKit configuration
  const copilotKitConfig = {
    publicApiKey: 'ck_pub_c94e406d9327510d0463f3dbe3c1f2e8',
  };

  // Navigation handlers that update both state and hash
  const navigateToHome = useCallback(() => {
    setActivePage('home');
    window.location.hash = '#/home';
  }, []);

  const navigateToSessions = useCallback(() => {
    setActivePage('sessions');
    window.location.hash = '#/sessions';
  }, []);

  const navigateToAdmin = useCallback((tab: 'organizations' | 'teams' | 'users' | 'providers' | 'models' | 'agents' | 'usage' = 'organizations') => {
    setAdminInitialTab(tab);
    setActivePage('admin');
    window.location.hash = '#/admin';
  }, []);

  const navigateToInvitation = useCallback(() => {
    // Reset error state and open modal to get invitation ID
    setInvitationValidationError(null);
    setInvitationModalOpen(true);
  }, []);

  const handleInvitationSubmit = useCallback(async () => {
    if (!invitationIdInput || !invitationIdInput.trim()) return;

    const trimmedId = invitationIdInput.trim();

    // Validate invitation ID
    setIsValidatingInvitation(true);
    setInvitationValidationError(null);

    try {
      // Validate invitation by fetching it
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/invitations/${trimmedId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invitation not found');
      }

      // Invitation is valid, proceed to the page
      setInvitationId(trimmedId);
      window.location.hash = `#/accept-invitation/${trimmedId}`;
      setInvitationModalOpen(false);
      setInvitationIdInput('');
    } catch (err: any) {
      setInvitationValidationError(err.message || 'Failed to validate invitation');
    } finally {
      setIsValidatingInvitation(false);
    }
  }, [invitationIdInput]);

  const closeSidePanel = () => {
    // Send message to popup to update its state
    chrome.runtime.sendMessage({ action: 'sidePanelClosed' });
    // Close the side panel by navigating away or using window.close()
    window.close();
  };

  const openAbout = useCallback(() => {
    try {
      const manifest = chrome.runtime?.getManifest?.();
      const name = manifest?.name || 'Project Hands-Off';
      const version = manifest?.version || 'unknown';
      const ua = navigator.userAgent;
      const chromeMatch = ua.match(/Chrom[e|ium]\/(\d+\.\d+\.\d+\.\d+|\d+\.\d+\.\d+|\d+\.\d+)/);
      const chromium = chromeMatch ? chromeMatch[1] : 'unknown';
      const os = (navigator as any).userAgentData?.platform || navigator.platform || 'unknown';
      const text = `${name}\nVersion: ${version}\nChromium: ${chromium}\nOS: ${os}`;
      setAboutText(text);
    } catch (e) {
      setAboutText('Project Hands-Off\nVersion: unknown');
    }
    setAboutOpen(true);
  }, []);

  // Restore last visited page on mount (unless there's a hash in URL)
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
          setActivePage(result.lastVisitedPage as 'home' | 'sessions' | 'admin');
        }
      } catch (error) {
        console.error('[SidePanel] Failed to restore last page:', error);
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
      console.error('[SidePanel] Failed to save last page:', error);
    });
  }, [activePage, isPageRestored]);

  // Check for invitation in URL hash and handle routing
  useEffect(() => {
    if (!isPageRestored) return; // Wait for page restoration before checking hash

    const checkHash = () => {
      const hash = window.location.hash;
      
      // Check for #/accept-invitation/{invitationId} or #accept-invitation/{invitationId}
      const invitationMatch = hash.match(/accept-invitation\/([a-zA-Z0-9_-]+)/);
      if (invitationMatch) {
        setInvitationId(invitationMatch[1]);
        return;
      }
      
      // Check for #/admin or #admin
      if (hash.includes('admin')) {
        setActivePage('admin');
        return;
      }
      
      // Check for #/sessions or #sessions
      if (hash.includes('sessions')) {
        setActivePage('sessions');
        return;
      }
      
      // Check for #/home or #home
      if (hash.includes('home')) {
        setActivePage('home');
        return;
      }
    };

    checkHash();

    // Listen for hash changes
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [isPageRestored]);

  // Handle session ID from URL (for new tab and popup contexts)
  // Only apply URL session ID once on mount, don't override manual tab switches
  const urlSessionIdAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    const viewMode = getCurrentViewMode();
    const urlSessionId = getSessionIdFromUrl();
    
    console.log('[SidePanel] View mode detection:', { viewMode, urlSessionId, currentSessionId });
    
    // Only apply URL session ID if:
    // 1. We're in a new tab or popup context
    // 2. URL has a session ID
    // 3. We haven't already applied this URL session ID (to prevent overriding manual switches)
    // 4. Sessions are loaded
    if ((viewMode === 'newtab' || viewMode === 'popup') && urlSessionId && sessions.length > 0) {
      // Check if we've already applied this URL session ID
      if (urlSessionIdAppliedRef.current === urlSessionId) {
        // Already applied, don't override manual tab switches
        return;
      }
      
      // Check if the session exists
      const sessionExists = sessions.some(s => s.id === urlSessionId);
      
      if (sessionExists) {
        // Only apply if current session doesn't match (initial load scenario)
        if (urlSessionId !== currentSessionId) {
          console.log('[SidePanel] Setting active session from URL (initial load):', urlSessionId);
          
          // Switch to the specified session
          sessionStorageDBWrapper.setActiveSession(urlSessionId).catch(err => {
            console.error('[SidePanel] Failed to set active session from URL:', err);
          });
          
          // Mark this URL session ID as applied
          urlSessionIdAppliedRef.current = urlSessionId;
          
          // Ensure we're on the sessions page
          if (activePage !== 'sessions') {
            setActivePage('sessions');
            window.location.hash = '#/sessions';
          }
        } else {
          // Current session already matches URL, mark as applied
          urlSessionIdAppliedRef.current = urlSessionId;
        }
      } else {
        console.warn('[SidePanel] Session ID from URL not found:', urlSessionId);
      }
    }
  }, [sessions, currentSessionId, activePage]);

  // Apply dark mode class to document element for proper CopilotKit theming
  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, [isLight]);

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      // Re-evaluate system theme
      exampleThemeStorage.setTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Listen for close messages from popup and context menu actions
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.action === 'closeSidePanel') {
        window.close();
      } else if (message.type === 'CONTEXT_MENU_ACTION') {
        // Set the message to be sent to the active chat session
        setContextMenuMessage(message.message);
        // Clear after a short delay to allow the message to be processed
        setTimeout(() => setContextMenuMessage(null), 1000);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // Broadcast panel closing event to all sessions for auto-save
  useEffect(() => {
    const broadcastClosing = () => {
      window.dispatchEvent(new CustomEvent('panelClosing'));
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        broadcastClosing();
      }
    };

    window.addEventListener('beforeunload', broadcastClosing);
    window.addEventListener('pagehide', broadcastClosing);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      broadcastClosing();
      window.removeEventListener('beforeunload', broadcastClosing);
      window.removeEventListener('pagehide', broadcastClosing);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Close about modal on escape key
  useEffect(() => {
    if (!aboutOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (aboutOpen) setAboutOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [aboutOpen]);

  // Show error if DB worker failed
  if (dbWorkerError) {
    return (
      <div className={cn('h-screen flex items-center justify-center', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
        <div className="text-center p-4">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Database Initialization Failed</h3>
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

  // Show accept invitation page if there's an invitation ID (even if authenticated)
  if (invitationId) {
    return (
      <AcceptInvitationPage
        invitationId={invitationId}
        onSuccess={() => {
          // Clear invitation ID
          setInvitationId(null);
          
          // If authenticated (after accepting), redirect to admin and reload
          // If not authenticated (after declining), just return to login
          if (isAuthenticated) {
            window.location.hash = '#/admin';
            window.location.reload();
          } else {
            // Just clearing invitationId will show the login page
            window.location.hash = '';
          }
        }}
      />
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        <LoginPage onGoToInvitation={navigateToInvitation} />
        
        {/* Invitation ID Modal */}
        <>
        {/* Backdrop */}
        {invitationModalOpen && (
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setInvitationModalOpen(false);
              setInvitationIdInput('');
              setInvitationValidationError(null);
            }}
          />
        )}

          {/* Modal */}
          <div
            className={cn(
              'fixed inset-0 z-[10001] flex items-center justify-center p-4 transition-opacity',
              invitationModalOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            )}
          >
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-4 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Enter Invitation ID
                </h2>
                <button
                  onClick={() => {
                    setInvitationModalOpen(false);
                    setInvitationIdInput('');
                    setInvitationValidationError(null);
                  }}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}>
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="space-y-3 px-4 py-4">
                {invitationValidationError && (
                  <div
                    className={cn(
                      'flex items-start gap-3 rounded-md px-3 py-2.5 text-xs',
                      isLight ? 'bg-red-50 text-red-700' : 'bg-red-900/20 text-red-300',
                    )}>
                    <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.5a.75.75 0 10-1.5 0v4a.75.75 0 001.5 0v-4zm0 6.5a.75.75 0 10-1.5 0 .75.75 0 001.5 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div className="flex-1">
                      <p>{invitationValidationError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInvitationValidationError(null)}
                      className={cn(
                        'rounded-md p-0.5 transition-colors',
                        isLight ? 'text-red-500 hover:bg-red-100' : 'text-red-300 hover:bg-red-900/30',
                      )}
                      aria-label="Dismiss error">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
                
                <div className="space-y-1">
                  <label
                    htmlFor="invitationId"
                    className={cn(
                      'block text-xs font-medium',
                      isLight ? 'text-gray-700' : 'text-gray-300',
                    )}>
                    Invitation ID
                  </label>
                  <input
                    id="invitationId"
                    type="text"
                    value={invitationIdInput}
                    onChange={(e) => setInvitationIdInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && invitationIdInput.trim() && !isValidatingInvitation) {
                        handleInvitationSubmit();
                      }
                    }}
                    placeholder="Enter invitation ID"
                    autoFocus
                    disabled={isValidatingInvitation}
                    className={cn(
                      'w-full px-2.5 py-1.5 text-sm border rounded-md outline-none focus:ring-1 focus:ring-blue-500 transition-colors',
                      isLight ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400' : 'bg-[#151C24] border-gray-600 text-white placeholder:text-gray-500',
                      isValidatingInvitation && 'opacity-60 cursor-not-allowed',
                    )}
                  />
                  <p className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    Enter the invitation ID you received to join an organization
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 border-t px-4 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <button
                  onClick={() => {
                    setInvitationModalOpen(false);
                    setInvitationIdInput('');
                    setInvitationValidationError(null);
                  }}
                  disabled={isValidatingInvitation}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight
                      ? 'bg-gray-200 hover:bg-gray-300'
                      : 'bg-gray-700 hover:bg-gray-600',
                    isValidatingInvitation && 'opacity-50 cursor-not-allowed',
                  )}
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleInvitationSubmit}
                  disabled={!invitationIdInput.trim() || isValidatingInvitation}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-2',
                    'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed',
                  )}>
                  {isValidatingInvitation && (
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  )}
                  {isValidatingInvitation ? 'Validating...' : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        </>
      </>
    );
  }

  return (
    <div className={cn('flex h-screen max-h-screen min-h-0 flex-col overflow-hidden relative', isLight ? 'bg-white' : 'bg-[#151C24]')}>
      {/* Page Content with smooth transitions */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        {activePage === 'sessions' && (
          <div key="sessions" className="flex-1 min-h-0 flex flex-col overflow-hidden animate-fadeIn">
            <SessionsPage
              isLight={isLight}
              sessions={sessions}
              currentSessionId={currentSessionId}
              sessionsLoading={sessionsLoading}
              publicApiKey={copilotKitConfig.publicApiKey}
              contextMenuMessage={contextMenuMessage}
              onGoHome={navigateToHome}
              onClose={closeSidePanel}
              onOpenAbout={openAbout}
              onGoAdmin={navigateToAdmin}
            />
          </div>
        )}
        {activePage === 'admin' && (
          <div key="admin" className="flex-1 min-h-0 flex flex-col overflow-hidden animate-fadeIn">
            <AdminPage onGoHome={navigateToHome} onGoToSessions={navigateToSessions} initialTab={adminInitialTab} />
          </div>
        )}
        {activePage === 'home' && (
          <div key="home" className="flex-1 min-h-0 flex flex-col overflow-hidden animate-fadeIn">
            <HomePage
              isLight={isLight}
              onGoToSessions={navigateToSessions}
              onGoAdmin={navigateToAdmin}
            />
          </div>
        )}
      </div>

      {/* About Modal */}
      {aboutOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm" onClick={() => setAboutOpen(false)} />

          {/* Modal */}
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-xs rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}></h2>
                <button
                  onClick={() => setAboutOpen(false)}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}>
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="space-y-3 px-3 py-5 text-center">
                <div className="flex items-center justify-center">
                  <img src={'/icon-128.png'} alt="Project Hands-Off" className="h-12 w-12" />
                </div>
                <div>
                  <pre
                    className={cn(
                      'whitespace-pre-wrap break-words text-xs',
                      isLight ? 'text-gray-800' : 'text-gray-200',
                    )}>
                    {aboutText}
                  </pre>
                  <div className="mt-2">
                    <a
                      href={PROJECT_URL_OBJECT.url}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        'break-all text-xs underline',
                        isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300',
                      )}>
                      {PROJECT_URL_OBJECT.url}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Removed withSuspense because we handle loading states internally
// The useSessionStorageDB hook now uses proper loading states instead of React Suspense
export default withErrorBoundary(SidePanel, ErrorDisplay);
