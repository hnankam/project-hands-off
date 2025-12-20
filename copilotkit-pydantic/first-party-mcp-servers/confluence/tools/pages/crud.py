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
    url: str,
    api_token: str,
    page_id: str,
    username: str = "",
    expand: Optional[str] = None,
    status: Optional[str] = None,
    version: Optional[int] = None,
    cloud: bool = False,
) -> GetPageResponse:
    """
    Get page by ID.

    Retrieves complete information about a Confluence page.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL (e.g., https://yoursite.atlassian.net/wiki or https://wiki.company.com)
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        expand: Comma-separated list of fields to expand (e.g., "body.storage,version,space")
        status: Page status filter ("current", "trashed", "archived")
        version: Specific version number to retrieve
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageResponse with complete page details

    Example:
        # Get page with expanded fields (Cloud)
        response = get_page(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            username="user@example.com",
            expand="body.storage,version,space,ancestors",
            cloud=True
        )
        print(f"Page: {response.page['title']}")
        print(f"Content: {response.page['body']['storage']['value']}")

        # Get page (Server/DC)
        response = get_page(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            expand="body.storage",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    page_data = client.get_page_by_id(
        page_id=page_id,
        expand=expand,
        status=status,
        version=version
    )
    
    return GetPageResponse(page=page_data)


def get_page_by_title(
    url: str,
    api_token: str,
    space_key: str,
    title: str,
    username: str = "",
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetPageResponse:
    """
    Get page by title within a space.

    Retrieves a page by its title within a specific space.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        space_key: Space key
        title: Page title
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        expand: Comma-separated list of fields to expand
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageResponse with page details

    Example:
        # Get page by title (Cloud)
        response = get_page_by_title(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            space_key="DOCS",
            title="Getting Started Guide",
            username="user@example.com",
            expand="body.storage,version",
            cloud=True
        )

        # Get page by title (Server/DC)
        response = get_page_by_title(
            url="https://wiki.company.com",
            api_token="your_pat",
            space_key="ENG",
            title="Architecture Overview",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    page_data = client.get_page_by_title(
        space=space_key,
        title=title,
        expand=expand
    )
    
    return GetPageResponse(page=page_data)


def create_page(
    url: str,
    api_token: str,
    space_key: str,
    title: str,
    body: str,
    username: str = "",
    parent_id: Optional[str] = None,
    representation: str = "storage",
    cloud: bool = False,
) -> CreatePageResponse:
    """
    Create a new page.

    Creates a new Confluence page in a specified space.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        space_key: Space key where page will be created
        title: Page title
        body: Page content (HTML or storage format)
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        parent_id: Parent page ID (optional, creates child page)
        representation: Content representation format (default: "storage")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CreatePageResponse with created page

    Example:
        # Create page with HTML content (Cloud)
        response = create_page(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            space_key="DOCS",
            title="New Documentation Page",
            body="<h1>Welcome</h1><p>This is the content.</p>",
            username="user@example.com",
            cloud=True
        )
        print(f"Created page: {response.page.title} (ID: {response.page.id})")

        # Create child page (Server/DC)
        response = create_page(
            url="https://wiki.company.com",
            api_token="your_pat",
            space_key="ENG",
            title="Sub-page Title",
            body="<p>Child page content</p>",
            parent_id="123456",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
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


def update_page(
    url: str,
    api_token: str,
    page_id: str,
    title: str,
    body: str,
    username: str = "",
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
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID to update
        title: New page title
        body: New page content
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        parent_id: New parent page ID (optional)
        representation: Content representation format (default: "storage")
        minor_edit: Whether this is a minor edit (default: False)
        version_comment: Comment for this version (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdatePageResponse with confirmation

    Example:
        # Update page content (Cloud)
        response = update_page(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            title="Updated Title",
            body="<h1>Updated Content</h1><p>New content here.</p>",
            username="user@example.com",
            version_comment="Fixed typos",
            cloud=True
        )

        # Update page and move to new parent (Server/DC)
        response = update_page(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            title="Page Title",
            body="<p>Updated content</p>",
            parent_id="654321",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
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


def delete_page(
    url: str,
    api_token: str,
    page_id: str,
    username: str = "",
    status: Optional[str] = None,
    cloud: bool = False,
) -> DeletePageResponse:
    """
    Delete a page.

    Permanently deletes or moves a page to trash.
    **Warning:** This operation may be irreversible depending on configuration!
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID to delete
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        status: Delete status ("trashed" or permanent, optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeletePageResponse with confirmation

    Example:
        # Delete page (Cloud)
        response = delete_page(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            username="user@example.com",
            cloud=True
        )

        # Delete page (Server/DC)
        response = delete_page(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    client.remove_page(page_id=page_id, status=status)
    
    return DeletePageResponse(
        page_id=page_id,
        message=f"Successfully deleted page {page_id}"
    )


def get_page_children(
    url: str,
    api_token: str,
    page_id: str,
    username: str = "",
    expand: Optional[str] = None,
    start: int = 0,
    limit: int = 25,
    cloud: bool = False,
) -> GetPageChildrenResponse:
    """
    Get child pages of a page.

    Retrieves all child pages under a specified parent page.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Parent page ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        expand: Comma-separated list of fields to expand
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageChildrenResponse with list of child pages

    Example:
        # Get child pages (Cloud)
        response = get_page_children(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            username="user@example.com",
            expand="version,space",
            limit=50,
            cloud=True
        )
        print(f"Found {response.total} child pages")
        for child in response.children:
            print(f"  {child['title']}")

        # Get child pages (Server/DC)
        response = get_page_children(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
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
        children=children,
        total=total
    )


def get_page_ancestors(
    url: str,
    api_token: str,
    page_id: str,
    username: str = "",
    cloud: bool = False,
) -> Dict[str, Any]:
    """
    Get page ancestors (parent hierarchy).

    Retrieves all ancestor pages (breadcrumb trail) for a specified page.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        Dictionary with page_id and list of ancestors

    Example:
        # Get page ancestors (Cloud)
        response = get_page_ancestors(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            username="user@example.com",
            cloud=True
        )
        print("Breadcrumb trail:")
        for ancestor in response['ancestors']:
            print(f"  {ancestor['title']}")

        # Get page ancestors (Server/DC)
        response = get_page_ancestors(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    page_data = client.get_page_by_id(page_id=page_id, expand="ancestors")
    
    ancestors = page_data.get('ancestors', [])
    
    return {
        "page_id": page_id,
        "ancestors": ancestors,
        "total": len(ancestors)
    }

