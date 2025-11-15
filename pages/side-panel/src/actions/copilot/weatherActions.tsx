/**
 * Weather CopilotKit Actions
 * 
 * Actions for fetching and displaying weather information (Generative UI example)
 */

import React from 'react';
import { WeatherCard } from '../../components/WeatherCard';

interface WeatherActionDependencies {
  themeColor: string;
}

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
  parameters: [{ name: 'location', type: 'string', required: true }],
  render: ({ args }: any) => {
    return <WeatherCard location={args.location} themeColor={themeColor} />;
  },
});

