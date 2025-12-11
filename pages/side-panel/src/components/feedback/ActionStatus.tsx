import React, { useState, useEffect } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

/**
 * V2 API Status Values:
 * - 'inProgress' - Tool is being processed/streamed
 * - 'executing' - Tool is actively executing
 * - 'complete' - Tool finished successfully
 * - undefined - Initial state before processing starts
 */
export type ActionPhase = 'inProgress' | 'executing' | 'complete' | string | undefined;

export interface ActionStatusMessages {
  /** Message shown when status is undefined (before processing starts) */
  pending?: string;
  /** Message shown when status is 'inProgress' */
  inProgress?: string;
  /** Message shown when status is 'executing' (falls back to inProgress if absent) */
  executing?: string;
  /** Message shown when status is 'complete' */
  complete?: string;
}

// Persist expanded state across remounts (for Virtua virtualization)
const expandedStateCache: Map<string, boolean> = new Map();

export interface ActionStatusProps {
  toolName: string;
  status?: ActionPhase;
  messages?: ActionStatusMessages;
  className?: string;
  extra?: React.ReactNode; // optional trailing content (icons, counters, etc.)
  icon?: React.ReactNode; // optional custom icon (defaults to magic wand)
  args?: any; // input arguments to the tool
  result?: any; // output result from the tool
  error?: any; // error if tool failed
  instanceId?: string; // unique ID to persist expanded state across remounts
}

export const ActionStatus: React.FC<ActionStatusProps> = ({
  toolName,
  status,
  messages,
  className,
  extra,
  icon: customIcon,
  args,
  result,
  error,
  instanceId,
}) => {
  // Read theme directly from storage for live updates
  const { isLight } = useStorage(themeStorage);
  // Generate a stable cache key from instanceId or fallback to toolName + args hash
  const cacheKey = instanceId ?? `${toolName}-${JSON.stringify(args ?? {})}`;
  
  // Initialize from cache if available, otherwise default to false
  const [isExpanded, setIsExpanded] = useState(() => {
    return expandedStateCache.get(cacheKey) ?? false;
  });
  
  // Sync expanded state to cache whenever it changes
  useEffect(() => {
    expandedStateCache.set(cacheKey, isExpanded);
  }, [cacheKey, isExpanded]);
  const [isHovered, setIsHovered] = useState(false);
  const isWorking = status === 'inProgress' || status === 'executing';

  const defaultMessages: Required<ActionStatusMessages> = {
    pending: `Starting ${toolName}…`,
    inProgress: `${toolName} in progress…`,
    executing: `${toolName} executing…`,
    complete: `${toolName} complete`,
  } as const;

  // Select message based on V2 status:
  // - 'complete' → complete message
  // - 'executing' → executing message (fallback to inProgress)
  // - 'inProgress' → inProgress message (fallback to executing)
  // - undefined/other → pending message
  const getStatusMessage = (): string => {
    if (status === 'complete') {
      return messages?.complete ?? defaultMessages.complete;
    }
    if (status === 'executing') {
      return messages?.executing ?? messages?.inProgress ?? defaultMessages.executing;
    }
    if (status === 'inProgress') {
      return messages?.inProgress ?? messages?.executing ?? defaultMessages.inProgress;
    }
    // Pending or unknown status
    return messages?.pending ?? defaultMessages.pending;
  };

  const baseText = getStatusMessage();

  // Add contextual tool name so short phrases like "Search complete" read with meaning
  const text = `${baseText}`;

  // Icon color based on current theme (read from storage, not from props)
  const iconColor = isLight ? '#4b5563' : '#6b7280'; // gray-600 for light, gray-500 for dark

  // Default icon: use a playful sparkle/magic wand icon for agent actions
  const defaultIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ 
        flexShrink: 0, 
        marginRight: 6,
        color: iconColor,
      }}
    >
      {/* Magic wand with sparkles */}
      <path stroke="currentColor" d="M3 21l9-9" />
      <path stroke="currentColor" d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M12.2 6.2 11 5" />
    </svg>
  );

  // Wrap custom icon to apply theme-aware color (icons may have stale colors from creation time)
  const icon = customIcon ? (
    <span style={{ color: iconColor, display: 'inline-flex', alignItems: 'center' }}>
      {customIcon}
    </span>
  ) : defaultIcon;

  // Check if we have data to show in expanded view
  const hasExpandableData = args || result || error;

  // Chevron icon for expand/collapse (points right, rotates down when expanded)
  const chevronIcon = (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        marginLeft: 6,
        transition: 'transform 0.2s ease-in-out, opacity 0.2s ease-in-out',
        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        opacity: isHovered ? 1 : 0,
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );

  // Format data for display
  const formatData = (data: any, maxDepth = 3): string => {
    if (data === null || data === undefined) return 'null';
    if (typeof data === 'string') return data.length > 200 ? data.slice(0, 200) + '...' : data;
    if (typeof data === 'number' || typeof data === 'boolean') return String(data);
    
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return String(data);
    }
  };

  return (
    <div 
      className={isLight ? 'text-gray-600' : 'text-gray-500'} 
      style={{ 
        fontSize: 12,
        maxWidth: '56rem',
        width: '100%',
        marginLeft: 'auto',
        marginRight: 'auto',
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      {/* Header (always visible) */}
      <div
        style={{
          paddingTop: 6,
          paddingBottom: 0,
          display: 'flex',
          alignItems: 'center',
          cursor: hasExpandableData ? 'pointer' : 'default',
        }}
        onClick={() => hasExpandableData && setIsExpanded(!isExpanded)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {icon}
        <span className={isWorking ? 'copilot-action-sparkle-text' : undefined} style={{ flex: 1 }}>
          {text}
        </span>
        {extra ? <span style={{ marginLeft: 6 }}>{extra}</span> : null}
        {hasExpandableData && chevronIcon}
      </div>

      {/* Expanded content */}
      <div
        style={{
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
          maxHeight: isExpanded && hasExpandableData ? '500px' : '0',
          opacity: isExpanded && hasExpandableData ? 1 : 0,
        }}
      >
        <div
          style={{
            paddingLeft: 20,
            paddingRight: 6,
            paddingBottom: 6,
            // borderLeft: `2px solid ${isLight ? '#e5e7eb' : '#374151'}`,
            marginLeft: 13,
            opacity: 0.8,
          }}
        >
          {/* Input Arguments */}
          {args && (
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isLight ? '#6b7280' : '#9ca3af',
                  marginBottom: 4,
                }}
              >
                Input:
              </div>
              <pre
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  padding: 8,
                  backgroundColor: isLight ? '#f9fafb' : '#1f2937',
                  borderRadius: 4,
                  overflow: 'auto',
                  maxHeight: 200,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {formatData(args)}
              </pre>
            </div>
          )}

          {/* Output Result */}
          {result && (
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isLight ? '#6b7280' : '#9ca3af',
                  marginBottom: 4,
                }}
              >
                Output:
              </div>
              <pre
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  padding: 8,
                  backgroundColor: isLight ? '#f9fafb' : '#1f2937',
                  borderRadius: 4,
                  overflow: 'auto',
                  maxHeight: 200,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {formatData(result)}
              </pre>
            </div>
          )}

          {/* Error */}
          {error && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#ef4444',
                  marginBottom: 4,
                }}
              >
                Error:
              </div>
              <pre
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  padding: 8,
                  backgroundColor: isLight ? '#fef2f2' : '#7f1d1d',
                  borderRadius: 4,
                  overflow: 'auto',
                  maxHeight: 200,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: isLight ? '#991b1b' : '#fca5a5',
                }}
              >
                {formatData(error)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActionStatus;
