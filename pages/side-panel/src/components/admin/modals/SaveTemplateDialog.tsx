/**
 * SaveTemplateDialog
 * 
 * A dialog for saving agent prompts as templates.
 * Used in AgentsTab for template management.
 */

import React from 'react';
import { cn } from '@extension/ui';
import { Radio } from '../form-controls/Radio';
import { TeamMultiSelector } from '../selectors/TeamMultiSelector';

export interface TemplateFormData {
  key: string;
  description: string;
  scope: 'organization' | 'team';
  teamIds: string[];
}

export interface Team {
  id: string;
  name: string;
  organizationId: string;
}

export interface SaveTemplateDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Called when the dialog should close */
  onClose: () => void;
  /** Called when the template should be saved */
  onSave: () => void;
  /** Current form data */
  formData: TemplateFormData;
  /** Called when form data changes */
  onFormChange: (data: TemplateFormData) => void;
  /** Available teams for selection */
  teams: Team[];
  /** Light/dark theme */
  isLight: boolean;
  /** Loading state */
  isLoading?: boolean;
}

const Z_INDEX = {
  backdrop: 10000,
  modal: 10001,
} as const;

export const SaveTemplateDialog: React.FC<SaveTemplateDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  formData,
  onFormChange,
  teams,
  isLight,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const mainTextColor = isLight ? 'text-gray-700' : 'text-gray-300';

  const updateField = <K extends keyof TemplateFormData>(
    field: K,
    value: TemplateFormData[K]
  ) => {
    onFormChange({ ...formData, [field]: value });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        style={{ zIndex: Z_INDEX.backdrop }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: Z_INDEX.modal }}
      >
        <div
          className={cn(
            'w-full max-w-sm rounded-lg shadow-xl',
            isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
          )}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className={cn(
              'flex items-center justify-between border-b px-4 py-3',
              isLight ? 'border-gray-200' : 'border-gray-700',
            )}
          >
            <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
              Save as Template
            </h2>
            <button
              onClick={onClose}
              className={cn(
                'rounded-md p-0.5 transition-colors',
                isLight ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
              )}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="space-y-3 px-4 py-4">
            {/* Template Key */}
            <div>
              <label className={cn('block text-xs font-medium mb-1', mainTextColor)}>
                Template Key
              </label>
              <input
                type="text"
                value={formData.key}
                onChange={e => updateField('key', e.target.value)}
                placeholder="e.g., helpful-assistant"
                required
                className={cn(
                  'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                  isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                )}
              />
            </div>

            {/* Description */}
            <div>
              <label className={cn('block text-xs font-medium mb-1', mainTextColor)}>
                Description (optional)
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={e => updateField('description', e.target.value)}
                className={cn(
                  'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500 resize-y',
                  isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                )}
              />
            </div>

            {/* Scope & Teams */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={cn('block text-xs font-medium mb-1', mainTextColor)}>
                  Scope
                </label>
                <div className="flex items-center gap-4">
                  <Radio
                    name="template-scope"
                    value="organization"
                    checked={formData.scope === 'organization'}
                    onChange={() => updateField('scope', 'organization')}
                    label="Organization"
                    isLight={isLight}
                  />
                  <Radio
                    name="template-scope"
                    value="team"
                    checked={formData.scope === 'team'}
                    onChange={() => updateField('scope', 'team')}
                    label="Team"
                    isLight={isLight}
                  />
                </div>
              </div>
              <div>
                <label className={cn('block text-xs font-medium mb-1', mainTextColor)}>
                  Teams (optional)
                </label>
                <TeamMultiSelector
                  isLight={isLight}
                  teams={teams}
                  selectedTeamIds={formData.teamIds}
                  onTeamChange={(value: string[]) => updateField('teamIds', value)}
                  placeholder="Select teams"
                  disabled={formData.scope !== 'team'}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={cn('flex items-center justify-end gap-2 border-t px-4 py-3', isLight ? 'border-gray-200' : 'border-gray-700')}>
            <button
              onClick={onClose}
              disabled={isLoading}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isLight ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                'disabled:opacity-50',
              )}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={isLoading || !formData.key.trim()}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors bg-blue-600/90 text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SaveTemplateDialog;

