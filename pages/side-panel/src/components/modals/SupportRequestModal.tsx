/**
 * Support Request Modal Component
 *
 * Modal for submitting support tickets.
 */

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@extension/ui';
import { authClient } from '../../lib/auth-client';
import { useAuth } from '../../context/AuthContext';
import { RichTextEditor } from '../admin/editors';
import { ModalCloseButton } from './ModalCloseButton';

interface SupportRequestModalProps {
  isLight: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: SupportRequestData) => void;
  userEmail?: string;
  userOrganization?: string;
  userTeam?: string;
  availableTeams?: string[];
}

export interface SupportRequestData {
  subject: string;
  priority: string;
  team: string;
  email: string;
  organization: string;
  problemDescription: string;
  attachments: File[];
  consent: boolean;
}

export default function SupportRequestModal({
  isLight,
  isOpen,
  onClose,
  onSubmit,
  userEmail = '',
  userOrganization = '',
  userTeam = '',
  availableTeams = [],
}: SupportRequestModalProps) {
  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';
  const { user, organization } = useAuth();

  const [formData, setFormData] = useState<SupportRequestData>({
    subject: '',
    priority: '',
    team: userTeam,
    email: userEmail || user?.email || '',
    organization: userOrganization,
    problemDescription: '',
    attachments: [],
    consent: false,
  });

  // Update email from user context when it becomes available
  useEffect(() => {
    if (user?.email && !formData.email) {
      setFormData(prev => ({ ...prev, email: user.email }));
    }
  }, [user?.email]);

  // Track selected organization ID separately for loading teams
  const [selectedOrgId, setSelectedOrgId] = useState<string>(organization?.id || '');

  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  // Dropdown open states
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);

  // Refs for click outside detection
  const orgDropdownRef = useRef<HTMLDivElement>(null);
  const teamDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

  // Load organizations and teams when modal opens, and set initial values
  useEffect(() => {
    if (isOpen) {
      loadOrganizations();
      // Set email from user context
      if (user?.email && !formData.email) {
        setFormData(prev => ({ ...prev, email: user.email }));
      }
      // Set organization from context
      if (organization?.id) {
        setSelectedOrgId(organization.id);
        setFormData(prev => ({
          ...prev,
          organization: organization.name || organization.slug || organization.id,
        }));
        loadTeams(organization.id);
      }
    }
  }, [isOpen, organization?.id, user?.email]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(event.target as Node)) {
        setOrgDropdownOpen(false);
      }
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(event.target as Node)) {
        setTeamDropdownOpen(false);
      }
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target as Node)) {
        setPriorityDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadOrganizations = async () => {
    setOrgsLoading(true);
    try {
      const { data, error } = await authClient.organization.list();

      if (error) throw new Error(error.message);

      const orgsList = (data || []).map((org: any) => ({
        id: org.id,
        name: org.name || org.slug || org.id,
      }));

      setOrganizations(orgsList);
    } catch (err) {
      console.error('[SupportRequestModal] Failed to load organizations:', err);
      setOrganizations([]);
    } finally {
      setOrgsLoading(false);
    }
  };

  const loadTeams = async (orgId: string) => {
    if (!orgId) return;

    setTeamsLoading(true);
    try {
      const { data, error } = await (authClient.organization as any).listTeams({
        query: { organizationId: orgId },
      });

      if (error) throw new Error(error.message);

      const teamsList = (data || []).map((team: any) => ({
        id: team.id,
        name: team.name || team.id,
      }));

      setTeams(teamsList);
    } catch (err) {
      console.error('[SupportRequestModal] Failed to load teams:', err);
      setTeams([]);
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleOrgChange = (orgId: string) => {
    const selectedOrg = organizations.find(o => o.id === orgId);
    setSelectedOrgId(orgId);
    setFormData({
      ...formData,
      organization: selectedOrg?.name || '',
      team: '', // Reset team when org changes
    });
    setOrgDropdownOpen(false);
    loadTeams(orgId);
  };

  const handleSubmit = () => {
    if (
      !formData.subject.trim() ||
      !formData.email.trim() ||
      !formData.problemDescription.trim() ||
      !formData.consent
    ) {
      return;
    }
    onSubmit(formData);
  };

  const handleClose = () => {
    setFormData({
      subject: '',
      priority: '',
      team: userTeam,
      email: userEmail || user?.email || '',
      organization: userOrganization || organization?.name || '',
      problemDescription: '',
      attachments: [],
      consent: false,
    });
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFormData({ ...formData, attachments: Array.from(e.target.files) });
    }
  };

  const removeAttachment = (index: number) => {
    setFormData({
      ...formData,
      attachments: formData.attachments.filter((_, i) => i !== index),
    });
  };

  const isFormValid =
    formData.subject.trim() && formData.email.trim() && formData.problemDescription.trim() && formData.consent;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <div
          className={cn(
            'max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg shadow-xl',
            isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
          )}
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div
            className={cn(
              'sticky top-0 z-10 flex items-center justify-between border-b px-3 py-2',
              isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
            )}>
            <h2 className={cn('text-sm font-semibold', mainTextColor)}>Create support ticket</h2>
            <ModalCloseButton onClick={handleClose} isLight={isLight} />
          </div>

          {/* Content */}
          <div className="space-y-4 px-5 py-4">
            {/* Info Banner */}
            <div
              className={cn('flex items-start gap-2 rounded-md px-3 py-2', isLight ? 'bg-blue-50' : 'bg-blue-900/20')}>
              <svg
                className={cn('mt-0.5 h-4 w-4 flex-shrink-0', isLight ? 'text-blue-600' : 'text-blue-400')}
                fill="currentColor"
                viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              <p className={cn('text-xs', isLight ? 'text-blue-900' : 'text-blue-200')}>
                As a result of your inquiry, you may receive a response to your contact email from the address
                support@handsoff.com.
              </p>
            </div>

            {/* Row 1: Organization and Contact Email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className={cn('block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Organization
                </label>
                <div className="relative" ref={orgDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                    disabled={orgsLoading}
                    className={cn(
                      'flex min-h-[32px] w-full items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs',
                      orgsLoading && 'cursor-not-allowed opacity-50',
                      isLight
                        ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                        : 'border-gray-600 bg-[#151C24] text-gray-200 hover:bg-gray-700',
                    )}>
                    <span className="flex-1 truncate text-left font-medium">
                      {orgsLoading ? 'Loading...' : formData.organization || 'Select organization'}
                    </span>
                    <svg
                      className={cn('mt-0.5 flex-shrink-0 transition-transform', orgDropdownOpen ? 'rotate-180' : '')}
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round">
                      <path d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {orgDropdownOpen && !orgsLoading && (
                    <div
                      className={cn(
                        'absolute top-full left-0 z-[9999] mt-1 max-h-[240px] w-full overflow-y-auto rounded-md border shadow-lg',
                        isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]',
                      )}>
                      {organizations.map(org => (
                        <button
                          type="button"
                          key={org.id}
                          onClick={() => handleOrgChange(org.id)}
                          className={cn(
                            'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors',
                            formData.organization === org.name
                              ? isLight
                                ? 'bg-blue-50 font-medium text-blue-700'
                                : 'bg-blue-900/30 font-medium text-blue-300'
                              : isLight
                                ? 'text-gray-700 hover:bg-gray-100'
                                : 'text-gray-200 hover:bg-gray-700',
                          )}>
                          <span className="flex-1 truncate">{org.name}</span>
                          {formData.organization === org.name && (
                            <svg
                              className="ml-auto flex-shrink-0"
                              width="12"
                              height="12"
                              fill="currentColor"
                              viewBox="0 0 20 20">
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
              </div>

              <div className="space-y-2">
                <label className={cn('block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Your contact email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  disabled
                  className={cn(
                    'min-h-[32px] w-full rounded-md border px-2 py-1.5 text-xs transition-colors',
                    isLight
                      ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-600'
                      : 'cursor-not-allowed border-gray-700 bg-gray-800 text-gray-400',
                  )}
                />
              </div>
            </div>

            {/* Row 2: Subject */}
            <div className="space-y-2">
              <label className={cn('block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Subject <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.subject}
                onChange={e => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Required"
                className={cn(
                  'w-full rounded-md border px-3 py-1.5 text-sm transition-colors',
                  'focus:ring-2 focus:outline-none',
                  isLight
                    ? 'border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500/20'
                    : 'border-gray-600 bg-[#0D1117] text-gray-100 placeholder-gray-500 focus:border-blue-400 focus:ring-blue-400/20',
                )}
              />
            </div>

            {/* Row 3: Team and Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className={cn('block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Team
                </label>
                <div className="relative" ref={teamDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setTeamDropdownOpen(!teamDropdownOpen)}
                    disabled={teamsLoading}
                    className={cn(
                      'flex min-h-[32px] w-full items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs',
                      teamsLoading && 'cursor-not-allowed opacity-50',
                      isLight
                        ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                        : 'border-gray-600 bg-[#151C24] text-gray-200 hover:bg-gray-700',
                    )}>
                    <span className="flex-1 truncate text-left font-medium">
                      {teamsLoading
                        ? 'Loading teams...'
                        : formData.team
                          ? teams.find(t => t.id === formData.team)?.name || 'Select team'
                          : 'Select team'}
                    </span>
                    <svg
                      className={cn('mt-0.5 flex-shrink-0 transition-transform', teamDropdownOpen ? 'rotate-180' : '')}
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round">
                      <path d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {teamDropdownOpen && !teamsLoading && (
                    <div
                      className={cn(
                        'absolute top-full left-0 z-[9999] mt-1 max-h-[240px] w-full overflow-y-auto rounded-md border shadow-lg',
                        isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]',
                      )}>
                      {teams.length === 0 ? (
                        <div className={cn('px-2.5 py-1.5 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          No teams available
                        </div>
                      ) : (
                        teams.map(team => (
                          <button
                            type="button"
                            key={team.id}
                            onClick={() => {
                              setFormData({ ...formData, team: team.id });
                              setTeamDropdownOpen(false);
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors',
                              formData.team === team.id
                                ? isLight
                                  ? 'bg-blue-50 font-medium text-blue-700'
                                  : 'bg-blue-900/30 font-medium text-blue-300'
                                : isLight
                                  ? 'text-gray-700 hover:bg-gray-100'
                                  : 'text-gray-200 hover:bg-gray-700',
                            )}>
                            <span className="flex-1 truncate">{team.name}</span>
                            {formData.team === team.id && (
                              <svg
                                className="ml-auto flex-shrink-0"
                                width="12"
                                height="12"
                                fill="currentColor"
                                viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className={cn('block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Priority
                </label>
                <div className="relative" ref={priorityDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setPriorityDropdownOpen(!priorityDropdownOpen)}
                    className={cn(
                      'flex min-h-[32px] w-full items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs',
                      isLight
                        ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                        : 'border-gray-600 bg-[#151C24] text-gray-200 hover:bg-gray-700',
                    )}>
                    <span className="flex-1 truncate text-left font-medium">
                      {formData.priority
                        ? formData.priority.charAt(0).toUpperCase() + formData.priority.slice(1)
                        : 'Select priority'}
                    </span>
                    <svg
                      className={cn(
                        'mt-0.5 flex-shrink-0 transition-transform',
                        priorityDropdownOpen ? 'rotate-180' : '',
                      )}
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round">
                      <path d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {priorityDropdownOpen && (
                    <div
                      className={cn(
                        'absolute top-full left-0 z-[9999] mt-1 max-h-[240px] w-full overflow-y-auto rounded-md border shadow-lg',
                        isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]',
                      )}>
                      {[
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' },
                        { value: 'critical', label: 'Critical' },
                      ].map(priority => (
                        <button
                          type="button"
                          key={priority.value}
                          onClick={() => {
                            setFormData({ ...formData, priority: priority.value });
                            setPriorityDropdownOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors',
                            formData.priority === priority.value
                              ? isLight
                                ? 'bg-blue-50 font-medium text-blue-700'
                                : 'bg-blue-900/30 font-medium text-blue-300'
                              : isLight
                                ? 'text-gray-700 hover:bg-gray-100'
                                : 'text-gray-200 hover:bg-gray-700',
                          )}>
                          <span className="flex-1 truncate">{priority.label}</span>
                          {formData.priority === priority.value && (
                            <svg
                              className="ml-auto flex-shrink-0"
                              width="12"
                              height="12"
                              fill="currentColor"
                              viewBox="0 0 20 20">
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
              </div>
            </div>

            {/* Problem description */}
            <div className="space-y-2">
              <label className={cn('block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Problem description <span className="text-red-500">*</span>
              </label>
              <RichTextEditor
                value={formData.problemDescription}
                onChange={value => setFormData({ ...formData, problemDescription: value })}
                placeholder="Please provide a detailed description of the problem"
                isLight={isLight}
                minHeight="150px"
                maxHeight="250px"
              />
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <label className={cn('block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Attachments
              </label>
              <div>
                <input type="file" id="file-upload" multiple onChange={handleFileChange} className="hidden" />
                <label
                  htmlFor="file-upload"
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-700 hover:bg-gray-600',
                  )}
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add files
                </label>
              </div>
              {formData.attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {formData.attachments.map((file, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex items-center justify-between rounded-md px-3 py-1.5 text-xs',
                        isLight ? 'bg-gray-100' : 'bg-gray-800',
                      )}>
                      <span className={cn('truncate', isLight ? 'text-gray-700' : 'text-gray-300')}>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className={cn(
                          'ml-2 flex-shrink-0 text-red-600 transition-colors hover:text-red-700',
                          !isLight && 'text-red-400 hover:text-red-300',
                        )}>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Consent Checkbox */}
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="consent"
                checked={formData.consent}
                onChange={e => setFormData({ ...formData, consent: e.target.checked })}
                className={cn(
                  'mt-0.5 h-4 w-4 cursor-pointer rounded border transition-colors',
                  isLight
                    ? 'border-gray-300 bg-white checked:border-blue-600 checked:bg-blue-600'
                    : 'border-gray-600 bg-[#0D1117] checked:border-blue-600 checked:bg-blue-600',
                )}
              />
              <label
                htmlFor="consent"
                className={cn('cursor-pointer text-xs', isLight ? 'text-gray-700' : 'text-gray-300')}>
                I consent to Hands-Off support team accessing my account information to help resolve this support case{' '}
                <span className="text-red-500">*</span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div
            className={cn(
              'sticky bottom-0 flex items-center justify-end gap-2 border-t px-5 py-2',
              isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
            )}>
            <button
              onClick={handleClose}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isLight ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-700 hover:bg-gray-600',
              )}
              style={{ color: isLight ? '#374151' : '#bcc1c7' }}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isFormValid}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isFormValid
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : isLight
                    ? 'cursor-not-allowed bg-gray-300 text-gray-500'
                    : 'cursor-not-allowed bg-gray-700 text-gray-500',
              )}>
              Submit support ticket
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
