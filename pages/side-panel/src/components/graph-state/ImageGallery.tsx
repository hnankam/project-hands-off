/**
 * ImageGallery Component
 * 
 * Inline image gallery for displaying generated images within GraphStateCard.
 * Carousel-style with navigation and thumbnail strip.
 */

import type { FC } from 'react';
import * as React from 'react';
import { useState, memo } from 'react';

interface ImageGalleryProps {
  urls: string[];
  isLight: boolean;
}

export const ImageGallery: FC<ImageGalleryProps> = memo(({ urls, isLight }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showNavButtons, setShowNavButtons] = useState(false);
  
  if (urls.length === 0) return null;
  
  const prevImage = () => setCurrentIndex((i) => (i > 0 ? i - 1 : urls.length - 1));
  const nextImage = () => setCurrentIndex((i) => (i < urls.length - 1 ? i + 1 : 0));
  
  const chevronColor = isLight ? '#9ca3af' : '#4b5563';
  const chevronHoverColor = isLight ? '#6b7280' : '#6b7280';
  
  return (
    <div 
      className="my-3"
      onMouseEnter={() => setShowNavButtons(true)}
      onMouseLeave={() => setShowNavButtons(false)}
    >
      {/* Main carousel area */}
      <div className="flex items-center gap-2">
        {/* Left Arrow */}
        {urls.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prevImage(); }}
            className="flex items-center justify-center flex-shrink-0 rounded transition-all"
            style={{
              width: '32px',
              height: '60px',
              backgroundColor: 'transparent',
              color: chevronColor,
              opacity: showNavButtons ? 1 : 0,
              transition: 'opacity 0.3s ease-in-out, background-color 0.2s ease, color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = chevronHoverColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = chevronColor;
            }}
            title="Previous image"
          >
            <svg width="20" height="48" viewBox="0 0 24 60" fill="none" stroke="currentColor" strokeWidth={6}>
              <path d="M18 12l-9 18 9 18" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Main image display */}
        <div 
          className={`relative flex-1 rounded-lg overflow-hidden ${isLight ? 'bg-gray-100' : 'bg-slate-800/50'}`}
          style={{ aspectRatio: '16/9' }}
        >
          <img
            src={urls[currentIndex]}
            alt={`Generated image ${currentIndex + 1}`}
            className="w-full h-full object-contain cursor-pointer"
            onClick={() => window.open(urls[currentIndex], '_blank')}
            referrerPolicy="no-referrer"
          />
          
          {/* Image counter overlay */}
          {urls.length > 1 && (
            <div 
              className={`absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-sm font-medium ${
                isLight ? 'bg-white/90 text-gray-700' : 'bg-gray-900/80 text-gray-200'
              }`}
            >
              {currentIndex + 1} / {urls.length}
            </div>
          )}
        </div>

        {/* Right Arrow */}
        {urls.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); nextImage(); }}
            className="flex items-center justify-center flex-shrink-0 rounded transition-all"
            style={{
              width: '32px',
              height: '60px',
              backgroundColor: 'transparent',
              color: chevronColor,
              opacity: showNavButtons ? 1 : 0,
              transition: 'opacity 0.3s ease-in-out, background-color 0.2s ease, color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = chevronHoverColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = chevronColor;
            }}
            title="Next image"
          >
            <svg width="20" height="48" viewBox="0 0 24 60" fill="none" stroke="currentColor" strokeWidth={6}>
              <path d="M6 12l9 18-9 18" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      
      {/* Thumbnail strip (only if multiple images) */}
      {urls.length > 1 && (
        <div className="flex justify-center gap-2 mt-3">
          {urls.map((url, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`w-14 h-14 rounded-md overflow-hidden border-2 transition-all ${
                i === currentIndex 
                  ? (isLight ? 'border-blue-500 shadow-md' : 'border-blue-400 shadow-md') 
                  : (isLight ? 'border-gray-200 hover:border-gray-400' : 'border-gray-700 hover:border-gray-500')
              }`}
            >
              <img 
                src={url} 
                alt={`Thumbnail ${i + 1}`} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

ImageGallery.displayName = 'ImageGallery';

