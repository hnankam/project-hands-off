import * as React from 'react';
import { useState, useEffect } from 'react';

/**
 * ChatErrorDisplay Component
 * 
 * Displays subtle error messages in CopilotChat with:
 * - Retry functionality
 * - Auto-dismiss after timeout
 * - Smooth animations
 * - Light/dark mode support
 */

interface ChatErrorDisplayProps {
  error: Error;
  retry?: () => void;
  isLight?: boolean;
  autoDismissMs?: number;
}

export const ChatErrorDisplay: React.FC<ChatErrorDisplayProps> = ({
  error,
  retry,
  isLight = true,
  autoDismissMs = 60 * 60 * 1000, // Default: 1 hour
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  // Auto-dismiss after timeout
  useEffect(() => {
    if (!autoDismissMs) return;

    const timer = setTimeout(() => {
      handleDismiss();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [autoDismissMs]);

  const handleDismiss = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
    }, 300); // Match animation duration
  };

  const handleRetry = () => {
    if (retry) {
      console.log('[ChatErrorDisplay] Retry clicked - calling onRetry immediately');
      
      // Call retry immediately while component is still fully mounted
      try {
        retry(); // This calls CopilotKit's onRetry (regenerate function)
        console.log('[ChatErrorDisplay] onRetry called successfully');
      } catch (e) {
        console.error('[ChatErrorDisplay] Error calling onRetry:', e);
      }
      
      // Then start smooth dismissal
      setIsClosing(true);
      setTimeout(() => {
        setIsVisible(false);
        console.log('[ChatErrorDisplay] Dismissal complete');
      }, 300); // Match animation duration
    } else {
      console.warn('[ChatErrorDisplay] Retry clicked but no retry function provided');
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`flex-shrink-0 transform transition-all duration-300 ease-out ${
        isClosing ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100'
      }`}>
      <div
        className={`mx-4 mt-2 flex items-start gap-2 rounded-lg px-3 py-2 shadow-sm ${
          isLight
            ? 'bg-red-50 text-red-900'
            : 'bg-red-900/20 text-red-200'
        }`}>
        {/* Error Icon */}
        <svg
          className={`h-4 w-4 flex-shrink-0 mt-0.5 ${isLight ? 'text-red-500' : 'text-red-400'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>

        {/* Error Content */}
        <div className="flex-1 space-y-1.5">
          {/* Error Message */}
          <div className="space-y-0.5">
            <p className={`text-xs font-medium ${isLight ? 'text-red-900' : 'text-red-200'}`}>
              {error.name || 'Error'}
            </p>
            <p className={`text-xs ${isLight ? 'text-red-800' : 'text-red-300'}`}>
              {error.message || 'Something went wrong. Please try again.'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {retry && (
              <button
                onClick={handleRetry}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  isLight
                    ? 'bg-red-100 text-red-900 hover:bg-red-200'
                    : 'bg-red-900/50 text-red-200 hover:bg-red-900/70'
                }`}>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Retry
              </button>
            )}

            <button
              onClick={handleDismiss}
              className={`text-xs transition-colors ${
                isLight ? 'text-red-700 hover:text-red-900' : 'text-red-400 hover:text-red-200'
              }`}>
              Dismiss
            </button>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className={`flex-shrink-0 rounded p-0.5 transition-colors ${
            isLight ? 'text-red-400 hover:text-red-600' : 'text-red-500 hover:text-red-300'
          }`}
          aria-label="Close">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

/**
 * Compact variant for inline errors
 */
export const ChatErrorDisplayCompact: React.FC<ChatErrorDisplayProps> = ({
  error,
  retry,
  isLight = true,
  autoDismissMs = 60 * 60 * 1000, // 1 hour
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!autoDismissMs) return;

    const timer = setTimeout(() => {
      setIsClosing(true);
      setTimeout(() => setIsVisible(false), 300);
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [autoDismissMs]);

  const handleRetry = () => {
    if (retry) {
      console.log('[ChatErrorDisplayCompact] Retry clicked - calling onRetry immediately');
      
      // Call retry immediately while component is still fully mounted
      try {
        retry(); // This calls CopilotKit's onRetry (regenerate function)
        console.log('[ChatErrorDisplayCompact] onRetry called successfully');
      } catch (e) {
        console.error('[ChatErrorDisplayCompact] Error calling onRetry:', e);
      }
      
      // Then start smooth dismissal
      setIsClosing(true);
      setTimeout(() => {
        setIsVisible(false);
        console.log('[ChatErrorDisplayCompact] Dismissal complete');
      }, 300); // Match animation duration
    } else {
      console.warn('[ChatErrorDisplayCompact] Retry clicked but no retry function provided');
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`flex-shrink-0 transform transition-all duration-300 ease-out ${
        isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
      }`}>
      <div
        className={`mx-4 mt-2 flex items-center gap-2 rounded px-3 py-1.5 text-xs shadow-sm ${
          isLight
            ? 'bg-red-50 text-red-800'
            : 'bg-red-900/20 text-red-300'
        }`}>
        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <span className="flex-1 truncate">{error.message || 'An error occurred'}</span>
        {retry && (
          <button
            onClick={handleRetry}
            className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
              isLight ? 'bg-red-100 hover:bg-red-200' : 'bg-red-900/50 hover:bg-red-900/70'
            }`}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
};

