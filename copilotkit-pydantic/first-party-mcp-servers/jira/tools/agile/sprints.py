"""Jira Sprint Management Operations.

This module provides tools for managing Agile sprints:
- Get sprints from board
- Get issues for sprint
- Create and update sprints
- Add issues to sprint
- Get versions from board
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from ..cache import get_jira_client


# ============================================================================
# Pydantic Models
# ============================================================================

class SprintInfo(BaseModel):
    """Sprint information."""
    id: int = Field(..., description="Sprint ID")
    name: str = Field(..., description="Sprint name")
    state: str = Field(..., description="Sprint state (future, active, closed)")
    startDate: Optional[str] = Field(None, description="Start date")
    endDate: Optional[str] = Field(None, description="End date")
    completeDate: Optional[str] = Field(None, description="Completion date")
    originBoardId: Optional[int] = Field(None, description="Origin board ID")
    goal: Optional[str] = Field(None, description="Sprint goal")


class GetAllSprintsResponse(BaseModel):
    """Response for getting all sprints."""
    board_id: int = Field(..., description="Board ID")
    sprints: List[SprintInfo] = Field(..., description="List of sprints")
    total: int = Field(..., description="Total number of sprints")


class GetSprintIssuesResponse(BaseModel):
    """Response for getting sprint issues."""
    board_id: int = Field(..., description="Board ID")
    sprint_id: int = Field(..., description="Sprint ID")
    issues: List[Dict[str, Any]] = Field(..., description="List of issues")
    total: int = Field(..., description="Total number of issues")


class CreateSprintResponse(BaseModel):
    """Response for creating a sprint."""
    sprint: SprintInfo = Field(..., description="Created sprint")
    message: str = Field(..., description="Success message")


class UpdateSprintResponse(BaseModel):
    """Response for updating a sprint."""
    sprint_id: int = Field(..., description="Sprint ID")
    message: str = Field(..., description="Success message")


class AddIssuesToSprintResponse(BaseModel):
    """Response for adding issues to sprint."""
    sprint_id: int = Field(..., description="Sprint ID")
    issue_keys: List[str] = Field(..., description="List of issue keys added")
    count: int = Field(..., description="Number of issues added")
    message: str = Field(..., description="Success message")


class VersionInfo(BaseModel):
    """Version information."""
    id: str = Field(..., description="Version ID")
    name: str = Field(..., description="Version name")
    released: bool = Field(..., description="Whether version is released")
    archived: bool = Field(..., description="Whether version is archived")
    releaseDate: Optional[str] = Field(None, description="Release date")


class GetBoardVersionsResponse(BaseModel):
    """Response for getting board versions."""
    board_id: int = Field(..., description="Board ID")
    versions: List[VersionInfo] = Field(..., description="List of versions")
    total: int = Field(..., description="Total number of versions")


# ============================================================================
# Tools
# ============================================================================

def get_all_sprints_from_board(
    url: str,
    api_token: str,
    board_id: int,
    username: str = "",
    state: Optional[str] = None,
    start: int = 0,
    limit: int = 50,
    cloud: bool = False,
) -> GetAllSprintsResponse:
    """
    Get all sprints from a board.

    Retrieves all sprints associated with a board, optionally filtered by state.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        board_id: Board ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        state: Filter by state ("future", "active", "closed") (optional)
        start: Starting index (default: 0)
        limit: Maximum results (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetAllSprintsResponse with list of sprints

    Example:
        # Get all sprints (Cloud)
        response = get_all_sprints_from_board(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            board_id=123,
            username="user@example.com",
            cloud=True
        )
        for sprint in response.sprints:
            print(f"{sprint.name} - {sprint.state}")

        # Get active sprints only (Server/DC)
        response = get_all_sprints_from_board(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            board_id=456,
            state="active",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    sprints_data = client.get_all_sprints_from_board(
        board_id,
        state=state,
        start=start,
        limit=limit
    )
    
    # Parse sprints
    sprints = [SprintInfo(**sprint) for sprint in sprints_data.get('values', [])]
    
    return GetAllSprintsResponse(
        board_id=board_id,
        sprints=sprints,
        total=len(sprints)
    )


def get_all_issues_for_sprint_in_board(
    url: str,
    api_token: str,
    board_id: int,
    sprint_id: int,
    username: str = "",
    start: int = 0,
    limit: int = 50,
    cloud: bool = False,
) -> GetSprintIssuesResponse:
    """
    Get all issues for a sprint in a board.

    Retrieves all issues that belong to a specific sprint on a board.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        board_id: Board ID
        sprint_id: Sprint ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        start: Starting index (default: 0)
        limit: Maximum results (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetSprintIssuesResponse with sprint issues

    Example:
        # Get sprint issues (Cloud)
        response = get_all_issues_for_sprint_in_board(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            board_id=123,
            sprint_id=456,
            username="user@example.com",
            cloud=True
        )
        print(f"Sprint has {response.total} issues")
        for issue in response.issues:
            print(f"  {issue['key']}: {issue['fields']['summary']}")

        # Get sprint issues (Server/DC)
        response = get_all_issues_for_sprint_in_board(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            board_id=456,
            sprint_id=789,
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    issues_data = client.get_all_issues_for_sprint_in_board(
        board_id,
        sprint_id,
        start=start,
        limit=limit
    )
    
    return GetSprintIssuesResponse(
        board_id=board_id,
        sprint_id=sprint_id,
        issues=issues_data.get('issues', []),
        total=issues_data.get('total', 0)
    )


def create_sprint(
    url: str,
    api_token: str,
    sprint_name: str,
    origin_board_id: int,
    start_datetime: str,
    end_datetime: str,
    goal: str,
    username: str = "",
    cloud: bool = False,
) -> CreateSprintResponse:
    """
    Create a new sprint.

    Creates a new sprint on a board with specified dates and goal.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        sprint_name: Sprint name
        origin_board_id: Board ID where sprint will be created
        start_datetime: Start date/time (ISO format)
        end_datetime: End date/time (ISO format)
        goal: Sprint goal description
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CreateSprintResponse with created sprint

    Example:
        # Create sprint (Cloud)
        response = create_sprint(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            sprint_name="Sprint 42",
            origin_board_id=123,
            start_datetime="2025-01-01T00:00:00.000Z",
            end_datetime="2025-01-14T23:59:59.000Z",
            goal="Complete user authentication feature",
            username="user@example.com",
            cloud=True
        )
        print(f"Created: {response.sprint.name} (ID: {response.sprint.id})")

        # Create sprint (Server/DC)
        response = create_sprint(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            sprint_name="Q1 Sprint 1",
            origin_board_id=456,
            start_datetime="2025-01-06T09:00:00.000Z",
            end_datetime="2025-01-20T17:00:00.000Z",
            goal="Launch MVP",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    sprint_data = client.create_sprint(
        sprint_name,
        origin_board_id,
        start_datetime,
        end_datetime,
        goal
    )
    
    # Parse sprint
    sprint = SprintInfo(**sprint_data)
    
    return CreateSprintResponse(
        sprint=sprint,
        message=f"Successfully created sprint {sprint_name}"
    )


def update_sprint(
    url: str,
    api_token: str,
    sprint_id: int,
    name: str,
    username: str = "",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    goal: Optional[str] = None,
    cloud: bool = False,
) -> UpdateSprintResponse:
    """
    Update an existing sprint.

    Updates sprint properties like name, dates, and goal.
    Also known as rename_sprint in the API.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        sprint_id: Sprint ID to update
        name: New sprint name
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        start_date: New start date (ISO format) (optional)
        end_date: New end date (ISO format) (optional)
        goal: New sprint goal (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateSprintResponse with confirmation

    Example:
        # Update sprint name and dates (Cloud)
        response = update_sprint(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            sprint_id=456,
            name="Sprint 42 - Extended",
            username="user@example.com",
            end_date="2025-01-21T23:59:59.000Z",
            cloud=True
        )

        # Update sprint goal (Server/DC)
        response = update_sprint(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            sprint_id=789,
            name="Q1 Sprint 1",
            goal="Complete authentication and launch MVP",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.rename_sprint(sprint_id, name, start_date, end_date)
    
    return UpdateSprintResponse(
        sprint_id=sprint_id,
        message=f"Successfully updated sprint {sprint_id}"
    )


def add_issues_to_sprint(
    url: str,
    api_token: str,
    sprint_id: int,
    issue_keys: List[str],
    username: str = "",
    cloud: bool = False,
) -> AddIssuesToSprintResponse:
    """
    Add or move issues to a sprint.

    Adds multiple issues to a sprint or moves them from another sprint.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        sprint_id: Sprint ID to add issues to
        issue_keys: List of issue keys to add (e.g., ["PROJ-1", "PROJ-2"])
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddIssuesToSprintResponse with confirmation

    Example:
        # Add issues to sprint (Cloud)
        response = add_issues_to_sprint(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            sprint_id=456,
            issue_keys=["PROJ-123", "PROJ-124", "PROJ-125"],
            username="user@example.com",
            cloud=True
        )
        print(f"Added {response.count} issues to sprint")

        # Move issues to sprint (Server/DC)
        response = add_issues_to_sprint(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            sprint_id=789,
            issue_keys=["DGROWTH-100", "DGROWTH-101"],
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.add_issues_to_sprint(sprint_id, issue_keys)
    
    return AddIssuesToSprintResponse(
        sprint_id=sprint_id,
        issue_keys=issue_keys,
        count=len(issue_keys),
        message=f"Successfully added {len(issue_keys)} issue(s) to sprint {sprint_id}"
    )


def get_all_versions_from_board(
    url: str,
    api_token: str,
    board_id: int,
    username: str = "",
    released: str = "false",
    start: int = 0,
    limit: int = 50,
    cloud: bool = False,
) -> GetBoardVersionsResponse:
    """
    Get all versions from a board.

    Retrieves all versions (releases) associated with a board.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        board_id: Board ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        released: Filter by release status ("true", "false", or "all") (default: "false")
        start: Starting index (default: 0)
        limit: Maximum results (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardVersionsResponse with list of versions

    Example:
        # Get unreleased versions (Cloud)
        response = get_all_versions_from_board(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            board_id=123,
            username="user@example.com",
            released="false",
            cloud=True
        )
        for version in response.versions:
            print(f"{version.name} - Release: {version.releaseDate}")

        # Get all versions (Server/DC)
        response = get_all_versions_from_board(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            board_id=456,
            released="all",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    versions_data = client.get_all_versions_from_board(
        board_id,
        released=released,
        start=start,
        limit=limit
    )
    
    # Parse versions
    versions = [VersionInfo(**ver) for ver in versions_data.get('values', [])]
    
    return GetBoardVersionsResponse(
        board_id=board_id,
        versions=versions,
        total=len(versions)
    )

