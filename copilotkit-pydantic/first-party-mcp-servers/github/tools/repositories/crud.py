"""GitHub Repository CRUD Operations.

This module provides tools for basic repository operations:
- List, get, create, delete repositories
- Fork repositories
- Get repository statistics
- List contributors and languages
"""

from typing import Any, Optional, List
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_github_client
from models import (
    ListRepositoriesResponse,
    GetRepositoryResponse,
    CreateRepositoryResponse,
    DeleteRepositoryResponse,
    ForkRepositoryResponse,
    RepositoryInfo,
)


def list_repositories(
    token: str,
    user: Optional[str] = None,
    org: Optional[str] = None,
    type: str = "all",
    sort: str = "updated",
    direction: str = "desc",
    page: int = 0,
    per_page: int = 30,
    base_url: str = "https://api.github.com",
) -> ListRepositoriesResponse:
    """
    List repositories for a user or organization.

    Lists repositories accessible to the authenticated user, or for a specific user/org.
    Supports pagination using PyGithub's native PaginatedList.

    Args:
        token: GitHub Personal Access Token
        user: Username to list repos for (optional, defaults to authenticated user)
        org: Organization name to list repos for (optional)
        type: Repository type filter ("all", "owner", "public", "private", "member")
        sort: Sort by ("created", "updated", "pushed", "full_name")
        direction: Sort direction ("asc" or "desc")
        page: Page number to retrieve (0-indexed, default: 0)
        per_page: Results per page (max 100, default: 30)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        ListRepositoriesResponse with repositories and pagination metadata

    Example:
        # List your repositories (first page)
        response = list_repositories(token="ghp_xxx")
        for repo in response.repositories:
            print(f"{repo.full_name}: {repo.description}")
        
        # Get next page if available
        if response.has_next_page:
            response = list_repositories(token="ghp_xxx", page=1)

        # List organization repositories
        response = list_repositories(
            token="ghp_xxx",
            org="mycompany",
            type="public",
            per_page=50
        )

        # List another user's repositories
        response = list_repositories(
            token="ghp_xxx",
            user="octocat"
        )
    """
    client = get_github_client(token, base_url)
    
    # Get PaginatedList
    if org:
        # List organization repositories
        org_obj = client.get_organization(org)
        repos_paginated = org_obj.get_repos(type=type, sort=sort, direction=direction)
    elif user:
        # List specific user's repositories
        user_obj = client.get_user(user)
        repos_paginated = user_obj.get_repos(type=type, sort=sort, direction=direction)
    else:
        # List authenticated user's repositories
        repos_paginated = client.get_user().get_repos(type=type, sort=sort, direction=direction)
    
    # Get specific page using native pagination
    repos_page = repos_paginated.get_page(page)
    
    repos_list = []
    for repo in repos_page:
        repos_list.append(RepositoryInfo(
            id=repo.id,
            name=repo.name,
            full_name=repo.full_name,
            description=repo.description,
            private=repo.private,
            fork=repo.fork,
            created_at=repo.created_at.isoformat() if repo.created_at else "",
            updated_at=repo.updated_at.isoformat() if repo.updated_at else "",
            pushed_at=repo.pushed_at.isoformat() if repo.pushed_at else None,
            size=repo.size,
            stargazers_count=repo.stargazers_count,
            watchers_count=repo.watchers_count,
            language=repo.language,
            forks_count=repo.forks_count,
            open_issues_count=repo.open_issues_count,
            default_branch=repo.default_branch,
            html_url=repo.html_url,
            clone_url=repo.clone_url,
            ssh_url=repo.ssh_url,
        ))
    
    # Get total count and check if more pages exist
    total_count = repos_paginated.totalCount
    has_next = (page + 1) * per_page < total_count
    
    return ListRepositoriesResponse(
        repositories=repos_list,
        total=total_count,
        page=page,
        per_page=per_page,
        has_next_page=has_next
    )


def get_repository(
    token: str,
    repo: str,
    base_url: str = "https://api.github.com",
) -> GetRepositoryResponse:
    """
    Get repository details.

    Retrieves complete information about a specific repository.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        GetRepositoryResponse with repository details

    Example:
        # Get repository details
        response = get_repository(
            token="ghp_xxx",
            repo="octocat/Hello-World"
        )
        print(f"Stars: {response.repository['stargazers_count']}")
        print(f"Language: {response.repository['language']}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    return GetRepositoryResponse(
        repository={
            "id": repo_obj.id,
            "name": repo_obj.name,
            "full_name": repo_obj.full_name,
            "description": repo_obj.description,
            "private": repo_obj.private,
            "fork": repo_obj.fork,
            "created_at": repo_obj.created_at.isoformat() if repo_obj.created_at else None,
            "updated_at": repo_obj.updated_at.isoformat() if repo_obj.updated_at else None,
            "pushed_at": repo_obj.pushed_at.isoformat() if repo_obj.pushed_at else None,
            "size": repo_obj.size,
            "stargazers_count": repo_obj.stargazers_count,
            "watchers_count": repo_obj.watchers_count,
            "language": repo_obj.language,
            "forks_count": repo_obj.forks_count,
            "open_issues_count": repo_obj.open_issues_count,
            "default_branch": repo_obj.default_branch,
            "html_url": repo_obj.html_url,
            "clone_url": repo_obj.clone_url,
            "ssh_url": repo_obj.ssh_url,
            "topics": repo_obj.get_topics(),
            "license": repo_obj.license.name if repo_obj.license else None,
            "archived": repo_obj.archived,
            "disabled": repo_obj.disabled,
            "has_issues": repo_obj.has_issues,
            "has_wiki": repo_obj.has_wiki,
            "has_pages": repo_obj.has_pages,
            "has_projects": repo_obj.has_projects,
            "has_downloads": repo_obj.has_downloads,
        }
    )


def create_repository(
    token: str,
    name: str,
    description: Optional[str] = None,
    private: bool = False,
    auto_init: bool = False,
    gitignore_template: Optional[str] = None,
    license_template: Optional[str] = None,
    org: Optional[str] = None,
    base_url: str = "https://api.github.com",
) -> CreateRepositoryResponse:
    """
    Create a new repository.

    Creates a new repository for the authenticated user or specified organization.

    Args:
        token: GitHub Personal Access Token
        name: Repository name
        description: Repository description (optional)
        private: Whether repository is private (default: False)
        auto_init: Initialize with README (default: False)
        gitignore_template: .gitignore template name (e.g., "Python", "Node")
        license_template: License template (e.g., "mit", "apache-2.0")
        org: Organization name (creates org repo if provided)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        CreateRepositoryResponse with created repository

    Example:
        # Create personal repository
        response = create_repository(
            token="ghp_xxx",
            name="my-new-project",
            description="My awesome project",
            private=True,
            auto_init=True,
            gitignore_template="Python",
            license_template="mit"
        )
        print(f"Created: {response.repository.html_url}")

        # Create organization repository
        response = create_repository(
            token="ghp_xxx",
            name="team-project",
            description="Team collaboration project",
            org="mycompany",
            private=True
        )
    """
    client = get_github_client(token, base_url)
    
    if org:
        # Create organization repository
        org_obj = client.get_organization(org)
        repo = org_obj.create_repo(
            name=name,
            description=description,
            private=private,
            auto_init=auto_init,
            gitignore_template=gitignore_template,
            license_template=license_template,
        )
    else:
        # Create personal repository
        user = client.get_user()
        repo = user.create_repo(
            name=name,
            description=description,
            private=private,
            auto_init=auto_init,
            gitignore_template=gitignore_template,
            license_template=license_template,
        )
    
    repo_info = RepositoryInfo(
        id=repo.id,
        name=repo.name,
        full_name=repo.full_name,
        description=repo.description,
        private=repo.private,
        fork=repo.fork,
        created_at=repo.created_at.isoformat() if repo.created_at else "",
        updated_at=repo.updated_at.isoformat() if repo.updated_at else "",
        pushed_at=repo.pushed_at.isoformat() if repo.pushed_at else None,
        size=repo.size,
        stargazers_count=repo.stargazers_count,
        watchers_count=repo.watchers_count,
        language=repo.language,
        forks_count=repo.forks_count,
        open_issues_count=repo.open_issues_count,
        default_branch=repo.default_branch,
        html_url=repo.html_url,
        clone_url=repo.clone_url,
        ssh_url=repo.ssh_url,
    )
    
    return CreateRepositoryResponse(
        repository=repo_info,
        message=f"Successfully created repository {repo.full_name}"
    )


def delete_repository(
    token: str,
    repo: str,
    base_url: str = "https://api.github.com",
) -> DeleteRepositoryResponse:
    """
    Delete a repository.

    Permanently deletes a repository.
    **WARNING:** This operation is irreversible!

    Args:
        token: GitHub Personal Access Token (requires delete_repo scope)
        repo: Repository name in format "owner/repo"
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        DeleteRepositoryResponse with confirmation

    Example:
        # Delete repository (USE WITH CAUTION!)
        response = delete_repository(
            token="ghp_xxx",
            repo="myuser/old-project"
        )
        print(response.message)
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    repo_obj.delete()
    
    return DeleteRepositoryResponse(
        repo_name=repo,
        message=f"Successfully deleted repository {repo}"
    )


def fork_repository(
    token: str,
    repo: str,
    organization: Optional[str] = None,
    base_url: str = "https://api.github.com",
) -> ForkRepositoryResponse:
    """
    Fork a repository.

    Creates a fork of the specified repository.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        organization: Organization to fork into (optional, defaults to personal account)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        ForkRepositoryResponse with forked repository

    Example:
        # Fork to personal account
        response = fork_repository(
            token="ghp_xxx",
            repo="octocat/Hello-World"
        )
        print(f"Forked to: {response.repository.html_url}")

        # Fork to organization
        response = fork_repository(
            token="ghp_xxx",
            repo="upstream/project",
            organization="mycompany"
        )
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    if organization:
        org_obj = client.get_organization(organization)
        forked_repo = repo_obj.create_fork(org_obj)
    else:
        forked_repo = repo_obj.create_fork()
    
    repo_info = RepositoryInfo(
        id=forked_repo.id,
        name=forked_repo.name,
        full_name=forked_repo.full_name,
        description=forked_repo.description,
        private=forked_repo.private,
        fork=forked_repo.fork,
        created_at=forked_repo.created_at.isoformat() if forked_repo.created_at else "",
        updated_at=forked_repo.updated_at.isoformat() if forked_repo.updated_at else "",
        pushed_at=forked_repo.pushed_at.isoformat() if forked_repo.pushed_at else None,
        size=forked_repo.size,
        stargazers_count=forked_repo.stargazers_count,
        watchers_count=forked_repo.watchers_count,
        language=forked_repo.language,
        forks_count=forked_repo.forks_count,
        open_issues_count=forked_repo.open_issues_count,
        default_branch=forked_repo.default_branch,
        html_url=forked_repo.html_url,
        clone_url=forked_repo.clone_url,
        ssh_url=forked_repo.ssh_url,
    )
    
    return ForkRepositoryResponse(
        repository=repo_info,
        message=f"Successfully forked {repo} to {forked_repo.full_name}"
    )

