"""Jira Issue Comments Operations.

This module provides tools for managing issue comments:
- Add comments
- Get comments
- Update comments
- Delete comments
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from ...cache import get_jira_client


# ============================================================================
# Pydantic Models
# ============================================================================

class CommentAuthor(BaseModel):
    """Comment author information."""
    accountId: Optional[str] = Field(None, description="Account ID (Cloud)")
    name: Optional[str] = Field(None, description="Username (Server/DC)")
    displayName: str = Field(..., description="Display name")
    emailAddress: Optional[str] = Field(None, description="Email address")


class CommentModel(BaseModel):
    """Jira comment model."""
    id: str = Field(..., description="Comment ID")
    author: Optional[CommentAuthor] = Field(None, description="Comment author")
    body: str = Field(..., description="Comment text")
    created: str = Field(..., description="Creation timestamp")
    updated: str = Field(..., description="Last update timestamp")
    updateAuthor: Optional[CommentAuthor] = Field(None, description="Last update author")


class AddCommentResponse(BaseModel):
    """Response for adding a comment."""
    issue_key: str = Field(..., description="Issue key")
    comment: CommentModel = Field(..., description="Created comment")
    message: str = Field(..., description="Success message")


class GetCommentsResponse(BaseModel):
    """Response for getting comments."""
    issue_key: str = Field(..., description="Issue key")
    comments: List[CommentModel] = Field(..., description="List of comments")
    total: int = Field(..., description="Total number of comments")


class UpdateCommentResponse(BaseModel):
    """Response for updating a comment."""
    issue_key: str = Field(..., description="Issue key")
    comment_id: str = Field(..., description="Comment ID")
    comment: CommentModel = Field(..., description="Updated comment")
    message: str = Field(..., description="Success message")


class DeleteCommentResponse(BaseModel):
    """Response for deleting a comment."""
    issue_key: str = Field(..., description="Issue key")
    comment_id: str = Field(..., description="Comment ID")
    message: str = Field(..., description="Success message")


# ============================================================================
# Tools
# ============================================================================

def add_comment(
    url: str,
    api_token: str,
    issue_key: str,
    comment: str,
    username: str = "",
    is_internal: bool = False,
    cloud: bool = False,
) -> AddCommentResponse:
    """
    Add a comment to an issue.

    Creates a new comment on a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        comment: Comment text
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        is_internal: Whether the comment is internal (default: False)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddCommentResponse with created comment

    Example:
        # Add public comment (Cloud)
        response = add_comment(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            comment="This looks good to me!",
            username="user@example.com",
            cloud=True
        )
        print(f"Comment ID: {response.comment.id}")

        # Add internal comment (Server/DC)
        response = add_comment(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            comment="Internal note: needs review",
            is_internal=True,
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    comment_data = client.issue_add_comment(issue_key, comment)
    
    # Parse comment
    comment_obj = CommentModel(**comment_data)
    
    return AddCommentResponse(
        issue_key=issue_key,
        comment=comment_obj,
        message=f"Successfully added comment to issue {issue_key}"
    )


def get_comments(
    url: str,
    api_token: str,
    issue_key: str,
    username: str = "",
    cloud: bool = False,
) -> GetCommentsResponse:
    """
    Get all comments for an issue.

    Retrieves all comments associated with a Jira issue.
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
        GetCommentsResponse with all comments

    Example:
        # Get all comments (Cloud)
        response = get_comments(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            cloud=True
        )
        for comment in response.comments:
            print(f"[{comment.author.displayName}]: {comment.body}")

        # Get all comments (Server/DC)
        response = get_comments(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            cloud=False
        )
        print(f"Total comments: {response.total}")
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    comments_data = client.issue_get_comments(issue_key)
    
    # Parse comments
    comments = [
        CommentModel(**comment)
        for comment in comments_data.get('comments', [])
    ]
    
    return GetCommentsResponse(
        issue_key=issue_key,
        comments=comments,
        total=len(comments)
    )


def update_comment(
    url: str,
    api_token: str,
    issue_key: str,
    comment_id: str,
    comment: str,
    username: str = "",
    cloud: bool = False,
) -> UpdateCommentResponse:
    """
    Update an existing comment.

    Updates the text of an existing comment on a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        comment_id: Comment ID to update
        comment: New comment text
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateCommentResponse with updated comment

    Example:
        # Update comment (Cloud)
        response = update_comment(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            comment_id="10000",
            comment="Updated: This looks even better now!",
            username="user@example.com",
            cloud=True
        )

        # Update comment (Server/DC)
        response = update_comment(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            comment_id="20000",
            comment="Revised internal note",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    comment_data = client.issue_update_comment(issue_key, comment_id, comment)
    
    # Parse comment
    comment_obj = CommentModel(**comment_data)
    
    return UpdateCommentResponse(
        issue_key=issue_key,
        comment_id=comment_id,
        comment=comment_obj,
        message=f"Successfully updated comment {comment_id} on issue {issue_key}"
    )


def delete_comment(
    url: str,
    api_token: str,
    issue_key: str,
    comment_id: str,
    username: str = "",
    cloud: bool = False,
) -> DeleteCommentResponse:
    """
    Delete a comment from an issue.

    Removes a comment from a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        comment_id: Comment ID to delete
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteCommentResponse with deletion confirmation

    Example:
        # Delete comment (Cloud)
        response = delete_comment(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            comment_id="10000",
            username="user@example.com",
            cloud=True
        )

        # Delete comment (Server/DC)
        response = delete_comment(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            comment_id="20000",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.issue_delete_comment(issue_key, comment_id)
    
    return DeleteCommentResponse(
        issue_key=issue_key,
        comment_id=comment_id,
        message=f"Successfully deleted comment {comment_id} from issue {issue_key}"
    )

