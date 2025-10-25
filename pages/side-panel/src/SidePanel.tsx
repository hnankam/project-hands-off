import '@src/SidePanel.css';
import '@copilotkit/react-ui/styles.css';
import React, { useEffect, useState, useCallback } from 'react';
import {
  PROJECT_URL_OBJECT,
  useStorage,
  withErrorBoundary,
  withSuspense,
} from '@extension/shared';
import { exampleThemeStorage, sessionStorage } from '@extension/storage';
import {
  cn,
  ErrorDisplay,
  LoadingSpinner,
} from '@extension/ui';
import { HomePage } from './pages/HomePage';
import { SessionsPage } from './pages/SessionsPage';

const SidePanel = () => {
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
  const { sessions, currentSessionId } = useStorage(sessionStorage);

  // Simple in-panel navigation between Home and Sessions
  const [activePage, setActivePage] = useState<'home' | 'sessions'>('sessions');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutText, setAboutText] = useState('');
  const [contextMenuMessage, setContextMenuMessage] = useState<string | null>(null);

  // CopilotKit configuration
  const copilotKitConfig = {
    publicApiKey: 'ck_pub_c94e406d9327510d0463f3dbe3c1f2e8',
  };

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

  return (
    <div className={cn('flex h-screen flex-col overflow-hidden', isLight ? 'bg-white' : 'bg-[#151C24]')}>
      {/* Page Content */}
      {activePage === 'sessions' ? (
        <SessionsPage
          isLight={isLight}
          sessions={sessions}
          currentSessionId={currentSessionId}
          publicApiKey={copilotKitConfig.publicApiKey}
          contextMenuMessage={contextMenuMessage}
          onGoHome={() => setActivePage('home')}
          onClose={closeSidePanel}
          onOpenAbout={openAbout}
        />
      ) : (
        <HomePage isLight={isLight} onGoToSessions={() => setActivePage('sessions')} />
      )}

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

export default withErrorBoundary(withSuspense(SidePanel, <LoadingSpinner />), ErrorDisplay);
