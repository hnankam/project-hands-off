"""Jira Issue Votes Operations.

This module provides tools for managing issue votes:
- Vote for issues
- Remove votes
- Get vote information
"""

from typing import List, Optional
from pydantic import BaseModel, Field
from cache import get_jira_client


# ============================================================================
# Pydantic Models
# ============================================================================

class VoterInfo(BaseModel):
    """Information about a voter."""
    accountId: Optional[str] = Field(None, description="Account ID (Cloud)")
    name: Optional[str] = Field(None, description="Username (Server/DC)")
    displayName: str = Field(..., description="Display name")
    emailAddress: Optional[str] = Field(None, description="Email address")
    active: bool = Field(..., description="Whether user is active")


class VoteIssueResponse(BaseModel):
    """Response for voting for an issue."""
    issue_key: str = Field(..., description="Issue key")
    message: str = Field(..., description="Success message")


class UnvoteIssueResponse(BaseModel):
    """Response for removing a vote from an issue."""
    issue_key: str = Field(..., description="Issue key")
    message: str = Field(..., description="Success message")


class GetVotesResponse(BaseModel):
    """Response for getting votes on an issue."""
    issue_key: str = Field(..., description="Issue key")
    votes: int = Field(..., description="Total number of votes")
    voters: List[VoterInfo] = Field(..., description="List of voters")
    has_voted: bool = Field(..., description="Whether current user has voted")


# ============================================================================
# Tools
# ============================================================================

def vote_issue(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> VoteIssueResponse:
    """
    Vote for an issue.

    Adds a vote from the current user to the specified issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        issue_key: Issue key (e.g., "PROJ-123")
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        VoteIssueResponse with confirmation

    Example:
        # Vote for an issue (Cloud)
        response = vote_issue(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            cloud=True
        )
        print(response.message)

        # Vote for an issue (Server/DC)
        response = vote_issue(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.issue_vote(issue_key)
    
    return VoteIssueResponse(
        issue_key=issue_key,
        message=f"Successfully voted for issue {issue_key}"
    )


def unvote_issue(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> UnvoteIssueResponse:
    """
    Remove vote from an issue.

    Removes the current user's vote from the specified issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        issue_key: Issue key (e.g., "PROJ-123")
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UnvoteIssueResponse with confirmation

    Example:
        # Remove vote (Cloud)
        response = unvote_issue(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            cloud=True
        )
        print(response.message)

        # Remove vote (Server/DC)
        response = unvote_issue(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.issue_unvote(issue_key)
    
    return UnvoteIssueResponse(
        issue_key=issue_key,
        message=f"Successfully removed vote from issue {issue_key}"
    )


def get_votes(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetVotesResponse:
    """
    Get votes for an issue.

    Retrieves vote information for a Jira issue, including total votes and list of voters.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        issue_key: Issue key (e.g., "PROJ-123")
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetVotesResponse with vote information

    Example:
        # Get votes (Cloud)
        response = get_votes(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            cloud=True
        )
        print(f"Total votes: {response.votes}")
        for voter in response.voters:
            print(f"  - {voter.displayName}")

        # Get votes (Server/DC)
        response = get_votes(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            cloud=False
        )
        if response.has_voted:
            print("You have voted for this issue")
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    votes_data = client.get_issue_votes(issue_key)
    
    # Parse voters
    voters = [
        VoterInfo(**voter)
        for voter in votes_data.get('voters', [])
    ]
    
    return GetVotesResponse(
        issue_key=issue_key,
        votes=votes_data.get('votes', 0),
        voters=voters,
        has_voted=votes_data.get('hasVoted', False)
    )

