import React from 'react';
import { cn } from '@extension/ui';

interface HomePageProps {
  isLight: boolean;
  onGoToSessions: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ isLight, onGoToSessions }) => {
  return (
    <>
      {/* Home Page Header */}
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between border-b px-2 py-[0.4em]',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <div className="mr-2 flex min-w-0 flex-1 items-center overflow-hidden">
          <div className={cn('flex-1 truncate px-1 text-sm font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Home
          </div>
        </div>
      </div>

      {/* Home Page Content */}
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className={cn('mb-3 text-sm', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Welcome to Project Hands-Off
          </p>
          <button
            onClick={onGoToSessions}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              isLight ? 'bg-gray-800 text-white hover:bg-gray-900' : 'bg-gray-200 text-gray-900 hover:bg-white',
            )}>
            Go to Sessions
          </button>
        </div>
      </div>
    </>
  );
};

