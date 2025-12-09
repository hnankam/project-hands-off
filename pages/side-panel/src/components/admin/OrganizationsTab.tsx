/**
 * Organizations Tab Component for Admin Page
 * Includes SSO (Single Sign-On) provider management
 */

import React, { useState, useEffect } from 'react';
import { authClient, listSSOProviders, registerSSOProvider, deleteSSOProvider, requestDomainVerification, verifyDomain, type SSOProvider, type OIDCConfig } from '../../lib/auth-client';
import { useAuth } from '../../context/AuthContext';
import { cn } from '@extension/ui';
import { AdminConfirmDialog } from './modals';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: any;
  createdAt: string | Date;
}

interface Team {
  id: string;
  name: string;
  organizationId: string;
  createdAt: string | Date;
}

// SSO Form State
interface SSOFormState {
  providerId: string;
  issuer: string;
  domain: string;
  clientId: string;
  clientSecret: string;
  discoveryEndpoint: string;
  scopes: string;
}

interface OrganizationsTabProps {
  isLight: boolean;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
  onNavigateToTeams: (orgId: string) => void;
}

const OrganizationSkeletonCard: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div
    className={cn(
      'rounded-lg border',
      isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
    )}>
    <div className="p-3 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className={cn('h-3 w-24 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className={cn('h-5 w-16 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
      </div>
      <div className={cn('h-2.5 w-32 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
      <div className="space-y-2">
        <div className={cn('h-2 w-full rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
        <div className={cn('h-2 w-5/6 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
        <div className={cn('h-2 w-2/3 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
      </div>
    </div>
  </div>
);

export function OrganizationsTab({ isLight, onError, onSuccess, onNavigateToTeams }: OrganizationsTabProps) {
  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgSlug, setEditOrgSlug] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteOrgConfirmOpen, setDeleteOrgConfirmOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<{ id: string; name: string } | null>(null);
  const [expandedOrgIds, setExpandedOrgIds] = useState<Set<string>>(new Set());
  const [orgTeams, setOrgTeams] = useState<Record<string, { teams: Team[]; memberCounts: Record<string, number> }>>({});
  const [userRoles, setUserRoles] = useState<Record<string, string[]>>({});  // orgId -> roles[]
  const [hasOwnerRole, setHasOwnerRole] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userTeamIds, setUserTeamIds] = useState<Record<string, Set<string>>>({}); // orgId -> Set of teamIds user belongs to
  const [listLoading, setListLoading] = useState(true);

  // SSO State
  const [orgSSOProviders, setOrgSSOProviders] = useState<Record<string, SSOProvider[]>>({}); // orgId -> SSO providers
  const [ssoExpandedOrgIds, setSSOExpandedOrgIds] = useState<Set<string>>(new Set());
  const [showSSOForm, setShowSSOForm] = useState<string | null>(null); // orgId showing form
  const [ssoFormState, setSSOFormState] = useState<SSOFormState>({
    providerId: '',
    issuer: '',
    domain: '',
    clientId: '',
    clientSecret: '',
    discoveryEndpoint: '',
    scopes: 'openid, email, profile',
  });
  const [ssoLoading, setSSOLoading] = useState(false);
  const [deleteSSOConfirmOpen, setDeleteSSOConfirmOpen] = useState(false);
  const [ssoToDelete, setSSOToDelete] = useState<{ providerId: string; domain: string; orgId: string } | null>(null);

  // Load organizations on mount and when user changes (e.g., after login)
  useEffect(() => {
    if (user) {
      loadOrganizations();
    } else {
      setListLoading(false);
      setOrganizations([]);
    }
  }, [user]);

  const loadOrganizations = async () => {
    try {
      setListLoading(true);
      const { data, error } = await authClient.organization.list();
      if (error) throw new Error(error.message);

      // Get current user ID
      const session = await authClient.getSession();
      const userId = session?.data?.user?.id;
      
      setCurrentUserId(userId || null);
      
      // Fetch user roles for each organization and filter
      const roles: Record<string, string[]> = {};
      let hasOwner = false;
      const userOrganizations: Organization[] = [];

      for (const org of data || []) {
        try {
          // Get the full organization data including member info
          const { data: fullOrg } = await (authClient.organization as any).getFullOrganization({
            organizationId: org.id,
          });

          if (fullOrg?.members && userId) {
            // Find current user's membership
            const currentMember = fullOrg.members.find((m: any) => m.userId === userId);
            
            if (currentMember) {
              const memberRoles = Array.isArray(currentMember.role) 
                ? currentMember.role 
                : [currentMember.role];
              roles[org.id] = memberRoles;
              
              if (memberRoles.includes('owner')) {
                hasOwner = true;
              }
              
              // Only include organizations where user is a member
              userOrganizations.push(org);
            }
          }
        } catch (err) {
          console.error(`Failed to get roles for org ${org.id}:`, err);
        }
      }

      setOrganizations(userOrganizations);
      setUserRoles(roles);
      setHasOwnerRole(hasOwner);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setListLoading(false);
    }
  };

  const createOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await authClient.organization.create({
        name: newOrgName,
        slug: newOrgSlug,
      });

      if (error) throw new Error(error.message);

      onSuccess(`Organization "${newOrgName}" created successfully!`);
      setNewOrgName('');
      setNewOrgSlug('');
      setShowCreateForm(false);
      await loadOrganizations();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEditOrganization = (org: Organization) => {
    setEditingOrgId(org.id);
    setEditOrgName(org.name);
    setEditOrgSlug(org.slug);
  };

  const cancelEditOrganization = () => {
    setEditingOrgId(null);
    setEditOrgName('');
    setEditOrgSlug('');
  };

  const updateOrganization = async (orgId: string) => {
    setLoading(true);

    try {
      const { data, error} = await authClient.organization.update({
        data: {
          name: editOrgName,
          slug: editOrgSlug,
        },
        organizationId: orgId,
      });

      if (error) throw new Error(error.message);

      onSuccess(`Organization updated successfully!`);
      setEditingOrgId(null);
      await loadOrganizations();
    } catch (err: any) {
      onError(err.message || 'Failed to update organization');
    } finally {
      setLoading(false);
    }
  };

  const openDeleteOrgConfirm = (orgId: string, orgName: string) => {
    setOrgToDelete({ id: orgId, name: orgName });
    setDeleteOrgConfirmOpen(true);
  };

  const confirmDeleteOrganization = async () => {
    if (!orgToDelete) return;

    setLoading(true);

    try {
      const { error } = await authClient.organization.delete({
        organizationId: orgToDelete.id,
      });

      if (error) throw new Error(error.message);

      onSuccess(`Organization "${orgToDelete.name}" deleted successfully!`);
      setDeleteOrgConfirmOpen(false);
      setOrgToDelete(null);
      await loadOrganizations();
    } catch (err: any) {
      onError(err.message || 'Failed to delete organization');
      setDeleteOrgConfirmOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const toggleOrgExpansion = async (orgId: string) => {
    setExpandedOrgIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orgId)) {
        newSet.delete(orgId);
      } else {
        newSet.add(orgId);
        if (!orgTeams[orgId]) {
          loadOrgTeamsWithCounts(orgId);
        }
      }
      return newSet;
    });
  };

  const loadOrgTeamsWithCounts = async (orgId: string) => {
    try {
      const { data: teamsData, error: teamsError } = await (authClient.organization as any).listTeams({
        query: { organizationId: orgId },
      });

      if (teamsError) throw new Error(teamsError.message);

      const allTeams = teamsData || [];
      const memberCounts: Record<string, number> = {};
      const userRolesForOrg = userRoles[orgId] || [];
      const isOwnerOrAdmin = userRolesForOrg.includes('owner') || userRolesForOrg.includes('admin');
      
      let teamsToShow: Team[] = [];
      const accessibleTeamIds = new Set<string>();

      if (isOwnerOrAdmin) {
        // Owners and admins can see all teams
        teamsToShow = allTeams;
        allTeams.forEach((team: Team) => accessibleTeamIds.add(team.id));
      } else {
        // Members can only see teams they belong to
        const userTeams: Team[] = [];
        
        for (const team of allTeams) {
          try {
            const { data: membersData, error } = await (authClient.organization as any).listTeamMembers({
              query: { teamId: team.id },
            });

            if (!error) {
              // Check if current user is a member of this team
              const isMember = membersData?.some((tm: any) => tm.userId === currentUserId);
              if (isMember) {
                userTeams.push(team);
                accessibleTeamIds.add(team.id);
              }
            }
          } catch (err) {
            // Silently skip teams user doesn't have access to
            console.log(`Skipping team ${team.id}: user is not a member`);
          }
        }
        
        teamsToShow = userTeams;
      }

      // Only load member counts for accessible teams
      for (const team of teamsToShow) {
        if (accessibleTeamIds.has(team.id)) {
          try {
            const { data: membersData } = await (authClient.organization as any).listTeamMembers({
              query: { teamId: team.id },
            });
            memberCounts[team.id] = membersData?.length || 0;
          } catch {
            memberCounts[team.id] = 0;
          }
        }
      }

      // Store accessible team IDs for this organization
      setUserTeamIds(prev => ({
        ...prev,
        [orgId]: accessibleTeamIds,
      }));

      setOrgTeams(prev => ({
        ...prev,
        [orgId]: { teams: teamsToShow, memberCounts },
      }));
    } catch (err: any) {
      console.error('Error loading org teams:', err);
    }
  };

  // ============================================================================
  // SSO FUNCTIONS
  // ============================================================================

  const toggleSSOExpansion = async (orgId: string) => {
    setSSOExpandedOrgIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orgId)) {
        newSet.delete(orgId);
      } else {
        newSet.add(orgId);
        if (!orgSSOProviders[orgId]) {
          loadSSOProviders(orgId);
        }
      }
      return newSet;
    });
  };

  const loadSSOProviders = async (orgId: string) => {
    try {
      const { data, error } = await listSSOProviders(orgId);
      if (error) {
        console.error('Failed to load SSO providers:', error);
        return;
      }
      setOrgSSOProviders(prev => ({
        ...prev,
        [orgId]: data || [],
      }));
    } catch (err: any) {
      console.error('Error loading SSO providers:', err);
    }
  };

  const resetSSOForm = () => {
    setSSOFormState({
      providerId: '',
      issuer: '',
      domain: '',
      clientId: '',
      clientSecret: '',
      discoveryEndpoint: '',
      scopes: 'openid, email, profile',
    });
    setShowSSOForm(null);
  };

  const handleCreateSSOProvider = async (orgId: string) => {
    if (!ssoFormState.providerId || !ssoFormState.domain || !ssoFormState.clientId || !ssoFormState.issuer) {
      onError('Provider ID, Domain, Issuer URL, and Client ID are required');
      return;
    }

    setSSOLoading(true);
    try {
      // Normalize issuer (remove trailing slash)
      const issuer = ssoFormState.issuer.replace(/\/$/, '');
      
      // Auto-derive OIDC endpoints from issuer
      // For Okta org auth server, endpoints are at /oauth2/v1/...
      // For Okta custom/default auth server (e.g., /oauth2/default), endpoints are at the same path
      const isOktaOrgServer = issuer.match(/^https:\/\/[^/]+\.okta\.com$/) !== null;
      const endpointBase = isOktaOrgServer ? `${issuer}/oauth2/v1` : issuer;
      
      const discoveryEndpoint = `${issuer}/.well-known/openid-configuration`;
      const authorizationEndpoint = `${endpointBase}/authorize`;
      const tokenEndpoint = `${endpointBase}/token`;
      const jwksEndpoint = `${endpointBase}/keys`;
      
      console.log('[SSO Form] Issuer:', issuer);
      console.log('[SSO Form] Is Okta Org Server:', isOktaOrgServer);
      console.log('[SSO Form] Endpoints:', { discoveryEndpoint, authorizationEndpoint, tokenEndpoint, jwksEndpoint });
      
      const oidcConfig: OIDCConfig = {
        clientId: ssoFormState.clientId,
        clientSecret: ssoFormState.clientSecret,
        discoveryEndpoint,
        authorizationEndpoint,
        tokenEndpoint,
        jwksEndpoint,
        scopes: ssoFormState.scopes.split(',').map(s => s.trim()).filter(Boolean),
        pkce: true,
        mapping: {
          id: 'sub',
          email: 'email',
          emailVerified: 'email_verified',
          name: 'name',
          image: 'picture',
        },
      };

      console.log('[SSO Form] Full OIDC Config:', JSON.stringify(oidcConfig, null, 2));

      const { data, error } = await registerSSOProvider({
        providerId: ssoFormState.providerId,
        issuer: ssoFormState.issuer,
        domain: ssoFormState.domain,
        organizationId: orgId,
        oidcConfig,
      });

      if (error) {
        throw new Error(error);
      }

      onSuccess(`SSO provider "${ssoFormState.domain}" configured successfully!`);
      resetSSOForm();
      await loadSSOProviders(orgId);
    } catch (err: any) {
      onError(err.message || 'Failed to create SSO provider');
    } finally {
      setSSOLoading(false);
    }
  };

  const openDeleteSSOConfirm = (providerId: string, domain: string, orgId: string) => {
    setSSOToDelete({ providerId, domain, orgId });
    setDeleteSSOConfirmOpen(true);
  };

  const confirmDeleteSSOProvider = async () => {
    if (!ssoToDelete) return;

    setSSOLoading(true);
    try {
      const { error } = await deleteSSOProvider(ssoToDelete.providerId);
      if (error) {
        throw new Error(error);
      }

      onSuccess(`SSO provider for "${ssoToDelete.domain}" deleted successfully!`);
      setDeleteSSOConfirmOpen(false);
      setSSOToDelete(null);
      await loadSSOProviders(ssoToDelete.orgId);
    } catch (err: any) {
      onError(err.message || 'Failed to delete SSO provider');
      setDeleteSSOConfirmOpen(false);
    } finally {
      setSSOLoading(false);
    }
  };

  const handleVerifyDomain = async (providerId: string, orgId: string) => {
    setSSOLoading(true);
    try {
      const { data, error } = await verifyDomain(providerId);
      if (error) {
        throw new Error(error);
      }

      if (data?.verified) {
        onSuccess('Domain verified successfully!');
        await loadSSOProviders(orgId);
      } else {
        onError('Domain verification failed. Please ensure the DNS TXT record is configured correctly.');
      }
    } catch (err: any) {
      onError(err.message || 'Failed to verify domain');
    } finally {
      setSSOLoading(false);
    }
  };

  const handleRequestVerification = async (providerId: string) => {
    setSSOLoading(true);
    try {
      const { data, error } = await requestDomainVerification(providerId);
      if (error) {
        throw new Error(error);
      }

      onSuccess(`Verification token generated. Add a TXT record with value: ${data?.token}`);
    } catch (err: any) {
      onError(err.message || 'Failed to request domain verification');
    } finally {
      setSSOLoading(false);
    }
  };

  return (
    <div>
      {/* Header with Icon, Count, and New Button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <h2 className={cn('text-base font-semibold', mainTextColor)}>
            Organizations <span className={cn('text-sm font-normal', isLight ? 'text-gray-500' : 'text-gray-400')}>({organizations.length})</span>
          </h2>
        </div>
        {hasOwnerRole && !showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors',
              isLight
                ? 'text-blue-600 hover:bg-blue-50 border border-blue-200'
                : 'text-blue-400 hover:bg-blue-900/20 border border-blue-800',
            )}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Organization
          </button>
        )}
      </div>

      {/* Create Form - Compact Card */}
      {showCreateForm && (
        <form
          onSubmit={createOrganization}
          className={cn(
            'mb-3 pt-3 pb-5 pr-8 pl-8 rounded-lg border',
            isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
          )}>
          <div className="space-y-2.5">
            <div>
              <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Organization Name
              </label>
              <input
                type="text"
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
                placeholder="Acme Corp"
                required
                className={cn(
                  'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                  isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                )}
              />
            </div>
            <div>
              <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Slug (URL-friendly)
              </label>
              <input
                type="text"
                value={newOrgSlug}
                onChange={e => setNewOrgSlug(e.target.value)}
                placeholder="acme-corp"
                required
                className={cn(
                  'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                  isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                )}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end mt-3">
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'px-4 py-1.5 text-xs rounded transition-colors font-medium',
                isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                loading && 'opacity-50 cursor-not-allowed',
              )}>
              {loading ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className={cn(
                'px-4 py-1.5 text-xs rounded transition-colors font-medium',
                isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
              )}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Organizations List - Compact Cards */}
      <div className="space-y-2">
        {listLoading ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <OrganizationSkeletonCard key={`org-skeleton-${idx}`} isLight={isLight} />
          ))
        ) : (
          <>
        {organizations.map(org => (
          <div
            key={org.id}
            className={cn(
              'rounded-lg border',
              isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
            )}>
            {editingOrgId === org.id ? (
              /* Edit Mode */
              <div className="space-y-2.5 pt-3 pb-5 pr-8 pl-8">
                <div>
                  <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={editOrgName}
                    onChange={e => setEditOrgName(e.target.value)}
                    className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                      isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                    )}
                  />
                </div>
                <div>
                  <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Slug (URL-friendly)
                  </label>
                  <input
                    type="text"
                    value={editOrgSlug}
                    onChange={e => setEditOrgSlug(e.target.value)}
                    className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                      isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                    )}
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-end mt-3">
                  <button
                    onClick={() => updateOrganization(org.id)}
                    disabled={loading}
                    className={cn(
                      'px-4 py-1.5 text-xs rounded transition-colors font-medium',
                      isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                      loading && 'opacity-50 cursor-not-allowed',
                    )}>
                    {loading ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEditOrganization}
                    className={cn(
                      'px-4 py-1.5 text-xs rounded transition-colors font-medium',
                      isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                    )}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <div className="p-3">
                {/* Row 1: Name + Actions */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className={cn('font-semibold text-xs truncate', mainTextColor)}>
                    {org.name}
                  </h4>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Expand/Collapse Icon */}
                    <button
                      onClick={() => toggleOrgExpansion(org.id)}
                      className={cn(
                        'p-1 rounded transition-colors',
                        isLight
                          ? 'text-gray-400 hover:text-gray-600'
                          : 'text-gray-500 hover:text-gray-300',
                      )}
                      title={expandedOrgIds.has(org.id) ? "Collapse" : "Expand teams"}>
                      {expandedOrgIds.has(org.id) ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                        </svg>
                      )}
                    </button>
                    {(userRoles[org.id]?.includes('owner') || userRoles[org.id]?.includes('admin')) && (
                      <button
                        onClick={() => startEditOrganization(org)}
                        className={cn(
                          'p-1 rounded transition-colors',
                          isLight ? 'text-gray-400 hover:text-blue-600' : 'text-gray-500 hover:text-blue-400',
                        )}
                        title="Edit">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                    {userRoles[org.id]?.includes('owner') && (
                      <button
                        onClick={() => openDeleteOrgConfirm(org.id, org.name)}
                        className={cn(
                          'p-1 rounded transition-colors',
                          isLight ? 'text-gray-400 hover:text-red-600' : 'text-gray-500 hover:text-red-400',
                        )}
                        title="Delete">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {/* Row 2: Slug | Date */}
                <div className={cn('text-[11px] flex items-center gap-2', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  <span className="truncate">{org.slug}</span>
                  <span className="text-gray-500">|</span>
                  <span className="whitespace-nowrap">
                    {typeof org.createdAt === 'string' 
                      ? new Date(org.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : org.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>

                {/* Expanded Teams Section */}
                <div 
                  className={cn(
                    'overflow-hidden transition-all ease-in-out',
                    expandedOrgIds.has(org.id) 
                      ? 'max-h-[2000px] opacity-100 mt-3 duration-500' 
                      : 'max-h-0 opacity-0 mt-0 duration-400'
                  )}>
                  <div 
                    className={cn(
                      'pt-3 border-t transition-all ease-in-out',
                      isLight ? 'border-gray-200' : 'border-gray-700',
                      expandedOrgIds.has(org.id) 
                        ? 'translate-y-0 duration-300 delay-100' 
                        : '-translate-y-4 duration-200'
                    )}>
                    {orgTeams[org.id] ? (
                      <div className={cn(
                        'transition-opacity ease-in-out',
                        expandedOrgIds.has(org.id) 
                          ? 'opacity-100 duration-400 delay-200' 
                          : 'opacity-0 duration-150'
                      )}>
                        {orgTeams[org.id].teams.length > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className={cn('text-[10px] font-semibold uppercase', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                Teams ({orgTeams[org.id].teams.length})
                              </h5>
                              <button
                                onClick={() => onNavigateToTeams(org.id)}
                                className={cn(
                                  'flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors duration-200',
                                  isLight
                                    ? 'text-blue-600 hover:bg-blue-50'
                                    : 'text-blue-400 hover:bg-blue-900/20',
                                )}>
                                View Details
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </div>
                            {/* Teams Table */}
                            <div className="space-y-1">
                              {orgTeams[org.id].teams.map((team, index) => (
                                <div
                                  key={team.id}
                                  className={cn(
                                    'flex items-center justify-between px-2 py-1.5 rounded text-[11px] transition-all',
                                    isLight ? 'bg-gray-50 hover:bg-gray-100' : 'bg-gray-800/50 hover:bg-gray-800',
                                  )}
                                  style={{ 
                                    transitionDuration: expandedOrgIds.has(org.id) ? '300ms' : '150ms',
                                    transitionDelay: expandedOrgIds.has(org.id) ? `${200 + index * 30}ms` : '0ms',
                                    opacity: expandedOrgIds.has(org.id) ? 1 : 0,
                                    transform: expandedOrgIds.has(org.id) ? 'translateX(0)' : 'translateX(-10px)'
                                  }}>
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <svg className="w-3 h-3 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    <span className={cn('truncate font-medium', mainTextColor)}>
                                      {team.name}
                                    </span>
                                  </div>
                                  <span className={cn('text-[10px] px-2 py-0.5 rounded transition-colors', isLight ? 'bg-gray-200 text-gray-700' : 'bg-gray-700 text-gray-300')}>
                                    {orgTeams[org.id].memberCounts[team.id] || 0} {orgTeams[org.id].memberCounts[team.id] === 1 ? 'member' : 'members'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className={cn('text-[11px] text-center py-3', isLight ? 'text-gray-500' : 'text-gray-400')}>
                            No teams yet
                          </p>
                        )}

                        {/* SSO Section - Only for owners/admins */}
                        {(userRoles[org.id]?.includes('owner') || userRoles[org.id]?.includes('admin')) && (
                          <div className={cn('mt-4 pt-3 border-t', isLight ? 'border-gray-200' : 'border-gray-700')}>
                            <div className="flex items-center justify-between mb-2">
                              <button
                                onClick={() => toggleSSOExpansion(org.id)}
                                className="flex items-center gap-1.5"
                              >
                                <svg 
                                  className={cn(
                                    'w-3 h-3 transition-transform',
                                    ssoExpandedOrgIds.has(org.id) ? 'rotate-90' : ''
                                  )} 
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24" 
                                  strokeWidth={2}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                </svg>
                                <h5 className={cn('text-[10px] font-semibold uppercase', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                  SSO Configuration
                                </h5>
                              </button>
                              {ssoExpandedOrgIds.has(org.id) && showSSOForm !== org.id && (
                                <button
                                  onClick={() => setShowSSOForm(org.id)}
                                  className={cn(
                                    'flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors',
                                    isLight
                                      ? 'text-blue-600 hover:bg-blue-50 border border-blue-200'
                                      : 'text-blue-400 hover:bg-blue-900/20 border border-blue-800',
                                  )}
                                >
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                  </svg>
                                  Add OIDC Provider
                                </button>
                              )}
                            </div>

                            {/* SSO Expanded Content */}
                            {ssoExpandedOrgIds.has(org.id) && (
                              <div className="mt-2 space-y-2">
                                {/* SSO Create Form */}
                                {showSSOForm === org.id && (
                                  <div className={cn(
                                    'p-4 rounded-lg border',
                                    isLight ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/50 border-gray-700'
                                  )}>
                                    <h6 className={cn('text-xs font-semibold mb-3', mainTextColor)}>
                                      Configure OIDC Provider
                                    </h6>
                                    <div className="space-y-3">
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                            Provider ID *
                                          </label>
                                          <input
                                            type="text"
                                            value={ssoFormState.providerId}
                                            onChange={e => setSSOFormState(s => ({ ...s, providerId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                                            placeholder={`${org.slug}-sso`}
                                            className={cn(
                                              'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                                              isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                                            )}
                                          />
                                        </div>
                                        <div>
                                          <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                            Domain *
                                          </label>
                                          <input
                                            type="text"
                                            value={ssoFormState.domain}
                                            onChange={e => setSSOFormState(s => ({ ...s, domain: e.target.value }))}
                                            placeholder={`${org.slug.replace(/-/g, '')}.com`}
                                            className={cn(
                                              'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                                              isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                                            )}
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                          Issuer URL *
                                        </label>
                                        <input
                                          type="url"
                                          value={ssoFormState.issuer}
                                          onChange={e => setSSOFormState(s => ({ ...s, issuer: e.target.value }))}
                                          placeholder="https://dev-12345.okta.com"
                                          className={cn(
                                            'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                                            isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                                          )}
                                        />
                                        <p className={cn('text-[10px] mt-1', isLight ? 'text-gray-500' : 'text-gray-500')}>
                                          Your IdP's issuer URL (e.g., https://your-org.okta.com or https://login.microsoftonline.com/tenant-id/v2.0)
                                        </p>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                            Client ID *
                                          </label>
                                          <input
                                            type="text"
                                            value={ssoFormState.clientId}
                                            onChange={e => setSSOFormState(s => ({ ...s, clientId: e.target.value }))}
                                            placeholder="your-client-id"
                                            className={cn(
                                              'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                                              isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                                            )}
                                          />
                                        </div>
                                        <div>
                                          <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                            Client Secret
                                          </label>
                                          <input
                                            type="password"
                                            value={ssoFormState.clientSecret}
                                            onChange={e => setSSOFormState(s => ({ ...s, clientSecret: e.target.value }))}
                                            placeholder="your-client-secret"
                                            className={cn(
                                              'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                                              isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                                            )}
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                          Scopes
                                        </label>
                                        <input
                                          type="text"
                                          value={ssoFormState.scopes}
                                          onChange={e => setSSOFormState(s => ({ ...s, scopes: e.target.value }))}
                                          placeholder="openid, email, profile"
                                          className={cn(
                                            'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                                            isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                                          )}
                                        />
                                        <p className={cn('text-[10px] mt-1', isLight ? 'text-gray-500' : 'text-gray-500')}>
                                          Comma-separated list of OIDC scopes
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex gap-2 justify-end mt-4">
                                      <button
                                        onClick={() => handleCreateSSOProvider(org.id)}
                                        disabled={ssoLoading}
                                        className={cn(
                                          'px-4 py-1.5 text-xs rounded transition-colors font-medium',
                                          isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                                          ssoLoading && 'opacity-50 cursor-not-allowed',
                                        )}
                                      >
                                        {ssoLoading ? 'Saving...' : 'Save Provider'}
                                      </button>
                                      <button
                                        onClick={resetSSOForm}
                                        className={cn(
                                          'px-4 py-1.5 text-xs rounded transition-colors font-medium',
                                          isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                                        )}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* SSO Providers List */}
                                {orgSSOProviders[org.id] ? (
                                  orgSSOProviders[org.id].length > 0 ? (
                                    <div className="space-y-1.5">
                                      {orgSSOProviders[org.id].map(provider => (
                                        <div
                                          key={provider.id}
                                          className={cn(
                                            'flex items-center justify-between px-2.5 py-2 rounded-lg text-[11px]',
                                            isLight ? 'bg-gray-50 border border-gray-200' : 'bg-gray-800/50 border border-gray-700',
                                          )}
                                        >
                                          <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <svg className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                            </svg>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2">
                                                <span className={cn('font-medium truncate', mainTextColor)}>
                                                  {provider.domain}
                                                </span>
                                                {provider.domainVerified ? (
                                                  <span className={cn(
                                                    'px-1.5 py-0.5 text-[9px] font-medium rounded',
                                                    isLight ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400'
                                                  )}>
                                                    Verified
                                                  </span>
                                                ) : (
                                                  <span className={cn(
                                                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                                                    isLight ? 'bg-gray-100 text-gray-700' : 'bg-gray-800 text-gray-300'
                                                  )}>
                                                    Pending
                                                  </span>
                                                )}
                                              </div>
                                              <div className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-500')}>
                                                {provider.providerId} • {provider.oidcConfig ? 'OIDC' : 'SAML'}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            {!provider.domainVerified && (
                                              <>
                                                <button
                                                  onClick={() => handleRequestVerification(provider.providerId)}
                                                  disabled={ssoLoading}
                                                  className={cn(
                                                    'p-1 rounded transition-colors',
                                                    isLight ? 'text-gray-400 hover:text-blue-600' : 'text-gray-500 hover:text-blue-400',
                                                  )}
                                                  title="Get DNS verification token"
                                                >
                                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                  </svg>
                                                </button>
                                                <button
                                                  onClick={() => handleVerifyDomain(provider.providerId, org.id)}
                                                  disabled={ssoLoading}
                                                  className={cn(
                                                    'p-1 rounded transition-colors',
                                                    isLight ? 'text-gray-400 hover:text-green-600' : 'text-gray-500 hover:text-green-400',
                                                  )}
                                                  title="Verify domain"
                                                >
                                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                  </svg>
                                                </button>
                                              </>
                                            )}
                                            <button
                                              onClick={() => openDeleteSSOConfirm(provider.providerId, provider.domain, org.id)}
                                              className={cn(
                                                'p-1 rounded transition-colors',
                                                isLight ? 'text-gray-400 hover:text-red-600' : 'text-gray-500 hover:text-red-400',
                                              )}
                                              title="Delete"
                                            >
                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                              </svg>
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : showSSOForm !== org.id && (
                                    <p className={cn('text-[11px] text-center py-2', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                      No SSO providers configured
                                    </p>
                                  )
                                ) : (
                                  <div className="flex items-center justify-center py-2">
                                    <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-3">
                        <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {organizations.length === 0 && !showCreateForm && (
          <div className={cn(
            'text-center py-8 text-xs rounded-lg border',
            isLight ? 'text-gray-500 border-gray-200 bg-gray-50' : 'text-gray-400 border-gray-700 bg-[#151C24]',
          )}>
            <p>No organizations yet.</p>
            {hasOwnerRole && (
              <button
                onClick={() => setShowCreateForm(true)}
                className={cn(
                  'mt-2 text-xs font-medium',
                  isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300',
                )}>
                Create your first organization
              </button>
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* Delete Organization Confirmation Modal */}
      <AdminConfirmDialog
        isOpen={deleteOrgConfirmOpen && !!orgToDelete}
        onClose={() => setDeleteOrgConfirmOpen(false)}
        onConfirm={confirmDeleteOrganization}
        title="Delete Organization"
        message={
          <div className="flex items-start gap-3">
            <div className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', isLight ? 'bg-red-100' : 'bg-red-900/30')}>
              <svg className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className={cn('text-sm font-medium', mainTextColor)}>
                Permanently delete "{orgToDelete?.name}"?
              </p>
              <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                This organization and all its teams, members, and associated data will be permanently deleted. This action cannot be undone.
              </p>
            </div>
          </div>
        }
        confirmText="Delete Organization"
        variant="danger"
        isLight={isLight}
        isLoading={loading}
      />

      {/* Delete SSO Provider Confirmation Modal */}
      <AdminConfirmDialog
        isOpen={deleteSSOConfirmOpen && !!ssoToDelete}
        onClose={() => setDeleteSSOConfirmOpen(false)}
        onConfirm={confirmDeleteSSOProvider}
        title="Delete SSO Provider"
        message={
          <div className="flex items-start gap-3">
            <div className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', isLight ? 'bg-red-100' : 'bg-red-900/30')}>
              <svg className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className={cn('text-sm font-medium', mainTextColor)}>
                Remove SSO provider for "{ssoToDelete?.domain}"?
              </p>
              <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                Users will no longer be able to sign in with SSO using this domain. Existing users will need to use email/password or another login method.
              </p>
            </div>
          </div>
        }
        confirmText="Delete Provider"
        variant="danger"
        isLight={isLight}
        isLoading={ssoLoading}
      />
    </div>
  );
}

