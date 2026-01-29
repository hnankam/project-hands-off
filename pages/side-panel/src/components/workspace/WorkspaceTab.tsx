import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@extension/ui';
import { FilesPanel } from './FilesPanel';
import { NotesPanel } from './NotesPanel';
import { ConnectionsPanel } from './ConnectionsPanel';
import { CredentialsPanel } from './CredentialsPanel';

interface WorkspaceTabProps {
  isLight: boolean;
}

type SubTab = 'files' | 'notes' | 'connections' | 'credentials';

export const WorkspaceTab: React.FC<WorkspaceTabProps> = ({ isLight }) => {
  // Initialize activeSubTab from localStorage
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(() => {
    try {
      const stored = localStorage.getItem('workspaceActiveSubTab');
      if (stored === 'files' || stored === 'notes' || stored === 'connections' || stored === 'credentials') {
        return stored;
      }
    } catch (error) {
      console.error('[Workspace] Failed to read sub-tab from localStorage:', error);
    }
    return 'files';
  });

  const [stats, setStats] = useState({
    file_count: 0,
    note_count: 0,
    connection_count: 0,
    credential_count: 0,
    total_size: 0,
  });
  const [loading, setLoading] = useState(true);

  // Persist activeSubTab to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('workspaceActiveSubTab', activeSubTab);
    } catch (error) {
      console.error('[Workspace] Failed to save sub-tab to localStorage:', error);
    }
  }, [activeSubTab]);

  // Load workspace summary
  const loadSummary = useCallback(async () => {
    try {
      const baseURL = process.env.CEB_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/summary`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        // Ensure numeric values are properly parsed
        setStats({
          file_count: parseInt(data.stats?.file_count || 0, 10),
          note_count: parseInt(data.stats?.note_count || 0, 10),
          connection_count: parseInt(data.stats?.connection_count || 0, 10),
          credential_count: parseInt(data.stats?.credential_count || 0, 10),
          total_size: parseInt(data.stats?.total_size || 0, 10),
        });
      }
    } catch (error) {
      console.error('[Workspace] Failed to load summary:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0 || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const renderIcon = useCallback((icon: 'file' | 'note' | 'storage' | 'connection') => {
    const baseClasses = cn(
      'w-5 h-5 flex-shrink-0',
      icon === 'file'
        ? isLight ? 'text-blue-500' : 'text-blue-300'
        : icon === 'note'
        ? isLight ? 'text-violet-500' : 'text-violet-300'
        : icon === 'storage'
        ? isLight ? 'text-emerald-500' : 'text-emerald-300'
        : isLight
        ? 'text-amber-500'
        : 'text-amber-300',
    );

    switch (icon) {
      case 'file':
        return (
          <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'note':
        return (
          <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'storage':
        return (
          <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'connection':
      default:
        return (
          <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
    }
  }, [isLight]);

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Stats Overview */}
      {loading ? (
        <div className={cn('text-center py-4 text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
          Loading workspace...
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <div
            className={cn(
              'rounded-lg border p-3 transition-colors',
              isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
            )}>
            <div className="flex items-center justify-between mb-2">
              <div className={cn('text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-400')}>
                Files
              </div>
              {renderIcon('file')}
            </div>
            <div className={cn('text-2xl font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
              {stats.file_count}
            </div>
            <div className={cn('mt-1 text-xs leading-snug', isLight ? 'text-gray-600' : 'text-gray-400')}>
              Uploaded documents
            </div>
          </div>
          <div
            className={cn(
              'rounded-lg border p-3 transition-colors',
              isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
            )}>
            <div className="flex items-center justify-between mb-2">
              <div className={cn('text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-400')}>
                Notes
              </div>
              {renderIcon('note')}
            </div>
            <div className={cn('text-2xl font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
              {stats.note_count}
            </div>
            <div className={cn('mt-1 text-xs leading-snug', isLight ? 'text-gray-600' : 'text-gray-400')}>
              Personal notes
            </div>
          </div>
          <div
            className={cn(
              'rounded-lg border p-3 transition-colors',
              isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
            )}>
            <div className="flex items-center justify-between mb-2">
              <div className={cn('text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-400')}>
                Storage
              </div>
              {renderIcon('storage')}
            </div>
            <div className={cn('text-2xl font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
              {formatSize(stats.total_size)}
            </div>
            <div className={cn('mt-1 text-xs leading-snug', isLight ? 'text-gray-600' : 'text-gray-400')}>
              Total size used
            </div>
          </div>
          <div
            className={cn(
              'rounded-lg border p-3 transition-colors',
              isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
            )}>
            <div className="flex items-center justify-between mb-2">
              <div className={cn('text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-400')}>
                Connections + Credentials
              </div>
              {renderIcon('connection')}
            </div>
            <div className={cn('text-2xl font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
              {stats.connection_count + stats.credential_count}
            </div>
            <div className={cn('mt-1 text-xs leading-snug', isLight ? 'text-gray-600' : 'text-gray-400')}>
              {stats.connection_count} services • {stats.credential_count} credentials
            </div>
          </div>
        </div>
      )}

      {/* Sub-tabs - Centered */}
      <div className="flex justify-center">
        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-lg p-1',
            isLight ? 'bg-gray-100' : 'bg-[#151C24]',
          )}>
          <button
            onClick={() => setActiveSubTab('files')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded transition-colors',
              activeSubTab === 'files'
                ? isLight
                  ? 'bg-white text-gray-900'
                  : 'bg-gray-700 text-white'
                : isLight
                ? 'text-gray-600 hover:text-gray-900'
                : 'text-gray-400 hover:text-gray-200',
            )}>
            Files
          </button>
          <button
            onClick={() => setActiveSubTab('notes')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded transition-colors',
              activeSubTab === 'notes'
                ? isLight
                  ? 'bg-white text-gray-900'
                  : 'bg-gray-700 text-white'
                : isLight
                ? 'text-gray-600 hover:text-gray-900'
                : 'text-gray-400 hover:text-gray-200',
            )}>
            Notes
          </button>
          <button
            onClick={() => setActiveSubTab('connections')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded transition-colors',
              activeSubTab === 'connections'
                ? isLight
                  ? 'bg-white text-gray-900'
                  : 'bg-gray-700 text-white'
                : isLight
                ? 'text-gray-600 hover:text-gray-900'
                : 'text-gray-400 hover:text-gray-200',
            )}>
            Connections
          </button>
          <button
            onClick={() => setActiveSubTab('credentials')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded transition-colors',
              activeSubTab === 'credentials'
                ? isLight
                  ? 'bg-white text-gray-900'
                  : 'bg-gray-700 text-white'
                : isLight
                ? 'text-gray-600 hover:text-gray-900'
                : 'text-gray-400 hover:text-gray-200',
            )}>
            Credentials
          </button>
        </div>
      </div>

      {/* Content with animations */}
      {activeSubTab === 'files' && (
        <div className="animate-fadeIn">
          <FilesPanel isLight={isLight} onStatsChange={loadSummary} />
        </div>
      )}
      {activeSubTab === 'notes' && (
        <div className="animate-fadeIn">
          <NotesPanel isLight={isLight} onStatsChange={loadSummary} />
        </div>
      )}
      {activeSubTab === 'connections' && (
        <div className="animate-fadeIn">
          <ConnectionsPanel isLight={isLight} onStatsChange={loadSummary} />
        </div>
      )}
      {activeSubTab === 'credentials' && (
        <div className="animate-fadeIn">
          <CredentialsPanel isLight={isLight} onStatsChange={loadSummary} />
        </div>
      )}
    </div>
  );
};

