"""SharePoint site and document library tools."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_graph_client
from models import (
    SiteInfo,
    ListSitesResponse,
    DocumentLibraryInfo,
    ListLibrariesResponse,
    DriveItemInfo,
    ListDriveItemsResponse,
    UploadFileResponse,
    CreateFolderResponse,
    ShareItemResponse,
)
from typing import Optional


async def list_sites(
    tenant_id: str,
    client_id: str,
    client_secret: str,
) -> ListSitesResponse:
    """
    List SharePoint sites.

    Retrieves all SharePoint sites accessible to the user.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret

    Returns:
        ListSitesResponse with list of sites

    Example:
        response = await list_sites(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx"
        )
        for site in response.sites:
            print(f"{site.name}: {site.web_url}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # List sites
        result = await client.sites.get()
        
        sites = []
        if result and result.value:
            for site in result.value:
                sites.append(SiteInfo(
                    id=site.id,
                    name=site.name or "",
                    display_name=site.display_name or site.name or "",
                    web_url=site.web_url or "",
                    description=site.description,
                    created_datetime=site.created_date_time.isoformat() if hasattr(site, "created_date_time") and site.created_date_time else None,
                ))
        
        return ListSitesResponse(
            sites=sites,
            total=len(sites)
        )
    
    except Exception as e:
        raise Exception(f"Failed to list sites: {str(e)}")


async def get_site(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
) -> dict:
    """
    Get SharePoint site details.

    Retrieves detailed information about a specific site.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID

    Returns:
        Dictionary with site details

    Example:
        response = await get_site(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456"
        )
        print(f"Site: {response['name']}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get site
        site = await client.sites.by_site_id(site_id).get()
        
        return {
            "id": site.id,
            "name": site.name or "",
            "display_name": site.display_name or site.name or "",
            "web_url": site.web_url or "",
            "description": site.description,
            "created_datetime": site.created_date_time.isoformat() if hasattr(site, "created_date_time") and site.created_date_time else None,
            "message": "Site retrieved successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to get site: {str(e)}")


async def list_document_libraries(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
) -> ListLibrariesResponse:
    """
    List document libraries in a SharePoint site.

    Retrieves all document libraries in the specified site.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID

    Returns:
        ListLibrariesResponse with list of libraries

    Example:
        response = await list_document_libraries(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456"
        )
        for library in response.libraries:
            print(f"{library.name}: {library.web_url}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # List drives (document libraries)
        result = await client.sites.by_site_id(site_id).drives.get()
        
        libraries = []
        if result and result.value:
            for drive in result.value:
                libraries.append(DocumentLibraryInfo(
                    id=drive.id,
                    name=drive.name or "",
                    web_url=drive.web_url or "",
                    description=drive.description,
                    created_datetime=drive.created_date_time.isoformat() if hasattr(drive, "created_date_time") and drive.created_date_time else None,
                ))
        
        return ListLibrariesResponse(
            libraries=libraries,
            total=len(libraries)
        )
    
    except Exception as e:
        raise Exception(f"Failed to list document libraries: {str(e)}")


async def list_files_in_library(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    folder_path: str = "root",
) -> ListDriveItemsResponse:
    """
    List files in a SharePoint document library.

    Lists files and folders in the specified library folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID
        library_id: Document library (drive) ID
        folder_path: Folder path (default: "root")

    Returns:
        ListDriveItemsResponse with list of items

    Example:
        response = await list_files_in_library(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456",
            library_id="b!abc123...",
            folder_path="root"
        )
        for item in response.items:
            print(f"{item.name} ({item.item_type})")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # List items
        if folder_path == "root" or folder_path == "/":
            result = await client.sites.by_site_id(site_id).drives.by_drive_id(library_id).root.children.get()
        else:
            path = folder_path.lstrip("/")
            result = await client.sites.by_site_id(site_id).drives.by_drive_id(library_id).root.item_with_path(path).children.get()
        
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
                    parent_path=folder_path,
                    mime_type=item.file.mime_type if hasattr(item, "file") and item.file else None,
                ))
        
        return ListDriveItemsResponse(
            items=items,
            total=len(items)
        )
    
    except Exception as e:
        raise Exception(f"Failed to list files: {str(e)}")


async def upload_file_to_library(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    file_path: str,
    file_content: bytes,
    parent_folder_path: str = "root",
) -> UploadFileResponse:
    """
    Upload a file to SharePoint document library.

    Uploads a file to the specified library folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID
        library_id: Document library (drive) ID
        file_path: Name of the file to create
        file_content: File content as bytes
        parent_folder_path: Parent folder path (default: "root")

    Returns:
        UploadFileResponse with uploaded file details

    Example:
        with open("document.docx", "rb") as f:
            content = f.read()
        
        response = await upload_file_to_library(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456",
            library_id="b!abc123...",
            file_path="document.docx",
            file_content=content
        )
        print(f"Uploaded: {response.item.name}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Upload file
        if parent_folder_path == "root" or parent_folder_path == "/":
            item = await client.sites.by_site_id(site_id).drives.by_drive_id(library_id).root.item_with_path(file_path).content.put(file_content)
        else:
            path = parent_folder_path.lstrip("/")
            full_path = f"{path}/{file_path}"
            item = await client.sites.by_site_id(site_id).drives.by_drive_id(library_id).root.item_with_path(full_path).content.put(file_content)
        
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


async def download_file_from_library(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    item_id: str,
) -> dict:
    """
    Download a file from SharePoint document library.

    Downloads file content by item ID.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID
        library_id: Document library (drive) ID
        item_id: Item ID

    Returns:
        Dictionary with file_name, content (bytes), and size

    Example:
        response = await download_file_from_library(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456",
            library_id="b!abc123...",
            item_id="01ABC123..."
        )
        
        with open(response["file_name"], "wb") as f:
            f.write(response["content"])
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get file
        item = await client.sites.by_site_id(site_id).drives.by_drive_id(library_id).items.by_drive_item_id(item_id).get()
        content = await client.sites.by_site_id(site_id).drives.by_drive_id(library_id).items.by_drive_item_id(item_id).content.get()
        
        return {
            "file_name": item.name,
            "content": content,
            "size": len(content),
            "message": "File downloaded successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to download file: {str(e)}")


async def create_folder_in_library(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    folder_name: str,
    parent_folder_path: str = "root",
) -> CreateFolderResponse:
    """
    Create a folder in SharePoint document library.

    Creates a new folder in the specified library location.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID
        library_id: Document library (drive) ID
        folder_name: Name of the folder to create
        parent_folder_path: Parent folder path (default: "root")

    Returns:
        CreateFolderResponse with created folder details

    Example:
        response = await create_folder_in_library(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456",
            library_id="b!abc123...",
            folder_name="New Project"
        )
        print(f"Created: {response.item.name}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.models.drive_item import DriveItem
        from msgraph.generated.models.folder import Folder
        
        # Create folder object
        drive_item = DriveItem()
        drive_item.name = folder_name
        drive_item.folder = Folder()
        
        # Create folder
        if parent_folder_path == "root" or parent_folder_path == "/":
            item = await client.sites.by_site_id(site_id).drives.by_drive_id(library_id).root.children.post(drive_item)
        else:
            path = parent_folder_path.lstrip("/")
            item = await client.sites.by_site_id(site_id).drives.by_drive_id(library_id).root.item_with_path(path).children.post(drive_item)
        
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


async def share_library_file(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    item_id: str,
    share_type: str = "view",
) -> ShareItemResponse:
    """
    Share a file from SharePoint document library.

    Creates a sharing link for a file.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID
        library_id: Document library (drive) ID
        item_id: Item ID to share
        share_type: Type of sharing link ("view", "edit", "embed")

    Returns:
        ShareItemResponse with sharing link

    Example:
        response = await share_library_file(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456",
            library_id="b!abc123...",
            item_id="01ABC123...",
            share_type="view"
        )
        print(f"Share link: {response.share_link}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.drives.item.items.item.create_link.create_link_post_request_body import CreateLinkPostRequestBody
        
        # Create sharing link
        request_body = CreateLinkPostRequestBody()
        request_body.type = share_type
        request_body.scope = "organization"
        
        result = await client.sites.by_site_id(site_id).drives.by_drive_id(library_id).items.by_drive_item_id(item_id).create_link.post(request_body)
        
        return ShareItemResponse(
            share_link=result.link.web_url if result.link else "",
            permission_id=result.id or ""
        )
    
    except Exception as e:
        raise Exception(f"Failed to share file: {str(e)}")
