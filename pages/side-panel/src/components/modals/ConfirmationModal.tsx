/**
 * Reusable Confirmation Modal Component
 * Used for destructive actions across the application
 */

import * as React from 'react';
import { cn } from '@extension/ui';
import { ModalCloseButton } from './ModalCloseButton';

// ============================================================================
// CONSTANTS
// ============================================================================

const Z_INDEX = {
  backdrop: 10000,
  modal: 10001,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLight: boolean;
  mainTextColor: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLight,
  mainTextColor,
}) => {
  // Determine colors based on variant
  const getVariantColors = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: isLight ? 'bg-red-100' : 'bg-red-900/30',
          iconColor: isLight ? 'text-red-600' : 'text-red-400',
          buttonBg: 'bg-red-600 text-white hover:bg-red-700',
        };
      case 'warning':
        return {
          iconBg: isLight ? 'bg-orange-100' : 'bg-orange-900/30',
          iconColor: isLight ? 'text-orange-600' : 'text-orange-400',
          buttonBg: 'bg-orange-600 text-white hover:bg-orange-700',
        };
      case 'info':
        return {
          iconBg: isLight ? 'bg-blue-100' : 'bg-blue-900/30',
          iconColor: isLight ? 'text-blue-600' : 'text-blue-400',
          buttonBg: 'bg-blue-600 text-white hover:bg-blue-700',
        };
    }
  };

  const colors = getVariantColors();

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          style={{ zIndex: Z_INDEX.backdrop }}
          onClick={onClose}
        />
      )}

      {/* Modal */}
      <div
        className={cn(
          'fixed inset-0 flex items-center justify-center p-4 transition-opacity',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ zIndex: Z_INDEX.modal }}>
        <div
          className={cn(
            'w-full max-w-sm rounded-lg shadow-xl',
            isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
          )}
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div
            className={cn(
              'flex items-center justify-between border-b px-3 py-2',
              isLight ? 'border-gray-200' : 'border-gray-700',
            )}>
            <h2 className={cn('text-sm font-semibold', mainTextColor)}>{title}</h2>
            <ModalCloseButton onClick={onClose} isLight={isLight} />
          </div>

          {/* Content */}
          <div className="space-y-3 px-3 py-4">
            <div className="flex items-start gap-3">
              <div className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', colors.iconBg)}>
                <svg className={cn('h-3.5 w-3.5', colors.iconColor)} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
              </div>

              <div className="flex-1">
                <div className={cn('text-sm', mainTextColor)} dangerouslySetInnerHTML={{ __html: message }} />
              </div>
            </div>
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
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', colors.buttonBg)}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
