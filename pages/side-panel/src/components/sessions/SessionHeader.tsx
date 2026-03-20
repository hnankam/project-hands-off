/**
 * SessionHeader Component
 * 
 * Renders the header for the Chats page with chat tabs, actions dropdown, and navigation.
 */

import * as React from 'react';
import { cn, Button, SessionTabs } from '@extension/ui';
import UserMenu from '../menus/UserMenu';
import { ViewOptionsMenu } from '../layout/ViewOptionsMenu';

interface SessionHeaderProps {
  isLight: boolean;
  viewMode: 'sidepanel' | 'popup' | 'newtab' | 'fullscreen';
  apiBaseUrl?: string;
  currentSessionId: string | null;
  currentSessionTitle: string;
  sessionMessageCount: number;
  copiedSessionId: boolean;
  isVisible?: boolean;
  // Action handlers
  onNewSession: () => void;
  onCloseSession: () => void;
  onResetSession: () => void;
  onClearAllMessages: () => void;
  onClearAllSessions: () => void;
  onExportAsMarkdown: () => void;
  onExportAsHTML: () => void;
  onCopySessionId: (e: React.MouseEvent) => void;
  onOpenAbout: () => void;
  onOpenSettings?: () => void;
  onClose: () => void;
  onGoHome: () => void;
  onGoAdmin?: (tab?: 'organizations' | 'teams' | 'users' | 'providers' | 'models' | 'agents') => void;
  /** Sessions panel (open chats list) - when provided, shows toggle button */
  sessionsPanelOpen?: boolean;
  onToggleSessionsPanel?: () => void;
  /** Config panel (plans, graphs) - when provided, shows toggle button */
  configPanelOpen?: boolean;
  onToggleConfigPanel?: () => void;
}

export const SessionHeader: React.FC<SessionHeaderProps> = ({
  isLight,
  viewMode,
  apiBaseUrl,
  currentSessionId,
  currentSessionTitle,
  sessionMessageCount,
  copiedSessionId,
  isVisible = true,
  onNewSession,
  onCloseSession,
  onResetSession,
  onClearAllMessages,
  onClearAllSessions,
  onExportAsMarkdown,
  onExportAsHTML,
  onCopySessionId,
  onOpenAbout,
  onOpenSettings,
  onClose,
  onGoHome,
  onGoAdmin,
  sessionsPanelOpen = false,
  onToggleSessionsPanel,
  configPanelOpen = false,
  onToggleConfigPanel,
}) => {
  return (
    <div
      className={cn(
        'relative z-20 flex flex-shrink-0 items-center justify-between border-b px-2 py-[0.4em]',
        isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
      )}>
      {/* Left: Sessions panel toggle (only when provided) */}
      {onToggleSessionsPanel && (
      <div className="flex flex-shrink-0 items-center">
          <button
            onClick={onToggleSessionsPanel}
            className={cn(
              'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded transition-colors',
              viewMode === 'sidepanel' && 'rounded-tl-xl',
              sessionsPanelOpen
                ? isLight
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-gray-700 text-gray-200'
                : isLight
                  ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
            )}
            title={sessionsPanelOpen ? 'Hide open chats' : 'Show open chats'}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
      </div>
      )}

      {/* Center: Session tabs (centered when they don't overflow, like admin tabs) */}
      {!sessionsPanelOpen && (
        <div className="flex flex-1 min-w-0 items-center justify-center overflow-hidden">
          <SessionTabs isLight={isLight} viewMode={viewMode} isVisible={isVisible} apiBaseUrl={apiBaseUrl} className="w-full max-w-full" />
        </div>
      )}

      {/* Spacer when sessions panel is open (keeps right content aligned) */}
      {sessionsPanelOpen && <div className="flex-1 min-w-0" />}

      <div className="flex flex-shrink-0 items-center space-x-1">
        {/* Add New Session Button - hidden when sessions panel is open */}
        {!sessionsPanelOpen && (
        <button
          onClick={onNewSession}
          className={cn(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors',
            isLight
              ? 'text-gray-600 hover:bg-gray-200/70'
              : 'text-gray-400 hover:bg-gray-800/50',
          )}
          title="Add new chat">
          <svg
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round">
            <path d="M12 4v16m8-8H4" />
          </svg>
        </button>
        )}

        {/* View Options Menu - Open in Popup/New Tab */}
        <ViewOptionsMenu
          isLight={isLight}
          currentSessionId={currentSessionId}
        />

        {/* Config Panel Button - Plans, graphs & more (hidden) */}
        {false && onToggleConfigPanel && (
          <button
            onClick={onToggleConfigPanel}
            className={cn(
              'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded transition-colors',
              configPanelOpen
                ? isLight
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-gray-700 text-gray-200'
                : isLight
                  ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
            )}
            title={configPanelOpen ? 'Hide plans & graphs' : 'Show plans & graphs'}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <g transform="translate(-3, 0)">
                <path d="M7 14.18V3a1 1 0 0 0-2 0v11.18a3 3 0 0 0 0 5.64V21a1 1 0 0 0 2 0v-1.18a3 3 0 0 0 0-5.64zM6 18a1 1 0 1 1 1-1 1 1 0 0 1-1 1z" />
              </g>
              <path d="M15 5a3 3 0 1 0-4 2.82V21a1 1 0 0 0 2 0V7.82A3 3 0 0 0 15 5zm-3 1a1 1 0 1 1 1-1 1 1 0 0 1-1 1z" />
              <g transform="translate(3, 0)">
                <path d="M21 13a3 3 0 0 0-2-2.82V3a1 1 0 0 0-2 0v7.18a3 3 0 0 0 0 5.64V21a1 1 0 0 0 2 0v-5.18A3 3 0 0 0 21 13zm-3 1a1 1 0 1 1 1-1 1 1 0 0 1-1 1z" />
              </g>
            </svg>
          </button>
        )}

        {/* Home Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onGoHome}
          title="Home"
          className={cn(
            'h-7 w-7 p-0',
            isLight ? 'text-gray-600 bg-gray-200/70 hover:bg-gray-300/70' : 'text-gray-400 bg-gray-800/50 hover:bg-gray-700/60',
          )}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </Button>

        {/* User Menu with Organization and Team Selectors */}
        <UserMenu isLight={isLight} onGoAdmin={onGoAdmin} />
      </div>
    </div>
  );
};

export default SessionHeader;

