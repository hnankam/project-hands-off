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
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Get statistical information about a repository.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with repository statistics (stars, watchers, forks, etc.)
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return {
            "repo": repo,
            "stars": 0,
            "watchers": 0,
            "forks": 0,
            "open_issues": 0,
            "size_kb": 0,
            "network_count": 0,
            "subscribers_count": 0,
            "error": f"Failed to get repository stats: {str(e)}"
        }


def list_contributors(
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
    page: int = 0,
    per_page: int = 30,
) -> Dict[str, Any]:
    """
    List all contributors to a repository with their contribution counts and pagination support.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        page: Page number to retrieve (0-indexed, default: 0)
        per_page: Results per page (max 100, default: 30)

    Returns:
        Dictionary with contributors list and pagination metadata
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return {
            "repo": repo,
            "contributors": [],
            "total": 0,
            "page": page,
            "per_page": per_page,
            "has_next_page": False,
            "error": f"Failed to list contributors: {str(e)}"
        }


def list_languages(
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    List all programming languages used in a repository with byte counts and percentages.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with languages, byte counts, and percentage breakdown
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return {
            "repo": repo,
            "languages": {},
            "percentages": {},
            "total_bytes": 0,
            "error": f"Failed to list languages: {str(e)}"
        }


def list_topics(
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    List topics (tags) associated with a repository.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with topics list and count
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        topics = repo_obj.get_topics()
        
        return {
            "repo": repo,
            "topics": topics,
            "total": len(topics)
        }
    except Exception as e:
        return {
            "repo": repo,
            "topics": [],
            "total": 0,
            "error": f"Failed to list topics: {str(e)}"
        }


def update_repository(
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
    name: Optional[str] = None,
    description: Optional[str] = None,
    homepage: Optional[str] = None,
    private: Optional[bool] = None,
    has_issues: Optional[bool] = None,
    has_wiki: Optional[bool] = None,
    has_projects: Optional[bool] = None,
    default_branch: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update various repository settings.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        name: New repository name (optional)
        description: New description (optional)
        homepage: Homepage URL (optional)
        private: Make private/public (optional)
        has_issues: Enable/disable issues (optional)
        has_wiki: Enable/disable wiki (optional)
        has_projects: Enable/disable projects (optional)
        default_branch: Set default branch (optional)

    Returns:
        Dictionary with confirmation and updated fields
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return {
            "repo": repo,
            "updated_fields": [],
            "message": None,
            "error": f"Failed to update repository: {str(e)}"
        }


def archive_repository(
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Archive a repository, making it read-only.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with confirmation message
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        repo_obj.edit(archived=True)
        
        return {
            "repo": repo,
            "archived": True,
            "message": f"Successfully archived repository {repo}"
        }
    except Exception as e:
        return {
            "repo": repo,
            "archived": None,
            "message": None,
            "error": f"Failed to archive repository: {str(e)}"
        }


def unarchive_repository(
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Unarchive a repository, making it writable again.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with confirmation message
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        repo_obj.edit(archived=False)
        
        return {
            "repo": repo,
            "archived": False,
            "message": f"Successfully unarchived repository {repo}"
        }
    except Exception as e:
        return {
            "repo": repo,
            "archived": None,
            "message": None,
            "error": f"Failed to unarchive repository: {str(e)}"
        }


def get_clone_url(
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
    protocol: str = "https",
) -> Dict[str, Any]:
    """
    Get the clone URL for a repository in the specified protocol.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        protocol: Protocol ("https" or "ssh", default: "https")

    Returns:
        Dictionary with clone URLs (https, ssh, git)
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return {
            "repo": repo,
            "protocol": protocol,
            "url": None,
            "https_url": None,
            "ssh_url": None,
            "git_url": None,
            "error": f"Failed to get clone URL: {str(e)}"
        }


def get_readme(
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
    ref: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Retrieve the README file content from a repository.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        ref: Branch/tag/commit to get README from (optional, defaults to default branch)

    Returns:
        Dictionary with README content, path, name, size, and SHA
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return {
            "repo": repo,
            "error": f"Failed to get README: {str(e)}",
            "content": None
        }

