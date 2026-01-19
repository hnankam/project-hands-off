"""Pydantic models for GitHub objects."""

from typing import Any, Optional, List, Dict
from pydantic import BaseModel, Field
from datetime import datetime


# ============================================================================
# Base Models
# ============================================================================

class UserInfo(BaseModel):
    """GitHub user information."""
    login: str = Field(..., description="Username")
    id: int = Field(..., description="User ID")
    avatar_url: Optional[str] = Field(None, description="Avatar URL")
    html_url: Optional[str] = Field(None, description="Profile URL")
    type: Optional[str] = Field(None, description="User type (User/Organization)")


class RepositoryInfo(BaseModel):
    """Repository information."""
    id: int = Field(..., description="Repository ID")
    name: str = Field(..., description="Repository name")
    full_name: str = Field(..., description="Full repository name (owner/repo)")
    description: Optional[str] = Field(None, description="Repository description")
    private: bool = Field(..., description="Whether repository is private")
    fork: bool = Field(..., description="Whether repository is a fork")
    created_at: str = Field(..., description="Creation timestamp")
    updated_at: str = Field(..., description="Last update timestamp")
    pushed_at: Optional[str] = Field(None, description="Last push timestamp")
    size: int = Field(..., description="Repository size in KB")
    stargazers_count: int = Field(..., description="Number of stars")
    watchers_count: int = Field(..., description="Number of watchers")
    language: Optional[str] = Field(None, description="Primary language")
    forks_count: int = Field(..., description="Number of forks")
    open_issues_count: int = Field(..., description="Number of open issues")
    default_branch: str = Field(..., description="Default branch name")
    html_url: str = Field(..., description="Repository URL")
    clone_url: str = Field(..., description="Clone URL")
    ssh_url: str = Field(..., description="SSH URL")


class BranchInfo(BaseModel):
    """Branch information."""
    name: str = Field(..., description="Branch name")
    protected: bool = Field(..., description="Whether branch is protected")
    commit_sha: Optional[str] = Field(None, description="Latest commit SHA")


class CommitInfo(BaseModel):
    """Commit information."""
    sha: str = Field(..., description="Commit SHA")
    message: str = Field(..., description="Commit message")
    author: Optional[Dict[str, Any]] = Field(None, description="Commit author")
    committer: Optional[Dict[str, Any]] = Field(None, description="Committer")
    url: Optional[str] = Field(None, description="Commit URL")


class PullRequestInfo(BaseModel):
    """Pull request information."""
    id: int = Field(..., description="PR ID")
    number: int = Field(..., description="PR number")
    title: str = Field(..., description="PR title")
    body: Optional[str] = Field(None, description="PR description")
    state: str = Field(..., description="PR state (open/closed)")
    user: Optional[Dict[str, Any]] = Field(None, description="PR author")
    created_at: str = Field(..., description="Creation timestamp")
    updated_at: str = Field(..., description="Last update timestamp")
    merged_at: Optional[str] = Field(None, description="Merge timestamp")
    head: Dict[str, Any] = Field(..., description="Head branch info")
    base: Dict[str, Any] = Field(..., description="Base branch info")
    html_url: str = Field(..., description="PR URL")


class IssueInfo(BaseModel):
    """Issue information."""
    id: int = Field(..., description="Issue ID")
    number: int = Field(..., description="Issue number")
    title: str = Field(..., description="Issue title")
    body: Optional[str] = Field(None, description="Issue description")
    state: str = Field(..., description="Issue state (open/closed)")
    user: Optional[Dict[str, Any]] = Field(None, description="Issue author")
    assignees: List[Dict[str, Any]] = Field(default_factory=list, description="Assigned users")
    labels: List[Dict[str, Any]] = Field(default_factory=list, description="Issue labels")
    created_at: str = Field(..., description="Creation timestamp")
    updated_at: str = Field(..., description="Last update timestamp")
    closed_at: Optional[str] = Field(None, description="Close timestamp")
    html_url: str = Field(..., description="Issue URL")


# ============================================================================
# Repository Response Models
# ============================================================================

class ListRepositoriesResponse(BaseModel):
    """Response for listing repositories."""
    repositories: List[RepositoryInfo] = Field(default_factory=list, description="List of repositories")
    total: int = Field(0, description="Total number of repositories across all pages")
    page: int = Field(0, description="Current page number (0-indexed)")
    per_page: int = Field(30, description="Number of items per page")
    has_next_page: bool = Field(False, description="Whether more pages are available")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetRepositoryResponse(BaseModel):
    """Response for getting a repository."""
    repository: Optional[Dict[str, Any]] = Field(None, description="Complete repository details")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class CreateRepositoryResponse(BaseModel):
    """Response for creating a repository."""
    repository: Optional[RepositoryInfo] = Field(None, description="Created repository")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DeleteRepositoryResponse(BaseModel):
    """Response for deleting a repository."""
    repo_name: Optional[str] = Field(None, description="Deleted repository name")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class ForkRepositoryResponse(BaseModel):
    """Response for forking a repository."""
    repository: Optional[RepositoryInfo] = Field(None, description="Forked repository")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Branch Response Models
# ============================================================================

class ListBranchesResponse(BaseModel):
    """Response for listing branches."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    branches: List[BranchInfo] = Field(default_factory=list, description="List of branches")
    total: int = Field(0, description="Total number of branches across all pages")
    page: int = Field(0, description="Current page number (0-indexed)")
    per_page: int = Field(30, description="Number of items per page")
    has_next_page: bool = Field(False, description="Whether more pages are available")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetBranchResponse(BaseModel):
    """Response for getting a branch."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    branch: Optional[Dict[str, Any]] = Field(None, description="Branch details")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class CreateBranchResponse(BaseModel):
    """Response for creating a branch."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    branch_name: Optional[str] = Field(None, description="Created branch name")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DeleteBranchResponse(BaseModel):
    """Response for deleting a branch."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    branch_name: Optional[str] = Field(None, description="Deleted branch name")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class ProtectBranchResponse(BaseModel):
    """Response for protecting a branch."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    branch_name: Optional[str] = Field(None, description="Protected branch name")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Commit Response Models
# ============================================================================

class ListCommitsResponse(BaseModel):
    """Response for listing commits."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    commits: List[CommitInfo] = Field(default_factory=list, description="List of commits")
    total: int = Field(0, description="Total number of commits across all pages")
    page: int = Field(0, description="Current page number (0-indexed)")
    per_page: int = Field(30, description="Number of items per page")
    has_next_page: bool = Field(False, description="Whether more pages are available")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetCommitResponse(BaseModel):
    """Response for getting a commit."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    commit: Optional[Dict[str, Any]] = Field(None, description="Complete commit details")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class CompareCommitsResponse(BaseModel):
    """Response for comparing commits."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    base: Optional[str] = Field(None, description="Base commit/branch")
    head: Optional[str] = Field(None, description="Head commit/branch")
    ahead_by: int = Field(0, description="Commits ahead")
    behind_by: int = Field(0, description="Commits behind")
    commits: List[Dict[str, Any]] = Field(default_factory=list, description="Commit differences")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Pull Request Response Models
# ============================================================================

class ListPullRequestsResponse(BaseModel):
    """Response for listing pull requests."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    pull_requests: List[PullRequestInfo] = Field(default_factory=list, description="List of PRs")
    total: int = Field(0, description="Total number of PRs across all pages")
    page: int = Field(0, description="Current page number (0-indexed)")
    per_page: int = Field(30, description="Number of items per page")
    has_next_page: bool = Field(False, description="Whether more pages are available")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetPullRequestResponse(BaseModel):
    """Response for getting a pull request."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    pull_request: Optional[Dict[str, Any]] = Field(None, description="Complete PR details")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class CreatePullRequestResponse(BaseModel):
    """Response for creating a pull request."""
    pull_request: Optional[PullRequestInfo] = Field(None, description="Created PR")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class MergePullRequestResponse(BaseModel):
    """Response for merging a pull request."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    pr_number: Optional[int] = Field(None, description="Merged PR number")
    sha: Optional[str] = Field(None, description="Merge commit SHA")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Issue Response Models
# ============================================================================

class ListIssuesResponse(BaseModel):
    """Response for listing issues."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    issues: List[IssueInfo] = Field(default_factory=list, description="List of issues")
    total: int = Field(0, description="Total number of issues across all pages")
    page: int = Field(0, description="Current page number (0-indexed)")
    per_page: int = Field(30, description="Number of items per page")
    has_next_page: bool = Field(False, description="Whether more pages are available")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetIssueResponse(BaseModel):
    """Response for getting an issue."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    issue: Optional[Dict[str, Any]] = Field(None, description="Complete issue details")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class CreateIssueResponse(BaseModel):
    """Response for creating an issue."""
    issue: Optional[IssueInfo] = Field(None, description="Created issue")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class UpdateIssueResponse(BaseModel):
    """Response for updating an issue."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    issue_number: Optional[int] = Field(None, description="Updated issue number")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# File Response Models
# ============================================================================

class GetFileContentResponse(BaseModel):
    """Response for getting file content."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    path: Optional[str] = Field(None, description="File path")
    content: Optional[str] = Field(None, description="File content (decoded)")
    sha: Optional[str] = Field(None, description="File blob SHA")
    size: int = Field(0, description="File size in bytes")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class CreateFileResponse(BaseModel):
    """Response for creating a file."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    path: Optional[str] = Field(None, description="File path")
    commit_sha: Optional[str] = Field(None, description="Commit SHA")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class UpdateFileResponse(BaseModel):
    """Response for updating a file."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    path: Optional[str] = Field(None, description="File path")
    commit_sha: Optional[str] = Field(None, description="Commit SHA")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DeleteFileResponse(BaseModel):
    """Response for deleting a file."""
    repo_name: Optional[str] = Field(None, description="Repository name")
    path: Optional[str] = Field(None, description="File path")
    commit_sha: Optional[str] = Field(None, description="Commit SHA")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")

