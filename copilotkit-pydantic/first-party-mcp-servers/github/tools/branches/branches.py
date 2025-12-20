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
    token: str,
    repo: str,
    protected: Optional[bool] = None,
    page: int = 0,
    per_page: int = 30,
    base_url: str = "https://api.github.com",
) -> ListBranchesResponse:
    """
    List repository branches.

    Lists all branches in a repository with pagination support.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        protected: Filter by protection status (optional)
        page: Page number to retrieve (0-indexed, default: 0)
        per_page: Results per page (max 100, default: 30)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        ListBranchesResponse with branches and pagination metadata

    Example:
        response = list_branches(
            token="ghp_xxx",
            repo="octocat/Hello-World"
        )
        for branch in response.branches:
            print(f"{branch.name}: {'Protected' if branch.protected else 'Unprotected'}")
        
        # Get next page
        if response.has_next_page:
            response = list_branches(token="ghp_xxx", repo="octocat/Hello-World", page=1)
    """
    client = get_github_client(token, base_url)
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


def get_branch(
    token: str,
    repo: str,
    branch: str,
    base_url: str = "https://api.github.com",
) -> GetBranchResponse:
    """
    Get branch details.

    Retrieves detailed information about a specific branch.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch: Branch name
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        GetBranchResponse with branch details

    Example:
        response = get_branch(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            branch="main"
        )
        print(f"Protected: {response.branch['protected']}")
        print(f"Latest commit: {response.branch['commit']['sha']}")
    """
    client = get_github_client(token, base_url)
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


def create_branch(
    token: str,
    repo: str,
    branch_name: str,
    source_branch: str = "main",
    base_url: str = "https://api.github.com",
) -> CreateBranchResponse:
    """
    Create a new branch.

    Creates a new branch from an existing branch or commit.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch_name: Name for the new branch
        source_branch: Source branch to branch from (default: "main")
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        CreateBranchResponse with confirmation

    Example:
        response = create_branch(
            token="ghp_xxx",
            repo="myuser/myrepo",
            branch_name="feature/new-feature",
            source_branch="develop"
        )
        print(response.message)
    """
    client = get_github_client(token, base_url)
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


def delete_branch(
    token: str,
    repo: str,
    branch: str,
    base_url: str = "https://api.github.com",
) -> DeleteBranchResponse:
    """
    Delete a branch.

    Permanently deletes a branch from the repository.
    **Note:** Cannot delete the default branch or protected branches.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch: Branch name to delete
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        DeleteBranchResponse with confirmation

    Example:
        response = delete_branch(
            token="ghp_xxx",
            repo="myuser/myrepo",
            branch="feature/old-feature"
        )
        print(response.message)
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    # Get the git reference and delete it
    ref = repo_obj.get_git_ref(f"heads/{branch}")
    ref.delete()
    
    return DeleteBranchResponse(
        repo_name=repo,
        branch_name=branch,
        message=f"Successfully deleted branch {branch}"
    )


def protect_branch(
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
) -> ProtectBranchResponse:
    """
    Protect a branch.

    Adds branch protection rules to prevent direct pushes and enforce reviews.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch: Branch name to protect
        require_reviews: Number of required reviews (default: 1)
        dismiss_stale_reviews: Dismiss stale reviews on push (default: True)
        require_code_owner_reviews: Require code owner review (default: False)
        require_status_checks: Require status checks (default: True)
        strict_status_checks: Require branches to be up to date (default: False)
        enforce_admins: Enforce for administrators (default: False)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        ProtectBranchResponse with confirmation

    Example:
        response = protect_branch(
            token="ghp_xxx",
            repo="myuser/myrepo",
            branch="main",
            require_reviews=2,
            require_code_owner_reviews=True,
            enforce_admins=True
        )
        print(response.message)
    """
    client = get_github_client(token, base_url)
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


def unprotect_branch(
    token: str,
    repo: str,
    branch: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Remove branch protection.

    Removes all branch protection rules.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch: Branch name to unprotect
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with confirmation

    Example:
        response = unprotect_branch(
            token="ghp_xxx",
            repo="myuser/myrepo",
            branch="develop"
        )
        print(response['message'])
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    branch_obj = repo_obj.get_branch(branch)
    
    branch_obj.remove_protection()
    
    return {
        "repo": repo,
        "branch": branch,
        "message": f"Successfully removed protection from branch {branch}"
    }


def get_branch_protection(
    token: str,
    repo: str,
    branch: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Get branch protection rules.

    Retrieves the current branch protection configuration.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        branch: Branch name
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with protection rules

    Example:
        response = get_branch_protection(
            token="ghp_xxx",
            repo="myuser/myrepo",
            branch="main"
        )
        if response['protected']:
            print(f"Required reviews: {response['required_approving_review_count']}")
    """
    client = get_github_client(token, base_url)
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


def compare_branches(
    token: str,
    repo: str,
    base: str,
    head: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Compare two branches.

    Compares two branches and shows the differences.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base: Base branch name
        head: Head branch name (to compare against base)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with comparison results

    Example:
        response = compare_branches(
            token="ghp_xxx",
            repo="myuser/myrepo",
            base="main",
            head="feature/new-feature"
        )
        print(f"Commits ahead: {response['ahead_by']}")
        print(f"Commits behind: {response['behind_by']}")
        for commit in response['commits']:
            print(f"  {commit['sha'][:7]}: {commit['message']}")
    """
    client = get_github_client(token, base_url)
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


def merge_branch(
    token: str,
    repo: str,
    base: str,
    head: str,
    commit_message: Optional[str] = None,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Merge one branch into another.

    Merges the head branch into the base branch directly (without PR).

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base: Base branch name (branch to merge into)
        head: Head branch name (branch to merge from)
        commit_message: Merge commit message (optional)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with merge result

    Example:
        response = merge_branch(
            token="ghp_xxx",
            repo="myuser/myrepo",
            base="main",
            head="feature/completed-feature",
            commit_message="Merge completed feature into main"
        )
        print(f"Merged: {response['sha']}")
    """
    client = get_github_client(token, base_url)
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

