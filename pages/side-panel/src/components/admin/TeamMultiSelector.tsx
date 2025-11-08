import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@extension/ui';

interface Team {
  id: string;
  name: string;
  organizationId: string;
}

interface TeamMultiSelectorProps {
  isLight: boolean;
  teams: Team[];
  selectedTeamIds: string[];
  onTeamChange: (teamIds: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  loading?: boolean;
  dropdownPosition?: 'up' | 'down';
}

const TeamIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

export const TeamMultiSelector: React.FC<TeamMultiSelectorProps> = ({
  isLight,
  teams,
  selectedTeamIds,
  onTeamChange,
  placeholder = 'Select teams...',
  disabled = false,
  allowEmpty = true,
  loading = false,
  dropdownPosition = 'down',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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

  if (loading) {
    return (
      <div
        className={cn(
          'h-[34px] w-full rounded-md border animate-pulse',
          isLight ? 'border-gray-200 bg-gray-100' : 'border-gray-700 bg-gray-800',
        )}
      />
    );
  }

  const toggleTeam = (teamId: string) => {
    if (selectedTeamIds.includes(teamId)) {
      const newSelection = selectedTeamIds.filter(id => id !== teamId);
      if (allowEmpty || newSelection.length > 0) {
        onTeamChange(newSelection);
      }
    } else {
      onTeamChange([...selectedTeamIds, teamId]);
    }
  };

  const removeTeam = (teamId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = selectedTeamIds.filter(id => id !== teamId);
    if (allowEmpty || newSelection.length > 0) {
      onTeamChange(newSelection);
    }
  };

  const selectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTeamChange(teams.map(t => t.id));
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allowEmpty) {
      onTeamChange([]);
    }
  };

  const selectedTeams = teams.filter(t => selectedTeamIds.includes(t.id));

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] min-w-0 w-full border',
          disabled 
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer',
          isLight
            ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
            : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
        )}
      >
        <span className="flex-shrink-0 mt-0.5">
          <TeamIcon />
        </span>
        
        {selectedTeams.length > 0 ? (
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedTeams.map(team => (
              <span
                key={team.id}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                  isLight
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-blue-900/20 text-blue-400'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {team.name}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => removeTeam(team.id, e)}
                    className={cn(
                      'hover:bg-black/10 rounded-full p-0.5 transition-colors',
                      isLight ? 'text-blue-600' : 'text-blue-300'
                    )}
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <span className={cn('flex-1 min-w-0 text-left', isLight ? 'text-gray-500' : 'text-gray-400')}>
            {placeholder}
          </span>
        )}
        
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

      {isOpen && !disabled && (
        <div
          className={cn(
            'absolute z-50 w-full rounded-md border shadow-lg max-h-[280px] overflow-hidden',
            dropdownPosition === 'up' ? 'bottom-full mb-1' : 'mt-1',
            isLight
              ? 'bg-white border-gray-200'
              : 'bg-[#0D1117] border-gray-700',
          )}
        >
          {/* Header with Select All / Clear All */}
          <div
            className={cn(
              'flex items-center justify-between px-3 py-2 border-b text-xs font-medium',
              isLight
                ? 'bg-gray-50 border-gray-200 text-gray-600'
                : 'bg-[#0D1117] border-gray-700 text-gray-400',
            )}
          >
            <span>
              {selectedTeamIds.length} of {teams.length} selected
            </span>
            <div className="flex gap-2">
              {selectedTeamIds.length < teams.length && (
                <button
                  type="button"
                  onClick={selectAll}
                  className={cn(
                    'hover:underline',
                    isLight ? 'text-blue-600' : 'text-blue-400'
                  )}
                >
                  Select All
                </button>
              )}
              {selectedTeamIds.length > 0 && allowEmpty && (
                <button
                  type="button"
                  onClick={clearAll}
                  className={cn(
                    'hover:underline',
                    isLight ? 'text-red-600' : 'text-red-400'
                  )}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Team List */}
          <div className="overflow-y-auto max-h-[220px]">
            {teams.length === 0 ? (
              <div
                className={cn(
                  'px-3 py-6 text-center text-xs',
                  isLight ? 'text-gray-500' : 'text-gray-400',
                )}
              >
                No teams available
              </div>
            ) : (
              teams.map(team => {
                const isSelected = selectedTeamIds.includes(team.id);
                return (
                  <button
                    type="button"
                    key={team.id}
                    onClick={() => toggleTeam(team.id)}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors text-left',
                      isSelected
                        ? isLight
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-blue-900/20 text-blue-400'
                        : isLight
                          ? 'text-gray-700 hover:bg-gray-100'
                          : 'text-gray-200 hover:bg-[#151C24]',
                    )}
                  >
                    <div
                      className={cn(
                        'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                        isSelected
                          ? 'bg-blue-600 border-blue-600'
                          : isLight
                            ? 'border-gray-300'
                            : 'border-gray-600'
                      )}
                    >
                      {isSelected && (
                        <svg
                          width="10"
                          height="10"
                          fill="none"
                          stroke="white"
                          viewBox="0 0 24 24"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <TeamIcon />
                    <span className="truncate flex-1 font-medium">{team.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

