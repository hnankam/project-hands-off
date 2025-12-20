"""GitHub Commit Operations.

This module provides tools for commit operations:
- List and get commits
- Commit status and comments
- Commit comparison and diffs
"""

from typing import Any, Optional, List, Dict
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_github_client
from models import (
    ListCommitsResponse,
    GetCommitResponse,
    CompareCommitsResponse,
    CommitInfo,
)


def list_commits(
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
) -> ListCommitsResponse:
    """
    List repository commits.

    Lists commits in a repository with optional filters and pagination support.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        sha: Branch/tag/commit SHA to list commits from (optional)
        path: Filter commits by file path (optional)
        author: Filter commits by author (optional)
        since: Only commits after this date (ISO 8601 format, optional)
        until: Only commits before this date (ISO 8601 format, optional)
        page: Page number to retrieve (0-indexed, default: 0)
        per_page: Results per page (max 100, default: 30)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        ListCommitsResponse with commits and pagination metadata

    Example:
        # List recent commits
        response = list_commits(
            token="ghp_xxx",
            repo="octocat/Hello-World"
        )
        for commit in response.commits:
            print(f"{commit.sha[:7]}: {commit.message}")
        
        # Get next page
        if response.has_next_page:
            response = list_commits(token="ghp_xxx", repo="octocat/Hello-World", page=1)

        # List commits by author
        response = list_commits(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            author="octocat"
        )

        # List commits in date range
        response = list_commits(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            since="2024-01-01T00:00:00Z",
            until="2024-12-31T23:59:59Z"
        )
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    # Build commit query parameters
    kwargs = {}
    if sha:
        kwargs['sha'] = sha
    if path:
        kwargs['path'] = path
    if author:
        kwargs['author'] = author
    if since:
        kwargs['since'] = since
    if until:
        kwargs['until'] = until
    
    # Get paginated commits
    commits_paginated = repo_obj.get_commits(**kwargs)
    commits_page = commits_paginated.get_page(page)
    
    commits_list = []
    for commit in commits_page:
        commit_author = None
        if commit.commit and commit.commit.author:
            commit_author = {
                "name": commit.commit.author.name,
                "email": commit.commit.author.email,
                "date": commit.commit.author.date.isoformat() if commit.commit.author.date else None,
            }
        
        commit_committer = None
        if commit.commit and commit.commit.committer:
            commit_committer = {
                "name": commit.commit.committer.name,
                "email": commit.commit.committer.email,
                "date": commit.commit.committer.date.isoformat() if commit.commit.committer.date else None,
            }
        
        commits_list.append(CommitInfo(
            sha=commit.sha,
            message=commit.commit.message if commit.commit else "",
            author=commit_author,
            committer=commit_committer,
            url=commit.html_url,
        ))
    
    total_count = commits_paginated.totalCount
    has_next = (page + 1) * per_page < total_count
    
    return ListCommitsResponse(
        repo_name=repo,
        commits=commits_list,
        total=total_count,
        page=page,
        per_page=per_page,
        has_next_page=has_next
    )


def get_commit(
    token: str,
    repo: str,
    sha: str,
    base_url: str = "https://api.github.com",
) -> GetCommitResponse:
    """
    Get commit details.

    Retrieves detailed information about a specific commit.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        sha: Commit SHA
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        GetCommitResponse with commit details

    Example:
        response = get_commit(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            sha="abc123def456"
        )
        print(f"Message: {response.commit['message']}")
        print(f"Author: {response.commit['author']['name']}")
        print(f"Files changed: {response.commit['files_changed']}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    commit = repo_obj.get_commit(sha)
    
    commit_data = {
        "sha": commit.sha,
        "message": commit.commit.message,
        "author": {
            "name": commit.commit.author.name,
            "email": commit.commit.author.email,
            "date": commit.commit.author.date.isoformat() if commit.commit.author.date else None,
        } if commit.commit.author else None,
        "committer": {
            "name": commit.commit.committer.name,
            "email": commit.commit.committer.email,
            "date": commit.commit.committer.date.isoformat() if commit.commit.committer.date else None,
        } if commit.commit.committer else None,
        "url": commit.html_url,
        "stats": {
            "additions": commit.stats.additions,
            "deletions": commit.stats.deletions,
            "total": commit.stats.total,
        } if commit.stats else None,
        "files_changed": len(list(commit.files)),
        "parents": [{"sha": p.sha, "url": p.html_url} for p in commit.parents] if commit.parents else [],
    }
    
    return GetCommitResponse(
        repo_name=repo,
        commit=commit_data
    )


def compare_commits(
    token: str,
    repo: str,
    base: str,
    head: str,
    base_url: str = "https://api.github.com",
) -> CompareCommitsResponse:
    """
    Compare two commits.

    Compares two commits and shows the differences.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base: Base commit SHA or branch
        head: Head commit SHA or branch
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        CompareCommitsResponse with comparison results

    Example:
        response = compare_commits(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            base="abc123",
            head="def456"
        )
        print(f"Commits: {response.ahead_by}")
        print(f"Files changed: {len(response.commits)}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    comparison = repo_obj.compare(base, head)
    
    commits = []
    for commit in comparison.commits:
        commits.append({
            "sha": commit.sha,
            "message": commit.commit.message,
            "author": commit.commit.author.name if commit.commit.author else None,
            "date": commit.commit.author.date.isoformat() if commit.commit.author and commit.commit.author.date else None,
            "url": commit.html_url,
        })
    
    return CompareCommitsResponse(
        repo_name=repo,
        base=base,
        head=head,
        ahead_by=comparison.ahead_by,
        behind_by=comparison.behind_by,
        commits=commits
    )


def get_commit_status(
    token: str,
    repo: str,
    sha: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Get commit status.

    Retrieves the combined status of a commit (CI/CD checks).

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        sha: Commit SHA
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with commit status

    Example:
        response = get_commit_status(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            sha="abc123def456"
        )
        print(f"Overall state: {response['state']}")
        for status in response['statuses']:
            print(f"  {status['context']}: {status['state']}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    commit = repo_obj.get_commit(sha)
    
    combined_status = commit.get_combined_status()
    
    statuses = []
    for status in combined_status.statuses:
        statuses.append({
            "context": status.context,
            "state": status.state,
            "description": status.description,
            "target_url": status.target_url,
            "created_at": status.created_at.isoformat() if status.created_at else None,
            "updated_at": status.updated_at.isoformat() if status.updated_at else None,
        })
    
    return {
        "repo": repo,
        "sha": sha,
        "state": combined_status.state,
        "total_count": combined_status.total_count,
        "statuses": statuses,
    }


def create_commit_comment(
    token: str,
    repo: str,
    sha: str,
    body: str,
    path: Optional[str] = None,
    position: Optional[int] = None,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Create a commit comment.

    Adds a comment to a specific commit.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        sha: Commit SHA
        body: Comment text
        path: File path to comment on (optional)
        position: Line position in the file (optional, requires path)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with created comment

    Example:
        response = create_commit_comment(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            sha="abc123def456",
            body="Great commit! 👍"
        )
        print(f"Comment created: {response['id']}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    commit = repo_obj.get_commit(sha)
    
    if path and position:
        comment = commit.create_comment(body=body, path=path, position=position)
    else:
        comment = commit.create_comment(body=body)
    
    return {
        "repo": repo,
        "sha": sha,
        "id": comment.id,
        "body": comment.body,
        "user": comment.user.login if comment.user else None,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "html_url": comment.html_url,
    }


def list_commit_comments(
    token: str,
    repo: str,
    sha: str,
    per_page: int = 30,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    List commit comments.

    Lists all comments on a commit.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        sha: Commit SHA
        per_page: Results per page (max 100)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with comments list

    Example:
        response = list_commit_comments(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            sha="abc123def456"
        )
        for comment in response['comments']:
            print(f"{comment['user']}: {comment['body']}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    commit = repo_obj.get_commit(sha)
    
    comments = []
    for comment in commit.get_comments()[:per_page]:
        comments.append({
            "id": comment.id,
            "body": comment.body,
            "user": comment.user.login if comment.user else None,
            "path": comment.path,
            "position": comment.position,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
            "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
            "html_url": comment.html_url,
        })
    
    return {
        "repo": repo,
        "sha": sha,
        "comments": comments,
        "total": len(comments)
    }


def get_commit_diff(
    token: str,
    repo: str,
    sha: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Get commit diff.

    Retrieves the file changes (diff) for a commit.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        sha: Commit SHA
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with diff information

    Example:
        response = get_commit_diff(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            sha="abc123def456"
        )
        for file in response['files']:
            print(f"{file['filename']}: +{file['additions']} -{file['deletions']}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    commit = repo_obj.get_commit(sha)
    
    files = []
    for file in commit.files:
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
        "sha": sha,
        "files": files,
        "total_files": len(files),
        "stats": {
            "additions": commit.stats.additions if commit.stats else 0,
            "deletions": commit.stats.deletions if commit.stats else 0,
            "total": commit.stats.total if commit.stats else 0,
        }
    }


def search_commits(
    token: str,
    query: str,
    repo: Optional[str] = None,
    sort: str = "author-date",
    order: str = "desc",
    per_page: int = 30,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Search commits.

    Searches for commits across repositories or within a specific repository.

    Args:
        token: GitHub Personal Access Token
        query: Search query (e.g., "fix bug", "author:octocat")
        repo: Repository name in format "owner/repo" (optional, searches all if omitted)
        sort: Sort by ("author-date" or "committer-date")
        order: Sort order ("asc" or "desc")
        per_page: Results per page (max 100)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with search results

    Example:
        # Search commits in all repositories
        response = search_commits(
            token="ghp_xxx",
            query="fix bug"
        )

        # Search commits in specific repository
        response = search_commits(
            token="ghp_xxx",
            query="merge",
            repo="octocat/Hello-World"
        )

        # Search by author
        response = search_commits(
            token="ghp_xxx",
            query="author:octocat refactor"
        )
    """
    client = get_github_client(token, base_url)
    
    # Add repo to query if specified
    full_query = query
    if repo:
        full_query = f"{query} repo:{repo}"
    
    commits = client.search_commits(query=full_query, sort=sort, order=order)
    
    commits_list = []
    for commit in list(commits)[:per_page]:
        commits_list.append({
            "sha": commit.sha,
            "message": commit.commit.message if commit.commit else "",
            "author": commit.commit.author.name if commit.commit and commit.commit.author else None,
            "date": commit.commit.author.date.isoformat() if commit.commit and commit.commit.author and commit.commit.author.date else None,
            "repository": commit.repository.full_name if commit.repository else None,
            "url": commit.html_url,
        })
    
    return {
        "query": query,
        "repo": repo,
        "commits": commits_list,
        "total": len(commits_list)
    }

