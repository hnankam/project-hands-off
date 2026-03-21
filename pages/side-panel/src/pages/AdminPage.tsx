/**
 * Admin Page for Organization, Team, and User Management
 * Refactored to use separate tab components and shared UI components
 */

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { getAppVersion } from '@extension/platform';
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
import SkillsTab from '@src/components/admin/SkillsTab';
import AgentsTab from '@src/components/admin/AgentsTab';
import { DeploymentsTab } from '../components/admin/DeploymentsTab';
import { UsageTab } from '../components/admin/UsageTab';
import { usePendingInvitations } from '../hooks/usePendingInvitations';
import { useAlerts } from '../hooks/useAlerts';
import UserMenu from '../components/menus/UserMenu';
import InfoMenu from '../components/menus/InfoMenu';
import { ViewOptionsMenu } from '../components/layout/ViewOptionsMenu';
import { InstallAppHelper } from '../components/menus/InstallAppHelper';
import { SettingsButton } from '../components/menus/SettingsButton';
import { PageHeader, PageFooter, TabBar, AlertBanner, InvitationBanner, AccessDenied } from '../components/shared';
import { Z_INDEX } from '../constants/ui';
import type { Organization, AdminTabKey } from '../types';

interface AdminPageProps {
  onGoHome?: () => void;
  onGoToSessions?: () => void;
  initialTab?: AdminTabKey;
}

// ============================================================================
// ADMIN PAGE COMPONENT
// ============================================================================

export function AdminPage({ onGoHome, onGoToSessions, initialTab = 'organizations' }: AdminPageProps) {
  const { user, organization, member, activeTeam } = useAuth();
  const { isLight, theme } = useStorage(themeStorage);

  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  // Alert management using custom hook
  const { error, success, setError, setSuccess, dismissError, dismissSuccess } = useAlerts();

  // Initialize activeTab from localStorage, fallback to initialTab
  const [activeTab, setActiveTab] = useState<AdminTabKey>(() => {
    try {
      const stored = localStorage.getItem('adminPageActiveTab');
      const validTabs: AdminTabKey[] = [
        'organizations',
        'teams',
        'users',
        'usage',
        'providers',
        'models',
        'tools',
        'skills',
        'agents',
        'deployments',
      ];
      if (stored && validTabs.includes(stored as AdminTabKey)) {
        return stored as AdminTabKey;
      }
    } catch (error) {
      console.error('[AdminPage] Failed to read tab from localStorage:', error);
    }
    return initialTab;
  });

  const [selectedOrgForTeams, setSelectedOrgForTeams] = useState('');
  const version = getAppVersion();

  // Check if user is owner or admin (can access all tabs)
  const memberRoles = Array.isArray(member?.role) ? member.role : member?.role ? [member.role] : [];
  const isOwnerOrAdmin = memberRoles.includes('owner') || memberRoles.includes('admin');

  // Check if user has org selected (required for Teams/Users tabs)
  const hasOrganization = !!organization;

  // Check if user has org and team selected (required for accessing most tabs)
  const canAccessTabs = !!(organization && activeTeam);

  // Load organizations for team selector
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // Check for pending invitations
  const { invitations: pendingInvitations, hasPendingInvitations } = usePendingInvitations();
  const [showInvitationBanner, setShowInvitationBanner] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Memoized callbacks
  const loadOrganizations = useCallback(async () => {
    try {
      const { data, error: loadError } = await authClient.organization.list();
      if (loadError) throw new Error(loadError.message);
      setOrganizations(data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error loading organizations';
      console.error('[AdminPage]', errorMessage, err);
    }
  }, []);

  // Load organizations on mount and when user changes (e.g., after login)
  useEffect(() => {
    if (user) {
      loadOrganizations();
    }
  }, [user, loadOrganizations]);

  // Only update activeTab when initialTab changes and is not the default
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

  // Build tab configuration with hidden and disabled flags
  const tabConfigs = [
    { key: 'organizations' as AdminTabKey },
    { key: 'teams' as AdminTabKey, disabled: !hasOrganization },
    { key: 'users' as AdminTabKey, disabled: !hasOrganization },
    { key: 'usage' as AdminTabKey, disabled: !canAccessTabs },
    { key: 'providers' as AdminTabKey, hidden: !isOwnerOrAdmin, disabled: !canAccessTabs },
    { key: 'models' as AdminTabKey, hidden: !isOwnerOrAdmin, disabled: !canAccessTabs },
    { key: 'tools' as AdminTabKey, hidden: !isOwnerOrAdmin, disabled: !canAccessTabs },
    { key: 'skills' as AdminTabKey, hidden: !isOwnerOrAdmin, disabled: !canAccessTabs },
    { key: 'agents' as AdminTabKey, hidden: !isOwnerOrAdmin, disabled: !canAccessTabs },
    { key: 'deployments' as AdminTabKey, hidden: !isOwnerOrAdmin, disabled: !canAccessTabs },
  ];

  return (
    <div
      className={cn(
        'relative flex h-full max-h-full min-h-0 flex-col overflow-hidden',
        isLight ? 'bg-white' : 'bg-[#0D1117]',
      )}>
      {/* Admin Page Header */}
      <PageHeader
        title="Administration"
        isLight={isLight}
        showBorder={false}
        rightContent={
          <>
            <ViewOptionsMenu isLight={isLight} currentSessionId={null} />
            {onGoHome && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onGoHome}
                title="Home"
                className={cn(
                  'h-7 w-7 p-0',
                  isLight
                    ? 'bg-gray-200/70 text-gray-600 hover:bg-gray-300/70'
                    : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/60',
                )}>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </Button>
            )}
            <UserMenu isLight={isLight} onGoToSessions={onGoToSessions} />
          </>
        }
      />

      {/* Tab Bar */}
      <TabBar
        tabs={tabConfigs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isLight={isLight}
        storageKey="adminPageActiveTab"
      />

      {/* Pending Invitations Banner */}
      {hasPendingInvitations && showInvitationBanner && (
        <InvitationBanner
          invitations={pendingInvitations}
          isLight={isLight}
          onDismiss={() => setShowInvitationBanner(false)}
        />
      )}

      {/* Floating Alerts - fixed position below tabs bar, not affected by scroll */}
      {(success.visible || error.visible) && (
        <div className="pointer-events-none fixed top-[74px] right-0 left-0 z-[10002] px-4 pt-4">
          <div className="relative mx-auto max-w-4xl">
            {success.visible && (
              <div className="pointer-events-auto">
                <AlertBanner
                  alert={success}
                  type="success"
                  isLight={isLight}
                  onDismiss={dismissSuccess}
                  stackIndex={error.visible ? 1 : 0}
                />
              </div>
            )}
            {error.visible && (
              <div className="pointer-events-auto">
                <AlertBanner
                  alert={error}
                  type="error"
                  isLight={isLight}
                  onDismiss={dismissError}
                  stackIndex={success.visible ? 2 : 0}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="admin-page-scroll relative isolate min-h-0 flex-1 overflow-y-auto">
        <div className="relative mx-auto max-w-4xl p-4">
          {/* Tab Content */}
          {activeTab === 'organizations' && (
            <div className="animate-fadeIn">
              <OrganizationsTab
                isLight={isLight}
                onError={setError}
                onSuccess={setSuccess}
                onNavigateToTeams={orgId => {
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

          {activeTab === 'models' &&
            (isOwnerOrAdmin ? (
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
              <AccessDenied isLight={isLight} />
            ))}

          {activeTab === 'tools' &&
            (isOwnerOrAdmin ? (
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
              <AccessDenied isLight={isLight} />
            ))}

          {activeTab === 'skills' &&
            (isOwnerOrAdmin ? (
              <div className="animate-fadeIn">
                <SkillsTab
                  isLight={isLight}
                  organizations={organizations}
                  preselectedOrgId={selectedOrgForTeams}
                  onError={setError}
                  onSuccess={setSuccess}
                />
              </div>
            ) : (
              <AccessDenied isLight={isLight} />
            ))}

          {activeTab === 'agents' &&
            (isOwnerOrAdmin ? (
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
              <AccessDenied isLight={isLight} />
            ))}

          {activeTab === 'providers' &&
            (isOwnerOrAdmin ? (
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
              <AccessDenied isLight={isLight} />
            ))}

          {activeTab === 'deployments' &&
            (isOwnerOrAdmin ? (
              <div className="animate-fadeIn">
                <DeploymentsTab
                  isLight={isLight}
                  organizations={organizations}
                  onError={setError}
                  onSuccess={setSuccess}
                />
              </div>
            ) : (
              <AccessDenied isLight={isLight} />
            ))}
        </div>
      </div>

      {/* Footer Bar with Settings */}
      <PageFooter
        version={version}
        isLight={isLight}
        rightContent={
          <>
            <SettingsButton isLight={isLight} theme={theme} onOpenSettings={() => setSettingsOpen(true)} />
            <InfoMenu isLight={isLight} />
          </>
        }
      />

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
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.modal }}>
            <div
              className={cn('w-full max-w-sm rounded-lg shadow-xl', isLight ? 'bg-gray-50' : 'bg-[#151C24]')}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', mainTextColor)}>Preferences</h2>
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
                <div className={cn('border-b px-3 py-2.5', isLight ? 'border-gray-200' : 'border-gray-700')}>
                  <label className={cn('mb-2 block text-xs font-medium', mainTextColor)}>Theme</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => themeStorage.setTheme('light')}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors',
                        theme === 'light'
                          ? 'bg-blue-500 text-white'
                          : isLight
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                      )}
                      title="Light theme">
                      <svg
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round">
                        <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <span>Light</span>
                    </button>

                    <button
                      onClick={() => themeStorage.setTheme('dark')}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors',
                        theme === 'dark'
                          ? 'bg-blue-500 text-white'
                          : isLight
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                      )}
                      title="Dark theme">
                      <svg
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round">
                        <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      <span>Dark</span>
                    </button>

                    <button
                      onClick={() => themeStorage.setTheme('system')}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors',
                        theme === 'system'
                          ? 'bg-blue-500 text-white'
                          : isLight
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                      )}
                      title="System theme">
                      <svg
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round">
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
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
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
