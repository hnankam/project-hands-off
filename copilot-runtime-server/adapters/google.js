/**
 * Google Generative AI adapter configuration
 */

import { GoogleGenerativeAIAdapter } from "@copilotkit/runtime";
import { GOOGLE_API_KEY, DEBUG } from '../config/index.js';

/**
 * Create Google Gemini adapter
 * Used for non-agent components like useCopilotChatSuggestions
 */
export function createGeminiAdapter() {
  return new GoogleGenerativeAIAdapter({
    model: "gemini-2.5-flash-lite",
    apiKey: GOOGLE_API_KEY,
    promptCaching: {
      enabled: true,
      debug: DEBUG
    }
  });
}

