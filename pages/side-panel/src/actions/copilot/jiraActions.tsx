/**
 * Jira CopilotKit Actions
 * 
 * Actions for all Jira MCP tools with generative UI rendering
 * Based on actual tool signatures from corp-jira MCP server
 * 
 * Available tools:
 * - test_jira_auth: Test authentication (no params)
 * - search_jira_issues: Search using JQL (jql, startAt, maxResults, fields, expand, properties, fieldsByKeys)
 * - create_jira_issue: Create new issue (fields, update)
 * - update_jira_issue: Update existing issue (issueIdOrKey, fields)
 * - get_jira_comments: Get comments (issueIdOrKey, startAt, maxResults, orderBy, expand)
 * - add_jira_comment: Add comment (issueIdOrKey, comment)
 * - get_jira_transitions: Get available transitions (issueIdOrKey)
 * - transition_jira_status: Transition by ID (issueIdOrKey, transitionId, comment, resolution, fields)
 * - transition_jira_status_by_name: Transition by name (issueIdOrKey, statusName, comment, resolution, fields)
 */

import React from 'react';
import { ActionStatus } from '../../components/ActionStatus';

interface JiraActionDependencies {
  isLight: boolean;
}

/**
 * Jira icon component
 */
const JiraIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, marginRight: 6 }}
  >
    <defs>
      <linearGradient id="jiraGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#0052CC', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: '#2684FF', stopOpacity: 1 }} />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="7" height="7" rx="1" stroke="url(#jiraGradient)" />
    <rect x="14" y="3" width="7" height="7" rx="1" stroke="url(#jiraGradient)" />
    <rect x="3" y="14" width="7" height="7" rx="1" stroke="url(#jiraGradient)" />
    <rect x="14" y="14" width="7" height="7" rx="1" stroke="url(#jiraGradient)" />
  </svg>
);

/**
 * Helper to clip text for display
 */
const clipText = (text: string | undefined, maxLen: number): string => {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
};

/**
 * Tool configurations with their actual parameters
 */
const JIRA_TOOL_CONFIGS = {
  test_jira_auth: {
    description: 'Test Jira authentication connection',
    parameters: [],
  },
  search_jira_issues: {
    description: 'Search for Jira issues using JQL',
    parameters: [
      { name: 'jql', type: 'string', description: 'JQL query string', required: true },
      { name: 'startAt', type: 'number', description: 'Starting index', required: false },
      { name: 'maxResults', type: 'number', description: 'Maximum results', required: false },
      { name: 'fields', type: 'array', description: 'Fields to return', required: false },
      { name: 'expand', type: 'array', description: 'Fields to expand', required: false },
    ],
  },
  create_jira_issue: {
    description: 'Create a new Jira issue',
    parameters: [
      { name: 'fields', type: 'object', description: 'Issue fields (project, summary, issuetype, etc.)', required: true },
      { name: 'update', type: 'object', description: 'Update operations', required: false },
    ],
  },
  update_jira_issue: {
    description: 'Update an existing Jira issue',
    parameters: [
      { name: 'issueIdOrKey', type: 'string', description: 'Issue ID or key', required: true },
      { name: 'fields', type: 'object', description: 'Fields to update', required: false },
    ],
  },
  get_jira_comments: {
    description: 'Get comments for a Jira issue',
    parameters: [
      { name: 'issueIdOrKey', type: 'string', description: 'Issue ID or key', required: true },
      { name: 'startAt', type: 'number', description: 'Starting index', required: false },
      { name: 'maxResults', type: 'number', description: 'Maximum results', required: false },
      { name: 'orderBy', type: 'string', description: 'Sort order', required: false },
      { name: 'expand', type: 'string', description: 'Fields to expand', required: false },
    ],
  },
  add_jira_comment: {
    description: 'Add a comment to a Jira issue',
    parameters: [
      { name: 'issueIdOrKey', type: 'string', description: 'Issue ID or key', required: true },
      { name: 'comment', type: 'object', description: 'Comment body and visibility', required: true },
    ],
  },
  get_jira_transitions: {
    description: 'Get available transitions for a Jira issue',
    parameters: [
      { name: 'issueIdOrKey', type: 'string', description: 'Issue ID or key', required: true },
    ],
  },
  transition_jira_status: {
    description: 'Transition Jira issue status by transition ID',
    parameters: [
      { name: 'issueIdOrKey', type: 'string', description: 'Issue ID or key', required: true },
      { name: 'transitionId', type: 'string', description: 'Transition ID', required: true },
      { name: 'comment', type: 'string', description: 'Optional comment', required: false },
      { name: 'resolution', type: 'object', description: 'Resolution details', required: false },
      { name: 'fields', type: 'object', description: 'Additional fields', required: false },
    ],
  },
  transition_jira_status_by_name: {
    description: 'Transition Jira issue status by status name',
    parameters: [
      { name: 'issueIdOrKey', type: 'string', description: 'Issue ID or key', required: true },
      { name: 'statusName', type: 'string', description: 'Target status name', required: true },
      { name: 'comment', type: 'string', description: 'Optional comment', required: false },
      { name: 'resolution', type: 'object', description: 'Resolution details', required: false },
      { name: 'fields', type: 'object', description: 'Additional fields', required: false },
    ],
  },
} as const;

/**
 * Creates generic Jira MCP tool actions
 * Maps corp-jira_* tools to render with ActionStatus component
 * 
 * Note: These actions are set to 'disabled' because they are executed by the backend
 * via MCP servers. The frontend only handles UI rendering when the backend calls these tools.
 */
export const createJiraActions = ({ isLight }: JiraActionDependencies) => {
  return Object.entries(JIRA_TOOL_CONFIGS).map(([toolName, config]) => ({
    name: `corp-jira_${toolName}`,
    description: config.description,
    available: 'disabled' as const,
    parameters: config.parameters,
    render: ({ args, result, status, error }: any) => {
      // Build tool name for display
      let displayName = 'Jira';
      let messages = {
        pending: '',
        inProgress: '',
        complete: '',
      };

      // Customize messages based on tool and arguments
      if (toolName === 'test_jira_auth') {
        // Check authentication status from result
        // Backend returns either 'authenticated: true' or 'success: true'
        const isAuthenticated = result?.authenticated === true || result?.success === true;
        const hasResult = result !== undefined && result !== null;
        
        displayName = 'Test Jira authentication';
        messages = {
          pending: 'Testing Jira authentication...',
          inProgress: 'Testing Jira authentication...',
          complete: hasResult 
            ? (isAuthenticated 
                ? 'Jira authentication successful' 
                : 'Jira authentication failed') 
            : 'Testing authentication',
        };
      } else if (toolName === 'search_jira_issues') {
        const jql = clipText(args?.jql, 40);
        // Handle both nested (data.total) and flat (total) response structures
        const count = status === 'complete' && result 
          ? (result.data?.total || result.total || result.data?.issues?.length || result.issues?.length || 0) 
          : 0;
        
        displayName = `Search Jira for "${jql}"`;
        messages = {
          pending: `Searching Jira for "${jql}"...`,
          inProgress: `Searching Jira for "${jql}"...`,
          complete: `Search complete for "${jql}". Found ${count} issue${count !== 1 ? 's' : ''}`,
        };
      } else if (toolName === 'create_jira_issue') {
        const summary = clipText(args?.fields?.summary, 40);
        const key = status === 'complete' && result ? (result.key || result.id || '') : '';
        
        displayName = summary ? `Create Jira issue: "${summary}"` : 'Create Jira issue';
        messages = {
          pending: summary ? `Creating "${summary}"...` : 'Creating Jira issue...',
          inProgress: summary ? `Creating "${summary}"...` : 'Creating Jira issue...',
          complete: key ? `Issue ${key} created successfully` : 'Issue created successfully',
        };
      } else if (toolName === 'update_jira_issue') {
        const issueKey = clipText(args?.issueIdOrKey, 20);
        
        displayName = issueKey ? `Update Jira issue ${issueKey}` : 'Update Jira issue';
        messages = {
          pending: issueKey ? `Updating ${issueKey}...` : 'Updating issue...',
          inProgress: issueKey ? `Updating ${issueKey}...` : 'Updating issue...',
          complete: issueKey ? `${issueKey} updated successfully` : 'Issue updated successfully',
        };
      } else if (toolName === 'get_jira_comments') {
        const issueKey = clipText(args?.issueIdOrKey, 20);
        // Handle both nested (data.total) and flat (total) response structures
        const count = status === 'complete' && result 
          ? (result.data?.total || result.total || result.data?.comments?.length || result.comments?.length || 0) 
          : 0;
        
        displayName = issueKey ? `Get comments for ${issueKey}` : 'Get Jira comments';
        messages = {
          pending: issueKey ? `Fetching comments for ${issueKey}...` : 'Fetching comments...',
          inProgress: issueKey ? `Fetching comments for ${issueKey}...` : 'Fetching comments...',
          complete: issueKey 
            ? `Retrieved ${count} comment${count !== 1 ? 's' : ''} for ${issueKey}` 
            : `Retrieved ${count} comment${count !== 1 ? 's' : ''}`,
        };
      } else if (toolName === 'add_jira_comment') {
        const issueKey = clipText(args?.issueIdOrKey, 20);
        const commentPreview = clipText(args?.comment?.body, 30);
        
        displayName = issueKey ? `Add comment to ${issueKey}` : 'Add Jira comment';
        messages = {
          pending: issueKey ? `Adding comment to ${issueKey}...` : 'Adding comment...',
          inProgress: issueKey ? `Adding comment to ${issueKey}...` : 'Adding comment...',
          complete: issueKey 
            ? `Comment added to ${issueKey} successfully` 
            : 'Comment added successfully',
        };
      } else if (toolName === 'get_jira_transitions') {
        const issueKey = clipText(args?.issueIdOrKey, 20);
        // Handle both nested (data.transitions) and flat (transitions) response structures
        const count = status === 'complete' && result 
          ? (result.data?.transitions?.length || result.transitions?.length || 0) 
          : 0;
        
        displayName = issueKey ? `Get transitions for ${issueKey}` : 'Get available transitions';
        messages = {
          pending: issueKey ? `Fetching transitions for ${issueKey}...` : 'Fetching transitions...',
          inProgress: issueKey ? `Fetching transitions for ${issueKey}...` : 'Fetching transitions...',
          complete: issueKey 
            ? `Found ${count} available transition${count !== 1 ? 's' : ''} for ${issueKey}` 
            : `Found ${count} available transition${count !== 1 ? 's' : ''}`,
        };
      } else if (toolName === 'transition_jira_status') {
        const issueKey = clipText(args?.issueIdOrKey, 20);
        const transitionId = args?.transitionId;
        
        displayName = issueKey ? `Transition ${issueKey}` : 'Transition issue status';
        messages = {
          pending: issueKey ? `Transitioning ${issueKey}...` : 'Transitioning issue...',
          inProgress: issueKey ? `Transitioning ${issueKey}...` : 'Transitioning issue...',
          complete: issueKey 
            ? `${issueKey} transitioned successfully` 
            : 'Issue transitioned successfully',
        };
      } else if (toolName === 'transition_jira_status_by_name') {
        const issueKey = clipText(args?.issueIdOrKey, 20);
        const statusName = clipText(args?.statusName, 20);
        
        displayName = issueKey && statusName 
          ? `Transition ${issueKey} to "${statusName}"` 
          : 'Transition issue status';
        messages = {
          pending: issueKey && statusName 
            ? `Transitioning ${issueKey} to "${statusName}"...` 
            : 'Transitioning issue...',
          inProgress: issueKey && statusName 
            ? `Transitioning ${issueKey} to "${statusName}"...` 
            : 'Transitioning issue...',
          complete: issueKey && statusName 
            ? `${issueKey} transitioned to "${statusName}" successfully` 
            : 'Issue transitioned successfully',
        };
      }

      // Handle errors
      if (error) {
        messages.complete = `Error: ${clipText(String(error), 60)}`;
      }

      return (
        <ActionStatus
          toolName={displayName}
          status={status as any}
          isLight={isLight}
          icon={<JiraIcon />}
          messages={messages}
          args={args}
          result={result}
          error={error}
        />
      );
    },
  }));
};


