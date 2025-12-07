/**
 * AlertBanner
 * 
 * A reusable alert/toast banner component with dismiss functionality.
 */

import React from 'react';
import { cn } from '@extension/ui';
import type { AlertState } from '../../hooks/useAlerts';

export interface AlertBannerProps {
  /** Alert state from useAlerts hook */
  alert: AlertState;
  /** Alert type */
  type: 'error' | 'success' | 'warning' | 'info';
  /** Light/dark theme */
  isLight: boolean;
  /** Called when dismiss button is clicked */
  onDismiss: () => void;
  /** Additional className */
  className?: string;
}

const getAlertStyles = (type: AlertBannerProps['type'], isLight: boolean) => {
  switch (type) {
    case 'error':
      return {
        bg: isLight ? 'bg-red-50' : 'bg-red-900/20',
        text: isLight ? 'text-red-700' : 'text-red-400',
        button: isLight ? 'text-red-500 hover:bg-red-100' : 'text-red-400 hover:bg-red-900/40',
      };
    case 'success':
      return {
        bg: isLight ? 'bg-green-50' : 'bg-green-900/20',
        text: isLight ? 'text-green-700' : 'text-green-400',
        button: isLight ? 'text-green-500 hover:bg-green-100' : 'text-green-400 hover:bg-green-900/40',
      };
    case 'warning':
      return {
        bg: isLight ? 'bg-yellow-50' : 'bg-yellow-900/20',
        text: isLight ? 'text-yellow-700' : 'text-yellow-400',
        button: isLight ? 'text-yellow-500 hover:bg-yellow-100' : 'text-yellow-400 hover:bg-yellow-900/40',
      };
    case 'info':
    default:
      return {
        bg: isLight ? 'bg-blue-50' : 'bg-blue-900/20',
        text: isLight ? 'text-blue-700' : 'text-blue-400',
        button: isLight ? 'text-blue-500 hover:bg-blue-100' : 'text-blue-400 hover:bg-blue-900/40',
      };
  }
};

const AlertIcon: React.FC<{ type: AlertBannerProps['type'] }> = ({ type }) => {
  if (type === 'error') {
    return (
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    );
  }
  
  if (type === 'success') {
    return (
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    );
  }

  if (type === 'warning') {
    return (
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    );
  }

  return (
    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  );
};

export const AlertBanner: React.FC<AlertBannerProps> = ({
  alert,
  type,
  isLight,
  onDismiss,
  className,
}) => {
  if (!alert.message || !alert.visible) {
    return null;
  }

  const styles = getAlertStyles(type, isLight);

  return (
    <div
      className={cn(
        'mb-4 p-3 rounded-lg text-sm flex items-start justify-between gap-3',
        'transform transition-all duration-300 ease-out',
        styles.bg,
        styles.text,
        alert.closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
        className,
      )}
    >
      <div className="flex-1 flex items-start gap-2">
        <AlertIcon type={type} />
        <span>{alert.message}</span>
      </div>
      <button
        onClick={onDismiss}
        className={cn('flex-shrink-0 p-0.5 rounded transition-colors', styles.button)}
        title="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default AlertBanner;

