"""Excel data operations tools."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_graph_client
from models import (
    RangeInfo,
    ReadRangeResponse,
    WriteRangeResponse,
    ReadTableResponse,
    TableInfo,
    ListTablesResponse,
    CreateTableResponse,
)
from typing import List, Any


async def read_range(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
    range_address: str,
) -> ReadRangeResponse:
    """
    Read a cell range from an Excel worksheet.

    Reads values from the specified cell range.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        workbook_id: Workbook (file) ID
        worksheet_id: Worksheet ID
        range_address: Range address (e.g., "A1:C10")

    Returns:
        ReadRangeResponse with range data

    Example:
        response = await read_range(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            workbook_id="file-id",
            worksheet_id="sheet-id",
            range_address="A1:C10"
        )
        print(f"Values: {response.range.values}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Read range
        range_result = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id) \
            .workbook.worksheets.by_workbook_worksheet_id(worksheet_id) \
            .range_with_address(range_address).get()
        
        range_info = RangeInfo(
            address=range_result.address or range_address,
            values=range_result.values or [],
            row_count=range_result.row_count or 0,
            column_count=range_result.column_count or 0,
        )
        
        return ReadRangeResponse(range=range_info)
    
    except Exception as e:
        raise Exception(f"Failed to read range: {str(e)}")


async def write_range(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
    range_address: str,
    values: List[List[Any]],
) -> WriteRangeResponse:
    """
    Write data to a cell range in an Excel worksheet.

    Writes values to the specified cell range.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        workbook_id: Workbook (file) ID
        worksheet_id: Worksheet ID
        range_address: Range address (e.g., "A1:C10")
        values: 2D array of values to write

    Returns:
        WriteRangeResponse with updated range data

    Example:
        response = await write_range(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            workbook_id="file-id",
            worksheet_id="sheet-id",
            range_address="A1:B2",
            values=[["Name", "Age"], ["John", 30]]
        )
        print(response.message)
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.models.workbook_range import WorkbookRange
        
        # Prepare range update
        range_update = WorkbookRange()
        range_update.values = values
        
        # Write range
        range_result = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id) \
            .workbook.worksheets.by_workbook_worksheet_id(worksheet_id) \
            .range_with_address(range_address).patch(range_update)
        
        range_info = RangeInfo(
            address=range_result.address or range_address,
            values=range_result.values or values,
            row_count=range_result.row_count or len(values),
            column_count=range_result.column_count or (len(values[0]) if values else 0),
        )
        
        return WriteRangeResponse(range=range_info)
    
    except Exception as e:
        raise Exception(f"Failed to write range: {str(e)}")


async def read_table(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
    table_name: str,
) -> ReadTableResponse:
    """
    Read data from an Excel table.

    Reads all data from the specified table including headers.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        workbook_id: Workbook (file) ID
        worksheet_id: Worksheet ID
        table_name: Table name

    Returns:
        ReadTableResponse with table data

    Example:
        response = await read_table(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            workbook_id="file-id",
            worksheet_id="sheet-id",
            table_name="Table1"
        )
        print(f"Headers: {response.headers}")
        print(f"Rows: {response.rows}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get table
        table = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id) \
            .workbook.worksheets.by_workbook_worksheet_id(worksheet_id) \
            .tables.by_workbook_table_id(table_name).get()
        
        # Get data range
        data_range = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id) \
            .workbook.worksheets.by_workbook_worksheet_id(worksheet_id) \
            .tables.by_workbook_table_id(table_name).data_body_range.get()
        
        # Get header range
        header_range = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id) \
            .workbook.worksheets.by_workbook_worksheet_id(worksheet_id) \
            .tables.by_workbook_table_id(table_name).header_row_range.get()
        
        headers = header_range.values[0] if header_range.values else []
        rows = data_range.values or []
        
        return ReadTableResponse(
            table_name=table.name or table_name,
            headers=headers,
            rows=rows,
            total_rows=len(rows)
        )
    
    except Exception as e:
        raise Exception(f"Failed to read table: {str(e)}")


async def write_table(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
    table_name: str,
    data: List[List[Any]],
) -> dict:
    """
    Write data to an Excel table.

    Appends rows to the specified table.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        workbook_id: Workbook (file) ID
        worksheet_id: Worksheet ID
        table_name: Table name
        data: 2D array of values to append (without headers)

    Returns:
        Dictionary with operation status

    Example:
        response = await write_table(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            workbook_id="file-id",
            worksheet_id="sheet-id",
            table_name="Table1",
            data=[["John", 30], ["Jane", 25]]
        )
        print(response["message"])
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.drives.item.items.item.workbook.tables.item.rows.add.add_post_request_body import AddPostRequestBody
        
        # Add rows to table
        for row in data:
            request_body = AddPostRequestBody()
            request_body.values = [row]
            request_body.index = None  # Append to end
            
            await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id) \
                .workbook.worksheets.by_workbook_worksheet_id(worksheet_id) \
                .tables.by_workbook_table_id(table_name).rows.add.post(request_body)
        
        return {
            "success": True,
            "rows_added": len(data),
            "message": f"Successfully added {len(data)} rows to table"
        }
    
    except Exception as e:
        raise Exception(f"Failed to write table: {str(e)}")


async def create_table(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
    range_address: str,
    name: str,
    has_headers: bool = True,
) -> CreateTableResponse:
    """
    Create a new table in an Excel worksheet.

    Creates a table from the specified range.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        workbook_id: Workbook (file) ID
        worksheet_id: Worksheet ID
        range_address: Range address for table (e.g., "A1:C10")
        name: Table name
        has_headers: Whether the first row contains headers (default: True)

    Returns:
        CreateTableResponse with created table

    Example:
        response = await create_table(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            workbook_id="file-id",
            worksheet_id="sheet-id",
            range_address="A1:C10",
            name="SalesData",
            has_headers=True
        )
        print(f"Created table: {response.table.name}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.drives.item.items.item.workbook.tables.add.add_post_request_body import AddPostRequestBody
        
        # Create table
        request_body = AddPostRequestBody()
        request_body.address = range_address
        request_body.has_headers = has_headers
        request_body.name = name
        
        table = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id) \
            .workbook.worksheets.by_workbook_worksheet_id(worksheet_id) \
            .tables.add.post(request_body)
        
        table_info = TableInfo(
            id=table.id,
            name=table.name or name,
            row_count=table.row_count or 0,
            column_count=table.column_count or 0,
        )
        
        return CreateTableResponse(table=table_info)
    
    except Exception as e:
        raise Exception(f"Failed to create table: {str(e)}")


async def list_tables(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
) -> ListTablesResponse:
    """
    List tables in an Excel worksheet.

    Retrieves all tables in the specified worksheet.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        workbook_id: Workbook (file) ID
        worksheet_id: Worksheet ID

    Returns:
        ListTablesResponse with list of tables

    Example:
        response = await list_tables(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            workbook_id="file-id",
            worksheet_id="sheet-id"
        )
        for table in response.tables:
            print(f"{table.name}: {table.row_count} rows")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # List tables
        result = await client.users.by_user_id(user_id).drive.items.by_drive_item_id(workbook_id) \
            .workbook.worksheets.by_workbook_worksheet_id(worksheet_id) \
            .tables.get()
        
        tables = []
        if result and result.value:
            for table in result.value:
                tables.append(TableInfo(
                    id=table.id,
                    name=table.name or "",
                    row_count=table.row_count or 0,
                    column_count=table.column_count or 0,
                ))
        
        return ListTablesResponse(
            tables=tables,
            total=len(tables)
        )
    
    except Exception as e:
        raise Exception(f"Failed to list tables: {str(e)}")
