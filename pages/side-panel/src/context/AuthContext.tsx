/**
 * Authentication Context
 * 
 * Provides authentication state and methods throughout the application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authClient, Session, User, Organization, Member } from '../lib/auth-client';
import { API_CONFIG } from '../constants';

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
 * Auth Provider Component
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [activeTeam, setActiveTeamState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        console.error('[AuthContext] Error fetching member info:', memberError);
        setMember(null);
      }
    },
    [],
  );

  /**
   * Load session and user data
   */
  const loadSession = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Get session
      const sessionResult = await authClient.getSession();
      
      if (sessionResult.data) {
        setSession(sessionResult.data);
        setUser(sessionResult.data.user);
        
        // Extract organization and team from session
        const sessionData = sessionResult.data.session as any;
        const activeOrgId = sessionData?.activeOrganizationId;
        const activeTeamId = sessionData?.activeTeamId || null;
        
        console.log('[AuthContext] loadSession - activeOrgId:', activeOrgId);
        console.log('[AuthContext] loadSession - activeTeamId:', activeTeamId);
        
        const currentUserId = sessionResult.data.user?.id || null;

        // If we have an active org, fetch its details
        if (activeOrgId) {
          try {
            const orgsResult = await authClient.organization.list();
            const activeOrg = orgsResult.data?.find((org: any) => org.id === activeOrgId);
            setOrganization(activeOrg || null);
            
            // If we have an org but no active team, auto-select the first team
            if (!activeTeamId) {
              try {
                const teamsResponse = await fetch(`${API_CONFIG.BASE_URL}/api/config/teams`, {
                  credentials: 'include',
                });
                
                if (teamsResponse.ok) {
                  const teamsData = await teamsResponse.json();
                  const teams = teamsData.teams || [];
                  
                  // Filter to only teams the user is a member of
                  const memberTeams = teams.filter((t: any) => t.isMember);
                  
                  // If there are teams user is a member of, auto-select the first one
                  if (memberTeams.length > 0) {
                    const firstTeamId = memberTeams[0].id;
                    
                    // Set the active team
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
                    }
                  }
                }
              } catch (teamError) {
                console.error('[AuthContext] Error auto-selecting team on load:', teamError);
              }
            } else {
              console.log('[AuthContext] Setting activeTeamState from session:', activeTeamId);
              setActiveTeamState(activeTeamId);
            }

            await fetchAndSetMember(activeOrgId, currentUserId);
          } catch {
            setOrganization(null);
            setMember(null);
          }
        } else {
          // No active organization - auto-select the first one the user belongs to
          console.log('[AuthContext] No active organization, attempting auto-select...');
          try {
            const orgsResult = await authClient.organization.list();
            const userOrgs = orgsResult.data || [];
            
            if (userOrgs.length > 0) {
              const firstOrg = userOrgs[0];
              console.log('[AuthContext] Auto-selecting first organization:', firstOrg.name);
              
              // Set this organization as active
              await authClient.organization.setActive({
                organizationId: firstOrg.id,
              });
              
              setOrganization(firstOrg);
              updateSessionContext({ activeOrganizationId: firstOrg.id });
              
              // Now auto-select the first team in this organization
              try {
                const teamsResponse = await fetch(`${API_CONFIG.BASE_URL}/api/config/teams`, {
                  credentials: 'include',
                });
                
                if (teamsResponse.ok) {
                  const teamsData = await teamsResponse.json();
                  const teams = teamsData.teams || [];
                  const memberTeams = teams.filter((t: any) => t.isMember);
                  
                  if (memberTeams.length > 0) {
                    const firstTeamId = memberTeams[0].id;
                    console.log('[AuthContext] Auto-selecting first team:', memberTeams[0].name);
                    
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
                      console.log('[AuthContext] Auto-selection complete: org and team set');
                    }
                  }
                }
              } catch (teamError) {
                console.error('[AuthContext] Error auto-selecting team:', teamError);
              }

              await fetchAndSetMember(firstOrg.id, currentUserId);
            } else {
              console.log('[AuthContext] No organizations found for user');
              setOrganization(null);
              setActiveTeamState(null);
              setMember(null);
            }
          } catch (orgError) {
            console.error('[AuthContext] Error auto-selecting organization:', orgError);
            setOrganization(null);
            setActiveTeamState(null);
            setMember(null);
          }
        }
        
      } else {
        setSession(null);
        setUser(null);
        setOrganization(null);
        setMember(null);
        setActiveTeamState(null);
      }
    } catch (error) {
      console.error('[AuthContext] Error loading session:', error);
      setSession(null);
      setUser(null);
      setOrganization(null);
      setMember(null);
      setActiveTeamState(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      console.error('Sign in error:', error);
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
      console.error('Sign up error:', error);
      return { error: error.message || 'An error occurred during sign up' };
    }
  };

  /**
   * Sign out
   */
  const signOut = async () => {
    try {
      await authClient.signOut();
      setSession(null);
      setUser(null);
      setOrganization(null);
      setMember(null);
      setActiveTeamState(null);
      setMember(null);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  /**
   * Set active organization and auto-select first team
   */
  const setActiveOrganization = async (organizationId: string) => {
    try {
      console.log('[AuthContext] Switching to organization:', organizationId);
      
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
        console.error('[AuthContext] Error fetching new organization:', orgError);
      }
      
      // After setting organization, fetch teams and auto-select the first one
      try {
        const teamsResponse = await fetch(`${API_CONFIG.BASE_URL}/api/config/teams`, {
          credentials: 'include',
        });
        
        if (teamsResponse.ok) {
          const teamsData = await teamsResponse.json();
          const teams = teamsData.teams || [];
          
          console.log('[AuthContext] Teams in new organization:', teams.map((t: any) => ({ id: t.id, name: t.name, isMember: t.isMember })));
          
          // Filter to only teams the user is a member of
          const memberTeams = teams.filter((t: any) => t.isMember);
          
          console.log('[AuthContext] Member teams:', memberTeams.length);
          
          // ALWAYS select a team if available
          if (memberTeams.length > 0) {
            const firstTeamId = memberTeams[0].id;
            const firstTeamName = memberTeams[0].name;
            
            console.log('[AuthContext] Auto-selecting first team:', { id: firstTeamId, name: firstTeamName });
            
            // Set the active team
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
              console.log('[AuthContext] Successfully set active team to:', firstTeamName);
            } else {
              console.error('[AuthContext] Failed to set active team on backend');
            }
          } else {
            // No teams available, clear active team
            console.log('[AuthContext] No member teams available, clearing active team');
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
          }
        }
      } catch (teamError) {
        console.error('[AuthContext] Error auto-selecting team:', teamError);
      }
      
      // Don't call loadSession() here - it causes a full re-render
      // The state updates above are sufficient
      console.log('[AuthContext] Organization switch complete');

      await fetchAndSetMember(organizationId, user?.id || null);
    } catch (error) {
      console.error('[AuthContext] Error setting active organization:', error);
    }
  };

  /**
   * Set active team
   */
  const setActiveTeam = async (teamId: string | null) => {
    try {
      console.log('[AuthContext] Setting active team:', teamId);
      
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
      console.log('[AuthContext] Set active team result:', result);
      
      // Update local state immediately
      setActiveTeamState(updatedTeamId);
      updateSessionContext({ activeTeamId: updatedTeamId });
      console.log('[AuthContext] Local activeTeam state updated to:', updatedTeamId);

      await fetchAndSetMember(organization?.id ?? null, user?.id || null);

      return { success: true, activeTeamId: updatedTeamId };
    } catch (error) {
      console.error('[AuthContext] Error setting active team:', error);
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

