/**
 * ================================================================================
 * Chat Suggestions Configuration
 * ================================================================================
 * 
 * Defines the instructions and configuration for CopilotKit chat suggestions.
 * These instructions guide the AI in generating helpful, context-aware suggestions
 * for user interactions with the page.
 * 
 * @module chatSuggestions
 * ================================================================================
 */

/**
 * Instructions for the AI to generate helpful chat suggestions
 * 
 * These instructions:
 * - Describe available search actions (semantic search over page content)
 * - List interaction capabilities (click, input, scroll, etc.)
 * - Emphasize the importance of using search actions first
 * - Provide examples of useful suggestions
 * 
 * The suggestions automatically regenerate when the page context changes
 * (via useCopilotReadable values like pageMetadataForAgent).
 */

/**
 * Default maximum number of suggestions to show
 */
export const DEFAULT_MAX_SUGGESTIONS = 3;

export const CHAT_SUGGESTIONS_INSTRUCTIONS = `Suggest concise next steps from chat + page context. Your suggestions MUST be actionable and concise, based on the current chat history and page context. Keep to 1–2 sentences. Generate a maximum of ` + DEFAULT_MAX_SUGGESTIONS + ` suggestions.`;


