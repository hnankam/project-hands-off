"""Confluence Space Management Operations.

This module provides tools for managing Confluence spaces:
- List, get, create, update, delete spaces
- Get space content
- Get space permissions
"""

from typing import Any, Optional, Dict, List
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_confluence_client
from models import (
    ListSpacesResponse,
    GetSpaceResponse,
    CreateSpaceResponse,
    UpdateSpaceResponse,
    DeleteSpaceResponse,
    SpaceInfo,
)


def list_spaces(
    url: str,
    api_token: str,
    username: str = "",
    space_type: Optional[str] = None,
    status: Optional[str] = None,
    start: int = 0,
    limit: int = 25,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> ListSpacesResponse:
    """
    List all spaces.

    Retrieves all spaces visible to the user.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        space_type: Filter by space type ("global", "personal") (optional, filtered client-side)
        status: Filter by status ("current", "archived") (optional, filtered client-side)
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        expand: Comma-separated list of fields to expand
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        ListSpacesResponse with all accessible spaces

    Example:
        # List all spaces (Cloud)
        response = list_spaces(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            username="user@example.com",
            limit=50,
            cloud=True
        )
        for space in response.spaces:
            print(f"{space.key}: {space.name}")

        # List global spaces only (Server/DC)
        response = list_spaces(
            url="https://wiki.company.com",
            api_token="your_pat",
            space_type="global",
            status="current",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    
    # Note: The SDK's get_all_spaces() only supports start, limit, and expand parameters
    # Space type and status filtering must be done manually
    spaces_data = client.get_all_spaces(
        start=start,
        limit=limit,
        expand=expand
    )
    
    # Handle different response formats
    if isinstance(spaces_data, dict):
        spaces_list = spaces_data.get('results', [])
    elif isinstance(spaces_data, list):
        spaces_list = spaces_data
    else:
        spaces_list = []
    
    # Apply manual filtering for space_type and status if provided
    if space_type or status:
        filtered_list = []
        for space in spaces_list:
            # Filter by space type
            if space_type and space.get('type') != space_type:
                continue
            # Filter by status
            if status and space.get('status') != status:
                continue
            filtered_list.append(space)
        spaces_list = filtered_list
    
    # Parse spaces
    spaces = [SpaceInfo(**space) for space in spaces_list]
    
    return ListSpacesResponse(
        spaces=spaces,
        total=len(spaces)
    )


def get_space(
    url: str,
    api_token: str,
    space_key: str,
    username: str = "",
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetSpaceResponse:
    """
    Get space details.

    Retrieves complete information about a specific space.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        space_key: Space key
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        expand: Comma-separated list of fields to expand (e.g., "homepage,description,metadata")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetSpaceResponse with complete space details

    Example:
        # Get space with expanded fields (Cloud)
        response = get_space(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            space_key="DOCS",
            username="user@example.com",
            expand="homepage,description.view",
            cloud=True
        )
        print(f"Space: {response.space['name']}")
        print(f"Description: {response.space.get('description', {}).get('plain', {}).get('value')}")

        # Get space (Server/DC)
        response = get_space(
            url="https://wiki.company.com",
            api_token="your_pat",
            space_key="ENG",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    space_data = client.get_space(
        space_key=space_key,
        expand=expand
    )
    
    return GetSpaceResponse(space=space_data)


def create_space(
    url: str,
    api_token: str,
    space_key: str,
    space_name: str,
    username: str = "",
    description: Optional[str] = None,
    cloud: bool = False,
) -> CreateSpaceResponse:
    """
    Create a new space.

    Creates a new Confluence space.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        space_key: Unique space key (e.g., "DOCS", "ENG")
        space_name: Space display name
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        description: Space description (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CreateSpaceResponse with created space

    Example:
        # Create space (Cloud)
        response = create_space(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            space_key="DOCS",
            space_name="Documentation",
            username="user@example.com",
            description="Product documentation and guides",
            cloud=True
        )
        print(f"Created space: {response.space.name} ({response.space.key})")

        # Create space (Server/DC)
        response = create_space(
            url="https://wiki.company.com",
            api_token="your_pat",
            space_key="ENG",
            space_name="Engineering",
            description="Engineering documentation",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    space_data = client.create_space(
        space_key=space_key,
        space_name=space_name,
        description=description
    )
    
    # Parse space
    space = SpaceInfo(**space_data)
    
    return CreateSpaceResponse(
        space=space,
        message=f"Successfully created space '{space_name}' ({space_key})"
    )


def update_space(
    url: str,
    api_token: str,
    space_key: str,
    username: str = "",
    name: Optional[str] = None,
    description: Optional[str] = None,
    homepage_id: Optional[str] = None,
    cloud: bool = False,
) -> UpdateSpaceResponse:
    """
    Update space details.

    Updates properties of an existing space.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        space_key: Space key to update
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        name: New space name (optional)
        description: New space description (optional)
        homepage_id: New homepage page ID (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateSpaceResponse with confirmation

    Example:
        # Update space name and description (Cloud)
        response = update_space(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            space_key="DOCS",
            username="user@example.com",
            name="Product Documentation",
            description="Comprehensive product documentation and user guides",
            cloud=True
        )

        # Update space description (Server/DC)
        response = update_space(
            url="https://wiki.company.com",
            api_token="your_pat",
            space_key="ENG",
            description="Updated engineering documentation - Q4 2025",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    
    # Note: The SDK doesn't have update_space method, use REST API directly
    # Get current space to build update payload
    current_space = client.get_space(space_key)
    
    # Build update data
    update_data = {
        "name": name if name else current_space.get("name"),
        "key": space_key
    }
    
    if description:
        update_data["description"] = {
            "plain": {
                "value": description,
                "representation": "plain"
            }
        }
    
    if homepage_id:
        update_data["homepage"] = {"id": homepage_id}
    
    # Use PUT request to update space
    client.put(f"rest/api/space/{space_key}", data=update_data)
    
    return UpdateSpaceResponse(
        space_key=space_key,
        message=f"Successfully updated space {space_key}"
    )


def delete_space(
    url: str,
    api_token: str,
    space_key: str,
    username: str = "",
    cloud: bool = False,
) -> DeleteSpaceResponse:
    """
    Delete a space.

    Permanently deletes a Confluence space and all its content.
    **WARNING:** This operation is irreversible and deletes all pages, attachments, and comments!
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        space_key: Space key to delete
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteSpaceResponse with confirmation

    Example:
        # Delete space (Cloud) - USE WITH EXTREME CAUTION!
        response = delete_space(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            space_key="OLD",
            username="user@example.com",
            cloud=True
        )
        print(response.message)

        # Delete space (Server/DC)
        response = delete_space(
            url="https://wiki.company.com",
            api_token="your_pat",
            space_key="DEPRECATED",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    client.delete_space(space_key=space_key)
    
    return DeleteSpaceResponse(
        space_key=space_key,
        message=f"Successfully deleted space {space_key}"
    )


def get_space_content(
    url: str,
    api_token: str,
    space_key: str,
    username: str = "",
    depth: str = "all",
    start: int = 0,
    limit: int = 25,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> dict:
    """
    Get all content in a space.

    Retrieves all pages and blog posts in a space.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        space_key: Space key
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        depth: Content depth ("all" or "root") (default: "all")
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        expand: Comma-separated list of fields to expand
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        Dictionary with space content

    Example:
        # Get all pages in space (Cloud)
        response = get_space_content(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            space_key="DOCS",
            username="user@example.com",
            limit=100,
            expand="version,space",
            cloud=True
        )
        print(f"Space has {response['total']} content items")
        for item in response['results']:
            print(f"  {item['title']} ({item['type']})")

        # Get root-level pages only (Server/DC)
        response = get_space_content(
            url="https://wiki.company.com",
            api_token="your_pat",
            space_key="ENG",
            depth="root",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    content_data = client.get_space_content(
        space_key=space_key,
        depth=depth,
        start=start,
        limit=limit,
        expand=expand
    )
    
    # Handle different response formats
    if isinstance(content_data, dict):
        results = content_data.get('page', {}).get('results', [])
        total = content_data.get('page', {}).get('size', len(results))
    else:
        results = []
        total = 0
    
    return {
        "space_key": space_key,
        "results": results,
        "total": total
    }

