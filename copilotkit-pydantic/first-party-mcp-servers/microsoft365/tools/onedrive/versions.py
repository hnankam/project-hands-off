"""OneDrive version management tools."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_graph_client
from typing import Optional


async def list_item_versions(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
) -> dict:
    """
    List versions of a OneDrive file.

    Retrieves version history for a file.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        item_id: Item ID

    Returns:
        Dictionary with versions list

    Example:
        response = await list_item_versions(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            item_id="abc123"
        )
        for version in response["versions"]:
            print(f"Version ID: {version['id']}, Modified: {version['last_modified']}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get versions
        result = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).versions.get()
        
        versions = []
        if result and result.value:
            for version in result.value:
                versions.append({
                    "id": version.id,
                    "last_modified_datetime": version.last_modified_date_time.isoformat() if version.last_modified_date_time else "",
                    "last_modified_by": version.last_modified_by.user.display_name if version.last_modified_by and version.last_modified_by.user else None,
                    "size": version.size or 0,
                })
        
        return {
            "versions": versions,
            "total": len(versions),
            "message": "Versions retrieved successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to list versions: {str(e)}")


async def restore_version(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
    version_id: str,
) -> dict:
    """
    Restore a previous version of a OneDrive file.

    Restores a file to a previous version.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        item_id: Item ID
        version_id: Version ID to restore

    Returns:
        Dictionary with restore operation status

    Example:
        response = await restore_version(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            item_id="abc123",
            version_id="1.0"
        )
        print(response["message"])
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Restore version
        result = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).versions.by_drive_item_version_id(version_id).restore_version.post()
        
        return {
            "success": True,
            "item_id": item_id,
            "version_id": version_id,
            "message": "Version restored successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to restore version: {str(e)}")
