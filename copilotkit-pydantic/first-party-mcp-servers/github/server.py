"""GitHub MCP Server using FastMCP.

This server accepts credential keys (globally unique identifiers) as parameters
in each tool call. The server resolves these keys to actual credentials from the
workspace_credentials table and uses them to interact with user-specific 
GitHub accounts and repositories.

Security: Credential values are never exposed to the agent. The agent only provides
credential keys (e.g., "my_github_token", "my_github_base_url"), and the server
fetches and decrypts the actual values server-side.
"""

from pathlib import Path
import os

# Load .env file before anything else
try:
    from dotenv import load_dotenv
    
    env_paths = [
        Path(__file__).parent.parent.parent / '.env',  # copilotkit-pydantic/.env
        Path(__file__).parent.parent / '.env',          # first-party-mcp-servers/.env
        Path(__file__).parent / '.env',                 # github/.env
    ]
    
    for env_path in env_paths:
        if env_path.exists():
            load_dotenv(env_path)
            print(f"[GitHub MCP] Loaded environment from: {env_path}")
            break
except ImportError:
    print("[GitHub MCP] Warning: python-dotenv not installed, using system env vars")

from fastmcp import FastMCP
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastMCP server
mcp = FastMCP("GitHub MCP Server")

# ============================================================================
# Import and register tools by category
# ============================================================================

# Repository Management
from tools.repositories.crud import (
    list_repositories,
    get_repository,
    create_repository,
    delete_repository,
    fork_repository,
)
from tools.repositories.management import (
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

# Branch Management
from tools.branches.branches import (
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

# Commit Operations
from tools.commits.commits import (
    list_commits,
    get_commit,
    compare_commits,
    get_commit_status,
    create_commit_comment,
    list_commit_comments,
    get_commit_diff,
    search_commits,
)

# Pull Request Management
from tools.pull_requests.pull_requests import (
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

# Issue Management
from tools.issues.issues import (
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

# File Operations
from tools.files.files import (
    get_file_content,
    create_file,
    update_file,
    delete_file,
    get_directory_contents,
    search_code,
)

# ============================================================================
# Register Repository Management Tools (15)
# ============================================================================

mcp.tool()(list_repositories)
mcp.tool()(get_repository)
mcp.tool()(create_repository)
mcp.tool()(delete_repository)
mcp.tool()(fork_repository)
mcp.tool()(get_repository_stats)
mcp.tool()(list_contributors)
mcp.tool()(list_languages)
mcp.tool()(list_topics)
mcp.tool()(update_repository)
mcp.tool()(archive_repository)
mcp.tool()(unarchive_repository)
mcp.tool()(get_clone_url)
mcp.tool()(get_readme)

# ============================================================================
# Register Branch Management Tools (9)
# ============================================================================

mcp.tool()(list_branches)
mcp.tool()(get_branch)
mcp.tool()(create_branch)
mcp.tool()(delete_branch)
mcp.tool()(protect_branch)
mcp.tool()(unprotect_branch)
mcp.tool()(get_branch_protection)
mcp.tool()(compare_branches)
mcp.tool()(merge_branch)

# ============================================================================
# Register Commit Operations Tools (8)
# ============================================================================

mcp.tool()(list_commits)
mcp.tool()(get_commit)
mcp.tool()(compare_commits)
mcp.tool()(get_commit_status)
mcp.tool()(create_commit_comment)
mcp.tool()(list_commit_comments)
mcp.tool()(get_commit_diff)
mcp.tool()(search_commits)

# ============================================================================
# Register Pull Request Management Tools (12)
# ============================================================================

mcp.tool()(list_pull_requests)
mcp.tool()(get_pull_request)
mcp.tool()(create_pull_request)
mcp.tool()(update_pull_request)
mcp.tool()(close_pull_request)
mcp.tool()(merge_pull_request)
mcp.tool()(list_pr_commits)
mcp.tool()(list_pr_files)
mcp.tool()(add_pr_review)
mcp.tool()(list_pr_reviews)
mcp.tool()(add_pr_comment)
mcp.tool()(list_pr_comments)

# ============================================================================
# Register Issue Management Tools (12)
# ============================================================================

mcp.tool()(list_issues)
mcp.tool()(get_issue)
mcp.tool()(create_issue)
mcp.tool()(update_issue)
mcp.tool()(close_issue)
mcp.tool()(add_issue_comment)
mcp.tool()(list_issue_comments)
mcp.tool()(add_issue_labels)
mcp.tool()(remove_issue_label)
mcp.tool()(assign_issue)
mcp.tool()(unassign_issue)
mcp.tool()(search_issues)

# ============================================================================
# Register File Operations Tools (6)
# ============================================================================

mcp.tool()(get_file_content)
mcp.tool()(create_file)
mcp.tool()(update_file)
mcp.tool()(delete_file)
mcp.tool()(get_directory_contents)
mcp.tool()(search_code)

# ============================================================================
# Server Entry Point
# ============================================================================

if __name__ == "__main__":
    # Run the MCP server
    mcp.run()
