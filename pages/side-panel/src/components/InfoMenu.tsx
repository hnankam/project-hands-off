/**
 * Info Menu Component
 * 
 * Displays help resources and documentation links.
 */

import React, { useState } from 'react';
import { cn } from '@extension/ui';

interface InfoMenuProps {
  isLight: boolean;
  onSendFeedback?: () => void;
  onRequestSupport?: () => void;
}

export default function InfoMenu({ isLight, onSendFeedback, onRequestSupport }: InfoMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    {
      label: 'Request Support',
      icon: (
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
      external: false,
    },
    {
      label: 'Send Feedback',
      icon: (
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
          />
        </svg>
      ),
      external: false,
    },
    {
      label: 'Docs',
      icon: (
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
      external: true,
      url: 'https://handsoff.com/docs',
    },
    {
      label: 'API Reference',
      icon: (
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
      external: true,
      url: 'https://handsoff.com/api',
    },
    {
      label: 'Changelog',
      icon: (
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
      external: true,
      url: 'https://handsoff.com/changelog',
    },
    {
      label: 'Trust Center',
      icon: (
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      ),
      external: true,
      url: 'https://handsoff.com/trust',
    },
    {
      label: 'handsoff.com',
      icon: (
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
          />
        </svg>
      ),
      external: true,
      url: 'https://handsoff.com',
    },
  ];

  const handleItemClick = (item: typeof menuItems[number]) => {
    if (item.label === 'Request Support' && onRequestSupport) {
      onRequestSupport();
    } else if (item.label === 'Send Feedback' && onSendFeedback) {
      onSendFeedback();
    } else if (item.external && item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'h-7 w-7 rounded-md flex items-center justify-center transition-all',
          isLight 
            ? 'bg-gray-200/70 text-gray-600 hover:bg-gray-300/70' 
            : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/60'
        )}
        title="Help & Resources"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      {/* Menu - Keep mounted but control visibility */}
      <div
        className={cn(
          'absolute right-0 top-full mt-1 w-56 rounded-md border shadow-lg z-50 transition-opacity',
          isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#151C24] border-gray-700',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      >
        {/* Menu Items */}
        <div>
          {menuItems.map((item, index) => (
            <React.Fragment key={item.label}>
              <button
                onClick={() => handleItemClick(item)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-normal transition-colors',
                  isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700/50'
                )}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.external && (
                  <svg className="h-3 w-3 flex-shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                )}
              </button>
              {/* Add separator after "Send Feedback" and before the last item */}
              {(index === 1 || index === menuItems.length - 2) && (
                <div className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

