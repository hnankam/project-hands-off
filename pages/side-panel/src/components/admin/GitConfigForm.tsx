/**
 * Git Config Form for Skills
 *
 * Structured form fields for GitSkillsRegistry parameters per
 * https://dougtrajano.github.io/pydantic-ai-skills/registries/#load-skills-from-a-git-repository
 */
import * as React from 'react';
import { cn } from '@extension/ui';

export interface GitConfigFields {
  repo_url: string;
  path: string;
  target_dir: string;
  token: string;
  ssh_key_file: string;
  validate: boolean;
  auto_install: boolean;
  clone_depth: string;
  clone_branch: string;
  clone_single_branch: boolean;
  clone_sparse_paths: string;
}

export const INITIAL_GIT_CONFIG: GitConfigFields = {
  repo_url: '',
  path: 'skills',
  target_dir: '',
  token: '',
  ssh_key_file: '',
  validate: true,
  auto_install: true,
  clone_depth: '1',
  clone_branch: 'main',
  clone_single_branch: true,
  clone_sparse_paths: '',
};

export function gitConfigFieldsToApi(g: GitConfigFields): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    repo_url: g.repo_url.trim() || undefined,
    path: g.path.trim() || undefined,
    target_dir: g.target_dir.trim() || undefined,
    token: g.token.trim() || undefined,
    ssh_key_file: g.ssh_key_file.trim() || undefined,
    validate: g.validate,
    auto_install: g.auto_install,
  };
  const cloneOpts: Record<string, unknown> = {};
  const depth = parseInt(g.clone_depth, 10);
  if (!isNaN(depth) && depth > 0) cloneOpts.depth = depth;
  if (g.clone_branch.trim()) cloneOpts.branch = g.clone_branch.trim();
  cloneOpts.single_branch = g.clone_single_branch;
  const sparsePaths = g.clone_sparse_paths
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sparsePaths.length > 0) cloneOpts.sparse_paths = sparsePaths;
  if (Object.keys(cloneOpts).length > 0) obj.clone_options = cloneOpts;
  return obj;
}

export function parseGitConfigToFields(json: Record<string, unknown> | null): GitConfigFields {
  if (!json || typeof json !== 'object') return { ...INITIAL_GIT_CONFIG };
  const co = (json.clone_options as Record<string, unknown>) || {};
  return {
    repo_url: String(json.repo_url ?? ''),
    path: String(json.path ?? 'skills'),
    target_dir: String(json.target_dir ?? ''),
    token: String(json.token ?? ''),
    ssh_key_file: String(json.ssh_key_file ?? ''),
    validate: json.validate !== false,
    auto_install: json.auto_install !== false,
    clone_depth: co.depth != null ? String(co.depth) : '1',
    clone_branch: String(co.branch ?? 'main'),
    clone_single_branch: co.single_branch !== false,
    clone_sparse_paths: Array.isArray(co.sparse_paths) ? co.sparse_paths.join(', ') : '',
  };
}

export interface GitConfigFormProps {
  value: GitConfigFields;
  onChange: (value: GitConfigFields) => void;
  isLight: boolean;
}

export const GitConfigForm: React.FC<GitConfigFormProps> = ({ value, onChange, isLight }) => {
  const input = cn(
    'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
    isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
  );
  const label = cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300');
  const hint = cn('text-[10px] mt-0.5', isLight ? 'text-gray-500' : 'text-gray-400');

  const update = (updates: Partial<GitConfigFields>) => onChange({ ...value, ...updates });

  return (
    <div className="space-y-3">
      <div>
        <label className={label}>Repository URL *</label>
        <input
          type="text"
          value={value.repo_url}
          onChange={(e) => update({ repo_url: e.target.value })}
          placeholder="https://github.com/org/repo.git or git@github.com:org/repo.git"
          className={input}
        />
        <p className={hint}>Full URL of the Git repository (HTTPS or SSH).</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>Path</label>
          <input
            type="text"
            value={value.path}
            onChange={(e) => update({ path: e.target.value })}
            placeholder="skills"
            className={input}
          />
          <p className={hint}>Sub-path inside the repo containing skill directories. Default: skills.</p>
        </div>
        <div>
          <label className={label}>Target directory</label>
          <input
            type="text"
            value={value.target_dir}
            onChange={(e) => update({ target_dir: e.target.value })}
            placeholder="Leave empty for auto (temp directory)"
            className={input}
          />
          <p className={hint}>Local clone directory. Defaults to a temporary directory if empty.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>Token (HTTPS)</label>
          <input
            type="password"
            value={value.token}
            onChange={(e) => update({ token: e.target.value })}
            placeholder="Personal access token (or GITHUB_TOKEN env)"
            className={input}
            autoComplete="off"
          />
          <p className={hint}>Personal access token for private repos. Falls back to GITHUB_TOKEN env var.</p>
        </div>
        <div>
          <label className={label}>SSH key file</label>
          <input
            type="text"
            value={value.ssh_key_file}
            onChange={(e) => update({ ssh_key_file: e.target.value })}
            placeholder="~/.ssh/id_ed25519"
            className={input}
          />
          <p className={hint}>Path to SSH private key for SSH authentication.</p>
        </div>
      </div>

      <div className="border-t pt-3 mt-3" style={{ borderColor: isLight ? '#e5e7eb' : '#374151' }}>
        <h4 className={cn('text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
          Clone options
        </h4>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Depth</label>
              <input
                type="text"
                value={value.clone_depth}
                onChange={(e) => update({ clone_depth: e.target.value })}
                placeholder="1"
                className={input}
              />
              <p className={hint}>Shallow clone depth (1 = single commit).</p>
            </div>
            <div>
              <label className={label}>Branch</label>
              <input
                type="text"
                value={value.clone_branch}
                onChange={(e) => update({ clone_branch: e.target.value })}
                placeholder="main"
                className={input}
              />
              <p className={hint}>Specific branch to clone.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Sparse paths</label>
              <input
                type="text"
                value={value.clone_sparse_paths}
                onChange={(e) => update({ clone_sparse_paths: e.target.value })}
                placeholder="skills/pdf, skills/docx (comma-separated)"
                className={input}
              />
              <p className={hint}>Sparse checkout paths. Leave empty for full clone.</p>
            </div>
            <div className="flex flex-col gap-3 justify-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.clone_single_branch}
                  onChange={(e) => update({ clone_single_branch: e.target.checked })}
                  className={cn(
                    'rounded border',
                    isLight ? 'border-gray-300 text-blue-600' : 'border-gray-600 bg-gray-700',
                  )}
                />
                <span className={cn('text-xs', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Single branch only
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.validate}
                  onChange={(e) => update({ validate: e.target.checked })}
                  className={cn(
                    'rounded border',
                    isLight ? 'border-gray-300 text-blue-600' : 'border-gray-600 bg-gray-700',
                  )}
                />
                <span className={cn('text-xs', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Validate SKILL.md frontmatter after cloning
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.auto_install}
                  onChange={(e) => update({ auto_install: e.target.checked })}
                  className={cn(
                    'rounded border',
                    isLight ? 'border-gray-300 text-blue-600' : 'border-gray-600 bg-gray-700',
                  )}
                />
                <span className={cn('text-xs', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Clone/pull automatically on first access
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
