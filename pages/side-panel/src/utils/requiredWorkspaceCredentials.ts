/**
 * Match agent metadata.required_workspace_credentials against selected chat context credentials.
 * Each required row consumes one selected credential with the same workspace `type` (multiset).
 */

export interface RequiredWorkspaceCredentialItem {
  credential_type?: string;
  type?: string;
  description?: string;
}

function requirementCredentialType(item: RequiredWorkspaceCredentialItem): string {
  const t = item.credential_type ?? item.type;
  return typeof t === 'string' ? t.trim() : '';
}

/**
 * Required rows still unmatched after pairing each selected credential `type` to a required row of the same type.
 */
export function getMissingRequiredWorkspaceCredentials(
  required: RequiredWorkspaceCredentialItem[] | null | undefined,
  selectedCredentials: Array<{ type?: string | null }>,
): RequiredWorkspaceCredentialItem[] {
  if (!required || required.length === 0) return [];
  const pool = selectedCredentials.map(c => (typeof c.type === 'string' ? c.type.trim() : '')).filter(Boolean);
  const poolMutable = [...pool];
  const missing: RequiredWorkspaceCredentialItem[] = [];
  for (const req of required) {
    const ctype = requirementCredentialType(req);
    if (!ctype) continue;
    const idx = poolMutable.indexOf(ctype);
    if (idx === -1) {
      missing.push(req);
    } else {
      poolMutable.splice(idx, 1);
    }
  }
  return missing;
}

/** Count of still-unmatched required credentials (same as `getMissingRequiredWorkspaceCredentials(...).length`). */
export function getRemainingRequiredWorkspaceCredentialCount(
  required: RequiredWorkspaceCredentialItem[] | null | undefined,
  selectedCredentials: Array<{ type?: string | null }> | null | undefined,
): number {
  return getMissingRequiredWorkspaceCredentials(required, selectedCredentials ?? []).length;
}
