"""Confluence Search and Comment Management Tools.

This package provides tools for searching content and managing comments:
- Content search using CQL
- Page content retrieval
- Page history and export
- Comment management
"""

# Search Operations
from .search import (
    search_content,
    get_page_content,
    get_page_history,
    export_page,
)

# Comment Operations
from .comments import (
    get_page_comments,
    add_comment,
    update_comment,
    delete_comment,
)

__all__ = [
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

