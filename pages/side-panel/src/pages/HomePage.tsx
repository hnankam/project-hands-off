import React, { useState } from 'react';
import { cn } from '@extension/ui';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import UserMenu from '../components/UserMenu';
import { useAuth } from '../context/AuthContext';

interface HomePageProps {
  isLight: boolean;
  onGoToSessions: () => void;
  onGoAdmin?: (tab?: 'organizations' | 'teams' | 'users' | 'providers' | 'models' | 'agents') => void;
}

// Simple settings button component with upward-opening dropdown
const SettingsButton: React.FC<{ isLight: boolean; theme: string; onOpenSettings: () => void }> = ({ isLight, theme, onOpenSettings }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'p-1 rounded transition-colors',
          isLight
            ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
        )}
        title="Settings">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute bottom-full right-0 mb-1 w-64 rounded-md border shadow-lg z-[9999]',
            isLight
              ? 'bg-gray-50 border-gray-200'
              : 'bg-[#151C24] border-gray-700'
          )}
        >
          {/* Theme Selection */}
          <div
            className={cn(
              'px-3 py-2.5 border-b',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}
          >
            <label
              className={cn(
                'text-xs font-medium block mb-2',
                isLight ? 'text-gray-900' : 'text-gray-100'
              )}
            >
              Theme
            </label>
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  exampleThemeStorage.setTheme('light');
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                  theme === 'light'
                    ? 'bg-blue-500 text-white'
                    : isLight
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                )}
                title="Light theme"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Light</span>
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  exampleThemeStorage.setTheme('dark');
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                  theme === 'dark'
                    ? 'bg-blue-500 text-white'
                    : isLight
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                )}
                title="Dark theme"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span>Dark</span>
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  exampleThemeStorage.setTheme('system');
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                  theme === 'system'
                    ? 'bg-blue-500 text-white'
                    : isLight
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                )}
                title="System theme"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>System</span>
              </button>
            </div>
          </div>

          {/* Divider */}
          <div
            className={cn(
              'border-t',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}
          />

          {/* More Settings Button */}
          <button
            onClick={() => {
              setIsOpen(false);
              onOpenSettings();
            }}
            className={cn(
              'w-full px-3 py-2 text-xs font-medium text-left transition-colors flex items-center gap-2',
              isLight
                ? 'text-gray-700 hover:bg-gray-100'
                : 'text-gray-200 hover:bg-gray-700/50'
            )}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span>More Settings</span>
          </button>
        </div>
      )}
    </div>
  );
};

export const HomePage: React.FC<HomePageProps> = ({ isLight, onGoToSessions, onGoAdmin }) => {
  const { theme } = useStorage(exampleThemeStorage);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const version = chrome.runtime?.getManifest?.()?.version || '1.0.0';
  const { organization, activeTeam } = useAuth();
  const canAccessSessions = !!(organization && activeTeam);

  return (
    <>
      {/* Home Page Header */}
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between border-b px-2 py-[0.4em]',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <div className="mr-2 flex min-w-0 flex-1 items-center overflow-hidden">
          <div className={cn('flex-1 truncate px-1 text-sm font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Home
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* User Menu with Organization and Team Selectors */}
          <UserMenu
            isLight={isLight}
            onGoAdmin={(tab) => onGoAdmin?.(tab)}
            onGoToSessions={onGoToSessions}
          />
        </div>
      </div>

      {/* Home Page Content */}
      <div className={cn('flex flex-1 items-center justify-center', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
        <div className="text-center">
          <p className={cn('mb-4 text-sm', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Welcome to Project Hands-Off
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                if (!canAccessSessions) return;
                onGoToSessions();
              }}
              disabled={!canAccessSessions}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                canAccessSessions
                  ? isLight ? 'bg-gray-800 text-white hover:bg-gray-900' : 'bg-gray-200 text-gray-900 hover:bg-white'
                  : isLight ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              )}>
              Go to Sessions{!canAccessSessions && ' (Select org & team)'}
            </button>
            {onGoAdmin && (
              <button
                onClick={() => onGoAdmin('organizations')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  isLight
                    ? 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    : 'bg-gray-800 text-gray-100 hover:bg-gray-700',
                )}>
                Go to Admin
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer Bar with Settings */}
      <div
        className={cn(
          'flex-shrink-0 border-t',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <div className="flex items-center justify-between px-4 py-1.5">
          <div className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            v {version}
          </div>
          <SettingsButton isLight={isLight} theme={theme} onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setSettingsOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Preferences
                </h2>
                <button
                  onClick={() => setSettingsOpen(false)}
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
            <div className="px-3 py-2.5">
              <label
                className={cn(
                  'text-xs font-medium block mb-2',
                  isLight ? 'text-gray-900' : 'text-gray-100'
                )}
              >
                Theme
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => exampleThemeStorage.setTheme('light')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'light'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  )}
                  title="Light theme"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span>Light</span>
                </button>
                
                <button
                  onClick={() => exampleThemeStorage.setTheme('dark')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'dark'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  )}
                  title="Dark theme"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  <span>Dark</span>
                </button>
                
                <button
                  onClick={() => exampleThemeStorage.setTheme('system')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'system'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  )}
                  title="System theme"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>System</span>
                </button>
              </div>
            </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 border-t px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    isLight
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-500 text-white hover:bg-blue-600',
                  )}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

