/**
 * User Menu Component
 * 
 * Displays user info, organization selector, and logout button.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '@extension/ui';
import OrganizationSelector from '../selectors/OrganizationSelector';
import TeamSelectorDropdown from '../selectors/TeamSelectorDropdown';

interface UserMenuProps {
  isLight: boolean;
  onGoAdmin?: (tab?: 'organizations' | 'teams' | 'users' | 'providers' | 'models' | 'agents') => void;
  onGoToSessions?: () => void;
}

export default function UserMenu({ isLight, onGoAdmin, onGoToSessions }: UserMenuProps) {
  const { user, signOut, organization, activeTeam } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  const canAccessSessions = !!(organization && activeTeam);

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'h-7 w-7 rounded-full text-xs font-semibold flex items-center justify-center transition-all',
            isLight 
              ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' 
              : 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/40'
          )}
          title={user.email}
        >
          {user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
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
            'absolute right-0 top-full mt-1 w-64 rounded-md border shadow-lg z-50 transition-opacity',
            isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#151C24] border-gray-700',
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
        >
              {/* User Info */}
              <div
                className={cn(
                  'px-3 py-1.5 border-b text-xs rounded-t-md',
                  isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#1A2332]'
                )}
              >
                <p className="font-semibold truncate" style={{ color: isLight ? '#374151' : '#bcc1c7' }}>
                  {user.name}
                </p>
                <p className={cn('truncate', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  {user.email}
                </p>
              </div>

              {/* Organization Selector */}
              <div className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <OrganizationSelector isLight={isLight} />
              </div>

              {/* Team Selector */}
              <div className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <TeamSelectorDropdown isLight={isLight} />
              </div>

              {/* Menu Items */}
              <div>
                {onGoToSessions && (
                  <button
                    onClick={() => {
                      if (!canAccessSessions) return;
                      onGoToSessions();
                      setIsOpen(false);
                    }}
                    disabled={!canAccessSessions}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-normal transition-colors',
                      canAccessSessions
                        ? isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700/50'
                        : isLight ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 cursor-not-allowed'
                    )}
                  >
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                      />
                    </svg>
                    Sessions{!canAccessSessions && ' (Select org & team)'}
                  </button>
                )}
                
                {onGoAdmin && (
                  <button
                    onClick={() => {
                      onGoAdmin('organizations');
                      setIsOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-normal transition-colors',
                      isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700/50'
                    )}
                  >
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                      />
                    </svg>
                    Admin Dashboard
                  </button>
                )}
                
                {onGoAdmin && (
                  <button
                    onClick={() => {
                      onGoAdmin('users');
                      setIsOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-normal transition-colors',
                      isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700/50'
                    )}
                  >
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    User Settings
                  </button>
                )}

              </div>

              {/* Sign Out */}
              <div className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <button
                  onClick={handleSignOut}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-normal transition-colors',
                    'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300',
                    isLight ? 'hover:bg-gray-100' : 'hover:bg-red-900/10'
                  )}
                >
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Sign Out
                </button>
              </div>
        </div>
      </div>
    </>
  );
}
