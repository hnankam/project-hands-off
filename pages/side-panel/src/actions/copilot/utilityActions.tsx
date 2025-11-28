/**
 * Utility CopilotKit Actions
 *
 * General utility actions for the AI agent.
 */

import React from 'react';
import { debug } from '@extension/shared';
import { WaitCountdown } from '../../components/WaitCountdown';
import { ConfirmationCard } from '../../components/ConfirmationCard';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum wait time in seconds */
const MAX_WAIT_SECONDS = 30;

/** Minimum wait time in seconds */
const MIN_WAIT_SECONDS = 0;

/** Log prefix for agent actions */
const LOG_PREFIX = {
  request: '[Agent Request]',
  response: '[Agent Response]',
} as const;

// ============================================================================
// TYPES
// ============================================================================

/** Timestamp helper for consistent logging */
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

/** Status values for action render */
type ActionPhase = 'pending' | 'inProgress' | 'complete' | 'error';

/** Arguments for wait action */
interface WaitArgs {
  seconds?: number;
}

/** Arguments for confirmAction */
interface ConfirmActionArgs {
  actionDescription?: string;
}

/** Generic render props that match the framework's expectations */
interface RenderProps<TArgs = Record<string, unknown>> {
  args?: TArgs;
  status?: ActionPhase | string;
  result?: unknown;
  error?: unknown;
}

/** Confirmation response object */
interface ConfirmationResponse {
  confirmed: boolean;
}

/** Extended render props for confirmAction with respond/result */
interface ConfirmActionRenderProps extends RenderProps<ConfirmActionArgs> {
  respond?: (response: ConfirmationResponse) => void;
  result?: ConfirmationResponse;
}

/** Dependencies for utility actions */
interface UtilityActionDependencies {
  isLight: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalize wait seconds to valid range
 */
function normalizeWaitSeconds(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return MIN_WAIT_SECONDS;
  return Math.max(MIN_WAIT_SECONDS, Math.min(MAX_WAIT_SECONDS, Math.floor(num)));
}

// ============================================================================
// ACTION CREATORS
// ============================================================================

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
  parameters: [
    {
      name: 'seconds',
      type: 'number',
      description: `Seconds to wait (${MIN_WAIT_SECONDS}-${MAX_WAIT_SECONDS})`,
      required: true,
    },
  ],
  render: (props: RenderProps<WaitArgs>) => {
    const seconds = normalizeWaitSeconds(props.args?.seconds);
    // Status may come as string from framework
    const status = (props.status ?? 'pending') as ActionPhase;
    return <WaitCountdown seconds={seconds} status={status} isLight={isLight} />;
  },
  handler: async (args: Record<string, unknown>) => {
    const seconds = args.seconds as number;
    debug.log(ts(), LOG_PREFIX.request, 'wait:', { seconds });
    const normalizedSeconds = normalizeWaitSeconds(seconds);
    await new Promise((resolve) => setTimeout(resolve, normalizedSeconds * 1000));
    debug.log(ts(), LOG_PREFIX.response, 'wait:', { status: 'success', waitedSeconds: normalizedSeconds });
    return { status: 'success' as const, waitedSeconds: normalizedSeconds };
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
  render: (props: ConfirmActionRenderProps) => {
    const actionDescription = props.args?.actionDescription ?? 'proceed with this action';
    // Status may come as string from framework
    const status = (props.status ?? 'executing') as 'executing' | 'complete' | string;

    return (
      <ConfirmationCard
        actionDescription={actionDescription}
        status={status}
        respond={props.respond}
        result={props.result}
      />
    );
  },
});
