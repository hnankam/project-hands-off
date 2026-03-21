/**
 * Header close control — matches UsagePopup (Token Usage panel) for consistent sessions UI.
 */
import * as React from 'react';
import { cn } from '@extension/ui';

export interface ModalCloseButtonProps {
  onClick: () => void;
  isLight: boolean;
  className?: string;
  'aria-label'?: string;
}

export const ModalCloseButton: React.FC<ModalCloseButtonProps> = ({
  onClick,
  isLight,
  className,
  'aria-label': ariaLabel = 'Close',
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    className={cn('rounded p-1 transition-colors', isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800', className)}>
    <svg
      className={cn('h-3.5 w-3.5', isLight ? 'text-gray-600' : 'text-gray-400')}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
);
