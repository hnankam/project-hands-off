/**
 * BanUserDialog
 * 
 * A dialog for banning/unbanning users with optional reason input.
 * Used in UsersTab for user deactivation/reactivation.
 */

import React from 'react';
import { cn } from '@extension/ui';

export interface UserToBan {
  id: string;
  email: string;
  name?: string | null;
  isBanned: boolean;
}

export interface BanUserDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Called when the dialog should close */
  onClose: () => void;
  /** Called when the confirm action is triggered */
  onConfirm: () => void;
  /** User to ban/unban */
  user: UserToBan | null;
  /** Ban reason (for banning only) */
  banReason: string;
  /** Called when ban reason changes */
  onBanReasonChange: (reason: string) => void;
  /** Light/dark theme */
  isLight: boolean;
  /** Loading state */
  isLoading?: boolean;
}

const Z_INDEX = {
  backdrop: 10000,
  modal: 10001,
} as const;

export const BanUserDialog: React.FC<BanUserDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  user,
  banReason,
  onBanReasonChange,
  isLight,
  isLoading = false,
}) => {
  if (!isOpen || !user) return null;

  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';
  const isBanned = user.isBanned;

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
            'w-full max-w-sm rounded-lg shadow-xl',
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
            <h2 className={cn('text-sm font-semibold', mainTextColor)}>
              {isBanned ? 'Reactivate User' : 'Deactivate User'}
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
                  isBanned
                    ? isLight ? 'bg-green-100' : 'bg-green-900/30'
                    : isLight ? 'bg-yellow-100' : 'bg-yellow-900/30',
                )}
              >
                {isBanned ? (
                  <svg
                    className={cn('h-3.5 w-3.5', isLight ? 'text-green-600' : 'text-green-400')}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg
                    className={cn('h-3.5 w-3.5', isLight ? 'text-yellow-600' : 'text-yellow-400')}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                )}
              </div>

              <div className="flex-1">
                <p className={cn('text-sm font-medium', mainTextColor)}>
                  {isBanned
                    ? `Reactivate "${user.name || user.email}"?`
                    : `Deactivate "${user.name || user.email}"?`}
                </p>
                <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  {isBanned
                    ? 'This will restore the user\'s access to the application. They will be able to sign in again.'
                    : 'This will prevent the user from signing in. Their data will be preserved and they can be reactivated later.'}
                </p>
              </div>
            </div>

            {/* Ban reason input (only for banning) */}
            {!isBanned && (
              <div className="mt-3">
                <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={banReason}
                  onChange={e => onBanReasonChange(e.target.value)}
                  placeholder="Enter reason for deactivation..."
                  className={cn(
                    'w-full px-3 py-1.5 text-xs border rounded focus:ring-1 focus:ring-yellow-500 outline-none',
                    isLight
                      ? 'bg-white border-gray-300 text-gray-900'
                      : 'bg-[#151C24] border-gray-600 text-white',
                  )}
                />
              </div>
            )}
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
              disabled={isLoading}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isLight
                  ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                  : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                'disabled:opacity-50',
              )}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isBanned
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-yellow-600 text-white hover:bg-yellow-700',
                'disabled:opacity-50',
              )}
            >
              {isLoading
                ? isBanned ? 'Reactivating...' : 'Deactivating...'
                : isBanned ? 'Reactivate User' : 'Deactivate User'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default BanUserDialog;

