"""GitHub Repository Management Operations.

This module provides tools for repository management:
- Get repository statistics
- List contributors, languages, topics
- Update repository settings
- Archive/unarchive repositories
"""

from typing import Any, Optional, List, Dict
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_github_client


def get_repository_stats(
    token: str,
    repo: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Get repository statistics.

    Retrieves statistical information about a repository.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with repository statistics

    Example:
        response = get_repository_stats(
            token="ghp_xxx",
            repo="octocat/Hello-World"
        )
        print(f"Stars: {response['stars']}")
        print(f"Forks: {response['forks']}")
        print(f"Open Issues: {response['open_issues']}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    return {
        "repo": repo,
        "stars": repo_obj.stargazers_count,
        "watchers": repo_obj.watchers_count,
        "forks": repo_obj.forks_count,
        "open_issues": repo_obj.open_issues_count,
        "size_kb": repo_obj.size,
        "network_count": repo_obj.network_count,
        "subscribers_count": repo_obj.subscribers_count,
    }


def list_contributors(
    token: str,
    repo: str,
    page: int = 0,
    per_page: int = 30,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    List repository contributors.

    Lists all contributors to a repository with their contribution counts.
    Supports pagination using PyGithub's native PaginatedList.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        page: Page number to retrieve (0-indexed, default: 0)
        per_page: Results per page (max 100, default: 30)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with contributors list and pagination metadata

    Example:
        response = list_contributors(
            token="ghp_xxx",
            repo="octocat/Hello-World"
        )
        for contributor in response['contributors']:
            print(f"{contributor['login']}: {contributor['contributions']} contributions")
        
        # Get next page
        if response['has_next_page']:
            response = list_contributors(token="ghp_xxx", repo="octocat/Hello-World", page=1)
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    # Get paginated contributors
    contributors_paginated = repo_obj.get_contributors()
    contributors_page = contributors_paginated.get_page(page)
    
    contributors = []
    for contrib in contributors_page:
        contributors.append({
            "login": contrib.login,
            "id": contrib.id,
            "avatar_url": contrib.avatar_url,
            "contributions": contrib.contributions,
            "html_url": contrib.html_url,
        })
    
    total_count = contributors_paginated.totalCount
    has_next = (page + 1) * per_page < total_count
    
    return {
        "repo": repo,
        "contributors": contributors,
        "total": total_count,
        "page": page,
        "per_page": per_page,
        "has_next_page": has_next
    }


def list_languages(
    token: str,
    repo: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    List repository languages.

    Lists programming languages used in a repository with byte counts.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with languages and byte counts

    Example:
        response = list_languages(
            token="ghp_xxx",
            repo="octocat/Hello-World"
        )
        for lang, bytes in response['languages'].items():
            print(f"{lang}: {bytes} bytes ({response['percentages'][lang]:.1f}%)")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    languages = repo_obj.get_languages()
    total_bytes = sum(languages.values())
    
    percentages = {}
    for lang, bytes_count in languages.items():
        percentages[lang] = (bytes_count / total_bytes * 100) if total_bytes > 0 else 0
    
    return {
        "repo": repo,
        "languages": languages,
        "percentages": percentages,
        "total_bytes": total_bytes
    }


def list_topics(
    token: str,
    repo: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    List repository topics.

    Lists topics (tags) associated with a repository.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with topics list

    Example:
        response = list_topics(
            token="ghp_xxx",
            repo="octocat/Hello-World"
        )
        print(f"Topics: {', '.join(response['topics'])}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    topics = repo_obj.get_topics()
    
    return {
        "repo": repo,
        "topics": topics,
        "total": len(topics)
    }


def update_repository(
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
) -> Dict[str, Any]:
    """
    Update repository settings.

    Updates various repository settings.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        name: New repository name (optional)
        description: New description (optional)
        homepage: Homepage URL (optional)
        private: Make private/public (optional)
        has_issues: Enable/disable issues (optional)
        has_wiki: Enable/disable wiki (optional)
        has_projects: Enable/disable projects (optional)
        default_branch: Set default branch (optional)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with confirmation

    Example:
        response = update_repository(
            token="ghp_xxx",
            repo="myuser/myrepo",
            description="Updated description",
            has_wiki=True,
            default_branch="main"
        )
        print(response['message'])
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    # Build update dict with only provided values
    updates = {}
    if name is not None:
        updates['name'] = name
    if description is not None:
        updates['description'] = description
    if homepage is not None:
        updates['homepage'] = homepage
    if private is not None:
        updates['private'] = private
    if has_issues is not None:
        updates['has_issues'] = has_issues
    if has_wiki is not None:
        updates['has_wiki'] = has_wiki
    if has_projects is not None:
        updates['has_projects'] = has_projects
    if default_branch is not None:
        updates['default_branch'] = default_branch
    
    repo_obj.edit(**updates)
    
    return {
        "repo": repo,
        "updated_fields": list(updates.keys()),
        "message": f"Successfully updated repository {repo}"
    }


def archive_repository(
    token: str,
    repo: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Archive a repository.

    Archives a repository, making it read-only.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with confirmation

    Example:
        response = archive_repository(
            token="ghp_xxx",
            repo="myuser/old-project"
        )
        print(response['message'])
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    repo_obj.edit(archived=True)
    
    return {
        "repo": repo,
        "archived": True,
        "message": f"Successfully archived repository {repo}"
    }


def unarchive_repository(
    token: str,
    repo: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Unarchive a repository.

    Unarchives a repository, making it writable again.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with confirmation

    Example:
        response = unarchive_repository(
            token="ghp_xxx",
            repo="myuser/revived-project"
        )
        print(response['message'])
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    repo_obj.edit(archived=False)
    
    return {
        "repo": repo,
        "archived": False,
        "message": f"Successfully unarchived repository {repo}"
    }


def get_clone_url(
    token: str,
    repo: str,
    protocol: str = "https",
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Get repository clone URL.

    Gets the clone URL for a repository in the specified protocol.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        protocol: Protocol ("https" or "ssh")
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with clone URLs

    Example:
        response = get_clone_url(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            protocol="ssh"
        )
        print(f"Clone with: git clone {response['url']}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    if protocol == "ssh":
        url = repo_obj.ssh_url
    else:
        url = repo_obj.clone_url
    
    return {
        "repo": repo,
        "protocol": protocol,
        "url": url,
        "https_url": repo_obj.clone_url,
        "ssh_url": repo_obj.ssh_url,
        "git_url": repo_obj.git_url,
    }


def get_readme(
    token: str,
    repo: str,
    ref: Optional[str] = None,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Get repository README.

    Retrieves the README file content from a repository.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        ref: Branch/tag/commit to get README from (optional, defaults to default branch)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with README content

    Example:
        response = get_readme(
            token="ghp_xxx",
            repo="octocat/Hello-World"
        )
        print(response['content'])
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    try:
        readme = repo_obj.get_readme(ref=ref) if ref else repo_obj.get_readme()
        content = readme.decoded_content.decode('utf-8')
        
        return {
            "repo": repo,
            "path": readme.path,
            "name": readme.name,
            "content": content,
            "size": readme.size,
            "sha": readme.sha,
            "encoding": readme.encoding,
        }
    except Exception as e:
        return {
            "repo": repo,
            "error": f"README not found: {str(e)}",
            "content": None
        }

