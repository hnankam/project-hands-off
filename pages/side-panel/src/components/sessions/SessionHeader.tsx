/**
 * SessionHeader Component
 * 
 * Renders the header for the Chats page with chat tabs, actions dropdown, and navigation.
 */

import * as React from 'react';
import {
  cn,
  Button,
  SessionTabs,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownAccordion,
} from '@extension/ui';
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
  onSaveMessages: () => void;
  onLoadMessages: () => void;
  onClearAllMessages: () => void;
  onClearAllSessions: () => void;
  onExportAsMarkdown: () => void;
  onExportAsHTML: () => void;
  onCopySessionId: (e: React.MouseEvent) => void;
  onOpenAbout: () => void;
  onClose: () => void;
  onGoHome: () => void;
  onGoAdmin?: (tab?: 'organizations' | 'teams' | 'users' | 'providers' | 'models' | 'agents') => void;
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
  onSaveMessages,
  onLoadMessages,
  onClearAllMessages,
  onClearAllSessions,
  onExportAsMarkdown,
  onExportAsHTML,
  onCopySessionId,
  onOpenAbout,
  onClose,
  onGoHome,
  onGoAdmin,
}) => {
  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-center justify-between border-b px-2 py-[0.4em]',
        isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
      )}>
      <div className="mr-2 flex min-w-0 flex-1 items-center overflow-hidden">
        <SessionTabs isLight={isLight} viewMode={viewMode} isVisible={isVisible} apiBaseUrl={apiBaseUrl} className="flex-1" />
      </div>

      <div className="flex flex-shrink-0 items-center space-x-1">
        {/* Add New Session Button */}
        <button
          onClick={onNewSession}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded transition-colors',
            isLight
              ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
          )}
          title="Add new chat">
          <svg
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round">
            <path d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {/* More Options Dropdown */}
        <DropdownMenu
          align="right"
          isLight={isLight}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 p-0',
                isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
              )}>
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </Button>
          }>
          <DropdownMenuItem 
            onClick={onResetSession}
            disabled={!currentSessionId || sessionMessageCount === 0}
            isLight={isLight}
          >
            Reset Chat
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSaveMessages} isLight={isLight}>Save Messages</DropdownMenuItem>
          <DropdownMenuItem onClick={onLoadMessages} isLight={isLight}>Load Messages</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onCloseSession} shortcut="⌘ C" isLight={isLight}>
            Close Chat
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onClearAllMessages} isLight={isLight}>Clear All Chat Messages</DropdownMenuItem>
          <DropdownMenuItem onClick={onClearAllSessions} isLight={isLight}>Clear All Chats</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownAccordion label="Export Chat" isLight={isLight}>
            <DropdownMenuItem
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExportAsMarkdown(); }}
              isLight={isLight}
            >
              Export as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExportAsHTML(); }}
              isLight={isLight}
            >
              Export as HTML
            </DropdownMenuItem>
          </DropdownAccordion>
          <DropdownMenuItem 
            onClick={onCopySessionId}
            isLight={isLight}
            className={cn(
              'transition-all duration-200',
              copiedSessionId && (isLight ? 'bg-green-50' : 'bg-green-900/20')
            )}
          >
            <div className="flex items-center gap-2 w-full">
              {copiedSessionId ? (
                <svg
                  className={cn(
                    'h-3 w-3 flex-shrink-0 transition-all duration-200',
                    isLight ? 'text-green-600' : 'text-green-400'
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ animation: 'scale-in 0.2s ease-out' }}>
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg
                  className={cn('h-3 w-3 flex-shrink-0 opacity-60', isLight ? 'text-gray-500' : 'text-gray-400')}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
              <span className={cn(
                'flex-1 transition-colors duration-200',
                copiedSessionId && (isLight ? 'text-green-700' : 'text-green-400')
              )}>
                {copiedSessionId ? 'Session ID Copied!' : 'Copy Session ID'}
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem isLight={isLight}>Chat Settings</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenAbout} isLight={isLight}>About Project Hands-Off</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onClose} isLight={isLight}>Close Panel</DropdownMenuItem>
        </DropdownMenu>

        {/* View Options Menu - Open in Popup/New Tab */}
        <ViewOptionsMenu
          isLight={isLight}
          currentSessionId={currentSessionId}
        />

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

