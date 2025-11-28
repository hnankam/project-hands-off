/**
 * Weather CopilotKit Actions
 *
 * Actions for fetching and displaying weather information (Generative UI example)
 */

import React from 'react';
import { WeatherCard } from '../../components/WeatherCard';

// ============================================================================
// TYPES
// ============================================================================

/** Status values for action render */
type ActionPhase = 'pending' | 'inProgress' | 'complete' | 'error';

/** Arguments for get_weather action */
interface GetWeatherArgs {
  location?: string;
}

/** Props passed to action render functions */
interface ActionRenderProps {
  args?: GetWeatherArgs;
  status?: ActionPhase;
  result?: unknown;
  error?: Error | string;
}

/** Dependencies for weather actions */
interface WeatherActionDependencies {
  themeColor: string;
}

// ============================================================================
// ACTION CREATORS
// ============================================================================

/**
 * Creates the get_weather action
 * Displays a weather card with current weather information (Generative UI example)
 *
 * Note: This action is currently disabled ('available: disabled')
 */
export const createGetWeatherAction = ({ themeColor }: WeatherActionDependencies) => ({
  name: 'get_weather',
  description: 'Get the weather for a given location.',
  available: 'disabled' as const,
  followUp: false,
  parameters: [
    {
      name: 'location',
      type: 'string',
      description: 'The location to get weather for (e.g., "New York", "London, UK")',
      required: true,
    },
  ],
  render: ({ args }: ActionRenderProps) => {
    const location = args?.location ?? 'Unknown Location';
    return <WeatherCard location={location} themeColor={themeColor} />;
  },
});
