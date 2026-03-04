import type { FC } from 'react';
import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

// Persist expanded state across remounts (for Virtua virtualization)
const expandedStateCache: Map<string, boolean> = new Map();
// Track if user has manually closed a card (persists across remounts)
const userClosedCache: Map<string, boolean> = new Map();

export interface ImageGalleryCardProps {
  status?: string;
  imageUrls?: string[];
  prompt?: string;
  themeColor: string;
  instanceId?: string; // unique ID to persist expanded state across remounts
}

/**
 * ImageGalleryCard Component
 * 
 * Carousel-style image gallery matching the app's design system
 * Similar to productivity tips carousel on HomePage
 */
const ImageGalleryCardComponent: FC<ImageGalleryCardProps> = ({ status, imageUrls = [], prompt, instanceId }) => {
  const { isLight } = useStorage(themeStorage);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Generate a stable cache key from instanceId or fallback to prompt
  const cacheKey = instanceId ?? `gallery-${prompt ?? 'default'}`;
  
  // Initialize from cache if available
  const [isExpanded, setIsExpanded] = useState(() => {
    return expandedStateCache.get(cacheKey) ?? false;
  });
  
  // Initialize userClosed from cache
  const userClosedRef = useRef(userClosedCache.get(cacheKey) ?? false);
  
  // Sync expanded state to cache whenever it changes
  useEffect(() => {
    expandedStateCache.set(cacheKey, isExpanded);
  }, [cacheKey, isExpanded]);
  
  // Keep newly created cards open unless user manually closes them
  useEffect(() => {
    const isBeingCreated = status === 'inProgress' || status === 'executing';
    if (isBeingCreated && !userClosedRef.current) {
      setIsExpanded(true);
    }
  }, [status]);
  
  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    // Track if user is closing a card that's being created
    if (!newState && (status === 'inProgress' || status === 'executing')) {
      userClosedRef.current = true;
      userClosedCache.set(cacheKey, true);
    }
  };
  
  const displayUrls = imageUrls.length > 0 ? imageUrls : [];

  // Card styling matching ConfirmationCard
  const cardBackground = isLight ? 'rgba(249, 250, 251, 0.5)' : 'rgba(21, 28, 36, 0.4)';
  const borderColor = isLight ? 'rgba(229, 231, 235, 0.5)' : 'rgba(55, 65, 81, 0.4)';
  const textColor = isLight ? '#1f2937' : '#f3f4f6';
  const mutedTextColor = isLight ? '#6b7280' : '#9ca3af';
  const chevronColor = isLight ? '#6b7280' : '#6b7280'; // Darker in dark mode for better contrast
  const skeletonBase = isLight ? 'rgba(229, 231, 235, 0.5)' : 'rgba(55, 65, 81, 0.5)';
  const skeletonShimmer = isLight ? 'rgba(255, 255, 255, 0.5)' : 'rgba(75, 85, 99, 0.5)';

  // Check if action is in progress (matches ActionStatus pattern)
  const isWorking = status === 'inProgress' || status === 'executing';
  
  // Render skeleton loading state
  if (isWorking) {
    return (
      <div
        className="rounded-lg border transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: cardBackground,
          borderColor: borderColor,
          marginTop: '0px',
          marginLeft: '0px',
          marginRight: '0px',
          marginBottom: '6px',
          // maxWidth: 'calc(56rem - 24px)', // Match assistant message max-width minus padding
          // width: 'calc(100% - 24px)', // Full width minus padding
        }}
      >
        {/* Skeleton Header */}
        <div
          style={{
            width: '100%',
            padding: '6px',
            paddingRight: '0',
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Skeleton chevron */}
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '2px',
                backgroundColor: skeletonBase,
                flexShrink: 0,
              }}
            />
            
            {/* Skeleton icon */}
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                backgroundColor: skeletonBase,
                flexShrink: 0,
              }}
            />
            
            {/* Skeleton title */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '100px',
                  height: '12px',
                  borderRadius: '4px',
                  backgroundColor: skeletonBase,
                  animation: 'skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                }}
              />
              <span style={{ color: mutedTextColor }}>|</span>
              {prompt && (
                <div
                  style={{
                    flex: 1,
                    height: '20px',
                    borderRadius: '6px',
                    backgroundColor: skeletonBase,
                    animation: 'skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    maxWidth: '200px',
                  }}
                />
              )}
            </div>
            
            {/* Skeleton count */}
            <div
              style={{
                width: '50px',
                height: '11px',
                borderRadius: '4px',
                backgroundColor: skeletonBase,
                marginRight: '12px',
                flexShrink: 0,
                animation: 'skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
            />
          </div>
        </div>

        {/* Skeleton Content */}
        <div style={{ padding: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {/* Skeleton image */}
            <div
              style={{
                flex: 1,
                aspectRatio: '16/9',
                borderRadius: '6px',
                backgroundColor: skeletonBase,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Shimmer effect */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: `linear-gradient(90deg, transparent, ${skeletonShimmer}, transparent)`,
                  animation: 'skeleton-shimmer 2s infinite',
                }}
              />
              {/* Loading text */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: mutedTextColor,
                  fontSize: '12px',
                  fontWeight: 300,
                }}
              >
                Generating Images...
              </div>
            </div>
          </div>

          {/* Skeleton dots */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '8px' }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: i === 0 ? '16px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  backgroundColor: skeletonBase,
                  animation: 'skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  if (displayUrls.length === 0) return null;

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? displayUrls.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === displayUrls.length - 1 ? 0 : prev + 1));
  };

  const currentUrl = displayUrls[currentIndex];

  return (
    <div
      className="rounded-lg border transition-all duration-300 ease-in-out"
      style={{
        backgroundColor: cardBackground,
        borderColor: borderColor,
        marginTop: '0px',
        marginLeft: '0px',
        marginRight: '0px',
        marginBottom: '6px',
        // maxWidth: 'calc(56rem - 24px)', // Match assistant message max-width minus padding
        // width: 'calc(100% - 24px)', // Full width minus padding
      }}
    >
      {/* Header - Accordion Toggle */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          width: '100%',
          padding: '6px',
          paddingRight: '0',
          backgroundColor: 'transparent',
          border: 'none',
          borderBottom: isExpanded ? `1px solid ${borderColor}` : 'none',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease, border-bottom 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = isLight ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.02)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {/* Expand/Collapse Chevron */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px',
              height: '16px',
              flexShrink: 0,
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{ color: chevronColor }}
            >
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Image icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              flexShrink: 0,
              padding: '0',
              margin: '0',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              style={{ color: isLight ? '#6b7280' : '#9ca3af' }}
            >
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
          </div>

          {/* Title - single line */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 350,
                color: textColor,
                flexShrink: 0,
              }}
            >
              Generated Images
            </span> | 
            {prompt && (
              <span
                className="gallery-prompt"
                style={{
                  fontSize: '10px',
                  fontWeight: 300,
                  color: mutedTextColor,
                  backgroundColor: isLight ? 'rgba(229, 231, 235, 0.5)' : 'rgba(55, 65, 81, 0.5)',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {prompt}
              </span>
            )}
          </div>

          {/* Image count */}
          <div
            className="gallery-count"
            style={{
              fontSize: '11px',
              color: mutedTextColor,
              paddingRight: '12px',
              flexShrink: 0,
            }}
          >
            {displayUrls.length} {displayUrls.length === 1 ? 'image' : 'images'}
          </div>
        </div>
      </button>

      {/* Carousel Content - Collapsible */}
      <div
        style={{
          maxHeight: isExpanded ? '1000px' : '0',
          opacity: isExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
        }}
      >
        <div 
          className="gallery-carousel"
          style={{ padding: '8px' }}
          onMouseEnter={(e) => {
            const buttons = e.currentTarget.querySelectorAll('.gallery-nav-button');
            buttons.forEach((btn) => {
              (btn as HTMLElement).style.opacity = '1';
              (btn as HTMLElement).style.transition = 'opacity 0.3s ease-in-out, background-color 0.2s ease, color 0.2s ease';
            });
          }}
          onMouseLeave={(e) => {
            const buttons = e.currentTarget.querySelectorAll('.gallery-nav-button');
            buttons.forEach((btn) => {
              (btn as HTMLElement).style.opacity = '0';
              (btn as HTMLElement).style.transition = 'opacity 0.3s ease-in-out, background-color 0.2s ease, color 0.2s ease';
            });
          }}
        >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Left Arrow */}
          {displayUrls.length > 1 && (
            <button
              type="button"
              onClick={goToPrevious}
              className="gallery-nav-button transition-all"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '80px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0,
                backgroundColor: 'transparent',
                color: isLight ? '#e5e7eb' : '#374151',
                opacity: 0,
                transition: 'opacity 0.3s ease-in-out, background-color 0.2s ease, color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.08)';
                e.currentTarget.style.color = isLight ? '#9ca3af' : '#4b5563';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isLight ? '#e5e7eb' : '#374151';
              }}
              title="Previous image"
            >
              <svg width="24" height="60" viewBox="0 0 24 60" fill="none" stroke="currentColor" strokeWidth={8}>
                <path d="M18 12l-9 18 9 18" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {/* Image Display */}
          <div
            className="transition-all"
            style={{
              flex: 1,
              position: 'relative',
              aspectRatio: '16/9',
              borderRadius: '6px',
              overflow: 'hidden',
              backgroundColor: "transparent",
              display: 'block',
            }}
            onMouseEnter={(e) => {
              const overlay = e.currentTarget.querySelector('.hover-overlay') as HTMLElement;
              if (overlay) overlay.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              const overlay = e.currentTarget.querySelector('.hover-overlay') as HTMLElement;
              if (overlay) overlay.style.opacity = '0';
            }}
          >
            <img
              src={currentUrl}
              alt={`Generated image ${currentIndex + 1}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
              referrerPolicy="no-referrer"
            />
            
            {/* Hover overlay */}
            <div
              className="hover-overlay"
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                opacity: 0,
                transition: 'opacity 200ms',
              }}
            >
              {/* Download button */}
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const response = await fetch(currentUrl);
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const timestamp = Date.now();
                    a.download = `generated-image-${timestamp}-${currentIndex + 1}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  } catch (error) {
                    console.error('Download failed:', error);
                  }
                }}
                style={{
                  background: 'rgba(75, 75, 75, 0.7)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 200ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(95, 95, 95, 0.85)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(75, 75, 75, 0.7)';
                }}
                title="Download image"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>

              {/* Open in new tab button */}
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'rgba(75, 75, 75, 0.7)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 200ms',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(95, 95, 95, 0.85)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(75, 75, 75, 0.7)';
                }}
                title="Open in new tab"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M10 6v2H5v11h11v-5h2v6a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1h6zm11-3v8h-2V6.413l-7.793 7.794-1.414-1.414L17.585 5H13V3h8z"/>
              </svg>
              </a>
            </div>
          </div>

          {/* Right Arrow */}
          {displayUrls.length > 1 && (
            <button
              type="button"
              onClick={goToNext}
              className="gallery-nav-button transition-all"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '80px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0,
                backgroundColor: 'transparent',
                color: isLight ? '#e5e7eb' : '#374151',
                opacity: 0,
                transition: 'opacity 0.3s ease-in-out, background-color 0.2s ease, color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.08)';
                e.currentTarget.style.color = isLight ? '#9ca3af' : '#4b5563';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isLight ? '#e5e7eb' : '#374151';
              }}
              title="Next image"
            >
              <svg width="24" height="60" viewBox="0 0 24 60" fill="none" stroke="currentColor" strokeWidth={8}>
                <path d="M6 12l9 18-9 18" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Dot Indicators */}
        {displayUrls.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '8px' }}>
            {displayUrls.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className="transition-all"
                style={{
                  width: index === currentIndex ? '16px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor:
                    index === currentIndex
                      ? isLight ? '#2563eb' : '#60a5fa'
                      : isLight ? '#e5e7eb' : '#374151',
                  padding: 0,
                  transition: 'all 0.2s ease',
                }}
                title={`Image ${index + 1}`}
              />
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const ImageGalleryCard = React.memo(ImageGalleryCardComponent);
ImageGalleryCard.displayName = 'ImageGalleryCard';

