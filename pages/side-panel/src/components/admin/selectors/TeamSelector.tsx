import * as React from 'react';
import { useRef, useState } from 'react';
import { cn } from '@extension/ui';
import { useClickOutside, useDropdownPosition } from '../hooks';
import { TeamIcon, ChevronDownIcon, CheckIcon, CloseIcon } from '../icons';
import { CheckmarkIcon } from '../icons/CheckIcon';
import type { Team } from '../types';

export interface TeamSelectorProps {
  isLight: boolean;
  teams: Team[];
  selectedTeamIds: string[];
  onTeamChange: (teamIds: string[]) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}

export const TeamSelector: React.FC<TeamSelectorProps> = ({
  isLight,
  teams,
  selectedTeamIds,
  onTeamChange,
  placeholder = 'Select teams',
  allowEmpty = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);

  const toggleTeam = (teamId: string) => {
    const newSelection = selectedTeamIds.includes(teamId)
      ? selectedTeamIds.filter(id => id !== teamId)
      : [...selectedTeamIds, teamId];
    onTeamChange(newSelection);
  };

  const removeTeam = (teamId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = selectedTeamIds.filter(id => id !== teamId);
    onTeamChange(newSelection);
  };

  const selectedTeams = teams.filter(team => selectedTeamIds.includes(team.id));

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
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-blue-900/30 text-blue-400'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {team.name}
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

      {isOpen && (
        <div
          className={cn(
            'absolute top-full left-0 mt-1 w-full min-w-[180px] rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
            isLight
              ? 'bg-white border-gray-200'
              : 'bg-[#151C24] border-gray-700'
          )}
        >
          {teams.map(team => {
            const isSelected = selectedTeamIds.includes(team.id);
            return (
              <button
                type="button"
                key={team.id}
                onClick={() => toggleTeam(team.id)}
                className={cn(
                  'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors',
                  isLight
                    ? 'text-gray-700 hover:bg-gray-100'
                    : 'text-gray-200 hover:bg-gray-700'
                )}
              >
                <div className={cn(
                  'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                  isSelected
                    ? 'bg-blue-600 border-blue-600'
                    : isLight
                    ? 'border-gray-300'
                    : 'border-gray-600'
                )}>
                  {isSelected && (
                    <CheckmarkIcon size={10} strokeWidth={3} className="text-white" />
                  )}
                </div>
                <TeamIcon />
                <span className="truncate flex-1 text-left text-[11px] uppercase">{team.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export interface SingleTeamSelectorProps {
  isLight: boolean;
  teams: Team[];
  selectedTeamId: string;
  onTeamChange: (teamId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
}

export const SingleTeamSelector: React.FC<SingleTeamSelectorProps> = ({
  isLight,
  teams,
  selectedTeamId,
  onTeamChange,
  placeholder = 'Select team',
  disabled = false,
  allowEmpty = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownPosition = useDropdownPosition(buttonRef, isOpen);

  useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);

  const selectedTeam = teams.find(team => team.id === selectedTeamId);

  if (disabled) {
    return (
      <div
        className={cn(
          'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] border opacity-60',
          isLight ? 'bg-white border-gray-300 text-gray-500' : 'bg-[#151C24] border-gray-600 text-gray-400',
        )}
      >
        <span className="flex-1 truncate text-left">{selectedTeam ? selectedTeam.name : placeholder}</span>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div
        className={cn(
          'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] border opacity-50',
          isLight ? 'bg-white border-gray-300 text-gray-500' : 'bg-[#151C24] border-gray-600 text-gray-400',
        )}
      >
        <span className="flex-1 truncate text-left">No teams available</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] min-w-0 w-full border',
          isLight
            ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
            : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
        )}
      >
        <span className={cn('font-medium truncate flex-1 min-w-0 text-left', selectedTeam && 'text-[11px] uppercase')}>
          {selectedTeam ? selectedTeam.name : placeholder}
        </span>
        <ChevronDownIcon isOpen={isOpen} className="flex-shrink-0 mt-0.5" />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute left-0 w-full min-w-[180px] rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
            dropdownPosition === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
            isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
          )}
        >
          {allowEmpty && (
            <button
              type="button"
              onClick={() => {
                onTeamChange('');
                setIsOpen(false);
              }}
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors',
                !selectedTeam ? (isLight ? 'bg-blue-50 text-blue-700 font-medium' : 'bg-blue-900/30 text-blue-300 font-medium') : isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700',
              )}
            >
              <span className="flex-shrink-0">
                <CloseIcon size={12} strokeWidth={2} />
              </span>
              <span className="truncate flex-1 text-left">No team</span>
            </button>
          )}
          {teams.map(team => (
            <button
              type="button"
              key={team.id}
              onClick={() => {
                onTeamChange(team.id);
                setIsOpen(false);
              }}
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors',
                selectedTeamId === team.id
                  ? isLight
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'bg-blue-900/30 text-blue-300 font-medium'
                  : isLight
                    ? 'text-gray-700 hover:bg-gray-100'
                    : 'text-gray-200 hover:bg-gray-700',
              )}
            >
              <span className="truncate flex-1 text-left text-[11px] uppercase">{team.name}</span>
              {selectedTeamId === team.id && (
                <CheckIcon className="ml-auto flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamSelector;

