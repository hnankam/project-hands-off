"""SharePoint tools for Microsoft 365 MCP Server."""

from .sites import (
    list_sites,
    get_site,
    list_document_libraries,
    list_files_in_library,
    upload_file_to_library,
    download_file_from_library,
    create_folder_in_library,
    share_library_file,
)

from .lists import (
    list_sharepoint_lists,
    get_list_items,
    create_list_item,
    update_list_item,
    delete_list_item,
)

from .search import (
    search_sharepoint_content,
    get_file_permissions,
)

__all__ = [
    # Site operations (8)
    "list_sites",
    "get_site",
    "list_document_libraries",
    "list_files_in_library",
    "upload_file_to_library",
    "download_file_from_library",
    "create_folder_in_library",
    "share_library_file",
    # List operations (5)
    "list_sharepoint_lists",
    "get_list_items",
    "create_list_item",
    "update_list_item",
    "delete_list_item",
    # Search operations (2)
    "search_sharepoint_content",
    "get_file_permissions",
]

