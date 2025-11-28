/**
 * Theme-related CopilotKit Actions
 *
 * Actions for managing UI theme and appearance settings.
 */

// ============================================================================
// TYPES
// ============================================================================

/** Handler arguments for setThemeColor */
interface SetThemeColorArgs {
  themeColor: string;
}

/** Result from theme color action */
interface SetThemeColorResult {
  status: 'success';
  color: string;
}

/** Callback type for setting theme color */
type SetThemeColorCallback = (color: string) => void;

// ============================================================================
// ACTION CREATORS
// ============================================================================

/**
 * Creates the setThemeColor CopilotKit action
 *
 * Allows the AI agent to change the chat interface theme color dynamically.
 * Supports hex color codes and standard color names.
 *
 * @param setThemeColor - Callback to update the theme color state
 * @returns CopilotKit action configuration
 *
 * @example
 * ```ts
 * const action = createSetThemeColorAction((color) => {
 *   document.documentElement.style.setProperty('--theme-color', color);
 * });
 * ```
 */
export const createSetThemeColorAction = (setThemeColor: SetThemeColorCallback) => ({
  name: 'setThemeColor',
  description: 'Set the theme color for the chat interface. Use hex color codes like #FF5733 or color names.',
  parameters: [
    {
      name: 'themeColor',
      type: 'string',
      description: 'The theme color to set. Make sure to pick nice colors.',
      required: true,
    },
  ],
  handler: async ({ themeColor }: SetThemeColorArgs): Promise<SetThemeColorResult> => {
    const color = themeColor.trim();
    setThemeColor(color);
    return { status: 'success', color };
  },
});
