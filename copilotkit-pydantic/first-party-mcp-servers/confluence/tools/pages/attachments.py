"""Confluence Page Attachment Operations.

This module provides tools for managing page attachments:
- Get page attachments
- Upload attachments
- Delete attachments
"""

from typing import Any, Optional
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_confluence_client
from models import (
    GetPageAttachmentsResponse,
    AddAttachmentResponse,
)


def get_page_attachments(
    url: str,
    api_token: str,
    page_id: str,
    username: str = "",
    start: int = 0,
    limit: int = 50,
    expand: Optional[str] = None,
    filename: Optional[str] = None,
    media_type: Optional[str] = None,
    cloud: bool = False,
) -> GetPageAttachmentsResponse:
    """
    Get all attachments on a page.

    Retrieves all file attachments associated with a Confluence page.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 50)
        expand: Comma-separated list of fields to expand
        filename: Filter by filename (optional)
        media_type: Filter by media type (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageAttachmentsResponse with list of attachments

    Example:
        # Get all attachments (Cloud)
        response = get_page_attachments(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            username="user@example.com",
            expand="version",
            cloud=True
        )
        print(f"Page has {response.total} attachments:")
        for att in response.attachments:
            print(f"  {att['title']} ({att['metadata']['mediaType']})")

        # Get image attachments only (Server/DC)
        response = get_page_attachments(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            media_type="image/png",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    attachments_data = client.get_attachments_from_content(
        page_id=page_id,
        start=start,
        limit=limit,
        expand=expand,
        filename=filename,
        media_type=media_type
    )
    
    # Handle different response formats
    if isinstance(attachments_data, dict):
        attachments = attachments_data.get('results', [])
        total = attachments_data.get('size', len(attachments))
    elif isinstance(attachments_data, list):
        attachments = attachments_data
        total = len(attachments)
    else:
        attachments = []
        total = 0
    
    return GetPageAttachmentsResponse(
        page_id=page_id,
        attachments=attachments,
        total=total
    )


def upload_attachment(
    url: str,
    api_token: str,
    page_id: str,
    filename: str,
    username: str = "",
    comment: Optional[str] = None,
    cloud: bool = False,
) -> AddAttachmentResponse:
    """
    Upload an attachment to a page.

    Uploads a file from the filesystem as an attachment to a Confluence page.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID to attach file to
        filename: Path to file on filesystem
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        comment: Comment for the attachment (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddAttachmentResponse with attachment details

    Example:
        # Upload image (Cloud)
        response = upload_attachment(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            filename="/path/to/diagram.png",
            username="user@example.com",
            comment="Architecture diagram v2",
            cloud=True
        )
        print(f"Uploaded: {response.attachment['title']}")

        # Upload document (Server/DC)
        response = upload_attachment(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            filename="/path/to/report.pdf",
            comment="Q4 Report",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    attachment_data = client.attach_file(
        filename=filename,
        page_id=page_id,
        comment=comment
    )
    
    # Handle response - might be a list or dict
    if isinstance(attachment_data, list) and len(attachment_data) > 0:
        attachment = attachment_data[0]
    elif isinstance(attachment_data, dict):
        attachment = attachment_data
    else:
        attachment = {"status": "uploaded"}
    
    return AddAttachmentResponse(
        page_id=page_id,
        attachment=attachment,
        message=f"Successfully uploaded attachment to page {page_id}"
    )


def delete_attachment(
    url: str,
    api_token: str,
    page_id: str,
    attachment_id: str,
    username: str = "",
    version: Optional[int] = None,
    cloud: bool = False,
) -> dict:
    """
    Delete an attachment from a page by ID.

    Removes a file attachment from a Confluence page using the attachment ID.
    **Note:** Uses delete_attachment_by_id from the SDK.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID (for reference/validation)
        attachment_id: Attachment ID to delete
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        version: Attachment version to delete (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        Dictionary with confirmation

    Example:
        # Delete attachment (Cloud)
        response = delete_attachment(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            attachment_id="att123",
            username="user@example.com",
            cloud=True
        )
        print(response['message'])

        # Delete attachment (Server/DC)
        response = delete_attachment(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            attachment_id="att456",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    
    # Use delete_attachment_by_id from SDK
    if version:
        client.delete_attachment_by_id(attachment_id=attachment_id, version=version)
    else:
        # Get current version first
        attachments = client.get_attachments_from_content(page_id=page_id)
        attachment_version = None
        if isinstance(attachments, dict):
            for att in attachments.get('results', []):
                if att.get('id') == attachment_id:
                    attachment_version = att.get('version', {}).get('number', 1)
                    break
        
        if attachment_version:
            client.delete_attachment_by_id(attachment_id=attachment_id, version=attachment_version)
        else:
            # Fallback: try with version 1
            client.delete_attachment_by_id(attachment_id=attachment_id, version=1)
    
    return {
        "page_id": page_id,
        "attachment_id": attachment_id,
        "message": f"Successfully deleted attachment {attachment_id} from page {page_id}"
    }

