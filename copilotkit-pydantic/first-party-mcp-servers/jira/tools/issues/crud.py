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
    url: str,
    api_token: str,
    project_key: str,
    summary: str,
    issue_type: str,
    username: str = "",
    description: Optional[str] = None,
    priority: Optional[str] = None,
    labels: Optional[list[str]] = None,
    assignee: Optional[str] = None,
    custom_fields: Optional[Dict[str, Any]] = None,
    cloud: bool = False,
) -> CreateIssueResponse:
    """
    Create a new Jira issue.
    
    Creates a new issue in the specified project with the given details.
    
    Args:
        url: Jira instance URL (e.g., "https://yoursite.atlassian.net" for Cloud,
             "https://jira.company.com" for Server/Data Center)
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        project_key: Project key (e.g., "PROJ")
        summary: Issue summary/title
        issue_type: Issue type (e.g., "Bug", "Task", "Story")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        description: Issue description (optional)
        priority: Priority name (e.g., "High", "Medium", "Low") (optional)
        labels: List of labels (optional)
        assignee: Assignee account ID or name (optional)
        custom_fields: Dictionary of custom field values (optional)
        cloud: Set to True for Jira Cloud, False for Server/Data Center (default: False)
        
    Returns:
        CreateIssueResponse with created issue details
        
    Example:
        # Create a bug on Jira Cloud (with API token)
        response = create_issue(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",   # Get from https://id.atlassian.com/manage-profile/security/api-tokens
            project_key="PROJ",
            summary="Login button not working",
            issue_type="Bug",
            username="user@example.com",  # Required for Cloud
            description="Users cannot click the login button on mobile",
            priority="High",
            labels=["frontend", "mobile"],
            cloud=True
        )
        print(f"Created: {response.issue.key}")
        
        # Create a task on Jira Server/Data Center (with PAT)
        response = create_issue(
            url="https://jira.corp.company.com",
            api_token="your_personal_access_token",  # PAT from Profile → Personal Access Tokens
            project_key="PROJ",
            summary="Update documentation",
            issue_type="Task",
            # username omitted (defaults to "")
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    
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


def get_issue(
    url: str,
    api_token: str,
    issue_key: str,
    username: str = "",
    fields: Optional[str] = None,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetIssueResponse:
    """
    Get a Jira issue by key.
    
    Retrieves detailed information about a specific issue.
    
    Args:
        url: Jira instance URL (Cloud: "https://yoursite.atlassian.net",
             Server: "https://jira.company.com")
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        fields: Comma-separated list of fields to return (optional)
        expand: Comma-separated list of parameters to expand (optional)
        cloud: Set to True for Jira Cloud, False for Server/Data Center (default: False)
        
    Returns:
        GetIssueResponse with issue details
        
    Example:
        # Get issue details from Jira Cloud
        response = get_issue(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",  # Required for Cloud
            cloud=True
        )
        print(f"Summary: {response.issue.fields.summary}")
        print(f"Status: {response.issue.fields.status['name']}")
        
        # Get issue from Jira Server/Data Center
        response = get_issue(
            url="https://jira.corp.company.com",
            api_token="your_personal_access_token",
            issue_key="PROJ-456",
            # username omitted (defaults to "")
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    
    # Get the issue
    issue_data = client.issue(issue_key, fields=fields, expand=expand)
    
    return GetIssueResponse(
        issue=_convert_to_issue_model(issue_data),
    )


def update_issue(
    url: str,
    api_token: str,
    issue_key: str,
    username: str = "",
    summary: Optional[str] = None,
    description: Optional[str] = None,
    priority: Optional[str] = None,
    labels: Optional[list[str]] = None,
    assignee: Optional[str] = None,
    custom_fields: Optional[Dict[str, Any]] = None,
    cloud: bool = False,
) -> UpdateIssueResponse:
    """
    Update a Jira issue.
    
    Updates one or more fields of an existing issue.
    
    Args:
        url: Jira instance URL (Cloud: "https://yoursite.atlassian.net",
             Server: "https://jira.company.com")
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        summary: New summary (optional)
        description: New description (optional)
        priority: New priority (optional)
        labels: New labels list (optional)
        assignee: New assignee (optional)
        custom_fields: Dictionary of custom field values to update (optional)
        cloud: Set to True for Jira Cloud, False for Server/Data Center (default: False)
        
    Returns:
        UpdateIssueResponse confirming update
        
    Example:
        # Update issue on Jira Cloud
        response = update_issue(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",  # Required for Cloud
            summary="Updated: Login button not working",
            priority="Critical",
            cloud=True
        )
        print(response.message)
        
        # Update issue on Jira Server/Data Center
        response = update_issue(
            url="https://jira.corp.company.com",
            api_token="your_personal_access_token",
            issue_key="PROJ-456",
            # username omitted (defaults to "")
            priority="High",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    
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


def delete_issue(
    url: str,
    api_token: str,
    issue_key: str,
    username: str = "",
    delete_subtasks: bool = False,
    cloud: bool = False,
) -> DeleteIssueResponse:
    """
    Delete a Jira issue.
    
    Permanently deletes an issue. Use with caution.
    
    Args:
        url: Jira instance URL (Cloud: "https://yoursite.atlassian.net",
             Server: "https://jira.company.com")
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        delete_subtasks: Whether to delete subtasks (default: False)
        cloud: Set to True for Jira Cloud, False for Server/Data Center (default: False)
        
    Returns:
        DeleteIssueResponse confirming deletion
        
    Example:
        # Delete issue from Jira Cloud
        response = delete_issue(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",  # Required for Cloud
            cloud=True
        )
        print(response.message)
        
        # Delete issue from Jira Server/Data Center
        response = delete_issue(
            url="https://jira.corp.company.com",
            api_token="your_personal_access_token",
            issue_key="PROJ-456",
            # username omitted (defaults to "")
            cloud=False
        )
        
    Warning:
        This operation is permanent and cannot be undone.
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    
    # Delete the issue
    client.delete_issue(issue_key, delete_subtasks=delete_subtasks)
    
    return DeleteIssueResponse(
        issue_key=issue_key,
    )


def search_issues(
    url: str,
    api_token: str,
    jql: str,
    username: str = "",
    start_at: int = 0,
    max_results: int = 50,
    fields: Optional[str] = None,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> SearchIssuesResponse:
    """
    Search for Jira issues using JQL.
    
    Searches for issues using Jira Query Language (JQL).
    
    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        jql: JQL query string
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        start_at: Starting index for results (default: 0)
        max_results: Maximum results to return (default: 50)
        fields: Comma-separated list of fields to return (optional)
        expand: Comma-separated list of parameters to expand (optional)
        cloud: Set to True for Jira Cloud, False for Server/Data Center (default: False)
        
    Returns:
        SearchIssuesResponse with matching issues
        
    Example:
        # Search for open bugs (Jira Cloud with API token)
        response = search_issues(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            jql="project = PROJ AND status = Open AND type = Bug",
            username="user@example.com",  # Required for Cloud
            max_results=100,
            cloud=True
        )
        print(f"Found {response.total} bugs")
        for issue in response.issues:
            print(f"  {issue.key}: {issue.fields.summary}")
            
        # Search for my assigned issues (Server/Data Center with PAT)
        response = search_issues(
            url="https://jira.company.com",
            api_token="your_personal_access_token",
            jql="assignee = currentUser() AND status != Done",
            # username omitted (defaults to "")
            cloud=False
        )
        
        # Search with date range
        response = search_issues(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            jql="created >= -7d AND priority = High",
            username="user@example.com",
            cloud=True
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    
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

