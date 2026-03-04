import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@extension/ui';
import { API_CONFIG } from '../../constants';

interface Credential {
  id: string;
  name: string;
  type: string;
  key?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Extract display name from credential key by removing suffix
 * @param uniqueKey - Full key with suffix (e.g., "production_7a3f")
 * @returns Display name without suffix (e.g., "production")
 */
function extractDisplayName(uniqueKey?: string): string {
  if (!uniqueKey) return '';
  
  // Pattern: match everything before the last underscore followed by exactly 4 alphanumeric chars
  const match = uniqueKey.match(/^(.+)_[a-z0-9]{4}$/);
  
  if (match) {
    return match[1];
  }
  
  // Fallback: if pattern doesn't match, return as-is
  return uniqueKey;
}

/**
 * Mask a credential value for display
 * @param value - The credential value to mask
 * @returns Masked string with asterisks
 */
function maskCredentialValue(value: string | null | undefined): string {
  if (!value) return '';
  
  const raw = String(value);
  const maskLength = Math.max(6, Math.min(raw.length || 0, 12));
  return '*'.repeat(maskLength);
}

export const CredentialsPanel: React.FC<{ isLight: boolean; onStatsChange?: () => void }> = ({ isLight, onStatsChange }) => {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [key, setKey] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [credentialToDelete, setCredentialToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Password visibility state
  const [showPassword, setShowPassword] = useState(false);
  
  // State for tracking which credential secrets are visible in the table
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, string>>({});
  const [loadingSecrets, setLoadingSecrets] = useState<Record<string, boolean>>({});

  const loadCredentials = useCallback(async () => {
    try {
      const baseURL = API_CONFIG.BASE_URL;
      const response = await fetch(`${baseURL}/api/workspace/credentials`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setCredentials(data.credentials || []);
      }
    } catch (error) {
      console.error('[Workspace] Failed to load credentials:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleSecretVisibility = async (credentialId: string) => {
    // If already visible, just hide it
    if (visibleSecrets[credentialId]) {
      setVisibleSecrets(prev => {
        const next = { ...prev };
        delete next[credentialId];
        return next;
      });
      return;
    }

    // Otherwise, fetch the secret
    setLoadingSecrets(prev => ({ ...prev, [credentialId]: true }));
    
    try {
      const baseURL = API_CONFIG.BASE_URL;
      const response = await fetch(`${baseURL}/api/workspace/credentials/bulk`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: [credentialId] }),
      });

      if (response.ok) {
        const data = await response.json();
        const credential = data.credentials?.[0];
        if (credential?.password) {
          setVisibleSecrets(prev => ({ ...prev, [credentialId]: credential.password }));
        }
      }
    } catch (error) {
      console.error('[Workspace] Failed to fetch credential secret:', error);
    } finally {
      setLoadingSecrets(prev => {
        const next = { ...prev };
        delete next[credentialId];
        return next;
      });
    }
  };

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const handleCreate = () => {
    setShowEditor(true);
    setEditingCredential(null);
    setName('');
    setType('');
    setKey('');
    setPassword('');
    setShowPassword(false);
  };

  const handleEdit = async (credential: Credential) => {
    setShowEditor(true);
    setEditingCredential(credential);
    setName(credential.name);
    setType(credential.type);
    // Extract the base key (without suffix) for editing
    setKey(credential.key ? extractDisplayName(credential.key) : '');
    setShowPassword(false); // Reset password visibility
    
    // Load the existing password so user can see it with eye icon
    try {
      const baseURL = API_CONFIG.BASE_URL;
      const response = await fetch(`${baseURL}/api/workspace/credentials/bulk`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: [credential.id] }),
      });

      if (response.ok) {
        const data = await response.json();
        const fullCredential = data.credentials?.[0];
        if (fullCredential?.password) {
          setPassword(fullCredential.password);
        } else {
          setPassword('');
        }
      } else {
        setPassword('');
      }
    } catch (error) {
      console.error('[Workspace] Failed to fetch credential password:', error);
      setPassword('');
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !type.trim() || !key.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const baseURL = API_CONFIG.BASE_URL;
      const url = editingCredential
        ? `${baseURL}/api/workspace/credentials/${editingCredential.id}`
        : `${baseURL}/api/workspace/credentials`;
      
      const response = await fetch(url, {
        method: editingCredential ? 'PUT' : 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          type,
          key: key.trim() || undefined, // Send user-provided key
          password: password || undefined, // Only send if provided
        }),
      });

      if (!response.ok) {
        throw new Error('Save failed');
      }

      await loadCredentials();
      // Refresh workspace stats after successful save
      onStatsChange?.();
      setShowEditor(false);
      setName('');
      setType('');
      setKey('');
      setPassword('');
      setEditingCredential(null);
    } catch (error) {
      console.error('[Workspace] Save error:', error);
      alert('Failed to save credential');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (id: string, credName: string) => {
    setCredentialToDelete({ id, name: credName });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteCredential = async () => {
    if (!credentialToDelete) return;

    setDeleting(true);
    try {
      const baseURL = API_CONFIG.BASE_URL;
      const response = await fetch(`${baseURL}/api/workspace/credentials/${credentialToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      await loadCredentials();
      // Refresh workspace stats after successful deletion
      onStatsChange?.();
      setDeleteDialogOpen(false);
      setCredentialToDelete(null);
    } catch (error) {
      console.error('[Workspace] Delete error:', error);
      alert('Failed to delete credential');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className={cn('text-center py-8 text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>Loading credentials...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Editor */}
      {showEditor && (
        <div className={cn('rounded-lg border p-4', isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700')}>
          <div className="space-y-3">
            <div>
              <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={cn(
                  'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                  isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white'
                )}
                placeholder="My API Key"
              />
            </div>

            <div>
              <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                Type *
              </label>
              <input
                type="text"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={cn(
                  'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                  isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white'
                )}
                placeholder="API Key, Database, SSH, etc."
              />
            </div>

            <div>
              <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                Key *
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className={cn(
                  'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                  isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white'
                )}
                placeholder="e.g., databricks_host, production_token"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                  Secret {!editingCredential && '*'}
              </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded transition-colors',
                    isLight
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19.5c-5 0-9-4.5-9-7.5a7.88 7.88 0 012.243-3.992m2.598-1.96A9.956 9.956 0 0112 4.5c5 0 9 4.5 9 7.5a7.86 7.86 0 01-2.318 4.042M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 12s4.5-7.5 10.5-7.5 10.5 7.5 10.5 7.5-4.5 7.5-10.5 7.5S1.5 12 1.5 12z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                    </svg>
                  )}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn(
                  'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                  isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white'
                )}
                placeholder="password or secret"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !name.trim() || !type.trim() || (!editingCredential && !key.trim())}
                className={cn(
                  'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                  saving || !name.trim() || !type.trim() || (!editingCredential && !key.trim())
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                    : isLight
                    ? 'bg-blue-500/90 text-white hover:bg-blue-500'
                    : 'bg-blue-600/90 text-white hover:bg-blue-600',
                )}
              >
                {saving ? 'Saving...' : 'Save Credential'}
              </button>
              <button
                onClick={() => {
                  setShowEditor(false);
                  setEditingCredential(null);
                }}
                disabled={saving}
                className={cn(
                  'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                  isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                )}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials List */}
      <div className={cn('rounded-lg border overflow-hidden', isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700')}>
        <div className={cn('border-b px-4 py-2 flex items-center justify-between', isLight ? 'border-gray-200' : 'border-gray-700')}>
          <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>Your Credentials</h3>
          <button
            onClick={handleCreate}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium rounded transition-colors border',
              isLight
                ? 'text-blue-600 hover:bg-blue-50 border-gray-200'
                : 'text-blue-300 hover:bg-blue-900/20 border-gray-700'
            )}
            title="Create new credential">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            NEW CREDENTIAL
          </button>
        </div>
        {credentials.length === 0 ? (
          <div className={cn('px-4 py-8 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            No credentials yet. Add your first credential to get started.
          </div>
        ) : (
          <div className="max-h-[600px] w-full overflow-auto">
            <table className={cn('min-w-full w-full border-collapse text-xs')}>
              <thead className={cn('sticky top-0 z-10', isLight ? 'bg-gray-50' : 'bg-[#151C24]')}>
                <tr className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                  <th className={cn('px-3 py-1.5 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Name</th>
                  <th className={cn('px-3 py-1.5 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Type</th>
                  <th className={cn('px-3 py-1.5 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Key</th>
                  <th className={cn('px-3 py-1.5 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Secret</th>
                  <th className={cn('px-3 py-1.5 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Updated</th>
                  <th className={cn('px-3 py-1.5 text-right text-xs font-semibold w-24', isLight ? 'text-gray-600' : 'text-gray-300')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map(credential => (
                  <tr
                    key={credential.id}
                    className={cn(
                      'transition-colors border-b',
                      isLight ? 'border-gray-100 hover:bg-gray-50' : 'border-gray-700 hover:bg-gray-900/40'
                    )}
                  >
                    <td className={cn('px-3 py-1.5 font-medium', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                      {credential.name}
                    </td>
                    <td className={cn('px-3 py-1.5', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', isLight ? 'bg-gray-100 text-gray-600' : 'bg-gray-800 text-gray-400')}>
                        {credential.type}
                      </span>
                    </td>
                    <td className={cn('px-3 py-1.5', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {/* Display the key without suffix for cleaner UI */}
                      {credential.key ? extractDisplayName(credential.key) : '—'}
                    </td>
                    <td className={cn('px-3 py-1.5', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      <div className="flex items-center gap-2">
                        {loadingSecrets[credential.id] ? (
                          <span className="text-[10px]">Loading...</span>
                        ) : visibleSecrets[credential.id] ? (
                          <span className="font-mono text-[11px] break-all max-w-[200px]">{visibleSecrets[credential.id]}</span>
                        ) : (
                          <span className="text-[11px]">{maskCredentialValue('secret')}</span>
                        )}
                        <button
                          onClick={() => toggleSecretVisibility(credential.id)}
                          className={cn(
                            'inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded transition-colors',
                            isLight
                              ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                              : 'text-gray-500 hover:bg-gray-700 hover:text-gray-300',
                          )}
                          title={visibleSecrets[credential.id] ? 'Hide secret' : 'Show secret'}
                          aria-label={visibleSecrets[credential.id] ? 'Hide secret' : 'Show secret'}
                        >
                          {visibleSecrets[credential.id] ? (
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19.5c-5 0-9-4.5-9-7.5a7.88 7.88 0 012.243-3.992m2.598-1.96A9.956 9.956 0 0112 4.5c5 0 9 4.5 9 7.5a7.86 7.86 0 01-2.318 4.042M3 3l18 18" />
                            </svg>
                          ) : (
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 12s4.5-7.5 10.5-7.5 10.5 7.5 10.5 7.5-4.5 7.5-10.5 7.5S1.5 12 1.5 12z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className={cn('px-3 py-1.5 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {formatDate(credential.updated_at)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(credential)}
                          className={cn(
                            'p-1 rounded transition-colors',
                            isLight ? 'text-gray-400 hover:text-blue-600' : 'text-gray-500 hover:text-blue-400'
                          )}
                          title="Edit credential"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => openDeleteDialog(credential.id, credential.name)}
                          className={cn(
                            'p-1 rounded transition-colors',
                            isLight ? 'text-gray-400 hover:text-red-600' : 'text-gray-500 hover:text-red-400'
                          )}
                          title="Delete credential"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteDialogOpen && credentialToDelete && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[10000] backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setDeleteDialogOpen(false);
                setCredentialToDelete(null);
              }
            }}
          />

          {/* Modal */}
          <div 
            className="fixed inset-0 z-[10001] flex items-center justify-center p-4 pointer-events-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl pointer-events-auto',
                isLight
                  ? 'bg-gray-50 border border-gray-200'
                  : 'bg-[#151C24] border border-gray-700'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between px-3 py-2 border-b',
                  isLight ? 'border-gray-200' : 'border-gray-700'
                )}
              >
                <h2
                  className={cn(
                    'text-sm font-semibold',
                    isLight ? 'text-gray-900' : 'text-gray-100'
                  )}
                >
                  Delete Credential
                </h2>
                <button
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setCredentialToDelete(null);
                  }}
                  className={cn(
                    'p-0.5 rounded-md transition-colors',
                    isLight
                      ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  )}
                >
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="px-3 py-4 space-y-3">
                {/* Warning Icon */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center',
                      isLight ? 'bg-red-100' : 'bg-red-900/30'
                    )}
                  >
                    <svg
                      className={cn(
                        'w-4 h-4',
                        isLight ? 'text-red-600' : 'text-red-400'
                      )}
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>

                  <div className="flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        isLight ? 'text-gray-900' : 'text-gray-100'
                      )}
                    >
                      Permanently delete credential?
                    </p>
                    <p
                      className={cn(
                        'text-xs mt-1',
                        isLight ? 'text-gray-600' : 'text-gray-400'
                      )}
                    >
                      "{credentialToDelete.name}" will be permanently deleted and cannot be recovered.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 px-3 py-2 border-t',
                  isLight ? 'border-gray-200' : 'border-gray-700'
                )}
              >
                <button
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setCredentialToDelete(null);
                  }}
                  disabled={deleting}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    deleting ? 'opacity-50 cursor-not-allowed' : '',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    confirmDeleteCredential();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={deleting}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    deleting ? 'opacity-50 cursor-not-allowed' : '',
                    'bg-red-600 text-white hover:bg-red-700'
                  )}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

