/**
 * AdminConfirmDialog
 * 
 * A reusable confirmation dialog for admin actions like delete, ban, reset, etc.
 * Provides consistent styling and behavior across all admin tabs.
 */

import React from 'react';
import { cn } from '@extension/ui';

export interface AdminConfirmDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Called when the dialog should close */
  onClose: () => void;
  /** Called when the confirm action is triggered */
  onConfirm: () => void;
  /** Dialog title */
  title: string;
  /** Dialog message/content */
  message: React.ReactNode;
  /** Text for the confirm button */
  confirmText?: string;
  /** Text for the cancel button */
  cancelText?: string;
  /** Visual variant for the confirm button */
  variant?: 'danger' | 'warning' | 'info';
  /** Light/dark theme */
  isLight: boolean;
  /** Loading state for the confirm button */
  isLoading?: boolean;
  /** Disable the confirm button */
  disabled?: boolean;
}

const Z_INDEX = {
  backdrop: 10000,
  modal: 10001,
} as const;

export const AdminConfirmDialog: React.FC<AdminConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLight,
  isLoading = false,
  disabled = false,
}) => {
  if (!isOpen) return null;

  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';
  const mutedTextColor = isLight ? 'text-gray-500' : 'text-gray-400';

  const getConfirmButtonStyles = () => {
    const base = 'px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50';
    
    switch (variant) {
      case 'danger':
        return cn(base, 'bg-red-600 text-white hover:bg-red-700 disabled:hover:bg-red-600');
      case 'warning':
        return cn(base, 'bg-amber-600 text-white hover:bg-amber-700 disabled:hover:bg-amber-600');
      case 'info':
      default:
        return cn(base, 'bg-blue-600/90 text-white hover:bg-blue-600 disabled:hover:bg-blue-600');
    }
  };

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
              {title}
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
            <div className={cn('text-xs', mutedTextColor)}>
              {message}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                disabled={isLoading}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  isLight
                    ? 'text-gray-700 hover:bg-gray-200 border border-gray-300'
                    : 'text-gray-300 hover:bg-gray-700 border border-gray-600',
                  'disabled:opacity-50',
                )}
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={isLoading || disabled}
                className={getConfirmButtonStyles()}
              >
                {isLoading ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  confirmText
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminConfirmDialog;

