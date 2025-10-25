/**
 * Theme-related CopilotKit Actions
 * 
 * Actions for managing UI theme and appearance settings.
 */

/**
 * Creates the setThemeColor CopilotKit action
 * 
 * Allows the AI agent to change the chat interface theme color dynamically.
 * Supports hex color codes and standard color names.
 * 
 * @param setThemeColor - Callback to update the theme color state
 * @returns CopilotKit action configuration
 */
export const createSetThemeColorAction = (
  setThemeColor: (color: string) => void
) => ({
  name: 'setThemeColor',
  description: 'Set the theme color for the chat interface. Use hex color codes like #FF5733 or color names.',
  parameters: [
    {
      name: 'themeColor',
      description: 'The theme color to set. Make sure to pick nice colors.',
      required: true,
    },
  ],
  handler: async ({ themeColor }: { themeColor: string }) => {
    setThemeColor(themeColor || '');
  },
});

