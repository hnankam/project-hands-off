import React from 'react';
import { cn } from '@extension/ui';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: any;
  createdAt: string | Date;
}

interface OrganizationSelectorProps {
  isLight: boolean;
  organizations: Organization[];
  selectedOrgId: string;
  onOrgChange: (orgId: string) => void;
  placeholder?: string;
}

// Organization icon (building)
const OrgIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

export const OrganizationSelector: React.FC<OrganizationSelectorProps> = ({
  isLight,
  organizations,
  selectedOrgId,
  onOrgChange,
  placeholder = 'Select an organization...',
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

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
        <span className="font-medium truncate flex-1 min-w-0 text-left">
          {selectedOrg ? selectedOrg.name : placeholder}
        </span>
        <svg
          className={cn(
            'transition-transform flex-shrink-0 mt-0.5',
            isOpen ? 'rotate-180' : ''
          )}
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
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
              <span className="truncate flex-1 text-left">{org.name}</span>
              {selectedOrgId === org.id && (
                <svg
                  className="ml-auto flex-shrink-0"
                  width="12"
                  height="12"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

