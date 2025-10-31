import React from 'react';
import { cn } from '@extension/ui';

interface Role {
  value: string;
  label: string;
  description?: string;
}

interface RoleSelectorProps {
  isLight: boolean;
  roles: Role[];
  selectedRole: string;
  onRoleChange: (role: string) => void;
  placeholder?: string;
}

// Role icon
const RoleIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <path d="M20 8v6M23 11h-6" />
  </svg>
);

// Shield icon for owner/admin
const ShieldIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const RoleSelector: React.FC<RoleSelectorProps> = ({
  isLight,
  roles,
  selectedRole,
  onRoleChange,
  placeholder = 'Select role',
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

  const selectedRoleObj = roles.find(role => role.value === selectedRole);
  const isAdminOrOwner = selectedRole === 'admin' || selectedRole === 'owner';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md h-auto w-full border',
          isLight
            ? 'text-gray-700 hover:bg-gray-50 border-gray-300 bg-white'
            : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
        )}
      >
        <span className="flex-shrink-0">
          {isAdminOrOwner ? <ShieldIcon /> : <RoleIcon />}
        </span>
        <span className="font-medium truncate flex-1 min-w-0 text-left">
          {selectedRoleObj ? selectedRoleObj.label : placeholder}
        </span>
        <svg
          className={cn(
            'transition-transform flex-shrink-0',
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
          {roles.map(role => {
            const isRoleAdminOrOwner = role.value === 'admin' || role.value === 'owner';
            return (
              <button
                key={role.value}
                type="button"
                onClick={() => {
                  onRoleChange(role.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'flex items-start gap-1.5 w-full px-2.5 py-2 text-xs transition-colors',
                  selectedRole === role.value
                    ? isLight
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'bg-blue-900/30 text-blue-300 font-medium'
                    : isLight
                    ? 'text-gray-700 hover:bg-gray-100'
                    : 'text-gray-200 hover:bg-gray-700'
                )}
              >
                <span className="flex-shrink-0 mt-0.5">
                  {isRoleAdminOrOwner ? <ShieldIcon /> : <RoleIcon />}
                </span>
                <div className="flex-1 text-left min-w-0">
                  <div className="truncate font-medium">{role.label}</div>
                  {role.description && (
                    <div className={cn(
                      'text-[10px] mt-0.5 truncate',
                      selectedRole === role.value
                        ? isLight ? 'text-blue-600' : 'text-blue-400'
                        : isLight ? 'text-gray-500' : 'text-gray-400'
                    )}>
                      {role.description}
                    </div>
                  )}
                </div>
                {selectedRole === role.value && (
                  <svg
                    className="ml-auto flex-shrink-0 mt-0.5"
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
            );
          })}
        </div>
      )}
    </div>
  );
};

