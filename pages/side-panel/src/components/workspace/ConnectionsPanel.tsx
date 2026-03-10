import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@extension/ui';
import { API_CONFIG } from '../../constants';
import { getConnectionIcon } from '../icons/ConnectionIcons';

interface WorkspaceConnection {
  id: string;
  connection_name: string;
  connection_type: string;
  service_name: string;
  status: string;
  token_expires_at?: string;
  scopes: string[];
  last_used_at?: string;
  last_sync_at?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export const ConnectionsPanel: React.FC<{ isLight: boolean; onStatsChange?: () => void }> = ({ isLight, onStatsChange }) => {
  const [connections, setConnections] = useState<WorkspaceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingService, setConnectingService] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const baseURL = API_CONFIG.BASE_URL;
      const response = await fetch(`${baseURL}/api/workspace/connections`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setConnections(data.connections);
      }
    } catch (error) {
      console.error('[Workspace] Failed to load connections:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
    
    // Check for OAuth callback messages
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get('oauth_success');
    const oauthError = params.get('oauth_error');
    const service = params.get('service');
    
    if (oauthSuccess === 'true' && service) {
      setMessage({ 
        type: 'success', 
        text: `Successfully connected ${service.charAt(0).toUpperCase() + service.slice(1)}!` 
      });
      loadConnections();
      // Refresh workspace stats after successful connection
      onStatsChange?.();
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (oauthError) {
      setMessage({ 
        type: 'error', 
        text: `Connection failed: ${oauthError}` 
      });
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadConnections]);

  const handleDelete = async (connectionId: string, connectionName: string) => {
    if (!confirm(`Disconnect "${connectionName}"?`)) return;

    try {
      const baseURL = API_CONFIG.BASE_URL;
      const response = await fetch(`${baseURL}/api/workspace/connections/${connectionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      await loadConnections();
      // Refresh workspace stats after successful disconnection
      onStatsChange?.();
    } catch (error) {
      console.error('[Workspace] Delete error:', error);
      alert('Failed to disconnect');
    }
  };

  const handleConnect = async (service: string) => {
    setConnectingService(service);
    setMessage(null);
    
    try {
      // Open OAuth flow in popup window
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const baseURL = API_CONFIG.BASE_URL;
      
      const popup = window.open(
        `${baseURL}/api/oauth/${service}/authorize`,
        `oauth_${service}`,
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );
      
      if (!popup) {
        setMessage({ 
          type: 'error', 
          text: 'Please allow popups for OAuth authentication' 
        });
        setConnectingService(null);
        return;
      }
      
      // Poll for popup close
      const pollInterval = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollInterval);
          setConnectingService(null);
          // Reload connections after OAuth completes
          setTimeout(() => {
            loadConnections();
            // Refresh workspace stats after successful connection
            onStatsChange?.();
          }, 500);
        }
      }, 500);
      
    } catch (error) {
      console.error('[OAuth] Connection error:', error);
      setMessage({ 
        type: 'error', 
        text: 'Failed to start OAuth flow' 
      });
      setConnectingService(null);
    }
  };

  const getServiceIcon = (serviceName: string) => {
    switch (serviceName) {
      case 'gmail':
        return '📧';
      case 'outlook':
        return '📨';
      case 'slack':
        return '💬';
      case 'google-drive':
        return '📁';
      case 'onedrive':
        return '☁️';
      case 'dropbox':
        return '📦';
      default:
        return '🔗';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className={cn('text-center py-8 text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
        Loading connections...
      </div>
    );
  }

  const renderServiceLogo = (service: string) =>
    getConnectionIcon(service, { className: 'w-8 h-8' });

  const getConnection = (service: string) => {
    return connections.find(conn => conn.service_name === service && conn.status === 'active');
  };

  const renderConnectionRow = (service: string, name: string, description: string) => {
    const connection = getConnection(service);
    const isConnecting = connectingService === service;
    
    return (
      <div className={cn('px-4 py-2 transition-colors', isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-900/40')}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            {renderServiceLogo(service)}
            <div className="flex-1 min-w-0">
              <div className={cn('text-sm font-medium', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                {name}
              </div>
              <div className={cn('text-xs mt-0.5', isLight ? 'text-gray-600' : 'text-gray-400')}>
                {description}
              </div>
              {connection && (
                <div className={cn('text-xs mt-1', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  Last used: {formatDate(connection.last_used_at)}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connection ? (
              <>
                <span
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded',
                    isLight ? 'bg-green-50 text-green-700' : 'bg-green-900/20 text-green-300'
                  )}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Connected
                </span>
                <button
                  onClick={() => handleDelete(connection.id, connection.connection_name)}
                  className={cn(
                    'p-1 rounded transition-colors',
                    isLight ? 'text-gray-400 hover:text-red-600' : 'text-gray-500 hover:text-red-400'
                  )}
                  title="Disconnect">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            ) : (
              <button
                onClick={() => handleConnect(service)}
                disabled={isConnecting}
                className={cn(
                  'p-1 rounded transition-colors',
                  isConnecting
                    ? 'opacity-50 cursor-wait'
                    : isLight
                      ? 'text-gray-400 hover:text-blue-600'
                      : 'text-gray-500 hover:text-blue-400'
                )}
                title={isConnecting ? 'Connecting...' : `Connect ${name}`}>
                {isConnecting ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Success/Error Message */}
      {message && (
        <div
          className={cn(
            'rounded-lg border p-4',
            message.type === 'success'
              ? isLight ? 'bg-green-50 border-green-200' : 'bg-green-900/20 border-green-700'
              : isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/20 border-red-700',
          )}>
          <div className={cn('text-sm font-medium flex items-center justify-between',
            message.type === 'success'
              ? isLight ? 'text-green-700' : 'text-green-300'
              : isLight ? 'text-red-700' : 'text-red-300'
          )}>
            <span>{message.type === 'success' ? '✓' : '✗'} {message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className={cn('text-xs hover:underline', 
                message.type === 'success'
                  ? isLight ? 'text-green-600' : 'text-green-400'
                  : isLight ? 'text-red-600' : 'text-red-400'
              )}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Available Connections */}
      <div
        className={cn(
          'rounded-lg border overflow-hidden',
          isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
        )}>
        <div
          className={cn(
            'border-b px-4 py-2',
            isLight ? 'border-gray-200' : 'border-gray-700'
          )}>
          <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
            Available Connections
          </h3>
        </div>
        <div className={cn('divide-y', isLight ? 'divide-gray-100' : 'divide-gray-700')}>
          {/* Gmail */}
          {renderConnectionRow('gmail', 'Gmail', 'Access your emails, search threads, and use them as context')}

          {/* Outlook */}
          {renderConnectionRow('outlook', 'Outlook', 'Connect your Microsoft 365 or Outlook.com account')}

          {/* Slack */}
          {renderConnectionRow('slack', 'Slack', 'Search your messages, channels, and threads')}

          {/* Google Drive */}
          {renderConnectionRow('google-drive', 'Google Drive', 'Access files from your Google Drive account')}

          {/* OneDrive */}
          {renderConnectionRow('onedrive', 'OneDrive', 'Connect to Microsoft OneDrive for file access')}

          {/* Dropbox */}
          {renderConnectionRow('dropbox', 'Dropbox', 'Access and sync files from your Dropbox account')}
        </div>
      </div>
    </div>
  );
};

