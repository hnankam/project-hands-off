/**
 * InvitationBanner
 * 
 * A banner component for displaying pending organization invitations.
 */

import React from 'react';
import { cn } from '@extension/ui';

/** Minimal invitation type for the banner (compatible with usePendingInvitations) */
export interface PendingInvitationItem {
  id: string;
  email: string;
  role: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface InvitationBannerProps {
  /** List of pending invitations */
  invitations: PendingInvitationItem[];
  /** Light/dark theme */
  isLight: boolean;
  /** Called when the banner is dismissed */
  onDismiss: () => void;
  /** Called when an invitation is clicked */
  onViewInvitation?: (invitationId: string) => void;
  /** Maximum number of invitations to show before "more" */
  maxVisible?: number;
  /** Additional className */
  className?: string;
}

export const InvitationBanner: React.FC<InvitationBannerProps> = ({
  invitations,
  isLight,
  onDismiss,
  onViewInvitation,
  maxVisible = 3,
  className,
}) => {
  if (!invitations || invitations.length === 0) {
    return null;
  }

  const handleViewInvitation = (invitationId: string) => {
    if (onViewInvitation) {
      onViewInvitation(invitationId);
    } else {
      // Default behavior: navigate to accept page
      window.location.hash = `#/accept-invitation/${invitationId}`;
      window.location.reload();
    }
  };

  return (
    <div
      className={cn(
        'px-4 py-3 border-b',
        isLight
          ? 'bg-yellow-50 border-yellow-200'
          : 'bg-yellow-900/20 border-yellow-800',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <svg
            className={cn('w-5 h-5', isLight ? 'text-yellow-600' : 'text-yellow-500')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              'text-sm font-semibold mb-1',
              isLight ? 'text-yellow-900' : 'text-yellow-200',
            )}
          >
            {invitations.length === 1
              ? 'You have 1 pending invitation'
              : `You have ${invitations.length} pending invitations`}
          </h3>
          <div className="space-y-2">
            {invitations.slice(0, maxVisible).map(inv => (
              <div
                key={inv.id}
                className={cn(
                  'text-xs',
                  isLight ? 'text-yellow-800' : 'text-yellow-300',
                )}
              >
                <strong>{inv.organization.name}</strong> ({inv.role})
                {' - '}
                <button
                  onClick={() => handleViewInvitation(inv.id)}
                  className={cn(
                    'font-medium underline hover:no-underline',
                    isLight ? 'text-yellow-700' : 'text-yellow-200',
                  )}
                >
                  View & Accept
                </button>
              </div>
            ))}
            {invitations.length > maxVisible && (
              <div
                className={cn(
                  'text-xs italic',
                  isLight ? 'text-yellow-700' : 'text-yellow-300',
                )}
              >
                +{invitations.length - maxVisible} more
              </div>
            )}
          </div>
        </div>

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className={cn(
            'flex-shrink-0 p-1 rounded hover:bg-black/5',
            isLight ? 'text-yellow-600' : 'text-yellow-500',
          )}
          title="Dismiss"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default InvitationBanner;

