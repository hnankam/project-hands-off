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
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    username_credential_key: str = "",
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
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 50)
        expand: Comma-separated list of fields to expand
        filename: Filter by filename (optional)
        media_type: Filter by media type (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageAttachmentsResponse with list of attachments
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
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
            attachments=attachments
        )
    except Exception as e:
        return GetPageAttachmentsResponse(
            page_id=page_id,
            attachments=[],
            error_message=f"Failed to get attachments for page {page_id}: {str(e)}"
        )


def upload_attachment(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    filename: str,
    username_credential_key: str = "",
    comment: Optional[str] = None,
    cloud: bool = False,
) -> AddAttachmentResponse:
    """
    Upload an attachment to a page.

    Uploads a file from the filesystem as an attachment to a Confluence page.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID to attach file to
        filename: Path to file on filesystem
        username_credential_key: Credential key for username (Cloud only, default: "")
        comment: Comment for the attachment (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddAttachmentResponse with attachment details
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
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
    except Exception as e:
        return AddAttachmentResponse(
            page_id=page_id,
            attachment=None,
            message=None,
            error_message=f"Failed to upload attachment '{filename}' to page {page_id}: {str(e)}"
        )


def delete_attachment(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    attachment_id: str,
    username_credential_key: str = "",
    version: Optional[int] = None,
    cloud: bool = False,
) -> dict:
    """
    Delete an attachment from a page by ID.

    Removes a file attachment from a Confluence page using the attachment ID.
    **Note:** Uses delete_attachment_by_id from the SDK.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID (for reference/validation)
        attachment_id: Attachment ID to delete
        username_credential_key: Credential key for username (Cloud only, default: "")
        version: Attachment version to delete (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        Dictionary with confirmation
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        
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
    except Exception as e:
        return {
            "page_id": page_id,
            "attachment_id": attachment_id,
            "message": None,
            "error": f"Failed to delete attachment {attachment_id} from page {page_id}: {str(e)}"
        }

