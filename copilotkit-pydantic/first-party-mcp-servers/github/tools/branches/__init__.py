"""GitHub Branch Management Tools.

This package provides tools for managing GitHub branches:
- List and get branches
- Create and delete branches
- Branch protection
- Branch comparison and merging
"""

from .branches import (
    list_branches,
    get_branch,
    create_branch,
    delete_branch,
    protect_branch,
    unprotect_branch,
    get_branch_protection,
    compare_branches,
    merge_branch,
)

__all__ = [
    # Branch Management (9 tools)
    "list_branches",
    "get_branch",
    "create_branch",
    "delete_branch",
    "protect_branch",
    "unprotect_branch",
    "get_branch_protection",
    "compare_branches",
    "merge_branch",
]

