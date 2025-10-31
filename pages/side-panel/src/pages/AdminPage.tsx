/**
 * Admin Page for Organization, Team, and User Management
 * Refactored to use separate tab components
 */

import React, { useState, useEffect } from 'react';
import { authClient } from '../lib/auth-client';
import { useAuth } from '../context/AuthContext';
import { cn, Button, DropdownMenu, DropdownMenuItem } from '@extension/ui';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { OrganizationsTab } from '../components/admin/OrganizationsTab';
import { TeamsTab } from '../components/admin/TeamsTab';
import { UsersTab } from '../components/admin/UsersTab';
import { usePendingInvitations } from '../hooks/usePendingInvitations';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: any;
  createdAt: string | Date;
}

interface AdminPageProps {
  onGoHome?: () => void;
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

export function AdminPage({ onGoHome }: AdminPageProps) {
  const { user, signOut } = useAuth();
  const { isLight, theme } = useStorage(exampleThemeStorage);
  const [activeTab, setActiveTab] = useState<'organizations' | 'teams' | 'users'>('organizations');
  const [selectedOrgForTeams, setSelectedOrgForTeams] = useState('');
  const version = chrome.runtime?.getManifest?.()?.version || '1.0.0';

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [errorVisible, setErrorVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [errorClosing, setErrorClosing] = useState(false);
  const [successClosing, setSuccessClosing] = useState(false);

  // Load organizations for team selector
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // Check for pending invitations
  const { invitations: pendingInvitations, hasPendingInvitations } = usePendingInvitations();
  const [showInvitationBanner, setShowInvitationBanner] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load organizations on mount and when user changes (e.g., after login)
  useEffect(() => {
    if (user) {
      loadOrganizations();
    }
  }, [user]);

  const loadOrganizations = async () => {
    try {
      const { data, error } = await authClient.organization.list();
      if (error) throw new Error(error.message);
      setOrganizations(data || []);
    } catch (err: any) {
      console.error('Error loading organizations:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('[AdminPage] Logout failed:', error);
    }
  };

  // Error auto-dismiss
  useEffect(() => {
    if (!error) return;

    setErrorVisible(true);
    setErrorClosing(false);

    const timer = setTimeout(() => {
      setErrorClosing(true);
      setTimeout(() => {
        setError('');
        setErrorVisible(false);
        setErrorClosing(false);
      }, 300);
    }, 8000);

    return () => clearTimeout(timer);
  }, [error]);

  // Success auto-dismiss
  useEffect(() => {
    if (!success) return;

    setSuccessVisible(true);
    setSuccessClosing(false);

    const timer = setTimeout(() => {
      setSuccessClosing(true);
      setTimeout(() => {
        setSuccess('');
        setSuccessVisible(false);
        setSuccessClosing(false);
      }, 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [success]);

  const handleDismissError = () => {
    setErrorClosing(true);
    setTimeout(() => {
      setError('');
      setErrorVisible(false);
      setErrorClosing(false);
    }, 300);
  };

  const handleDismissSuccess = () => {
    setSuccessClosing(true);
    setTimeout(() => {
      setSuccess('');
      setSuccessVisible(false);
      setSuccessClosing(false);
    }, 300);
  };

  return (
    <div className={cn('flex flex-col h-screen overflow-hidden', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
      {/* Admin Page Header */}
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between px-2 py-[0.4em]',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <div className="flex items-center min-w-0 flex-1">
          <h1 className={cn('text-sm font-semibold truncate', isLight ? 'text-gray-900' : 'text-gray-100')}>
            Administration
          </h1>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {/* Home Button */}
          {onGoHome && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onGoHome}
              title="Home"
              className={cn(
                'h-7 w-7 p-0',
                isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
              )}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </Button>
          )}
          
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
            <DropdownMenuItem onClick={handleLogout} isLight={isLight}>
              <div className="flex items-center gap-2 w-full">
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                <span>Logout</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      </div>

      {/* Tab Bar */}
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1 border-t border-b h-[34px]',
          isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#151C24] border-gray-700',
        )}>
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
          {(['organizations', 'teams', 'users'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-shrink-0 px-3 py-1 text-xs font-medium rounded transition-colors capitalize',
                activeTab === tab
                  ? isLight
                    ? 'bg-gray-200 text-gray-900'
                    : 'bg-gray-700 text-gray-100'
                  : isLight
                  ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
              )}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Pending Invitations Banner */}
      {hasPendingInvitations && showInvitationBanner && (
        <div
          className={cn(
            'px-4 py-3 border-b',
            isLight
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-yellow-900/20 border-yellow-800',
          )}>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg
                className={cn('w-5 h-5', isLight ? 'text-yellow-600' : 'text-yellow-500')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className={cn(
                  'text-sm font-semibold mb-1',
                  isLight ? 'text-yellow-900' : 'text-yellow-200',
                )}>
                {pendingInvitations.length === 1
                  ? 'You have 1 pending invitation'
                  : `You have ${pendingInvitations.length} pending invitations`}
              </h3>
              <div className="space-y-2">
                {pendingInvitations.slice(0, 3).map(inv => (
                  <div
                    key={inv.id}
                    className={cn(
                      'text-xs',
                      isLight ? 'text-yellow-800' : 'text-yellow-300',
                    )}>
                    <strong>{inv.organization.name}</strong> ({inv.role})
                    {' - '}
                    <button
                      onClick={() => {
                        window.location.hash = `#/accept-invitation/${inv.id}`;
                        window.location.reload();
                      }}
                      className={cn(
                        'font-medium underline hover:no-underline',
                        isLight ? 'text-yellow-700' : 'text-yellow-200',
                      )}>
                      View & Accept
                    </button>
                  </div>
                ))}
                {pendingInvitations.length > 3 && (
                  <div
                    className={cn(
                      'text-xs italic',
                      isLight ? 'text-yellow-700' : 'text-yellow-300',
                    )}>
                    +{pendingInvitations.length - 3} more
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowInvitationBanner(false)}
              className={cn(
                'flex-shrink-0 p-1 rounded hover:bg-black/5',
                isLight ? 'text-yellow-600' : 'text-yellow-500',
              )}
              title="Dismiss">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 max-w-4xl mx-auto">
          {/* Alerts */}
          {error && errorVisible && (
            <div
              className={cn(
                'mb-4 p-3 rounded-lg text-sm flex items-start justify-between gap-3 transform transition-all duration-300 ease-out',
                isLight ? 'bg-red-50 text-red-700' : 'bg-red-900/20 text-red-400',
                errorClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
              )}>
              <div className="flex-1 flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
              <button
                onClick={handleDismissError}
                className={cn(
                  'flex-shrink-0 p-0.5 rounded transition-colors',
                  isLight ? 'text-red-500 hover:bg-red-100' : 'text-red-400 hover:bg-red-900/40',
                )}
                title="Dismiss">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          {success && successVisible && (
            <div
              className={cn(
                'mb-4 p-3 rounded-lg text-sm flex items-start justify-between gap-3 transform transition-all duration-300 ease-out',
                isLight ? 'bg-green-50 text-green-700' : 'bg-green-900/20 text-green-400',
                successClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
              )}>
              <div className="flex-1 flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>{success}</span>
              </div>
              <button
                onClick={handleDismissSuccess}
                className={cn(
                  'flex-shrink-0 p-0.5 rounded transition-colors',
                  isLight ? 'text-green-500 hover:bg-green-100' : 'text-green-400 hover:bg-green-900/40',
                )}
                title="Dismiss">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

        {/* Tab Content */}
        {activeTab === 'organizations' && (
          <div className="animate-fadeIn">
            <OrganizationsTab
              isLight={isLight}
              onError={setError}
              onSuccess={setSuccess}
              onNavigateToTeams={(orgId) => {
                setActiveTab('teams');
                setSelectedOrgForTeams(orgId);
              }}
            />
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="animate-fadeIn">
            <TeamsTab
              isLight={isLight}
              organizations={organizations}
              preselectedOrgId={selectedOrgForTeams}
              onError={setError}
              onSuccess={setSuccess}
            />
          </div>
        )}

        {activeTab === 'users' && (
          <div className="animate-fadeIn">
            <UsersTab
              isLight={isLight}
              organizations={organizations}
              preselectedOrgId={selectedOrgForTeams}
              onError={setError}
              onSuccess={setSuccess}
            />
          </div>
        )}
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
            Hands-Off v{version}
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
    </div>
  );
}

