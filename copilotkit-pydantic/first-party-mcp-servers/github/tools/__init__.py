"""GitHub MCP Server Tools.

This package provides comprehensive GitHub integration tools organized by category:
- Repository Management (15 tools)
- Branch Management (9 tools)
- Commit Operations (8 tools)
- Pull Request Management (12 tools)
- Issue Management (12 tools)
- File Operations (6 tools)

Total: 62 tools for complete GitHub workflow automation
"""

# Repository Management (15 tools)
from .repositories import (
    list_repositories,
    get_repository,
    create_repository,
    delete_repository,
    fork_repository,
    get_repository_stats,
    list_contributors,
    list_languages,
    list_topics,
    update_repository,
    archive_repository,
    unarchive_repository,
    get_clone_url,
    get_readme,
)

# Branch Management (9 tools)
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

# Commit Operations (8 tools)
from .commits import (
    list_commits,
    get_commit,
    compare_commits,
    get_commit_status,
    create_commit_comment,
    list_commit_comments,
    get_commit_diff,
    search_commits,
)

# Pull Request Management (12 tools)
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

# Issue Management (12 tools)
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

# File Operations (6 tools)
from .files import (
    get_file_content,
    create_file,
    update_file,
    delete_file,
    get_directory_contents,
    search_code,
)

__all__ = [
    # Repository Management (15)
    "list_repositories",
    "get_repository",
    "create_repository",
    "delete_repository",
    "fork_repository",
    "get_repository_stats",
    "list_contributors",
    "list_languages",
    "list_topics",
    "update_repository",
    "archive_repository",
    "unarchive_repository",
    "get_clone_url",
    "get_readme",
    # Branch Management (9)
    "list_branches",
    "get_branch",
    "create_branch",
    "delete_branch",
    "protect_branch",
    "unprotect_branch",
    "get_branch_protection",
    "compare_branches",
    "merge_branch",
    # Commit Operations (8)
    "list_commits",
    "get_commit",
    "compare_commits",
    "get_commit_status",
    "create_commit_comment",
    "list_commit_comments",
    "get_commit_diff",
    "search_commits",
    # Pull Request Management (12)
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
    # Issue Management (12)
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
    # File Operations (6)
    "get_file_content",
    "create_file",
    "update_file",
    "delete_file",
    "get_directory_contents",
    "search_code",
]

