"""Jira Issue Worklogs Operations.

This module provides tools for managing issue worklogs:
- Get worklogs
- Add worklog
- Get specific worklog
- Update worklog
- Delete worklog
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from ...cache import get_jira_client


# ============================================================================
# Pydantic Models
# ============================================================================

class WorklogAuthor(BaseModel):
    """Worklog author information."""
    accountId: Optional[str] = Field(None, description="Account ID (Cloud)")
    name: Optional[str] = Field(None, description="Username (Server/DC)")
    displayName: str = Field(..., description="Display name")
    emailAddress: Optional[str] = Field(None, description="Email address")
    active: bool = Field(..., description="Whether user is active")


class WorklogModel(BaseModel):
    """Jira worklog model."""
    id: str = Field(..., description="Worklog ID")
    author: Optional[WorklogAuthor] = Field(None, description="Worklog author")
    comment: Optional[str] = Field(None, description="Worklog comment")
    started: str = Field(..., description="Start timestamp")
    timeSpent: str = Field(..., description="Time spent (human readable, e.g., '3h 20m')")
    timeSpentSeconds: int = Field(..., description="Time spent in seconds")
    updateAuthor: Optional[WorklogAuthor] = Field(None, description="Last update author")
    updated: str = Field(..., description="Last update timestamp")


class GetWorklogsResponse(BaseModel):
    """Response for getting worklogs."""
    issue_key: str = Field(..., description="Issue key")
    worklogs: List[WorklogModel] = Field(..., description="List of worklogs")
    total: int = Field(..., description="Total number of worklogs")


class AddWorklogResponse(BaseModel):
    """Response for adding a worklog."""
    issue_key: str = Field(..., description="Issue key")
    worklog: WorklogModel = Field(..., description="Created worklog")
    message: str = Field(..., description="Success message")


class GetWorklogResponse(BaseModel):
    """Response for getting a specific worklog."""
    issue_key: str = Field(..., description="Issue key")
    worklog: WorklogModel = Field(..., description="Worklog details")


class UpdateWorklogResponse(BaseModel):
    """Response for updating a worklog."""
    issue_key: str = Field(..., description="Issue key")
    worklog_id: str = Field(..., description="Worklog ID")
    worklog: WorklogModel = Field(..., description="Updated worklog")
    message: str = Field(..., description="Success message")


class DeleteWorklogResponse(BaseModel):
    """Response for deleting a worklog."""
    issue_key: str = Field(..., description="Issue key")
    worklog_id: str = Field(..., description="Worklog ID")
    message: str = Field(..., description="Success message")


# ============================================================================
# Tools
# ============================================================================

def get_worklogs(
    url: str,
    api_token: str,
    issue_key: str,
    username: str = "",
    cloud: bool = False,
) -> GetWorklogsResponse:
    """
    Get all worklogs for an issue.

    Retrieves all time tracking worklogs associated with a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetWorklogsResponse with all worklogs

    Example:
        # Get worklogs (Cloud)
        response = get_worklogs(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            cloud=True
        )
        for worklog in response.worklogs:
            print(f"{worklog.author.displayName}: {worklog.timeSpent}")

        # Get worklogs (Server/DC)
        response = get_worklogs(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            cloud=False
        )
        print(f"Total worklogs: {response.total}")
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    worklogs_data = client.get_issue_worklogs(issue_key)
    
    # Parse worklogs
    worklogs = [
        WorklogModel(**worklog)
        for worklog in worklogs_data.get('worklogs', [])
    ]
    
    return GetWorklogsResponse(
        issue_key=issue_key,
        worklogs=worklogs,
        total=len(worklogs)
    )


def add_worklog(
    url: str,
    api_token: str,
    issue_key: str,
    time_spent: str,
    username: str = "",
    comment: Optional[str] = None,
    started: Optional[str] = None,
    adjust_estimate: Optional[str] = None,
    new_estimate: Optional[str] = None,
    reduce_by: Optional[str] = None,
    cloud: bool = False,
) -> AddWorklogResponse:
    """
    Add a worklog to an issue.

    Creates a new time tracking worklog entry for a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        time_spent: Time spent in Jira format (e.g., "3h 20m", "1d 2h", "45m")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        comment: Optional comment for the worklog
        started: Optional start timestamp (ISO 8601 format or Jira date format)
        adjust_estimate: How to adjust the estimate ("auto", "new", "leave", "manual")
        new_estimate: New estimate if adjust_estimate="new" (e.g., "2d")
        reduce_by: Reduce estimate by this amount if adjust_estimate="manual" (e.g., "1h")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddWorklogResponse with created worklog

    Example:
        # Add worklog (Cloud)
        response = add_worklog(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            time_spent="3h 20m",
            username="user@example.com",
            comment="Worked on implementing new feature",
            cloud=True
        )

        # Add worklog with estimate adjustment (Server/DC)
        response = add_worklog(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            time_spent="2h",
            comment="Bug fix",
            adjust_estimate="auto",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    worklog_data = client.add_worklog(
        issue_key,
        time_spent=time_spent,
        comment=comment,
        started=started,
        adjust_estimate=adjust_estimate,
        new_estimate=new_estimate,
        reduce_by=reduce_by
    )
    
    # Parse worklog
    worklog = WorklogModel(**worklog_data)
    
    return AddWorklogResponse(
        issue_key=issue_key,
        worklog=worklog,
        message=f"Successfully added worklog of {time_spent} to issue {issue_key}"
    )


def get_worklog(
    url: str,
    api_token: str,
    issue_key: str,
    worklog_id: str,
    username: str = "",
    cloud: bool = False,
) -> GetWorklogResponse:
    """
    Get a specific worklog.

    Retrieves details of a specific worklog entry.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        worklog_id: Worklog ID to retrieve
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetWorklogResponse with worklog details

    Example:
        # Get worklog (Cloud)
        response = get_worklog(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            worklog_id="10000",
            username="user@example.com",
            cloud=True
        )
        print(f"Time spent: {response.worklog.timeSpent}")

        # Get worklog (Server/DC)
        response = get_worklog(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            worklog_id="20000",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    worklog_data = client.get_issue_worklog(issue_key, worklog_id)
    
    # Parse worklog
    worklog = WorklogModel(**worklog_data)
    
    return GetWorklogResponse(
        issue_key=issue_key,
        worklog=worklog
    )


def update_worklog(
    url: str,
    api_token: str,
    issue_key: str,
    worklog_id: str,
    time_spent: str,
    username: str = "",
    comment: Optional[str] = None,
    started: Optional[str] = None,
    cloud: bool = False,
) -> UpdateWorklogResponse:
    """
    Update an existing worklog.

    Updates the details of an existing worklog entry.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        worklog_id: Worklog ID to update
        time_spent: New time spent in Jira format (e.g., "3h 20m")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        comment: New comment for the worklog (optional)
        started: New start timestamp (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateWorklogResponse with updated worklog

    Example:
        # Update worklog (Cloud)
        response = update_worklog(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            worklog_id="10000",
            time_spent="4h",
            username="user@example.com",
            comment="Updated time spent",
            cloud=True
        )

        # Update worklog (Server/DC)
        response = update_worklog(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            worklog_id="20000",
            time_spent="2h 30m",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    worklog_data = client.update_issue_worklog(
        issue_key,
        worklog_id,
        time_spent=time_spent,
        comment=comment,
        started=started
    )
    
    # Parse worklog
    worklog = WorklogModel(**worklog_data)
    
    return UpdateWorklogResponse(
        issue_key=issue_key,
        worklog_id=worklog_id,
        worklog=worklog,
        message=f"Successfully updated worklog {worklog_id} for issue {issue_key}"
    )


def delete_worklog(
    url: str,
    api_token: str,
    issue_key: str,
    worklog_id: str,
    username: str = "",
    cloud: bool = False,
) -> DeleteWorklogResponse:
    """
    Delete a worklog from an issue.

    Removes a worklog entry from a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        worklog_id: Worklog ID to delete
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteWorklogResponse with deletion confirmation

    Example:
        # Delete worklog (Cloud)
        response = delete_worklog(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            worklog_id="10000",
            username="user@example.com",
            cloud=True
        )

        # Delete worklog (Server/DC)
        response = delete_worklog(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            worklog_id="20000",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.delete_issue_worklog(issue_key, worklog_id)
    
    return DeleteWorklogResponse(
        issue_key=issue_key,
        worklog_id=worklog_id,
        message=f"Successfully deleted worklog {worklog_id} from issue {issue_key}"
    )

