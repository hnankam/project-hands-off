"""GitHub Issue Management Tools.

This package provides tools for managing GitHub issues:
- List, get, create, update, close issues
- Issue comments
- Issue labels and assignments
- Issue search
"""

from .issues import (
    list_issues,
    get_issue,
    create_issue,
    update_issue,
    close_issue,
    add_issue_comment,
    list_issue_comments,
    add_issue_labels,
    remove_issue_label,
    assign_issue,
    unassign_issue,
    search_issues,
)

__all__ = [
    # Issue Management (12 tools)
    "list_issues",
    "get_issue",
    "create_issue",
    "update_issue",
    "close_issue",
    "add_issue_comment",
    "list_issue_comments",
    "add_issue_labels",
    "remove_issue_label",
    "assign_issue",
    "unassign_issue",
    "search_issues",
]

