import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@extension/ui';
import { authClient } from '../../lib/auth-client';
import { OrganizationSelector, TeamMultiSelector, SkillResourceListEditor } from './selectors';
import { Radio, Checkbox } from './form-controls';
import { CodeMirrorJsonEditor } from './editors';
import { GitConfigForm, gitConfigFieldsToApi, parseGitConfigToFields, INITIAL_GIT_CONFIG } from './GitConfigForm';
import { AdminConfirmDialog } from './modals';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';
import { SkillIcon } from './icons';
import { API_CONFIG } from '../../constants';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: any;
  createdAt: string | Date;
}

interface Team {
  id: string;
  name: string;
  organizationId: string;
}

interface SkillRecord {
  id: string;
  skillKey: string;
  name: string;
  description: string | null;
  sourceType: 'manual' | 'git';
  content: string | null;
  metadata: Record<string, any>;
  gitConfig: Record<string, any> | null;
  organizationId: string;
  teams: Array<{ id: string; name: string }>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type SkillScope = 'organization' | 'team';

interface SkillFormState {
  sourceType: 'manual' | 'git';
  skillKey: string;
  name: string;
  description: string;
  content: string;
  metadata: string;
  resources: Array<{ name: string; content: string }>;
  gitConfig: import('./GitConfigForm').GitConfigFields;
  scope: SkillScope;
  teamIds: string[];
  enabled: boolean;
}

interface SkillsTabProps {
  isLight: boolean;
  organizations: Organization[];
  preselectedOrgId?: string;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const INITIAL_FORM: SkillFormState = {
  sourceType: 'manual',
  skillKey: '',
  name: '',
  description: '',
  content: '',
  metadata: '{}',
  resources: [],
  gitConfig: INITIAL_GIT_CONFIG,
  scope: 'organization',
  teamIds: [],
  enabled: true,
};

const sanitizeJsonText = (text: string, label: string): Record<string, any> => {
  if (!text || !text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    throw new Error(`Invalid ${label} JSON`);
  }
};

const SkillSkeletonCard: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div
    className={cn(
      'p-4 rounded-lg border transition-all',
      isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
    )}
  >
    <div className="flex items-start gap-3 animate-pulse">
      <div className={cn('w-8 h-8 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
      <div className="flex-1 space-y-3">
        <div className={cn('h-3 w-2/5 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className="flex gap-2">
          <div className={cn('h-2.5 w-16 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
          <div className={cn('h-2.5 w-24 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
        </div>
        <div className={cn('h-10 rounded', isLight ? 'bg-gray-50' : 'bg-gray-900/40')} />
      </div>
      <div className="flex gap-1">
        <div className={cn('h-6 w-6 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className={cn('h-6 w-6 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
      </div>
    </div>
  </div>
);

const SkillMoreOptionsButton: React.FC<{
  skill: SkillRecord;
  isLight: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClone: () => void;
  onDelete: () => void;
}> = ({ skill, isLight, isOpen, onToggle, onClone, onDelete }) => {
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && moreButtonRef.current && moreDropdownRef.current) {
      requestAnimationFrame(() => {
        if (moreButtonRef.current && moreDropdownRef.current) {
          const buttonRect = moreButtonRef.current.getBoundingClientRect();
          const top = buttonRect.bottom + 4;
          const right = window.innerWidth - buttonRect.right;
          moreDropdownRef.current.style.top = `${top}px`;
          moreDropdownRef.current.style.right = `${right}px`;
        }
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const element = target as Element;
      const clickedInsideButton = moreButtonRef.current?.contains(target);
      const clickedInsideDropdown = moreDropdownRef.current?.contains(target);
      const isButton = element.tagName === 'BUTTON' || element.closest('button');
      if (!clickedInsideButton && !clickedInsideDropdown && !isButton) {
        onToggle();
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isOpen, onToggle]);

  const buttonClassName = cn(
    'p-1 rounded transition-colors',
    isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300',
  );

  const dropdownStyles: React.CSSProperties = {
    position: 'fixed',
    top: '0px',
    right: '0px',
    marginTop: '0',
    backgroundColor: isLight ? '#f9fafb' : '#151C24',
    border: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
    borderRadius: '6px',
    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
    zIndex: 10002,
    minWidth: '160px',
    maxWidth: '200px',
    width: 'auto',
    overflow: 'visible',
    visibility: 'visible',
    opacity: 1,
    pointerEvents: 'auto',
  };

  const menuItemBaseStyles: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '12px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  const menuItemTextColor = isLight ? '#374151' : '#d1d5db';
  const menuItemBorderColor = isLight ? '#e5e7eb' : '#374151';
  const menuItemHoverBg = isLight ? '#f3f4f6' : '#1f2937';

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    onToggle();
  };

  const handleClone = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onClone();
  };

  const handleDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete();
  };

  return (
    <>
      <button
        ref={moreButtonRef}
        className={buttonClassName}
        title="More options"
        onClick={handleClick}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="16"
          height="16"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={moreDropdownRef}
            className="skillMoreOptionsDropdownMenu"
            style={dropdownStyles}
          >
            <button
              type="button"
              onClick={handleClone}
              style={{
                ...menuItemBaseStyles,
                color: menuItemTextColor,
                borderBottom: `1px solid ${menuItemBorderColor}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = menuItemHoverBg;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="14"
                height="14"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Clone skill
            </button>
            <button
              type="button"
              onClick={handleDelete}
              style={{
                ...menuItemBaseStyles,
                color: menuItemTextColor,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = menuItemHoverBg;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="14"
                height="14"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete skill
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};

export function SkillsTab({ isLight, organizations, preselectedOrgId, onError, onSuccess }: SkillsTabProps) {
  const baseURL = API_CONFIG.BASE_URL;
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState(preselectedOrgId || '');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilterIds, setTeamFilterIds] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [createForm, setCreateForm] = useState<SkillFormState>(INITIAL_FORM);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SkillFormState | null>(null);
  const [openMoreMenuSkillId, setOpenMoreMenuSkillId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; skillKey: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [testStatus, setTestStatus] = useState<{ state: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({
    state: 'idle',
  });
  const [createInstructionsViewMode, setCreateInstructionsViewMode] = useState<'edit' | 'preview'>('edit');
  const [editInstructionsViewMode, setEditInstructionsViewMode] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    if (!selectedOrgId && organizations.length === 1) setSelectedOrgId(organizations[0].id);
  }, [organizations, selectedOrgId]);

  useEffect(() => {
    if (preselectedOrgId && preselectedOrgId !== selectedOrgId) setSelectedOrgId(preselectedOrgId);
  }, [preselectedOrgId]);

  const loadTeams = useCallback(async (orgId: string) => {
    setTeamsLoading(true);
    try {
      await (authClient.organization as any).setActive({ organizationId: orgId });
      const { data, error } = await (authClient.organization as any).listTeams({
        query: { organizationId: orgId },
      });
      if (error) throw new Error(error.message);
      const teamsForOrg = (data || []).filter((t: Team) => t.organizationId === orgId);
      setTeams(teamsForOrg);
      return teamsForOrg;
    } catch (err) {
      setTeams([]);
      return [];
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  const refreshSkills = useCallback(async () => {
    if (!selectedOrgId) return;
    setListLoading(true);
    try {
      const params = new URLSearchParams({ organizationId: selectedOrgId });
      if (teamFilterIds.length > 0) {
        teamFilterIds.forEach((id) => params.append('teamIds', id));
      }
      const res = await fetch(`${baseURL}/api/admin/skills?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load skills');
      const data = await res.json();
      setSkills(data.skills || []);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load skills');
      setSkills([]);
    } finally {
      setListLoading(false);
    }
  }, [selectedOrgId, teamFilterIds, baseURL, onError]);

  useEffect(() => {
    if (selectedOrgId) {
      loadTeams(selectedOrgId);
      refreshSkills();
    } else {
      setSkills([]);
    }
  }, [selectedOrgId, teamFilterIds, loadTeams, refreshSkills]);

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return skills;
    const query = searchQuery.toLowerCase();
    return skills.filter(
      (skill) =>
        skill.skillKey.toLowerCase().includes(query) ||
        skill.name.toLowerCase().includes(query) ||
        (skill.description && skill.description.toLowerCase().includes(query)),
    );
  }, [skills, searchQuery]);

  const resetCreateForm = () => {
    setCreateForm(INITIAL_FORM);
    setShowCreateForm(false);
    setIsCloning(false);
    setCreateInstructionsViewMode('edit');
  };

  const handleCreateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    if (!createForm.skillKey.trim()) {
      onError('Skill key is required');
      return;
    }
    if (!createForm.name.trim()) {
      onError('Name is required');
      return;
    }
    if (!createForm.description.trim()) {
      onError('Description is required');
      return;
    }
    if (createForm.sourceType === 'manual' && !createForm.content.trim()) {
      onError('Content is required for manual skills');
      return;
    }
    if (createForm.sourceType === 'git' && !createForm.gitConfig.repo_url.trim()) {
      onError('Repository URL is required for Git skills');
      return;
    }

    const metadata: Record<string, any> = {};
    try {
      Object.assign(metadata, sanitizeJsonText(createForm.metadata, 'Metadata'));
    } catch {
      onError('Invalid metadata JSON');
      return;
    }
    if (createForm.resources.length > 0) {
      metadata.resources = createForm.resources.filter((r) => r.name.trim() || r.content.trim());
    }

    const body: any = {
      organizationId: selectedOrgId,
      skillKey: createForm.skillKey.trim().toLowerCase().replace(/\s+/g, '-'),
      name: createForm.name.trim(),
      description: createForm.description.trim(),
      sourceType: createForm.sourceType,
      metadata,
      teamIds: createForm.scope === 'team' ? createForm.teamIds : [],
      enabled: createForm.enabled,
    };

    if (createForm.sourceType === 'manual') {
      body.content = createForm.content;
    } else {
      body.gitConfig = gitConfigFieldsToApi(createForm.gitConfig);
    }

    try {
      const res = await fetch(`${baseURL}/api/admin/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create skill');
      onSuccess(isCloning ? 'Skill cloned' : 'Skill created');
      resetCreateForm();
      refreshSkills();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create skill');
    }
  };

  const startEditSkill = (skill: SkillRecord) => {
    setEditInstructionsViewMode('edit');
    const metadata = skill.metadata || {};
    const resources = Array.isArray(metadata.resources) ? metadata.resources : [];
    const { resources: _, ...restMeta } = metadata;
    setEditingSkillId(skill.id);
    setEditForm({
      sourceType: skill.sourceType,
      skillKey: skill.skillKey,
      name: skill.name,
      description: skill.description || '',
      content: skill.content || '',
      metadata: JSON.stringify(restMeta, null, 2),
      resources,
      gitConfig: parseGitConfigToFields(skill.gitConfig || {}),
      scope: skill.teams.length > 0 ? 'team' : 'organization',
      teamIds: skill.teams.map((t) => t.id),
      enabled: skill.enabled,
    });
  };

  const handleUpdateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !editingSkillId || !editForm) return;
    if (!editForm.skillKey.trim() || !editForm.name.trim() || !editForm.description.trim()) {
      onError('Skill key, name, and description are required');
      return;
    }

    const metadata: Record<string, any> = {};
    try {
      Object.assign(metadata, sanitizeJsonText(editForm.metadata, 'Metadata'));
    } catch {
      onError('Invalid metadata JSON');
      return;
    }
    if (editForm.resources.length > 0) {
      metadata.resources = editForm.resources.filter((r) => r.name.trim() || r.content.trim());
    }

    const body: any = {
      organizationId: selectedOrgId,
      skillKey: editForm.skillKey.trim().toLowerCase().replace(/\s+/g, '-'),
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      sourceType: editForm.sourceType,
      content: editForm.sourceType === 'manual' ? editForm.content : undefined,
      metadata,
      gitConfig: editForm.sourceType === 'git' ? gitConfigFieldsToApi(editForm.gitConfig) : undefined,
      teamIds: editForm.scope === 'team' ? editForm.teamIds : [],
      enabled: editForm.enabled,
    };

    try {
      const res = await fetch(`${baseURL}/api/admin/skills/${editingSkillId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update skill');
      onSuccess('Skill updated');
      setEditingSkillId(null);
      setEditForm(null);
      refreshSkills();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update skill');
    }
  };

  const handleDeleteSkill = async () => {
    if (!deleteConfirm || !selectedOrgId) return;
    try {
      const res = await fetch(
        `${baseURL}/api/admin/skills/${deleteConfirm.id}?organizationId=${encodeURIComponent(selectedOrgId)}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete skill');
      }
      onSuccess('Skill deleted');
      setDeleteDialogOpen(false);
      setDeleteConfirm(null);
      refreshSkills();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete skill');
    }
  };

  const handleToggleEnabled = async (skill: SkillRecord) => {
    if (!selectedOrgId) return;
    try {
      const res = await fetch(`${baseURL}/api/admin/skills/${skill.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          organizationId: selectedOrgId,
          enabled: !skill.enabled,
        }),
      });
      if (!res.ok) throw new Error('Failed to update skill');
      refreshSkills();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update skill');
    }
  };

  const startCloneSkill = (skill: SkillRecord) => {
    setCreateInstructionsViewMode('edit');
    const metadata = skill.metadata || {};
    const resources = Array.isArray(metadata.resources) ? metadata.resources : [];
    const { resources: _, ...restMeta } = metadata;
    setCreateForm({
      sourceType: skill.sourceType,
      skillKey: `${skill.skillKey}-copy`,
      name: `${skill.name} (copy)`,
      description: skill.description || '',
      content: skill.content || '',
      metadata: JSON.stringify(restMeta, null, 2),
      resources,
      gitConfig: parseGitConfigToFields(skill.gitConfig || {}),
      scope: skill.teams.length > 0 ? 'team' : 'organization',
      teamIds: skill.teams.map((t) => t.id),
      enabled: skill.enabled,
    });
    setShowCreateForm(true);
    setIsCloning(true);
  };

  const handleTestGit = async (isEdit: boolean) => {
    const form = isEdit ? editForm : createForm;
    if (!form || form.sourceType !== 'git') return;
    const gitConfig = gitConfigFieldsToApi(form.gitConfig);
    if (!gitConfig.repo_url) {
      onError('Repository URL is required');
      return;
    }
    setTestStatus({ state: 'loading' });
    try {
      const url = isEdit && editingSkillId
        ? `${baseURL}/api/admin/skills/${editingSkillId}/test`
        : `${baseURL}/api/admin/skills/test-git`;
      const body = isEdit && editingSkillId
        ? { organizationId: selectedOrgId }
        : { organizationId: selectedOrgId, gitConfig };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Git test failed');
      setTestStatus({ state: 'success', message: data.message });
    } catch (err) {
      setTestStatus({ state: 'error', message: err instanceof Error ? err.message : 'Git test failed' });
    }
  };

  const renderScopeBadge = (skill: SkillRecord) => (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
        skill.teams.length > 0
          ? isLight
            ? 'bg-purple-100 text-purple-700'
            : 'bg-purple-900/30 text-purple-300'
          : isLight
            ? 'bg-gray-100 text-gray-700'
            : 'bg-gray-800 text-gray-300',
      )}
    >
      {skill.teams.length > 0 ? `Team: ${skill.teams.map((t) => t.name).join(', ')}` : 'Organization'}
    </span>
  );

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Select Organization
          </label>
          <OrganizationSelector
            isLight={isLight}
            organizations={organizations}
            selectedOrgId={selectedOrgId}
            onOrgChange={(orgId) => {
              setSelectedOrgId(orgId);
              setTeamFilterIds([]);
              setEditingSkillId(null);
              setEditForm(null);
              setShowCreateForm(false);
            }}
            placeholder="Select an organization..."
          />
        </div>
        <div>
          <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Filter by Team
          </label>
          {teamsLoading && teams.length === 0 ? (
            <div
              className={cn(
                'h-[34px] w-full rounded-md border animate-pulse',
                isLight ? 'border-gray-200 bg-gray-100' : 'border-gray-700 bg-gray-800',
              )}
            />
          ) : (
            <TeamMultiSelector
              isLight={isLight}
              teams={teams}
              selectedTeamIds={teamFilterIds}
              onTeamChange={setTeamFilterIds}
              placeholder="All teams"
              disabled={!selectedOrgId}
            />
          )}
        </div>
      </div>

      {selectedOrgId && (
        <>
          <div className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-shrink">
              <SkillIcon size={20} className={isLight ? 'text-blue-500' : 'text-blue-400'} />
              <h2 className={cn('text-sm font-semibold', mainTextColor)}>
                Skills{' '}
                <span className={cn('text-xs font-normal', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  ({filteredSkills.length})
                </span>
              </h2>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isSearchOpen ? (
                <div className="relative flex-shrink-0">
                  <svg
                    className={cn(
                      'absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2',
                      isLight ? 'text-gray-400' : 'text-gray-500',
                    )}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search skills..."
                    className={cn(
                      'w-[200px] rounded py-1 pr-8 pl-7 text-xs transition-all duration-200 outline-none',
                      isLight
                        ? 'bg-gray-100 text-gray-700 placeholder-gray-400 focus:bg-gray-100'
                        : 'bg-gray-800/60 text-[#bcc1c7] placeholder-gray-500 focus:bg-gray-800',
                    )}
                    style={{ animation: 'fadeInScale 0.2s ease-out' }}
                  />
                  <button
                    onClick={() => {
                      setIsSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className={cn(
                      'absolute top-1/2 right-1 -translate-y-1/2 p-1 rounded transition-colors',
                      isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300',
                    )}
                    title="Close search"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsSearchOpen(true);
                    setTimeout(() => searchInputRef.current?.focus(), 10);
                  }}
                  className={cn(
                    'p-1 rounded transition-colors flex-shrink-0',
                    isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300',
                  )}
                  title="Search skills"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              )}
              {!showCreateForm && !editingSkillId && (
                <button
                  type="button"
                  onClick={() => {
                    setCreateForm(INITIAL_FORM);
                    setShowCreateForm(true);
                    setIsCloning(false);
                    setCreateInstructionsViewMode('edit');
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors',
                    isLight
                      ? 'text-blue-600 border-blue-200 hover:bg-blue-50'
                      : 'text-blue-300 border-blue-800 hover:bg-blue-900/20',
                  )}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Skill
                </button>
              )}
            </div>
          </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreateSkill}
          className={cn(
            'space-y-3 rounded-lg border p-4',
            isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
          )}
        >
          <h3 className={cn('text-sm font-semibold', mainTextColor)}>
            {isCloning ? 'Clone Skill' : 'Create Skill'}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Skill Key
              </label>
              <input
                type="text"
                value={createForm.skillKey}
                onChange={(e) =>
                  setCreateForm((p) => ({
                    ...p,
                    skillKey: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                  }))
                }
                placeholder="my-skill"
                className={cn(
                  'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                  isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                )}
              />
            </div>
            <div>
              <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Name
              </label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="My Skill"
                className={cn(
                  'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                  isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                )}
              />
            </div>
          </div>

          <div>
            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
              Description
            </label>
            <textarea
              rows={2}
              value={createForm.description}
              onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
              required
              className={cn(
                'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
              )}
            />
          </div>

          <div>
            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
              Source Type
            </label>
            <div className="flex gap-4">
              <Radio
                name="create-source"
                value="manual"
                checked={createForm.sourceType === 'manual'}
                onChange={() => setCreateForm((p) => ({ ...p, sourceType: 'manual' }))}
                label="Manual"
                isLight={isLight}
              />
              <Radio
                name="create-source"
                value="git"
                checked={createForm.sourceType === 'git'}
                onChange={() => setCreateForm((p) => ({ ...p, sourceType: 'git' }))}
                label="Git"
                isLight={isLight}
              />
            </div>
          </div>

          {createForm.sourceType === 'manual' && (
            <>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Instructions
                  </label>
                  <div
                    className={cn(
                      'inline-flex rounded-lg p-0.5',
                      isLight ? 'bg-gray-100' : 'bg-gray-800/50',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setCreateInstructionsViewMode('preview')}
                      title="Preview rendered markdown"
                      className={cn(
                        'p-1 rounded-lg transition-colors',
                        createInstructionsViewMode === 'preview'
                          ? isLight
                            ? 'bg-white border border-gray-200 shadow-sm'
                            : 'bg-gray-700 border border-gray-600'
                          : isLight
                            ? 'text-gray-500 hover:text-gray-700'
                            : 'text-gray-400 hover:text-gray-300',
                      )}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateInstructionsViewMode('edit')}
                      title="Edit markdown source"
                      className={cn(
                        'p-1 rounded-lg transition-colors',
                        createInstructionsViewMode === 'edit'
                          ? isLight
                            ? 'bg-white border border-gray-200 shadow-sm'
                            : 'bg-gray-700 border border-gray-600'
                          : isLight
                            ? 'text-gray-500 hover:text-gray-700'
                            : 'text-gray-400 hover:text-gray-300',
                      )}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                    </button>
                  </div>
                </div>
                {createInstructionsViewMode === 'edit' && (
                  <div>
                    <textarea
                      rows={8}
                      value={createForm.content}
                      onChange={(e) => setCreateForm((p) => ({ ...p, content: e.target.value }))}
                      placeholder="Instructions for the agent... (Markdown)"
                      className={cn(
                        'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500 resize-y json-textarea font-mono',
                        isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                      )}
                    />
                  </div>
                )}
                {createInstructionsViewMode === 'preview' && (
                <div
                  className={cn(
                    'rounded-lg border overflow-auto text-xs p-3 min-h-[150px] max-h-[400px] skills-rendered-scrollbar',
                    isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-600',
                    !isLight && 'dark',
                  )}
                >
                  {createForm.content ? (
                    <CustomMarkdownRenderer
                      content={createForm.content}
                      isLight={isLight}
                      hideToolbars={true}
                      className="agent-instructions-markdown"
                    />
                  ) : (
                    <span className={cn(isLight ? 'text-gray-400' : 'text-gray-500')}>
                      No instructions yet. Switch to edit mode to add content.
                    </span>
                  )}
                </div>
                )}
              </div>
              <div>
                <SkillResourceListEditor
                  title="Resources"
                  resources={createForm.resources}
                  onChange={(r) => setCreateForm((p) => ({ ...p, resources: r }))}
                  isLight={isLight}
                />
              </div>
            </>
          )}

          {createForm.sourceType === 'git' && (
            <div>
              <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Git Config
              </label>
              <div
                className={cn(
                  'rounded-lg border p-3 space-y-3',
                  isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-600',
                )}
              >
                <GitConfigForm
                  value={createForm.gitConfig}
                  onChange={(v) => setCreateForm((p) => ({ ...p, gitConfig: v }))}
                  isLight={isLight}
                />
                {testStatus.state !== 'idle' && (
                  <div
                    className={cn(
                      'p-3 rounded text-xs flex items-center gap-2',
                      testStatus.state === 'success'
                        ? isLight ? 'bg-green-50 text-green-700' : 'bg-green-900/20 text-green-400'
                        : testStatus.state === 'error'
                          ? isLight ? 'bg-red-50 text-red-700' : 'bg-red-900/20 text-red-400'
                          : isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-900/20 text-blue-300',
                    )}
                  >
                    {testStatus.state === 'loading' && (
                      <svg className="h-3.5 w-3.5 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {testStatus.state === 'loading' ? 'Testing…' : testStatus.state === 'success' ? (testStatus.message || 'Successfully connected') : testStatus.message}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleTestGit(false)}
                  disabled={testStatus.state === 'loading'}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded font-medium border transition-colors',
                    testStatus.state === 'loading'
                      ? 'opacity-50 cursor-not-allowed'
                      : isLight
                        ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        : 'border-gray-600 text-gray-300 hover:bg-gray-800/50',
                  )}
                >
                  {testStatus.state === 'loading' ? 'Testing…' : 'Test Git Connection'}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
              Metadata (JSON)
            </label>
            <CodeMirrorJsonEditor
              value={createForm.metadata}
              onChange={(v) => setCreateForm((p) => ({ ...p, metadata: v }))}
              placeholder="{}"
              isLight={isLight}
              minHeight="20px"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Scope
              </label>
              <div className="flex gap-4">
                <Radio
                  name="create-scope"
                  value="organization"
                  checked={createForm.scope === 'organization'}
                  onChange={() => setCreateForm((p) => ({ ...p, scope: 'organization', teamIds: [] }))}
                  label="Organization"
                  isLight={isLight}
                />
                <Radio
                  name="create-scope"
                  value="team"
                  checked={createForm.scope === 'team'}
                  onChange={() => setCreateForm((p) => ({ ...p, scope: 'team' }))}
                  label="Team"
                  isLight={isLight}
                />
              </div>
            </div>
            <div>
              <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                Teams
              </label>
              <TeamMultiSelector
                isLight={isLight}
                teams={teams}
                selectedTeamIds={createForm.teamIds}
                onTeamChange={(v) => setCreateForm((p) => ({ ...p, teamIds: v }))}
                placeholder="Select teams"
                disabled={createForm.scope !== 'team'}
              />
            </div>
          </div>

          <Checkbox
            checked={createForm.enabled}
            onChange={(c) => setCreateForm((p) => ({ ...p, enabled: c }))}
            label="Skill is active"
            isLight={isLight}
          />

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="submit"
              className={cn(
                'px-4 py-1.5 text-xs font-medium rounded transition-colors',
                isLight ? 'bg-blue-500/90 text-white hover:bg-blue-500' : 'bg-blue-600/90 text-white hover:bg-blue-600',
              )}
            >
              {isCloning ? 'Clone Skill' : 'Create Skill'}
            </button>
            <button
              type="button"
              onClick={resetCreateForm}
              className={cn(
                'px-4 py-1.5 text-xs font-medium rounded transition-colors',
                isLight ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-red-900/30 text-red-400 hover:bg-red-900/50',
              )}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {listLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <SkillSkeletonCard key={`skill-skeleton-${idx}`} isLight={isLight} />
          ))}
        </div>
      ) : filteredSkills.length === 0 ? (
        <div
          className={cn(
            'text-center py-8 text-xs rounded-lg border',
            isLight ? 'text-gray-500 border-gray-200 bg-gray-50' : 'text-gray-400 border-gray-700 bg-[#151C24]',
          )}
        >
          <p>
            {searchQuery
              ? 'No skills match the current search'
              : teamFilterIds.length > 0
                ? 'No skills match the current filter'
                : 'No skills configured. Add your first skill to get started.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSkills.map((skill) => (
            <div
              key={skill.id}
              className={cn(
                'rounded-lg border p-4',
                isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
              )}
            >
              {editingSkillId === skill.id && editForm ? (
                <form onSubmit={handleUpdateSkill} className="space-y-3">
                  <h3 className={cn('text-sm font-semibold', mainTextColor)}>Edit Skill</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                        Skill Key
                      </label>
                      <input
                        type="text"
                        value={editForm.skillKey}
                        onChange={(e) =>
                          setEditForm((p) =>
                            p ? { ...p, skillKey: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') } : p,
                          )
                        }
                        className={cn(
                          'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                          isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                        )}
                      />
                    </div>
                    <div>
                      <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((p) => (p ? { ...p, name: e.target.value } : p))}
                        className={cn(
                          'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                          isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                        )}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      Description
                    </label>
                    <textarea
                      rows={2}
                      value={editForm.description}
                      onChange={(e) => setEditForm((p) => (p ? { ...p, description: e.target.value } : p))}
                      required
                      className={cn(
                        'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                        isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                      )}
                    />
                  </div>
                  {editForm.sourceType === 'manual' && (
                    <>
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Instructions
                          </label>
                          <div
                            className={cn(
                              'inline-flex rounded-lg p-0.5',
                              isLight ? 'bg-gray-100' : 'bg-gray-800/50',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setEditInstructionsViewMode('preview')}
                              title="Preview rendered markdown"
                              className={cn(
                                'p-1 rounded-lg transition-colors',
                                editInstructionsViewMode === 'preview'
                                  ? isLight
                                    ? 'bg-white border border-gray-200 shadow-sm'
                                    : 'bg-gray-700 border border-gray-600'
                                  : isLight
                                    ? 'text-gray-500 hover:text-gray-700'
                                    : 'text-gray-400 hover:text-gray-300',
                              )}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditInstructionsViewMode('edit')}
                              title="Edit markdown source"
                              className={cn(
                                'p-1 rounded-lg transition-colors',
                                editInstructionsViewMode === 'edit'
                                  ? isLight
                                    ? 'bg-white border border-gray-200 shadow-sm'
                                    : 'bg-gray-700 border border-gray-600'
                                  : isLight
                                    ? 'text-gray-500 hover:text-gray-700'
                                    : 'text-gray-400 hover:text-gray-300',
                              )}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {editInstructionsViewMode === 'edit' && (
                          <div>
                            <textarea
                              rows={8}
                              value={editForm.content}
                              onChange={(e) => setEditForm((p) => (p ? { ...p, content: e.target.value } : p))}
                              placeholder="Instructions for the agent... (Markdown)"
                              className={cn(
                                'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500 resize-y json-textarea font-mono',
                                isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                              )}
                            />
                          </div>
                        )}
                        {editInstructionsViewMode === 'preview' && (
                        <div
                          className={cn(
                            'rounded-lg border overflow-auto text-xs p-3 min-h-[150px] max-h-[400px] skills-rendered-scrollbar',
                            isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-600',
                            !isLight && 'dark',
                          )}
                        >
                          {editForm.content ? (
                            <CustomMarkdownRenderer
                              content={editForm.content}
                              isLight={isLight}
                              hideToolbars={true}
                              className="agent-instructions-markdown"
                            />
                          ) : (
                            <span className={cn(isLight ? 'text-gray-400' : 'text-gray-500')}>
                              No instructions yet. Switch to edit mode to add content.
                            </span>
                          )}
                        </div>
                        )}
                      </div>
                      <div>
                        <SkillResourceListEditor
                          title="Resources"
                          resources={editForm.resources}
                          onChange={(r) => setEditForm((p) => (p ? { ...p, resources: r } : p))}
                          isLight={isLight}
                        />
                      </div>
                    </>
                  )}
                  {editForm.sourceType === 'git' && (
                    <div>
                      <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                        Git Config
                      </label>
                      <div
                        className={cn(
                          'rounded-lg border p-3 space-y-3',
                          isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-600',
                        )}
                      >
                        <GitConfigForm
                          value={editForm.gitConfig}
                          onChange={(v) => setEditForm((p) => (p ? { ...p, gitConfig: v } : p))}
                          isLight={isLight}
                        />
                        {testStatus.state !== 'idle' && (
                          <div
                            className={cn(
                              'p-3 rounded text-xs flex items-center gap-2',
                              testStatus.state === 'success'
                                ? isLight ? 'bg-green-50 text-green-700' : 'bg-green-900/20 text-green-400'
                                : testStatus.state === 'error'
                                  ? isLight ? 'bg-red-50 text-red-700' : 'bg-red-900/20 text-red-400'
                                  : isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-900/20 text-blue-300',
                            )}
                          >
                            {testStatus.state === 'loading' && (
                              <svg className="h-3.5 w-3.5 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            )}
                            {testStatus.state === 'loading' ? 'Testing…' : testStatus.state === 'success' ? (testStatus.message || 'Successfully connected') : testStatus.message}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleTestGit(true)}
                          disabled={testStatus.state === 'loading'}
                          className={cn(
                            'px-3 py-1.5 text-xs rounded font-medium border transition-colors',
                            testStatus.state === 'loading'
                              ? 'opacity-50 cursor-not-allowed'
                              : isLight
                                ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                : 'border-gray-600 text-gray-300 hover:bg-gray-800/50',
                          )}
                        >
                          {testStatus.state === 'loading' ? 'Testing…' : 'Test Git Connection'}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                        Scope
                      </label>
                      <div className="flex gap-4">
                        <Radio
                          name="edit-scope"
                          value="organization"
                          checked={editForm.scope === 'organization'}
                          onChange={() => setEditForm((p) => (p ? { ...p, scope: 'organization', teamIds: [] } : p))}
                          label="Organization"
                          isLight={isLight}
                        />
                        <Radio
                          name="edit-scope"
                          value="team"
                          checked={editForm.scope === 'team'}
                          onChange={() => setEditForm((p) => (p ? { ...p, scope: 'team' } : p))}
                          label="Team"
                          isLight={isLight}
                        />
                      </div>
                    </div>
                    <div>
                      <TeamMultiSelector
                        isLight={isLight}
                        teams={teams}
                        selectedTeamIds={editForm.teamIds}
                        onTeamChange={(v) => setEditForm((p) => (p ? { ...p, teamIds: v } : p))}
                        placeholder="Select teams"
                        disabled={editForm.scope !== 'team'}
                      />
                    </div>
                  </div>
                  <Checkbox
                    checked={editForm.enabled}
                    onChange={(c) => setEditForm((p) => (p ? { ...p, enabled: c } : p))}
                    label="Skill is active"
                    isLight={isLight}
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="submit"
                      className={cn(
                        'px-4 py-1.5 text-xs font-medium rounded transition-colors',
                        isLight ? 'bg-blue-500/90 text-white hover:bg-blue-500' : 'bg-blue-600/90 text-white hover:bg-blue-600',
                      )}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSkillId(null);
                        setEditForm(null);
                      }}
                      className={cn(
                        'px-4 py-1.5 text-xs font-medium rounded transition-colors',
                        isLight ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-red-900/30 text-red-400 hover:bg-red-900/50',
                      )}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <SkillIcon size={16} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
                        <span className={cn('text-sm font-semibold', mainTextColor)}>
                          {skill.name}
                        </span>
                      </div>
                      <div className={cn('flex items-center gap-2 text-xs mt-0.5 flex-wrap', isLight ? 'text-gray-500' : 'text-gray-400')}>
                        <span>{skill.skillKey}</span>
                        <span>|</span>
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium',
                            isLight ? 'bg-gray-100 text-gray-700' : 'bg-gray-800 text-gray-300',
                          )}
                        >
                          {skill.sourceType}
                        </span>
                        {renderScopeBadge(skill)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEditSkill(skill)}
                        className={cn(
                          'p-1 rounded transition-colors',
                          isLight ? 'text-gray-400 hover:text-blue-600' : 'text-gray-500 hover:text-blue-400',
                        )}
                        title="Edit skill"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <SkillMoreOptionsButton
                        skill={skill}
                        isLight={isLight}
                        isOpen={openMoreMenuSkillId === skill.id}
                        onToggle={() => setOpenMoreMenuSkillId(openMoreMenuSkillId === skill.id ? null : skill.id)}
                        onClone={() => {
                          startCloneSkill(skill);
                          setOpenMoreMenuSkillId(null);
                        }}
                        onDelete={() => {
                          setDeleteConfirm({ id: skill.id, skillKey: skill.skillKey });
                          setDeleteDialogOpen(true);
                          setOpenMoreMenuSkillId(null);
                        }}
                      />
                    </div>
                  </div>
                  {skill.description && (
                    <div className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {skill.description}
                    </div>
                  )}
                  <div className={cn('flex items-center justify-between pt-3 border-t', isLight ? 'border-gray-200' : 'border-gray-700')}>
                    <label className={cn('text-xs font-medium', mainTextColor)}>
                      {skill.enabled ? 'Enabled' : 'Disabled'}
                    </label>
                    <button
                      role="switch"
                      aria-checked={skill.enabled}
                      onClick={() => handleToggleEnabled(skill)}
                      className={cn(
                        'relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border-2 border-transparent transition-colors',
                        skill.enabled ? 'bg-blue-600' : isLight ? 'bg-gray-200' : 'bg-gray-600',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-3 w-3 transform rounded-full bg-white shadow transition',
                          skill.enabled ? 'translate-x-3' : 'translate-x-0',
                        )}
                      />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
        </>
      )}

      <AdminConfirmDialog
        isOpen={deleteDialogOpen && !!deleteConfirm}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeleteConfirm(null);
        }}
        onConfirm={handleDeleteSkill}
        title="Delete Skill"
        message={
          <div className="flex items-start gap-3">
            <div className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', isLight ? 'bg-red-100' : 'bg-red-900/30')}>
              <SkillIcon size={14} className={isLight ? 'text-red-600' : 'text-red-400'} />
            </div>
            <div className="flex-1">
              <p className={cn('text-sm font-medium', mainTextColor)}>
                Delete skill &quot;{deleteConfirm?.skillKey}&quot;?
              </p>
              <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                This skill will be removed and will no longer be available.
              </p>
            </div>
          </div>
        }
        confirmText="Delete"
        variant="danger"
        isLight={isLight}
      />
    </div>
  );
}

export default SkillsTab;
