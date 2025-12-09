/**
 * Organization Selector Component
 * 
 * Allows users to switch between organizations and manage organization settings.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authClient } from '../../lib/auth-client';
import { cn } from '@extension/ui';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
}

interface OrganizationSelectorProps {
  isLight?: boolean;
}

export default function OrganizationSelector({ isLight = true }: OrganizationSelectorProps) {
  const { user, organization, setActiveOrganization } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoSelectingOrgRef = useRef(false);

  useEffect(() => {
    if (user) {
      loadOrganizations();
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleOtherDropdownOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ source: string }>).detail;
      if (detail?.source !== 'organization') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('user-menu-dropdown-open', handleOtherDropdownOpen as EventListener);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('user-menu-dropdown-open', handleOtherDropdownOpen as EventListener);
    };
  }, []);

  const loadOrganizations = async () => {
    try {
      setIsLoading(true);
      const result = await authClient.organization.list();
      if (result.data) {
        setOrganizations(result.data);
      }
    } catch (error) {
      console.error('Error loading organizations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user || isLoading) return;
    if (organizations.length === 0) return;

    const hasActiveOrganization = organization && organizations.some((org) => org.id === organization.id);
    if (hasActiveOrganization) {
      // Reset flag so we can auto-select again if the active org disappears later
      autoSelectingOrgRef.current = false;
      return;
    }

    if (autoSelectingOrgRef.current) {
      return; // Avoid concurrent auto-select attempts
    }

    const fallbackOrg = organizations[0];
    if (!fallbackOrg) {
      return;
    }

    if (fallbackOrg) {
      autoSelectingOrgRef.current = true;
      (async () => {
        try {
          await setActiveOrganization(fallbackOrg.id);
        } catch (err) {
          console.error('[OrganizationSelector] Failed to auto-select organization:', err);
          autoSelectingOrgRef.current = false;
        }
      })();
    } else {
      autoSelectingOrgRef.current = false;
    }
  }, [user, isLoading, organizations, organization?.id, setActiveOrganization]);

  const handleOrganizationChange = async (orgId: string) => {
    await setActiveOrganization(orgId);
    setIsOpen(false);
  };

  const handleToggle = () => {
    // Don't open dropdown if there are no organizations to show
    if (organizations.length === 0 && !isLoading) {
      return;
    }
    
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        document.dispatchEvent(
          new CustomEvent('user-menu-dropdown-open', { detail: { source: 'organization' } })
        );
      }
      return next;
    });
  };

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          onClick={handleToggle}
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 transition-colors w-full',
            isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50'
          )}
        >
          <div
            className={cn(
              'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-semibold text-xs',
              isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400'
            )}
          >
            {organization?.name?.charAt(0).toUpperCase() || 'O'}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className={cn('text-xs font-medium truncate', isLight ? 'text-gray-700' : 'text-gray-200')}>
              {organization?.name || (isLoading ? 'Loading organizations…' : organizations.length > 0 ? 'Selecting organization…' : 'No organizations')}
            </p>
            <p className={cn('text-[10px] truncate', isLight ? 'text-gray-500' : 'text-gray-400')}>
              {organization?.slug || (isLoading ? 'Please wait' : organizations.length > 0 ? 'Auto-selecting default' : 'Create or join an organization')}
            </p>
          </div>
          {(organizations.length > 0 || isLoading) && (
            <svg
              className={cn(
                'w-3 h-3 transition-transform',
                isOpen ? 'rotate-180' : '',
                isLight ? 'text-gray-500' : 'text-gray-400'
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>

        {/* Dropdown - Always mounted, visibility controlled with CSS */}
        <div className={cn(
          'absolute top-full left-0 right-0 mt-2 border rounded-md shadow-lg z-50 max-h-96 overflow-y-auto transition-opacity',
          isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#151C24] border-gray-700',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}>
          {isLoading ? (
              <div className="p-4 text-center">
                <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : organizations.length === 0 ? (
              <div className="p-4 text-center">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2',
                  isLight ? 'bg-gray-100' : 'bg-gray-800'
                )}>
                  <svg className={cn('w-5 h-5', isLight ? 'text-gray-400' : 'text-gray-500')} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <p className={cn('text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  No organizations yet
                </p>
                <p className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  Ask an admin to invite you, or create one in the Admin Dashboard
                </p>
              </div>
            ) : (
              <>
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => handleOrganizationChange(org.id)}
                    className={cn(
                      'w-full px-3 py-2 text-left transition-colors flex items-center gap-2',
                      organization?.id === org.id
                        ? isLight ? 'bg-blue-50' : 'bg-blue-900/20'
                        : isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50'
                    )}
                  >
                    <div
                      className={cn(
                        'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-semibold text-xs',
                        isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400'
                      )}
                    >
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-medium truncate', isLight ? 'text-gray-700' : 'text-gray-200')}>
                        {org.name}
                      </p>
                      <p className={cn('text-[10px] truncate', isLight ? 'text-gray-500' : 'text-gray-400')}>
                        {org.slug}
                      </p>
                    </div>
                    {organization?.id === org.id && (
                      <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </>
            )}
        </div>
      </div>
    </>
  );
}

