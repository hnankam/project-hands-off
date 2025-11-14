/**
 * Team Selector Component
 * 
 * Allows users to switch between teams within their active organization.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { authClient } from '../lib/auth-client';
import { API_CONFIG } from '../constants';
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
        
        // If we have teams and an active team, update the name
        if (data.teams && activeTeam) {
          const currentTeam = data.teams.find((t: Team) => t.id === activeTeam);
          
          if (currentTeam) {
            setActiveTeamName(currentTeam.name);
          } else {
            // Active team doesn't belong to this organization
            // AuthContext should handle this, but as a fallback, auto-select the first member team
            const memberTeams = data.teams.filter((t: Team) => t.isMember);
            if (memberTeams.length > 0) {
              try {
                const result = await setActiveTeam(memberTeams[0].id);
                if (result.success) {
                  setActiveTeamName(memberTeams[0].name);
                  manuallySetNameRef.current = null;
                }
              } catch (err) {
                console.error('[TeamSelector] Error setting fallback team:', err);
              }
            } else {
              setActiveTeamName(null);
            }
          }
        } else if (!activeTeam && data.teams.length > 0) {
          // No active team at all, but we have teams - auto-select the first one
          const memberTeams = data.teams.filter((t: Team) => t.isMember);
          if (memberTeams.length > 0) {
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

    if (isLoading) return;

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

    if (autoSelectingTeamRef.current) {
      return;
    }

    const fallbackTeam = memberTeams[0];
    if (!fallbackTeam) {
      return;
    }

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

  const teamDisplayName = activeTeamName
    ? activeTeamName
    : isLoading
      ? 'Loading teams…'
      : hasMemberTeams
        ? 'Selecting team…'
        : hasTeams
          ? 'Join a team'
          : 'No teams';

  const teamDisplaySubtext = isLoading
    ? 'Please wait'
    : hasMemberTeams
      ? `${memberTeamsCount} ${memberTeamsCount === 1 ? 'team' : 'teams'}`
      : hasTeams
        ? 'Join a team to get started'
        : 'Create team in Admin';

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => {
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
          'flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors w-full',
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
          ) : teams.length === 0 ? (
            <div className="p-3 text-center text-xs text-gray-500 dark:text-gray-400">
              No teams available. Create a team in the Admin page.
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

