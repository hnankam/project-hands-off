/**
 * Bulk Embed Modal Component
 *
 * Confirmation modal for bulk embedding of inactive browser tabs.
 * Shows the list of tabs that will be activated for embedding.
 */

import * as React from 'react';
import { cn } from '@extension/ui';
import { ModalCloseButton } from './ModalCloseButton';

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
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.modal }}>
        <div
          className={cn(
            'w-full max-w-md rounded-lg shadow-xl',
            isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
          )}
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div
            className={cn(
              'flex items-center justify-between border-b px-3 py-2',
              isLight ? 'border-gray-200' : 'border-gray-700',
            )}>
            <h2 className={cn('text-xs font-semibold', mainTextColor)}>Bulk Embedding</h2>
            <ModalCloseButton onClick={onClose} isLight={isLight} />
          </div>

          {/* Content */}
          <div className="space-y-3 px-3 py-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                  isLight ? 'bg-amber-100' : 'bg-amber-900/30',
                )}>
                <svg
                  className={cn('h-3.5 w-3.5', isLight ? 'text-amber-600' : 'text-amber-400')}
                  fill="currentColor"
                  viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
              </div>

              <div className="flex-1">
                <div className={cn('text-sm', mainTextColor)}>
                  <strong>
                    Reload {inactiveTabs.length} suspended tab{inactiveTabs.length !== 1 ? 's' : ''}?
                  </strong>
                  <br />
                  <p className={cn('mt-1 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    The following tabs have been suspended by Chrome and need to be reloaded for embedding:
                  </p>
                </div>
              </div>
            </div>

            <div
              className={cn(
                'ml-9 overflow-hidden rounded border',
                isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-gray-800/50',
              )}>
              <div
                className="recent-sessions-scroll max-h-[200px] overflow-y-auto overscroll-contain"
                style={
                  {
                    '--table-scroll-bg': isLight ? '#ffffff' : 'rgba(31, 41, 55, 0.5)',
                  } as React.CSSProperties
                }>
                {inactiveTabs.map(tab => (
                  <div
                    key={tab.id}
                    className={cn(
                      'flex items-center gap-2 border-b px-2 py-1.5 last:border-b-0',
                      isLight ? 'border-gray-100' : 'border-gray-700/50',
                    )}>
                    {tab.favIconUrl ? (
                      <img src={tab.favIconUrl} className="h-4 w-4 flex-shrink-0" alt="" />
                    ) : (
                      <div className={cn('h-4 w-4 flex-shrink-0 rounded', isLight ? 'bg-gray-300' : 'bg-gray-600')} />
                    )}
                    <span className={cn('truncate text-xs', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      {tab.title}
                    </span>
                    {tab.discarded && (
                      <span
                        className={cn(
                          'flex-shrink-0 rounded px-1 py-0.5 text-[10px]',
                          isLight ? 'bg-gray-100 text-gray-500' : 'bg-gray-700 text-gray-400',
                        )}>
                        💤
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <p className={cn('ml-9 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
              Tabs will be rapidly activated and your original tab will be restored after completion.
            </p>
          </div>

          {/* Footer */}
          <div
            className={cn(
              'flex items-center justify-end gap-2 border-t px-3 py-2',
              isLight ? 'border-gray-200' : 'border-gray-700',
            )}>
            <button
              onClick={onClose}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isLight ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-700 hover:bg-gray-600',
              )}
              style={{ color: isLight ? '#374151' : '#bcc1c7' }}>
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700">
              Embed {totalTabs} Tab{totalTabs !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default BulkEmbedModal;
