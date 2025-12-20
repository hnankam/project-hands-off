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
    url: str,
    api_token: str,
    page_id: str,
    username: str = "",
    start: int = 0,
    limit: int = 25,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetPageCommentsResponse:
    """
    Get all comments on a page.

    Retrieves all comments associated with a Confluence page.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        expand: Comma-separated list of fields to expand
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageCommentsResponse with list of comments

    Example:
        # Get page comments (Cloud)
        response = get_page_comments(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            username="user@example.com",
            expand="body.view,version",
            limit=50,
            cloud=True
        )
        print(f"Page has {response.total} comments")
        for comment in response.comments:
            print(f"  {comment['title']}: {comment['body']['view']['value']}")

        # Get page comments (Server/DC)
        response = get_page_comments(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
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
        comments=comments,
        total=total
    )


def add_comment(
    url: str,
    api_token: str,
    page_id: str,
    comment_body: str,
    username: str = "",
    parent_comment_id: Optional[str] = None,
    representation: str = "storage",
    cloud: bool = False,
) -> AddCommentResponse:
    """
    Add a comment to a page.

    Creates a new comment on a Confluence page.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID to comment on
        comment_body: Comment text (HTML)
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        parent_comment_id: Parent comment ID for replies (optional)
        representation: Content representation format (default: "storage")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddCommentResponse with created comment

    Example:
        # Add comment to page (Cloud)
        response = add_comment(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            comment_body="<p>Great documentation!</p>",
            username="user@example.com",
            cloud=True
        )
        print(f"Added comment: {response.comment['id']}")

        # Reply to existing comment (Server/DC)
        response = add_comment(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            comment_body="<p>Thanks for the feedback!</p>",
            parent_comment_id="comment123",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    
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


def update_comment(
    url: str,
    api_token: str,
    comment_id: str,
    comment_body: str,
    username: str = "",
    representation: str = "storage",
    version_number: Optional[int] = None,
    cloud: bool = False,
) -> UpdateCommentResponse:
    """
    Update an existing comment.

    Updates the content of a comment.
    **Note:** Version number must be incremented.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        comment_id: Comment ID to update
        comment_body: New comment text (HTML)
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        representation: Content representation format (default: "storage")
        version_number: Version number (auto-increments if not provided)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateCommentResponse with confirmation

    Example:
        # Update comment (Cloud)
        response = update_comment(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            comment_id="comment123",
            comment_body="<p>Updated: Great documentation! Very helpful.</p>",
            username="user@example.com",
            cloud=True
        )

        # Update comment (Server/DC)
        response = update_comment(
            url="https://wiki.company.com",
            api_token="your_pat",
            comment_id="comment456",
            comment_body="<p>Corrected typo in previous comment.</p>",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    
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


def delete_comment(
    url: str,
    api_token: str,
    comment_id: str,
    username: str = "",
    cloud: bool = False,
) -> DeleteCommentResponse:
    """
    Delete a comment.

    Permanently removes a comment from a page.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        comment_id: Comment ID to delete
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteCommentResponse with confirmation

    Example:
        # Delete comment (Cloud)
        response = delete_comment(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            comment_id="comment123",
            username="user@example.com",
            cloud=True
        )
        print(response.message)

        # Delete comment (Server/DC)
        response = delete_comment(
            url="https://wiki.company.com",
            api_token="your_pat",
            comment_id="comment456",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    client.remove_page(page_id=comment_id)
    
    return DeleteCommentResponse(
        comment_id=comment_id,
        message=f"Successfully deleted comment {comment_id}"
    )

