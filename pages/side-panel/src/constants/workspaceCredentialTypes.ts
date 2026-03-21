/** Workspace credential categories (API `type` field + admin agent required-credential UI). */
export const WORKSPACE_CREDENTIAL_TYPES = ['Databricks', 'Wiki', 'Jira', 'Git', 'Others'] as const;
export type WorkspaceCredentialType = (typeof WORKSPACE_CREDENTIAL_TYPES)[number];
