"""Confluence Space Management Tools.

This package provides tools for managing Confluence spaces:
- CRUD operations (list, get, create, update, delete)
- Space content retrieval
"""

from .spaces import (
    list_spaces,
    get_space,
    create_space,
    update_space,
    delete_space,
    get_space_content,
)

__all__ = [
    # Space Management (6 tools)
    "list_spaces",
    "get_space",
    "create_space",
    "update_space",
    "delete_space",
    "get_space_content",
]

