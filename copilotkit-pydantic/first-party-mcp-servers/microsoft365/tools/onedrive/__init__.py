"""OneDrive tools for Microsoft 365 MCP Server."""

from .files import (
    list_drive_items,
    get_drive_item,
    upload_file,
    download_file,
    create_folder,
    delete_item,
    search_files,
    share_item,
    get_item_permissions,
    copy_item,
    move_item,
)

from .versions import (
    list_item_versions,
    restore_version,
)

from .preview import (
    get_item_thumbnail,
    get_item_preview_link,
)

__all__ = [
    # File operations
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
    # Version operations
    "list_item_versions",
    "restore_version",
    # Preview operations
    "get_item_thumbnail",
    "get_item_preview_link",
]

