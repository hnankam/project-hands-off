/**
 * Teams Tab Component for Admin Page
 */

import React, { useState, useEffect } from 'react';
import { authClient } from '../../lib/auth-client';
import { useAuth } from '../../context/AuthContext';
import { cn } from '@extension/ui';
import { OrganizationSelector } from './OrganizationSelector';

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

interface Member {
  id: string;
  userId: string;
  organizationId: string;
  role: string | string[];
  user: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string | Date;
}

interface TeamsTabProps {
  isLight: boolean;
  organizations: Organization[];
  preselectedOrgId?: string;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
}

const TeamSkeletonCard: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div
    className={cn(
      'rounded-lg border',
      isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
    )}>
    <div className="p-3 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className={cn('h-3 w-32 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className={cn('h-5 w-16 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
      </div>
      <div className={cn('h-2.5 w-24 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
      <div className="space-y-2">
        <div className={cn('h-2 w-full rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
        <div className={cn('h-2 w-5/6 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
      </div>
    </div>
  </div>
);

export function TeamsTab({ isLight, organizations, preselectedOrgId, onError, onSuccess }: TeamsTabProps) {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedOrgForTeam, setSelectedOrgForTeam] = useState(preselectedOrgId || '');
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [showCreateTeamForm, setShowCreateTeamForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteTeamConfirmOpen, setDeleteTeamConfirmOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<{ id: string; name: string } | null>(null);
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set());
  const [teamMembers, setTeamMembers] = useState<Record<string, Member[]>>({});
  const [userRole, setUserRole] = useState<string[]>([]);
  const [canManageTeams, setCanManageTeams] = useState(false);
  const [userTeamIds, setUserTeamIds] = useState<Set<string>>(new Set()); // Track teams user is member of
  const [teamsLoading, setTeamsLoading] = useState(false);

  // Auto-select organization if there's only one
  useEffect(() => {
    if (!selectedOrgForTeam && !preselectedOrgId && organizations.length === 1) {
      setSelectedOrgForTeam(organizations[0].id);
    }
  }, [organizations, selectedOrgForTeam, preselectedOrgId]);

  useEffect(() => {
    if (selectedOrgForTeam) {
      loadUserRoleAndTeams(selectedOrgForTeam);
    } else {
      setTeams([]);
      setTeamMembers({});
      setTeamsLoading(false);
    }
  }, [selectedOrgForTeam]);

  useEffect(() => {
    if (preselectedOrgId && preselectedOrgId !== selectedOrgForTeam) {
      setSelectedOrgForTeam(preselectedOrgId);
    }
  }, [preselectedOrgId]);

  const loadUserRoleAndTeams = async (organizationId: string) => {
    setTeamsLoading(true);
    try {
      // First, get the full organization data including member info
      const { data: fullOrg } = await (authClient.organization as any).getFullOrganization({
        organizationId,
      });

      let memberRoles: string[] = [];
      let canManage = false;

      if (fullOrg?.members && user?.id) {
        // Find current user's membership
        const currentMember = fullOrg.members.find((m: any) => m.userId === user.id);
        
        if (currentMember) {
          memberRoles = Array.isArray(currentMember.role) 
            ? currentMember.role 
            : [currentMember.role];
          
          // User can manage teams if they're owner or admin
          canManage = memberRoles.includes('owner') || memberRoles.includes('admin');
        }
      }

      setUserRole(memberRoles);
      setCanManageTeams(canManage);

      // Now load teams
      const { data: allTeams, error } = await (authClient.organization as any).listTeams({
        query: { organizationId },
      });

      if (error) throw new Error(error.message);

      // If user is a member (not owner/admin), filter teams to only show those they belong to
      if (memberRoles.includes('member') && !canManage && user?.id) {
        const userTeams: Team[] = [];
        const userTeamIdsSet = new Set<string>();
        
        for (const team of allTeams || []) {
          try {
            const { data: teamMembersData } = await (authClient.organization as any).listTeamMembers({
              query: { teamId: team.id },
            });

            // Check if user is a member of this team
            const isMember = teamMembersData?.some((tm: any) => tm.userId === user.id);
            if (isMember) {
              userTeams.push(team);
              userTeamIdsSet.add(team.id);
            }
          } catch (err) {
            console.error(`Failed to check membership for team ${team.id}:`, err);
          }
        }
        
        setTeams(userTeams);
        setUserTeamIds(userTeamIdsSet);
      } else {
        // Owner and admin can see all teams and access all team members
        setTeams(allTeams || []);
        // Owners/admins can access all team members, so we set all team IDs
        const allTeamIdsSet = new Set<string>((allTeams || []).map((team: Team) => team.id));
        setUserTeamIds(allTeamIdsSet);
      }
    } catch (err: any) {
      console.error('Failed to load user role and teams:', err);
      onError(err.message);
      setUserRole([]);
      setCanManageTeams(false);
      setTeams([]);
      setUserTeamIds(new Set());
    } finally {
      setTeamsLoading(false);
    }
  };

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await (authClient.organization as any).createTeam({
        name: newTeamName,
        organizationId: selectedOrgForTeam,
      });

      if (error) {
        throw new Error(error.message || JSON.stringify(error));
      }

      console.log('Team created:', data);
      
      // Backend hook should add the creator, but if it fails, try from frontend
      if (data && user) {
        const teamId = data.id || data.data?.id || data.teamId;
        
        if (teamId && user.id) {
          try {
          console.log('Adding creator to team:', { teamId, userId: user.id });
          await (authClient.organization as any).addTeamMember({
            teamId,
            userId: user.id,
          });
          console.log('✅ Creator added to team');
          
          // Wait briefly to allow backend to process the member addition
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (memberError: any) {
          console.warn('Could not add creator to team:', memberError);
          // Don't fail the team creation
        }
      }
    }

    onSuccess(`Team "${newTeamName}" created successfully!`);
    setNewTeamName('');
    setShowCreateTeamForm(false);
    await loadUserRoleAndTeams(selectedOrgForTeam);
    } catch (err: any) {
      onError(err.message || 'Failed to create team. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const startEditTeam = (team: Team) => {
    setEditingTeamId(team.id);
    setEditTeamName(team.name);
  };

  const cancelEditTeam = () => {
    setEditingTeamId(null);
    setEditTeamName('');
  };

  const updateTeam = async (teamId: string) => {
    setLoading(true);

    try {
      const { data, error } = await (authClient.organization as any).updateTeam({
        teamId,
        data: {
          name: editTeamName,
        },
      });

      if (error) throw new Error(error.message);

      onSuccess(`Team updated successfully!`);
      setEditingTeamId(null);
      setEditTeamName('');
      await loadUserRoleAndTeams(selectedOrgForTeam);
    } catch (err: any) {
      onError(err.message || 'Failed to update team');
    } finally {
      setLoading(false);
    }
  };

  const openDeleteTeamConfirm = (teamId: string, teamName: string) => {
    setTeamToDelete({ id: teamId, name: teamName });
    setDeleteTeamConfirmOpen(true);
  };

  const confirmDeleteTeam = async () => {
    if (!teamToDelete) return;

    setLoading(true);

    try {
      const { error } = await (authClient.organization as any).removeTeam({
        teamId: teamToDelete.id,
        organizationId: selectedOrgForTeam,
      });

      if (error) throw new Error(error.message);

      onSuccess(`Team "${teamToDelete.name}" deleted successfully!`);
      setDeleteTeamConfirmOpen(false);
      setTeamToDelete(null);
      await loadUserRoleAndTeams(selectedOrgForTeam);
    } catch (err: any) {
      onError(err.message || 'Failed to delete team');
      setDeleteTeamConfirmOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const toggleTeamExpansion = async (teamId: string) => {
    setExpandedTeamIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
        // Only load team members if:
        // 1. We haven't loaded them yet
        // 2. User has access to this team (is member or owner/admin)
        if (!teamMembers[teamId] && userTeamIds.has(teamId)) {
          loadTeamMembersExpanded(teamId);
        }
      }
      return newSet;
    });
  };

  const loadTeamMembersExpanded = async (teamId: string) => {
    try {
      const { data: membersData, error } = await (authClient.organization as any).listTeamMembers({
        query: { teamId },
      });

      if (error) {
        // Don't show error if it's just a permission issue
        if (error.code === 'USER_IS_NOT_A_MEMBER_OF_THE_TEAM') {
          console.log(`Skipping team ${teamId}: user is not a member`);
          return;
        }
        throw new Error(error.message);
      }

      const membersWithDetails = await Promise.all(
        (membersData || []).map(async (tm: any) => {
          try {
            const orgMembers = await authClient.organization.listMembers({
              query: { organizationId: selectedOrgForTeam },
            });

            const fullMember = orgMembers.data?.members?.find((m: any) => m.userId === tm.userId);
            
            return {
              id: tm.id,
              userId: tm.userId,
              organizationId: selectedOrgForTeam,
              role: fullMember?.role || 'member',
              user: {
                id: tm.userId,
                name: fullMember?.user?.name || 'Unknown',
                email: fullMember?.user?.email || tm.userId,
              },
              createdAt: tm.createdAt,
            };
          } catch {
            return {
              id: tm.id,
              userId: tm.userId,
              organizationId: selectedOrgForTeam,
              role: 'member',
              user: {
                id: tm.userId,
                name: 'Unknown',
                email: tm.userId,
              },
              createdAt: tm.createdAt,
            };
          }
        })
      );

      setTeamMembers(prev => ({
        ...prev,
        [teamId]: membersWithDetails,
      }));
    } catch (err: any) {
      console.error('Error loading team members:', err);
    }
  };

  return (
    <div>
      {/* Organization Selector */}
      <div className="mb-4">
        <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
          Select Organization
        </label>
        <OrganizationSelector
          isLight={isLight}
          organizations={organizations}
          selectedOrgId={selectedOrgForTeam}
          onOrgChange={setSelectedOrgForTeam}
          placeholder="Select an organization..."
        />
      </div>

      {selectedOrgForTeam && (
        <>
          {/* Header with Icon, Count, and New Button */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                Teams <span className={cn('text-xs font-normal', isLight ? 'text-gray-500' : 'text-gray-400')}>({teams.length})</span>
              </h3>
            </div>
            {canManageTeams && (
              <button
                onClick={() => setShowCreateTeamForm(!showCreateTeamForm)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                  isLight
                    ? 'text-blue-600 hover:bg-blue-50 border border-blue-200'
                    : 'text-blue-400 hover:bg-blue-900/20 border border-blue-800',
                )}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {showCreateTeamForm ? 'Cancel' : 'New'}
              </button>
            )}
          </div>

          {/* Create Form - Compact Card */}
          {showCreateTeamForm && (
            <form
              onSubmit={createTeam}
              className={cn(
                'mb-3 pt-3 pb-5 pr-8 pl-8 rounded-lg border',
                isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
              )}>
              <div className="space-y-2.5">
                <div>
                  <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Team Name
                  </label>
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    placeholder="Engineering, Sales, Marketing..."
                    required
                    className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                      isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                    )}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    'flex-1 px-4 py-1.5 text-xs rounded transition-colors font-medium',
                    isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                    loading && 'opacity-50 cursor-not-allowed',
                  )}>
                  {loading ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateTeamForm(false)}
                  className={cn(
                    'px-4 py-1.5 text-xs rounded transition-colors font-medium',
                    isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                  )}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Teams List - Compact Cards */}
          <div className="space-y-2">
            {teamsLoading && teams.length === 0 ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <TeamSkeletonCard key={`team-skeleton-${idx}`} isLight={isLight} />
              ))
            ) : (
              <>
            {teams.map(team => (
              <div
                key={team.id}
                className={cn(
                  'rounded-lg border',
                  isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
                )}>
                {editingTeamId === team.id ? (
                  /* Edit Mode */
                  <div className="space-y-2.5 pt-3 pb-5 pr-8 pl-8">
                    <div>
                      <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                        Team Name
                      </label>
                      <input
                        type="text"
                        value={editTeamName}
                        onChange={e => setEditTeamName(e.target.value)}
                        className={cn(
                          'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                          isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                        )}
                      />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => updateTeam(team.id)}
                        disabled={loading}
                        className={cn(
                          'flex-1 px-4 py-1.5 text-xs rounded transition-colors font-medium',
                          isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                          loading && 'opacity-50 cursor-not-allowed',
                        )}>
                        {loading ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEditTeam}
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
                      <h4 className={cn('font-semibold text-xs truncate', isLight ? 'text-gray-900' : 'text-gray-100')}>
                        {team.name}
                      </h4>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Expand/Collapse Icon */}
                        <button
                          onClick={() => toggleTeamExpansion(team.id)}
                          className={cn(
                            'p-1 rounded transition-all duration-200',
                            isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
                          )}
                          title={expandedTeamIds.has(team.id) ? "Collapse" : "Expand members"}>
                          <svg 
                            className={cn('w-3.5 h-3.5 transition-transform duration-300 ease-in-out', expandedTeamIds.has(team.id) && 'rotate-180')} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24" 
                            strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {canManageTeams && (
                          <button
                            onClick={() => startEditTeam(team)}
                            className={cn(
                              'p-1 rounded transition-colors',
                              isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
                            )}
                            title="Edit">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        )}
                        {canManageTeams && (
                          <button
                            onClick={() => openDeleteTeamConfirm(team.id, team.name)}
                            className={cn(
                              'p-1 rounded transition-colors',
                              isLight ? 'text-red-600 hover:bg-red-50' : 'text-red-400 hover:bg-red-900/20',
                            )}
                            title="Delete">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Row 2: Created Date */}
                    <div className={cn('text-[11px]', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      <span className="whitespace-nowrap">
                        Created {typeof team.createdAt === 'string' 
                          ? new Date(team.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : team.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>

                    {/* Expanded Members Section */}
                    <div 
                      className={cn(
                        'overflow-hidden transition-all ease-in-out',
                        expandedTeamIds.has(team.id) 
                          ? 'max-h-[500px] opacity-100 mt-3 duration-500' 
                          : 'max-h-0 opacity-0 mt-0 duration-400'
                      )}>
                      <div 
                        className={cn(
                          'pt-3 border-t transition-all ease-in-out',
                          isLight ? 'border-gray-200' : 'border-gray-700',
                          expandedTeamIds.has(team.id) 
                            ? 'translate-y-0 duration-300 delay-100' 
                            : '-translate-y-4 duration-200'
                        )}>
                        {!userTeamIds.has(team.id) ? (
                          <div className={cn(
                            'text-center py-4 transition-opacity ease-in-out',
                            expandedTeamIds.has(team.id) 
                              ? 'opacity-100 duration-400 delay-200' 
                              : 'opacity-0 duration-150'
                          )}>
                            <svg className={cn(
                              'w-5 h-5 mx-auto mb-2 opacity-50',
                              isLight ? 'text-gray-400' : 'text-gray-500'
                            )} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <p className={cn('text-[11px] mb-3', isLight ? 'text-gray-500' : 'text-gray-400')}>
                              You're not a member of this team
                            </p>
                            {canManageTeams && user && (
                              <button
                                onClick={async () => {
                                  try {
                                    await (authClient.organization as any).addTeamMember({
                                      teamId: team.id,
                                      userId: user.id,
                                    });
                                    onSuccess('Successfully joined team!');
                                    await loadUserRoleAndTeams(selectedOrgForTeam);
                                  } catch (error: any) {
                                    onError(error.message || 'Failed to join team');
                                  }
                                }}
                                className={cn(
                                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                                  isLight
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                )}
                              >
                                Join Team
                              </button>
                            )}
                          </div>
                        ) : teamMembers[team.id] ? (
                          <div className={cn(
                            'transition-opacity ease-in-out',
                            expandedTeamIds.has(team.id) 
                              ? 'opacity-100 duration-400 delay-200' 
                              : 'opacity-0 duration-150'
                          )}>
                            {teamMembers[team.id].length > 0 ? (
                              <div className="space-y-2">
                                <h5 className={cn('text-[10px] font-semibold uppercase mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                  Members ({teamMembers[team.id].length})
                                </h5>
                                <div className="space-y-1">
                                  {teamMembers[team.id].map((member, index) => (
                                    <div
                                      key={member.id}
                                      className={cn(
                                        'flex items-center justify-between px-2 py-1.5 rounded text-[11px] transition-all',
                                        isLight ? 'bg-gray-50 hover:bg-gray-100' : 'bg-gray-800/50 hover:bg-gray-800',
                                      )}
                                      style={{ 
                                        transitionDuration: expandedTeamIds.has(team.id) ? '300ms' : '150ms',
                                        transitionDelay: expandedTeamIds.has(team.id) ? `${200 + index * 30}ms` : '0ms',
                                        opacity: expandedTeamIds.has(team.id) ? 1 : 0,
                                        transform: expandedTeamIds.has(team.id) ? 'translateX(0)' : 'translateX(-10px)'
                                      }}>
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <svg className="w-3 h-3 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        <div className="flex flex-col min-w-0">
                                          <span className={cn('truncate font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                                            {member.user.name}
                                          </span>
                                          <span className={cn('truncate text-[10px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                            {member.user.email}
                                          </span>
                                        </div>
                                      </div>
                                      <span className={cn('text-[10px] px-2 py-0.5 rounded transition-colors flex-shrink-0', isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-300')}>
                                        {Array.isArray(member.role) ? member.role[0] : member.role}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className={cn('text-[11px] text-center py-3', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                No members yet
                              </p>
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
            {teams.length === 0 && !showCreateTeamForm && (
              <div className={cn(
                'text-center py-8 text-xs rounded-lg border',
                isLight ? 'text-gray-500 border-gray-200 bg-gray-50' : 'text-gray-400 border-gray-700 bg-[#151C24]',
              )}>
                <p>No teams yet.</p>
                <button
                  onClick={() => setShowCreateTeamForm(true)}
                  className={cn(
                    'mt-2 text-xs font-medium',
                    isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300',
                  )}>
                  Create your first team
                </button>
              </div>
            )}
              </>
            )}
          </div>
        </>
      )}

      {!selectedOrgForTeam && organizations.length > 0 && (
        <div className={cn(
          'text-center py-8 text-xs rounded-lg border',
          isLight ? 'text-gray-500 border-gray-200 bg-gray-50' : 'text-gray-400 border-gray-700 bg-[#151C24]',
        )}>
          <p>Please select an organization to manage teams.</p>
        </div>
      )}

      {/* Delete Team Confirmation Modal */}
      {deleteTeamConfirmOpen && teamToDelete && (
        <>
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteTeamConfirmOpen(false)}
          />

          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}>
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Delete Team
                </h2>
                <button
                  onClick={() => setDeleteTeamConfirmOpen(false)}
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

              <div className="space-y-3 px-3 py-4">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                      isLight ? 'bg-red-100' : 'bg-red-900/30',
                    )}>
                    <svg
                      className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')}
                      fill="currentColor"
                      viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>

                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Permanently delete "{teamToDelete.name}"?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      This team and all its members will be permanently removed. This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  'flex items-center justify-end gap-2 border-t px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <button
                  onClick={() => setDeleteTeamConfirmOpen(false)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}>
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteTeam}
                  disabled={loading}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-red-600 text-white hover:bg-red-700',
                    loading && 'opacity-50 cursor-not-allowed',
                  )}>
                  {loading ? 'Deleting...' : 'Delete Team'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

