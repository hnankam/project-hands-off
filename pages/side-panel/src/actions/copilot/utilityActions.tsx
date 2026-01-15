/**
 * Utility CopilotKit Actions
 *
 * General utility actions for the AI agent.
 * V2: Uses Zod schemas for parameter definitions.
 */

import React from 'react';
import { z } from 'zod';
import { debug } from '@extension/shared';
import { WaitCountdown } from '../../components/feedback/WaitCountdown';
import { ConfirmationCard } from '../../components/cards/ConfirmationCard';

// ============================================================================
// ZOD SCHEMAS FOR TOOL PARAMETERS
// ============================================================================

/** Schema for wait parameters */
export const waitSchema = z.object({
  seconds: z.number().default(30).describe('Seconds to wait (5-600)'),
});

/** Schema for confirmAction parameters */
export const confirmActionSchema = z.object({
  actionDescription: z.string().describe('Description of the action that needs confirmation'),
});

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum wait time in seconds */
const MAX_WAIT_SECONDS = 600;

/** Minimum wait time in seconds */
const MIN_WAIT_SECONDS = 5;

/** Default wait time in seconds */
const DEFAULT_WAIT_SECONDS = 30;

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
  if (!Number.isFinite(num)) return DEFAULT_WAIT_SECONDS;
  return Math.max(MIN_WAIT_SECONDS, Math.min(MAX_WAIT_SECONDS, Math.floor(num)));
}

/**
 * Parse confirmation result from various formats
 */
function parseConfirmationResult(result: unknown): { confirmed: boolean } | undefined {
  if (result === undefined) return undefined;
  
  // Already in correct format
  if (typeof result === 'object' && result !== null && 'confirmed' in result) {
    return { confirmed: Boolean((result as { confirmed: unknown }).confirmed) };
  }
  
  // Boolean value
  if (typeof result === 'boolean') {
    return { confirmed: result };
  }
  
  // String value - try JSON parse or text check
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed === 'object' && parsed !== null && 'confirmed' in parsed) {
        return { confirmed: Boolean(parsed.confirmed) };
      }
      if (typeof parsed === 'boolean') {
        return { confirmed: parsed };
      }
    } catch {
      // Not valid JSON
    }
    // Fallback: check for truthy string patterns
    const lower = result.toLowerCase();
    return { confirmed: lower.includes('true') || lower.includes('confirmed') };
  }
  
  return undefined;
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
  parameters: waitSchema,
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
 * Note: Status may be an enum (ToolCallStatus) and result may be a JSON string.
 * These are normalized for the ConfirmationCard component.
 *
 * @returns useHumanInTheLoop configuration object
 */
export const createConfirmActionHumanInTheLoop = ({ isLight }: UtilityActionDependencies) => ({
  name: 'confirmAction',
  description: 'Ask user to confirm before proceeding with an action',
  parameters: confirmActionSchema,
  render: (props: ConfirmActionRenderProps) => {
    const actionDescription = props.args?.actionDescription ?? 'proceed with this action';
    
    // Normalize status - could be enum value or string
    // ToolCallStatus.Executing = 'executing', ToolCallStatus.Complete = 'complete'
    const rawStatus = props.status;
    let status: 'executing' | 'complete' | string = 'executing';
    if (rawStatus === 'complete' || rawStatus === 'Complete' || (rawStatus as any)?.toString?.() === 'complete') {
      status = 'complete';
    } else if (rawStatus === 'executing' || rawStatus === 'Executing' || (rawStatus as any)?.toString?.() === 'executing') {
      status = 'executing';
    }
    
    // Parse result - may be object, boolean, or JSON string
    const result = parseConfirmationResult(props.result);

    return (
      <ConfirmationCard
        actionDescription={actionDescription}
        status={status}
        respond={props.respond}
        result={result}
      />
    );
  },
});
