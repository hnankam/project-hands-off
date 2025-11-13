import React, { FC, useEffect, useRef, useMemo, useState } from 'react';
import { UsageDisplay } from './UsageDisplay';
import type { CumulativeUsage, UsageData } from '../hooks/useUsageStream';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@extension/ui';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface UsagePopupProps {
  isOpen: boolean;
  onClose: () => void;
  lastUsage: UsageData | null;
  cumulativeUsage: CumulativeUsage;
  isConnected: boolean;
  isLight: boolean;
  onReset?: () => void;
  sessionId?: string;
}

interface TimeseriesPoint {
  bucket: string;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  callCount: number;
}

const chartColors = {
  total: { light: '#9CA3AF', dark: '#6B7280' }, // Gray
  request: { light: '#3B82F6', dark: '#60A5FA' }, // Blue
  response: { light: '#10B981', dark: '#34D399' }, // Green
};

const formatBucketLabel = (bucket: string): string => {
  const date = new Date(bucket);
  // Format as "Nov 1", "Nov 2", etc. - same as usage tab
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const UsagePopup: FC<UsagePopupProps> = ({
  isOpen,
  onClose,
  lastUsage,
  cumulativeUsage,
  isConnected,
  isLight,
  onReset,
  sessionId,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [usageData, setUsageData] = useState<TimeseriesPoint[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [visibleSeries, setVisibleSeries] = useState({
    totalTokens: true,
    requestTokens: true,
    responseTokens: true,
  });

  const toggleSeries = (seriesKey: 'totalTokens' | 'requestTokens' | 'responseTokens') => {
    setVisibleSeries(prev => ({
      ...prev,
      [seriesKey]: !prev[seriesKey],
    }));
  };

  // Fetch usage data from API when popup opens
  useEffect(() => {
    if (!isOpen || !sessionId) {
      return;
    }

    const fetchUsageData = async () => {
      setLoadingUsage(true);
      try {
        const params = new URLSearchParams();
        params.set('range', '30d');
        params.set('sessionId', sessionId);

        const url = `${API_BASE_URL}/api/admin/usage?${params.toString()}`;
        console.log('[UsagePopup] Fetching usage data from:', url);

        const response = await fetch(url, {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[UsagePopup] Received usage data:', data);
          if (data.timeseries && Array.isArray(data.timeseries)) {
            console.log('[UsagePopup] Timeseries data points:', data.timeseries.length);
            setUsageData(data.timeseries);
          } else {
            console.log('[UsagePopup] No timeseries data in response');
          }
        } else {
          console.error('[UsagePopup] Failed to fetch usage data:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('[UsagePopup] Error fetching usage data:', error);
      } finally {
        setLoadingUsage(false);
      }
    };

    fetchUsageData();
  }, [isOpen, sessionId]);

  // Transform API data for chart
  const chartData = useMemo(() => {
    // Only show data if we have real data from the API
    if (usageData.length === 0) {
      return [];
    }

    return usageData.map(point => ({
      date: point.bucket,
      label: formatBucketLabel(point.bucket),
      totalTokens: point.totalTokens,
      requestTokens: point.requestTokens,
      responseTokens: point.responseTokens,
    }));
  }, [usageData]);

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
        style={{ width: '400px' }}
      >
        <div
          ref={popupRef}
          className={`rounded-lg shadow-xl border ${
            isLight ? 'bg-white border-gray-200' : 'bg-[#0C1117] border-gray-700'
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-3 py-2 border-b rounded-t-lg ${
              isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#151C24] border-gray-700'
            }`}
          >
            <h3 className={`text-sm font-semibold ${isLight ? 'text-gray-700' : 'text-[#bcc1c7]'}`}>
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

            {/* Usage Chart - 30 Day History */}
            {cumulativeUsage.total > 0 && (
              <div
                className={cn(
                  'rounded border p-2.5',
                  isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
                )}
              >
                {/* Header with Legend */}
                <div className="mb-2 flex items-center justify-between">
                  <h4 className={cn('text-[11px] font-semibold', isLight ? 'text-gray-700' : 'text-[#bcc1c7]')}>
                    30-Day Usage Trend
                  </h4>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSeries('totalTokens')}
                      className={cn(
                        'flex items-center gap-1 cursor-pointer transition-all rounded px-2 py-1 -mx-2 -my-1',
                        isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800'
                      )}
                    >
                      <div className={cn('h-1.5 w-1.5 transition-opacity', isLight ? 'bg-gray-400' : 'bg-gray-500', !visibleSeries.totalTokens && 'opacity-30')} />
                      <span className={cn('text-[9px] uppercase transition-opacity', isLight ? 'text-gray-600' : 'text-gray-400', !visibleSeries.totalTokens && 'opacity-30')}>
                        Total
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSeries('requestTokens')}
                      className={cn(
                        'flex items-center gap-1 cursor-pointer transition-all rounded px-2 py-1 -mx-2 -my-1',
                        isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800'
                      )}
                    >
                      <div className={cn('h-1.5 w-1.5 transition-opacity', isLight ? 'bg-blue-500' : 'bg-blue-400', !visibleSeries.requestTokens && 'opacity-30')} />
                      <span className={cn('text-[9px] uppercase transition-opacity', isLight ? 'text-gray-600' : 'text-gray-400', !visibleSeries.requestTokens && 'opacity-30')}>
                        Request
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSeries('responseTokens')}
                      className={cn(
                        'flex items-center gap-1 cursor-pointer transition-all rounded px-2 py-1 -mx-2 -my-1',
                        isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800'
                      )}
                    >
                      <div className={cn('h-1.5 w-1.5 transition-opacity', isLight ? 'bg-green-500' : 'bg-green-400', !visibleSeries.responseTokens && 'opacity-30')} />
                      <span className={cn('text-[9px] uppercase transition-opacity', isLight ? 'text-gray-600' : 'text-gray-400', !visibleSeries.responseTokens && 'opacity-30')}>
                        Response
                      </span>
                    </button>
                  </div>
                </div>
                {loadingUsage ? (
                  <div className="h-40 w-full flex items-center justify-center">
                    <div className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>Loading chart...</div>
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="h-40 w-full flex items-center justify-center">
                    <div className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>No usage data yet</div>
                  </div>
                ) : (
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="sessionTotalGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={isLight ? chartColors.total.light : chartColors.total.dark} stopOpacity={0.4} />
                          <stop offset="95%" stopColor={isLight ? chartColors.total.light : chartColors.total.dark} stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="sessionRequestGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={isLight ? chartColors.request.light : chartColors.request.dark} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={isLight ? chartColors.request.light : chartColors.request.dark} stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="sessionResponseGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={isLight ? chartColors.response.light : chartColors.response.dark} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={isLight ? chartColors.response.light : chartColors.response.dark} stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isLight ? '#E5E7EB' : '#1F2937'}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 9, fill: isLight ? '#6B7280' : '#9CA3AF' }}
                        axisLine={false}
                        tickLine={false}
                        interval={chartData.length > 0 ? Math.max(0, Math.floor(chartData.length / 6) - 1) : 0}
                        height={20}
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: isLight ? '#6B7280' : '#9CA3AF' }}
                        axisLine={false}
                        tickLine={false}
                        width={35}
                        tickFormatter={(value) => {
                          if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                          return value.toString();
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isLight ? '#fff' : '#1F2937',
                          border: `1px solid ${isLight ? '#E5E7EB' : '#374151'}`,
                          borderRadius: '6px',
                          fontSize: '10px',
                          padding: '0',
                        }}
                        labelStyle={{ color: isLight ? '#111827' : '#F9FAFB', fontWeight: 600 }}
                        itemStyle={{ color: isLight ? '#6B7280' : '#9CA3AF', padding: '2px 0' }}
                        formatter={(value: number) => value.toLocaleString()}
                        content={({ active, payload, label }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          
                          return (
                            <div
                              style={{
                                backgroundColor: isLight ? '#fff' : '#1F2937',
                                border: `1px solid ${isLight ? '#E5E7EB' : '#374151'}`,
                                borderRadius: '6px',
                                fontSize: '10px',
                              }}
                            >
                              <div style={{ 
                                padding: '6px 8px',
                                color: isLight ? '#111827' : '#F9FAFB',
                                fontWeight: 600
                              }}>
                                {label}
                              </div>
                              <div style={{
                                borderTop: `1px solid ${isLight ? '#E5E7EB' : '#374151'}`,
                              }} />
                              <div style={{ padding: '6px 8px' }}>
                                {payload.map((entry: any, index: number) => (
                                  <div
                                    key={index}
                                    style={{
                                      color: isLight ? '#6B7280' : '#9CA3AF',
                                      padding: '2px 0',
                                    }}
                                  >
                                    <span style={{ color: entry.color }}>{entry.name}</span>
                                    {' : '}
                                    <span style={{ fontWeight: 600 }}>
                                      {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }}
                      />
                      {visibleSeries.totalTokens && (
                        <Area
                          type="step"
                          dataKey="totalTokens"
                          stroke={isLight ? chartColors.total.light : chartColors.total.dark}
                          strokeWidth={2}
                          fill="url(#sessionTotalGradient)"
                          dot={false}
                          name="Total Tokens"
                        />
                      )}
                      {visibleSeries.requestTokens && (
                        <Area
                          type="step"
                          dataKey="requestTokens"
                          stroke={isLight ? chartColors.request.light : chartColors.request.dark}
                          strokeWidth={1.4}
                          fill="url(#sessionRequestGradient)"
                          dot={false}
                          name="Request Tokens"
                        />
                      )}
                      {visibleSeries.responseTokens && (
                        <Area
                          type="step"
                          dataKey="responseTokens"
                          stroke={isLight ? chartColors.response.light : chartColors.response.dark}
                          strokeWidth={1.4}
                          fill="url(#sessionResponseGradient)"
                          dot={false}
                          name="Response Tokens"
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                )}
              </div>
            )}

            {/* Additional Info */}
            {lastUsage && (
              <div
                className={`rounded p-2 text-[11px] ${
                  isLight ? 'bg-gray-50' : 'bg-gray-800'
                }`}
              >
                <div className={`font-medium mb-1.5 ${isLight ? 'text-gray-700' : 'text-[#bcc1c7]'}`}>
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

            {/* Reset Button - Hidden for now */}
            {false && onReset && cumulativeUsage.total > 0 && (
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

