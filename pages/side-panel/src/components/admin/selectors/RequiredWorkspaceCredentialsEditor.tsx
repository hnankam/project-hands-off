import * as React from 'react';
import { cn } from '@extension/ui';
import { WorkspaceCredentialTypeDropdown } from './WorkspaceCredentialTypeDropdown';

export interface AgentRequiredCredentialRow {
  localId: string;
  credentialType: string;
  description: string;
}

export function newAgentRequiredCredentialRowId() {
  return `rwc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface RequiredWorkspaceCredentialsEditorProps {
  rows: AgentRequiredCredentialRow[];
  onChange: (rows: AgentRequiredCredentialRow[]) => void;
  isLight: boolean;
  disabled?: boolean;
}

/**
 * Header + Add on the right; each row is type dropdown, description, and trash (no accordion).
 */
export const RequiredWorkspaceCredentialsEditor: React.FC<RequiredWorkspaceCredentialsEditorProps> = ({
  rows,
  onChange,
  isLight,
  disabled = false,
}) => {
  const addRow = () => {
    const id = newAgentRequiredCredentialRowId();
    onChange([...rows, { localId: id, credentialType: '', description: '' }]);
  };

  const removeRow = (localId: string) => {
    onChange(rows.filter(r => r.localId !== localId));
  };

  const updateRow = (localId: string, patch: Partial<AgentRequiredCredentialRow>) => {
    onChange(rows.map(r => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  if (disabled) {
    return (
      <div
        className={cn(
          'rounded-lg border p-3',
          isLight ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-700 bg-gray-800/30 text-gray-400',
        )}>
        <p className="text-xs">Required workspace credentials</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
          Required workspace credentials (optional)
        </span>
        <button
          type="button"
          onClick={addRow}
          className={cn(
            'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
            isLight ? 'text-blue-600 hover:bg-blue-50' : 'text-blue-400 hover:bg-blue-900/20',
          )}>
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add required credential
        </button>
      </div>

      <p className={cn('text-[10px] leading-snug', isLight ? 'text-gray-500' : 'text-gray-400')}>
        Credential <strong>type</strong> and a short label (e.g. two Databricks rows: workspace host vs token). Users
        attach matching keys in chat context. Stored as{' '}
        <code className="rounded bg-black/5 px-0.5 text-[9px] dark:bg-white/10">required_workspace_credentials</code>.
      </p>

      {rows.length === 0 ? (
        <div
          className={cn(
            'rounded-lg border border-dashed py-3 text-center text-xs',
            isLight ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-gray-700 bg-gray-800/50 text-gray-500',
          )}>
          No required credentials configured
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(row => (
            <div
              key={row.localId}
              className={cn(
                'grid grid-cols-1 items-center gap-2 rounded-lg border px-2 py-2 sm:grid-cols-[minmax(10rem,14rem)_1fr_auto]',
                isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-gray-800/50',
              )}>
              <WorkspaceCredentialTypeDropdown
                value={row.credentialType}
                onChange={v => updateRow(row.localId, { credentialType: v })}
                isLight={isLight}
                className="min-w-0 sm:max-w-none"
              />
              <input
                type="text"
                value={row.description}
                onChange={e => updateRow(row.localId, { description: e.target.value })}
                placeholder="e.g. Databricks workspace URL"
                className={cn(
                  'min-h-[32px] w-full min-w-0 rounded border px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500',
                  isLight ? 'border-gray-300 bg-white text-gray-700' : 'border-gray-600 bg-[#151C24] text-[#bcc1c7]',
                )}
              />
              <button
                type="button"
                onClick={() => removeRow(row.localId)}
                className={cn(
                  'flex-shrink-0 justify-self-end rounded p-1.5 transition-colors sm:justify-self-center',
                  isLight
                    ? 'text-gray-400 hover:bg-red-50 hover:text-red-500'
                    : 'text-gray-500 hover:bg-red-900/20 hover:text-red-400',
                )}
                title="Remove">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
