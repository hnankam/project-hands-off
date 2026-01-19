"""GitHub Pull Request Management Operations.

This module provides tools for pull request operations:
- List, get, create, update, merge PRs
- PR reviews and comments
- PR commits and files
"""

from typing import Any, Optional, List, Dict
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_github_client
from models import (
    ListPullRequestsResponse,
    GetPullRequestResponse,
    CreatePullRequestResponse,
    MergePullRequestResponse,
    PullRequestInfo,
)


def list_pull_requests(
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
    state: str = "open",
    sort: str = "created",
    direction: str = "desc",
    base: Optional[str] = None,
    head: Optional[str] = None,
    page: int = 0,
    per_page: int = 30,
) -> ListPullRequestsResponse:
    """
    List pull requests in a repository with pagination support.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        state: PR state ("open", "closed", "all")
        sort: Sort by ("created", "updated", "popularity", "long-running")
        direction: Sort direction ("asc" or "desc")
        base: Filter by base branch (optional)
        head: Filter by head branch in format "user:ref-name" (optional)
        page: Page number to retrieve (0-indexed, default: 0)
        per_page: Results per page (max 100, default: 30)

    Returns:
        ListPullRequestsResponse with pull requests and pagination metadata
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        # Get paginated pull requests
        pulls_paginated = repo_obj.get_pulls(state=state, sort=sort, direction=direction, base=base, head=head)
        pulls_page = pulls_paginated.get_page(page)
        
        prs_list = []
        for pr in pulls_page:
            prs_list.append(PullRequestInfo(
                id=pr.id,
                number=pr.number,
                title=pr.title,
                body=pr.body,
                state=pr.state,
                user={"login": pr.user.login, "id": pr.user.id} if pr.user else None,
                created_at=pr.created_at.isoformat() if pr.created_at else "",
                updated_at=pr.updated_at.isoformat() if pr.updated_at else "",
                merged_at=pr.merged_at.isoformat() if pr.merged_at else None,
                head={"ref": pr.head.ref, "sha": pr.head.sha},
                base={"ref": pr.base.ref, "sha": pr.base.sha},
                html_url=pr.html_url,
            ))
        
        total_count = pulls_paginated.totalCount
        has_next = (page + 1) * per_page < total_count
        
        return ListPullRequestsResponse(
            repo_name=repo,
            pull_requests=prs_list,
            total=total_count,
            page=page,
            per_page=per_page,
            has_next_page=has_next
        )
    except Exception as e:
        return ListPullRequestsResponse(
            repo_name=repo,
            pull_requests=[],
            total=0,
            page=page,
            per_page=per_page,
            has_next_page=False,
            error_message=f"Failed to list pull requests: {str(e)}",
        )


def get_pull_request(
    token_credential_key: str,
    repo: str,
    pr_number: int,
    base_url_credential_key: str = "",
) -> GetPullRequestResponse:
    """
    Get detailed information about a specific pull request.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        pr_number: Pull request number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        GetPullRequestResponse with PR details
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        pr = repo_obj.get_pull(pr_number)
        
        pr_data = {
            "id": pr.id,
            "number": pr.number,
            "title": pr.title,
            "body": pr.body,
            "state": pr.state,
            "user": {"login": pr.user.login, "id": pr.user.id, "avatar_url": pr.user.avatar_url} if pr.user else None,
            "created_at": pr.created_at.isoformat() if pr.created_at else None,
            "updated_at": pr.updated_at.isoformat() if pr.updated_at else None,
            "closed_at": pr.closed_at.isoformat() if pr.closed_at else None,
            "merged_at": pr.merged_at.isoformat() if pr.merged_at else None,
            "merge_commit_sha": pr.merge_commit_sha,
            "head": {
                "label": pr.head.label,
                "ref": pr.head.ref,
                "sha": pr.head.sha,
            },
            "base": {
                "label": pr.base.label,
                "ref": pr.base.ref,
                "sha": pr.base.sha,
            },
            "mergeable": pr.mergeable,
            "mergeable_state": pr.mergeable_state,
            "merged": pr.merged,
            "merged_by": {"login": pr.merged_by.login} if pr.merged_by else None,
            "comments": pr.comments,
            "review_comments": pr.review_comments,
            "commits": pr.commits,
            "additions": pr.additions,
            "deletions": pr.deletions,
            "changed_files": pr.changed_files,
            "html_url": pr.html_url,
        }
        
        return GetPullRequestResponse(
            repo_name=repo,
            pull_request=pr_data
        )
    except Exception as e:
        return GetPullRequestResponse(
            repo_name=repo,
            pull_request=None,
            error_message=f"Failed to get pull request #{pr_number}: {str(e)}",
        )


def create_pull_request(
    token_credential_key: str,
    repo: str,
    title: str,
    head: str,
    base: str,
    base_url_credential_key: str = "",
    body: Optional[str] = None,
    draft: bool = False,
    maintainer_can_modify: bool = True,
) -> CreatePullRequestResponse:
    """
    Create a new pull request.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        title: PR title
        head: Head branch name (branch with changes)
        base: Base branch name (branch to merge into)
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        body: PR description (optional)
        draft: Create as draft PR (default: False)
        maintainer_can_modify: Allow maintainers to modify (default: True)

    Returns:
        CreatePullRequestResponse with created PR details
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        pr = repo_obj.create_pull(
            title=title,
            body=body or "",
            head=head,
            base=base,
            draft=draft,
            maintainer_can_modify=maintainer_can_modify,
        )
        
        pr_info = PullRequestInfo(
            id=pr.id,
            number=pr.number,
            title=pr.title,
            body=pr.body,
            state=pr.state,
            user={"login": pr.user.login, "id": pr.user.id} if pr.user else None,
            created_at=pr.created_at.isoformat() if pr.created_at else "",
            updated_at=pr.updated_at.isoformat() if pr.updated_at else "",
            merged_at=pr.merged_at.isoformat() if pr.merged_at else None,
            head={"ref": pr.head.ref, "sha": pr.head.sha},
            base={"ref": pr.base.ref, "sha": pr.base.sha},
            html_url=pr.html_url,
        )
        
        return CreatePullRequestResponse(
            pull_request=pr_info,
            message=f"Successfully created pull request #{pr.number}"
        )
    except Exception as e:
        return CreatePullRequestResponse(
            pull_request=None,
            message=None,
            error_message=f"Failed to create pull request: {str(e)}",
        )


def update_pull_request(
    token_credential_key: str,
    repo: str,
    pr_number: int,
    base_url_credential_key: str = "",
    title: Optional[str] = None,
    body: Optional[str] = None,
    state: Optional[str] = None,
    base: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update an existing pull request.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        pr_number: Pull request number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        title: New title (optional)
        body: New description (optional)
        state: New state ("open" or "closed", optional)
        base: New base branch (optional)

    Returns:
        Dictionary with updated PR info and updated fields
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        pr = repo_obj.get_pull(pr_number)
        
        # Build update dict
        updates = {}
        if title is not None:
            updates['title'] = title
        if body is not None:
            updates['body'] = body
        if state is not None:
            updates['state'] = state
        if base is not None:
            updates['base'] = base
        
        pr.edit(**updates)
        
        return {
            "repo": repo,
            "pr_number": pr_number,
            "updated_fields": list(updates.keys()),
            "message": f"Successfully updated pull request #{pr_number}"
        }
    except Exception as e:
        return {
            "repo": repo,
            "pr_number": pr_number,
            "updated_fields": [],
            "message": None,
            "error": f"Failed to update pull request #{pr_number}: {str(e)}"
        }


def close_pull_request(
    token_credential_key: str,
    repo: str,
    pr_number: int,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Close a pull request without merging.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        pr_number: Pull request number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with confirmation message
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        pr = repo_obj.get_pull(pr_number)
        
        pr.edit(state="closed")
        
        return {
            "repo": repo,
            "pr_number": pr_number,
            "state": "closed",
            "message": f"Successfully closed pull request #{pr_number}"
        }
    except Exception as e:
        return {
            "repo": repo,
            "pr_number": pr_number,
            "state": None,
            "message": None,
            "error": f"Failed to close pull request #{pr_number}: {str(e)}"
        }


def merge_pull_request(
    token_credential_key: str,
    repo: str,
    pr_number: int,
    base_url_credential_key: str = "",
    commit_title: Optional[str] = None,
    commit_message: Optional[str] = None,
    merge_method: str = "merge",
) -> MergePullRequestResponse:
    """
    Merge a pull request into the base branch.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        pr_number: Pull request number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        commit_title: Merge commit title (optional)
        commit_message: Merge commit message (optional)
        merge_method: Merge method ("merge", "squash", or "rebase", default: "merge")

    Returns:
        MergePullRequestResponse with merge result and SHA
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        pr = repo_obj.get_pull(pr_number)
        
        merge_result = pr.merge(
            commit_title=commit_title,
            commit_message=commit_message,
            merge_method=merge_method,
        )
        
        return MergePullRequestResponse(
            repo_name=repo,
            pr_number=pr_number,
            sha=merge_result.sha,
            message=f"Successfully merged pull request #{pr_number}"
        )
    except Exception as e:
        return MergePullRequestResponse(
            repo_name=repo,
            pr_number=pr_number,
            sha=None,
            message=None,
            error_message=f"Failed to merge pull request #{pr_number}: {str(e)}",
        )


def list_pr_commits(
    token_credential_key: str,
    repo: str,
    pr_number: int,
    base_url_credential_key: str = "",
    per_page: int = 30,
) -> Dict[str, Any]:
    """
    List all commits in a pull request.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        pr_number: Pull request number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        per_page: Results per page (max 100, default: 30)

    Returns:
        Dictionary with commits list and total count
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        pr = repo_obj.get_pull(pr_number)
        
        commits = []
        for commit in pr.get_commits()[:per_page]:
            commits.append({
                "sha": commit.sha,
                "message": commit.commit.message if commit.commit else "",
                "author": commit.commit.author.name if commit.commit and commit.commit.author else None,
                "date": commit.commit.author.date.isoformat() if commit.commit and commit.commit.author and commit.commit.author.date else None,
                "url": commit.html_url,
            })
        
        return {
            "repo": repo,
            "pr_number": pr_number,
            "commits": commits,
            "total": len(commits)
        }
    except Exception as e:
        return {
            "repo": repo,
            "pr_number": pr_number,
            "commits": [],
            "total": 0,
            "error": f"Failed to list PR commits: {str(e)}"
        }


def list_pr_files(
    token_credential_key: str,
    repo: str,
    pr_number: int,
    base_url_credential_key: str = "",
    per_page: int = 30,
) -> Dict[str, Any]:
    """
    List all files changed in a pull request.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        pr_number: Pull request number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        per_page: Results per page (max 100, default: 30)

    Returns:
        Dictionary with files list and total count
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        pr = repo_obj.get_pull(pr_number)
        
        files = []
        for file in pr.get_files()[:per_page]:
            files.append({
                "filename": file.filename,
                "status": file.status,
                "additions": file.additions,
                "deletions": file.deletions,
                "changes": file.changes,
                "patch": file.patch if hasattr(file, 'patch') else None,
                "blob_url": file.blob_url,
            })
        
        return {
            "repo": repo,
            "pr_number": pr_number,
            "files": files,
            "total": len(files)
        }
    except Exception as e:
        return {
            "repo": repo,
            "pr_number": pr_number,
            "files": [],
            "total": 0,
            "error": f"Failed to list PR files: {str(e)}"
        }


def add_pr_review(
    token_credential_key: str,
    repo: str,
    pr_number: int,
    body: str,
    base_url_credential_key: str = "",
    event: str = "COMMENT",
) -> Dict[str, Any]:
    """
    Add a review to a pull request.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        pr_number: Pull request number
        body: Review comment
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        event: Review event ("APPROVE", "REQUEST_CHANGES", "COMMENT", default: "COMMENT")

    Returns:
        Dictionary with created review details
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        pr = repo_obj.get_pull(pr_number)
        
        review = pr.create_review(body=body, event=event)
        
        return {
            "repo": repo,
            "pr_number": pr_number,
            "id": review.id,
            "body": review.body,
            "state": review.state,
            "user": review.user.login if review.user else None,
            "submitted_at": review.submitted_at.isoformat() if review.submitted_at else None,
            "html_url": review.html_url,
        }
    except Exception as e:
        return {
            "repo": repo,
            "pr_number": pr_number,
            "id": None,
            "body": None,
            "state": None,
            "user": None,
            "submitted_at": None,
            "html_url": None,
            "error": f"Failed to add PR review: {str(e)}"
        }


def list_pr_reviews(
    token_credential_key: str,
    repo: str,
    pr_number: int,
    base_url_credential_key: str = "",
    per_page: int = 30,
) -> Dict[str, Any]:
    """
    List all reviews on a pull request.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        pr_number: Pull request number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        per_page: Results per page (max 100, default: 30)

    Returns:
        Dictionary with reviews list and total count
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        pr = repo_obj.get_pull(pr_number)
        
        reviews = []
        for review in pr.get_reviews()[:per_page]:
            reviews.append({
                "id": review.id,
                "body": review.body,
                "state": review.state,
                "user": review.user.login if review.user else None,
                "submitted_at": review.submitted_at.isoformat() if review.submitted_at else None,
                "html_url": review.html_url,
            })
        
        return {
            "repo": repo,
            "pr_number": pr_number,
            "reviews": reviews,
            "total": len(reviews)
        }
    except Exception as e:
        return {
            "repo": repo,
            "pr_number": pr_number,
            "reviews": [],
            "total": 0,
            "error": f"Failed to list PR reviews: {str(e)}"
        }


def add_pr_comment(
    token_credential_key: str,
    repo: str,
    pr_number: int,
    body: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Add a comment to a pull request.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        pr_number: Pull request number
        body: Comment text
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with created comment details
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        pr = repo_obj.get_pull(pr_number)
        
        # Get the issue object (PRs are also issues)
        issue = repo_obj.get_issue(pr_number)
        comment = issue.create_comment(body)
        
        return {
            "repo": repo,
            "pr_number": pr_number,
            "id": comment.id,
            "body": comment.body,
            "user": comment.user.login if comment.user else None,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
            "html_url": comment.html_url,
        }
    except Exception as e:
        return {
            "repo": repo,
            "pr_number": pr_number,
            "id": None,
            "body": None,
            "user": None,
            "created_at": None,
            "html_url": None,
            "error": f"Failed to add PR comment: {str(e)}"
        }


def list_pr_comments(
    token_credential_key: str,
    repo: str,
    pr_number: int,
    base_url_credential_key: str = "",
    per_page: int = 30,
) -> Dict[str, Any]:
    """
    List all comments on a pull request.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        pr_number: Pull request number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        per_page: Results per page (max 100, default: 30)

    Returns:
        Dictionary with comments list and total count
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        # Get the issue object (PRs are also issues)
        issue = repo_obj.get_issue(pr_number)
        
        comments = []
        for comment in issue.get_comments()[:per_page]:
            comments.append({
                "id": comment.id,
                "body": comment.body,
                "user": comment.user.login if comment.user else None,
                "created_at": comment.created_at.isoformat() if comment.created_at else None,
                "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
                "html_url": comment.html_url,
            })
        
        return {
            "repo": repo,
            "pr_number": pr_number,
            "comments": comments,
            "total": len(comments)
        }
    except Exception as e:
        return {
            "repo": repo,
            "pr_number": pr_number,
            "comments": [],
            "total": 0,
            "error": f"Failed to list PR comments: {str(e)}"
        }

