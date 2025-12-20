"""OneDrive preview and thumbnail tools."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_graph_client
from typing import Optional


async def get_item_thumbnail(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
    size: str = "medium",
) -> dict:
    """
    Get thumbnail for a OneDrive file.

    Retrieves thumbnail image URL for a file.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        item_id: Item ID
        size: Thumbnail size ("small", "medium", "large")

    Returns:
        Dictionary with thumbnail URL

    Example:
        response = await get_item_thumbnail(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            item_id="abc123",
            size="large"
        )
        print(f"Thumbnail URL: {response['thumbnail_url']}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get thumbnails
        result = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).thumbnails.get()
        
        thumbnail_url = None
        if result and result.value:
            for thumbnail_set in result.value:
                if size == "small" and thumbnail_set.small:
                    thumbnail_url = thumbnail_set.small.url
                elif size == "medium" and thumbnail_set.medium:
                    thumbnail_url = thumbnail_set.medium.url
                elif size == "large" and thumbnail_set.large:
                    thumbnail_url = thumbnail_set.large.url
                
                if thumbnail_url:
                    break
        
        return {
            "thumbnail_url": thumbnail_url or "",
            "size": size,
            "message": "Thumbnail retrieved successfully" if thumbnail_url else "No thumbnail available"
        }
    
    except Exception as e:
        raise Exception(f"Failed to get thumbnail: {str(e)}")


async def get_item_preview_link(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
) -> dict:
    """
    Get preview link for a OneDrive file.

    Generates a preview link for a file that can be embedded.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        item_id: Item ID

    Returns:
        Dictionary with preview link

    Example:
        response = await get_item_preview_link(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            item_id="abc123"
        )
        print(f"Preview URL: {response['preview_url']}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get preview
        result = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).preview.post()
        
        return {
            "preview_url": result.get_url or "",
            "post_parameters": result.post_parameters or "",
            "message": "Preview link generated successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to get preview link: {str(e)}")
