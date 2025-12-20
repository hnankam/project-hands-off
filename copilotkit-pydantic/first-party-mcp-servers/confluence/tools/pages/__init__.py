"""Confluence Page Management Tools.

This package provides tools for managing Confluence pages:
- CRUD operations (create, get, update, delete)
- Label management
- Attachment management
- Page hierarchy (children, ancestors)
"""

# CRUD Operations
from .crud import (
    get_page,
    get_page_by_title,
    create_page,
    update_page,
    delete_page,
    get_page_children,
    get_page_ancestors,
)

# Label Operations
from .labels import (
    get_page_labels,
    add_page_label,
    remove_page_label,
)

# Attachment Operations
from .attachments import (
    get_page_attachments,
    upload_attachment,
    delete_attachment,
)

__all__ = [
    # CRUD (7 tools)
    "get_page",
    "get_page_by_title",
    "create_page",
    "update_page",
    "delete_page",
    "get_page_children",
    "get_page_ancestors",
    # Labels (3 tools)
    "get_page_labels",
    "add_page_label",
    "remove_page_label",
    # Attachments (3 tools)
    "get_page_attachments",
    "upload_attachment",
    "delete_attachment",
]

