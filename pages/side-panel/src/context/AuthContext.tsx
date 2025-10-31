/**
 * Authentication Context
 * 
 * Provides authentication state and methods throughout the application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authClient, Session, User, Organization, Member } from '../lib/auth-client';

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
  setActiveTeam: (teamId: string) => Promise<void>;
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
        
        // If we have an active org, fetch its details
        if (activeOrgId) {
          try {
            const orgsResult = await authClient.organization.list();
            const activeOrg = orgsResult.data?.find((org: any) => org.id === activeOrgId);
            setOrganization(activeOrg || null);
          } catch {
            setOrganization(null);
          }
        } else {
          setOrganization(null);
        }
        
        setMember(null); // Member info not needed for display
        setActiveTeamState(activeTeamId);
      } else {
        setSession(null);
        setUser(null);
        setOrganization(null);
        setMember(null);
        setActiveTeamState(null);
      }
    } catch (error) {
      console.error('Error loading session:', error);
      setSession(null);
      setUser(null);
      setOrganization(null);
      setMember(null);
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
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  /**
   * Set active organization
   */
  const setActiveOrganization = async (organizationId: string) => {
    try {
      await authClient.organization.setActive({
        organizationId,
      });
      await loadSession();
    } catch (error) {
      console.error('Error setting active organization:', error);
    }
  };

  /**
   * Set active team
   */
  const setActiveTeam = async (teamId: string) => {
    try {
      await authClient.organization.setActiveTeam({
        teamId,
      });
      setActiveTeamState(teamId);
      // Optionally reload session to get updated data
      await loadSession();
    } catch (error) {
      console.error('Error setting active team:', error);
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

