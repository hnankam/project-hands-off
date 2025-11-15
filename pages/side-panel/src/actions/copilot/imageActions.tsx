/**
 * Image Generation CopilotKit Actions
 * 
 * Actions for generating and displaying images (Generative UI example)
 */

import React from 'react';
import { ImageGalleryCard } from '../../components/ImageGalleryCard';

interface ImageActionDependencies {
  themeColor: string;
}

/**
 * Creates the generate_images action
 * Displays an image gallery with generated images (Generative UI example)
 * 
 * Note: This action is currently disabled ('available: disabled')
 */
export const createGenerateImagesAction = ({ themeColor }: ImageActionDependencies) => ({
  name: 'generate_images',
  description: 'Generate images based on a text prompt and display them in a gallery. DO NOT list the images to the user once generated.',
  available: 'disabled' as const,
  followUp: false,
  parameters: [
    { name: 'prompt', type: 'string', required: true, description: 'Text description of the images to generate' },
    { name: 'num_images', type: 'number', required: false, description: 'Number of images to generate (default: 1)' }
  ],
  render: ({ args, status, result }: any) => {
    // Extract image URLs from backend result
    const imageUrls = Array.isArray(result) ? result : [];
    
    return (
      <ImageGalleryCard 
        status={status}
        imageUrls={imageUrls}
        prompt={args?.prompt}
        themeColor={themeColor}
      />
    );
  },
});

