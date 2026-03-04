/**
 * Authentication Context
 * 
 * Provides authentication state and methods throughout the application.
 */

import * as React from 'react';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { authClient, Session, User, Organization, Member } from '../lib/auth-client';
import { API_CONFIG } from '../constants';
import { sessionStorageDBWrapper, debug } from '@extension/shared';
import { preferencesStorage } from '@extension/storage';

interface AuthContextType {
  // State
  session: Session | null;
  user: User | null;
  organization: Organization | null;
  member: Member | null;
  activeTeam: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Auth methods
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (name: string, email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  
  // Organization methods
  setActiveOrganization: (organizationId: string) => Promise<void>;
  setActiveTeam: (teamId: string | null) => Promise<{ success: boolean; activeTeamId: string | null }>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Helper: Auto-select first team the user is a member of
 * Reduces code duplication across loadSession and setActiveOrganization
 */
async function autoSelectFirstTeam(
  setActiveTeamState: (teamId: string | null) => void,
  updateSessionContext: (updates: { activeTeamId: string | null }) => void
): Promise<boolean> {
  try {
    const teamsResponse = await fetch(`${API_CONFIG.BASE_URL}/api/config/teams`, {
      credentials: 'include',
    });
    
    if (!teamsResponse.ok) {
      return false;
    }
    
    const teamsData = await teamsResponse.json();
    const teams = teamsData.teams || [];
    
    // Filter to only teams the user is a member of
    const memberTeams = teams.filter((t: any) => t.isMember);
    
    if (memberTeams.length > 0) {
      const firstTeamId = memberTeams[0].id;
      const firstTeamName = memberTeams[0].name;
      
      debug.log('[AuthContext] Auto-selecting first team:', firstTeamName);
      
      // Set the active team on backend
      const setTeamResponse = await fetch(`${API_CONFIG.BASE_URL}/api/auth/set-active-team`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ teamId: firstTeamId }),
      });
      
      if (setTeamResponse.ok) {
        setActiveTeamState(firstTeamId);
        updateSessionContext({ activeTeamId: firstTeamId });
        debug.log('[AuthContext] Successfully set active team');
        return true;
      } else {
        debug.error('[AuthContext] Failed to set active team on backend');
        return false;
      }
    } else {
      // No teams available, clear active team
      debug.log('[AuthContext] No member teams available');
      setActiveTeamState(null);
      updateSessionContext({ activeTeamId: null });
      
      // Also clear it in the backend
      await fetch(`${API_CONFIG.BASE_URL}/api/auth/set-active-team`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ teamId: null }),
      });
      
      return false;
    }
  } catch (error) {
    debug.error('[AuthContext] Error auto-selecting team:', error);
    return false;
  }
}

/**
 * Auth Provider Component
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [activeTeam, setActiveTeamState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Track the last user ID to detect user switches
  const lastUserIdRef = useRef<string | null>(null);

  const updateSessionContext = useCallback((updates: Partial<{ activeOrganizationId: string | null; activeTeamId: string | null }>) => {
    setSession((prev: Session | null) => {
      if (!prev) return prev;
      const prevSessionData = (prev.session ?? {}) as any;
      return {
        ...prev,
        session: {
          ...prevSessionData,
          ...updates,
        },
      } as Session;
    });
  }, []);

  const fetchAndSetMember = useCallback(
    async (organizationId: string | null, userId: string | null | undefined) => {
      if (!organizationId || !userId) {
        setMember(null);
        return;
      }

      try {
        const { data: fullOrg } = await (authClient.organization as any).getFullOrganization({
          organizationId,
        });

        if (fullOrg?.members) {
          const currentMember = fullOrg.members.find((m: any) => m.userId === userId);
          setMember(currentMember || null);
        } else {
          setMember(null);
        }
      } catch (memberError) {
        debug.error('[AuthContext] Error fetching member info:', memberError);
        setMember(null);
      }
    },
    [],
  );

  /**
   * Load session and user data
   * 
   * This function handles loading the user's session and restoring their
   * org/team selections from localStorage if they're not in the session.
   * This ensures preferences persist across sign-outs and user switches.
   */
  const loadSession = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Get session
      const sessionResult = await authClient.getSession();
      
      if (sessionResult.data) {
        // Prepare state updates to be applied together
        const user = sessionResult.data.user;
        const sessionData = sessionResult.data.session as any;
        let activeOrgId = sessionData?.activeOrganizationId;
        let activeTeamId = sessionData?.activeTeamId || null;
        const currentUserId = user?.id || null;
        
        debug.log('[AuthContext] loadSession - session data:', {
          activeOrgId: activeOrgId?.slice(0, 8) || 'none',
          activeTeamId: activeTeamId?.slice(0, 8) || 'none',
          userId: currentUserId?.slice(0, 8)
        });
        
        // Set userId for session storage immediately
        if (currentUserId) {
          sessionStorageDBWrapper.setCurrentUserId(currentUserId);
          
          // Check if this is a different user than last time
          const userChanged = await preferencesStorage.hasUserChanged(currentUserId);
          if (userChanged) {
            debug.log('[AuthContext] User has changed, will restore their preferences');
          }
          
          // Update the last user ID tracker
          await preferencesStorage.setLastUserId(currentUserId);
          lastUserIdRef.current = currentUserId;
          
          // ALWAYS check user preferences - they take precedence over session values
          // because they represent the user's last explicit choice (which may be more
          // recent than what's in the backend session)
          const savedPrefs = await preferencesStorage.getUserOrgTeamPrefs(currentUserId);
          if (savedPrefs) {
            debug.log('[AuthContext] Found saved preferences:', {
              savedOrgId: savedPrefs.lastSelectedOrgId?.slice(0, 8) || 'none',
              savedTeamId: savedPrefs.lastSelectedTeamId?.slice(0, 8) || 'none',
              sessionOrgId: activeOrgId?.slice(0, 8) || 'none',
              sessionTeamId: activeTeamId?.slice(0, 8) || 'none',
            });
            
            // Use saved org (preference takes precedence over session)
            if (savedPrefs.lastSelectedOrgId) {
              if (activeOrgId !== savedPrefs.lastSelectedOrgId) {
                debug.log('[AuthContext] Using saved org preference:', savedPrefs.lastSelectedOrgId.slice(0, 8));
              }
              activeOrgId = savedPrefs.lastSelectedOrgId;
            }
            
            // Use saved team (preference takes precedence over session)
            if (savedPrefs.lastSelectedTeamId) {
              if (activeTeamId !== savedPrefs.lastSelectedTeamId) {
                debug.log('[AuthContext] Using saved team preference:', savedPrefs.lastSelectedTeamId.slice(0, 8));
              }
              activeTeamId = savedPrefs.lastSelectedTeamId;
            }
          }
        } else {
          sessionStorageDBWrapper.setCurrentUserId(null);
          await preferencesStorage.setLastUserId(null);
          lastUserIdRef.current = null;
        }

        let orgToSet: Organization | null = null;
        let teamIdToSet: string | null = activeTeamId;
        let availableOrgs: Organization[] = [];

        // Fetch all available organizations first
          try {
            const orgsResult = await authClient.organization.list();
          availableOrgs = orgsResult.data || [];
        } catch (e) {
          debug.error('[AuthContext] Error fetching organizations:', e);
        }

        // If we have an active org (from session or preferences), verify and use it
        if (activeOrgId && availableOrgs.length > 0) {
          orgToSet = availableOrgs.find((org: any) => org.id === activeOrgId) || null;
          
          if (orgToSet) {
            debug.log('[AuthContext] Found valid org:', orgToSet.name);
            // Set it as active on the backend if not already
            try {
              await authClient.organization.setActive({ organizationId: orgToSet.id });
          } catch (e) {
              debug.error('[AuthContext] Error setting active org:', e);
          }
        } else {
            debug.log('[AuthContext] Saved org not found in available orgs, will auto-select');
            activeOrgId = null; // Reset so we auto-select below
          }
        }

        // If still no org, auto-select the first available one
        if (!orgToSet && availableOrgs.length > 0) {
          const firstOrg = availableOrgs[0];
          debug.log('[AuthContext] Auto-selecting first org:', firstOrg.name);
          try {
              await authClient.organization.setActive({ organizationId: firstOrg.id });
              orgToSet = firstOrg;
          } catch (e) {
            debug.error('[AuthContext] Error auto-selecting org:', e);
          }
        }

        // Apply all updates in a single batch to prevent multiple re-renders
        unstable_batchedUpdates(() => {
          setSession(sessionResult.data);
          setUser(user);
          setOrganization(orgToSet);
          
          if (orgToSet && !teamIdToSet) {
            // Team will be auto-selected below or by autoSelectFirstTeam
          } else {
            setActiveTeamState(teamIdToSet);
          }
        });

        // Finalize member and team info
        if (orgToSet) {
          // If we have a saved team ID, try to set it
          if (teamIdToSet) {
            // Verify the team exists and set it as active
            try {
              const response = await fetch(`${API_CONFIG.BASE_URL}/api/auth/set-active-team`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ teamId: teamIdToSet }),
              });
              
              if (response.ok) {
                debug.log('[AuthContext] Successfully set saved team as active');
                setActiveTeamState(teamIdToSet);
                updateSessionContext({ activeTeamId: teamIdToSet });
              } else {
                debug.log('[AuthContext] Saved team invalid, auto-selecting');
                await autoSelectFirstTeam(setActiveTeamState, updateSessionContext);
              }
            } catch (e) {
              debug.error('[AuthContext] Error setting saved team:', e);
              await autoSelectFirstTeam(setActiveTeamState, updateSessionContext);
            }
          } else {
              await autoSelectFirstTeam(setActiveTeamState, updateSessionContext);
          }
          await fetchAndSetMember(orgToSet.id, currentUserId);
        }
        
      } else {
        unstable_batchedUpdates(() => {
        setSession(null);
        setUser(null);
        setOrganization(null);
        setMember(null);
        setActiveTeamState(null);
        });
        sessionStorageDBWrapper.setCurrentUserId(null);
        // Don't update lastUserId here - keep it so we can detect user changes on next login
      }
    } catch (error) {
      debug.error('[AuthContext] Error loading session:', error);
      unstable_batchedUpdates(() => {
      setSession(null);
      setUser(null);
      setOrganization(null);
      setMember(null);
      setActiveTeamState(null);
      });
      sessionStorageDBWrapper.setCurrentUserId(null);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAndSetMember, updateSessionContext]);

  /**
   * Sign in with email and password
   */
  const signIn = async (email: string, password: string) => {
    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        return { error: result.error.message || 'Sign in failed' };
      }

      await loadSession();
      return {};
    } catch (error: any) {
      debug.error('Sign in error:', error);
      return { error: error.message || 'An error occurred during sign in' };
    }
  };

  /**
   * Sign up with name, email, and password
   */
  const signUp = async (name: string, email: string, password: string) => {
    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (result.error) {
        return { error: result.error.message || 'Sign up failed' };
      }

      await loadSession();
      return {};
    } catch (error: any) {
      debug.error('Sign up error:', error);
      return { error: error.message || 'An error occurred during sign up' };
    }
  };

  /**
   * Sign out
   */
  const signOut = async () => {
    try {
      debug.log('[AuthContext] Signing out user');
      await authClient.signOut();
      setSession(null);
      setUser(null);
      setOrganization(null);
      setMember(null);
      setActiveTeamState(null);
      
      // Clear userId from session storage
      debug.log('[AuthContext] Clearing session storage userId on sign out');
      sessionStorageDBWrapper.setCurrentUserId(null);
    } catch (error) {
      debug.error('[AuthContext] Sign out error:', error);
      // Still clear userId even if sign out fails
      sessionStorageDBWrapper.setCurrentUserId(null);
    }
  };

  /**
   * Set active organization and auto-select first team
   * Also saves the selection to user preferences for persistence
   */
  const setActiveOrganization = async (organizationId: string) => {
    try {
      debug.log('[AuthContext] Switching to organization:', organizationId.slice(0, 8));
      
      // First, clear the active team (it belongs to the old organization)
      setActiveTeamState(null);
      
      await authClient.organization.setActive({
        organizationId,
      });
      
      updateSessionContext({
        activeOrganizationId: organizationId,
        activeTeamId: null,
      });

      // Update organization state immediately without full reload
      try {
        const orgsResult = await authClient.organization.list();
        const newOrg = orgsResult.data?.find((org: any) => org.id === organizationId);
        if (newOrg) {
          setOrganization(newOrg);
        }
      } catch (orgError) {
        debug.error('[AuthContext] Error fetching new organization:', orgError);
      }
      
      // Save the org selection to user preferences (team will be saved after auto-select)
      const currentUserId = user?.id;
      if (currentUserId) {
        await preferencesStorage.setLastSelectedOrg(currentUserId, organizationId);
        // Clear team preference since we're changing orgs
        await preferencesStorage.setLastSelectedTeam(currentUserId, null);
      }
      
      // After setting organization, auto-select the first team
      await autoSelectFirstTeam(setActiveTeamState, updateSessionContext);
      
      // Don't call loadSession() here - it causes a full re-render
      // The state updates above are sufficient
      debug.log('[AuthContext] Organization switch complete');

      await fetchAndSetMember(organizationId, user?.id || null);
    } catch (error) {
      debug.error('[AuthContext] Error setting active organization:', error);
    }
  };

  /**
   * Set active team
   */
  const setActiveTeam = async (teamId: string | null) => {
    try {
      debug.log('[AuthContext] Setting active team:', teamId?.slice(0, 8));
      
      // Call backend API to update active team in session
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/auth/set-active-team`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ teamId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to set active team');
      }
      
      const result = await response.json();
      const updatedTeamId = result?.activeTeamId ?? teamId;
      debug.log('[AuthContext] Set active team result:', { activeTeamId: updatedTeamId?.slice(0, 8) });
      
      // Update local state immediately
      setActiveTeamState(updatedTeamId);
      updateSessionContext({ activeTeamId: updatedTeamId });
      debug.log('[AuthContext] Local activeTeam state updated');
      
      // Save the team selection to user preferences
      const currentUserId = user?.id;
      if (currentUserId) {
        await preferencesStorage.setLastSelectedTeam(currentUserId, updatedTeamId);
      }

      await fetchAndSetMember(organization?.id ?? null, user?.id || null);

      return { success: true, activeTeamId: updatedTeamId };
    } catch (error) {
      debug.error('[AuthContext] Error setting active team:', error);
      return { success: false, activeTeamId: activeTeam ?? null };
    }
  };

  /**
   * Refresh authentication data
   */
  const refreshAuth = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  // Load session on mount
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const value: AuthContextType = {
    session,
    user,
    organization,
    member,
    activeTeam,
    isLoading,
    isAuthenticated: !!user,
    signIn,
    signUp,
    signOut,
    setActiveOrganization,
    setActiveTeam,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;

