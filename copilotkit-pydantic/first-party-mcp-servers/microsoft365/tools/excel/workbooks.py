"""Excel workbook and worksheet management tools."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_graph_client
from models import (
    WorkbookInfo,
    ListWorkbooksResponse,
    WorksheetInfo,
    ListWorksheetsResponse,
    CreateWorksheetResponse,
    DeleteWorksheetResponse,
)
from typing import Optional


async def list_workbooks(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    folder_path: str = "root",
) -> ListWorkbooksResponse:
    """
    List Excel workbooks in OneDrive.

    Lists Excel files (.xlsx) in the specified folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        folder_path: Folder path to search (default: "root")

    Returns:
        ListWorkbooksResponse with list of workbooks

    Example:
        response = await list_workbooks(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            folder_path="/Documents"
        )
        for wb in response.workbooks:
            print(f"{wb.name}: {wb.web_url}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get items in folder
        if folder_path == "root" or folder_path == "/":
            result = await client.users.by_user_id(user_id).drive.root.children.get()
        else:
            path = folder_path.lstrip("/")
            result = await client.users.by_user_id(user_id).drive.root.item_with_path(path).children.get()
        
        workbooks = []
        if result and result.value:
            for item in result.value:
                # Filter for Excel files
                if item.file and item.name.endswith(('.xlsx', '.xlsm', '.xls')):
                    workbooks.append(WorkbookInfo(
                        id=item.id,
                        name=item.name,
                        web_url=item.web_url or "",
                        size=item.size or 0,
                        created_datetime=item.created_date_time.isoformat() if item.created_date_time else "",
                        last_modified_datetime=item.last_modified_date_time.isoformat() if item.last_modified_date_time else "",
                    ))
        
        return ListWorkbooksResponse(
            workbooks=workbooks,
            total=len(workbooks)
        )
    
    except Exception as e:
        raise Exception(f"Failed to list workbooks: {str(e)}")


async def get_workbook(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
) -> dict:
    """
    Get Excel workbook details.

    Retrieves information about a specific workbook.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        workbook_id: Workbook (file) ID

    Returns:
        Dictionary with workbook details

    Example:
        response = await get_workbook(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            workbook_id="file-id"
        )
        print(f"Workbook: {response['name']}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get workbook item
        item = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id).get()
        
        return {
            "id": item.id,
            "name": item.name,
            "web_url": item.web_url or "",
            "size": item.size or 0,
            "created_datetime": item.created_date_time.isoformat() if item.created_date_time else "",
            "last_modified_datetime": item.last_modified_date_time.isoformat() if item.last_modified_date_time else "",
            "message": "Workbook retrieved successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to get workbook: {str(e)}")


async def list_worksheets(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
) -> ListWorksheetsResponse:
    """
    List worksheets in an Excel workbook.

    Retrieves all worksheets (sheets) in the workbook.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        workbook_id: Workbook (file) ID

    Returns:
        ListWorksheetsResponse with list of worksheets

    Example:
        response = await list_worksheets(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            workbook_id="file-id"
        )
        for sheet in response.worksheets:
            print(f"{sheet.name} (Position: {sheet.position})")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get worksheets
        result = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id).workbook.worksheets.get()
        
        worksheets = []
        if result and result.value:
            for sheet in result.value:
                worksheets.append(WorksheetInfo(
                    id=sheet.id,
                    name=sheet.name or "",
                    position=sheet.position or 0,
                    visibility=sheet.visibility or "visible",
                ))
        
        return ListWorksheetsResponse(
            worksheets=worksheets,
            total=len(worksheets)
        )
    
    except Exception as e:
        raise Exception(f"Failed to list worksheets: {str(e)}")


async def get_worksheet(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
) -> dict:
    """
    Get worksheet details.

    Retrieves information about a specific worksheet.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        workbook_id: Workbook (file) ID
        worksheet_id: Worksheet ID

    Returns:
        Dictionary with worksheet details

    Example:
        response = await get_worksheet(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            workbook_id="file-id",
            worksheet_id="sheet-id"
        )
        print(f"Sheet: {response['name']}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get worksheet
        sheet = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id).workbook.worksheets.by_workbook_worksheet_id(worksheet_id).get()
        
        return {
            "id": sheet.id,
            "name": sheet.name or "",
            "position": sheet.position or 0,
            "visibility": sheet.visibility or "visible",
            "message": "Worksheet retrieved successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to get worksheet: {str(e)}")


async def create_worksheet(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    name: str,
) -> CreateWorksheetResponse:
    """
    Create a new worksheet in an Excel workbook.

    Adds a new sheet to the workbook.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        workbook_id: Workbook (file) ID
        name: Name for the new worksheet

    Returns:
        CreateWorksheetResponse with created worksheet

    Example:
        response = await create_worksheet(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            workbook_id="file-id",
            name="Q4 Data"
        )
        print(f"Created: {response.worksheet.name}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.drives.item.items.item.workbook.worksheets.add.add_post_request_body import AddPostRequestBody
        
        # Create worksheet
        request_body = AddPostRequestBody()
        request_body.name = name
        
        sheet = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id).workbook.worksheets.add.post(request_body)
        
        worksheet = WorksheetInfo(
            id=sheet.id,
            name=sheet.name or "",
            position=sheet.position or 0,
            visibility=sheet.visibility or "visible",
        )
        
        return CreateWorksheetResponse(worksheet=worksheet)
    
    except Exception as e:
        raise Exception(f"Failed to create worksheet: {str(e)}")


async def delete_worksheet(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
) -> DeleteWorksheetResponse:
    """
    Delete a worksheet from an Excel workbook.

    Removes a sheet from the workbook.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        workbook_id: Workbook (file) ID
        worksheet_id: Worksheet ID to delete

    Returns:
        DeleteWorksheetResponse with deletion status

    Example:
        response = await delete_worksheet(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            workbook_id="file-id",
            worksheet_id="sheet-id"
        )
        print(response.message)
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Delete worksheet
        await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id).workbook.worksheets.by_workbook_worksheet_id(worksheet_id).delete()
        
        return DeleteWorksheetResponse(
            success=True,
            worksheet_id=worksheet_id
        )
    
    except Exception as e:
        raise Exception(f"Failed to delete worksheet: {str(e)}")
