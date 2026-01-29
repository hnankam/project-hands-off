import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface WorkspaceContext {
  file_count: number;
  note_count: number;
  connection_count: number;
  total_size: number;
  recent_files: Array<{
    id: string;
    file_name: string;
    file_type: string;
    created_at: string;
  }>;
  recent_notes: Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
  }>;
  active_connections: Array<{
    id: string;
    connection_name: string;
    service_name: string;
    status: string;
  }>;
}

export function useWorkspaceContext() {
  const { user } = useAuth();
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setContext(null);
      setLoading(false);
      return;
    }

    const fetchContext = async () => {
      try {
        const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
        const response = await fetch(`${baseURL}/api/workspace/summary`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();

          setContext({
            file_count: data.stats.file_count || 0,
            note_count: data.stats.note_count || 0,
            connection_count: data.stats.connection_count || 0,
            total_size: data.stats.total_size || 0,
            recent_files: data.recent_files || [],
            recent_notes: data.recent_notes || [],
            active_connections: data.active_connections || [],
          });
        }
      } catch (error) {
        console.error('[Workspace] Failed to fetch workspace context:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchContext();
    
    // Refresh context when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchContext();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  return { context, loading };
}

