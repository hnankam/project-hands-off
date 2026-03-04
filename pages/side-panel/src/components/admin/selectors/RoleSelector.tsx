import * as React from 'react';
import { useRef, useState } from 'react';
import { cn } from '@extension/ui';
import { useClickOutside } from '../hooks';
import { RoleIcon, ShieldIcon, ChevronDownIcon, CheckIcon } from '../icons';
import type { Role } from '../types';

export interface RoleSelectorProps {
  isLight: boolean;
  roles: Role[];
  selectedRole: string;
  onRoleChange: (role: string) => void;
  placeholder?: string;
}

export const RoleSelector: React.FC<RoleSelectorProps> = ({
  isLight,
  roles,
  selectedRole,
  onRoleChange,
  placeholder = 'Select role',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);

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
        <ChevronDownIcon isOpen={isOpen} className="flex-shrink-0" />
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
                  <CheckIcon className="ml-auto flex-shrink-0 mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RoleSelector;

