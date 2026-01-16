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
from cache import get_jira_client


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
    sprints: List[SprintInfo] = Field(default_factory=list, description="List of sprints")
    total: int = Field(0, description="Total number of sprints")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetSprintIssuesResponse(BaseModel):
    """Response for getting sprint issues."""
    board_id: int = Field(..., description="Board ID")
    sprint_id: int = Field(..., description="Sprint ID")
    issues: List[Dict[str, Any]] = Field(default_factory=list, description="List of issues")
    total: int = Field(0, description="Total number of issues")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class CreateSprintResponse(BaseModel):
    """Response for creating a sprint."""
    sprint: Optional[SprintInfo] = Field(None, description="Created sprint")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class UpdateSprintResponse(BaseModel):
    """Response for updating a sprint."""
    sprint_id: int = Field(..., description="Sprint ID")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class AddIssuesToSprintResponse(BaseModel):
    """Response for adding issues to sprint."""
    sprint_id: int = Field(..., description="Sprint ID")
    issue_keys: List[str] = Field(default_factory=list, description="List of issue keys added")
    count: int = Field(0, description="Number of issues added")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


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
    versions: List[VersionInfo] = Field(default_factory=list, description="List of versions")
    total: int = Field(0, description="Total number of versions")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Tools
# ============================================================================

def get_all_sprints_from_board(
    url_credential_key: str,
    token_credential_key: str,
    board_id: int,
    username_credential_key: str = "",
    state: Optional[str] = None,
    start: int = 0,
    limit: int = 50,
    cloud: bool = False,
) -> GetAllSprintsResponse:
    """
    Get all sprints from a board, optionally filtered by state.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        board_id: Board ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        state: Filter by state ("future", "active", "closed") (optional)
        start: Starting index (default: 0)
        limit: Maximum results (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetAllSprintsResponse with list of sprints and pagination info
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
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
    except Exception as e:
        return GetAllSprintsResponse(
            board_id=board_id,
            sprints=[],
            total=0,
            error_message=f"Failed to get sprints: {str(e)}"
        )


def get_all_issues_for_sprint_in_board(
    url_credential_key: str,
    token_credential_key: str,
    board_id: int,
    sprint_id: int,
    username_credential_key: str = "",
    start: int = 0,
    limit: int = 50,
    cloud: bool = False,
) -> GetSprintIssuesResponse:
    """
    Get all issues assigned to a specific sprint in a board.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        board_id: Board ID
        sprint_id: Sprint ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        start: Starting index (default: 0)
        limit: Maximum results (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetSprintIssuesResponse with sprint issues and total count
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
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
    except Exception as e:
        return GetSprintIssuesResponse(
            board_id=board_id,
            sprint_id=sprint_id,
            issues=[],
            total=0,
            error_message=f"Failed to get sprint issues: {str(e)}"
        )


def create_sprint(
    url_credential_key: str,
    token_credential_key: str,
    sprint_name: str,
    origin_board_id: int,
    start_datetime: str,
    end_datetime: str,
    goal: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> CreateSprintResponse:
    """
    Create a new sprint on a board with specified dates and goal.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        sprint_name: Sprint name
        origin_board_id: Board ID where sprint will be created
        start_datetime: Start date/time (ISO format)
        end_datetime: End date/time (ISO format)
        goal: Sprint goal description
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CreateSprintResponse with created sprint information
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
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
    except Exception as e:
        return CreateSprintResponse(
            sprint=None,
            message="",
            error_message=f"Failed to create sprint: {str(e)}"
        )


def update_sprint(
    url_credential_key: str,
    token_credential_key: str,
    sprint_id: int,
    name: str,
    username_credential_key: str = "",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    goal: Optional[str] = None,
    cloud: bool = False,
) -> UpdateSprintResponse:
    """
    Update sprint properties like name, dates, and goal.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        sprint_id: Sprint ID to update
        name: New sprint name
        username_credential_key: Credential key for username (Cloud only, default: "")
        start_date: New start date (ISO format) (optional)
        end_date: New end date (ISO format) (optional)
        goal: New sprint goal (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateSprintResponse with confirmation message
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        client.rename_sprint(sprint_id, name, start_date, end_date)
        
        return UpdateSprintResponse(
            sprint_id=sprint_id,
            message=f"Successfully updated sprint {sprint_id}"
        )
    except Exception as e:
        return UpdateSprintResponse(
            sprint_id=sprint_id,
            message="",
            error_message=f"Failed to update sprint: {str(e)}"
        )


def add_issues_to_sprint(
    url_credential_key: str,
    token_credential_key: str,
    sprint_id: int,
    issue_keys: List[str],
    username_credential_key: str = "",
    cloud: bool = False,
) -> AddIssuesToSprintResponse:
    """
    Add or move issues to a sprint.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        sprint_id: Sprint ID to add issues to
        issue_keys: List of issue keys to add (e.g., ["PROJ-1", "PROJ-2"])
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddIssuesToSprintResponse with confirmation and count of added issues
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        client.add_issues_to_sprint(sprint_id, issue_keys)
        
        return AddIssuesToSprintResponse(
            sprint_id=sprint_id,
            issue_keys=issue_keys,
            count=len(issue_keys),
            message=f"Successfully added {len(issue_keys)} issue(s) to sprint {sprint_id}"
        )
    except Exception as e:
        return AddIssuesToSprintResponse(
            sprint_id=sprint_id,
            issue_keys=[],
            count=0,
            message="",
            error_message=f"Failed to add issues to sprint: {str(e)}"
        )


def get_all_versions_from_board(
    url_credential_key: str,
    token_credential_key: str,
    board_id: int,
    username_credential_key: str = "",
    released: str = "false",
    start: int = 0,
    limit: int = 50,
    cloud: bool = False,
) -> GetBoardVersionsResponse:
    """
    Get all versions (releases) associated with a board.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        board_id: Board ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        released: Filter by release status ("true", "false", or "all") (default: "false")
        start: Starting index (default: 0)
        limit: Maximum results (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardVersionsResponse with list of versions and total count
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
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
    except Exception as e:
        return GetBoardVersionsResponse(
            board_id=board_id,
            versions=[],
            total=0,
            error_message=f"Failed to get board versions: {str(e)}"
        )

