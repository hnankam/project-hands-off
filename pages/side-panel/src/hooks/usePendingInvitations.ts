/**
 * Hook to check for pending invitations
 * 
 * Automatically checks for pending invitations when a user logs in.
 * This handles the case where a user received an invitation before
 * installing the extension.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
  inviter: {
    email: string;
    name: string | null;
  };
  expiresAt: string;
  createdAt: string;
}

export function usePendingInvitations() {
  const { session } = useAuth();
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.email) {
      checkPendingInvitations(session.user.email);
    } else {
      // Clear invitations when user logs out
      setInvitations([]);
    }
  }, [session?.user?.email]);

  const checkPendingInvitations = async (email: string) => {
    setLoading(true);
    setError(null);

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const url = `${baseURL}/api/invitations/user/${encodeURIComponent(email)}`;
      
      console.log('🔍 Checking pending invitations for:', email);
      console.log('📡 API URL:', url);
      
      const response = await fetch(url);
      const data = await response.json();

      console.log('📥 API Response:', { status: response.status, data });

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check invitations');
      }

      console.log(`✅ Found ${data.invitations?.length || 0} pending invitation(s)`);
      setInvitations(data.invitations || []);
    } catch (err: any) {
      console.error('❌ Error checking pending invitations:', err);
      setError(err.message);
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => {
    if (session?.user?.email) {
      checkPendingInvitations(session.user.email);
    }
  };

  return {
    invitations,
    loading,
    error,
    count: invitations.length,
    hasPendingInvitations: invitations.length > 0,
    refresh,
  };
}

