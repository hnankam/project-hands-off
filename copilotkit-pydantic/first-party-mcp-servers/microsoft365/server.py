"""Microsoft 365 MCP Server - FastMCP Registration

This server provides 57 tools for Microsoft 365 services:
- OneDrive (15 tools)
- SharePoint (15 tools)
- Excel (12 tools)
- Outlook (15 tools)
"""

from fastmcp import FastMCP
from typing import Optional, List, Dict, Any

# Import all tools
from tools.onedrive import (
    list_drive_items, get_drive_item, upload_file, download_file,
    create_folder, delete_item, search_files, share_item,
    get_item_permissions, copy_item, move_item, list_item_versions,
    restore_version, get_item_thumbnail, get_item_preview_link
)

from tools.sharepoint import (
    list_sites, get_site, list_document_libraries, list_files_in_library,
    upload_file_to_library, download_file_from_library, create_folder_in_library,
    share_library_file, list_sharepoint_lists, get_list_items, create_list_item,
    update_list_item, delete_list_item, search_sharepoint_content, get_file_permissions
)

from tools.excel import (
    list_workbooks, get_workbook, list_worksheets, get_worksheet,
    create_worksheet, delete_worksheet, read_range, write_range,
    read_table, write_table, create_table, list_tables
)

from tools.outlook import (
    list_messages, get_message, send_message, reply_message,
    forward_message, delete_message, move_message, search_messages,
    list_mail_folders, create_mail_folder, list_events, get_event,
    create_event, update_event, delete_event
)

mcp = FastMCP("Microsoft 365 MCP Server")

# ============================================================================
# OneDrive Tools (15)
# ============================================================================

@mcp.tool()
def m365_list_drive_items(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    folder_path: str = "root"
):
    """List items in a OneDrive folder."""
    return list_drive_items(tenant_id, client_id, client_secret, user_id, folder_path)


@mcp.tool()
def m365_get_drive_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: Optional[str] = None,
    item_path: Optional[str] = None
):
    """Get OneDrive item details by ID or path."""
    return get_drive_item(tenant_id, client_id, client_secret, user_id, item_id, item_path)


@mcp.tool()
def m365_upload_file(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    file_path: str,
    file_content: bytes,
    parent_folder_path: str = "root"
):
    """Upload file to OneDrive."""
    return upload_file(tenant_id, client_id, client_secret, user_id, file_path, file_content, parent_folder_path)


@mcp.tool()
def m365_download_file(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: Optional[str] = None,
    item_path: Optional[str] = None
):
    """Download file from OneDrive."""
    return download_file(tenant_id, client_id, client_secret, user_id, item_id, item_path)


@mcp.tool()
def m365_create_folder(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    folder_name: str,
    parent_folder_path: str = "root"
):
    """Create folder in OneDrive."""
    return create_folder(tenant_id, client_id, client_secret, user_id, folder_name, parent_folder_path)


@mcp.tool()
def m365_delete_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: Optional[str] = None,
    item_path: Optional[str] = None
):
    """Delete file or folder from OneDrive."""
    return delete_item(tenant_id, client_id, client_secret, user_id, item_id, item_path)


@mcp.tool()
def m365_search_files(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    query: str
):
    """Search for files in OneDrive."""
    return search_files(tenant_id, client_id, client_secret, user_id, query)


@mcp.tool()
def m365_share_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
    share_type: str = "view",
    recipients: Optional[List[str]] = None
):
    """Share a OneDrive item."""
    return share_item(tenant_id, client_id, client_secret, user_id, item_id, share_type, recipients)


@mcp.tool()
def m365_get_item_permissions(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str
):
    """Get permissions for a OneDrive item."""
    return get_item_permissions(tenant_id, client_id, client_secret, user_id, item_id)


@mcp.tool()
def m365_copy_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
    destination_folder_id: str,
    new_name: Optional[str] = None
):
    """Copy a file or folder in OneDrive."""
    return copy_item(tenant_id, client_id, client_secret, user_id, item_id, destination_folder_id, new_name)


@mcp.tool()
def m365_move_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
    destination_folder_id: str,
    new_name: Optional[str] = None
):
    """Move a file or folder in OneDrive."""
    return move_item(tenant_id, client_id, client_secret, user_id, item_id, destination_folder_id, new_name)


@mcp.tool()
def m365_list_item_versions(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str
):
    """List versions of a OneDrive file."""
    return list_item_versions(tenant_id, client_id, client_secret, user_id, item_id)


@mcp.tool()
def m365_restore_version(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
    version_id: str
):
    """Restore a previous version of a OneDrive file."""
    return restore_version(tenant_id, client_id, client_secret, user_id, item_id, version_id)


@mcp.tool()
def m365_get_item_thumbnail(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str,
    size: str = "medium"
):
    """Get thumbnail for a OneDrive file."""
    return get_item_thumbnail(tenant_id, client_id, client_secret, user_id, item_id, size)


@mcp.tool()
def m365_get_item_preview_link(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    item_id: str
):
    """Get preview link for a OneDrive file."""
    return get_item_preview_link(tenant_id, client_id, client_secret, user_id, item_id)


# ============================================================================
# SharePoint Tools (15)
# ============================================================================

@mcp.tool()
def m365_list_sites(
    tenant_id: str,
    client_id: str,
    client_secret: str
):
    """List SharePoint sites."""
    return list_sites(tenant_id, client_id, client_secret)


@mcp.tool()
def m365_get_site(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str
):
    """Get SharePoint site details."""
    return get_site(tenant_id, client_id, client_secret, site_id)


@mcp.tool()
def m365_list_document_libraries(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str
):
    """List document libraries in a SharePoint site."""
    return list_document_libraries(tenant_id, client_id, client_secret, site_id)


@mcp.tool()
def m365_list_files_in_library(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    folder_path: str = "root"
):
    """List files in a SharePoint document library."""
    return list_files_in_library(tenant_id, client_id, client_secret, site_id, library_id, folder_path)


@mcp.tool()
def m365_upload_file_to_library(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    file_path: str,
    file_content: bytes,
    parent_folder_path: str = "root"
):
    """Upload file to SharePoint document library."""
    return upload_file_to_library(tenant_id, client_id, client_secret, site_id, library_id, file_path, file_content, parent_folder_path)


@mcp.tool()
def m365_download_file_from_library(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    item_id: str
):
    """Download file from SharePoint document library."""
    return download_file_from_library(tenant_id, client_id, client_secret, site_id, library_id, item_id)


@mcp.tool()
def m365_create_folder_in_library(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    folder_name: str,
    parent_folder_path: str = "root"
):
    """Create folder in SharePoint document library."""
    return create_folder_in_library(tenant_id, client_id, client_secret, site_id, library_id, folder_name, parent_folder_path)


@mcp.tool()
def m365_share_library_file(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    item_id: str,
    share_type: str = "view"
):
    """Share a file from SharePoint document library."""
    return share_library_file(tenant_id, client_id, client_secret, site_id, library_id, item_id, share_type)


@mcp.tool()
def m365_list_sharepoint_lists(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str
):
    """List SharePoint lists in a site."""
    return list_sharepoint_lists(tenant_id, client_id, client_secret, site_id)


@mcp.tool()
def m365_get_list_items(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    list_id: str
):
    """Get items from a SharePoint list."""
    return get_list_items(tenant_id, client_id, client_secret, site_id, list_id)


@mcp.tool()
def m365_create_list_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    list_id: str,
    fields: Dict[str, Any]
):
    """Create a new item in a SharePoint list."""
    return create_list_item(tenant_id, client_id, client_secret, site_id, list_id, fields)


@mcp.tool()
def m365_update_list_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    list_id: str,
    item_id: str,
    fields: Dict[str, Any]
):
    """Update a SharePoint list item."""
    return update_list_item(tenant_id, client_id, client_secret, site_id, list_id, item_id, fields)


@mcp.tool()
def m365_delete_list_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    list_id: str,
    item_id: str
):
    """Delete a SharePoint list item."""
    return delete_list_item(tenant_id, client_id, client_secret, site_id, list_id, item_id)


@mcp.tool()
def m365_search_sharepoint_content(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    query: str
):
    """Search content in a SharePoint site."""
    return search_sharepoint_content(tenant_id, client_id, client_secret, site_id, query)


@mcp.tool()
def m365_get_file_permissions(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    library_id: str,
    item_id: str
):
    """Get permissions for a SharePoint file."""
    return get_file_permissions(tenant_id, client_id, client_secret, site_id, library_id, item_id)


# ============================================================================
# Excel Tools (12)
# ============================================================================

@mcp.tool()
def m365_list_workbooks(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    folder_path: str = "root"
):
    """List Excel workbooks in OneDrive."""
    return list_workbooks(tenant_id, client_id, client_secret, user_id, folder_path)


@mcp.tool()
def m365_get_workbook(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str
):
    """Get Excel workbook details."""
    return get_workbook(tenant_id, client_id, client_secret, user_id, workbook_id)


@mcp.tool()
def m365_list_worksheets(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str
):
    """List worksheets in an Excel workbook."""
    return list_worksheets(tenant_id, client_id, client_secret, user_id, workbook_id)


@mcp.tool()
def m365_get_worksheet(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str
):
    """Get worksheet details."""
    return get_worksheet(tenant_id, client_id, client_secret, user_id, workbook_id, worksheet_id)


@mcp.tool()
def m365_create_worksheet(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    name: str
):
    """Create a new worksheet in an Excel workbook."""
    return create_worksheet(tenant_id, client_id, client_secret, user_id, workbook_id, name)


@mcp.tool()
def m365_delete_worksheet(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str
):
    """Delete a worksheet from an Excel workbook."""
    return delete_worksheet(tenant_id, client_id, client_secret, user_id, workbook_id, worksheet_id)


@mcp.tool()
def m365_read_range(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
    range_address: str
):
    """Read a cell range from an Excel worksheet."""
    return read_range(tenant_id, client_id, client_secret, user_id, workbook_id, worksheet_id, range_address)


@mcp.tool()
def m365_write_range(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
    range_address: str,
    values: List[List[Any]]
):
    """Write data to a cell range in an Excel worksheet."""
    return write_range(tenant_id, client_id, client_secret, user_id, workbook_id, worksheet_id, range_address, values)


@mcp.tool()
def m365_read_table(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
    table_name: str
):
    """Read data from an Excel table."""
    return read_table(tenant_id, client_id, client_secret, user_id, workbook_id, worksheet_id, table_name)


@mcp.tool()
def m365_write_table(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
    table_name: str,
    data: List[List[Any]]
):
    """Write data to an Excel table."""
    return write_table(tenant_id, client_id, client_secret, user_id, workbook_id, worksheet_id, table_name, data)


@mcp.tool()
def m365_create_table(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str,
    range_address: str,
    name: str,
    has_headers: bool = True
):
    """Create a new table in an Excel worksheet."""
    return create_table(tenant_id, client_id, client_secret, user_id, workbook_id, worksheet_id, range_address, name, has_headers)


@mcp.tool()
def m365_list_tables(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    workbook_id: str,
    worksheet_id: str
):
    """List tables in an Excel worksheet."""
    return list_tables(tenant_id, client_id, client_secret, user_id, workbook_id, worksheet_id)


# ============================================================================
# Outlook Tools (15)
# ============================================================================

@mcp.tool()
def m365_list_messages(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    folder: str = "inbox",
    top: int = 25
):
    """List email messages from a folder."""
    return list_messages(tenant_id, client_id, client_secret, user_id, folder, top)


@mcp.tool()
def m365_get_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    message_id: str
):
    """Get email message details."""
    return get_message(tenant_id, client_id, client_secret, user_id, message_id)


@mcp.tool()
def m365_send_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    to_recipients: List[str],
    subject: str,
    body: str,
    cc_recipients: Optional[List[str]] = None,
    body_type: str = "html"
):
    """Send an email message."""
    return send_message(tenant_id, client_id, client_secret, user_id, to_recipients, subject, body, cc_recipients, body_type)


@mcp.tool()
def m365_reply_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    message_id: str,
    body: str,
    body_type: str = "html"
):
    """Reply to an email message."""
    return reply_message(tenant_id, client_id, client_secret, user_id, message_id, body, body_type)


@mcp.tool()
def m365_forward_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    message_id: str,
    to_recipients: List[str],
    body: Optional[str] = None
):
    """Forward an email message."""
    return forward_message(tenant_id, client_id, client_secret, user_id, message_id, to_recipients, body)


@mcp.tool()
def m365_delete_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    message_id: str
):
    """Delete an email message."""
    return delete_message(tenant_id, client_id, client_secret, user_id, message_id)


@mcp.tool()
def m365_move_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    message_id: str,
    destination_folder_id: str
):
    """Move an email message to a folder."""
    return move_message(tenant_id, client_id, client_secret, user_id, message_id, destination_folder_id)


@mcp.tool()
def m365_search_messages(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    query: str,
    top: int = 25
):
    """Search email messages."""
    return search_messages(tenant_id, client_id, client_secret, user_id, query, top)


@mcp.tool()
def m365_list_mail_folders(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str
):
    """List mail folders."""
    return list_mail_folders(tenant_id, client_id, client_secret, user_id)


@mcp.tool()
def m365_create_mail_folder(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    display_name: str,
    parent_folder_id: Optional[str] = None
):
    """Create a mail folder."""
    return create_mail_folder(tenant_id, client_id, client_secret, user_id, display_name, parent_folder_id)


@mcp.tool()
def m365_list_events(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    start_datetime: Optional[str] = None,
    end_datetime: Optional[str] = None,
    top: int = 25
):
    """List calendar events."""
    return list_events(tenant_id, client_id, client_secret, user_id, start_datetime, end_datetime, top)


@mcp.tool()
def m365_get_event(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    event_id: str
):
    """Get calendar event details."""
    return get_event(tenant_id, client_id, client_secret, user_id, event_id)


@mcp.tool()
def m365_create_event(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    subject: str,
    start_datetime: str,
    start_timezone: str,
    end_datetime: str,
    end_timezone: str,
    attendees: Optional[List[str]] = None,
    location: Optional[str] = None,
    body: Optional[str] = None,
    is_all_day: bool = False
):
    """Create a calendar event."""
    return create_event(tenant_id, client_id, client_secret, user_id, subject, start_datetime, start_timezone, end_datetime, end_timezone, attendees, location, body, is_all_day)


@mcp.tool()
def m365_update_event(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    event_id: str,
    updates: Dict[str, Any]
):
    """Update a calendar event."""
    return update_event(tenant_id, client_id, client_secret, user_id, event_id, updates)


@mcp.tool()
def m365_delete_event(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    event_id: str
):
    """Delete a calendar event."""
    return delete_event(tenant_id, client_id, client_secret, user_id, event_id)


# ============================================================================
# Server Entry Point
# ============================================================================

if __name__ == "__main__":
    mcp.run()

