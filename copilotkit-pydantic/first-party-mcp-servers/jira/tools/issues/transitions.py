"""Jira Issue Transitions and Assignment Operations.

This module provides tools for managing issue assignments and workflow transitions:
- Assign issues
- Get available transitions
- Transition issues through workflow
- Set issue status
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from cache import get_jira_client


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
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    assignee: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> AssignIssueResponse:
    """
    Assign an issue to a user.

    Use "-1" to automatically assign, or an empty string to unassign.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        assignee: Account ID (Cloud) or username (Server/DC). Use "-1" for automatic assignment or "" to unassign
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AssignIssueResponse with assignment confirmation message
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.assign_issue(issue_key, assignee)
    
    return AssignIssueResponse(
        issue_key=issue_key,
        assignee=assignee,
        message=f"Successfully assigned issue {issue_key} to {assignee if assignee else 'unassigned'}"
    )


def get_issue_transitions(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetTransitionsResponse:
    """
    Get all workflow transitions available for an issue based on its current status.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetTransitionsResponse with available transitions and current status
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
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
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    transition_id: str,
    username_credential_key: str = "",
    fields: Optional[Dict[str, Any]] = None,
    comment: Optional[str] = None,
    cloud: bool = False,
) -> TransitionIssueResponse:
    """
    Move an issue to a different status using a workflow transition ID.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        transition_id: Transition ID to execute
        username_credential_key: Credential key for username (Cloud only, default: "")
        fields: Optional fields to set during transition (e.g., resolution)
        comment: Optional comment to add during transition
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        TransitionIssueResponse with transition confirmation message
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
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
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    status_name: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> SetStatusResponse:
    """
    Set issue status by name, automatically finding and executing the appropriate transition.
    
    This is a convenience method that finds the correct transition for the desired status.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        status_name: Target status name (e.g., "In Progress", "Done")
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        SetStatusResponse with status change confirmation message
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.set_issue_status(issue_key, status_name)
    
    return SetStatusResponse(
        issue_key=issue_key,
        status=status_name,
        message=f"Successfully set issue {issue_key} status to '{status_name}'"
    )

