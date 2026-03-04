import * as React from 'react';
import { useRef, useState } from 'react';
import { cn } from '@extension/ui';
import { useClickOutside } from '../hooks';
import { TeamIcon, ChevronDownIcon, CloseIcon } from '../icons';
import { CheckmarkIcon } from '../icons/CheckIcon';
import { SelectorSkeleton } from '../skeletons';
import type { Team } from '../types';

export interface TeamMultiSelectorProps {
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

  useClickOutside(dropdownRef as React.RefObject<HTMLElement>, () => setIsOpen(false), isOpen);

  if (loading) {
    return <SelectorSkeleton isLight={isLight} />;
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
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium uppercase',
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
                    <CloseIcon size={10} strokeWidth={3} />
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
        
        <ChevronDownIcon isOpen={isOpen} className="flex-shrink-0 mt-0.5" />
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
                        <CheckmarkIcon size={10} strokeWidth={3} className="text-white" />
                      )}
                    </div>
                    <TeamIcon />
                    <span className="truncate flex-1 font-medium text-[11px] uppercase">{team.name}</span>
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

export default TeamMultiSelector;

