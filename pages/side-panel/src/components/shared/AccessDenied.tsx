/**
 * AccessDenied
 * 
 * A component displayed when user lacks permissions to access a section.
 */

import * as React from 'react';
import { cn } from '@extension/ui';

export interface AccessDeniedProps {
  /** Light/dark theme */
  isLight: boolean;
  /** Custom message */
  message?: string;
  /** Required role description */
  requiredRole?: string;
  /** Additional className */
  className?: string;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({
  isLight,
  message,
  requiredRole = 'owner or admin',
  className,
}) => {
  const defaultMessage = `You need ${requiredRole} permissions to access this section.`;

  return (
    <div
      className={cn(
        'flex-1 flex items-center justify-center p-8',
        isLight ? 'bg-white' : 'bg-[#0D1117]',
        className,
      )}
    >
      <div className="text-center max-w-sm">
        <div
          className={cn(
            'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full',
            isLight ? 'bg-gray-100' : 'bg-gray-800',
          )}
        >
          <svg
            className={cn('h-6 w-6', isLight ? 'text-gray-400' : 'text-gray-500')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>
        <h3
          className={cn(
            'text-sm font-semibold mb-1',
            isLight ? 'text-gray-900' : 'text-gray-100',
          )}
        >
          Access Restricted
        </h3>
        <p className={cn('text-sm', isLight ? 'text-gray-600' : 'text-gray-400')}>
          {message || defaultMessage}
        </p>
      </div>
    </div>
  );
};

export default AccessDenied;

