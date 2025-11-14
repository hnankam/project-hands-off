/**
 * Utility CopilotKit Actions
 * 
 * General utility actions for the AI agent.
 */

import React from 'react';
import { debug } from '@extension/shared';
import { WaitCountdown } from '../../components/WaitCountdown';
import { ConfirmationCard } from '../../components/ConfirmationCard';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

interface UtilityActionDependencies {
  isLight: boolean;
}

/**
 * Creates the wait action for pausing execution
 * 
 * Allows the agent to wait for a specified number of seconds.
 * Useful for waiting after page interactions or while content loads.
 * 
 * @returns CopilotKit action configuration
 */
export const createWaitAction = ({ isLight }: UtilityActionDependencies) => ({
  name: 'wait',
  description: 'Pause execution for N seconds (use for page loads/embedding).',
  parameters: [{ name: 'seconds', type: 'number', description: 'Seconds to wait (0-30)', required: true }],
  render: ({ args, status }: any) => {
    const raw = Number((args as any)?.seconds ?? 0);
    const s = Math.max(0, Math.min(30, Math.floor(isNaN(raw) ? 0 : raw)));
    return <WaitCountdown seconds={s} status={status as any} isLight={isLight} />;
  },
  handler: async ({ seconds }: { seconds: number }) => {
    debug.log(ts(), '[Agent Request] wait:', { seconds });
    const s = Math.max(0, Math.min(30, Math.floor(Number(seconds || 0))));
    await new Promise(resolve => setTimeout(resolve, s * 1000));
    debug.log(ts(), '[Agent Response] wait:', { status: 'success', waitedSeconds: s });
    return { status: 'success', waitedSeconds: s } as const;
  },
});

/**
 * Creates the human-in-the-loop configuration for confirmAction
 * 
 * Allows the agent to ask for explicit user confirmation before proceeding with an action.
 * This provides the interactive UI for users to confirm or cancel actions.
 * Must be used with useHumanInTheLoop hook in the component.
 * 
 * @returns useHumanInTheLoop configuration object
 */
export const createConfirmActionHumanInTheLoop = ({ isLight }: UtilityActionDependencies) => ({
  name: 'confirmAction',
  description: 'Ask user to confirm before proceeding with an action',
  parameters: [
    {
      name: 'actionDescription',
      type: 'string',
      description: 'Description of the action that needs confirmation',
      required: true,
    },
  ],
  render: ({ args, status, respond, result }: any) => {
    const actionDescription = args?.actionDescription ?? 'proceed with this action';
    
    return (
      <ConfirmationCard
        actionDescription={actionDescription}
        status={status}
        respond={respond}
        result={result}
      />
    );
  },
});

