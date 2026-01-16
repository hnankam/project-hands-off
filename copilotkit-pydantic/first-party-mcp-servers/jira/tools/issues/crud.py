"""
Issue CRUD Operations

This module provides tools for creating, reading, updating, deleting, and searching
Jira issues. These are the fundamental operations for issue management.
"""

from typing import Optional, Dict, Any
from cache import get_jira_client
from models import (
    IssueModel,
    IssueFieldsModel,
    CreateIssueResponse,
    GetIssueResponse,
    UpdateIssueResponse,
    DeleteIssueResponse,
    SearchIssuesResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_issue_model(issue_data: dict) -> IssueModel:
    """Convert Jira API issue data to Pydantic model."""
    fields_data = issue_data.get('fields', {})
    
    return IssueModel(
        id=issue_data.get('id'),
        key=issue_data.get('key'),
        self_link=issue_data.get('self'),
        fields=IssueFieldsModel(
            summary=fields_data.get('summary'),
            description=fields_data.get('description'),
            issuetype=fields_data.get('issuetype'),
            project=fields_data.get('project'),
            status=fields_data.get('status'),
            priority=fields_data.get('priority'),
            assignee=fields_data.get('assignee'),
            reporter=fields_data.get('reporter'),
            labels=fields_data.get('labels'),
            components=fields_data.get('components'),
            fixVersions=fields_data.get('fixVersions'),
            created=fields_data.get('created'),
            updated=fields_data.get('updated'),
            duedate=fields_data.get('duedate'),
            resolution=fields_data.get('resolution'),
            resolutiondate=fields_data.get('resolutiondate'),
        )
    )


# ============================================================================
# Issue CRUD Operations
# ============================================================================

def create_issue(
    url_credential_key: str,
    token_credential_key: str,
    project_key: str,
    summary: str,
    issue_type: str,
    username_credential_key: str = "",
    description: Optional[str] = None,
    priority: Optional[str] = None,
    labels: Optional[list[str]] = None,
    assignee: Optional[str] = None,
    custom_fields: Optional[Dict[str, Any]] = None,
    cloud: bool = False,
) -> CreateIssueResponse:
    """
    Create a new issue in the specified project.
    
    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        project_key: Project key (e.g., "PROJ")
        summary: Issue summary/title
        issue_type: Issue type (e.g., "Bug", "Task", "Story")
        username_credential_key: Credential key for username (Cloud only, default: "")
        description: Issue description (optional)
        priority: Priority name (e.g., "High", "Medium", "Low") (optional)
        labels: List of labels (optional)
        assignee: Assignee account ID or name (optional)
        custom_fields: Dictionary of custom field values (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.
        
    Returns:
        CreateIssueResponse with created issue details
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
        # Build fields dictionary
        fields = {
            'project': {'key': project_key},
            'summary': summary,
            'issuetype': {'name': issue_type},
        }
        
        if description:
            fields['description'] = description
        
        if priority:
            fields['priority'] = {'name': priority}
        
        if labels:
            fields['labels'] = labels
        
        if assignee:
            fields['assignee'] = {'name': assignee}
        
        # Add custom fields
        if custom_fields:
            fields.update(custom_fields)
        
        # Create the issue
        issue_data = client.issue_create(fields=fields)
        
        # Get full issue details
        full_issue = client.issue(issue_data['key'], fields='*all')
        
        return CreateIssueResponse(
            issue=_convert_to_issue_model(full_issue),
        )
    except Exception as e:
        return CreateIssueResponse(
            issue=None,
            error_message=f"Failed to create issue: {str(e)}"
        )


def get_issue(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    fields: Optional[str] = None,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetIssueResponse:
    """
    Get issue details by key.
    
    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        username_credential_key: Credential key for username (Cloud only, default: "")
        fields: Comma-separated list of fields to return (optional)
        expand: Comma-separated list of parameters to expand (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.
        
    Returns:
        GetIssueResponse with issue details
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
        # Get the issue
        issue_data = client.issue(issue_key, fields=fields, expand=expand)
        
        return GetIssueResponse(
            issue=_convert_to_issue_model(issue_data),
        )
    except Exception as e:
        return GetIssueResponse(
            issue=None,
            error_message=f"Failed to get issue: {str(e)}"
        )


def update_issue(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    summary: Optional[str] = None,
    description: Optional[str] = None,
    priority: Optional[str] = None,
    labels: Optional[list[str]] = None,
    assignee: Optional[str] = None,
    custom_fields: Optional[Dict[str, Any]] = None,
    cloud: bool = False,
) -> UpdateIssueResponse:
    """
    Update one or more fields of an existing issue.
    
    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        username_credential_key: Credential key for username (Cloud only, default: "")
        summary: New summary (optional)
        description: New description (optional)
        priority: New priority (optional)
        labels: New labels list (optional)
        assignee: New assignee (optional)
        custom_fields: Dictionary of custom field values to update (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.
        
    Returns:
        UpdateIssueResponse confirming update
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
        # Build update fields
        fields = {}
        
        if summary is not None:
            fields['summary'] = summary
        
        if description is not None:
            fields['description'] = description
        
        if priority is not None:
            fields['priority'] = {'name': priority}
        
        if labels is not None:
            fields['labels'] = labels
        
        if assignee is not None:
            fields['assignee'] = {'name': assignee}
        
        # Add custom fields
        if custom_fields:
            fields.update(custom_fields)
        
        # Update the issue
        client.issue_update(issue_key, fields=fields)
        
        return UpdateIssueResponse(
            issue_key=issue_key,
        )
    except Exception as e:
        return UpdateIssueResponse(
            issue_key=issue_key,
            error_message=f"Failed to update issue: {str(e)}"
        )


def delete_issue(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    delete_subtasks: bool = False,
    cloud: bool = False,
) -> DeleteIssueResponse:
    """
    Permanently delete an issue.
    
    **Warning:** This operation is permanent and cannot be undone.
    
    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        username_credential_key: Credential key for username (Cloud only, default: "")
        delete_subtasks: Whether to delete subtasks (default: False)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.
        
    Returns:
        DeleteIssueResponse confirming deletion
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
        # Delete the issue
        client.delete_issue(issue_key, delete_subtasks=delete_subtasks)
        
        return DeleteIssueResponse(
            issue_key=issue_key,
        )
    except Exception as e:
        return DeleteIssueResponse(
            issue_key=issue_key,
            error_message=f"Failed to delete issue: {str(e)}"
        )


def search_issues(
    url_credential_key: str,
    token_credential_key: str,
    jql: str,
    username_credential_key: str = "",
    start_at: int = 0,
    max_results: int = 50,
    fields: Optional[str] = None,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> SearchIssuesResponse:
    """
    Search for issues using Jira Query Language (JQL).
    
    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        jql: JQL query string
        username_credential_key: Credential key for username (Cloud only, default: "")
        start_at: Starting index for results (default: 0)
        max_results: Maximum results to return (default: 50)
        fields: Comma-separated list of fields to return (optional)
        expand: Comma-separated list of parameters to expand (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.
        
    Returns:
        SearchIssuesResponse with matching issues and pagination info
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
        # Use the correct search method - direct API call to avoid URL construction issues
        # The jql() method sometimes constructs incorrect URLs
        # Use the underlying REST API directly
        params = {
            'jql': jql,
            'startAt': start_at,
            'maxResults': max_results,
            'fields': fields if fields else '*all',
        }
        
        if expand:
            params['expand'] = expand
        
        # Make direct API call using the SDK's get method
        results = client.get('rest/api/2/search', params=params)
        
        # Convert issues to models
        issues = [_convert_to_issue_model(issue) for issue in results.get('issues', [])]
        
        return SearchIssuesResponse(
            issues=issues,
            total=results.get('total', 0),
            start_at=results.get('startAt', 0),
            max_results=results.get('maxResults', 50),
        )
    except Exception as e:
        return SearchIssuesResponse(
            issues=[],
            total=0,
            start_at=0,
            max_results=0,
            error_message=f"Failed to search issues: {str(e)}"
        )

