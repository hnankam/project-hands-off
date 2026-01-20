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
    url_credential_key: str,
    token_credential_key: str,
    username_credential_key: str = "",
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
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        username_credential_key: Credential key for username (Cloud only, default: "")
        space_type: Filter by space type ("global", "personal") (optional, filtered client-side)
        status: Filter by status ("current", "archived") (optional, filtered client-side)
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        expand: Comma-separated list of fields to expand
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        ListSpacesResponse with all accessible spaces
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        
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
            start_at=start
        )
    except Exception as e:
        return ListSpacesResponse(
            spaces=[],
            start_at=start,
            error_message=f"Failed to list spaces: {str(e)}"
        )


def get_space(
    url_credential_key: str,
    token_credential_key: str,
    space_key: str,
    username_credential_key: str = "",
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetSpaceResponse:
    """
    Get space details.

    Retrieves complete information about a specific space.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        space_key: Space key
        username_credential_key: Credential key for username (Cloud only, default: "")
        expand: Comma-separated list of fields to expand (e.g., "homepage,description,metadata")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetSpaceResponse with complete space details
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        space_data = client.get_space(
            space_key=space_key,
            expand=expand
        )
        
        return GetSpaceResponse(space=space_data)
    except Exception as e:
        return GetSpaceResponse(
            space=None,
            error_message=f"Failed to get space '{space_key}': {str(e)}"
        )


def create_space(
    url_credential_key: str,
    token_credential_key: str,
    space_key: str,
    space_name: str,
    username_credential_key: str = "",
    description: Optional[str] = None,
    cloud: bool = False,
) -> CreateSpaceResponse:
    """
    Create a new space.

    Creates a new Confluence space.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        space_key: Unique space key (e.g., "DOCS", "ENG")
        space_name: Space display name
        username_credential_key: Credential key for username (Cloud only, default: "")
        description: Space description (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CreateSpaceResponse with created space
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
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
    except Exception as e:
        return CreateSpaceResponse(
            space=None,
            message=None,
            error_message=f"Failed to create space '{space_name}' ({space_key}): {str(e)}"
        )


def update_space(
    url_credential_key: str,
    token_credential_key: str,
    space_key: str,
    username_credential_key: str = "",
    name: Optional[str] = None,
    description: Optional[str] = None,
    homepage_id: Optional[str] = None,
    cloud: bool = False,
) -> UpdateSpaceResponse:
    """
    Update space details.

    Updates properties of an existing space.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        space_key: Space key to update
        username_credential_key: Credential key for username (Cloud only, default: "")
        name: New space name (optional)
        description: New space description (optional)
        homepage_id: New homepage page ID (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateSpaceResponse with confirmation
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        
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
    except Exception as e:
        return UpdateSpaceResponse(
            space_key=space_key,
            message=None,
            error_message=f"Failed to update space {space_key}: {str(e)}"
        )


def delete_space(
    url_credential_key: str,
    token_credential_key: str,
    space_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> DeleteSpaceResponse:
    """
    Delete a space.

    Permanently deletes a Confluence space and all its content.
    **WARNING:** This operation is irreversible and deletes all pages, attachments, and comments!
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        space_key: Space key to delete
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteSpaceResponse with confirmation
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        client.delete_space(space_key=space_key)
        
        return DeleteSpaceResponse(
            space_key=space_key,
            message=f"Successfully deleted space {space_key}"
        )
    except Exception as e:
        return DeleteSpaceResponse(
            space_key=space_key,
            message=None,
            error_message=f"Failed to delete space {space_key}: {str(e)}"
        )


def get_space_content(
    url_credential_key: str,
    token_credential_key: str,
    space_key: str,
    username_credential_key: str = "",
    depth: str = "all",
    start: int = 0,
    limit: int = 25,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> dict:
    """
    Get all content in a space.

    Retrieves all pages and blog posts in a space.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        space_key: Space key
        username_credential_key: Credential key for username (Cloud only, default: "")
        depth: Content depth ("all" or "root") (default: "all")
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        expand: Comma-separated list of fields to expand
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        Dictionary with space content
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
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
            "results": results
        }
    except Exception as e:
        return {
            "space_key": space_key,
            "results": [],
            "error": f"Failed to get content for space {space_key}: {str(e)}"
        }

