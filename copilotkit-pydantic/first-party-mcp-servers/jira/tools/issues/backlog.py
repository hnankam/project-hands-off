"""Jira Backlog and Epic Operations.

This module provides tools for managing backlog and epic operations:
- Move issues to backlog
- Add issues to backlog
- Get epic issues
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from cache import get_jira_client


# ============================================================================
# Pydantic Models
# ============================================================================

class MoveToBacklogResponse(BaseModel):
    """Response for moving issues to backlog."""
    issue_keys: List[str] = Field(..., description="List of moved issue keys")
    count: int = Field(..., description="Number of issues moved")
    message: str = Field(..., description="Success message")


class AddToBacklogResponse(BaseModel):
    """Response for adding issues to backlog."""
    issue_keys: List[str] = Field(..., description="List of added issue keys")
    count: int = Field(..., description="Number of issues added")
    message: str = Field(..., description="Success message")


class EpicIssueModel(BaseModel):
    """Epic issue model."""
    id: str = Field(..., description="Issue ID")
    key: str = Field(..., description="Issue key")
    self: str = Field(..., description="Issue self URL")
    fields: Dict[str, Any] = Field(..., description="Issue fields")


class GetEpicIssuesResponse(BaseModel):
    """Response for getting epic issues."""
    epic_key: str = Field(..., description="Epic key")
    issues: List[EpicIssueModel] = Field(..., description="List of issues in the epic")
    total: int = Field(..., description="Total number of issues")


# ============================================================================
# Tools
# ============================================================================

def move_issues_to_backlog(
    url_credential_key: str,
    token_credential_key: str,
    issue_keys: List[str],
    username_credential_key: str = "",
    cloud: bool = False,
) -> MoveToBacklogResponse:
    """
    Move issues to backlog.

    Moves one or more issues to the backlog (removing them from active sprint if applicable).
    This is typically used in Agile boards to move issues out of the current sprint.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        issue_keys: List of issue keys to move (e.g., ["PROJ-123", "PROJ-124"])
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        MoveToBacklogResponse with operation confirmation

    Example:
        # Move issues to backlog (Cloud)
        response = move_issues_to_backlog(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_keys=["PROJ-123", "PROJ-124", "PROJ-125"],
            username="user@example.com",
            cloud=True
        )
        print(f"Moved {response.count} issues to backlog")

        # Move issues to backlog (Server/DC)
        response = move_issues_to_backlog(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_keys=["DGROWTH-100", "DGROWTH-101"],
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.move_issues_to_backlog(issue_keys)
    
    return MoveToBacklogResponse(
        issue_keys=issue_keys,
        count=len(issue_keys),
        message=f"Successfully moved {len(issue_keys)} issue(s) to backlog"
    )


def add_issues_to_backlog(
    url_credential_key: str,
    token_credential_key: str,
    issue_keys: List[str],
    username_credential_key: str = "",
    cloud: bool = False,
) -> AddToBacklogResponse:
    """
    Add issues to backlog.

    Adds one or more issues to the backlog.
    This is typically used in Agile boards to add new issues to the backlog.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        issue_keys: List of issue keys to add (e.g., ["PROJ-123", "PROJ-124"])
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddToBacklogResponse with operation confirmation

    Example:
        # Add issues to backlog (Cloud)
        response = add_issues_to_backlog(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_keys=["PROJ-126", "PROJ-127"],
            username="user@example.com",
            cloud=True
        )
        print(f"Added {response.count} issues to backlog")

        # Add issues to backlog (Server/DC)
        response = add_issues_to_backlog(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_keys=["DGROWTH-102"],
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.add_issues_to_backlog(issue_keys)
    
    return AddToBacklogResponse(
        issue_keys=issue_keys,
        count=len(issue_keys),
        message=f"Successfully added {len(issue_keys)} issue(s) to backlog"
    )


def get_epic_issues(
    url_credential_key: str,
    token_credential_key: str,
    epic_key: str,
    username_credential_key: str = "",
    fields: Optional[str] = "*all",
    start_at: int = 0,
    max_results: int = 50,
    cloud: bool = False,
) -> GetEpicIssuesResponse:
    """
    Get all issues within an epic.

    Retrieves all issues that belong to a specific epic.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        epic_key: Epic key (e.g., "PROJ-1")
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        fields: Comma-separated list of fields to return (default: "*all")
        start_at: Starting index for pagination (default: 0)
        max_results: Maximum results per page (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetEpicIssuesResponse with all epic issues

    Example:
        # Get epic issues (Cloud)
        response = get_epic_issues(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            epic_key="PROJ-1",
            username="user@example.com",
            cloud=True
        )
        print(f"Epic has {response.total} issues:")
        for issue in response.issues:
            print(f"  - {issue.key}: {issue.fields.get('summary')}")

        # Get epic issues with specific fields (Server/DC)
        response = get_epic_issues(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            epic_key="DGROWTH-1",
            fields="summary,status,assignee",
            max_results=100,
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    issues_data = client.epic_issues(
        epic_key,
        start=start_at,
        limit=max_results,
        fields=fields
    )
    
    # Parse issues
    issues = [
        EpicIssueModel(**issue)
        for issue in issues_data.get('issues', [])
    ]
    
    return GetEpicIssuesResponse(
        epic_key=epic_key,
        issues=issues,
        total=issues_data.get('total', len(issues))
    )

