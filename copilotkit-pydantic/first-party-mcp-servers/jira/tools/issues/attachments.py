"""Jira Issue Attachments Operations.

This module provides tools for managing issue attachments:
- Add attachments (file or IO object)
- Download attachments
- Get attachment IDs
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from cache import get_jira_client
import os


# ============================================================================
# Pydantic Models
# ============================================================================

class AttachmentInfo(BaseModel):
    """Information about an attachment."""
    id: str = Field(..., description="Attachment ID")
    filename: str = Field(..., description="Attachment filename")
    author: Optional[Dict[str, Any]] = Field(None, description="Attachment author")
    created: str = Field(..., description="Creation timestamp")
    size: int = Field(..., description="File size in bytes")
    mimeType: str = Field(..., description="MIME type")
    content: Optional[str] = Field(None, description="Content URL")
    thumbnail: Optional[str] = Field(None, description="Thumbnail URL")


class AddAttachmentResponse(BaseModel):
    """Response for adding an attachment."""
    issue_key: str = Field(..., description="Issue key")
    attachments: List[AttachmentInfo] = Field(default_factory=list, description="List of added attachments")
    count: int = Field(0, description="Number of attachments added")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DownloadAttachmentsResponse(BaseModel):
    """Response for downloading attachments."""
    issue_key: str = Field(..., description="Issue key")
    downloaded_files: List[str] = Field(default_factory=list, description="List of downloaded file paths")
    count: int = Field(0, description="Number of files downloaded")
    download_path: str = Field(..., description="Download directory path")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetAttachmentIdsResponse(BaseModel):
    """Response for getting attachment IDs."""
    issue_key: str = Field(..., description="Issue key")
    attachment_ids: List[str] = Field(default_factory=list, description="List of attachment IDs")
    count: int = Field(0, description="Total number of attachments")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Tools
# ============================================================================

def add_attachment(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    filename: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> AddAttachmentResponse:
    """
    Upload a file from the local filesystem to an issue.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        filename: Path to the file to upload (must exist on filesystem)
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddAttachmentResponse with attachment details and count
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
        # Verify file exists
        if not os.path.exists(filename):
                return AddAttachmentResponse(
                    issue_key=issue_key,
                    attachments=[],
                    count=0,
                    message="",
                    error_message=f"File not found: {filename}"
                )
        
        # Add attachment
        attachments_data = client.add_attachment(issue_key, filename)
        
        # Handle both single attachment and list of attachments
        if not isinstance(attachments_data, list):
            attachments_data = [attachments_data]
        
        # Parse attachments
        attachments = [AttachmentInfo(**att) for att in attachments_data]
        
        return AddAttachmentResponse(
            issue_key=issue_key,
            attachments=attachments,
            count=len(attachments),
            message=f"Successfully added {len(attachments)} attachment(s) to issue {issue_key}"
        )
    except Exception as e:
        return AddAttachmentResponse(
            issue_key=issue_key,
            attachments=[],
            count=0,
            message="",
            error_message=f"Failed to add attachment: {str(e)}"
        )


def add_attachment_object(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    attachment_data: bytes,
    filename: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> AddAttachmentResponse:
    """
    Upload file content directly from memory (bytes or IO object) to an issue.

    Useful for uploading dynamically generated content without saving to disk first.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        attachment_data: File content as bytes or IO object
        filename: Filename to use for the attachment
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddAttachmentResponse with attachment details and count
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
        # Create a file-like object if bytes provided
        if isinstance(attachment_data, bytes):
            import io
            attachment_obj = io.BytesIO(attachment_data)
            attachment_obj.name = filename
        else:
            attachment_obj = attachment_data
            if not hasattr(attachment_obj, 'name'):
                attachment_obj.name = filename
        
        # Add attachment
        attachments_data = client.add_attachment_object(issue_key, attachment_obj)
        
        # Handle both single attachment and list of attachments
        if not isinstance(attachments_data, list):
            attachments_data = [attachments_data]
        
        # Parse attachments
        attachments = [AttachmentInfo(**att) for att in attachments_data]
        
        return AddAttachmentResponse(
            issue_key=issue_key,
            attachments=attachments,
            count=len(attachments),
            message=f"Successfully added {len(attachments)} attachment(s) to issue {issue_key}"
        )
    except Exception as e:
        return AddAttachmentResponse(
            issue_key=issue_key,
            attachments=[],
            count=0,
            message="",
            error_message=f"Failed to add attachment: {str(e)}"
        )


def download_attachments_from_issue(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    path: Optional[str] = None,
    cloud: bool = False,
) -> DownloadAttachmentsResponse:
    """
    Download all attachments from an issue to a specified directory.

    If no path is specified, files are downloaded to the current directory.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        username_credential_key: Credential key for username (Cloud only, default: "")
        path: Download directory path (optional, defaults to current directory)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DownloadAttachmentsResponse with download details and file list
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
        # Set default path if not provided
        if path is None:
            path = os.getcwd()
        
        # Ensure directory exists
        os.makedirs(path, exist_ok=True)
        
        # Get issue to access attachments
        issue = client.issue(issue_key)
        
        # Download attachments
        downloaded_files = client.download_attachments_from_issue(issue, path=path, cloud=cloud)
        
        # Handle return value (may be list or None)
        if downloaded_files is None:
            downloaded_files = []
        elif not isinstance(downloaded_files, list):
            downloaded_files = [downloaded_files]
        
        return DownloadAttachmentsResponse(
            issue_key=issue_key,
            downloaded_files=downloaded_files,
            count=len(downloaded_files),
            download_path=path,
            message=f"Successfully downloaded {len(downloaded_files)} attachment(s) from issue {issue_key}"
        )
    except Exception as e:
        return DownloadAttachmentsResponse(
            issue_key=issue_key,
            downloaded_files=[],
            count=0,
            download_path=path if path else os.getcwd(),
            message="",
            error_message=f"Failed to download attachments: {str(e)}"
        )


def get_attachments_ids_from_issue(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetAttachmentIdsResponse:
    """
    Get all attachment IDs from an issue.

    Useful for checking if an issue has attachments or for referencing specific attachments.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetAttachmentIdsResponse with attachment IDs and count
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    
        # Get attachment IDs
        attachment_ids = client.get_attachments_ids_from_issue(issue_key)
        
        # Handle return value (may be list or None)
        if attachment_ids is None:
            attachment_ids = []
        elif not isinstance(attachment_ids, list):
            attachment_ids = [attachment_ids]
        
        # Convert to strings if needed
        attachment_ids = [str(att_id) for att_id in attachment_ids]
        
        return GetAttachmentIdsResponse(
            issue_key=issue_key,
            attachment_ids=attachment_ids,
            count=len(attachment_ids)
        )
    except Exception as e:
        return GetAttachmentIdsResponse(
            issue_key=issue_key,
            attachment_ids=[],
            count=0,
            error_message=f"Failed to get attachment IDs: {str(e)}"
        )

