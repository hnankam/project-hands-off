import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@extension/ui';

interface Credential {
  id: string;
  name: string;
  type: string;
  key?: string;
  created_at: string;
  updated_at: string;
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

  const loadCredentials = useCallback(async () => {
    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
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
  };

  const handleEdit = (credential: Credential) => {
    setShowEditor(true);
    setEditingCredential(credential);
    setName(credential.name);
    setType(credential.type);
    setKey(credential.key || '');
    setPassword(''); // Don't load existing password
  };

  const handleSave = async () => {
    if (!name.trim() || !type.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
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
          key,
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

  const handleDelete = async (id: string, credName: string) => {
    if (!confirm(`Delete credential "${credName}"?`)) return;

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/credentials/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      await loadCredentials();
      // Refresh workspace stats after successful deletion
      onStatsChange?.();
    } catch (error) {
      console.error('[Workspace] Delete error:', error);
      alert('Failed to delete credential');
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
                Key
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className={cn(
                  'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 outline-none',
                  isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white'
                )}
                placeholder="API key, username, client ID, etc."
              />
            </div>

            <div>
              <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                Password / Secret {editingCredential && '(leave blank to keep unchanged)'}
              </label>
              <input
                type="password"
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
                disabled={saving || !name.trim() || !type.trim()}
                className={cn(
                  'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                  saving || !name.trim() || !type.trim()
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
              'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors',
              isLight
                ? 'text-blue-600 hover:bg-blue-50'
                : 'text-blue-300 hover:bg-blue-900/20'
            )}
            title="Create new credential">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
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
                      {credential.key || '—'}
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
                          onClick={() => handleDelete(credential.id, credential.name)}
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
    </div>
  );
};

