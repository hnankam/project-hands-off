"""Confluence Page CRUD Operations.

This module provides tools for basic page operations:
- Get, create, update, delete pages
- Get page by title
- Get page children
- Get page ancestors
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_confluence_client
from models import (
    GetPageResponse,
    CreatePageResponse,
    UpdatePageResponse,
    DeletePageResponse,
    GetPageChildrenResponse,
    PageInfo,
)


def get_page(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    username_credential_key: str = "",
    expand: Optional[str] = None,
    status: Optional[str] = None,
    version: Optional[int] = None,
    cloud: bool = False,
) -> GetPageResponse:
    """
    Get page by ID.

    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        expand: Comma-separated list of fields to expand (e.g., "body.storage,version,space")
        status: Page status filter ("current", "trashed", "archived")
        version: Specific version number to retrieve
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageResponse with complete page details
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        page_data = client.get_page_by_id(
            page_id=page_id,
            expand=expand,
            status=status,
            version=version
        )
        
        return GetPageResponse(page=page_data)
    except Exception as e:
        return GetPageResponse(
            page=None,
            error_message=f"Failed to get page {page_id}: {str(e)}"
        )


def get_page_by_title(
    url_credential_key: str,
    token_credential_key: str,
    space_key: str,
    title: str,
    username_credential_key: str = "",
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetPageResponse:
    """
    Get page by title within a space.

    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        space_key: Space key
        title: Page title
        username_credential_key: Credential key for username (Cloud only, default: "")
        expand: Comma-separated list of fields to expand
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageResponse with page details
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        page_data = client.get_page_by_title(
            space=space_key,
            title=title,
            expand=expand
        )
        
        return GetPageResponse(page=page_data)
    except Exception as e:
        return GetPageResponse(
            page=None,
            error_message=f"Failed to get page '{title}' in space '{space_key}': {str(e)}"
        )


def create_page(
    url_credential_key: str,
    token_credential_key: str,
    space_key: str,
    title: str,
    body: str,
    username_credential_key: str = "",
    parent_id: Optional[str] = None,
    representation: str = "storage",
    cloud: bool = False,
) -> CreatePageResponse:
    """
    Create a new page.

    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        space_key: Space key where page will be created
        title: Page title
        body: Page content (HTML or storage format)
        username_credential_key: Credential key for username (Cloud only, default: "")
        parent_id: Parent page ID (optional, creates child page)
        representation: Content representation format (default: "storage")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CreatePageResponse with created page
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        page_data = client.create_page(
            space=space_key,
            title=title,
            body=body,
            parent_id=parent_id,
            representation=representation
        )
        
        # Parse page
        page = PageInfo(**page_data)
        
        return CreatePageResponse(
            page=page,
            message=f"Successfully created page '{title}'"
        )
    except Exception as e:
        return CreatePageResponse(
            page=None,
            message=None,
            error_message=f"Failed to create page '{title}' in space '{space_key}': {str(e)}"
        )


def update_page(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    title: str,
    body: str,
    username_credential_key: str = "",
    parent_id: Optional[str] = None,
    representation: str = "storage",
    minor_edit: bool = False,
    version_comment: Optional[str] = None,
    cloud: bool = False,
) -> UpdatePageResponse:
    """
    Update an existing page.

    Updates the content, title, or parent of an existing Confluence page.
    **Note:** Version number is automatically incremented.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID to update
        title: New page title
        body: New page content
        username_credential_key: Credential key for username (Cloud only, default: "")
        parent_id: New parent page ID (optional)
        representation: Content representation format (default: "storage")
        minor_edit: Whether this is a minor edit (default: False)
        version_comment: Comment for this version (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdatePageResponse with confirmation
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        client.update_page(
            page_id=page_id,
            title=title,
            body=body,
            parent_id=parent_id,
            representation=representation,
            minor_edit=minor_edit,
            version_comment=version_comment
        )
        
        return UpdatePageResponse(
            page_id=page_id,
            message=f"Successfully updated page {page_id}"
        )
    except Exception as e:
        return UpdatePageResponse(
            page_id=page_id,
            message=None,
            error_message=f"Failed to update page {page_id}: {str(e)}"
        )


def delete_page(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    username_credential_key: str = "",
    status: Optional[str] = None,
    cloud: bool = False,
) -> DeletePageResponse:
    """
    Delete a page.

    Permanently deletes or moves a page to trash.
    **Warning:** This operation may be irreversible depending on configuration!
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID to delete
        username_credential_key: Credential key for username (Cloud only, default: "")
        status: Delete status ("trashed" or permanent, optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeletePageResponse with confirmation
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        client.remove_page(page_id=page_id, status=status)
        
        return DeletePageResponse(
            page_id=page_id,
            message=f"Successfully deleted page {page_id}"
        )
    except Exception as e:
        return DeletePageResponse(
            page_id=page_id,
            message=None,
            error_message=f"Failed to delete page {page_id}: {str(e)}"
        )


def get_page_children(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    username_credential_key: str = "",
    expand: Optional[str] = None,
    start: int = 0,
    limit: int = 25,
    cloud: bool = False,
) -> GetPageChildrenResponse:
    """
    Get child pages of a page.

    Retrieves all child pages under a specified parent page.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Parent page ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        expand: Comma-separated list of fields to expand
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageChildrenResponse with list of child pages
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        children_data = client.get_page_child_by_type(
            page_id=page_id,
            type="page",
            start=start,
            limit=limit,
            expand=expand
        )
        
        # Extract children from response
        children = children_data.get('results', []) if isinstance(children_data, dict) else []
        total = children_data.get('size', len(children)) if isinstance(children_data, dict) else len(children)
        
        return GetPageChildrenResponse(
            page_id=page_id,
            children=children
        )
    except Exception as e:
        return GetPageChildrenResponse(
            page_id=page_id,
            children=[],
            error_message=f"Failed to get children of page {page_id}: {str(e)}"
        )


def get_page_ancestors(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> Dict[str, Any]:
    """
    Get page ancestors (parent hierarchy).

    Retrieves all ancestor pages (breadcrumb trail) for a specified page.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        Dictionary with page_id and list of ancestors
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        page_data = client.get_page_by_id(page_id=page_id, expand="ancestors")
        
        ancestors = page_data.get('ancestors', [])
        
        return {
            "page_id": page_id,
            "ancestors": ancestors
        }
    except Exception as e:
        return {
            "page_id": page_id,
            "ancestors": [],
            "error": f"Failed to get ancestors of page {page_id}: {str(e)}"
        }

