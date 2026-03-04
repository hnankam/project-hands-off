import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@extension/ui';

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
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
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
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
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
      
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      
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

  const renderServiceLogo = (service: string) => {
    switch (service) {
      case 'gmail':
        return (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
            <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.545l8.073-6.052C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
          </svg>
        );
      case 'outlook':
        return (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="9" height="9" rx="1" fill="#0078D4"/>
            <path d="M7.5 6C6.1 6 5 7.1 5 8.5C5 9.9 6.1 11 7.5 11C8.9 11 10 9.9 10 8.5C10 7.1 8.9 6 7.5 6ZM7.5 9.5C7 9.5 6.5 9 6.5 8.5C6.5 8 7 7.5 7.5 7.5C8 7.5 8.5 8 8.5 8.5C8.5 9 8 9.5 7.5 9.5Z" fill="white"/>
            <path d="M13 6V11L21 15V10L13 6Z" fill="#0078D4"/>
            <path d="M13 11V16L21 20V15L13 11Z" fill="#28A8EA"/>
            <path d="M13 6L21 10L17 12L13 10V6Z" fill="#0078D4" opacity="0.8"/>
            <path d="M13 16L21 20L17 22L13 20V16Z" fill="#0078D4" opacity="0.6"/>
          </svg>
        );
      case 'slack':
        return (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
            <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
            <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
            <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
          </svg>
        );
      case 'google-drive':
        return (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 3L12 9.5L16 3H8Z" fill="#0066DA"/>
            <path d="M16 3L20 9.5L16 16L12 9.5L16 3Z" fill="#FFC107"/>
            <path d="M8 3L4 9.5L8 16L12 9.5L8 3Z" fill="#0F9D58"/>
            <path d="M4 9.5L8 16L12 16L8 9.5L4 9.5Z" fill="#0F9D58" opacity="0.7"/>
            <path d="M20 9.5L16 16L12 16L16 9.5L20 9.5Z" fill="#F4B400" opacity="0.7"/>
            <path d="M4 16L8 16L12 21L4 16Z" fill="#DB4437"/>
            <path d="M20 16L16 16L12 21L20 16Z" fill="#0F9D58" opacity="0.5"/>
            <path d="M12 16L8 16L12 21L16 16L12 16Z" fill="#4285F4"/>
          </svg>
        );
      case 'onedrive':
        return (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="onedrive-paint0" x1="3" y1="18" x2="20" y2="17" gradientUnits="userSpaceOnUse">
                <stop stopColor="#2086B8"/>
                <stop offset="1" stopColor="#46D3F6"/>
              </linearGradient>
              <linearGradient id="onedrive-paint1" x1="18" y1="14.5" x2="22.5" y2="11" gradientUnits="userSpaceOnUse">
                <stop stopColor="#1694DB"/>
                <stop offset="1" stopColor="#62C3FE"/>
              </linearGradient>
              <linearGradient id="onedrive-paint2" x1="6.5" y1="5.5" x2="17.5" y2="12" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0D3D78"/>
                <stop offset="1" stopColor="#063B83"/>
              </linearGradient>
              <linearGradient id="onedrive-paint3" x1="0" y1="15" x2="11" y2="11" gradientUnits="userSpaceOnUse">
                <stop stopColor="#16589B"/>
                <stop offset="1" stopColor="#1464B7"/>
              </linearGradient>
            </defs>
            <path d="M5.9 19.5C2.6 19.5 0 16.9 0 13.75C0 10.65 2.5 8.1 5.65 8C7.0 5.9 9.3 4.5 12 4.5C15.5 4.5 18.4 6.8 19.2 10C22.0 10 24 12.1 24 14.75C24 17.3 21.8 19.5 19.4 19.5H5.9Z" fill="#0364B8"/>
            <path d="M5.9 19.5C4.0 19.5 2.4 18.7 1.3 17.4L13.5 12.2L23 17.5C22.2 18.6 20.9 19.5 19.5 19.5C17.3 19.5 9.0 19.5 5.9 19.5Z" fill="url(#onedrive-paint0)"/>
            <path d="M19.2 10L13.5 12.2L23 17.5C23.6 16.8 24 15.8 24 14.75C24 12.1 22.0 10 19.4 10C19.3 10 19.2 10 19.2 10Z" fill="url(#onedrive-paint1)"/>
            <path d="M5.3 8L13.5 12.2L19.2 10C18.4 6.8 15.5 4.5 12 4.5C9.3 4.5 7.0 5.9 5.65 8C5.5 8 5.4 8 5.3 8Z" fill="url(#onedrive-paint2)"/>
            <path d="M1.3 17.4L13.5 12.2L5.3 8C2.3 8.3 0 10.6 0 13.75C0 15.1 0.5 16.4 1.3 17.4Z" fill="url(#onedrive-paint3)"/>
          </svg>
        );
      case 'dropbox':
        return (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 2L12 6L18 2L12 6L6 2Z" fill="#0061FF"/>
            <path d="M12 6L6 10L12 14L18 10L12 6Z" fill="#0061FF"/>
            <path d="M6 10L0 14L6 18L12 14L6 10Z" fill="#0061FF"/>
            <path d="M18 10L24 14L18 18L12 14L18 10Z" fill="#0061FF"/>
            <path d="M12 18L6 22L12 18L18 22L12 18Z" fill="#0061FF"/>
          </svg>
        );
      default:
        return null;
    }
  };

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

