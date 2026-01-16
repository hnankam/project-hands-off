"""Jira Issue Links and Watchers Operations.

This module provides tools for managing issue links and watchers:
- Link issues
- Get/create/update/delete remote links
- Get/add/remove watchers
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from cache import get_jira_client


# ============================================================================
# Pydantic Models - Links
# ============================================================================

class IssueLinkResponse(BaseModel):
    """Response for linking issues."""
    link_type: str = Field(..., description="Link type name")
    inward_issue: str = Field(..., description="Inward issue key")
    outward_issue: str = Field(..., description="Outward issue key")
    message: str = Field(..., description="Success message")


class RemoteLinkInfo(BaseModel):
    """Information about a remote link."""
    id: int = Field(..., description="Remote link ID")
    globalId: Optional[str] = Field(None, description="Global ID")
    application: Optional[Dict[str, Any]] = Field(None, description="Application info")
    relationship: Optional[str] = Field(None, description="Relationship description")
    object: Dict[str, Any] = Field(..., description="Remote link object")


class GetRemoteLinksResponse(BaseModel):
    """Response for getting remote links."""
    issue_key: str = Field(..., description="Issue key")
    links: List[RemoteLinkInfo] = Field(..., description="List of remote links")
    total: int = Field(..., description="Total number of links")


class CreateRemoteLinkResponse(BaseModel):
    """Response for creating a remote link."""
    issue_key: str = Field(..., description="Issue key")
    link_id: int = Field(..., description="Created link ID")
    message: str = Field(..., description="Success message")


class UpdateRemoteLinkResponse(BaseModel):
    """Response for updating a remote link."""
    issue_key: str = Field(..., description="Issue key")
    link_id: int = Field(..., description="Link ID")
    message: str = Field(..., description="Success message")


class DeleteRemoteLinkResponse(BaseModel):
    """Response for deleting a remote link."""
    issue_key: str = Field(..., description="Issue key")
    link_id: int = Field(..., description="Link ID")
    message: str = Field(..., description="Success message")


# ============================================================================
# Pydantic Models - Watchers
# ============================================================================

class WatcherInfo(BaseModel):
    """Information about a watcher."""
    accountId: Optional[str] = Field(None, description="Account ID (Cloud)")
    name: Optional[str] = Field(None, description="Username (Server/DC)")
    displayName: str = Field(..., description="Display name")
    emailAddress: Optional[str] = Field(None, description="Email address")
    active: bool = Field(..., description="Whether user is active")


class GetWatchersResponse(BaseModel):
    """Response for getting watchers."""
    issue_key: str = Field(..., description="Issue key")
    watchers: List[WatcherInfo] = Field(..., description="List of watchers")
    watching_count: int = Field(..., description="Total watching count")


class AddWatcherResponse(BaseModel):
    """Response for adding a watcher."""
    issue_key: str = Field(..., description="Issue key")
    watcher: str = Field(..., description="Watcher account ID or username")
    message: str = Field(..., description="Success message")


class RemoveWatcherResponse(BaseModel):
    """Response for removing a watcher."""
    issue_key: str = Field(..., description="Issue key")
    watcher: str = Field(..., description="Watcher account ID or username")
    message: str = Field(..., description="Success message")


# ============================================================================
# Tools - Links
# ============================================================================

def link_issues(
    url_credential_key: str,
    token_credential_key: str,
    link_type: str,
    inward_issue: str,
    outward_issue: str,
    username_credential_key: str = "",
    comment: Optional[str] = None,
    cloud: bool = False,
) -> IssueLinkResponse:
    """
    Create a link between two issues.

    Links two Jira issues together using a specified link type (e.g., "blocks", "duplicates").
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        link_type: Link type name (e.g., "Blocks", "Duplicates", "Relates")
        inward_issue: Inward issue key
        outward_issue: Outward issue key
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        comment: Optional comment for the link
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        IssueLinkResponse with link confirmation

    Example:
        # Link issues (Cloud)
        response = link_issues(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            link_type="Blocks",
            inward_issue="PROJ-123",
            outward_issue="PROJ-124",
            username="user@example.com",
            comment="Blocking relationship",
            cloud=True
        )

        # Link as duplicate (Server/DC)
        response = link_issues(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            link_type="Duplicate",
            inward_issue="DGROWTH-100",
            outward_issue="DGROWTH-101",
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.issue_link(link_type, inward_issue, outward_issue, comment=comment)
    
    return IssueLinkResponse(
        link_type=link_type,
        inward_issue=inward_issue,
        outward_issue=outward_issue,
        message=f"Successfully linked {inward_issue} and {outward_issue} with '{link_type}'"
    )


def get_remote_links(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetRemoteLinksResponse:
    """
    Get remote links for an issue.

    Retrieves all remote (external) links associated with a Jira issue.
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
        GetRemoteLinksResponse with all remote links

    Example:
        # Get remote links (Cloud)
        response = get_remote_links(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            cloud=True
        )
        for link in response.links:
            print(f"Link: {link.object.get('title')} -> {link.object.get('url')}")

        # Get remote links (Server/DC)
        response = get_remote_links(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    links_data = client.get_issue_remote_links(issue_key)
    
    # Parse remote links
    links = [RemoteLinkInfo(**link) for link in links_data]
    
    return GetRemoteLinksResponse(
        issue_key=issue_key,
        links=links,
        total=len(links)
    )


def create_remote_link(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    link_url: str,
    title: str,
    username_credential_key: str = "",
    summary: Optional[str] = None,
    icon_url: Optional[str] = None,
    cloud: bool = False,
) -> CreateRemoteLinkResponse:
    """
    Create a remote link for an issue.

    Creates a new remote (external) link on a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        issue_key: Issue key (e.g., "PROJ-123")
        link_url: URL of the remote resource
        title: Title of the link
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        summary: Optional summary of the link
        icon_url: Optional icon URL
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CreateRemoteLinkResponse with created link ID

    Example:
        # Create remote link to GitHub PR (Cloud)
        response = create_remote_link(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            link_url="https://github.com/org/repo/pull/42",
            title="PR #42: Fix login bug",
            username="user@example.com",
            summary="Pull request fixing the login issue",
            cloud=True
        )

        # Create remote link to documentation (Server/DC)
        response = create_remote_link(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            link_url="https://docs.company.com/spec",
            title="Technical Specification",
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
    # Build link object
    link_object = {
        "url": link_url,
        "title": title
    }
    if summary:
        link_object["summary"] = summary
    if icon_url:
        link_object["icon"] = {"url16x16": icon_url}
    
    result = client.create_issue_remote_links(issue_key, {"object": link_object})
    
    return CreateRemoteLinkResponse(
        issue_key=issue_key,
        link_id=result.get("id", 0),
        message=f"Successfully created remote link for issue {issue_key}"
    )


def update_remote_link(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    link_id: int,
    link_url: str,
    title: str,
    username_credential_key: str = "",
    summary: Optional[str] = None,
    icon_url: Optional[str] = None,
    cloud: bool = False,
) -> UpdateRemoteLinkResponse:
    """
    Update a remote link for an issue.

    Updates an existing remote (external) link on a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        issue_key: Issue key (e.g., "PROJ-123")
        link_id: Remote link ID to update
        link_url: New URL of the remote resource
        title: New title of the link
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        summary: Optional new summary
        icon_url: Optional new icon URL
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateRemoteLinkResponse with update confirmation

    Example:
        # Update remote link (Cloud)
        response = update_remote_link(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            link_id=10000,
            link_url="https://github.com/org/repo/pull/42",
            title="PR #42: Fixed login bug (merged)",
            username="user@example.com",
            summary="Pull request has been merged",
            cloud=True
        )

        # Update remote link (Server/DC)
        response = update_remote_link(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            link_id=20000,
            link_url="https://docs.company.com/spec-v2",
            title="Technical Specification v2",
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
    # Build link object
    link_object = {
        "url": link_url,
        "title": title
    }
    if summary:
        link_object["summary"] = summary
    if icon_url:
        link_object["icon"] = {"url16x16": icon_url}
    
    client.update_issue_remote_links(issue_key, link_id, {"object": link_object})
    
    return UpdateRemoteLinkResponse(
        issue_key=issue_key,
        link_id=link_id,
        message=f"Successfully updated remote link {link_id} for issue {issue_key}"
    )


def delete_remote_link(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    link_id: int,
    username_credential_key: str = "",
    cloud: bool = False,
) -> DeleteRemoteLinkResponse:
    """
    Delete a remote link from an issue.

    Removes a remote (external) link from a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        issue_key: Issue key (e.g., "PROJ-123")
        link_id: Remote link ID to delete
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteRemoteLinkResponse with deletion confirmation

    Example:
        # Delete remote link (Cloud)
        response = delete_remote_link(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            link_id=10000,
            username="user@example.com",
            cloud=True
        )

        # Delete remote link (Server/DC)
        response = delete_remote_link(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            link_id=20000,
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.delete_issue_remote_links(issue_key, link_id)
    
    return DeleteRemoteLinkResponse(
        issue_key=issue_key,
        link_id=link_id,
        message=f"Successfully deleted remote link {link_id} from issue {issue_key}"
    )


# ============================================================================
# Tools - Watchers
# ============================================================================

def get_watchers(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetWatchersResponse:
    """
    Get watchers for an issue.

    Retrieves all users watching a Jira issue.
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
        GetWatchersResponse with all watchers

    Example:
        # Get watchers (Cloud)
        response = get_watchers(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            cloud=True
        )
        for watcher in response.watchers:
            print(f"Watching: {watcher.displayName}")

        # Get watchers (Server/DC)
        response = get_watchers(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            cloud=False
        )
        print(f"Total watchers: {response.watching_count}")
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    watchers_data = client.get_issue_watchers(issue_key)
    
    # Parse watchers
    watchers = [
        WatcherInfo(**watcher)
        for watcher in watchers_data.get('watchers', [])
    ]
    
    return GetWatchersResponse(
        issue_key=issue_key,
        watchers=watchers,
        watching_count=watchers_data.get('watchCount', len(watchers))
    )


def add_watcher(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    watcher: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> AddWatcherResponse:
    """
    Add a watcher to an issue.

    Adds a user as a watcher to a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        issue_key: Issue key (e.g., "PROJ-123")
        watcher: Account ID (Cloud) or username (Server/DC) of the watcher
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddWatcherResponse with confirmation

    Example:
        # Add watcher (Cloud)
        response = add_watcher(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            watcher="5b10a2844c20165700ede21g",  # Account ID
            username="user@example.com",
            cloud=True
        )

        # Add watcher (Server/DC)
        response = add_watcher(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            watcher="john.doe",  # Username
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.add_issue_watcher(issue_key, watcher)
    
    return AddWatcherResponse(
        issue_key=issue_key,
        watcher=watcher,
        message=f"Successfully added {watcher} as watcher to issue {issue_key}"
    )


def remove_watcher(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    watcher: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> RemoveWatcherResponse:
    """
    Remove a watcher from an issue.

    Removes a user from watching a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url_credential_key: Globally unique key for the Jira instance URL credential
        token_credential_key: Globally unique key for the API token credential
        issue_key: Issue key (e.g., "PROJ-123")
        watcher: Account ID (Cloud) or username (Server/DC) of the watcher
        username_credential_key: Globally unique key for the username credential (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        RemoveWatcherResponse with confirmation

    Example:
        # Remove watcher (Cloud)
        response = remove_watcher(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            watcher="5b10a2844c20165700ede21g",  # Account ID
            username="user@example.com",
            cloud=True
        )

        # Remove watcher (Server/DC)
        response = remove_watcher(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            watcher="john.doe",  # Username
            cloud=False
        )
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.remove_issue_watcher(issue_key, watcher)
    
    return RemoveWatcherResponse(
        issue_key=issue_key,
        watcher=watcher,
        message=f"Successfully removed {watcher} from watchers of issue {issue_key}"
    )

