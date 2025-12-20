"""Pydantic models for Microsoft 365 MCP Server."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ============================================================================
# Common Models
# ============================================================================

class UserInfo(BaseModel):
    """User information."""
    id: str = Field(..., description="User ID")
    display_name: Optional[str] = Field(None, description="Display name")
    email: Optional[str] = Field(None, description="Email address")
    user_principal_name: Optional[str] = Field(None, description="User principal name")


class PermissionInfo(BaseModel):
    """Permission information."""
    id: str = Field(..., description="Permission ID")
    roles: List[str] = Field(default_factory=list, description="Permission roles")
    granted_to: Optional[Dict[str, Any]] = Field(None, description="Granted to identity")
    link: Optional[Dict[str, Any]] = Field(None, description="Sharing link")


# ============================================================================
# OneDrive Models
# ============================================================================

class DriveItemInfo(BaseModel):
    """Drive item (file or folder) information."""
    id: str = Field(..., description="Item ID")
    name: str = Field(..., description="Item name")
    size: int = Field(..., description="Size in bytes")
    created_datetime: str = Field(..., description="Creation datetime")
    last_modified_datetime: str = Field(..., description="Last modified datetime")
    web_url: str = Field(..., description="Web URL")
    item_type: str = Field(..., description="Type: 'file' or 'folder'")
    parent_path: Optional[str] = Field(None, description="Parent folder path")
    mime_type: Optional[str] = Field(None, description="MIME type (for files)")
    download_url: Optional[str] = Field(None, description="Download URL")


class ListDriveItemsResponse(BaseModel):
    """Response for listing drive items."""
    items: List[DriveItemInfo] = Field(..., description="List of items")
    total: int = Field(..., description="Total number of items")


class GetDriveItemResponse(BaseModel):
    """Response for getting a drive item."""
    item: DriveItemInfo = Field(..., description="Drive item details")
    message: str = Field(default="Item retrieved successfully", description="Status message")


class UploadFileResponse(BaseModel):
    """Response for uploading a file."""
    item: DriveItemInfo = Field(..., description="Uploaded file details")
    message: str = Field(default="File uploaded successfully", description="Status message")


class CreateFolderResponse(BaseModel):
    """Response for creating a folder."""
    item: DriveItemInfo = Field(..., description="Created folder details")
    message: str = Field(default="Folder created successfully", description="Status message")


class DeleteItemResponse(BaseModel):
    """Response for deleting an item."""
    success: bool = Field(..., description="Whether deletion was successful")
    item_id: str = Field(..., description="Deleted item ID")
    message: str = Field(default="Item deleted successfully", description="Status message")


class ShareItemResponse(BaseModel):
    """Response for sharing an item."""
    share_link: str = Field(..., description="Sharing link")
    permission_id: str = Field(..., description="Permission ID")
    message: str = Field(default="Item shared successfully", description="Status message")


class SearchFilesResponse(BaseModel):
    """Response for searching files."""
    items: List[DriveItemInfo] = Field(..., description="Matching items")
    total: int = Field(..., description="Total matches")


# ============================================================================
# SharePoint Models
# ============================================================================

class SiteInfo(BaseModel):
    """SharePoint site information."""
    id: str = Field(..., description="Site ID")
    name: str = Field(..., description="Site name")
    display_name: str = Field(..., description="Display name")
    web_url: str = Field(..., description="Web URL")
    description: Optional[str] = Field(None, description="Site description")
    created_datetime: Optional[str] = Field(None, description="Creation datetime")


class ListSitesResponse(BaseModel):
    """Response for listing sites."""
    sites: List[SiteInfo] = Field(..., description="List of sites")
    total: int = Field(..., description="Total number of sites")


class DocumentLibraryInfo(BaseModel):
    """Document library information."""
    id: str = Field(..., description="Library ID")
    name: str = Field(..., description="Library name")
    web_url: str = Field(..., description="Web URL")
    description: Optional[str] = Field(None, description="Library description")
    created_datetime: Optional[str] = Field(None, description="Creation datetime")


class ListLibrariesResponse(BaseModel):
    """Response for listing document libraries."""
    libraries: List[DocumentLibraryInfo] = Field(..., description="List of libraries")
    total: int = Field(..., description="Total number of libraries")


class SharePointListInfo(BaseModel):
    """SharePoint list information."""
    id: str = Field(..., description="List ID")
    name: str = Field(..., description="List name")
    display_name: str = Field(..., description="Display name")
    web_url: str = Field(..., description="Web URL")
    description: Optional[str] = Field(None, description="List description")
    template: Optional[str] = Field(None, description="List template")


class ListSharePointListsResponse(BaseModel):
    """Response for listing SharePoint lists."""
    lists: List[SharePointListInfo] = Field(..., description="List of lists")
    total: int = Field(..., description="Total number of lists")


class ListItemInfo(BaseModel):
    """SharePoint list item information."""
    id: str = Field(..., description="Item ID")
    fields: Dict[str, Any] = Field(..., description="Item fields")
    created_datetime: Optional[str] = Field(None, description="Creation datetime")
    last_modified_datetime: Optional[str] = Field(None, description="Last modified datetime")


class ListItemsResponse(BaseModel):
    """Response for listing list items."""
    items: List[ListItemInfo] = Field(..., description="List items")
    total: int = Field(..., description="Total number of items")


class CreateListItemResponse(BaseModel):
    """Response for creating a list item."""
    item: ListItemInfo = Field(..., description="Created item")
    message: str = Field(default="List item created successfully", description="Status message")


class UpdateListItemResponse(BaseModel):
    """Response for updating a list item."""
    item: ListItemInfo = Field(..., description="Updated item")
    message: str = Field(default="List item updated successfully", description="Status message")


class DeleteListItemResponse(BaseModel):
    """Response for deleting a list item."""
    success: bool = Field(..., description="Whether deletion was successful")
    item_id: str = Field(..., description="Deleted item ID")
    message: str = Field(default="List item deleted successfully", description="Status message")


# ============================================================================
# Excel Models
# ============================================================================

class WorkbookInfo(BaseModel):
    """Excel workbook information."""
    id: str = Field(..., description="Workbook ID")
    name: str = Field(..., description="Workbook name")
    web_url: str = Field(..., description="Web URL")
    size: int = Field(..., description="Size in bytes")
    created_datetime: str = Field(..., description="Creation datetime")
    last_modified_datetime: str = Field(..., description="Last modified datetime")


class ListWorkbooksResponse(BaseModel):
    """Response for listing workbooks."""
    workbooks: List[WorkbookInfo] = Field(..., description="List of workbooks")
    total: int = Field(..., description="Total number of workbooks")


class WorksheetInfo(BaseModel):
    """Excel worksheet information."""
    id: str = Field(..., description="Worksheet ID")
    name: str = Field(..., description="Worksheet name")
    position: int = Field(..., description="Position in workbook")
    visibility: str = Field(..., description="Visibility status")


class ListWorksheetsResponse(BaseModel):
    """Response for listing worksheets."""
    worksheets: List[WorksheetInfo] = Field(..., description="List of worksheets")
    total: int = Field(..., description="Total number of worksheets")


class CreateWorksheetResponse(BaseModel):
    """Response for creating a worksheet."""
    worksheet: WorksheetInfo = Field(..., description="Created worksheet")
    message: str = Field(default="Worksheet created successfully", description="Status message")


class DeleteWorksheetResponse(BaseModel):
    """Response for deleting a worksheet."""
    success: bool = Field(..., description="Whether deletion was successful")
    worksheet_id: str = Field(..., description="Deleted worksheet ID")
    message: str = Field(default="Worksheet deleted successfully", description="Status message")


class RangeInfo(BaseModel):
    """Excel range information."""
    address: str = Field(..., description="Range address (e.g., 'A1:B5')")
    values: List[List[Any]] = Field(..., description="Cell values (2D array)")
    row_count: int = Field(..., description="Number of rows")
    column_count: int = Field(..., description="Number of columns")


class ReadRangeResponse(BaseModel):
    """Response for reading a range."""
    range: RangeInfo = Field(..., description="Range data")
    message: str = Field(default="Range read successfully", description="Status message")


class WriteRangeResponse(BaseModel):
    """Response for writing to a range."""
    range: RangeInfo = Field(..., description="Updated range data")
    message: str = Field(default="Range written successfully", description="Status message")


class TableInfo(BaseModel):
    """Excel table information."""
    id: str = Field(..., description="Table ID")
    name: str = Field(..., description="Table name")
    row_count: int = Field(..., description="Number of rows")
    column_count: int = Field(..., description="Number of columns")


class ListTablesResponse(BaseModel):
    """Response for listing tables."""
    tables: List[TableInfo] = Field(..., description="List of tables")
    total: int = Field(..., description="Total number of tables")


class ReadTableResponse(BaseModel):
    """Response for reading a table."""
    table_name: str = Field(..., description="Table name")
    headers: List[str] = Field(..., description="Column headers")
    rows: List[List[Any]] = Field(..., description="Table rows")
    total_rows: int = Field(..., description="Total number of rows")
    message: str = Field(default="Table read successfully", description="Status message")


class CreateTableResponse(BaseModel):
    """Response for creating a table."""
    table: TableInfo = Field(..., description="Created table")
    message: str = Field(default="Table created successfully", description="Status message")


# ============================================================================
# Outlook Models
# ============================================================================

class EmailAddress(BaseModel):
    """Email address."""
    name: Optional[str] = Field(None, description="Display name")
    address: str = Field(..., description="Email address")


class MessageInfo(BaseModel):
    """Email message information."""
    id: str = Field(..., description="Message ID")
    subject: str = Field(..., description="Subject")
    body_preview: Optional[str] = Field(None, description="Body preview")
    from_address: Optional[EmailAddress] = Field(None, description="From address")
    to_recipients: List[EmailAddress] = Field(default_factory=list, description="To recipients")
    cc_recipients: List[EmailAddress] = Field(default_factory=list, description="CC recipients")
    received_datetime: Optional[str] = Field(None, description="Received datetime")
    is_read: bool = Field(False, description="Is read")
    has_attachments: bool = Field(False, description="Has attachments")
    importance: str = Field("normal", description="Importance level")
    web_link: Optional[str] = Field(None, description="Web link")


class ListMessagesResponse(BaseModel):
    """Response for listing messages."""
    messages: List[MessageInfo] = Field(..., description="List of messages")
    total: int = Field(..., description="Total number of messages")


class GetMessageResponse(BaseModel):
    """Response for getting a message."""
    message: MessageInfo = Field(..., description="Message details")
    body: Optional[str] = Field(None, description="Full message body")
    message_str: str = Field(default="Message retrieved successfully", description="Status message")


class SendMessageResponse(BaseModel):
    """Response for sending a message."""
    success: bool = Field(..., description="Whether send was successful")
    message_id: Optional[str] = Field(None, description="Sent message ID")
    message: str = Field(default="Message sent successfully", description="Status message")


class DeleteMessageResponse(BaseModel):
    """Response for deleting a message."""
    success: bool = Field(..., description="Whether deletion was successful")
    message_id: str = Field(..., description="Deleted message ID")
    message: str = Field(default="Message deleted successfully", description="Status message")


class MailFolderInfo(BaseModel):
    """Mail folder information."""
    id: str = Field(..., description="Folder ID")
    display_name: str = Field(..., description="Display name")
    parent_folder_id: Optional[str] = Field(None, description="Parent folder ID")
    total_item_count: int = Field(0, description="Total item count")
    unread_item_count: int = Field(0, description="Unread item count")


class ListMailFoldersResponse(BaseModel):
    """Response for listing mail folders."""
    folders: List[MailFolderInfo] = Field(..., description="List of folders")
    total: int = Field(..., description="Total number of folders")


class CalendarEventInfo(BaseModel):
    """Calendar event information."""
    id: str = Field(..., description="Event ID")
    subject: str = Field(..., description="Subject")
    body_preview: Optional[str] = Field(None, description="Body preview")
    start: Dict[str, str] = Field(..., description="Start datetime and timezone")
    end: Dict[str, str] = Field(..., description="End datetime and timezone")
    location: Optional[str] = Field(None, description="Location")
    attendees: List[Dict[str, Any]] = Field(default_factory=list, description="Attendees")
    organizer: Optional[Dict[str, str]] = Field(None, description="Organizer")
    is_all_day: bool = Field(False, description="Is all day event")
    is_cancelled: bool = Field(False, description="Is cancelled")
    web_link: Optional[str] = Field(None, description="Web link")


class ListEventsResponse(BaseModel):
    """Response for listing calendar events."""
    events: List[CalendarEventInfo] = Field(..., description="List of events")
    total: int = Field(..., description="Total number of events")


class GetEventResponse(BaseModel):
    """Response for getting an event."""
    event: CalendarEventInfo = Field(..., description="Event details")
    message: str = Field(default="Event retrieved successfully", description="Status message")


class CreateEventResponse(BaseModel):
    """Response for creating an event."""
    event: CalendarEventInfo = Field(..., description="Created event")
    message: str = Field(default="Event created successfully", description="Status message")


class UpdateEventResponse(BaseModel):
    """Response for updating an event."""
    event: CalendarEventInfo = Field(..., description="Updated event")
    message: str = Field(default="Event updated successfully", description="Status message")


class DeleteEventResponse(BaseModel):
    """Response for deleting an event."""
    success: bool = Field(..., description="Whether deletion was successful")
    event_id: str = Field(..., description="Deleted event ID")
    message: str = Field(default="Event deleted successfully", description="Status message")


class CalendarInfo(BaseModel):
    """Calendar information."""
    id: str = Field(..., description="Calendar ID")
    name: str = Field(..., description="Calendar name")
    color: Optional[str] = Field(None, description="Calendar color")
    can_edit: bool = Field(True, description="Can edit")
    can_share: bool = Field(True, description="Can share")
    is_default: bool = Field(False, description="Is default calendar")
    owner: Optional[Dict[str, str]] = Field(None, description="Owner information")


class ListCalendarsResponse(BaseModel):
    """Response for listing calendars."""
    calendars: List[CalendarInfo] = Field(..., description="List of calendars")
    total: int = Field(..., description="Total number of calendars")

