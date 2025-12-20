"""GitHub Pull Request Management Tools.

This package provides tools for managing GitHub pull requests:
- List, get, create, update PRs
- Merge and close PRs
- PR reviews and comments
- PR commits and files
"""

from .pull_requests import (
    list_pull_requests,
    get_pull_request,
    create_pull_request,
    update_pull_request,
    close_pull_request,
    merge_pull_request,
    list_pr_commits,
    list_pr_files,
    add_pr_review,
    list_pr_reviews,
    add_pr_comment,
    list_pr_comments,
)

__all__ = [
    # Pull Request Management (12 tools)
    "list_pull_requests",
    "get_pull_request",
    "create_pull_request",
    "update_pull_request",
    "close_pull_request",
    "merge_pull_request",
    "list_pr_commits",
    "list_pr_files",
    "add_pr_review",
    "list_pr_reviews",
    "add_pr_comment",
    "list_pr_comments",
]

