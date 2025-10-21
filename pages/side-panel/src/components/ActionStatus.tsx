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
}

export const ActionStatus: React.FC<ActionStatusProps> = ({
  toolName,
  status,
  isLight,
  messages,
  className,
  extra,
}) => {
  const isWorking = status === 'inProgress' || status === 'executing';

  const defaultMessages: Required<ActionStatusMessages> = {
    pending: `Starting ${toolName}…`,
    inProgress: `${toolName} in progress…`,
    executing: `${toolName} in progress…`,
    complete: `${toolName} complete`,
  } as const;

  const text =
    status === 'complete'
      ? (messages?.complete ?? defaultMessages.complete)
      : isWorking
        ? (messages?.inProgress ?? messages?.executing ?? defaultMessages.inProgress)
        : (messages?.pending ?? defaultMessages.pending);

  return (
    <div className={isLight ? 'text-gray-700' : 'text-gray-300'} style={{ padding: 6, fontSize: 12 }}>
      <span className={isWorking ? 'copilot-action-sparkle-text' : undefined}>{text}</span>
      {extra ? <span style={{ marginLeft: 6 }}>{extra}</span> : null}
    </div>
  );
};

export default ActionStatus;
