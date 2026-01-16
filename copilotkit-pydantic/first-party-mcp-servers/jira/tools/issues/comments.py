"""Jira Issue Comments Operations.

This module provides tools for managing issue comments:
- Add comments
- Get comments
- Update comments
- Delete comments
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from cache import get_jira_client


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
    comment: Optional[CommentModel] = Field(None, description="Created comment")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetCommentsResponse(BaseModel):
    """Response for getting comments."""
    issue_key: str = Field(..., description="Issue key")
    comments: List[CommentModel] = Field(default_factory=list, description="List of comments")
    total: int = Field(0, description="Total number of comments")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class UpdateCommentResponse(BaseModel):
    """Response for updating a comment."""
    issue_key: str = Field(..., description="Issue key")
    comment_id: str = Field(..., description="Comment ID")
    comment: Optional[CommentModel] = Field(None, description="Updated comment")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DeleteCommentResponse(BaseModel):
    """Response for deleting a comment."""
    issue_key: str = Field(..., description="Issue key")
    comment_id: str = Field(..., description="Comment ID")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Tools
# ============================================================================

def add_comment(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    comment: str,
    username_credential_key: str = "",
    is_internal: bool = False,
    cloud: bool = False,
) -> AddCommentResponse:
    """
    Add a comment to an issue.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        comment: Comment text
        username_credential_key: Credential key for username (Cloud only, default: "")
        is_internal: Whether the comment is internal (default: False)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddCommentResponse with created comment
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        comment_data = client.issue_add_comment(issue_key, comment)
        
        # Parse comment
        comment_obj = CommentModel(**comment_data)
        
        return AddCommentResponse(
            issue_key=issue_key,
            comment=comment_obj,
            message=f"Successfully added comment to issue {issue_key}"
        )
    except Exception as e:
        return AddCommentResponse(
            issue_key=issue_key,
            comment=None,
            message="",
            error_message=f"Failed to add comment: {str(e)}"
        )


def get_comments(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetCommentsResponse:
    """
    Get all comments for an issue.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetCommentsResponse with all comments and total count
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
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
    except Exception as e:
        return GetCommentsResponse(
            issue_key=issue_key,
            comments=[],
            total=0,
            error_message=f"Failed to get comments: {str(e)}"
        )


def update_comment(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    comment_id: str,
    comment: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> UpdateCommentResponse:
    """
    Update the text of an existing comment.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        comment_id: Comment ID to update
        comment: New comment text
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateCommentResponse with updated comment
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        comment_data = client.issue_update_comment(issue_key, comment_id, comment)
        
        # Parse comment
        comment_obj = CommentModel(**comment_data)
        
        return UpdateCommentResponse(
            issue_key=issue_key,
            comment_id=comment_id,
            comment=comment_obj,
            message=f"Successfully updated comment {comment_id} on issue {issue_key}"
        )
    except Exception as e:
        return UpdateCommentResponse(
            issue_key=issue_key,
            comment_id=comment_id,
            comment=None,
            message="",
            error_message=f"Failed to update comment: {str(e)}"
        )


def delete_comment(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    comment_id: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> DeleteCommentResponse:
    """
    Delete a comment from an issue.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        comment_id: Comment ID to delete
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteCommentResponse with deletion confirmation message
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        client.issue_delete_comment(issue_key, comment_id)
        
        return DeleteCommentResponse(
            issue_key=issue_key,
            comment_id=comment_id,
            message=f"Successfully deleted comment {comment_id} from issue {issue_key}"
        )
    except Exception as e:
        return DeleteCommentResponse(
            issue_key=issue_key,
            comment_id=comment_id,
            message="",
            error_message=f"Failed to delete comment: {str(e)}"
        )

