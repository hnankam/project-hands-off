"""OneDrive file management tools."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_graph_client
from models import (
    DriveItemInfo,
    ListDriveItemsResponse,
    GetDriveItemResponse,
    UploadFileResponse,
    CreateFolderResponse,
    DeleteItemResponse,
    SearchFilesResponse,
    ShareItemResponse,
    PermissionInfo,
)
from typing import Optional, List


async def list_drive_items(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    folder_path: str = "root",
) -> ListDriveItemsResponse:
    """
    List items in a OneDrive folder.

    Lists files and folders in the specified OneDrive folder path.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        folder_path: Folder path (default: "root" for root folder)

    Returns:
        ListDriveItemsResponse with list of items

    Example:
        response = await list_drive_items(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            folder_path="root"
        )
        for item in response.items:
            print(f"{item.name} ({item.item_type})")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get drive items
        if folder_path == "root" or folder_path == "/":
            result = await client.users.by_user_id(user_id).drive.root.children.get()
        else:
            # Remove leading slash if present
            path = folder_path.lstrip("/")
            result = await client.users.by_user_id(user_id).drive.root.item_with_path(path).children.get()
        
        items = []
        if result and result.value:
            for item in result.value:
                # Determine item type
                item_type = "folder" if item.folder else "file"
                
                # Get download URL if file
                download_url = None
                if item_type == "file" and hasattr(item, "microsoft_graph_download_url"):
                    download_url = item.microsoft_graph_download_url
                
                items.append(DriveItemInfo(
                    id=item.id,
                    name=item.name,
                    size=item.size or 0,
                    created_datetime=item.created_date_time.isoformat() if item.created_date_time else "",
                    last_modified_datetime=item.last_modified_date_time.isoformat() if item.last_modified_date_time else "",
                    web_url=item.web_url or "",
                    item_type=item_type,
                    parent_path=folder_path,
                    mime_type=item.file.mime_type if hasattr(item, "file") and item.file else None,
                    download_url=download_url,
                ))
        
        return ListDriveItemsResponse(
            items=items,
            total=len(items)
        )
    
    except Exception as e:
        raise Exception(f"Failed to list drive items: {str(e)}")


async def get_drive_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: Optional[str] = None,
    item_path: Optional[str] = None,
) -> GetDriveItemResponse:
    """
    Get details of a OneDrive item.

    Retrieves detailed information about a file or folder by ID or path.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        item_id: Item ID (provide either item_id or item_path)
        item_path: Item path from root (provide either item_id or item_path)

    Returns:
        GetDriveItemResponse with item details

    Example:
        response = await get_drive_item(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            item_path="/Documents/report.xlsx"
        )
        print(f"File: {response.item.name}, Size: {response.item.size} bytes")
    """
    if not item_id and not item_path:
        raise ValueError("Must provide either item_id or item_path")
    
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get item by ID or path
        if item_id:
            item = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).get()
        else:
            path = item_path.lstrip("/")
            item = await client.users.by_user_id(user_id).drive.root.item_with_path(path).get()
        
        # Determine item type
        item_type = "folder" if item.folder else "file"
        
        # Get download URL if file
        download_url = None
        if item_type == "file" and hasattr(item, "microsoft_graph_download_url"):
            download_url = item.microsoft_graph_download_url
        
        drive_item = DriveItemInfo(
            id=item.id,
            name=item.name,
            size=item.size or 0,
            created_datetime=item.created_date_time.isoformat() if item.created_date_time else "",
            last_modified_datetime=item.last_modified_date_time.isoformat() if item.last_modified_date_time else "",
            web_url=item.web_url or "",
            item_type=item_type,
            mime_type=item.file.mime_type if hasattr(item, "file") and item.file else None,
            download_url=download_url,
        )
        
        return GetDriveItemResponse(item=drive_item)
    
    except Exception as e:
        raise Exception(f"Failed to get drive item: {str(e)}")


async def upload_file(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    file_path: str,
    file_content: bytes,
    parent_folder_path: str = "root",
) -> UploadFileResponse:
    """
    Upload a file to OneDrive.

    Uploads a file to the specified OneDrive folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        file_path: Name of the file to create
        file_content: File content as bytes
        parent_folder_path: Parent folder path (default: "root")

    Returns:
        UploadFileResponse with uploaded file details

    Example:
        with open("report.xlsx", "rb") as f:
            content = f.read()
        
        response = await upload_file(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            file_path="report.xlsx",
            file_content=content,
            parent_folder_path="/Documents"
        )
        print(f"Uploaded: {response.item.name}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Upload file
        if parent_folder_path == "root" or parent_folder_path == "/":
            item = await client.users.by_user_id(user_id).drive.root.item_with_path(file_path).content.put(file_content)
        else:
            path = parent_folder_path.lstrip("/")
            full_path = f"{path}/{file_path}"
            item = await client.users.by_user_id(user_id).drive.root.item_with_path(full_path).content.put(file_content)
        
        drive_item = DriveItemInfo(
            id=item.id,
            name=item.name,
            size=item.size or 0,
            created_datetime=item.created_date_time.isoformat() if item.created_date_time else "",
            last_modified_datetime=item.last_modified_date_time.isoformat() if item.last_modified_date_time else "",
            web_url=item.web_url or "",
            item_type="file",
            parent_path=parent_folder_path,
            mime_type=item.file.mime_type if hasattr(item, "file") and item.file else None,
        )
        
        return UploadFileResponse(item=drive_item)
    
    except Exception as e:
        raise Exception(f"Failed to upload file: {str(e)}")


async def download_file(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: Optional[str] = None,
    item_path: Optional[str] = None,
) -> dict:
    """
    Download a file from OneDrive.

    Downloads file content by ID or path.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        item_id: Item ID (provide either item_id or item_path)
        item_path: Item path from root (provide either item_id or item_path)

    Returns:
        Dictionary with file_name, content (bytes), and size

    Example:
        response = await download_file(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            item_path="/Documents/report.xlsx"
        )
        
        with open(response["file_name"], "wb") as f:
            f.write(response["content"])
    """
    if not item_id and not item_path:
        raise ValueError("Must provide either item_id or item_path")
    
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get file content
        if item_id:
            item = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).get()
            content = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).content.get()
        else:
            path = item_path.lstrip("/")
            item = await client.users.by_user_id(user_id).drive.root.item_with_path(path).get()
            content = await client.users.by_user_id(user_id).drive.root.item_with_path(path).content.get()
        
        return {
            "file_name": item.name,
            "content": content,
            "size": len(content),
            "message": "File downloaded successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to download file: {str(e)}")


async def create_folder(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    folder_name: str,
    parent_folder_path: str = "root",
) -> CreateFolderResponse:
    """
    Create a folder in OneDrive.

    Creates a new folder in the specified parent folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        folder_name: Name of the folder to create
        parent_folder_path: Parent folder path (default: "root")

    Returns:
        CreateFolderResponse with created folder details

    Example:
        response = await create_folder(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            folder_name="Reports",
            parent_folder_path="/Documents"
        )
        print(f"Created folder: {response.item.name}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from kiota_abstractions.serialization import Parsable
        from msgraph.generated.models.drive_item import DriveItem
        from msgraph.generated.models.folder import Folder
        
        # Create folder object
        drive_item = DriveItem()
        drive_item.name = folder_name
        drive_item.folder = Folder()
        
        # Create folder
        if parent_folder_path == "root" or parent_folder_path == "/":
            item = await client.users.by_user_id(user_id).drive.root.children.post(drive_item)
        else:
            path = parent_folder_path.lstrip("/")
            item = await client.users.by_user_id(user_id).drive.root.item_with_path(path).children.post(drive_item)
        
        folder_item = DriveItemInfo(
            id=item.id,
            name=item.name,
            size=0,
            created_datetime=item.created_date_time.isoformat() if item.created_date_time else "",
            last_modified_datetime=item.last_modified_date_time.isoformat() if item.last_modified_date_time else "",
            web_url=item.web_url or "",
            item_type="folder",
            parent_path=parent_folder_path,
        )
        
        return CreateFolderResponse(item=folder_item)
    
    except Exception as e:
        raise Exception(f"Failed to create folder: {str(e)}")


async def delete_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: Optional[str] = None,
    item_path: Optional[str] = None,
) -> DeleteItemResponse:
    """
    Delete a file or folder from OneDrive.

    Deletes an item by ID or path.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        item_id: Item ID (provide either item_id or item_path)
        item_path: Item path from root (provide either item_id or item_path)

    Returns:
        DeleteItemResponse with deletion status

    Example:
        response = await delete_item(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            item_path="/Documents/old_report.xlsx"
        )
        print(response.message)
    """
    if not item_id and not item_path:
        raise ValueError("Must provide either item_id or item_path")
    
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Delete item
        if item_id:
            await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).delete()
            deleted_id = item_id
        else:
            path = item_path.lstrip("/")
            # Get ID first to return it
            item = await client.users.by_user_id(user_id).drive.root.item_with_path(path).get()
            deleted_id = item.id
            await client.users.by_user_id(user_id).drive.root.item_with_path(path).delete()
        
        return DeleteItemResponse(
            success=True,
            item_id=deleted_id
        )
    
    except Exception as e:
        raise Exception(f"Failed to delete item: {str(e)}")


async def search_files(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    query: str,
) -> SearchFilesResponse:
    """
    Search for files in OneDrive.

    Searches for files and folders matching the query.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        query: Search query string

    Returns:
        SearchFilesResponse with matching items

    Example:
        response = await search_files(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            query="report"
        )
        for item in response.items:
            print(f"Found: {item.name} ({item.item_type})")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Search for items
        result = await client.users.by_user_id(user_id).drive.root.search(q=query).get()
        
        items = []
        if result and result.value:
            for item in result.value:
                item_type = "folder" if item.folder else "file"
                
                download_url = None
                if item_type == "file" and hasattr(item, "microsoft_graph_download_url"):
                    download_url = item.microsoft_graph_download_url
                
                items.append(DriveItemInfo(
                    id=item.id,
                    name=item.name,
                    size=item.size or 0,
                    created_datetime=item.created_date_time.isoformat() if item.created_date_time else "",
                    last_modified_datetime=item.last_modified_date_time.isoformat() if item.last_modified_date_time else "",
                    web_url=item.web_url or "",
                    item_type=item_type,
                    mime_type=item.file.mime_type if hasattr(item, "file") and item.file else None,
                    download_url=download_url,
                ))
        
        return SearchFilesResponse(
            items=items,
            total=len(items)
        )
    
    except Exception as e:
        raise Exception(f"Failed to search files: {str(e)}")


async def share_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
    share_type: str = "view",
    recipients: Optional[List[str]] = None,
) -> ShareItemResponse:
    """
    Share a OneDrive item.

    Creates a sharing link for a file or folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        item_id: Item ID to share
        share_type: Type of sharing link ("view", "edit", "embed")
        recipients: Optional list of email addresses to share with

    Returns:
        ShareItemResponse with sharing link

    Example:
        response = await share_item(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            item_id="abc123",
            share_type="view",
            recipients=["user@company.com"]
        )
        print(f"Share link: {response.share_link}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.drives.item.items.item.create_link.create_link_post_request_body import CreateLinkPostRequestBody
        
        # Create sharing link
        request_body = CreateLinkPostRequestBody()
        request_body.type = share_type
        request_body.scope = "organization" if recipients else "anonymous"
        
        result = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).create_link.post(request_body)
        
        return ShareItemResponse(
            share_link=result.link.web_url if result.link else "",
            permission_id=result.id or ""
        )
    
    except Exception as e:
        raise Exception(f"Failed to share item: {str(e)}")


async def get_item_permissions(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
) -> dict:
    """
    Get permissions for a OneDrive item.

    Retrieves sharing permissions for a file or folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        item_id: Item ID

    Returns:
        Dictionary with permissions list

    Example:
        response = await get_item_permissions(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            item_id="abc123"
        )
        for perm in response["permissions"]:
            print(f"Permission ID: {perm['id']}, Roles: {perm['roles']}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get permissions
        result = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).permissions.get()
        
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
        raise Exception(f"Failed to get permissions: {str(e)}")


async def copy_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
    destination_folder_id: str,
    new_name: Optional[str] = None,
) -> dict:
    """
    Copy a file or folder in OneDrive.

    Copies an item to a destination folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        item_id: Item ID to copy
        destination_folder_id: Destination folder ID
        new_name: Optional new name for the copied item

    Returns:
        Dictionary with copy operation status

    Example:
        response = await copy_item(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            item_id="abc123",
            destination_folder_id="def456",
            new_name="report_copy.xlsx"
        )
        print(response["message"])
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.drives.item.items.item.copy.copy_post_request_body import CopyPostRequestBody
        from msgraph.generated.models.item_reference import ItemReference
        
        # Create copy request
        request_body = CopyPostRequestBody()
        parent_ref = ItemReference()
        parent_ref.id = destination_folder_id
        request_body.parent_reference = parent_ref
        
        if new_name:
            request_body.name = new_name
        
        # Copy item (async operation)
        await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).copy.post(request_body)
        
        return {
            "success": True,
            "message": "Copy operation initiated successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to copy item: {str(e)}")


async def move_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
    destination_folder_id: str,
    new_name: Optional[str] = None,
) -> dict:
    """
    Move a file or folder in OneDrive.

    Moves an item to a destination folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        item_id: Item ID to move
        destination_folder_id: Destination folder ID
        new_name: Optional new name for the moved item

    Returns:
        Dictionary with move operation status

    Example:
        response = await move_item(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            item_id="abc123",
            destination_folder_id="def456",
            new_name="report_moved.xlsx"
        )
        print(response["message"])
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.models.drive_item import DriveItem
        from msgraph.generated.models.item_reference import ItemReference
        
        # Create update request
        drive_item = DriveItem()
        parent_ref = ItemReference()
        parent_ref.id = destination_folder_id
        drive_item.parent_reference = parent_ref
        
        if new_name:
            drive_item.name = new_name
        
        # Move item
        result = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).patch(drive_item)
        
        return {
            "success": True,
            "item_id": result.id,
            "new_name": result.name,
            "message": "Item moved successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to move item: {str(e)}")
