import React, { FC } from 'react';
import type { CumulativeUsage, UsageData } from '../hooks/useUsageStream';

export interface UsageDisplayProps {
  lastUsage: UsageData | null;
  cumulativeUsage: CumulativeUsage;
  isConnected: boolean;
  isLight: boolean;
  compact?: boolean;
  onClick?: () => void;
}

export const UsageDisplay: FC<UsageDisplayProps> = ({
  lastUsage,
  cumulativeUsage,
  isConnected,
  isLight,
  compact = false,
  onClick,
}) => {
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  if (compact) {
    // Compact view for status bar - clickable
    return (
      <div
        className={`flex items-center gap-2 text-xs ${
          isLight ? 'text-gray-600' : 'text-gray-400'
        } ${onClick ? 'cursor-pointer transition-opacity hover:opacity-75' : ''}`}
        onClick={onClick}
        title="Click to view detailed usage statistics">
        <div
          className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'animate-pulse bg-green-500' : 'bg-gray-400'}`}
          title={isConnected ? 'Usage tracking active' : 'Usage tracking disconnected'}
        />
        <span
          className="font-mono"
          title={lastUsage ? 'Tokens used in last request' : 'Total tokens used in this session'}>
          {lastUsage ? formatNumber(lastUsage.total_tokens) : formatNumber(cumulativeUsage.total)}
        </span>
        <span className="opacity-60">tokens</span>
      </div>
    );
  }

  // Full view - compact version
  return (
    <div
      className={`rounded border p-2.5 ${
        isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
      }`}>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className={`text-[11px] font-semibold ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>Session Tokens</h3>
        <div className="flex items-center gap-1.5">
          <div
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}
            title={isConnected ? 'Live tracking' : 'Disconnected'}
          />
          <span className={`text-[10px] ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-2 grid grid-cols-2 gap-2">
        {/* Total Tokens */}
        <div className={`rounded p-2 ${isLight ? 'bg-gray-50' : 'bg-[#0C1117]'}`}>
          <div className={`mb-1 text-[10px] ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Total</div>
          <div className={`font-mono text-base font-bold ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
            {cumulativeUsage.total.toLocaleString()}
          </div>
        </div>

        {/* Request Count */}
        <div className={`rounded p-2 ${isLight ? 'bg-gray-50' : 'bg-[#0C1117]'}`}>
          <div className={`mb-1 text-[10px] ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Requests</div>
          <div className={`font-mono text-base font-bold ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
            {cumulativeUsage.requestCount}
          </div>
        </div>

        {/* Input Tokens */}
        <div className={`rounded p-2 ${isLight ? 'bg-gray-50' : 'bg-[#0C1117]'}`}>
          <div className={`mb-1 text-[10px] ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Input</div>
          <div className={`font-mono text-xs ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
            {cumulativeUsage.request.toLocaleString()}
          </div>
        </div>

        {/* Output Tokens */}
        <div className={`rounded p-2 ${isLight ? 'bg-gray-50' : 'bg-[#0C1117]'}`}>
          <div className={`mb-1 text-[10px] ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Output</div>
          <div className={`font-mono text-xs ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
            {cumulativeUsage.response.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Last Update */}
      {lastUsage && (
        <div
          className={`border-t pt-2 text-[10px] ${
            isLight ? 'border-gray-200 text-gray-500' : 'border-gray-700 text-gray-500'
          }`}>
          <div className="flex items-center justify-between">
            <span>Last: {lastUsage.agent_type}</span>
            <span className="font-mono">+{lastUsage.total_tokens}</span>
          </div>
        </div>
      )}
    </div>
  );
};
