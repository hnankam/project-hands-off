import '@src/SidePanel.css';
import '@copilotkit/react-ui/styles.css';
import { t } from '@extension/i18n';
import { PROJECT_URL_OBJECT, useStorage, withErrorBoundary, withSuspense, generateSessionName } from '@extension/shared';
import { exampleThemeStorage, sessionStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, Button, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, SessionList, SessionTabs } from '@extension/ui';
import { ChatSessionContainer } from './components/ChatSessionContainer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ChatSkeleton } from './components/LoadingStates';
import { useEffect, useState } from 'react';
import { CopilotKit } from '@copilotkit/react-core';

const SidePanel = () => {
  const { isLight, theme } = useStorage(exampleThemeStorage);
  const { sessions, currentSessionId } = useStorage(sessionStorage);

  const goGithubSite = () => chrome.tabs.create(PROJECT_URL_OBJECT);

  const closeSidePanel = () => {
    // Send message to popup to update its state
    chrome.runtime.sendMessage({ action: 'sidePanelClosed' });
    // Close the side panel by navigating away or using window.close()
    window.close();
  };

  const handleNewSession = () => {
    sessionStorage.addSession(generateSessionName());
  };

  // Initialize with a default session if none exist
  useEffect(() => {
    if (sessions.length === 0) {
      sessionStorage.addSession(generateSessionName());
    }
    // Set initial loading to false after sessions are loaded
    setIsInitialLoading(false);
  }, [sessions.length]);

  const handleClearAllSessions = () => {
    sessions.forEach(session => {
      sessionStorage.deleteSession(session.id);
    });
  };

  const handleExportSessions = () => {
    const dataStr = JSON.stringify(sessions, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sessions.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  // CopilotKit configuration
  const copilotKitConfig = {
    publicApiKey: "ck_pub_c94e406d9327510d0463f3dbe3c1f2e8",
    // Add other configuration options as needed
  };

  // Loading state for initial render
  const [isInitialLoading, setIsInitialLoading] = useState(true);

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

  // Listen for close messages from popup
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.action === 'closeSidePanel') {
        window.close();
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

  return (
    <div className={cn('h-screen flex flex-col overflow-hidden', isLight ? 'bg-white' : 'bg-[#151C24]')}>
        {/* Top Navigation Bar */}
        <div className={cn(
          'flex items-center justify-between px-3 py-2 border-b flex-shrink-0',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]'
        )}>
          <div className="flex items-center flex-1 min-w-0 mr-2 overflow-hidden">
            <SessionTabs isLight={isLight} className="flex-1" />
          </div>
          
          <div className="flex items-center space-x-1 flex-shrink-0">
            {/* Add New Session Button */}
            <button
              onClick={handleNewSession}
              className={cn(
                "flex items-center justify-center h-6 w-6 rounded transition-colors",
                isLight 
                  ? "text-gray-500 hover:text-gray-700 hover:bg-gray-100" 
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
              )}
              title="Add new session"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {/* History/Refresh Button */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-6 w-6 p-0',
                isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800'
              )}
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </Button>

            {/* More Options Dropdown */}
            <DropdownMenu
              align="right"
              isLight={isLight}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-6 w-6 p-0',
                    isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800'
                  )}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </Button>
              }
            >
              <DropdownMenuItem onClick={closeSidePanel} shortcut="⌘ W">
                Close Session
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleClearAllSessions}>
                Clear All Sessions
              </DropdownMenuItem>
              <DropdownMenuItem>
                Close Other Sessions
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                Open Session as Editor
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportSessions}>
                Export Sessions
              </DropdownMenuItem>
              <DropdownMenuItem>
                Copy Session ID
              </DropdownMenuItem>
              <DropdownMenuItem>
                Give Feedback
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                Session Settings
              </DropdownMenuItem>
            </DropdownMenu>
          </div>
        </div>

        {/* Chat Session Components - Render all but show only current */}
        {/* Note: All sessions remain mounted to preserve chat state and interactions */}
        {/* Using absolute positioning instead of display:none to avoid CopilotKit input issues */}
        <div className="flex-1 relative overflow-hidden">
          {isInitialLoading ? (
            <ChatSkeleton />
          ) : sessions.length > 0 ? (
            sessions.map(session => (
              <div 
                key={session.id}
                className="absolute inset-0 flex flex-col overflow-hidden"
                style={{
                  visibility: session.id === currentSessionId ? 'visible' : 'hidden',
                  zIndex: session.id === currentSessionId ? 1 : 0
                }}
              >
                <ErrorBoundary level="component" fallback={
                  <div className="flex-1 flex items-center justify-center p-4">
                    <div className="text-center">
                      <p className="text-red-600 dark:text-red-400 mb-2">Session Error</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        This session encountered an error. Try switching to another session.
                      </p>
                    </div>
                  </div>
                }>
                  <ChatSessionContainer 
                    sessionId={session.id} 
                    isLight={isLight} 
                    publicApiKey={copilotKitConfig.publicApiKey}
                    isActive={session.id === currentSessionId}
                  />
                </ErrorBoundary>
              </div>
            ))
          ) : (
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <div className="text-center text-gray-500 dark:text-gray-400">
                <p>No active session</p>
                <p className="text-sm">Create a new session to start chatting</p>
              </div>
            </div>
          )}
        </div>

        {/* Session List - Fixed at bottom */}
        <div className={cn(
          'border-t p-2 flex-shrink-0',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]'
        )}>
          <SessionList isLight={isLight} />
        </div>
      </div>
  );
};

export default withErrorBoundary(withSuspense(SidePanel, <LoadingSpinner />), ErrorDisplay);
