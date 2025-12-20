"""SharePoint search and permissions tools."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_graph_client
from models import SearchFilesResponse, DriveItemInfo
from typing import Optional


async def search_sharepoint_content(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    query: str,
) -> SearchFilesResponse:
    """
    Search content in a SharePoint site.

    Searches for files and content matching the query in the specified site.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID
        query: Search query string

    Returns:
        SearchFilesResponse with matching items

    Example:
        response = await search_sharepoint_content(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456",
            query="project plan"
        )
        for item in response.items:
            print(f"Found: {item.name} - {item.web_url}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Search in site's default drive
        result = await client.sites.by_site_id(site_id).drive.root.search(q=query).get()
        
        items = []
        if result and result.value:
            for item in result.value:
                item_type = "folder" if item.folder else "file"
                
                items.append(DriveItemInfo(
                    id=item.id,
                    name=item.name,
                    size=item.size or 0,
                    created_datetime=item.created_date_time.isoformat() if item.created_date_time else "",
                    last_modified_datetime=item.last_modified_date_time.isoformat() if item.last_modified_date_time else "",
                    web_url=item.web_url or "",
                    item_type=item_type,
                    mime_type=item.file.mime_type if hasattr(item, "file") and item.file else None,
                ))
        
        return SearchFilesResponse(
            items=items,
            total=len(items)
        )
    
    except Exception as e:
        raise Exception(f"Failed to search SharePoint content: {str(e)}")


async def get_file_permissions(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    item_id: str,
) -> dict:
    """
    Get permissions for a SharePoint file.

    Retrieves sharing permissions for a file in a SharePoint library.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID
        library_id: Document library (drive) ID
        item_id: Item ID

    Returns:
        Dictionary with permissions list

    Example:
        response = await get_file_permissions(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456",
            library_id="b!abc123...",
            item_id="01ABC123..."
        )
        for perm in response["permissions"]:
            print(f"Permission: {perm['roles']}, Granted to: {perm['granted_to']}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get permissions
        result = await client.sites.by_site_id(site_id).drives.by_drive_id(library_id).items.by_drive_item_id(item_id).permissions.get()
        
        permissions = []
        if result and result.value:
            for perm in result.value:
                permissions.append({
                    "id": perm.id,
                    "roles": perm.roles or [],
                    "granted_to": perm.granted_to.user.display_name if perm.granted_to and perm.granted_to.user else None,
                    "link": perm.link.web_url if perm.link else None,
                })
        
        return {
            "permissions": permissions,
            "total": len(permissions),
            "message": "Permissions retrieved successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to get file permissions: {str(e)}")
