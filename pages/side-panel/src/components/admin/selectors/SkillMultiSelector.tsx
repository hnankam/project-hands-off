import * as React from 'react';
import { useState, useRef } from 'react';
import { cn } from '@extension/ui';
import { useClickOutside, useDropdownPosition } from '../hooks';
import { SkillIcon, ChevronDownIcon, CloseIcon } from '../icons';
import { CheckmarkIcon } from '../icons/CheckIcon';
import { SelectorSkeleton } from '../skeletons';

export interface SkillOption {
  id: string;
  skillKey: string;
  name: string;
  enabled?: boolean;
}

export interface SkillMultiSelectorProps {
  isLight: boolean;
  skills: SkillOption[];
  selectedSkillIds: string[];
  onChange: (skillIds: string[]) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

export const SkillMultiSelector: React.FC<SkillMultiSelectorProps> = ({
  isLight,
  skills,
  selectedSkillIds,
  onChange,
  placeholder = 'Select skills...',
  allowEmpty = true,
  disabled = false,
  loading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownPosition = useDropdownPosition(buttonRef, isOpen);

  useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);

  if (loading) {
    return <SelectorSkeleton isLight={isLight} />;
  }

  if (disabled) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] border opacity-60',
          isLight ? 'bg-white border-gray-300 text-gray-500' : 'bg-[#151C24] border-gray-600 text-gray-400',
        )}
      >
        <span className="flex-shrink-0 mt-0.5">
          <SkillIcon />
        </span>
        <span className="truncate flex-1 text-left">{placeholder}</span>
      </div>
    );
  }

  const toggleSkill = (skillId: string) => {
    if (selectedSkillIds.includes(skillId)) {
      const newSelection = selectedSkillIds.filter((id) => id !== skillId);
      if (allowEmpty || newSelection.length > 0) {
        onChange(newSelection);
      }
    } else {
      onChange([...selectedSkillIds, skillId]);
    }
  };

  const removeSkill = (skillId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = selectedSkillIds.filter((id) => id !== skillId);
    if (allowEmpty || newSelection.length > 0) {
      onChange(newSelection);
    }
  };

  const selectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(skills.map((s) => s.id));
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allowEmpty) {
      onChange([]);
    }
  };

  const selectedSkills = skills.filter((skill) => selectedSkillIds.includes(skill.id));

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
        <span className="flex-shrink-0 mt-0.5">
          <SkillIcon />
        </span>

        {selectedSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedSkills.map((skill) => (
              <span
                key={skill.id}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                  isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-400',
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {skill.name || skill.skillKey}
                <button
                  type="button"
                  onClick={(e) => removeSkill(skill.id, e)}
                  className={cn(
                    'hover:bg-black/10 rounded-full p-0.5 transition-colors',
                    isLight ? 'text-blue-600' : 'text-blue-300',
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
            'absolute left-0 w-full min-w-[180px] rounded-md border shadow-lg z-[9999] max-h-[280px] overflow-hidden',
            dropdownPosition === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
            isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
          )}
        >
          {/* Header with Select All / Clear */}
          <div
            className={cn(
              'flex items-center justify-between px-3 py-2 border-b text-xs font-medium',
              isLight
                ? 'bg-gray-50 border-gray-200 text-gray-600'
                : 'bg-[#0D1117] border-gray-700 text-gray-400',
            )}
          >
            <span>
              {selectedSkillIds.length} of {skills.length} selected
            </span>
            <div className="flex gap-2">
              {selectedSkillIds.length < skills.length && (
                <button
                  type="button"
                  onClick={selectAll}
                  className={cn(
                    'hover:underline',
                    isLight ? 'text-blue-600' : 'text-blue-400',
                  )}
                >
                  Select All
                </button>
              )}
              {selectedSkillIds.length > 0 && allowEmpty && (
                <button
                  type="button"
                  onClick={clearAll}
                  className={cn(
                    'hover:underline',
                    isLight ? 'text-red-600' : 'text-red-400',
                  )}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Skill List */}
          <div className="overflow-y-auto max-h-[220px]">
            {skills.length === 0 ? (
              <div
                className={cn(
                  'px-3 py-6 text-center text-xs',
                  isLight ? 'text-gray-500' : 'text-gray-400',
                )}
              >
                No skills available
              </div>
            ) : (
              skills.map((skill) => {
                const isSelected = selectedSkillIds.includes(skill.id);
                return (
                  <button
                    type="button"
                    key={skill.id}
                    onClick={() => toggleSkill(skill.id)}
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
                            : 'border-gray-600',
                      )}
                    >
                      {isSelected && (
                        <CheckmarkIcon size={10} strokeWidth={3} className="text-white" />
                      )}
                    </div>
                    <SkillIcon size={14} className="flex-shrink-0" />
                    <span className="truncate flex-1">{skill.name || skill.skillKey}</span>
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

export default SkillMultiSelector;
