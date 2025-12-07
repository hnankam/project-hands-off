/**
 * @fileoverview Reusable Modal Component
 * 
 * A flexible modal dialog with backdrop, animations, and theme support.
 * 
 * Features:
 * - Backdrop click to close
 * - ESC key to close
 * - Smooth transitions
 * - Light/dark theme support
 * - Custom header and footer
 * - Stop propagation on modal content
 * 
 * @example
 * <Modal
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   title="Delete Item"
 *   isLight={isLight}
 *   footer={
 *     <>
 *       <Button onClick={handleClose}>Cancel</Button>
 *       <Button onClick={handleDelete} variant="danger">Delete</Button>
 *     </>
 *   }
 * >
 *   <p>Are you sure you want to delete this item?</p>
 * </Modal>
 */

import React, { useEffect, ReactNode } from 'react';
import { cn } from '@extension/ui';

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  
  /** Called when the modal should close (backdrop click, ESC key, close button) */
  onClose: () => void;
  
  /** Modal title */
  title?: string;
  
  /** Modal content */
  children: ReactNode;
  
  /** Optional footer content (usually buttons) */
  footer?: ReactNode;
  
  /** Light/dark theme */
  isLight: boolean;
  
  /** Custom width class (default: max-w-sm) */
  widthClass?: string;
  
  /** Disable ESC key to close */
  disableEscapeKey?: boolean;
  
  /** Disable backdrop click to close */
  disableBackdropClick?: boolean;
  
  /** Hide close button in header */
  hideCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  isLight,
  widthClass = 'max-w-sm',
  disableEscapeKey = false,
  disableBackdropClick = false,
  hideCloseButton = false,
}) => {
  
  // Handle ESC key
  useEffect(() => {
    if (!isOpen || disableEscapeKey) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, disableEscapeKey]);
  
  // Handle backdrop click
  const handleBackdropClick = () => {
    if (!disableBackdropClick) {
      onClose();
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
        onClick={handleBackdropClick}
      />
      
      {/* Modal */}
      <div
        className={cn(
          'fixed inset-0 z-[10001] flex items-center justify-center p-4 transition-opacity',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      >
        <div
          className={cn(
            'w-full rounded-lg shadow-xl',
            widthClass,
            isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
          )}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          {(title || !hideCloseButton) && (
            <div
              className={cn(
                'flex items-center justify-between border-b px-4 py-2',
                isLight ? 'border-gray-200' : 'border-gray-700',
              )}
            >
              <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-700' : 'text-gray-300')}>
                {title || ''}
              </h2>
              {!hideCloseButton && (
                <button
                  onClick={onClose}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}
                  aria-label="Close modal"
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
              )}
            </div>
          )}
          
          {/* Content */}
          <div className="px-4 py-4">
            {children}
          </div>
          
          {/* Footer */}
          {footer && (
            <div
              className={cn(
                'flex items-center justify-end gap-2 border-t px-4 py-2',
                isLight ? 'border-gray-200' : 'border-gray-700',
              )}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

