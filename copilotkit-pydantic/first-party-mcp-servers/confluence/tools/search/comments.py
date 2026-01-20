"""Confluence Comment Management Operations.

This module provides tools for managing page comments:
- Get page comments
- Add comments
- Update comments
- Delete comments
"""

from typing import Any, Optional
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_confluence_client
from models import (
    GetPageCommentsResponse,
    AddCommentResponse,
    UpdateCommentResponse,
    DeleteCommentResponse,
)


def get_page_comments(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    username_credential_key: str = "",
    start: int = 0,
    limit: int = 25,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetPageCommentsResponse:
    """
    Get all comments on a page.

    Retrieves all comments associated with a Confluence page.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        expand: Comma-separated list of fields to expand
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageCommentsResponse with list of comments
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        comments_data = client.get_page_child_by_type(
            page_id=page_id,
            type="comment",
            start=start,
            limit=limit,
            expand=expand
        )
        
        # Handle different response formats
        if isinstance(comments_data, dict):
            comments = comments_data.get('results', [])
            total = comments_data.get('size', len(comments))
        else:
            comments = []
            total = 0
        
        return GetPageCommentsResponse(
            page_id=page_id,
            comments=comments
        )
    except Exception as e:
        return GetPageCommentsResponse(
            page_id=page_id,
            comments=[],
            error_message=f"Failed to get comments for page {page_id}: {str(e)}"
        )


def add_comment(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    comment_body: str,
    username_credential_key: str = "",
    parent_comment_id: Optional[str] = None,
    representation: str = "storage",
    cloud: bool = False,
) -> AddCommentResponse:
    """
    Add a comment to a page.

    Creates a new comment on a Confluence page.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID to comment on
        comment_body: Comment text (HTML)
        username_credential_key: Credential key for username (Cloud only, default: "")
        parent_comment_id: Parent comment ID for replies (optional)
        representation: Content representation format (default: "storage")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddCommentResponse with created comment
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        
        # Create comment using the API
        comment_data = {
            "type": "comment",
            "container": {
                "id": page_id,
                "type": "page"
            },
            "body": {
                representation: {
                    "value": comment_body,
                    "representation": representation
                }
            }
        }
        
        if parent_comment_id:
            comment_data["ancestors"] = [{"id": parent_comment_id}]
        
        # Use low-level API to create comment
        created_comment = client.post(
            path="rest/api/content",
            data=comment_data
        )
        
        return AddCommentResponse(
            page_id=page_id,
            comment=created_comment,
            message=f"Successfully added comment to page {page_id}"
        )
    except Exception as e:
        return AddCommentResponse(
            page_id=page_id,
            comment=None,
            message=None,
            error_message=f"Failed to add comment to page {page_id}: {str(e)}"
        )


def update_comment(
    url_credential_key: str,
    token_credential_key: str,
    comment_id: str,
    comment_body: str,
    username_credential_key: str = "",
    representation: str = "storage",
    version_number: Optional[int] = None,
    cloud: bool = False,
) -> UpdateCommentResponse:
    """
    Update an existing comment.

    Updates the content of a comment.
    **Note:** Version number must be incremented.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        comment_id: Comment ID to update
        comment_body: New comment text (HTML)
        username_credential_key: Credential key for username (Cloud only, default: "")
        representation: Content representation format (default: "storage")
        version_number: Version number (auto-increments if not provided)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateCommentResponse with confirmation
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        
        # Get current comment to get version if not provided
        if not version_number:
            current_comment = client.get_page_by_id(comment_id, expand="version")
            version_number = current_comment.get('version', {}).get('number', 1) + 1
        
        # Update comment
        update_data = {
            "type": "comment",
            "version": {
                "number": version_number
            },
            "body": {
                representation: {
                    "value": comment_body,
                    "representation": representation
                }
            }
        }
        
        client.put(
            path=f"rest/api/content/{comment_id}",
            data=update_data
        )
        
        return UpdateCommentResponse(
            comment_id=comment_id,
            message=f"Successfully updated comment {comment_id}"
        )
    except Exception as e:
        return UpdateCommentResponse(
            comment_id=comment_id,
            message=None,
            error_message=f"Failed to update comment {comment_id}: {str(e)}"
        )


def delete_comment(
    url_credential_key: str,
    token_credential_key: str,
    comment_id: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> DeleteCommentResponse:
    """
    Delete a comment.

    Permanently removes a comment from a page.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        comment_id: Comment ID to delete
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteCommentResponse with confirmation
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        client.remove_page(page_id=comment_id)
        
        return DeleteCommentResponse(
            comment_id=comment_id,
            message=f"Successfully deleted comment {comment_id}"
        )
    except Exception as e:
        return DeleteCommentResponse(
            comment_id=comment_id,
            message=None,
            error_message=f"Failed to delete comment {comment_id}: {str(e)}"
        )

