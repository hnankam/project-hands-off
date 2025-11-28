/**
 * Admin Page for Organization, Team, and User Management
 * Refactored to use separate tab components
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authClient } from '../lib/auth-client';
import { useAuth } from '../context/AuthContext';
import { cn, Button } from '@extension/ui';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { OrganizationsTab } from '../components/admin/OrganizationsTab';
import { TeamsTab } from '../components/admin/TeamsTab';
import { UsersTab } from '../components/admin/UsersTab';
import { ProvidersTab } from '../components/admin/ProvidersTab';
import ModelsTab from '@src/components/admin/ModelsTab';
import ToolsTab from '@src/components/admin/ToolsTab';
import AgentsTab from '@src/components/admin/AgentsTab';
import { DeploymentsTab } from '../components/admin/DeploymentsTab';
import { UsageTab } from '../components/admin/UsageTab';
import { usePendingInvitations } from '../hooks/usePendingInvitations';
import UserMenu from '../components/UserMenu';
import InfoMenu from '../components/InfoMenu';
import { ViewOptionsMenu } from '../components/ViewOptionsMenu';
import { InstallAppHelper } from '../components/InstallAppHelper';
import { SettingsButton } from '../components/SettingsButton';
import { Z_INDEX, ANIMATION_DURATIONS, AUTO_DISMISS_DELAYS } from '../constants/ui';

// ============================================================================
// TYPES
// ============================================================================

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string | Date;
}

type AdminTabKey =
  | 'organizations'
  | 'teams'
  | 'users'
  | 'usage'
  | 'providers'
  | 'models'
  | 'tools'
  | 'agents'
  | 'deployments';

interface AdminPageProps {
  onGoHome?: () => void;
  onGoToSessions?: () => void;
  initialTab?: AdminTabKey;
}

// ============================================================================
// ADMIN PAGE COMPONENT
// ============================================================================

export function AdminPage({ onGoHome, onGoToSessions, initialTab = 'organizations' }: AdminPageProps) {
  const { user, organization, member } = useAuth();
  const { isLight, theme } = useStorage(themeStorage);

  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';
  
  // Refs for tab scrolling
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<AdminTabKey, HTMLButtonElement>>(new Map());
  
  // Track whether tabs overflow (to conditionally center them)
  const [tabsOverflow, setTabsOverflow] = useState(false);
  
  // Initialize activeTab from localStorage, fallback to initialTab
  const [activeTab, setActiveTab] = useState<AdminTabKey>(() => {
    try {
      const stored = localStorage.getItem('adminPageActiveTab');
      const validTabs: AdminTabKey[] = ['organizations', 'teams', 'users', 'usage', 'providers', 'models', 'tools', 'agents', 'deployments'];
      if (stored && validTabs.includes(stored as AdminTabKey)) {
        return stored as AdminTabKey;
      }
    } catch (error) {
      console.error('[AdminPage] Failed to read tab from localStorage:', error);
    }
    return initialTab;
  });
  
  const [selectedOrgForTeams, setSelectedOrgForTeams] = useState('');
  const version = chrome.runtime?.getManifest?.()?.version || '1.0.0';
  
  // Check if user is owner or admin (can access all tabs)
  const memberRoles = Array.isArray(member?.role) ? member.role : member?.role ? [member.role] : [];
  const isOwnerOrAdmin = memberRoles.includes('owner') || memberRoles.includes('admin');
  
  // Persist activeTab to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('adminPageActiveTab', activeTab);
    } catch (error) {
      console.error('[AdminPage] Failed to save tab to localStorage:', error);
    }
  }, [activeTab]);

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

  // Memoized callbacks
  const loadOrganizations = useCallback(async () => {
    try {
      const { data, error } = await authClient.organization.list();
      if (error) throw new Error(error.message);
      setOrganizations(data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error loading organizations';
      console.error('[AdminPage]', errorMessage, err);
    }
  }, []);

  const handleDismissError = useCallback(() => {
    setErrorClosing(true);
    setTimeout(() => {
      setError('');
      setErrorVisible(false);
      setErrorClosing(false);
    }, ANIMATION_DURATIONS.dismiss);
  }, []);

  const handleDismissSuccess = useCallback(() => {
    setSuccessClosing(true);
    setTimeout(() => {
      setSuccess('');
      setSuccessVisible(false);
      setSuccessClosing(false);
    }, ANIMATION_DURATIONS.dismiss);
  }, []);

  // Load organizations on mount and when user changes (e.g., after login)
  useEffect(() => {
    if (user) {
      loadOrganizations();
    }
  }, [user, loadOrganizations]);

  // Only update activeTab when initialTab changes and is not the default
  // This allows navigation from HomePage to work while preserving the last active tab on reopen
  useEffect(() => {
    if (initialTab !== 'organizations') {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Preselect active organization when component mounts or organization ID changes
  useEffect(() => {
    if (organization?.id && !selectedOrgForTeams) {
      setSelectedOrgForTeams(organization.id);
    }
  }, [organization?.id, selectedOrgForTeams]);

  // Auto-scroll to active tab when it changes
  useEffect(() => {
    const activeTabElement = tabRefs.current.get(activeTab);
    
    if (activeTabElement && tabContainerRef.current) {
      setTimeout(() => {
        activeTabElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }, ANIMATION_DURATIONS.scrollDelay);
    }
  }, [activeTab]);

  // Check if tabs overflow to conditionally apply centering
  useEffect(() => {
    const checkOverflow = () => {
      if (tabContainerRef.current) {
        const hasOverflow = tabContainerRef.current.scrollWidth > tabContainerRef.current.clientWidth;
        setTabsOverflow(hasOverflow);
      }
    };

    // Check on mount and when window resizes
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    
    // Also check after a short delay to ensure tabs are rendered
    const timer = setTimeout(checkOverflow, ANIMATION_DURATIONS.scrollDelay);

    return () => {
      window.removeEventListener('resize', checkOverflow);
      clearTimeout(timer);
    };
  }, [activeTab, isOwnerOrAdmin]); // Re-check when tabs might change

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
      }, ANIMATION_DURATIONS.dismiss);
    }, AUTO_DISMISS_DELAYS.error);

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
      }, ANIMATION_DURATIONS.dismiss);
    }, AUTO_DISMISS_DELAYS.success);

    return () => clearTimeout(timer);
  }, [success]);

  return (
    <div className={cn('flex h-full max-h-full min-h-0 flex-col overflow-hidden relative', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
      {/* Admin Page Header */}
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between px-2 py-[0.4em]',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <div className="flex items-center min-w-0 flex-1">
          <h1 className={cn('text-sm font-semibold truncate', mainTextColor)}>
            Administration
          </h1>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {/* View Options Menu - Open in Popup/New Tab */}
          <ViewOptionsMenu
            isLight={isLight}
            currentSessionId={null}
          />
          
          {/* Home Button */}
          {onGoHome && (
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
          )}
          
          {/* User Menu with Organization and Team Selectors */}
          <UserMenu
            isLight={isLight}
            onGoToSessions={onGoToSessions}
          />
        </div>
      </div>

      {/* Tab Bar */}
      <div
        className={cn(
          'flex items-center justify-center gap-2 px-2 py-1 border-t border-b h-[34px]',
          isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#151C24] border-gray-700',
        )}>
        <div 
          ref={tabContainerRef}
          className={cn(
            'flex items-center gap-1 overflow-x-auto session-tabs-scroll',
            !tabsOverflow && 'justify-center'
          )}
        >
          {(['organizations', 'teams', 'users', 'usage', 'providers', 'models', 'tools', 'agents', 'deployments'] as const)
            .filter(tab => {
              // Hide providers, models, tools, and agents tabs for member users
              if (['providers', 'models', 'tools', 'agents', 'deployments'].includes(tab) && !isOwnerOrAdmin) {
                return false;
              }
              return true;
            })
            .map(tab => (
              <button
                key={tab}
                ref={(el) => {
                  if (el) {
                    tabRefs.current.set(tab, el);
                  } else {
                    tabRefs.current.delete(tab);
                  }
                }}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-shrink-0 px-3 py-1 text-xs font-medium rounded transition-colors capitalize',
                  activeTab === tab
                    ? isLight
                      ? 'bg-gray-200 text-gray-700'
                      : 'bg-gray-700 text-[#bcc1c7]'
                    : isLight
                    ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-700'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-[#bcc1c7]',
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
      <div className="flex-1 min-h-0 overflow-y-auto admin-page-scroll relative isolate">
        <div className="p-4 max-w-4xl mx-auto relative">
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

        {activeTab === 'usage' && (
          <div className="animate-fadeIn">
            <UsageTab
            isLight={isLight}
            organizations={organizations}
            preselectedOrgId={selectedOrgForTeams}
            onError={setError}
            onSuccess={setSuccess}
          />
          </div>
        )}

        {activeTab === 'models' && (
          isOwnerOrAdmin ? (
            <div className="animate-fadeIn">
              <ModelsTab
                isLight={isLight}
                organizations={organizations}
                preselectedOrgId={selectedOrgForTeams}
                onError={setError}
                onSuccess={setSuccess}
              />
            </div>
          ) : (
            <div className={cn('flex-1 flex items-center justify-center', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
              <div className="text-center">
                <p className={cn('text-sm', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  You need owner or admin permissions to access this section.
                </p>
              </div>
            </div>
          )
        )}

        {activeTab === 'tools' && (
          isOwnerOrAdmin ? (
            <div className="animate-fadeIn">
              <ToolsTab
                isLight={isLight}
                organizations={organizations}
                preselectedOrgId={selectedOrgForTeams}
                onError={setError}
                onSuccess={setSuccess}
              />
            </div>
          ) : (
            <div className={cn('flex-1 flex items-center justify-center', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
              <div className="text-center">
                <p className={cn('text-sm', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  You need owner or admin permissions to access this section.
                </p>
              </div>
            </div>
          )
        )}

        {activeTab === 'agents' && (
          isOwnerOrAdmin ? (
            <div className="animate-fadeIn">
              <AgentsTab
                isLight={isLight}
                organizations={organizations}
                preselectedOrgId={selectedOrgForTeams}
                onError={setError}
                onSuccess={setSuccess}
              />
            </div>
          ) : (
            <div className={cn('flex-1 flex items-center justify-center', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
              <div className="text-center">
                <p className={cn('text-sm', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  You need owner or admin permissions to access this section.
                </p>
              </div>
            </div>
          )
        )}

        {activeTab === 'providers' && (
          isOwnerOrAdmin ? (
            <div className="animate-fadeIn">
              <ProvidersTab
                isLight={isLight}
                organizations={organizations}
                preselectedOrgId={selectedOrgForTeams}
                onError={setError}
                onSuccess={setSuccess}
              />
            </div>
          ) : (
            <div className={cn('flex-1 flex items-center justify-center', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
              <div className="text-center">
                <p className={cn('text-sm', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  You need owner or admin permissions to access this section.
                </p>
              </div>
            </div>
          )
        )}

        {activeTab === 'deployments' && (
          isOwnerOrAdmin ? (
            <div className="animate-fadeIn">
              <DeploymentsTab
                isLight={isLight}
                organizations={organizations}
                onError={setError}
                onSuccess={setSuccess}
              />
            </div>
          ) : (
            <div className={cn('flex-1 flex items-center justify-center', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
              <div className="text-center">
                <p className={cn('text-sm', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  You need owner or admin permissions to access this section.
                </p>
              </div>
            </div>
          )
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
            v {version}
          </div>
          <div className="flex items-center gap-1">
          <SettingsButton isLight={isLight} theme={theme} onOpenSettings={() => setSettingsOpen(true)} />
            {/* Info Menu - About and Support */}
            <InfoMenu isLight={isLight} />
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            style={{ zIndex: Z_INDEX.modalBackdrop }}
            onClick={() => setSettingsOpen(false)}
          />

          {/* Modal */}
          <div 
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: Z_INDEX.modal }}
          >
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'bg-gray-50' : 'bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', mainTextColor)}>
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

            {/* Content - Scrollable */}
            <div className={cn('max-h-[70vh] overflow-y-auto', isLight ? 'bg-white' : 'bg-[#151C24]')}>
              {/* Theme Selection */}
              <div className={cn('px-3 py-2.5 border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <label
                  className={cn(
                    'text-xs font-medium block mb-2',
                    mainTextColor
                  )}
                >
                  Theme
                </label>
                <div className="flex gap-1">
                  <button
                    onClick={() => themeStorage.setTheme('light')}
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
                    onClick={() => themeStorage.setTheme('dark')}
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
                    onClick={() => themeStorage.setTheme('system')}
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

              {/* Install App Helper */}
              <div className="px-3 py-4">
                <InstallAppHelper isLight={isLight} />
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

