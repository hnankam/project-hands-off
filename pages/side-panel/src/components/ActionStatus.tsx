import React, { useState } from 'react';

export type ActionPhase = 'inProgress' | 'executing' | 'complete' | string | undefined;

export interface ActionStatusMessages {
  pending?: string; // default when not in progress or complete
  inProgress?: string;
  executing?: string; // falls back to inProgress if absent
  complete?: string;
}

export interface ActionStatusProps {
  toolName: string;
  status?: ActionPhase;
  isLight: boolean;
  messages?: ActionStatusMessages;
  className?: string;
  extra?: React.ReactNode; // optional trailing content (icons, counters, etc.)
  icon?: React.ReactNode; // optional custom icon (defaults to magic wand)
  args?: any; // input arguments to the tool
  result?: any; // output result from the tool
  error?: any; // error if tool failed
}

export const ActionStatus: React.FC<ActionStatusProps> = ({
  toolName,
  status,
  isLight,
  messages,
  className,
  extra,
  icon: customIcon,
  args,
  result,
  error,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isWorking = status === 'inProgress' || status === 'executing';

  const defaultMessages: Required<ActionStatusMessages> = {
    pending: `Starting ${toolName}…`,
    inProgress: `${toolName} in progress…`,
    executing: `${toolName} in progress…`,
    complete: `${toolName} complete`,
  } as const;

  const baseText =
    status === 'complete'
      ? (messages?.complete ?? defaultMessages.complete)
      : isWorking
        ? (messages?.inProgress ?? messages?.executing ?? defaultMessages.inProgress)
        : (messages?.pending ?? defaultMessages.pending);

  // Add contextual tool name so short phrases like "Search complete" read with meaning
  const text = `${baseText}`;

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
        color: isLight ? '#4b5563' : '#6b7280' // gray-600 for light, gray-500 for dark
      }}
    >
      {/* Magic wand with sparkles */}
      <path stroke="currentColor" d="M3 21l9-9" />
      <path stroke="currentColor" d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M12.2 6.2 11 5" />
    </svg>
  );

  const icon = customIcon || defaultIcon;

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
    <div className={isLight ? 'text-gray-600' : 'text-gray-500'} style={{ fontSize: 12 }}>
      {/* Header (always visible) */}
      <div
        style={{
          paddingTop: 6,
          paddingBottom: 0,
          paddingLeft: 12,
          paddingRight: 12,
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
