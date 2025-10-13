import React, { FC, useEffect, useRef } from 'react';
import { UsageDisplay } from './UsageDisplay';
import type { CumulativeUsage, UsageData } from '../hooks/useUsageStream';

export interface UsagePopupProps {
  isOpen: boolean;
  onClose: () => void;
  lastUsage: UsageData | null;
  cumulativeUsage: CumulativeUsage;
  isConnected: boolean;
  isLight: boolean;
  onReset?: () => void;
}

export const UsagePopup: FC<UsagePopupProps> = ({
  isOpen,
  onClose,
  lastUsage,
  cumulativeUsage,
  isConnected,
  isLight,
  onReset,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Close on escape key
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Simple Popup */}
      <div 
        className="fixed top-12 left-4 z-50 animate-slideDown"
        style={{ maxWidth: '320px' }}
      >
        <div
          ref={popupRef}
          className={`rounded-lg shadow-xl border ${
            isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-3 py-2 border-b ${
              isLight ? 'border-gray-200' : 'border-gray-700'
            }`}
          >
            <h3 className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Token Usage
            </h3>
            <button
              onClick={onClose}
              className={`p-0.5 rounded transition-colors ${
                isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800'
              }`}
            >
              <svg
                className={`w-4 h-4 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-3 space-y-3">
            <UsageDisplay
              lastUsage={lastUsage}
              cumulativeUsage={cumulativeUsage}
              isConnected={isConnected}
              isLight={isLight}
              compact={false}
            />

            {/* Additional Info */}
            {lastUsage && (
              <div
                className={`rounded p-2 text-xs ${
                  isLight ? 'bg-gray-50 border border-gray-200' : 'bg-gray-800 border border-gray-700'
                }`}
              >
                <div className={`font-medium mb-1.5 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                  Last Request
                </div>
                <div className={`space-y-0.5 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                  <div className="flex justify-between gap-2">
                    <span>Agent:</span>
                    <span className="font-mono">{lastUsage.agent_type}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Model:</span>
                    <span className="font-mono truncate">{lastUsage.model}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Time:</span>
                    <span className="font-mono">
                      {new Date(lastUsage.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Average Stats */}
            {cumulativeUsage.requestCount > 1 && (
              <div
                className={`rounded p-2 text-xs ${
                  isLight ? 'bg-blue-50 border border-blue-200' : 'bg-blue-900/20 border border-blue-700'
                }`}
              >
                <div className={`font-medium mb-1.5 ${isLight ? 'text-blue-900' : 'text-blue-300'}`}>
                  Averages
                </div>
                <div className={`space-y-0.5 ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>
                  <div className="flex justify-between gap-2">
                    <span>Per Request:</span>
                    <span className="font-mono">
                      {Math.round(cumulativeUsage.total / cumulativeUsage.requestCount).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Reset Button */}
            {onReset && cumulativeUsage.total > 0 && (
              <button
                onClick={() => {
                  onReset();
                  onClose();
                }}
                className={`w-full px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  isLight
                    ? 'text-red-600 hover:bg-red-50 border border-red-200'
                    : 'text-red-400 hover:bg-red-900/30 border border-red-700'
                }`}
              >
                Reset Counters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add animations */}
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideDown {
          animation: slideDown 0.2s ease-out;
        }
      `}</style>
    </>
  );
};

