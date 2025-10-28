/**
 * Utility CopilotKit Actions
 * 
 * General utility actions for the AI agent.
 */

import React from 'react';
import { debug } from '@extension/shared';
import { WaitCountdown } from '../../components/WaitCountdown';

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

