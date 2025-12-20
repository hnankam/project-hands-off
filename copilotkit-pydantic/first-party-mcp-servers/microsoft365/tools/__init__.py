"""Microsoft 365 MCP Server - Tools Module

This module provides 57 tools across 4 services:
- OneDrive: 15 tools for file management
- SharePoint: 15 tools for collaboration
- Excel: 12 tools for data operations
- Outlook: 15 tools for email and calendar
"""

from .onedrive import *
from .sharepoint import *
from .excel import *
from .outlook import *

__all__ = [
    # OneDrive (15 tools)
    "list_drive_items",
    "get_drive_item",
    "upload_file",
    "download_file",
    "create_folder",
    "delete_item",
    "search_files",
    "share_item",
    "get_item_permissions",
    "copy_item",
    "move_item",
    "list_item_versions",
    "restore_version",
    "get_item_thumbnail",
    "get_item_preview_link",
    
    # SharePoint (15 tools)
    "list_sites",
    "get_site",
    "list_document_libraries",
    "list_files_in_library",
    "upload_file_to_library",
    "download_file_from_library",
    "create_folder_in_library",
    "share_library_file",
    "list_sharepoint_lists",
    "get_list_items",
    "create_list_item",
    "update_list_item",
    "delete_list_item",
    "search_sharepoint_content",
    "get_file_permissions",
    
    # Excel (12 tools)
    "list_workbooks",
    "get_workbook",
    "list_worksheets",
    "get_worksheet",
    "create_worksheet",
    "delete_worksheet",
    "read_range",
    "write_range",
    "read_table",
    "write_table",
    "create_table",
    "list_tables",
    
    # Outlook (15 tools)
    "list_messages",
    "get_message",
    "send_message",
    "reply_message",
    "forward_message",
    "delete_message",
    "move_message",
    "search_messages",
    "list_mail_folders",
    "create_mail_folder",
    "list_events",
    "get_event",
    "create_event",
    "update_event",
    "delete_event",
]

