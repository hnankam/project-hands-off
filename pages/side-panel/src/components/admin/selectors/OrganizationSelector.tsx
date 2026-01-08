import React, { useRef, useState } from 'react';
import { cn } from '@extension/ui';
import { useClickOutside } from '../hooks';
import { OrgIcon, ChevronDownIcon, CheckIcon } from '../icons';
import type { Organization } from '../types';

export interface OrganizationSelectorProps {
  isLight: boolean;
  organizations: Organization[];
  selectedOrgId: string;
  onOrgChange: (orgId: string) => void;
  placeholder?: string;
}

export const OrganizationSelector: React.FC<OrganizationSelectorProps> = ({
  isLight,
  organizations,
  selectedOrgId,
  onOrgChange,
  placeholder = 'Select an organization...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef as React.RefObject<HTMLElement>, () => setIsOpen(false), isOpen);

  const selectedOrg = organizations.find(org => org.id === selectedOrgId);

  // Show placeholder or loading state
  if (organizations.length === 0) {
    return (
      <div className={cn(
        'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] opacity-50 border',
        isLight ? 'bg-white border-gray-300' : 'bg-[#151C24] border-gray-600'
      )}>
        <span className="mt-0.5">
          <OrgIcon />
        </span>
        <span className="font-medium">No organizations</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] min-w-0 w-full border',
          isLight
            ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
            : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
        )}
      >
        <span className="flex-shrink-0 mt-0.5">
          <OrgIcon />
        </span>
        <span className={cn('font-medium truncate flex-1 min-w-0 text-left', selectedOrg && 'uppercase')}>
          {selectedOrg ? selectedOrg.name : placeholder}
        </span>
        <ChevronDownIcon isOpen={isOpen} className="flex-shrink-0 mt-0.5" />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full left-0 mt-1 w-full min-w-[180px] rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
            isLight
              ? 'bg-white border-gray-200'
              : 'bg-[#151C24] border-gray-700'
          )}
        >
          {organizations.map(org => (
            <button
              type="button"
              key={org.id}
              onClick={() => {
                onOrgChange(org.id);
                setIsOpen(false);
              }}
              className={cn(
                'flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs transition-colors',
                selectedOrgId === org.id
                  ? isLight
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'bg-blue-900/30 text-blue-300 font-medium'
                  : isLight
                  ? 'text-gray-700 hover:bg-gray-100'
                  : 'text-gray-200 hover:bg-gray-700'
              )}
            >
              <OrgIcon />
              <span className="truncate flex-1 text-left uppercase">{org.name}</span>
              {selectedOrgId === org.id && (
                <CheckIcon className="ml-auto flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrganizationSelector;

