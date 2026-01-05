/**
 * Team Selector Component
 * 
 * Allows users to switch between teams within their active organization.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authClient } from '../../lib/auth-client';
import { API_CONFIG } from '../../constants';
import { cn } from '@extension/ui';

interface Team {
  id: string;
  name: string;
  organizationId: string;
  createdAt: string;
  isMember: boolean;
}

interface TeamSelectorDropdownProps {
  isLight?: boolean;
}

// Cache outside component to persist across unmount/remount
export const teamsCache = {
  orgId: null as string | null,
  teams: [] as Team[],
};

export default function TeamSelectorDropdown({ isLight = true }: TeamSelectorDropdownProps) {
  const { user, organization, activeTeam, setActiveTeam } = useAuth();
  
  // Initialize teams from cache if available for current org (eager initialization)
  const [teams, setTeams] = useState<Team[]>(() => {
    if (organization && teamsCache.orgId === organization.id && teamsCache.teams.length > 0) {
      return teamsCache.teams;
    }
    return [];
  });
  
  const [activeTeamName, setActiveTeamName] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [userRole, setUserRole] = useState<string[]>([]);
  const [canJoinTeams, setCanJoinTeams] = useState(false);
  const manuallySetNameRef = useRef<string | null>(null);
  const lastOrgIdRef = useRef<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoSelectingTeamRef = useRef(false);

  // Update cache when teams change
  useEffect(() => {
    if (organization && teams.length > 0) {
      teamsCache.orgId = organization.id;
      teamsCache.teams = teams;
    }
  }, [teams, organization]);

  useEffect(() => {
    if (!user || !organization) return;

    const currentUserId = user.id;
    const currentOrgId = organization.id;
    
    // First time initialization - set refs and check if teams already loaded
    if (lastUserIdRef.current === null || lastOrgIdRef.current === null) {
      lastUserIdRef.current = currentUserId;
      lastOrgIdRef.current = currentOrgId;
      
      // If teams already set from cache initialization, skip load
      if (teams.length > 0) {
        return;
      }
      
      // No cache, proceed to load
      loadTeams({ orgId: currentOrgId, force: false });
      return;
    }
    
    // Check if user or org actually changed (not just object reference)
    const userIdChanged = lastUserIdRef.current !== currentUserId;
    const orgIdChanged = lastOrgIdRef.current !== currentOrgId;
    
    // If neither changed, skip this effect run
    if (!userIdChanged && !orgIdChanged) {
      return;
    }
    
    const isOrgChange = orgIdChanged;

    if (isOrgChange) {
      // Clear current state immediately
      setTeams([]);
      setActiveTeamName(null);
      manuallySetNameRef.current = null;
      
      // Clear cache for old org
      teamsCache.orgId = null;
      teamsCache.teams = [];
      
      lastUserIdRef.current = currentUserId;
      lastOrgIdRef.current = currentOrgId;
      
      // Load teams for new org after delay
      const timer = setTimeout(() => {
        loadTeams({ orgId: currentOrgId, force: true });
      }, 500);
      
      return () => clearTimeout(timer);
    }

    // Only user changed, not org - just update ref
    lastUserIdRef.current = currentUserId;
    // No need to reload teams since org hasn't changed
    return;
  }, [user, organization]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleOtherDropdownOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ source: string }>).detail;
      if (detail?.source !== 'team') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('user-menu-dropdown-open', handleOtherDropdownOpen as EventListener);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('user-menu-dropdown-open', handleOtherDropdownOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    // Update active team name when activeTeam changes
    if (activeTeam && teams.length > 0) {
      const team = teams.find(t => t.id === activeTeam);
      
      if (team) {
        setActiveTeamName(team.name);
        manuallySetNameRef.current = null;
      } else {
        // If we manually set a name, keep it
        if (manuallySetNameRef.current) {
          setActiveTeamName(manuallySetNameRef.current);
        }
      }
    } else if (!activeTeam) {
      setActiveTeamName(null);
      manuallySetNameRef.current = null;
    }
  }, [activeTeam, teams]);

  const loadTeams = async ({ orgId, force }: { orgId?: string | null; force?: boolean } = {}) => {
    if (!user) {
      console.warn('[TeamSelector] Cannot load teams without user');
      return;
    }

    const targetOrgId = orgId ?? organization?.id ?? null;
    if (!targetOrgId) {
      console.warn('[TeamSelector] No organization available to load teams');
      return;
    }

    // Prevent concurrent loads
    if (isLoadingRef.current) {
      console.log('[TeamSelector] Already loading teams, skipping...');
      return;
    }

    // Check module-level cache
    if (!force && teamsCache.orgId === targetOrgId && teamsCache.teams.length > 0) {
      console.log('[TeamSelector] Skipping load, teams already cached for org', targetOrgId);
      return;
    }

    try {
      isLoadingRef.current = true;
      setIsLoading(true);
      
      // First, get user's role in the organization
      try {
        const { data: fullOrg } = await (authClient.organization as any).getFullOrganization({
          organizationId: targetOrgId,
        });
        
        let memberRoles: string[] = [];
        let canJoin = false;
        
        if (fullOrg?.members && user?.id) {
          const currentMember = fullOrg.members.find((m: any) => m.userId === user.id);
          
          if (currentMember) {
            memberRoles = Array.isArray(currentMember.role) 
              ? currentMember.role 
              : [currentMember.role];
            
            // Only owners and admins can join teams on their own
            canJoin = memberRoles.includes('owner') || memberRoles.includes('admin');
          }
        }
        
        setUserRole(memberRoles);
        setCanJoinTeams(canJoin);
      } catch (err) {
        console.warn('[TeamSelector] Failed to load user role:', err);
        setUserRole([]);
        setCanJoinTeams(false);
      }
      // Fetch teams from the runtime server
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/config/teams`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Update module-level cache
        teamsCache.orgId = targetOrgId;
        teamsCache.teams = data.teams || [];
        setTeams(data.teams || []);
        
        // If we have teams and an active team, update the display name
        if (data.teams && activeTeam) {
          const currentTeam = data.teams.find((t: Team) => t.id === activeTeam);
          
          if (currentTeam) {
            setActiveTeamName(currentTeam.name);
          } else {
            // Active team doesn't belong to this organization's teams
            // DON'T auto-select here - the activeTeam might be a valid preference
            // that AuthContext will handle, or the user will select manually
            console.log('[TeamSelector] activeTeam not in loaded teams, keeping current value');
            // Just clear the display name since we can't find the team
            setActiveTeamName(null);
          }
        } else if (!activeTeam && data.teams.length > 0) {
          // No active team at all, but we have teams - auto-select the first one
          // This is the ONLY case where we should auto-select in loadTeams
          const memberTeams = data.teams.filter((t: Team) => t.isMember);
          if (memberTeams.length > 0) {
            console.log('[TeamSelector] No activeTeam, auto-selecting first member team');
            try {
              const result = await setActiveTeam(memberTeams[0].id);
              if (result.success) {
                setActiveTeamName(memberTeams[0].name);
                manuallySetNameRef.current = null;
              }
            } catch (err) {
              console.error('[TeamSelector] Error setting auto-selected team:', err);
            }
          }
        }
      } else {
        const errorText = await response.text();
        console.error('[TeamSelector] API error:', response.status, errorText);
      }
    } catch (error) {
      console.error('[TeamSelector] Error loading teams:', error);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleTeamChange = async (teamId: string) => {
    const previousName = activeTeamName;
    
    // First, find the team name from current teams
    const selectedTeam = teams.find(t => t.id === teamId);
    
    // Update display immediately (BEFORE any backend calls)
    if (selectedTeam) {
      setActiveTeamName(selectedTeam.name);
      manuallySetNameRef.current = selectedTeam.name;
    }
    
    // Then update the backend
    const result = await setActiveTeam(teamId);

    if (!result.success) {
      // Revert UI on failure
      if (previousName) {
        setActiveTeamName(previousName);
        manuallySetNameRef.current = previousName;
      } else {
        setActiveTeamName(null);
        manuallySetNameRef.current = null;
      }
      return;
    }

    // Backend succeeded, clear manual override
    manuallySetNameRef.current = null;
    
    // Reload teams to ensure we have latest data
    await loadTeams({ force: true });
    
    setIsOpen(false);
  };

  const handleJoinTeam = async (teamId: string, teamName: string) => {
    const previousName = activeTeamName;
    try {
      setIsLoading(true);
      
      await (authClient.organization as any).addTeamMember({
        teamId,
        userId: user!.id,
      });
      
      // Reload teams to reflect the change
      await loadTeams({ force: true });
      
      // Update display immediately
      setActiveTeamName(teamName);
      manuallySetNameRef.current = teamName;
      
      // Set as active team
      const result = await setActiveTeam(teamId);
      if (!result.success) {
        if (previousName) {
          setActiveTeamName(previousName);
          manuallySetNameRef.current = previousName;
        } else {
          setActiveTeamName(null);
          manuallySetNameRef.current = null;
        }
        await loadTeams({ force: true });
        throw new Error('Failed to set active team after joining');
      }
      manuallySetNameRef.current = null;
      
      // Reload one more time to ensure state is fresh
      await loadTeams({ force: true });
      
      setIsOpen(false);
    } catch (error) {
      console.error('Error joining team:', error);
      alert(`Failed to join team "${teamName}". Please try again.`);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !organization) {
      autoSelectingTeamRef.current = false;
      return;
    }

    // Don't auto-select while still loading teams
    if (isLoading) return;
    
    // Don't auto-select if teams haven't been loaded yet (empty array from initial state)
    // This prevents overwriting a valid activeTeam from preferences before teams are fetched
    if (teams.length === 0) {
      autoSelectingTeamRef.current = false;
      return;
    }

    const memberTeams = teams.filter((t) => t.isMember);
    if (memberTeams.length === 0) {
      autoSelectingTeamRef.current = false;
      return;
    }

    const hasActiveTeam = activeTeam && memberTeams.some((team) => team.id === activeTeam);
    if (hasActiveTeam) {
      autoSelectingTeamRef.current = false;
      return;
    }

    // ONLY auto-select if activeTeam is explicitly null (not set at all)
    // If activeTeam has a value but isn't in the list, it might be from a different org
    // or the teams list might be stale - let the user or AuthContext handle it
    if (activeTeam !== null) {
      // activeTeam is set but not in current memberTeams - this could be:
      // 1. A valid team from preferences that just hasn't been validated yet
      // 2. A team from a different org (which AuthContext will handle)
      // Don't auto-select, let the existing value stand until explicitly changed
      console.log('[TeamSelector] activeTeam set but not in memberTeams, skipping auto-select');
      autoSelectingTeamRef.current = false;
      return;
    }

    if (autoSelectingTeamRef.current) {
      return;
    }

    const fallbackTeam = memberTeams[0];
    if (!fallbackTeam) {
      return;
    }

    console.log('[TeamSelector] No activeTeam set, auto-selecting first team');
    autoSelectingTeamRef.current = true;
    (async () => {
      try {
        const result = await setActiveTeam(fallbackTeam.id);
        if (result.success) {
          setActiveTeamName(fallbackTeam.name);
        }
      } catch (err) {
        console.error('[TeamSelector] Failed to auto-select team:', err);
        autoSelectingTeamRef.current = false;
      }
    })();
  }, [user, organization, teams, activeTeam, isLoading, setActiveTeam]);

  // Don't show if user not logged in or no organization
  if (!user) return null;

  const memberTeamsCount = teams.filter((t) => t.isMember).length;
  const hasTeams = teams.length > 0;
  const hasMemberTeams = memberTeamsCount > 0;

  const teamDisplayName = !organization
    ? 'Select organization'
    : activeTeamName
      ? activeTeamName
      : isLoading
        ? 'Loading teams…'
        : hasMemberTeams
          ? 'Selecting team…'
          : hasTeams && canJoinTeams
            ? 'Join a team'
            : hasTeams
              ? 'No team access'
              : 'No teams';

  const teamDisplaySubtext = !organization
    ? 'Organization required'
    : isLoading
      ? 'Please wait'
      : hasMemberTeams
        ? `${memberTeamsCount} ${memberTeamsCount === 1 ? 'team' : 'teams'}`
        : hasTeams && canJoinTeams
          ? 'Join a team to get started'
          : hasTeams
            ? 'Ask admin to add you'
            : 'Create team in Admin';

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => {
          // Don't open dropdown if:
          // - No organization selected
          // - No teams exist
          // - User is not a member of any team AND can't join teams (not admin/owner)
          const canInteract = organization && (
            isLoading || 
            memberTeamsCount > 0 || 
            (teams.length > 0 && canJoinTeams)
          );
          
          if (!canInteract) {
            return;
          }
          
          setIsOpen((prev) => {
            const next = !prev;
            if (next) {
              document.dispatchEvent(
                new CustomEvent('user-menu-dropdown-open', { detail: { source: 'team' } })
              );
            }
            return next;
          });
        }}
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 transition-colors w-full',
          isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50'
        )}
      >
        <div
          className={cn(
            'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-semibold text-xs',
            isLight ? 'bg-purple-100 text-purple-600' : 'bg-purple-900/30 text-purple-400'
          )}
        >
          {activeTeamName?.charAt(0).toUpperCase() || 'T'}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className={cn('text-xs font-medium truncate', isLight ? 'text-gray-700' : 'text-gray-200')}>
            {teamDisplayName}
          </p>
          <p className={cn('text-[10px] truncate', isLight ? 'text-gray-500' : 'text-gray-400')}>
            {teamDisplaySubtext}
          </p>
        </div>
        {organization && (isLoading || memberTeamsCount > 0 || (teams.length > 0 && canJoinTeams)) && (
          <svg
            className={cn(
              'w-3 h-3 transition-transform',
              isOpen ? 'rotate-180' : '',
              isLight ? 'text-gray-500' : 'text-gray-400'
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className={cn(
          'absolute top-full left-0 right-0 mt-2 border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto',
          isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#151C24] border-gray-700'
        )}>
          {isLoading ? (
            <div className="p-4 text-center">
              <div className="animate-spin h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full mx-auto"></div>
            </div>
          ) : !organization ? (
            <div className="p-4 text-center">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2',
                isLight ? 'bg-gray-100' : 'bg-gray-800'
              )}>
                <svg className={cn('w-5 h-5', isLight ? 'text-gray-400' : 'text-gray-500')} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className={cn('text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Select an organization first
              </p>
              <p className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
                Choose an organization above to see its teams
              </p>
            </div>
          ) : teams.length === 0 ? (
            <div className="p-4 text-center">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2',
                isLight ? 'bg-gray-100' : 'bg-gray-800'
              )}>
                <svg className={cn('w-5 h-5', isLight ? 'text-gray-400' : 'text-gray-500')} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className={cn('text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                No teams yet
              </p>
              <p className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
                Create a team in the Admin Dashboard
              </p>
            </div>
          ) : memberTeamsCount === 0 && !canJoinTeams ? (
            // User is not a member of any team and can't join teams (not admin/owner)
            <div className="p-4 text-center">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2',
                isLight ? 'bg-gray-100' : 'bg-gray-800'
              )}>
                <svg className={cn('w-5 h-5', isLight ? 'text-gray-400' : 'text-gray-500')} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className={cn('text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                No team access
              </p>
              <p className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
                Ask an admin to add you to a team
              </p>
            </div>
          ) : (
            <>
              {/* My Teams Section */}
              {memberTeamsCount > 0 && (
                <>
                  {teams.filter(t => t.isMember).map((team) => (
                    <button
                      key={team.id}
                      onClick={() => handleTeamChange(team.id)}
                      className={cn(
                        'w-full px-3 py-2 text-left transition-colors flex items-center gap-2',
                        activeTeam === team.id
                          ? isLight ? 'bg-purple-50' : 'bg-purple-900/20'
                          : isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50'
                      )}
                    >
                      <div
                        className={cn(
                          'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-semibold text-xs',
                          isLight ? 'bg-purple-100 text-purple-600' : 'bg-purple-900/30 text-purple-400'
                        )}
                      >
                        {team.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-xs font-medium truncate', isLight ? 'text-gray-700' : 'text-gray-200')}>
                          {team.name}
                        </p>
                      </div>
                      {activeTeam === team.id && (
                        <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </>
              )}
              
              {/* Other Teams Section - Only shown for admins and owners */}
              {canJoinTeams && teams.filter(t => !t.isMember).length > 0 && (
                <>
                  <div className={cn(
                    'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-t mt-1',
                    isLight ? 'text-gray-400 border-gray-200' : 'text-gray-500 border-gray-700'
                  )}>
                    Other Teams
                  </div>
                  {teams.filter(t => !t.isMember).map((team) => (
                    <div
                      key={team.id}
                      className={cn(
                        'w-full px-3 py-2 flex items-center gap-2 transition-colors',
                        isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50'
                      )}
                    >
                      <div
                        className={cn(
                          'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-semibold text-xs',
                          isLight ? 'bg-purple-50 text-purple-400' : 'bg-purple-900/20 text-purple-300'
                        )}
                      >
                        {team.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-xs font-medium truncate', isLight ? 'text-gray-700' : 'text-gray-200')}>
                          {team.name}
                        </p>
                      </div>
                      <button
                        onClick={() => handleJoinTeam(team.id, team.name)}
                        disabled={isLoading}
                        className="px-2 py-1 text-[10px] font-medium text-white bg-purple-600 hover:bg-purple-700 rounded transition-colors disabled:opacity-50"
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

