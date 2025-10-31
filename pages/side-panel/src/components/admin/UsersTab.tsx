/**
 * Users Tab Component for Admin Page
 */

import React, { useState, useEffect, useMemo } from 'react';
import { authClient } from '../../lib/auth-client';
import { cn } from '@extension/ui';
import { OrganizationSelector } from './OrganizationSelector';
import { TeamSelector } from './TeamSelector';
import { RoleSelector } from './RoleSelector';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: any;
  createdAt: string | Date;
}

interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

interface Member {
  id: string;
  userId: string;
  organizationId: string;
  role: string | string[];
  user: User;
  createdAt: string | Date;
}

interface Team {
  id: string;
  name: string;
  organizationId: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  status: string;
  expiresAt: string | Date;
  inviterId: string;
  createdAt: string | Date;
}

interface UsersTabProps {
  isLight: boolean;
  organizations: Organization[];
  preselectedOrgId?: string;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
}

// Available roles with descriptions
const ROLES = [
  { value: 'member', label: 'Member', description: 'Standard access' },
  { value: 'admin', label: 'Admin', description: 'Full management access' },
  { value: 'owner', label: 'Owner', description: 'Complete control' },
];

export function UsersTab({ isLight, organizations, preselectedOrgId, onError, onSuccess }: UsersTabProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedOrgForUsers, setSelectedOrgForUsers] = useState(preselectedOrgId || '');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]); // empty array means all teams
  const [teamMembers, setTeamMembers] = useState<Record<string, string[]>>({}); // teamId -> userIds[]
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteTeamIds, setInviteTeamIds] = useState<string[]>([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editMemberName, setEditMemberName] = useState('');
  const [editMemberRole, setEditMemberRole] = useState('');
  const [editMemberTeams, setEditMemberTeams] = useState<string[]>([]);
  const [deleteUserConfirmOpen, setDeleteUserConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: string; email: string } | null>(null);
  const [cancelInviteConfirmOpen, setCancelInviteConfirmOpen] = useState(false);
  const [inviteToCancel, setInviteToCancel] = useState<{ id: string; email: string } | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string[]>([]);
  const [isCurrentUserOwner, setIsCurrentUserOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  // Auto-select organization if there's only one
  useEffect(() => {
    if (!selectedOrgForUsers && organizations.length === 1) {
      setSelectedOrgForUsers(organizations[0].id);
    }
  }, [organizations, selectedOrgForUsers]);

  useEffect(() => {
    if (selectedOrgForUsers) {
      setRoleLoaded(false); // Reset role loaded state
      loadMembers(selectedOrgForUsers);
      loadInvitations(selectedOrgForUsers);
      loadCurrentUserRole(selectedOrgForUsers);
    }
  }, [selectedOrgForUsers]);

  // Load teams after user role is determined
  useEffect(() => {
    if (selectedOrgForUsers && roleLoaded) {
      loadTeams(selectedOrgForUsers);
    }
  }, [selectedOrgForUsers, roleLoaded]);

  // Reset team filter when org changes
  useEffect(() => {
    setSelectedTeamIds([]);
  }, [selectedOrgForUsers]);

  const loadMembers = async (orgId: string) => {
    try {
      const { data, error } = await authClient.organization.listMembers({
        query: { organizationId: orgId },
      });

      if (error) throw new Error(error.message);

      setMembers(data?.members || []);
    } catch (err: any) {
      onError(err.message || 'Failed to load members');
    }
  };

  const loadInvitations = async (orgId: string) => {
    try {
      const { data, error } = await (authClient.organization as any).listInvitations({
        query: { organizationId: orgId },
      });

      if (error) throw new Error(error.message);

      // Filter to only show pending invitations
      const pendingInvitations = (data || []).filter((inv: Invitation) => inv.status === 'pending');
      setInvitations(pendingInvitations);
    } catch (err: any) {
      console.warn('Failed to load invitations:', err);
      setInvitations([]);
    }
  };

  const loadTeams = async (orgId: string) => {
    try {
      // Set the active organization first for team operations
      try {
        await (authClient.organization as any).setActive({
          organizationId: orgId,
        });
      } catch (err) {
        console.warn('Failed to set active organization:', err);
      }

      const { data, error } = await (authClient.organization as any).listTeams({
        query: { organizationId: orgId },
      });

      if (error) throw new Error(error.message);

      const allTeams = data || [];
      
      // Determine if user is owner/admin or member
      const isOwnerOrAdmin = canManageUsers;
      
      let teamsToShow: Team[] = [];
      const teamMembersMap: Record<string, string[]> = {};
      
      if (isOwnerOrAdmin) {
        // Owners and admins can see and manage all teams
        teamsToShow = allTeams;
        
        // Load team members for all teams
        await Promise.all(
          allTeams.map(async (team: Team) => {
            console.log(`[UsersTab] Loading members for team ${team.name} (${team.id})`);
            try {
              const result = await (authClient.organization as any).listTeamMembers({
                query: { teamId: team.id },
              });
              
              console.log(`[UsersTab] Response for team ${team.name}:`, result);
              
              const { data: teamMemberData, error: teamError } = result;
              
              if (teamError) {
                if (teamError.code !== 'USER_IS_NOT_A_MEMBER_OF_THE_TEAM') {
                  console.warn(`Failed to list members for team ${team.name}:`, teamError);
                }
                teamMembersMap[team.id] = [];
                return;
              }
              
              console.log(`[UsersTab] Team ${team.name} has ${teamMemberData?.length || 0} members`);
              teamMembersMap[team.id] = (teamMemberData || []).map((tm: any) => tm.userId);
            } catch (error: any) {
              console.error(`[UsersTab] Exception for team ${team.name}:`, error);
              if (error?.code !== 'USER_IS_NOT_A_MEMBER_OF_THE_TEAM') {
                console.warn(`Exception listing members for team ${team.name}:`, error);
              }
              teamMembersMap[team.id] = [];
            }
          })
        );
      } else {
        // Members can only see teams they're part of
        const userTeams: Team[] = [];
        
        for (const team of allTeams) {
          try {
            const result = await (authClient.organization as any).listTeamMembers({
              query: { teamId: team.id },
            });
            
            const { data: teamMemberData, error: teamError } = result;
            
            if (!teamError && teamMemberData) {
              // Check if current user is a member of this team
              const isMember = teamMemberData.some((tm: any) => tm.userId === currentUserId);
              
              if (isMember) {
                userTeams.push(team);
                teamMembersMap[team.id] = teamMemberData.map((tm: any) => tm.userId);
                console.log(`[UsersTab] User is member of team ${team.name}`);
              }
            }
          } catch (error: any) {
            // Silently skip teams user doesn't have access to
            console.log(`[UsersTab] Skipping team ${team.name}: user is not a member`);
          }
        }
        
        teamsToShow = userTeams;
      }
      
      console.log('[UsersTab] Final teams to show:', teamsToShow.length);
      console.log('[UsersTab] Final team members map:', teamMembersMap);
      setTeams(teamsToShow);
      setTeamMembers(teamMembersMap);
    } catch (err: any) {
      console.warn('Failed to load teams:', err);
      setTeams([]);
      setTeamMembers({});
    }
  };

  const loadCurrentUserRole = async (orgId: string) => {
    try {
      // Get the full organization data including member info
      const { data: fullOrg } = await (authClient.organization as any).getFullOrganization({
        organizationId: orgId,
      });

      if (fullOrg?.members) {
        // Get current user's session
        const session = await authClient.getSession();
        const userId = session?.data?.user?.id;
        
        if (userId) {
          setCurrentUserId(userId);
          
          // Find current user's membership
          const currentMember = fullOrg.members.find((m: any) => m.userId === userId);
          
          if (currentMember) {
            const memberRoles = Array.isArray(currentMember.role) 
              ? currentMember.role 
              : [currentMember.role];
            setCurrentUserRole(memberRoles);
            setIsCurrentUserOwner(memberRoles.includes('owner'));
          } else {
            setCurrentUserRole([]);
            setIsCurrentUserOwner(false);
          }
        } else {
          setCurrentUserId(null);
        }
      }
    } catch (err) {
      console.error('Failed to load current user role:', err);
      setCurrentUserRole([]);
      setIsCurrentUserOwner(false);
      setCurrentUserId(null);
    } finally {
      setRoleLoaded(true);
    }
  };

  // Filter available roles - only owners can assign the owner role
  const availableRoles = useMemo(() => {
    if (isCurrentUserOwner) {
      return ROLES; // Owners can assign any role including owner
    }
    // Non-owners cannot assign the owner role
    return ROLES.filter(role => role.value !== 'owner');
  }, [isCurrentUserOwner]);

  // Check if current user can manage users (owner or admin)
  const canManageUsers = useMemo(() => {
    return currentUserRole.includes('owner') || currentUserRole.includes('admin');
  }, [currentUserRole]);

  // Filter members based on selected teams
  const filteredMembers = useMemo(() => {
    if (selectedTeamIds.length === 0) {
      return members; // Show all members when no teams selected
    }
    // Show members that belong to ANY of the selected teams
    const selectedTeamUserIds = new Set<string>();
    selectedTeamIds.forEach(teamId => {
      const userIds = teamMembers[teamId] || [];
      userIds.forEach(userId => selectedTeamUserIds.add(userId));
    });
    return members.filter(member => selectedTeamUserIds.has(member.userId));
  }, [members, selectedTeamIds, teamMembers]);

  // Filter invitations based on selected teams
  // Invitations are organization-level, so when teams are selected, hide them
  const filteredInvitations = useMemo(() => {
    if (selectedTeamIds.length === 0) {
      return invitations; // Show all invitations when no teams selected
    }
    return []; // Hide invitations when filtering by specific teams (they're not team-specific yet)
  }, [invitations, selectedTeamIds]);

  // Combine members and invitations for display
  const totalUsersCount = filteredMembers.length + filteredInvitations.length;

  const inviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await (authClient.organization as any).inviteMember({
        email: inviteEmail,
        role: inviteRole,
        organizationId: selectedOrgForUsers,
      });

      if (error) throw new Error(error.message);

      // Note: Team assignment for invited users should be handled after invitation acceptance
      // The inviteTeamIds are selected but need backend support for automatic team assignment
      // For now, admins can manually add users to teams after they accept

      onSuccess(`Invitation sent to ${inviteEmail}${inviteTeamIds.length > 0 ? ' - Please add to team(s) after acceptance' : ''}`);
      setInviteEmail('');
      setInviteRole('member');
      setInviteTeamIds([]);
      setShowInviteForm(false);
      await loadMembers(selectedOrgForUsers);
      await loadInvitations(selectedOrgForUsers);
    } catch (err: any) {
      onError(err.message || 'Failed to invite user');
    } finally {
      setLoading(false);
    }
  };

  const startEditMember = (member: Member) => {
    setEditingMemberId(member.id);
    setEditMemberName(member.user.name || '');
    setEditMemberRole(Array.isArray(member.role) ? member.role[0] : member.role);
    
    // Find all teams this user is a member of
    const userTeams = Object.entries(teamMembers)
      .filter(([teamId, userIds]) => userIds.includes(member.userId))
      .map(([teamId]) => teamId);
    setEditMemberTeams(userTeams);
  };

  const cancelEditMember = () => {
    setEditingMemberId(null);
    setEditMemberName('');
    setEditMemberRole('');
    setEditMemberTeams([]);
  };

  const updateMemberRole = async (memberId: string, userId: string) => {
    setLoading(true);

    try {
      const isCurrentUser = userId === currentUserId;

      // If current user is editing their own profile, update name
      if (isCurrentUser) {
        if (!editMemberName.trim()) {
          onError('Name cannot be empty');
          setLoading(false);
          return;
        }

        const { error: nameError } = await authClient.updateUser({
          name: editMemberName.trim(),
        });

        if (nameError) throw new Error(nameError.message);
      } else {
        // Set the active organization first (required for team operations)
        await (authClient.organization as any).setActive({
          organizationId: selectedOrgForUsers,
        });

        // Update role (only for other users, not current user)
        const { error } = await (authClient.organization as any).updateMemberRole({
          memberId,
          role: editMemberRole,
          organizationId: selectedOrgForUsers,
        });

        if (error) throw new Error(error.message);

        // Update team memberships
        // Find teams to add (in editMemberTeams but not in current teams)
        const currentTeams = Object.entries(teamMembers)
          .filter(([teamId, userIds]) => userIds.includes(userId))
          .map(([teamId]) => teamId);
        
        const teamsToAdd = editMemberTeams.filter(teamId => !currentTeams.includes(teamId));
        const teamsToRemove = currentTeams.filter(teamId => !editMemberTeams.includes(teamId));

        // Add user to new teams
        for (const teamId of teamsToAdd) {
          try {
            await (authClient.organization as any).addTeamMember({
              teamId,
              userId,
            });
          } catch (err: any) {
            console.warn(`Failed to add user to team ${teamId}:`, err);
            onError(`Failed to add user to team: ${err.message || 'Unknown error'}`);
          }
        }

        // Remove user from teams
        for (const teamId of teamsToRemove) {
          try {
            await (authClient.organization as any).removeTeamMember({
              teamId,
              userId,
            });
          } catch (err: any) {
            console.warn(`Failed to remove user from team ${teamId}:`, err);
            onError(`Failed to remove user from team: ${err.message || 'Unknown error'}`);
          }
        }
      }

      onSuccess(isCurrentUser ? 'Profile updated successfully!' : 'Member updated successfully!');
      setEditingMemberId(null);
      setEditMemberName('');
      setEditMemberRole('');
      setEditMemberTeams([]);
      await loadMembers(selectedOrgForUsers);
      await loadTeams(selectedOrgForUsers);
    } catch (err: any) {
      onError(err.message || 'Failed to update member');
    } finally {
      setLoading(false);
    }
  };

  const openDeleteUserConfirm = (memberId: string, userEmail: string) => {
    setUserToDelete({ id: memberId, email: userEmail });
    setDeleteUserConfirmOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    setLoading(true);

    try {
      const { error } = await (authClient.organization as any).removeMember({
        memberIdOrEmail: userToDelete.email,
        organizationId: selectedOrgForUsers,
      });

      if (error) throw new Error(error.message);

      onSuccess(`User ${userToDelete.email} removed successfully!`);
      setDeleteUserConfirmOpen(false);
      setUserToDelete(null);
      await loadMembers(selectedOrgForUsers);
    } catch (err: any) {
      onError(err.message || 'Failed to remove user');
      setDeleteUserConfirmOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const openCancelInviteConfirm = (invitationId: string, email: string) => {
    setInviteToCancel({ id: invitationId, email });
    setCancelInviteConfirmOpen(true);
  };

  const confirmCancelInvite = async () => {
    if (!inviteToCancel) return;

    setLoading(true);

    try {
      const { error } = await (authClient.organization as any).cancelInvitation({
        invitationId: inviteToCancel.id,
      });

      if (error) throw new Error(error.message);

      onSuccess(`Invitation for ${inviteToCancel.email} cancelled successfully!`);
      setCancelInviteConfirmOpen(false);
      setInviteToCancel(null);
      await loadInvitations(selectedOrgForUsers);
    } catch (err: any) {
      onError(err.message || 'Failed to cancel invitation');
      setCancelInviteConfirmOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const resendInvitation = async (invitation: Invitation) => {
    setLoading(true);

    try {
      // Resend by calling the invite member API with the existing invitation details
      const { error } = await (authClient.organization as any).inviteMember({
        email: invitation.email,
        role: invitation.role,
        organizationId: selectedOrgForUsers,
        resend: true,
      });

      if (error) throw new Error(error.message);

      onSuccess(`Invitation resent to ${invitation.email}`);
      await loadInvitations(selectedOrgForUsers);
    } catch (err: any) {
      onError(err.message || 'Failed to resend invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Organization and Team Selectors */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Select Organization
          </label>
          <OrganizationSelector
            isLight={isLight}
            organizations={organizations}
            selectedOrgId={selectedOrgForUsers}
            onOrgChange={(orgId) => {
              setSelectedOrgForUsers(orgId);
              setSelectedTeamIds([]); // Reset team filter when org changes
            }}
            placeholder="Select an organization..."
          />
        </div>
        <div>
          <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Filter by Team
          </label>
          <TeamSelector
            isLight={isLight}
            teams={teams}
            selectedTeamIds={selectedTeamIds}
            onTeamChange={setSelectedTeamIds}
            placeholder="All teams"
            allowEmpty={true}
          />
        </div>
      </div>

      {selectedOrgForUsers && (
        <>
          {/* Header with Icon, Count, and Invite Button */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                Users <span className={cn('text-xs font-normal', isLight ? 'text-gray-500' : 'text-gray-400')}>({totalUsersCount})</span>
              </h3>
            </div>
            {canManageUsers && (
              <button
                onClick={() => setShowInviteForm(!showInviteForm)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                  isLight
                    ? 'text-blue-600 hover:bg-blue-50 border border-blue-200'
                    : 'text-blue-400 hover:bg-blue-900/20 border border-blue-800',
                )}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {showInviteForm ? 'Cancel' : 'Invite'}
              </button>
            )}
          </div>

          {/* Invite User Form */}
          {showInviteForm && (
            <form
              onSubmit={inviteUser}
              className={cn(
                'mb-3 pt-3 pb-5 pr-8 pl-8 rounded-lg border',
                isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
              )}>
              <div className="space-y-2.5">
                <div>
                  <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="[email protected]"
                    required
                    className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                      isLight
                        ? 'bg-white border-gray-300 text-gray-900'
                        : 'bg-[#151C24] border-gray-600 text-white',
                    )}
                  />
                </div>
                <div>
                  <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Role
                  </label>
                  <RoleSelector
                    isLight={isLight}
                    roles={availableRoles}
                    selectedRole={inviteRole}
                    onRoleChange={setInviteRole}
                    placeholder="Select role"
                  />
                </div>
                {teams.length > 0 && (
                  <div>
                    <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      Teams <span className="text-red-500">*</span>
                    </label>
                    <TeamSelector
                      isLight={isLight}
                      teams={teams}
                      selectedTeamIds={inviteTeamIds}
                      onTeamChange={setInviteTeamIds}
                      placeholder="Select teams"
                      allowEmpty={false}
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="submit"
                  disabled={loading || !inviteEmail || (teams.length > 0 && inviteTeamIds.length === 0)}
                  className={cn(
                    'flex-1 px-4 py-1.5 text-xs rounded transition-colors font-medium',
                    isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                    (loading || (teams.length > 0 && inviteTeamIds.length === 0)) && 'opacity-50 cursor-not-allowed',
                  )}>
                  {loading ? 'Sending...' : 'Send Invitation'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteForm(false);
                    setInviteEmail('');
                    setInviteRole('member');
                    setInviteTeamIds([]);
                  }}
                  className={cn(
                    'px-4 py-1.5 text-xs rounded transition-colors font-medium',
                    isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                  )}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Members List */}
          <div className="space-y-2">
            {filteredMembers.length === 0 && invitations.length === 0 ? (
              <div
                className={cn(
                  'p-8 rounded-lg border-2 border-dashed text-center',
                  isLight ? 'border-gray-300 bg-gray-50' : 'border-gray-700 bg-[#151C24]/50',
                )}>
                <svg
                  className={cn('w-12 h-12 mx-auto mb-3', isLight ? 'text-gray-400' : 'text-gray-600')}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                <p className={cn('text-sm font-medium', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  No users in this organization
                </p>
                <p className={cn('text-xs mt-1', isLight ? 'text-gray-500' : 'text-gray-500')}>
                  Invite users to get started
                </p>
              </div>
            ) : (
              <>
                {/* Pending Invitations */}
                {filteredInvitations.map(invitation => (
                  <div
                    key={`invite-${invitation.id}`}
                    className={cn(
                      'p-3 rounded-lg border transition-all',
                      isLight
                        ? 'bg-yellow-50 border-yellow-200 hover:border-yellow-300 hover:shadow-sm'
                        : 'bg-yellow-900/10 border-yellow-800 hover:border-yellow-700',
                    )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                            isLight ? 'bg-yellow-100 text-yellow-600' : 'bg-yellow-900/30 text-yellow-400',
                          )}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn('text-sm font-medium truncate', isLight ? 'text-gray-900' : 'text-gray-100')}>
                            Invited User
                          </div>
                          <div className={cn('text-xs truncate', isLight ? 'text-gray-600' : 'text-gray-400')}>
                            {invitation.email}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                                isLight ? 'bg-yellow-100 text-yellow-700' : 'bg-yellow-900/30 text-yellow-400',
                              )}>
                              Pending Invitation
                            </span>
                            <span
                              className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                                isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-900/30 text-purple-400',
                              )}>
                              {invitation.role}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => resendInvitation(invitation)}
                          disabled={loading}
                          className={cn(
                            'p-1 rounded transition-colors',
                            isLight
                              ? 'text-blue-600 hover:bg-blue-50 hover:text-blue-700'
                              : 'text-blue-400 hover:bg-blue-900/20 hover:text-blue-300',
                            loading && 'opacity-50 cursor-not-allowed',
                          )}
                          title="Resend invitation">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                        <button
                          onClick={() => openCancelInviteConfirm(invitation.id, invitation.email)}
                          disabled={loading}
                          className={cn(
                            'p-1 rounded transition-colors',
                            isLight
                              ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                              : 'text-red-400 hover:bg-red-900/20 hover:text-red-300',
                            loading && 'opacity-50 cursor-not-allowed',
                          )}
                          title="Cancel invitation">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Active Members */}
                {filteredMembers.map(member => {
                  const isCurrentUser = member.userId === currentUserId;
                  return (
                  <div
                    key={member.id}
                    className={cn(
                      'p-3 rounded-lg border transition-all',
                      isLight
                        ? isCurrentUser
                          ? 'bg-blue-50/50 border-blue-300 hover:border-blue-400 hover:shadow-sm'
                          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                        : isCurrentUser
                          ? 'bg-blue-900/10 border-blue-500/50 hover:border-blue-400/70'
                          : 'bg-[#151C24] border-gray-700 hover:border-gray-600',
                    )}>
                    {editingMemberId === member.id ? (
                      // Edit Mode
                      <div className="space-y-2.5">
                        <div>
                          <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Name
                          </label>
                          <input
                            type="text"
                            value={editMemberName}
                            onChange={e => setEditMemberName(e.target.value)}
                            disabled={!isCurrentUser}
                            className={cn(
                              'w-full px-3 py-2 text-xs rounded border outline-none transition-colors',
                              isLight
                                ? isCurrentUser
                                  ? 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                                  : 'bg-gray-100 border-gray-300 text-gray-600'
                                : isCurrentUser
                                  ? 'bg-[#151C24] border-gray-600 text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400'
                                  : 'bg-gray-800 border-gray-600 text-gray-400',
                              (!isCurrentUser) && 'opacity-50 cursor-not-allowed',
                            )}
                            placeholder="Enter name"
                          />
                        </div>
                        <div>
                          <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Email
                          </label>
                          <input
                            type="email"
                            value={member.user.email}
                            disabled
                            className={cn(
                              'w-full px-3 py-2 text-xs rounded border outline-none opacity-50 cursor-not-allowed',
                              isLight
                                ? 'bg-gray-100 border-gray-300 text-gray-600'
                                : 'bg-gray-800 border-gray-600 text-gray-400',
                            )}
                          />
                        </div>
                        <div>
                          <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Role
                          </label>
                          {isCurrentUser ? (
                            <input
                              type="text"
                              value={Array.isArray(member.role) ? member.role.join(', ') : member.role}
                              disabled
                              className={cn(
                                'w-full px-3 py-2 text-xs rounded border outline-none opacity-50 cursor-not-allowed',
                                isLight
                                  ? 'bg-gray-100 border-gray-300 text-gray-600'
                                  : 'bg-gray-800 border-gray-600 text-gray-400',
                              )}
                            />
                          ) : (
                            <RoleSelector
                              isLight={isLight}
                              roles={availableRoles}
                              selectedRole={editMemberRole}
                              onRoleChange={setEditMemberRole}
                              placeholder="Select role"
                            />
                          )}
                        </div>
                        {teams.length > 0 && (
                          <div>
                            <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Teams
                            </label>
                            {isCurrentUser ? (
                              <div className="flex flex-wrap gap-1.5">
                                {editMemberTeams.length === 0 ? (
                                  <span className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                    No teams
                                  </span>
                                ) : (
                                  editMemberTeams.map(teamId => {
                                    const team = teams.find(t => t.id === teamId);
                                    return team ? (
                                      <span
                                        key={teamId}
                                        className={cn(
                                          'inline-flex items-center px-2 py-1 rounded text-xs font-medium',
                                          isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-400',
                                        )}>
                                        {team.name}
                                      </span>
                                    ) : null;
                                  })
                                )}
                              </div>
                            ) : (
                              <TeamSelector
                                isLight={isLight}
                                teams={teams}
                                selectedTeamIds={editMemberTeams}
                                onTeamChange={setEditMemberTeams}
                                placeholder="Select teams"
                                allowEmpty={true}
                              />
                            )}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateMemberRole(member.id, member.userId)}
                            disabled={loading}
                            className={cn(
                              'flex-1 px-4 py-1.5 text-xs rounded transition-colors font-medium',
                              isLight
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-blue-500 text-white hover:bg-blue-600',
                              loading && 'opacity-50 cursor-not-allowed',
                            )}>
                            {loading ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEditMember}
                            className={cn(
                              'px-4 py-1.5 text-xs rounded transition-colors font-medium',
                              isLight
                                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                            )}>
                            Cancel
                          </button>
                        </div>
                      </div>
                  ) : (
                    // View Mode
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                            isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400',
                          )}>
                          {member.user.image ? (
                            <img
                              src={member.user.image}
                              alt={member.user.name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-sm font-semibold">
                              {member.user.name?.charAt(0).toUpperCase() || member.user.email.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn('text-sm font-medium truncate', isLight ? 'text-gray-900' : 'text-gray-100')}>
                            {member.user.name || 'Unknown User'}
                          </div>
                          <div className={cn('text-xs truncate', isLight ? 'text-gray-500' : 'text-gray-400')}>
                            {member.user.email}
                          </div>
                          <div className="flex items-center flex-wrap gap-2 mt-1">
                            <span
                              className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                                isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-900/30 text-purple-400',
                              )}>
                              {Array.isArray(member.role) ? member.role.join(', ') : member.role}
                            </span>
                            {/* Show teams this member belongs to */}
                            {Object.entries(teamMembers)
                              .filter(([teamId, userIds]) => userIds.includes(member.userId))
                              .map(([teamId]) => {
                                const team = teams.find(t => t.id === teamId);
                                return team ? (
                                  <span
                                    key={teamId}
                                    className={cn(
                                      'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                                      isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-400',
                                    )}>
                                    {team.name}
                                  </span>
                                ) : null;
                              })}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Show edit button for current user or for admins/owners managing other users */}
                        {(isCurrentUser || (canManageUsers && member.userId !== currentUserId)) && (
                          <button
                            onClick={() => startEditMember(member)}
                            className={cn(
                              'p-1 rounded transition-colors',
                              isLight
                                ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
                            )}
                            title={isCurrentUser ? 'Edit your profile' : 'Edit role and teams'}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          </button>
                        )}
                        {/* Show delete button only for admins/owners managing other users */}
                        {canManageUsers && member.userId !== currentUserId && (
                          <button
                            onClick={() => openDeleteUserConfirm(member.id, member.user.email)}
                            className={cn(
                              'p-1 rounded transition-colors',
                              isLight
                                ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                                : 'text-red-400 hover:bg-red-900/20 hover:text-red-300',
                            )}
                            title="Remove user">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                              </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
              </>
            )}
          </div>
        </>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteUserConfirmOpen && userToDelete && (
        <>
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteUserConfirmOpen(false)}
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
                  Remove User
                </h2>
                <button
                  onClick={() => setDeleteUserConfirmOpen(false)}
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
                      Permanently remove "{userToDelete.email}"?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      This user will be removed from the organization. This action cannot be undone.
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
                  onClick={() => {
                    setDeleteUserConfirmOpen(false);
                    setUserToDelete(null);
                  }}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}>
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteUser}
                  disabled={loading}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-red-600 text-white hover:bg-red-700',
                    loading && 'opacity-50 cursor-not-allowed',
                  )}>
                  {loading ? 'Removing...' : 'Remove User'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Cancel Invitation Confirmation Modal */}
      {cancelInviteConfirmOpen && inviteToCancel && (
        <>
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setCancelInviteConfirmOpen(false)}
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
                  Cancel Invitation
                </h2>
                <button
                  onClick={() => setCancelInviteConfirmOpen(false)}
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
                      Cancel invitation for "{inviteToCancel.email}"?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      This invitation will be cancelled and the user will not be able to join. This action cannot be undone.
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
                  onClick={() => {
                    setCancelInviteConfirmOpen(false);
                    setInviteToCancel(null);
                  }}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}>
                  Keep
                </button>
                <button
                  onClick={confirmCancelInvite}
                  disabled={loading}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-red-600 text-white hover:bg-red-700',
                    loading && 'opacity-50 cursor-not-allowed',
                  )}>
                  {loading ? 'Cancelling...' : 'Cancel Invitation'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

