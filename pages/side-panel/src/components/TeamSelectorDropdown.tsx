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

export default function TeamSelectorDropdown({ isLight = true }: TeamSelectorDropdownProps) {
  const { user, organization, activeTeam, setActiveTeam } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamName, setActiveTeamName] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const manuallySetNameRef = useRef<string | null>(null);
  const lastOrgIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoSelectingTeamRef = useRef(false);

  useEffect(() => {
    if (!user || !organization) return;
    
    const currentOrgId = organization.id;
    const isOrgChange = lastOrgIdRef.current !== null && lastOrgIdRef.current !== currentOrgId;
    
    if (isOrgChange) {
      console.log('[TeamSelector] Organization switched from', lastOrgIdRef.current, 'to', currentOrgId);
      
      // Clear current state immediately
      setTeams([]);
      setActiveTeamName(null);
      manuallySetNameRef.current = null;
    }
    
    lastOrgIdRef.current = currentOrgId;
    
    // Wait for AuthContext to finish setting active team when org changes
    // Reduced from 800ms to 500ms since we optimized AuthContext
    const delay = isOrgChange ? 500 : 0;
    
    const timer = setTimeout(() => {
      console.log(isOrgChange ? '[TeamSelector] Loading teams for new organization...' : '[TeamSelector] Loading teams...');
      loadTeams();
    }, delay);
    
    return () => clearTimeout(timer);
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
    console.log('[TeamSelector] activeTeam changed:', activeTeam);
    console.log('[TeamSelector] Current teams count:', teams.length);
    console.log('[TeamSelector] Current teams IDs:', teams.map(t => t.id));
    console.log('[TeamSelector] Current teams full data:', teams.map(t => ({ id: t.id, name: t.name, isMember: t.isMember })));
    
    if (activeTeam && teams.length > 0) {
      console.log('[TeamSelector] Searching for team with ID:', activeTeam);
      console.log('[TeamSelector] ID comparison:');
      teams.forEach(t => {
        console.log(`  - Team "${t.name}" ID: "${t.id}" === "${activeTeam}" ? ${t.id === activeTeam}`);
      });
      
      const team = teams.find(t => t.id === activeTeam);
      console.log('[TeamSelector] Found team:', team);
      
      if (team) {
        console.log('[TeamSelector] Team found! Setting name to:', team.name);
        setActiveTeamName(team.name);
        manuallySetNameRef.current = null; // Clear manual override
      } else {
        console.warn('[TeamSelector] Active team not found in teams list!');
        // If we manually set a name, keep it
        if (manuallySetNameRef.current) {
          console.log('[TeamSelector] Using manually set name:', manuallySetNameRef.current);
          setActiveTeamName(manuallySetNameRef.current);
        }
      }
    } else if (!activeTeam) {
      console.log('[TeamSelector] No active team, clearing name');
      setActiveTeamName(null);
      manuallySetNameRef.current = null;
    }
  }, [activeTeam, teams]);

  const loadTeams = async () => {
    try {
      setIsLoading(true);
      // Fetch teams from the runtime server
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/config/teams`, {
        credentials: 'include',
      });
      
      console.log('[TeamSelector] API response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[TeamSelector] Teams received from API:', data);
        console.log('[TeamSelector] Number of teams:', data.teams?.length || 0);
        console.log('[TeamSelector] Team details:', data.teams?.map((t: Team) => ({ id: t.id, name: t.name, isMember: t.isMember })));
        console.log('[TeamSelector] Current organization:', organization);
        console.log('[TeamSelector] Current user:', user?.email);
        console.log('[TeamSelector] Current activeTeam from context:', activeTeam);
        
        setTeams(data.teams || []);
        
        // If we have teams and an active team, update the name
        if (data.teams && activeTeam) {
          console.log('[TeamSelector] Looking for activeTeam:', activeTeam);
          console.log('[TeamSelector] All team IDs from API:', data.teams.map((t: Team) => t.id));
          
          const currentTeam = data.teams.find((t: Team) => t.id === activeTeam);
          console.log('[TeamSelector] Found team in loaded data:', currentTeam);
          
          if (currentTeam) {
            console.log('[TeamSelector] Setting active team name to:', currentTeam.name);
            setActiveTeamName(currentTeam.name);
          } else {
            console.warn('[TeamSelector] Active team ID not found in API response!');
            console.warn('[TeamSelector] This likely means organization was switched.');
            
            // Active team doesn't belong to this organization
            // AuthContext should handle this, but as a fallback, auto-select the first member team
            const memberTeams = data.teams.filter((t: Team) => t.isMember);
            if (memberTeams.length > 0) {
              console.log('[TeamSelector] Fallback: Auto-selecting first member team:', memberTeams[0].name);
              try {
                const result = await setActiveTeam(memberTeams[0].id);
                if (result.success) {
                  setActiveTeamName(memberTeams[0].name);
                  manuallySetNameRef.current = null;
                } else {
                  console.error('[TeamSelector] Failed to set fallback active team');
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
            console.log('[TeamSelector] No active team, auto-selecting first member team:', memberTeams[0].name);
            try {
              const result = await setActiveTeam(memberTeams[0].id);
              if (result.success) {
                setActiveTeamName(memberTeams[0].name);
                manuallySetNameRef.current = null;
              } else {
                console.error('[TeamSelector] Failed to set auto-selected team');
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
      setIsLoading(false);
    }
  };

  const handleTeamChange = async (teamId: string) => {
    console.log('[TeamSelector] ===== handleTeamChange START =====');
    console.log('[TeamSelector] Setting active team:', teamId);
    
    const previousName = activeTeamName;
    
    // First, find the team name from current teams
    const selectedTeam = teams.find(t => t.id === teamId);
    console.log('[TeamSelector] Selected team:', selectedTeam);
    
    // Update display immediately (BEFORE any backend calls)
    if (selectedTeam) {
      console.log('[TeamSelector] Setting team name immediately to:', selectedTeam.name);
      setActiveTeamName(selectedTeam.name);
      manuallySetNameRef.current = selectedTeam.name; // Store for later
    } else {
      console.warn('[TeamSelector] Team not found in current teams list!');
    }
    
    // Then update the backend
    console.log('[TeamSelector] Calling setActiveTeam...');
    const result = await setActiveTeam(teamId);
    console.log('[TeamSelector] setActiveTeam completed with result:', result);

    if (!result.success) {
      console.error('[TeamSelector] Failed to set active team on backend, reverting UI');
      if (previousName) {
        setActiveTeamName(previousName);
        manuallySetNameRef.current = previousName;
      } else {
        setActiveTeamName(null);
        manuallySetNameRef.current = null;
      }
      return;
    }

    // Backend succeeded, clear manual override so context state drives the display
    manuallySetNameRef.current = null;
    
    // Reload teams to ensure we have latest data
    console.log('[TeamSelector] Reloading teams...');
    await loadTeams();
    console.log('[TeamSelector] loadTeams completed');
    
    console.log('[TeamSelector] ===== handleTeamChange END =====');
    setIsOpen(false);
  };

  const handleJoinTeam = async (teamId: string, teamName: string) => {
    const previousName = activeTeamName;
    try {
      setIsLoading(true);
      console.log('[TeamSelector] Joining team:', teamId, teamName);
      
      await (authClient.organization as any).addTeamMember({
        teamId,
        userId: user!.id,
      });
      
      console.log('[TeamSelector] Successfully joined team, reloading teams...');
      
      // Reload teams to reflect the change
      await loadTeams();
      
      console.log('[TeamSelector] Setting as active team...');
      
      // Update display immediately
      setActiveTeamName(teamName);
      manuallySetNameRef.current = teamName; // Store for later
      
      // Set as active team
      const result = await setActiveTeam(teamId);
      if (!result.success) {
        console.error('[TeamSelector] Failed to set joined team as active, reverting UI');
        if (previousName) {
          setActiveTeamName(previousName);
          manuallySetNameRef.current = previousName;
        } else {
          setActiveTeamName(null);
          manuallySetNameRef.current = null;
        }
        await loadTeams();
        throw new Error('Failed to set active team after joining');
      }
      manuallySetNameRef.current = null;
      
      // Reload one more time to ensure state is fresh
      await loadTeams();
      
      setIsOpen(false);
    } catch (error) {
      console.error('Error joining team:', error);
      alert(`Failed to join team "${teamName}". Please try again.`);
    } finally {
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
              
              {/* Other Teams Section */}
              {teams.filter(t => !t.isMember).length > 0 && (
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

