/**
 * Bulk Embed Modal Component
 * 
 * Confirmation modal for bulk embedding of inactive browser tabs.
 * Shows the list of tabs that will be activated for embedding.
 */

import React from 'react';
import { cn } from '@extension/ui';

// ============================================================================
// CONSTANTS
// ============================================================================

const Z_INDEX = {
  backdrop: 100000,
  modal: 100001,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface BrowserTabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  discarded?: boolean;
}

export interface BulkEmbedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  inactiveTabs: BrowserTabInfo[];
  totalTabs: number;
  isLight: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const BulkEmbedModal: React.FC<BulkEmbedModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  inactiveTabs,
  totalTabs,
  isLight,
}) => {
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        style={{ zIndex: Z_INDEX.backdrop }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: Z_INDEX.modal }}
      >
        <div
          className={cn(
            'w-full max-w-md rounded-lg shadow-xl',
            isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
          )}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className={cn(
              'flex items-center justify-between border-b px-3 py-2',
              isLight ? 'border-gray-200' : 'border-gray-700',
            )}
          >
            <h2 className={cn('text-xs font-semibold', mainTextColor)}>
              Bulk Embedding
            </h2>
            <button
              onClick={onClose}
              className={cn(
                'rounded-md p-0.5 transition-colors',
                isLight
                  ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
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
          <div className="space-y-3 px-3 py-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                  isLight ? 'bg-amber-100' : 'bg-amber-900/30'
                )}
              >
                <svg
                  className={cn('h-3.5 w-3.5', isLight ? 'text-amber-600' : 'text-amber-400')}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
              </div>

              <div className="flex-1">
                <div className={cn('text-sm', mainTextColor)}>
                  <strong>Reload {inactiveTabs.length} suspended tab{inactiveTabs.length !== 1 ? 's' : ''}?</strong>
                  <br />
                  <p className={cn('text-xs mt-1', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    The following tabs have been suspended by Chrome and need to be reloaded for embedding:
                  </p>
                </div>
              </div>
            </div>
            
            <div className={cn(
              'rounded border overflow-hidden ml-9',
              isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-gray-800/50'
            )}>
              <div className="max-h-[200px] overflow-y-auto">
                {inactiveTabs.map(tab => (
                  <div 
                    key={tab.id}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 border-b last:border-b-0',
                      isLight ? 'border-gray-100' : 'border-gray-700/50'
                    )}
                  >
                    {tab.favIconUrl ? (
                      <img src={tab.favIconUrl} className="w-4 h-4 flex-shrink-0" alt="" />
                    ) : (
                      <div className={cn('w-4 h-4 rounded flex-shrink-0', isLight ? 'bg-gray-300' : 'bg-gray-600')} />
                    )}
                    <span className={cn('text-xs truncate', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      {tab.title}
                    </span>
                    {tab.discarded && (
                      <span className={cn(
                        'text-[10px] px-1 py-0.5 rounded flex-shrink-0',
                        isLight ? 'bg-gray-100 text-gray-500' : 'bg-gray-700 text-gray-400'
                      )}>
                        💤
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            <p className={cn('text-xs ml-9', isLight ? 'text-gray-500' : 'text-gray-400')}>
              Tabs will be rapidly activated and your original tab will be restored after completion.
            </p>
          </div>

          {/* Footer */}
          <div
            className={cn(
              'flex items-center justify-end gap-2 border-t px-3 py-2',
              isLight ? 'border-gray-200' : 'border-gray-700',
            )}
          >
            <button
              onClick={onClose}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isLight
                  ? 'bg-gray-200 hover:bg-gray-300'
                  : 'bg-gray-700 hover:bg-gray-600',
              )}
              style={{ color: isLight ? '#374151' : '#bcc1c7' }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700"
            >
              Embed {totalTabs} Tab{totalTabs !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default BulkEmbedModal;

