/**
 * Admin Page for Organization, Team, and User Management
 */

import React, { useState, useEffect } from 'react';
import { authClient } from '../lib/auth-client';
import { useAuth } from '../context/AuthContext';
import { cn, Button, DropdownMenu, DropdownMenuItem } from '@extension/ui';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { OrganizationsTab } from '../components/admin/OrganizationsTab';
import { TeamsTab } from '../components/admin/TeamsTab';

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
  teams?: Team[]; // Team memberships
}

interface AdminPageProps {
  onGoHome?: () => void;
}

export function AdminPage({ onGoHome }: AdminPageProps) {
  const { user, signOut } = useAuth();
  const { isLight } = useStorage(exampleThemeStorage);
  const [activeTab, setActiveTab] = useState<'organizations' | 'teams' | 'users'>('organizations');
  const [selectedOrgForTeams, setSelectedOrgForTeams] = useState('');

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('[AdminPage] Logout failed:', error);
    }
  };

  // Organizations
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgSlug, setEditOrgSlug] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Teams
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedOrgForTeam, setSelectedOrgForTeam] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [showCreateTeamForm, setShowCreateTeamForm] = useState(false);
  const [deleteTeamConfirmOpen, setDeleteTeamConfirmOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<{ id: string; name: string } | null>(null);
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set());
  const [teamMembers, setTeamMembers] = useState<Record<string, Member[]>>({});

  // Members
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedOrgForMembers, setSelectedOrgForMembers] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('member');
  const [selectedTeamForInvite, setSelectedTeamForInvite] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [errorVisible, setErrorVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [errorClosing, setErrorClosing] = useState(false);
  const [successClosing, setSuccessClosing] = useState(false);
  const [deleteOrgConfirmOpen, setDeleteOrgConfirmOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<{ id: string; name: string } | null>(null);
  const [expandedOrgIds, setExpandedOrgIds] = useState<Set<string>>(new Set());
  const [orgTeams, setOrgTeams] = useState<Record<string, { teams: Team[]; memberCounts: Record<string, number> }>>({});

  useEffect(() => {
    loadOrganizations();
  }, []);

  useEffect(() => {
    if (selectedOrgForTeam) {
      loadTeams(selectedOrgForTeam);
    }
  }, [selectedOrgForTeam]);

  useEffect(() => {
    if (selectedOrgForMembers) {
      loadMembers(selectedOrgForMembers);
      // Load teams for the selected organization (for the invite form)
      loadTeams(selectedOrgForMembers);
      // Reset team selection when organization changes
      setSelectedTeamForInvite('');
    }
  }, [selectedOrgForMembers]);

  // Auto-dismiss error after 8 seconds
  useEffect(() => {
    if (!error) return;
    
    setErrorVisible(true);
    setErrorClosing(false);
    const timer = setTimeout(() => {
      handleDismissError();
    }, 8000);
    return () => clearTimeout(timer);
  }, [error]);

  // Auto-dismiss success after 5 seconds
  useEffect(() => {
    if (!success) return;
    
    setSuccessVisible(true);
    setSuccessClosing(false);
    const timer = setTimeout(() => {
      handleDismissSuccess();
    }, 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleDismissError = () => {
    setErrorClosing(true);
    setTimeout(() => {
      setErrorVisible(false);
      setError('');
    }, 300);
  };

  const handleDismissSuccess = () => {
    setSuccessClosing(true);
    setTimeout(() => {
      setSuccessVisible(false);
      setSuccess('');
    }, 300);
  };

  const loadOrganizations = async () => {
    try {
      const { data, error } = await authClient.organization.list();
      if (error) throw new Error(error.message);
      setOrganizations(data || []);
      if (data && data.length > 0) {
        setSelectedOrgForTeam(data[0].id);
        setSelectedOrgForMembers(data[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadTeams = async (organizationId: string) => {
    try {
      console.log('Loading teams for organization:', organizationId);
      
      const { data, error } = await (authClient.organization as any).listTeams({
        query: { organizationId },
      });
      
      console.log('List teams response:', { data, error });
      
      if (error) {
        console.error('List teams error:', error);
        throw new Error(error.message || JSON.stringify(error));
      }
      
      setTeams(data || []);
      console.log('Teams loaded:', data?.length || 0);
    } catch (err: any) {
      console.error('Load teams exception:', err);
      setError(err.message || 'Failed to load teams. Check console for details.');
    }
  };

  const loadMembers = async (organizationId: string) => {
    try {
      const { data, error } = await authClient.organization.listMembers({
        query: { organizationId },
      });
      if (error) throw new Error(error.message);
      
      const membersData = (data as any)?.members || data || [];
      
      // Fetch team memberships for each member
      const membersWithTeams = await Promise.all(
        membersData.map(async (member: Member) => {
          try {
            // Get all teams and filter by member's userId
            const allTeamsData = await (authClient.organization as any).listTeams({
              query: { organizationId },
            });
            
            if (allTeamsData.data) {
              // For each team, check if this user is a member
              const userTeams = [];
              for (const team of allTeamsData.data) {
                try {
                  const teamMembersResponse = await (authClient.organization as any).listTeamMembers({
                    query: { teamId: team.id },
                  });
                  
                  const isMember = teamMembersResponse.data?.some(
                    (tm: any) => tm.userId === member.userId
                  );
                  
                  if (isMember) {
                    userTeams.push(team);
                  }
                } catch {
                  // Skip if error checking team membership
                }
              }
              
              return { ...member, teams: userTeams };
            }
          } catch (err) {
            console.error('Error loading teams for member:', err);
          }
          
          return { ...member, teams: [] };
        })
      );
      
      setMembers(membersWithTeams);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data, error } = await authClient.organization.create({
        name: newOrgName,
        slug: newOrgSlug,
      });

      if (error) throw new Error(error.message);

      setSuccess(`Organization "${newOrgName}" created successfully!`);
      setNewOrgName('');
      setNewOrgSlug('');
      setShowCreateForm(false);
      await loadOrganizations();
    } catch (err: any) {
      setError(err.message);
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
    setError('');
    setSuccess('');

    try {
      const { data, error} = await authClient.organization.update({
        data: {
          name: editOrgName,
          slug: editOrgSlug,
        },
        organizationId: orgId,
      });

      if (error) throw new Error(error.message);

      setSuccess(`Organization updated successfully!`);
      setEditingOrgId(null);
      await loadOrganizations();
    } catch (err: any) {
      console.error('Update organization error:', err);
      setError(err.message || 'Failed to update organization');
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
        // Load teams if not already loaded
        if (!orgTeams[orgId]) {
          loadOrgTeamsWithCounts(orgId);
        }
      }
      return newSet;
    });
  };

  const loadOrgTeamsWithCounts = async (orgId: string) => {
    try {
      // Load teams for this organization
      const { data: teamsData, error: teamsError } = await (authClient.organization as any).listTeams({
        query: { organizationId: orgId },
      });

      if (teamsError) throw new Error(teamsError.message);

      const teams = teamsData || [];
      const memberCounts: Record<string, number> = {};

      // Load member count for each team
      for (const team of teams) {
        try {
          const { data: membersData } = await (authClient.organization as any).listTeamMembers({
            query: { teamId: team.id },
          });
          memberCounts[team.id] = membersData?.length || 0;
        } catch {
          memberCounts[team.id] = 0;
        }
      }

      setOrgTeams(prev => ({
        ...prev,
        [orgId]: { teams, memberCounts },
      }));
    } catch (err: any) {
      console.error('Error loading org teams:', err);
    }
  };

  const openDeleteOrgConfirm = (orgId: string, orgName: string) => {
    setOrgToDelete({ id: orgId, name: orgName });
    setDeleteOrgConfirmOpen(true);
  };

  const confirmDeleteOrganization = async () => {
    if (!orgToDelete) return;

    setLoading(true);
    setError('');
    setSuccess('');
    setDeleteOrgConfirmOpen(false);

    try {
      const { data, error } = await (authClient.organization as any).delete({
        organizationId: orgToDelete.id,
      });

      if (error) throw new Error(error.message);

      setSuccess(`Organization "${orgToDelete.name}" deleted successfully!`);
      setOrgToDelete(null);
      await loadOrganizations();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      console.log('Creating team:', { name: newTeamName, organizationId: selectedOrgForTeam });
      
      const { data, error } = await (authClient.organization as any).createTeam({
        name: newTeamName,
        organizationId: selectedOrgForTeam,
      });

      console.log('Create team response:', { data, error });

      if (error) {
        console.error('Team creation error:', error);
        throw new Error(error.message || JSON.stringify(error));
      }

      setSuccess(`Team "${newTeamName}" created successfully!`);
      setNewTeamName('');
      setShowCreateTeamForm(false);
      await loadTeams(selectedOrgForTeam);
    } catch (err: any) {
      console.error('Team creation exception:', err);
      setError(err.message || 'Failed to create team. Check console for details.');
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
    setError('');
    setSuccess('');

    try {
      const { data, error } = await (authClient.organization as any).updateTeam({
        teamId,
        data: {
          name: editTeamName,
        },
      });

      if (error) throw new Error(error.message);

      setSuccess(`Team updated successfully!`);
      setEditingTeamId(null);
      await loadTeams(selectedOrgForTeam);
    } catch (err: any) {
      console.error('Update team error:', err);
      setError(err.message || 'Failed to update team');
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
    setError('');
    setSuccess('');

    try {
      const { error } = await (authClient.organization as any).deleteTeam({
        teamId: teamToDelete.id,
      });

      if (error) throw new Error(error.message);

      setSuccess(`Team "${teamToDelete.name}" deleted successfully!`);
      setDeleteTeamConfirmOpen(false);
      setTeamToDelete(null);
      await loadTeams(selectedOrgForTeam);
    } catch (err: any) {
      console.error('Delete team error:', err);
      setError(err.message || 'Failed to delete team');
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
        // Load team members if not already loaded
        if (!teamMembers[teamId]) {
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

      if (error) throw new Error(error.message);

      // Fetch user details for each member
      const membersWithDetails = await Promise.all(
        (membersData || []).map(async (tm: any) => {
          try {
            // Get organization members to find user details
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

  const inviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Validate team selection
    if (!selectedTeamForInvite) {
      setError('Please select a team for the new member');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await authClient.organization.inviteMember({
        email: newMemberEmail,
        role: [newMemberRole] as any,
        organizationId: selectedOrgForMembers,
      });

      if (error) throw new Error(error.message);

      // Get the invited member's data
      const invitedMember = data;
      
      // Add the member to the selected team
      // Note: We need to get the member's userId after they accept the invitation
      // For now, we'll store the team assignment in the invitation metadata
      // The actual team assignment will happen when they accept
      
      setSuccess(`Invitation sent to ${newMemberEmail} for team ${teams.find(t => t.id === selectedTeamForInvite)?.name}!`);
      setNewMemberEmail('');
      setSelectedTeamForInvite('');
      await loadMembers(selectedOrgForMembers);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addMemberToTeam = async (memberId: string, teamId: string) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const member = members.find(m => m.id === memberId);
      if (!member) throw new Error('Member not found');

      // ENFORCE SINGLE TEAM MEMBERSHIP:
      // First, remove user from all existing teams
      if (member.teams && member.teams.length > 0) {
        for (const existingTeam of member.teams) {
          try {
            await (authClient.organization as any).removeTeamMember({
              teamId: existingTeam.id,
              userId: member.userId,
            });
            console.log(`Removed ${member.user.email} from ${existingTeam.name}`);
          } catch (removeError) {
            console.error('Error removing from existing team:', removeError);
            // Continue with adding to new team even if removal fails
          }
        }
      }

      // Now add to the new team
      const { data, error } = await (authClient.organization as any).addTeamMember({
        teamId,
        userId: member.userId,
      });

      if (error) throw new Error(error.message);

      const newTeamName = teams.find(t => t.id === teamId)?.name || 'selected team';
      setSuccess(`Member moved to ${newTeamName} successfully!`);
      await loadMembers(selectedOrgForMembers);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (memberIdOrEmail: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error } = await authClient.organization.removeMember({
        memberIdOrEmail,
        organizationId: selectedOrgForMembers,
      });

      if (error) throw new Error(error.message);

      setSuccess('Member removed successfully!');
      await loadMembers(selectedOrgForMembers);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('flex h-screen flex-col overflow-hidden', isLight ? 'bg-white' : 'bg-[#151C24]')}>
      {/* Header */}
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between px-2 py-[0.4em]',
          isLight ? 'bg-gray-50' : 'bg-[#151C24]',
        )}>
        <div className="mr-2 flex min-w-0 flex-1 items-center overflow-hidden">
          <div className={cn('flex-1 truncate px-1 text-sm font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Administration
          </div>
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
                'h-6 w-6 p-0',
                isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
              )}>
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
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
                  'h-6 w-6 p-0',
                  isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
                )}>
                <svg
                  width="12"
                  height="12"
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

          {/* Organizations Tab */}
          {activeTab === 'organizations' && (
            <div className="space-y-3">
              {/* Header with Add Button */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                    Organizations
                  </h2>
                  <span className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    ({organizations.length})
                  </span>
                </div>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                    isLight
                      ? 'text-blue-600 hover:bg-blue-50 border border-blue-200'
                      : 'text-blue-400 hover:bg-blue-900/20 border border-blue-800',
                  )}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  {showCreateForm ? 'Cancel' : 'New'}
                </button>
              </div>

              {/* Create Form - Compact Card */}
              {showCreateForm && (
                <form
                  onSubmit={createOrganization}
                  className={cn(
                    'pt-3 pb-5 pr-8 pl-8 rounded-lg border',
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
                          isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-800 border-gray-600 text-gray-100',
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
                          isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-800 border-gray-600 text-gray-100',
                        )}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="submit"
                      disabled={loading}
                      className={cn(
                        'flex-1 px-4 py-1.5 text-xs font-medium rounded transition-colors',
                        isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                        loading && 'opacity-50 cursor-not-allowed',
                      )}>
                      {loading ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm(false);
                        setNewOrgName('');
                        setNewOrgSlug('');
                      }}
                      className={cn(
                        'px-4 py-1.5 text-xs font-medium rounded transition-colors',
                        isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                      )}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Organizations List - Compact Cards */}
              <div className="space-y-2">
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
                              isLight ? 'bg-white border-gray-300' : 'bg-gray-800 border-gray-600',
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
                            placeholder="acme-corp"
                            className={cn(
                              'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                              isLight ? 'bg-white border-gray-300' : 'bg-gray-800 border-gray-600',
                            )}
                          />
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => updateOrganization(org.id)}
                            disabled={loading}
                            className={cn(
                              'flex-1 px-4 py-1.5 text-xs font-medium rounded transition-colors',
                              isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                            )}>
                            Save
                          </button>
                          <button
                            onClick={cancelEditOrganization}
                            className={cn(
                              'px-4 py-1.5 text-xs font-medium rounded transition-colors',
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
                            {org.name}
                          </h4>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Expand/Collapse Icon */}
                            <button
                              onClick={() => toggleOrgExpansion(org.id)}
                              className={cn(
                                'p-1 rounded transition-all duration-200',
                                isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
                              )}
                              title={expandedOrgIds.has(org.id) ? "Collapse" : "Expand teams"}>
                              <svg 
                                className={cn('w-3.5 h-3.5 transition-transform duration-300 ease-in-out', expandedOrgIds.has(org.id) && 'rotate-180')} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24" 
                                strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => startEditOrganization(org)}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
                              )}
                              title="Edit">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => openDeleteOrgConfirm(org.id, org.name)}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight ? 'text-red-600 hover:bg-red-50' : 'text-red-400 hover:bg-red-900/20',
                              )}
                              title="Delete">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
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
                              ? 'max-h-[500px] opacity-100 mt-3 duration-500' 
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
                                        onClick={() => {
                                          setActiveTab('teams');
                                          setSelectedOrgForTeam(org.id);
                                        }}
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
                                            <span className={cn('truncate font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
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
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className={cn(
                        'mt-2 text-xs font-medium',
                        isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300',
                      )}>
                      Create your first organization
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Teams Tab */}
          {activeTab === 'teams' && (
            <div>
              <h2 className={cn('text-base font-semibold mb-4', isLight ? 'text-gray-900' : 'text-gray-100')}>
                Teams
              </h2>

              {/* Organization Selector */}
              <div className="mb-4">
                <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Select Organization
                </label>
                <select
                  value={selectedOrgForTeam}
                  onChange={e => setSelectedOrgForTeam(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded-lg focus:ring-1 focus:ring-blue-500 outline-none',
                    isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-800 border-gray-700 text-gray-100',
                  )}>
                  <option value="">Select an organization...</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedOrgForTeam && (
                <>
                  {/* Create New Team Button */}
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      {showCreateTeamForm ? 'All Teams' : 'Teams List'}
                    </h3>
                    <button
                      onClick={() => setShowCreateTeamForm(!showCreateTeamForm)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded transition-colors',
                        isLight
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-blue-500 text-white hover:bg-blue-600',
                      )}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={showCreateTeamForm ? "M6 18L18 6M6 6l12 12" : "M12 4v16m8-8H4"} />
                      </svg>
                      {showCreateTeamForm ? 'Cancel' : 'New'}
                    </button>
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
                              isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-800 border-gray-600 text-gray-100',
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
                                  isLight ? 'bg-white border-gray-300' : 'bg-gray-800 border-gray-600',
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
                                {teamMembers[team.id] ? (
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
                                        {/* Members Table */}
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
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div>
              <h2 className={cn('text-base font-semibold mb-4', isLight ? 'text-gray-900' : 'text-gray-100')}>
                Users & Members
              </h2>

              {/* Organization Selector */}
              <div className="mb-4">
                <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Select Organization
                </label>
                <select
                  value={selectedOrgForMembers}
                  onChange={e => setSelectedOrgForMembers(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none',
                    isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-800 border-gray-700 text-gray-100',
                  )}>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedOrgForMembers && (
                <>
                  {/* Invite Member Form */}
                  <form
                    onSubmit={inviteMember}
                    className={cn(
                      'mb-6 p-4 rounded-lg border',
                      isLight ? 'bg-gray-50 border-gray-200' : 'bg-gray-900/30 border-gray-800',
                    )}>
                    <h3 className={cn('text-sm font-medium mb-4', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Invite New Member
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
                          Email
                        </label>
                        <input
                          type="email"
                          value={newMemberEmail}
                          onChange={e => setNewMemberEmail(e.target.value)}
                          placeholder="[email protected]"
                          required
                          className={cn(
                            'w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none',
                            isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-800 border-gray-700 text-gray-100',
                          )}
                        />
                      </div>
                      <div>
                        <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
                          Role
                        </label>
                        <select
                          value={newMemberRole}
                          onChange={e => setNewMemberRole(e.target.value)}
                          className={cn(
                            'w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none',
                            isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-800 border-gray-700 text-gray-100',
                          )}>
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          <option value="owner">Owner</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* Team Selection - REQUIRED */}
                    <div className="mt-4">
                      <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
                        Team <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selectedTeamForInvite}
                        onChange={e => setSelectedTeamForInvite(e.target.value)}
                        required
                        className={cn(
                          'w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none',
                          isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-800 border-gray-700 text-gray-100',
                          !selectedTeamForInvite && 'border-red-300',
                        )}>
                        <option value="">Select a team...</option>
                        {teams.map(team => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                      {teams.length === 0 && (
                        <p className={cn('text-xs mt-1', isLight ? 'text-orange-600' : 'text-orange-400')}>
                          ⚠️ Please create at least one team first
                        </p>
                      )}
                    </div>
                    
                    {/* Info Note */}
                    <div
                      className={cn(
                        'mt-3 p-3 rounded-lg border text-xs flex items-start gap-2',
                        isLight ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-blue-900/20 border-blue-800 text-blue-400',
                      )}>
                      <svg
                        className="w-4 h-4 flex-shrink-0 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div>
                        <strong>Single Team Membership</strong>
                        <p className="mt-1">
                          Each member can only belong to ONE team at a time. Select the team for this member above.
                        </p>
                      </div>
                    </div>
                    
                    <button
                      type="submit"
                      disabled={loading}
                      className={cn(
                        'mt-4 px-4 py-2 text-sm rounded-lg transition-colors font-medium w-full',
                        isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                        loading && 'opacity-50 cursor-not-allowed',
                      )}>
                      {loading ? 'Sending...' : 'Send Invitation'}
                    </button>
                  </form>

                  {/* Members List */}
                  <div className="space-y-3">
                    {members.map(member => (
                      <div
                        key={member.id}
                        className={cn(
                          'p-4 border rounded-lg',
                          isLight ? 'bg-white border-gray-200' : 'bg-gray-900/30 border-gray-800',
                        )}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className={cn('font-semibold text-sm', isLight ? 'text-gray-900' : 'text-gray-100')}>
                              {member.user.name}
                            </h4>
                            <p className={cn('text-xs mt-1', isLight ? 'text-gray-600' : 'text-gray-400')}>
                              {member.user.email}
                            </p>
                            
                            {/* Role Badges */}
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(Array.isArray(member.role) ? member.role : [member.role]).map(role => (
                                <span
                                  key={role}
                                  className={cn(
                                    'px-2 py-0.5 text-xs rounded font-medium',
                                    isLight ? 'bg-blue-100 text-blue-800' : 'bg-blue-900/30 text-blue-400',
                                  )}>
                                  {role}
                                </span>
                              ))}
                            </div>
                            
                            {/* Team Badge (Single Team Only) */}
                            <div className="mt-2 flex flex-wrap gap-2 items-center">
                              <span className={cn('text-xs font-medium', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                Team:
                              </span>
                              {member.teams && member.teams.length > 0 ? (
                                <span
                                  className={cn(
                                    'px-2 py-0.5 text-xs rounded flex items-center gap-1 font-medium',
                                    isLight ? 'bg-green-100 text-green-800' : 'bg-green-900/30 text-green-400',
                                  )}>
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}>
                                    <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                  </svg>
                                  {member.teams[0].name}
                                  {member.teams.length > 1 && (
                                    <span className="ml-1 text-orange-600">
                                      (+ {member.teams.length - 1} more - should only be 1!)
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span
                                  className={cn(
                                    'px-2 py-0.5 text-xs rounded italic font-medium',
                                    isLight ? 'bg-orange-100 text-orange-700' : 'bg-orange-900/30 text-orange-400',
                                  )}>
                                  ⚠️ No team assigned
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {teams.length > 0 && (
                              <select
                                onChange={e => {
                                  if (e.target.value) {
                                    addMemberToTeam(member.id, e.target.value);
                                    e.target.value = '';
                                  }
                                }}
                                className={cn(
                                  'px-3 py-1 text-xs border rounded',
                                  isLight
                                    ? 'bg-white border-gray-300 text-gray-900'
                                    : 'bg-gray-800 border-gray-700 text-gray-100',
                                )}>
                                <option value="">Move to team...</option>
                                {teams.map(team => (
                                  <option key={team.id} value={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => removeMember(member.user.email)}
                              className={cn(
                                'px-3 py-1 text-xs rounded transition-colors',
                                isLight
                                  ? 'text-red-600 hover:bg-red-50'
                                  : 'text-red-400 hover:bg-red-900/20',
                              )}>
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {members.length === 0 && (
                      <p className={cn('text-center py-8 text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
                        No members yet. Invite someone above!
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Organization Confirmation Modal */}
      {deleteOrgConfirmOpen && orgToDelete && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteOrgConfirmOpen(false)}
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
                  Delete Organization
                </h2>
                <button
                  onClick={() => setDeleteOrgConfirmOpen(false)}
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
              <div className="space-y-3 px-3 py-4">
                {/* Warning Icon */}
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
                      Permanently delete "{orgToDelete.name}"?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      This organization and all its teams, members, and associated data will be permanently deleted. This
                      action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 border-t px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <button
                  onClick={() => setDeleteOrgConfirmOpen(false)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}>
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteOrganization}
                  disabled={loading}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-red-600 text-white hover:bg-red-700',
                    loading && 'opacity-50 cursor-not-allowed',
                  )}>
                  {loading ? 'Deleting...' : 'Delete Organization'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Team Confirmation Modal */}
      {deleteTeamConfirmOpen && teamToDelete && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteTeamConfirmOpen(false)}
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

              {/* Content */}
              <div className="space-y-3 px-3 py-4">
                {/* Warning Icon */}
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

              {/* Footer */}
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
