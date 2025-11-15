/**
 * Support Request Modal Component
 * 
 * Modal for submitting support tickets.
 */

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@extension/ui';
import { authClient } from '../lib/auth-client';
import { useAuth } from '../context/AuthContext';

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
  const { organization } = useAuth();

  const [formData, setFormData] = useState<SupportRequestData>({
    subject: '',
    priority: '',
    team: userTeam,
    email: userEmail,
    organization: userOrganization,
    problemDescription: '',
    attachments: [],
    consent: false,
  });

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

  // Load organizations and teams when modal opens
  useEffect(() => {
    if (isOpen) {
      loadOrganizations();
      if (organization?.id) {
        setSelectedOrgId(organization.id);
        loadTeams(organization.id);
      }
    }
  }, [isOpen, organization?.id]);

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
      team: '' // Reset team when org changes
    });
    setOrgDropdownOpen(false);
    loadTeams(orgId);
  };

  const handleSubmit = () => {
    if (!formData.subject.trim() || !formData.email.trim() || !formData.problemDescription.trim() || !formData.consent) {
      return;
    }
    onSubmit(formData);
  };

  const handleClose = () => {
    setFormData({
      subject: '',
      priority: '',
      team: userTeam,
      email: userEmail,
      organization: userOrganization,
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

  const isFormValid = formData.subject.trim() && formData.email.trim() && formData.problemDescription.trim() && formData.consent;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <div
          className={cn(
            'w-full max-w-2xl rounded-lg shadow-xl max-h-[90vh] overflow-y-auto',
            isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
          )}
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div
            className={cn(
              'flex items-center justify-between border-b px-3 py-2 sticky top-0 z-10',
              isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
            )}>
            <h2 className={cn('text-sm font-semibold', mainTextColor)}>
              Create support ticket
            </h2>
            <button
              onClick={handleClose}
              className={cn(
                'rounded-md p-0.5 transition-colors',
                isLight
                  ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
              )}>
              <svg
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4 px-3 py-4">
            {/* Info Banner */}
            <div
              className={cn(
                'rounded-md px-3 py-2 flex items-start gap-2',
                isLight ? 'bg-blue-50' : 'bg-blue-900/20',
              )}>
              <svg
                className={cn('h-4 w-4 flex-shrink-0 mt-0.5', isLight ? 'text-blue-600' : 'text-blue-400')}
                fill="currentColor"
                viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              <p className={cn('text-xs', isLight ? 'text-blue-900' : 'text-blue-200')}>
                As a result of your inquiry, you may receive a response to your contact email from the address support@handsoff.com.
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
                      'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] w-full border',
                      orgsLoading && 'opacity-50 cursor-not-allowed',
                      isLight
                        ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
                        : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]'
                    )}
                  >
                    <span className="font-medium truncate flex-1 text-left">
                      {orgsLoading ? 'Loading...' : formData.organization || 'Select organization'}
                    </span>
                    <svg
                      className={cn('transition-transform flex-shrink-0 mt-0.5', orgDropdownOpen ? 'rotate-180' : '')}
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

                  {orgDropdownOpen && !orgsLoading && (
                    <div
                      className={cn(
                        'absolute top-full left-0 mt-1 w-full rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
                        isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
                      )}
                    >
                      {organizations.map((org) => (
                        <button
                          type="button"
                          key={org.id}
                          onClick={() => handleOrgChange(org.id)}
                          className={cn(
                            'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors text-left',
                            formData.organization === org.name
                              ? isLight
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'bg-blue-900/30 text-blue-300 font-medium'
                              : isLight
                                ? 'text-gray-700 hover:bg-gray-100'
                                : 'text-gray-200 hover:bg-gray-700'
                          )}
                        >
                          <span className="truncate flex-1">{org.name}</span>
                          {formData.organization === org.name && (
                            <svg className="ml-auto flex-shrink-0" width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
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
                    'w-full rounded-md border px-2 py-1.5 text-xs min-h-[32px] transition-colors',
                    isLight
                      ? 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                      : 'border-gray-700 bg-gray-800 text-gray-400 cursor-not-allowed'
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
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Required"
                className={cn(
                  'w-full rounded-md border px-3 py-1.5 text-sm transition-colors',
                  'focus:outline-none focus:ring-2',
                  isLight
                    ? 'border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500/20'
                    : 'border-gray-600 bg-[#0D1117] text-gray-100 placeholder-gray-500 focus:border-blue-400 focus:ring-blue-400/20'
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
                      'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] w-full border',
                      teamsLoading && 'opacity-50 cursor-not-allowed',
                      isLight
                        ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
                        : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]'
                    )}
                  >
                    <span className="font-medium truncate flex-1 text-left">
                      {teamsLoading 
                        ? 'Loading teams...' 
                        : formData.team 
                          ? teams.find(t => t.id === formData.team)?.name || 'Select team'
                          : 'Select team'
                      }
                    </span>
                    <svg
                      className={cn('transition-transform flex-shrink-0 mt-0.5', teamDropdownOpen ? 'rotate-180' : '')}
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

                  {teamDropdownOpen && !teamsLoading && (
                    <div
                      className={cn(
                        'absolute top-full left-0 mt-1 w-full rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
                        isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
                      )}
                    >
                      {teams.length === 0 ? (
                        <div className={cn('px-2.5 py-1.5 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          No teams available
                        </div>
                      ) : (
                        teams.map((team) => (
                          <button
                            type="button"
                            key={team.id}
                            onClick={() => {
                              setFormData({ ...formData, team: team.id });
                              setTeamDropdownOpen(false);
                            }}
                            className={cn(
                              'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors text-left',
                              formData.team === team.id
                                ? isLight
                                  ? 'bg-blue-50 text-blue-700 font-medium'
                                  : 'bg-blue-900/30 text-blue-300 font-medium'
                                : isLight
                                  ? 'text-gray-700 hover:bg-gray-100'
                                  : 'text-gray-200 hover:bg-gray-700'
                            )}
                          >
                            <span className="truncate flex-1">{team.name}</span>
                            {formData.team === team.id && (
                              <svg className="ml-auto flex-shrink-0" width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
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
                      'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] w-full border',
                      isLight
                        ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
                        : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]'
                    )}
                  >
                    <span className="font-medium truncate flex-1 text-left">
                      {formData.priority 
                        ? formData.priority.charAt(0).toUpperCase() + formData.priority.slice(1)
                        : 'Select priority'
                      }
                    </span>
                    <svg
                      className={cn('transition-transform flex-shrink-0 mt-0.5', priorityDropdownOpen ? 'rotate-180' : '')}
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

                  {priorityDropdownOpen && (
                    <div
                      className={cn(
                        'absolute top-full left-0 mt-1 w-full rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
                        isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
                      )}
                    >
                      {[
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' },
                        { value: 'critical', label: 'Critical' }
                      ].map((priority) => (
                        <button
                          type="button"
                          key={priority.value}
                          onClick={() => {
                            setFormData({ ...formData, priority: priority.value });
                            setPriorityDropdownOpen(false);
                          }}
                          className={cn(
                            'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors text-left',
                            formData.priority === priority.value
                              ? isLight
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'bg-blue-900/30 text-blue-300 font-medium'
                              : isLight
                                ? 'text-gray-700 hover:bg-gray-100'
                                : 'text-gray-200 hover:bg-gray-700'
                          )}
                        >
                          <span className="truncate flex-1">{priority.label}</span>
                          {formData.priority === priority.value && (
                            <svg className="ml-auto flex-shrink-0" width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
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
              <textarea
                value={formData.problemDescription}
                onChange={(e) => setFormData({ ...formData, problemDescription: e.target.value })}
                placeholder="Please provide a detailed description of the problem"
                rows={6}
                className={cn(
                  'w-full rounded-md border px-3 py-2 text-sm transition-colors resize-none',
                  'focus:outline-none focus:ring-2',
                  isLight
                    ? 'border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500/20'
                    : 'border-gray-600 bg-[#0D1117] text-gray-100 placeholder-gray-500 focus:border-blue-400 focus:ring-blue-400/20'
                )}
              />
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <label className={cn('block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Attachments
              </label>
              <div>
                <input
                  type="file"
                  id="file-upload"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="file-upload"
                  className={cn(
                    'flex items-center justify-center gap-2 w-full rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                    isLight
                      ? 'bg-gray-200 hover:bg-gray-300'
                      : 'bg-gray-700 hover:bg-gray-600'
                  )}
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add files
                </label>
              </div>
              {formData.attachments.length > 0 && (
                <div className="space-y-1 mt-2">
                  {formData.attachments.map((file, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex items-center justify-between px-3 py-1.5 rounded-md text-xs',
                        isLight ? 'bg-gray-100' : 'bg-gray-800'
                      )}>
                      <span className={cn('truncate', isLight ? 'text-gray-700' : 'text-gray-300')}>
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className={cn(
                          'ml-2 flex-shrink-0 text-red-600 hover:text-red-700 transition-colors',
                          !isLight && 'text-red-400 hover:text-red-300'
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
                onChange={(e) => setFormData({ ...formData, consent: e.target.checked })}
                className={cn(
                  'mt-0.5 h-4 w-4 rounded border transition-colors cursor-pointer',
                  isLight
                    ? 'border-gray-300 bg-white checked:bg-blue-600 checked:border-blue-600'
                    : 'border-gray-600 bg-[#0D1117] checked:bg-blue-600 checked:border-blue-600'
                )}
              />
              <label
                htmlFor="consent"
                className={cn('text-xs cursor-pointer', isLight ? 'text-gray-700' : 'text-gray-300')}>
                I consent to Hands-Off support team accessing my account information to help resolve this support case <span className="text-red-500">*</span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div
            className={cn(
              'flex items-center justify-end gap-2 border-t px-3 py-2 sticky bottom-0',
              isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
            )}>
            <button
              onClick={handleClose}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isLight
                  ? 'bg-gray-200 hover:bg-gray-300'
                  : 'bg-gray-700 hover:bg-gray-600',
              )}
              style={{ color: isLight ? '#374151' : '#bcc1c7' }}
            >
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
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed',
              )}>
              Submit support ticket
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

