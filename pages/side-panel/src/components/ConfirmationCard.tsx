/**
 * ConfirmationCard Component
 * 
 * Displays an interactive confirmation dialog for human-in-the-loop actions.
 * Allows users to approve or reject agent actions before they are executed.
 * Matches the app's design system with light/dark theme support.
 */

import React, { useState } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

export interface ConfirmationCardProps {
  actionDescription: string;
  status: 'executing' | 'complete' | string;
  respond?: (response: { confirmed: boolean }) => void;
  result?: { confirmed: boolean };
}

export const ConfirmationCard: React.FC<ConfirmationCardProps> = ({
  actionDescription,
  status,
  respond,
  result,
}) => {
  // Read theme from storage for reactivity
  const { isLight } = useStorage(themeStorage);
  
  // Collapse state for completed confirmations
  const [isExpanded, setIsExpanded] = useState(false);

  // Card background colors - more subtle than user messages
  const cardBackground = isLight ? 'rgba(249, 250, 251, 0.5)' : 'rgba(21, 28, 36, 0.4)'; // 50% opacity for subtlety
  const borderColor = isLight ? 'rgba(229, 231, 235, 0.5)' : 'rgba(55, 65, 81, 0.4)'; // 50% opacity for subtle borders
  const textColor = isLight ? '#1f2937' : '#f3f4f6';
  const mutedTextColor = isLight ? '#6b7280' : '#9ca3af';

  // Executing state - show confirmation buttons
  if (status === 'executing' && respond) {
    return (
      <div
        className="rounded-lg border transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: cardBackground,
          borderColor: borderColor,
          marginTop: '12px',
          marginLeft: '12px',
          marginRight: '12px',
          width: 'calc(100% - 24px)', // Subtract both margins
        }}
      >
        {/* Content */}
        <div style={{ padding: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            {/* Question mark icon */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: isLight ? '#dbeafe' : 'rgba(37, 99, 235, 0.2)',
                flexShrink: 0,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ 
                  color: isLight ? '#2563eb' : '#60a5fa' // blue-600 / blue-400
                }}
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
            </div>

            <div style={{ flex: 1 }}>
              {/* Title */}
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 400,
                  color: textColor, // Using main text color
                  marginBottom: '4px',
                }}
              >
                Confirmation Required
              </div>

              {/* Description */}
              <div
                style={{
                  fontSize: '12px',
                  color: mutedTextColor,
                  lineHeight: '1.5',
                }}
              >
                Do you want to {actionDescription}?
              </div>
            </div>
          </div>
        </div>

        {/* Footer with action buttons - matching SessionsPage modal pattern */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            borderTop: `1px solid ${borderColor}`,
            padding: '8px 12px',
          }}
        >
          <button
            onClick={() => respond({ confirmed: false })}
            className="transition-colors duration-200"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: isLight ? '#e5e7eb' : '#374151',
              color: isLight ? '#374151' : '#bcc1c7',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isLight ? '#d1d5db' : '#4b5563';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isLight ? '#e5e7eb' : '#374151';
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => respond({ confirmed: true })}
            className="transition-colors duration-200"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: '#2563eb', // blue-600
              color: 'white',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1d4ed8'; // blue-700
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    );
  }

  // Complete state - header with result, collapsible content with description
  if (status === 'complete' && result) {
    const isConfirmed = result.confirmed;
    const chevronColor = isLight ? '#6b7280' : '#9ca3af';
    
    return (
      <div
        className="rounded-lg border transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: cardBackground,
          borderColor: borderColor,
          marginTop: '12px',
          marginLeft: '12px',
          marginRight: '12px',
          width: 'calc(100% - 24px)', // Subtract both margins
        }}
      >
        {/* Header - show result with chevron toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 8px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {/* Chevron toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px',
              height: '16px',
              flexShrink: 0,
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke={chevronColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>

          {/* Result icon */}
          {isConfirmed ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="currentColor"
              style={{ 
                flexShrink: 0,
                color: isLight ? '#059669' : '#10b981' // green-600 / green-500
              }}
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="currentColor"
              style={{ 
                flexShrink: 0,
                color: isLight ? '#dc2626' : '#ef4444' // red-600 / red-500
              }}
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          )}
          
          {/* Result text */}
          <span
            style={{
              fontSize: '12px',
              fontWeight: 400,
              color: isConfirmed 
                ? (isLight ? '#059669' : '#10b981')
                : (isLight ? '#dc2626' : '#ef4444'),
            }}
          >
            {isConfirmed ? 'Action confirmed' : 'Action cancelled'}
          </span>
        </button>

        {/* Content - collapsible section (similar to executing state) */}
        <div
          style={{
            maxHeight: isExpanded ? '1000px' : '0',
            opacity: isExpanded ? 1 : 0,
            overflow: 'hidden',
            transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
          }}
        >
          <div
            style={{
              borderTop: `1px solid ${borderColor}`,
              padding: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              {/* Question mark icon */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: isLight ? '#dbeafe' : 'rgba(37, 99, 235, 0.2)',
                  flexShrink: 0,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ 
                    color: isLight ? '#2563eb' : '#60a5fa' // blue-600 / blue-400
                  }}
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
              </div>

              <div style={{ flex: 1 }}>
                {/* Title */}
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 400,
                    color: textColor,
                    marginBottom: '4px',
                  }}
                >
                  Confirmation Required
                </div>

                {/* Description */}
                <div
                  style={{
                    fontSize: '12px',
                    color: mutedTextColor,
                    lineHeight: '1.5',
                  }}
                >
                  Do you want to {actionDescription}?
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback - shouldn't normally reach here
  return null;
};

export default ConfirmationCard;

