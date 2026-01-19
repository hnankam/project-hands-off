"""GitHub Branch Management Operations.

This module provides tools for branch operations:
- List, get, create, delete branches
- Branch protection and comparison
- Merge operations
"""

from typing import Any, Optional, List, Dict
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_github_client
from models import (
    ListBranchesResponse,
    GetBranchResponse,
    CreateBranchResponse,
    DeleteBranchResponse,
    ProtectBranchResponse,
    BranchInfo,
)


def list_branches(
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
    protected: Optional[bool] = None,
    page: int = 0,
    per_page: int = 30,
) -> ListBranchesResponse:
    """
    List all branches in a repository with pagination support.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        protected: Filter by protection status (optional)
        page: Page number to retrieve (0-indexed, default: 0)
        per_page: Results per page (max 100, default: 30)

    Returns:
        ListBranchesResponse with branches and pagination metadata
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        # Get paginated branches
        branches_paginated = repo_obj.get_branches()
        branches_page = branches_paginated.get_page(page)
        
        branches_list = []
        for branch in branches_page:
            # Filter by protection status if specified
            if protected is not None and branch.protected != protected:
                continue
                
            branches_list.append(BranchInfo(
                name=branch.name,
                protected=branch.protected,
                commit_sha=branch.commit.sha if branch.commit else None
            ))
        
        total_count = branches_paginated.totalCount
        has_next = (page + 1) * per_page < total_count
        
        return ListBranchesResponse(
            repo_name=repo,
            branches=branches_list,
            total=total_count,
            page=page,
            per_page=per_page,
            has_next_page=has_next
        )
    except Exception as e:
        return ListBranchesResponse(
            repo_name=repo,
            branches=[],
            total=0,
            page=page,
            per_page=per_page,
            has_next_page=False,
            error_message=f"Failed to list branches: {str(e)}",
        )


def get_branch(
    token_credential_key: str,
    repo: str,
    branch: str,
    base_url_credential_key: str = "",
) -> GetBranchResponse:
    """
    Get detailed information about a specific branch.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch: Branch name
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        GetBranchResponse with branch details (protection status, commit info)
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        branch_obj = repo_obj.get_branch(branch)
        
        branch_data = {
            "name": branch_obj.name,
            "protected": branch_obj.protected,
            "commit": {
                "sha": branch_obj.commit.sha,
                "url": branch_obj.commit.html_url,
                "message": branch_obj.commit.commit.message,
                "author": {
                    "name": branch_obj.commit.commit.author.name,
                    "email": branch_obj.commit.commit.author.email,
                    "date": branch_obj.commit.commit.author.date.isoformat() if branch_obj.commit.commit.author.date else None,
                }
            }
        }
        
        # Add protection details if branch is protected
        if branch_obj.protected:
            try:
                protection = branch_obj.get_protection()
                branch_data["protection"] = {
                    "required_status_checks": protection.required_status_checks is not None,
                    "enforce_admins": protection.enforce_admins.enabled if protection.enforce_admins else False,
                    "required_pull_request_reviews": protection.required_pull_request_reviews is not None,
                    "restrictions": protection.restrictions is not None,
                }
            except:
                branch_data["protection"] = None
        
        return GetBranchResponse(
            repo_name=repo,
            branch=branch_data
        )
    except Exception as e:
        return GetBranchResponse(
            repo_name=repo,
            branch=None,
            error_message=f"Failed to get branch {branch}: {str(e)}",
        )


def create_branch(
    token_credential_key: str,
    repo: str,
    branch_name: str,
    base_url_credential_key: str = "",
    source_branch: str = "main",
) -> CreateBranchResponse:
    """
    Create a new branch from an existing branch or commit.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch_name: Name for the new branch
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        source_branch: Source branch to branch from (default: "main")

    Returns:
        CreateBranchResponse with confirmation message
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        # Get source branch
        source = repo_obj.get_branch(source_branch)
        source_sha = source.commit.sha
        
        # Create new branch (create a git reference)
        ref = f"refs/heads/{branch_name}"
        repo_obj.create_git_ref(ref=ref, sha=source_sha)
        
        return CreateBranchResponse(
            repo_name=repo,
            branch_name=branch_name,
            message=f"Successfully created branch {branch_name} from {source_branch}"
        )
    except Exception as e:
        return CreateBranchResponse(
            repo_name=repo,
            branch_name=branch_name,
            message=None,
            error_message=f"Failed to create branch {branch_name}: {str(e)}",
        )


def delete_branch(
    token_credential_key: str,
    repo: str,
    branch: str,
    base_url_credential_key: str = "",
) -> DeleteBranchResponse:
    """
    Permanently delete a branch from the repository.
    
    **Note:** Cannot delete the default branch or protected branches.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch: Branch name to delete
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        DeleteBranchResponse with confirmation message
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        # Get the git reference and delete it
        ref = repo_obj.get_git_ref(f"heads/{branch}")
        ref.delete()
        
        return DeleteBranchResponse(
            repo_name=repo,
            branch_name=branch,
            message=f"Successfully deleted branch {branch}"
        )
    except Exception as e:
        return DeleteBranchResponse(
            repo_name=repo,
            branch_name=branch,
            message=None,
            error_message=f"Failed to delete branch {branch}: {str(e)}",
        )


def protect_branch(
    token_credential_key: str,
    repo: str,
    branch: str,
    base_url_credential_key: str = "",
    require_reviews: int = 1,
    dismiss_stale_reviews: bool = True,
    require_code_owner_reviews: bool = False,
    require_status_checks: bool = True,
    strict_status_checks: bool = False,
    enforce_admins: bool = False,
) -> ProtectBranchResponse:
    """
    Add branch protection rules to prevent direct pushes and enforce reviews.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch: Branch name to protect
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        require_reviews: Number of required reviews (default: 1)
        dismiss_stale_reviews: Dismiss stale reviews on push (default: True)
        require_code_owner_reviews: Require code owner review (default: False)
        require_status_checks: Require status checks (default: True)
        strict_status_checks: Require branches to be up to date (default: False)
        enforce_admins: Enforce for administrators (default: False)

    Returns:
        ProtectBranchResponse with confirmation message
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        branch_obj = repo_obj.get_branch(branch)
        
        # Edit branch protection
        branch_obj.edit_protection(
            required_approving_review_count=require_reviews,
            dismiss_stale_reviews=dismiss_stale_reviews,
            require_code_owner_reviews=require_code_owner_reviews,
            strict=strict_status_checks,
            enforce_admins=enforce_admins,
        )
        
        return ProtectBranchResponse(
            repo_name=repo,
            branch_name=branch,
            message=f"Successfully protected branch {branch}"
        )
    except Exception as e:
        return ProtectBranchResponse(
            repo_name=repo,
            branch_name=branch,
            message=None,
            error_message=f"Failed to protect branch {branch}: {str(e)}",
        )


def unprotect_branch(
    token_credential_key: str,
    repo: str,
    branch: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Remove all branch protection rules.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch: Branch name to unprotect
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with confirmation message
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        branch_obj = repo_obj.get_branch(branch)
        
        branch_obj.remove_protection()
        
        return {
            "repo": repo,
            "branch": branch,
            "message": f"Successfully removed protection from branch {branch}"
        }
    except Exception as e:
        return {
            "repo": repo,
            "branch": branch,
            "message": None,
            "error": f"Failed to unprotect branch {branch}: {str(e)}"
        }


def get_branch_protection(
    token_credential_key: str,
    repo: str,
    branch: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Get the current branch protection configuration.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch: Branch name
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with protection rules and settings
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        branch_obj = repo_obj.get_branch(branch)
        
        if not branch_obj.protected:
            return {
                "repo": repo,
                "branch": branch,
                "protected": False,
                "message": f"Branch {branch} is not protected"
            }
        
        try:
            protection = branch_obj.get_protection()
            
            return {
                "repo": repo,
                "branch": branch,
                "protected": True,
                "required_status_checks": {
                    "strict": protection.required_status_checks.strict if protection.required_status_checks else False,
                    "contexts": list(protection.required_status_checks.contexts) if protection.required_status_checks else [],
                } if protection.required_status_checks else None,
                "enforce_admins": protection.enforce_admins.enabled if protection.enforce_admins else False,
                "required_pull_request_reviews": {
                    "dismiss_stale_reviews": protection.required_pull_request_reviews.dismiss_stale_reviews if protection.required_pull_request_reviews else False,
                    "require_code_owner_reviews": protection.required_pull_request_reviews.require_code_owner_reviews if protection.required_pull_request_reviews else False,
                    "required_approving_review_count": protection.required_pull_request_reviews.required_approving_review_count if protection.required_pull_request_reviews else 0,
                } if protection.required_pull_request_reviews else None,
                "restrictions": protection.restrictions is not None,
            }
        except Exception as e:
            return {
                "repo": repo,
                "branch": branch,
                "protected": True,
                "error": f"Could not retrieve protection details: {str(e)}"
            }
    except Exception as e:
        return {
            "repo": repo,
            "branch": branch,
            "protected": None,
            "error": f"Failed to get branch protection: {str(e)}"
        }


def compare_branches(
    token_credential_key: str,
    repo: str,
    base: str,
    head: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Compare two branches and show the differences.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base: Base branch name
        head: Head branch name (to compare against base)
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with comparison results (ahead_by, behind_by, commits, files_changed)
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        comparison = repo_obj.compare(base, head)
        
        commits = []
        for commit in comparison.commits:
            commits.append({
                "sha": commit.sha,
                "message": commit.commit.message,
                "author": commit.commit.author.name,
                "date": commit.commit.author.date.isoformat() if commit.commit.author.date else None,
            })
        
        return {
            "repo": repo,
            "base": base,
            "head": head,
            "status": comparison.status,
            "ahead_by": comparison.ahead_by,
            "behind_by": comparison.behind_by,
            "total_commits": comparison.total_commits,
            "commits": commits,
            "files_changed": len(list(comparison.files)),
        }
    except Exception as e:
        return {
            "repo": repo,
            "base": base,
            "head": head,
            "status": None,
            "ahead_by": 0,
            "behind_by": 0,
            "total_commits": 0,
            "commits": [],
            "files_changed": 0,
            "error": f"Failed to compare branches: {str(e)}"
        }


def merge_branch(
    token_credential_key: str,
    repo: str,
    base: str,
    head: str,
    base_url_credential_key: str = "",
    commit_message: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Merge the head branch into the base branch directly (without PR).

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base: Base branch name (branch to merge into)
        head: Head branch name (branch to merge from)
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        commit_message: Merge commit message (optional)

    Returns:
        Dictionary with merge result (sha, message, merged status)
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        message = commit_message or f"Merge {head} into {base}"
        
        merge = repo_obj.merge(base, head, message)
        
        return {
            "repo": repo,
            "base": base,
            "head": head,
            "sha": merge.sha,
            "message": merge.commit.message,
            "merged": True,
        }
    except Exception as e:
        return {
            "repo": repo,
            "base": base,
            "head": head,
            "sha": None,
            "message": None,
            "merged": False,
            "error": f"Failed to merge branch {head} into {base}: {str(e)}"
        }

