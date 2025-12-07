/**
 * Image Generation CopilotKit Actions
 *
 * Actions for generating and displaying images (Generative UI example)
 */

import React from 'react';
import { ImageGalleryCard } from '../../components/cards/ImageGalleryCard';

// ============================================================================
// TYPES
// ============================================================================

/** Status values for action render */
type ActionPhase = 'pending' | 'inProgress' | 'complete' | 'error';

/** Arguments for generate_images action */
interface GenerateImagesArgs {
  prompt?: string;
  num_images?: number;
}

/** Props passed to action render functions */
interface ActionRenderProps {
  status: ActionPhase;
  args?: GenerateImagesArgs;
  result?: string[] | unknown;
  error?: Error | string;
}

/** Dependencies for image actions */
interface ImageActionDependencies {
  themeColor: string;
}

// ============================================================================
// ACTION CREATORS
// ============================================================================

/**
 * Creates the generate_images action
 * Displays an image gallery with generated images (Generative UI example)
 *
 * Note: This action is currently disabled ('available: disabled')
 */
export const createGenerateImagesAction = ({ themeColor }: ImageActionDependencies) => ({
  name: 'generate_images',
  description:
    'Generate images based on a text prompt and display them in a gallery. DO NOT list the images to the user once generated.',
  available: 'disabled' as const,
  followUp: false,
  parameters: [
    {
      name: 'prompt',
      type: 'string',
      required: true,
      description: 'Text description of the images to generate',
    },
    {
      name: 'num_images',
      type: 'number',
      required: false,
      description: 'Number of images to generate (default: 1)',
    },
  ],
  render: ({ args, status, result }: ActionRenderProps) => {
    // Extract image URLs from backend result (expects string array)
    const imageUrls = Array.isArray(result) ? (result as string[]) : [];
    const prompt = args?.prompt ?? '';
    // Create unique instance ID from prompt for state persistence across remounts
    const instanceId = `generate-images-${prompt}`;

    return <ImageGalleryCard status={status} imageUrls={imageUrls} prompt={prompt} themeColor={themeColor} instanceId={instanceId} />;
  },
});
