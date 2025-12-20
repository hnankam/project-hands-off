"""Jira Issue Transitions and Assignment Operations.

This module provides tools for managing issue assignments and workflow transitions:
- Assign issues
- Get available transitions
- Transition issues through workflow
- Set issue status
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from ...cache import get_jira_client


# ============================================================================
# Pydantic Models
# ============================================================================

class AssignIssueResponse(BaseModel):
    """Response for assigning an issue."""
    issue_key: str = Field(..., description="Issue key")
    assignee: str = Field(..., description="Assignee account ID or username")
    message: str = Field(..., description="Success message")


class TransitionInfo(BaseModel):
    """Information about an issue transition."""
    id: str = Field(..., description="Transition ID")
    name: str = Field(..., description="Transition name")
    to: Dict[str, Any] = Field(..., description="Target status information")
    hasScreen: Optional[bool] = Field(None, description="Whether transition has a screen")
    isGlobal: Optional[bool] = Field(None, description="Whether transition is global")
    isInitial: Optional[bool] = Field(None, description="Whether transition is initial")
    isConditional: Optional[bool] = Field(None, description="Whether transition is conditional")


class GetTransitionsResponse(BaseModel):
    """Response for getting available transitions."""
    issue_key: str = Field(..., description="Issue key")
    transitions: List[TransitionInfo] = Field(..., description="List of available transitions")
    current_status: Optional[str] = Field(None, description="Current issue status")


class TransitionIssueResponse(BaseModel):
    """Response for transitioning an issue."""
    issue_key: str = Field(..., description="Issue key")
    transition_id: str = Field(..., description="Transition ID used")
    message: str = Field(..., description="Success message")


class SetStatusResponse(BaseModel):
    """Response for setting issue status."""
    issue_key: str = Field(..., description="Issue key")
    status: str = Field(..., description="New status name")
    message: str = Field(..., description="Success message")


# ============================================================================
# Tools
# ============================================================================

def assign_issue(
    url: str,
    api_token: str,
    issue_key: str,
    assignee: str,
    username: str = "",
    cloud: bool = False,
) -> AssignIssueResponse:
    """
    Assign an issue to a user.

    Assigns (or reassigns) an issue to a specific user. Use "-1" to automatically assign,
    or an empty string to unassign.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        assignee: Account ID (Cloud) or username (Server/DC). Use "-1" for automatic assignment or "" to unassign
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AssignIssueResponse with assignment confirmation

    Example:
        # Assign issue to user (Cloud)
        response = assign_issue(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            assignee="5b10a2844c20165700ede21g",  # Account ID
            username="user@example.com",
            cloud=True
        )

        # Unassign issue (Server/DC)
        response = assign_issue(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            assignee="",  # Empty string to unassign
            cloud=False
        )

        # Auto-assign issue (Cloud)
        response = assign_issue(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            assignee="-1",  # Automatic assignment
            username="user@example.com",
            cloud=True
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.assign_issue(issue_key, assignee)
    
    return AssignIssueResponse(
        issue_key=issue_key,
        assignee=assignee,
        message=f"Successfully assigned issue {issue_key} to {assignee if assignee else 'unassigned'}"
    )


def get_issue_transitions(
    url: str,
    api_token: str,
    issue_key: str,
    username: str = "",
    cloud: bool = False,
) -> GetTransitionsResponse:
    """
    Get available transitions for an issue.

    Retrieves all workflow transitions available for an issue based on its current status.
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
        GetTransitionsResponse with available transitions

    Example:
        # Get available transitions (Cloud)
        response = get_issue_transitions(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            cloud=True
        )
        for transition in response.transitions:
            print(f"{transition.id}: {transition.name} -> {transition.to['name']}")

        # Get available transitions (Server/DC)
        response = get_issue_transitions(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    transitions_data = client.get_issue_transitions(issue_key)
    
    # Parse transitions
    transitions = [
        TransitionInfo(**transition)
        for transition in transitions_data.get('transitions', [])
    ]
    
    return GetTransitionsResponse(
        issue_key=issue_key,
        transitions=transitions,
        current_status=transitions_data.get('currentStatus')
    )


def transition_issue(
    url: str,
    api_token: str,
    issue_key: str,
    transition_id: str,
    username: str = "",
    fields: Optional[Dict[str, Any]] = None,
    comment: Optional[str] = None,
    cloud: bool = False,
) -> TransitionIssueResponse:
    """
    Transition an issue through workflow.

    Moves an issue to a different status using a workflow transition ID.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        transition_id: Transition ID to execute
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        fields: Optional fields to set during transition (e.g., resolution)
        comment: Optional comment to add during transition
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        TransitionIssueResponse with transition confirmation

    Example:
        # Transition issue to "In Progress" (Cloud)
        response = transition_issue(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            transition_id="21",  # ID for "Start Progress"
            username="user@example.com",
            comment="Starting work on this issue",
            cloud=True
        )

        # Transition to "Done" with resolution (Server/DC)
        response = transition_issue(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            transition_id="31",  # ID for "Done"
            fields={"resolution": {"name": "Fixed"}},
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    
    # Build transition data
    transition_data = {"transition": {"id": transition_id}}
    if fields:
        transition_data["fields"] = fields
    if comment:
        transition_data["update"] = {
            "comment": [{"add": {"body": comment}}]
        }
    
    client.issue_transition(issue_key, transition_id)
    
    return TransitionIssueResponse(
        issue_key=issue_key,
        transition_id=transition_id,
        message=f"Successfully transitioned issue {issue_key} using transition {transition_id}"
    )


def set_issue_status(
    url: str,
    api_token: str,
    issue_key: str,
    status_name: str,
    username: str = "",
    cloud: bool = False,
) -> SetStatusResponse:
    """
    Set issue status by name.

    Sets the issue status to a specific value by finding and executing the appropriate transition.
    This is a convenience method that automatically finds the correct transition for the desired status.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        status_name: Target status name (e.g., "In Progress", "Done")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        SetStatusResponse with status change confirmation

    Example:
        # Set status to "In Progress" (Cloud)
        response = set_issue_status(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            status_name="In Progress",
            username="user@example.com",
            cloud=True
        )

        # Set status to "Done" (Server/DC)
        response = set_issue_status(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            status_name="Done",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.set_issue_status(issue_key, status_name)
    
    return SetStatusResponse(
        issue_key=issue_key,
        status=status_name,
        message=f"Successfully set issue {issue_key} status to '{status_name}'"
    )

