"""GitHub MCP Server - FastMCP Application.

This module provides the main MCP server for GitHub integration.
It exposes 62 tools for comprehensive GitHub workflow automation.

Usage:
    fastmcp dev server.py  # Development mode
    fastmcp run server.py  # Production mode

Tool Categories:
    - Repository Management (15 tools)
    - Branch Management (9 tools)
    - Commit Operations (8 tools)
    - Pull Request Management (12 tools)
    - Issue Management (12 tools)
    - File Operations (6 tools)

Authentication:
    All tools require a GitHub Personal Access Token (PAT) or Fine-grained token.
    Tokens are passed per-request via the 'token' parameter.

GitHub Enterprise Support:
    For GitHub Enterprise, pass the base_url parameter (e.g., "https://github.mycompany.com/api/v3")
"""

from typing import Optional, List
from fastmcp import FastMCP

# Import all tool functions
from tools import (
    # Repository Management
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
    # Branch Management
    list_branches,
    get_branch,
    create_branch,
    delete_branch,
    protect_branch,
    unprotect_branch,
    get_branch_protection,
    compare_branches,
    merge_branch,
    # Commit Operations
    list_commits,
    get_commit,
    compare_commits,
    get_commit_status,
    create_commit_comment,
    list_commit_comments,
    get_commit_diff,
    search_commits,
    # Pull Request Management
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
    # Issue Management
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
    # File Operations
    get_file_content,
    create_file,
    update_file,
    delete_file,
    get_directory_contents,
    search_code,
)

# Initialize FastMCP server
mcp = FastMCP("GitHub MCP Server")

# ============================================================================
# Repository Management Tools (15)
# ============================================================================

@mcp.tool()
def github_list_repositories(
    token: str,
    user: Optional[str] = None,
    org: Optional[str] = None,
    type: str = "all",
    sort: str = "updated",
    direction: str = "desc",
    page: int = 0,
    per_page: int = 30,
    base_url: str = "https://api.github.com",
):
    """List repositories for a user or organization with pagination support."""
    return list_repositories(token, user, org, type, sort, direction, page, per_page, base_url)


@mcp.tool()
def github_get_repository(token: str, repo: str, base_url: str = "https://api.github.com"):
    """Get detailed repository information."""
    return get_repository(token, repo, base_url)


@mcp.tool()
def github_create_repository(
    token: str,
    name: str,
    description: Optional[str] = None,
    private: bool = False,
    auto_init: bool = False,
    gitignore_template: Optional[str] = None,
    license_template: Optional[str] = None,
    org: Optional[str] = None,
    base_url: str = "https://api.github.com",
):
    """Create a new repository."""
    return create_repository(token, name, description, private, auto_init, gitignore_template, license_template, org, base_url)


@mcp.tool()
def github_delete_repository(token: str, repo: str, base_url: str = "https://api.github.com"):
    """Delete a repository (WARNING: irreversible!)."""
    return delete_repository(token, repo, base_url)


@mcp.tool()
def github_fork_repository(token: str, repo: str, organization: Optional[str] = None, base_url: str = "https://api.github.com"):
    """Fork a repository."""
    return fork_repository(token, repo, organization, base_url)


@mcp.tool()
def github_get_repository_stats(token: str, repo: str, base_url: str = "https://api.github.com"):
    """Get repository statistics (stars, forks, issues, etc.)."""
    return get_repository_stats(token, repo, base_url)


@mcp.tool()
def github_list_contributors(token: str, repo: str, page: int = 0, per_page: int = 30, base_url: str = "https://api.github.com"):
    """List repository contributors with pagination support."""
    return list_contributors(token, repo, page, per_page, base_url)


@mcp.tool()
def github_list_languages(token: str, repo: str, base_url: str = "https://api.github.com"):
    """List programming languages used in repository."""
    return list_languages(token, repo, base_url)


@mcp.tool()
def github_list_topics(token: str, repo: str, base_url: str = "https://api.github.com"):
    """List repository topics/tags."""
    return list_topics(token, repo, base_url)


@mcp.tool()
def github_update_repository(
    token: str,
    repo: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    homepage: Optional[str] = None,
    private: Optional[bool] = None,
    has_issues: Optional[bool] = None,
    has_wiki: Optional[bool] = None,
    has_projects: Optional[bool] = None,
    default_branch: Optional[str] = None,
    base_url: str = "https://api.github.com",
):
    """Update repository settings."""
    return update_repository(token, repo, name, description, homepage, private, has_issues, has_wiki, has_projects, default_branch, base_url)


@mcp.tool()
def github_archive_repository(token: str, repo: str, base_url: str = "https://api.github.com"):
    """Archive a repository (make read-only)."""
    return archive_repository(token, repo, base_url)


@mcp.tool()
def github_unarchive_repository(token: str, repo: str, base_url: str = "https://api.github.com"):
    """Unarchive a repository (make writable)."""
    return unarchive_repository(token, repo, base_url)


@mcp.tool()
def github_get_clone_url(token: str, repo: str, protocol: str = "https", base_url: str = "https://api.github.com"):
    """Get repository clone URL (https or ssh)."""
    return get_clone_url(token, repo, protocol, base_url)


@mcp.tool()
def github_get_readme(token: str, repo: str, ref: Optional[str] = None, base_url: str = "https://api.github.com"):
    """Get repository README content."""
    return get_readme(token, repo, ref, base_url)


# ============================================================================
# Branch Management Tools (9)
# ============================================================================

@mcp.tool()
def github_list_branches(token: str, repo: str, protected: Optional[bool] = None, page: int = 0, per_page: int = 30, base_url: str = "https://api.github.com"):
    """List repository branches with pagination support."""
    return list_branches(token, repo, protected, page, per_page, base_url)


@mcp.tool()
def github_get_branch(token: str, repo: str, branch: str, base_url: str = "https://api.github.com"):
    """Get branch details."""
    return get_branch(token, repo, branch, base_url)


@mcp.tool()
def github_create_branch(token: str, repo: str, branch_name: str, source_branch: str = "main", base_url: str = "https://api.github.com"):
    """Create a new branch."""
    return create_branch(token, repo, branch_name, source_branch, base_url)


@mcp.tool()
def github_delete_branch(token: str, repo: str, branch: str, base_url: str = "https://api.github.com"):
    """Delete a branch."""
    return delete_branch(token, repo, branch, base_url)


@mcp.tool()
def github_protect_branch(
    token: str,
    repo: str,
    branch: str,
    require_reviews: int = 1,
    dismiss_stale_reviews: bool = True,
    require_code_owner_reviews: bool = False,
    require_status_checks: bool = True,
    strict_status_checks: bool = False,
    enforce_admins: bool = False,
    base_url: str = "https://api.github.com",
):
    """Protect a branch with rules."""
    return protect_branch(token, repo, branch, require_reviews, dismiss_stale_reviews, require_code_owner_reviews, require_status_checks, strict_status_checks, enforce_admins, base_url)


@mcp.tool()
def github_unprotect_branch(token: str, repo: str, branch: str, base_url: str = "https://api.github.com"):
    """Remove branch protection."""
    return unprotect_branch(token, repo, branch, base_url)


@mcp.tool()
def github_get_branch_protection(token: str, repo: str, branch: str, base_url: str = "https://api.github.com"):
    """Get branch protection rules."""
    return get_branch_protection(token, repo, branch, base_url)


@mcp.tool()
def github_compare_branches(token: str, repo: str, base: str, head: str, base_url: str = "https://api.github.com"):
    """Compare two branches."""
    return compare_branches(token, repo, base, head, base_url)


@mcp.tool()
def github_merge_branch(token: str, repo: str, base: str, head: str, commit_message: Optional[str] = None, base_url: str = "https://api.github.com"):
    """Merge one branch into another."""
    return merge_branch(token, repo, base, head, commit_message, base_url)


# ============================================================================
# Commit Operations Tools (8)
# ============================================================================

@mcp.tool()
def github_list_commits(
    token: str,
    repo: str,
    sha: Optional[str] = None,
    path: Optional[str] = None,
    author: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    page: int = 0,
    per_page: int = 30,
    base_url: str = "https://api.github.com",
):
    """List repository commits with pagination support."""
    return list_commits(token, repo, sha, path, author, since, until, page, per_page, base_url)


@mcp.tool()
def github_get_commit(token: str, repo: str, sha: str, base_url: str = "https://api.github.com"):
    """Get commit details."""
    return get_commit(token, repo, sha, base_url)


@mcp.tool()
def github_compare_commits(token: str, repo: str, base: str, head: str, base_url: str = "https://api.github.com"):
    """Compare two commits."""
    return compare_commits(token, repo, base, head, base_url)


@mcp.tool()
def github_get_commit_status(token: str, repo: str, sha: str, base_url: str = "https://api.github.com"):
    """Get commit CI/CD status."""
    return get_commit_status(token, repo, sha, base_url)


@mcp.tool()
def github_create_commit_comment(
    token: str,
    repo: str,
    sha: str,
    body: str,
    path: Optional[str] = None,
    position: Optional[int] = None,
    base_url: str = "https://api.github.com",
):
    """Add a comment to a commit."""
    return create_commit_comment(token, repo, sha, body, path, position, base_url)


@mcp.tool()
def github_list_commit_comments(token: str, repo: str, sha: str, per_page: int = 30, base_url: str = "https://api.github.com"):
    """List commit comments."""
    return list_commit_comments(token, repo, sha, per_page, base_url)


@mcp.tool()
def github_get_commit_diff(token: str, repo: str, sha: str, base_url: str = "https://api.github.com"):
    """Get commit file changes (diff)."""
    return get_commit_diff(token, repo, sha, base_url)


@mcp.tool()
def github_search_commits(
    token: str,
    query: str,
    repo: Optional[str] = None,
    sort: str = "author-date",
    order: str = "desc",
    per_page: int = 30,
    base_url: str = "https://api.github.com",
):
    """Search commits."""
    return search_commits(token, query, repo, sort, order, per_page, base_url)


# ============================================================================
# Pull Request Management Tools (12)
# ============================================================================

@mcp.tool()
def github_list_pull_requests(
    token: str,
    repo: str,
    state: str = "open",
    sort: str = "created",
    direction: str = "desc",
    base: Optional[str] = None,
    head: Optional[str] = None,
    page: int = 0,
    per_page: int = 30,
    base_url: str = "https://api.github.com",
):
    """List pull requests with pagination support."""
    return list_pull_requests(token, repo, state, sort, direction, base, head, page, per_page, base_url)


@mcp.tool()
def github_get_pull_request(token: str, repo: str, pr_number: int, base_url: str = "https://api.github.com"):
    """Get pull request details."""
    return get_pull_request(token, repo, pr_number, base_url)


@mcp.tool()
def github_create_pull_request(
    token: str,
    repo: str,
    title: str,
    head: str,
    base: str,
    body: Optional[str] = None,
    draft: bool = False,
    maintainer_can_modify: bool = True,
    base_url: str = "https://api.github.com",
):
    """Create a pull request."""
    return create_pull_request(token, repo, title, head, base, body, draft, maintainer_can_modify, base_url)


@mcp.tool()
def github_update_pull_request(
    token: str,
    repo: str,
    pr_number: int,
    title: Optional[str] = None,
    body: Optional[str] = None,
    state: Optional[str] = None,
    base: Optional[str] = None,
    base_url: str = "https://api.github.com",
):
    """Update a pull request."""
    return update_pull_request(token, repo, pr_number, title, body, state, base, base_url)


@mcp.tool()
def github_close_pull_request(token: str, repo: str, pr_number: int, base_url: str = "https://api.github.com"):
    """Close a pull request."""
    return close_pull_request(token, repo, pr_number, base_url)


@mcp.tool()
def github_merge_pull_request(
    token: str,
    repo: str,
    pr_number: int,
    commit_title: Optional[str] = None,
    commit_message: Optional[str] = None,
    merge_method: str = "merge",
    base_url: str = "https://api.github.com",
):
    """Merge a pull request."""
    return merge_pull_request(token, repo, pr_number, commit_title, commit_message, merge_method, base_url)


@mcp.tool()
def github_list_pr_commits(token: str, repo: str, pr_number: int, per_page: int = 30, base_url: str = "https://api.github.com"):
    """List pull request commits."""
    return list_pr_commits(token, repo, pr_number, per_page, base_url)


@mcp.tool()
def github_list_pr_files(token: str, repo: str, pr_number: int, per_page: int = 30, base_url: str = "https://api.github.com"):
    """List pull request files."""
    return list_pr_files(token, repo, pr_number, per_page, base_url)


@mcp.tool()
def github_add_pr_review(token: str, repo: str, pr_number: int, body: str, event: str = "COMMENT", base_url: str = "https://api.github.com"):
    """Add a pull request review."""
    return add_pr_review(token, repo, pr_number, body, event, base_url)


@mcp.tool()
def github_list_pr_reviews(token: str, repo: str, pr_number: int, per_page: int = 30, base_url: str = "https://api.github.com"):
    """List pull request reviews."""
    return list_pr_reviews(token, repo, pr_number, per_page, base_url)


@mcp.tool()
def github_add_pr_comment(token: str, repo: str, pr_number: int, body: str, base_url: str = "https://api.github.com"):
    """Add a pull request comment."""
    return add_pr_comment(token, repo, pr_number, body, base_url)


@mcp.tool()
def github_list_pr_comments(token: str, repo: str, pr_number: int, per_page: int = 30, base_url: str = "https://api.github.com"):
    """List pull request comments."""
    return list_pr_comments(token, repo, pr_number, per_page, base_url)


# ============================================================================
# Issue Management Tools (12)
# ============================================================================

@mcp.tool()
def github_list_issues(
    token: str,
    repo: str,
    state: str = "open",
    labels: Optional[List[str]] = None,
    assignee: Optional[str] = None,
    creator: Optional[str] = None,
    mentioned: Optional[str] = None,
    since: Optional[str] = None,
    sort: str = "created",
    direction: str = "desc",
    page: int = 0,
    per_page: int = 30,
    base_url: str = "https://api.github.com",
):
    """List repository issues with pagination support."""
    return list_issues(token, repo, state, labels, assignee, creator, mentioned, since, sort, direction, page, per_page, base_url)


@mcp.tool()
def github_get_issue(token: str, repo: str, issue_number: int, base_url: str = "https://api.github.com"):
    """Get issue details."""
    return get_issue(token, repo, issue_number, base_url)


@mcp.tool()
def github_create_issue(
    token: str,
    repo: str,
    title: str,
    body: Optional[str] = None,
    assignees: Optional[List[str]] = None,
    labels: Optional[List[str]] = None,
    milestone: Optional[int] = None,
    base_url: str = "https://api.github.com",
):
    """Create an issue."""
    return create_issue(token, repo, title, body, assignees, labels, milestone, base_url)


@mcp.tool()
def github_update_issue(
    token: str,
    repo: str,
    issue_number: int,
    title: Optional[str] = None,
    body: Optional[str] = None,
    state: Optional[str] = None,
    labels: Optional[List[str]] = None,
    assignees: Optional[List[str]] = None,
    milestone: Optional[int] = None,
    base_url: str = "https://api.github.com",
):
    """Update an issue."""
    return update_issue(token, repo, issue_number, title, body, state, labels, assignees, milestone, base_url)


@mcp.tool()
def github_close_issue(token: str, repo: str, issue_number: int, base_url: str = "https://api.github.com"):
    """Close an issue."""
    return close_issue(token, repo, issue_number, base_url)


@mcp.tool()
def github_add_issue_comment(token: str, repo: str, issue_number: int, body: str, base_url: str = "https://api.github.com"):
    """Add an issue comment."""
    return add_issue_comment(token, repo, issue_number, body, base_url)


@mcp.tool()
def github_list_issue_comments(token: str, repo: str, issue_number: int, per_page: int = 30, base_url: str = "https://api.github.com"):
    """List issue comments."""
    return list_issue_comments(token, repo, issue_number, per_page, base_url)


@mcp.tool()
def github_add_issue_labels(token: str, repo: str, issue_number: int, labels: List[str], base_url: str = "https://api.github.com"):
    """Add labels to an issue."""
    return add_issue_labels(token, repo, issue_number, labels, base_url)


@mcp.tool()
def github_remove_issue_label(token: str, repo: str, issue_number: int, label: str, base_url: str = "https://api.github.com"):
    """Remove a label from an issue."""
    return remove_issue_label(token, repo, issue_number, label, base_url)


@mcp.tool()
def github_assign_issue(token: str, repo: str, issue_number: int, assignees: List[str], base_url: str = "https://api.github.com"):
    """Assign users to an issue."""
    return assign_issue(token, repo, issue_number, assignees, base_url)


@mcp.tool()
def github_unassign_issue(token: str, repo: str, issue_number: int, assignee: str, base_url: str = "https://api.github.com"):
    """Unassign a user from an issue."""
    return unassign_issue(token, repo, issue_number, assignee, base_url)


@mcp.tool()
def github_search_issues(
    token: str,
    query: str,
    repo: Optional[str] = None,
    sort: str = "created",
    order: str = "desc",
    per_page: int = 30,
    base_url: str = "https://api.github.com",
):
    """Search issues."""
    return search_issues(token, query, repo, sort, order, per_page, base_url)


# ============================================================================
# File Operations Tools (6)
# ============================================================================

@mcp.tool()
def github_get_file_content(token: str, repo: str, path: str, ref: Optional[str] = None, base_url: str = "https://api.github.com"):
    """Get file content."""
    return get_file_content(token, repo, path, ref, base_url)


@mcp.tool()
def github_create_file(
    token: str,
    repo: str,
    path: str,
    content: str,
    message: str,
    branch: Optional[str] = None,
    base_url: str = "https://api.github.com",
):
    """Create a file."""
    return create_file(token, repo, path, content, message, branch, base_url)


@mcp.tool()
def github_update_file(
    token: str,
    repo: str,
    path: str,
    content: str,
    message: str,
    sha: str,
    branch: Optional[str] = None,
    base_url: str = "https://api.github.com",
):
    """Update a file."""
    return update_file(token, repo, path, content, message, sha, branch, base_url)


@mcp.tool()
def github_delete_file(
    token: str,
    repo: str,
    path: str,
    message: str,
    sha: str,
    branch: Optional[str] = None,
    base_url: str = "https://api.github.com",
):
    """Delete a file."""
    return delete_file(token, repo, path, message, sha, branch, base_url)


@mcp.tool()
def github_get_directory_contents(token: str, repo: str, path: str = "", ref: Optional[str] = None, base_url: str = "https://api.github.com"):
    """Get directory contents."""
    return get_directory_contents(token, repo, path, ref, base_url)


@mcp.tool()
def github_search_code(
    token: str,
    query: str,
    repo: Optional[str] = None,
    sort: Optional[str] = None,
    order: str = "desc",
    per_page: int = 30,
    base_url: str = "https://api.github.com",
):
    """Search code in repositories."""
    return search_code(token, query, repo, sort, order, per_page, base_url)


# Run the server
if __name__ == "__main__":
    mcp.run()

