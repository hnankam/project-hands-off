"""Jira Issue Attachments Operations.

This module provides tools for managing issue attachments:
- Add attachments (file or IO object)
- Download attachments
- Get attachment IDs
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from ...cache import get_jira_client
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
    attachments: List[AttachmentInfo] = Field(..., description="List of added attachments")
    count: int = Field(..., description="Number of attachments added")
    message: str = Field(..., description="Success message")


class DownloadAttachmentsResponse(BaseModel):
    """Response for downloading attachments."""
    issue_key: str = Field(..., description="Issue key")
    downloaded_files: List[str] = Field(..., description="List of downloaded file paths")
    count: int = Field(..., description="Number of files downloaded")
    download_path: str = Field(..., description="Download directory path")
    message: str = Field(..., description="Success message")


class GetAttachmentIdsResponse(BaseModel):
    """Response for getting attachment IDs."""
    issue_key: str = Field(..., description="Issue key")
    attachment_ids: List[str] = Field(..., description="List of attachment IDs")
    count: int = Field(..., description="Total number of attachments")


# ============================================================================
# Tools
# ============================================================================

def add_attachment(
    url: str,
    api_token: str,
    issue_key: str,
    filename: str,
    username: str = "",
    cloud: bool = False,
) -> AddAttachmentResponse:
    """
    Add an attachment file to an issue.

    Uploads a file from the local filesystem to a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        filename: Path to the file to upload (must exist on filesystem)
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddAttachmentResponse with attachment details

    Example:
        # Add attachment (Cloud)
        response = add_attachment(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            filename="/path/to/screenshot.png",
            username="user@example.com",
            cloud=True
        )
        print(f"Added {response.count} attachment(s)")
        for att in response.attachments:
            print(f"  {att.filename} ({att.size} bytes)")

        # Add attachment (Server/DC)
        response = add_attachment(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            filename="/path/to/document.pdf",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    
    # Verify file exists
    if not os.path.exists(filename):
        raise FileNotFoundError(f"File not found: {filename}")
    
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


def add_attachment_object(
    url: str,
    api_token: str,
    issue_key: str,
    attachment_data: bytes,
    filename: str,
    username: str = "",
    cloud: bool = False,
) -> AddAttachmentResponse:
    """
    Add an attachment from bytes/IO object to an issue.

    Uploads file content directly from memory (bytes or IO object) to a Jira issue.
    Useful for uploading dynamically generated content without saving to disk first.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        attachment_data: File content as bytes or IO object
        filename: Filename to use for the attachment
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddAttachmentResponse with attachment details

    Example:
        # Add attachment from bytes (Cloud)
        import io
        content = b"Log file content here..."
        response = add_attachment_object(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            attachment_data=content,
            filename="debug.log",
            username="user@example.com",
            cloud=True
        )

        # Add attachment from generated report (Server/DC)
        import io
        report_data = generate_report()  # Returns bytes
        response = add_attachment_object(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            attachment_data=report_data,
            filename="monthly_report.pdf",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    
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


def download_attachments_from_issue(
    url: str,
    api_token: str,
    issue_key: str,
    username: str = "",
    path: Optional[str] = None,
    cloud: bool = False,
) -> DownloadAttachmentsResponse:
    """
    Download all attachments from an issue.

    Downloads all files attached to a Jira issue to a specified directory.
    If no path is specified, files are downloaded to the current directory.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        path: Download directory path (optional, defaults to current directory)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DownloadAttachmentsResponse with download details

    Example:
        # Download attachments (Cloud)
        response = download_attachments_from_issue(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            path="/path/to/downloads",
            cloud=True
        )
        print(f"Downloaded {response.count} file(s) to {response.download_path}")
        for file in response.downloaded_files:
            print(f"  {file}")

        # Download attachments to current directory (Server/DC)
        response = download_attachments_from_issue(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    
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


def get_attachments_ids_from_issue(
    url: str,
    api_token: str,
    issue_key: str,
    username: str = "",
    cloud: bool = False,
) -> GetAttachmentIdsResponse:
    """
    Get list of attachment IDs from an issue.

    Retrieves all attachment IDs associated with a Jira issue.
    Useful for checking if an issue has attachments or for referencing specific attachments.
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
        GetAttachmentIdsResponse with attachment IDs

    Example:
        # Get attachment IDs (Cloud)
        response = get_attachments_ids_from_issue(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            cloud=True
        )
        print(f"Issue has {response.count} attachment(s)")
        for att_id in response.attachment_ids:
            print(f"  Attachment ID: {att_id}")

        # Get attachment IDs (Server/DC)
        response = get_attachments_ids_from_issue(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-100",
            cloud=False
        )
        if response.count > 0:
            print(f"Found {response.count} attachments")
        else:
            print("No attachments found")
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    
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

