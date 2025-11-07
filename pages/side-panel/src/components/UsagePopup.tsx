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

  return (
    <>
      {/* Compact Popup - Always mounted, visibility controlled with CSS */}
      <div 
        className={`fixed top-10 left-3 z-50 transition-opacity ${
          isOpen ? 'opacity-100 pointer-events-auto animate-slideDown' : 'opacity-0 pointer-events-none'
        }`}
        style={{ maxWidth: '300px' }}
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
              className={`p-1 rounded transition-colors ${
                isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800'
              }`}
            >
              <svg
                className={`w-3.5 h-3.5 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}
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
          <div className="p-3 space-y-2.5">
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
                className={`rounded p-2 text-[11px] ${
                  isLight ? 'bg-gray-50' : 'bg-gray-800'
                }`}
              >
                <div className={`font-medium mb-1.5 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                  Last Request
                </div>
                <div className={`space-y-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
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
                className={`rounded p-2 text-[11px] ${
                  isLight ? 'bg-blue-50' : 'bg-blue-900/20'
                }`}
              >
                <div className={`font-medium mb-1.5 ${isLight ? 'text-blue-900' : 'text-blue-300'}`}>
                  Averages
                </div>
                <div className={`space-y-1 ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>
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
                disabled
                className={`w-full px-2 py-1.5 rounded text-[11px] font-medium cursor-not-allowed opacity-50 ${
                  isLight
                    ? 'text-red-600 bg-red-50'
                    : 'text-red-400 bg-red-900/30'
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

