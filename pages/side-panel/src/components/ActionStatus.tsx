import React from 'react';

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
}

export const ActionStatus: React.FC<ActionStatusProps> = ({
  toolName,
  status,
  isLight,
  messages,
  className,
  extra,
  icon: customIcon,
}) => {
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
      style={{ flexShrink: 0, marginRight: 6 }}
    >
      <defs>
        <linearGradient id="wandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#FFD700', stopOpacity: 1 }} />
          <stop offset="50%" style={{ stopColor: '#FFA500', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#FF69B4', stopOpacity: 1 }} />
        </linearGradient>
        <linearGradient id="sparkleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#87CEEB', stopOpacity: 1 }} />
          <stop offset="50%" style={{ stopColor: '#9370DB', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#FF69B4', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      {/* Magic wand with sparkles - wand in warm gradient, sparkles in cool gradient */}
      <path stroke="url(#wandGradient)" d="M3 21l9-9" />
      <path stroke="url(#sparkleGradient)" d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M12.2 6.2 11 5" />
    </svg>
  );

  const icon = customIcon || defaultIcon;

  return (
    <div className={isLight ? 'text-gray-600' : 'text-gray-500'} style={{ padding: 6, fontSize: 12, display: 'flex', alignItems: 'center' }}>
      {icon}
      <span className={isWorking ? 'copilot-action-sparkle-text' : undefined}>{text}</span>
      {extra ? <span style={{ marginLeft: 6 }}>{extra}</span> : null}
    </div>
  );
};

export default ActionStatus;
