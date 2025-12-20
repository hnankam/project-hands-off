"""Confluence MCP Server Tools.

This package provides all tools for the Confluence MCP server.
"""

# Page Management Tools
from .pages import (
    get_page,
    get_page_by_title,
    create_page,
    update_page,
    delete_page,
    get_page_children,
    get_page_ancestors,
    get_page_labels,
    add_page_label,
    remove_page_label,
    get_page_attachments,
    upload_attachment,
    delete_attachment,
)

# Space Management Tools
from .spaces import (
    list_spaces,
    get_space,
    create_space,
    update_space,
    delete_space,
    get_space_content,
)

# Search & Content Tools
from .search import (
    search_content,
    get_page_content,
    get_page_history,
    export_page,
    get_page_comments,
    add_comment,
    update_comment,
    delete_comment,
)

__all__ = [
    # Pages (13 tools)
    "get_page",
    "get_page_by_title",
    "create_page",
    "update_page",
    "delete_page",
    "get_page_children",
    "get_page_ancestors",
    "get_page_labels",
    "add_page_label",
    "remove_page_label",
    "get_page_attachments",
    "upload_attachment",
    "delete_attachment",
    # Spaces (6 tools)
    "list_spaces",
    "get_space",
    "create_space",
    "update_space",
    "delete_space",
    "get_space_content",
    # Search & Content (4 tools)
    "search_content",
    "get_page_content",
    "get_page_history",
    "export_page",
    # Comments (4 tools)
    "get_page_comments",
    "add_comment",
    "update_comment",
    "delete_comment",
]

