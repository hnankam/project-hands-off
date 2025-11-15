/**
 * Feedback Modal Component
 * 
 * Reusable modal for collecting user feedback.
 */

import React from 'react';
import { cn } from '@extension/ui';

interface FeedbackModalProps {
  isLight: boolean;
  isOpen: boolean;
  feedbackText: string;
  onClose: () => void;
  onFeedbackChange: (text: string) => void;
  onSubmit: () => void;
}

export default function FeedbackModal({
  isLight,
  isOpen,
  feedbackText,
  onClose,
  onFeedbackChange,
  onSubmit,
}: FeedbackModalProps) {
  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <div
          className={cn(
            'w-full max-w-lg rounded-lg shadow-xl',
            isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
          )}
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div
            className={cn(
              'flex items-center justify-between border-b px-3 py-2',
              isLight ? 'border-gray-200' : 'border-gray-700',
            )}>
            <h2 className={cn('text-sm font-semibold', mainTextColor)}>
              Help us improve Hands-Off
            </h2>
            <button
              onClick={onClose}
              className={cn(
                'rounded-md p-0.5 transition-colors',
                isLight
                  ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
              )}>
              <svg
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="space-y-3 px-3 py-4">
            <p className={cn('text-sm font-medium', mainTextColor)}>
              We'd love your feedback.
            </p>
            
            <div className="space-y-2">
              <label className={cn('block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Share your thoughts
              </label>
              <textarea
                value={feedbackText}
                onChange={(e) => onFeedbackChange(e.target.value)}
                placeholder="What's working well? What's confusing? What's missing?"
                rows={6}
                className={cn(
                  'w-full rounded-md border px-3 py-2 text-sm transition-colors resize-none',
                  'focus:outline-none focus:ring-2',
                  isLight
                    ? 'border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500/20'
                    : 'border-gray-600 bg-[#0D1117] text-gray-100 placeholder-gray-500 focus:border-blue-400 focus:ring-blue-400/20'
                )}
              />
            </div>

            <p className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
              Have an issue?{' '}
              <a
                href="https://handsoff.com/support"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'font-medium underline',
                  isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300'
                )}
              >
                Contact Support
              </a>
              , or the community on{' '}
              <a
                href="https://discord.gg/handsoff"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'font-medium underline',
                  isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300'
                )}
              >
                Discord
              </a>
              .
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
                isLight
                  ? 'bg-gray-200 hover:bg-gray-300'
                  : 'bg-gray-700 hover:bg-gray-600',
              )}
              style={{ color: isLight ? '#374151' : '#bcc1c7' }}
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={!feedbackText.trim()}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                feedbackText.trim()
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : isLight
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed',
              )}>
              Send
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

