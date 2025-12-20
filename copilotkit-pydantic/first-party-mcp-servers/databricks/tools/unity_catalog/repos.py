"""
Git Repos Management Tools

This module provides tools for managing Git repositories in Databricks workspace.
"""

from typing import Optional, List, Dict, Any
from cache import get_workspace_client
from models import (
    RepoInfo,
    ListReposResponse,
    CreateRepoResponse,
    UpdateRepoResponse,
    DeleteRepoResponse,
)


def list_repos(
    host: str,
    token: str,
    path_prefix: Optional[str] = None,
    next_page_token: Optional[str] = None,
) -> ListReposResponse:
    """
    List Git repositories.
    
    Lists repos that the user has Manage permissions on. Use next_page_token
    to iterate through additional pages.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        path_prefix: Filter repos by path prefix (e.g., "/Repos/team")
        next_page_token: Token for pagination
        
    Returns:
        ListReposResponse with list of repositories
        
    Example:
        # List all repos
        repos = list_repos(host, token)
        
        # List repos in specific path
        repos = list_repos(host, token, path_prefix="/Repos/team")
    """
    client = get_workspace_client(host, token)
    
    repos_list = []
    iterator = client.repos.list(
        path_prefix=path_prefix,
        next_page_token=next_page_token
    )
    
    for repo in iterator:
        repos_list.append(
            RepoInfo(
                id=repo.id,
                path=repo.path,
                url=repo.url,
                provider=repo.provider,
                branch=repo.branch,
                head_commit_id=repo.head_commit_id,
                sparse_checkout=repo.sparse_checkout.as_dict() if repo.sparse_checkout else None,
            )
        )
    
    return ListReposResponse(
        repos=repos_list,
        count=len(repos_list),
        next_page_token=None  # SDK iterator doesn't expose next token
    )


def get_repo(
    host: str,
    token: str,
    repo_id: int,
) -> RepoInfo:
    """
    Get repository details.
    
    Returns information about a specific Git repository by its ID.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        repo_id: Repository ID
        
    Returns:
        RepoInfo with repository details
        
    Example:
        repo = get_repo(host, token, repo_id=12345)
        print(f"Repo at {repo.path} on branch {repo.branch}")
    """
    client = get_workspace_client(host, token)
    
    repo = client.repos.get(repo_id=repo_id)
    
    return RepoInfo(
        id=repo.id,
        path=repo.path,
        url=repo.url,
        provider=repo.provider,
        branch=repo.branch,
        head_commit_id=repo.head_commit_id,
        sparse_checkout=repo.sparse_checkout.as_dict() if repo.sparse_checkout else None,
    )


def create_repo(
    host: str,
    token: str,
    url: str,
    provider: str,
    path: Optional[str] = None,
) -> CreateRepoResponse:
    """
    Create a new Git repository.
    
    Creates a repo in the workspace and links it to a remote Git repository.
    Note that repos created programmatically must be linked to a remote Git repo.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        url: URL of the Git repository to be linked
        provider: Git provider (github, gitlab, bitbucket, etc.)
        path: Desired workspace path for the repo (e.g., "/Repos/team/project")
        
    Returns:
        CreateRepoResponse with created repository details
        
    Supported providers:
        - github
        - githubEnterprise
        - gitlab
        - gitlabEnterpriseEdition
        - bitbucketCloud
        - bitbucketServer
        - azureDevOpsServices
        - awsCodeCommit
        
    Example:
        # Clone a GitHub repo
        repo = create_repo(
            host, token,
            url="https://github.com/company/analytics.git",
            provider="github",
            path="/Repos/team/analytics"
        )
        print(f"Created repo {repo.id} at {repo.path}")
    """
    client = get_workspace_client(host, token)
    
    repo = client.repos.create(
        url=url,
        provider=provider,
        path=path,
    )
    
    return CreateRepoResponse(
        id=repo.id,
        path=repo.path,
        url=repo.url,
        provider=repo.provider,
        branch=repo.branch,
    )


def update_repo(
    host: str,
    token: str,
    repo_id: int,
    branch: Optional[str] = None,
    tag: Optional[str] = None,
) -> UpdateRepoResponse:
    """
    Update repository branch or tag.
    
    Updates the repo to a different branch or tag, or updates the repo to the
    latest commit on the same branch. Specify either branch OR tag, not both.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        repo_id: Repository ID
        branch: Branch to check out
        tag: Tag to check out (puts repo in detached HEAD state)
        
    Returns:
        UpdateRepoResponse with updated repository details
        
    Note:
        - Updating to a tag puts the repo in a detached HEAD state
        - Before committing new changes, update to a branch instead
        - To pull latest changes, call update with the current branch name
        
    Example:
        # Switch to feature branch
        update_repo(host, token, repo_id=12345, branch="feature/new-analysis")
        
        # Pull latest changes on current branch
        repo = get_repo(host, token, repo_id=12345)
        update_repo(host, token, repo_id=12345, branch=repo.branch)
        
        # Check out specific tag
        update_repo(host, token, repo_id=12345, tag="v1.0.0")
    """
    client = get_workspace_client(host, token)
    
    client.repos.update(
        repo_id=repo_id,
        branch=branch,
        tag=tag,
    )
    
    # Get updated repo info
    repo = client.repos.get(repo_id=repo_id)
    
    return UpdateRepoResponse(
        repo_id=repo_id,
        branch=repo.branch,
        tag=tag if tag else None,
        head_commit_id=repo.head_commit_id,
    )


def delete_repo(
    host: str,
    token: str,
    repo_id: int,
) -> DeleteRepoResponse:
    """
    Delete a repository.
    
    Deletes the specified Git repository from the workspace. This does not
    delete the remote Git repository, only the workspace link.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        repo_id: Repository ID
        
    Returns:
        DeleteRepoResponse confirming deletion
        
    Example:
        delete_repo(host, token, repo_id=12345)
    """
    client = get_workspace_client(host, token)
    
    client.repos.delete(repo_id=repo_id)
    
    return DeleteRepoResponse(repo_id=repo_id)


def get_repo_permissions(
    host: str,
    token: str,
    repo_id: str,
) -> Dict[str, Any]:
    """
    Get repository permissions.
    
    Gets the permissions of a repo. Repos can inherit permissions from their
    root object.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        repo_id: Repository ID (as string)
        
    Returns:
        Dict with permission details
        
    Example:
        permissions = get_repo_permissions(host, token, repo_id="12345")
        for acl in permissions.access_control_list:
            print(f"{acl.user_name}: {acl.all_permissions}")
    """
    client = get_workspace_client(host, token)
    
    permissions = client.repos.get_permissions(repo_id=repo_id)
    
    return permissions.as_dict()


def set_repo_permissions(
    host: str,
    token: str,
    repo_id: str,
    access_control_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Set repository permissions.
    
    Sets permissions on a repo, replacing existing permissions if they exist.
    Deletes all direct permissions if none are specified.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        repo_id: Repository ID (as string)
        access_control_list: List of ACL entries
        
    Returns:
        Dict with updated permission details
        
    ACL Entry Format:
        {
            "user_name": "user@company.com",
            "permission_level": "CAN_MANAGE"  # or CAN_READ, CAN_RUN, CAN_EDIT
        }
        
    Example:
        acls = [
            {"user_name": "user@company.com", "permission_level": "CAN_EDIT"},
            {"group_name": "data-scientists", "permission_level": "CAN_READ"}
        ]
        set_repo_permissions(host, token, repo_id="12345", access_control_list=acls)
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.workspace import RepoAccessControlRequest
    
    # Convert dicts to SDK objects
    acl_requests = []
    for acl in access_control_list:
        acl_requests.append(RepoAccessControlRequest.from_dict(acl))
    
    permissions = client.repos.set_permissions(
        repo_id=repo_id,
        access_control_list=acl_requests,
    )
    
    return permissions.as_dict()


def update_repo_permissions(
    host: str,
    token: str,
    repo_id: str,
    access_control_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Update repository permissions.
    
    Updates the permissions on a repo. Repos can inherit permissions from
    their root object.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        repo_id: Repository ID (as string)
        access_control_list: List of ACL entries to update
        
    Returns:
        Dict with updated permission details
        
    Example:
        acls = [
            {"user_name": "user@company.com", "permission_level": "CAN_MANAGE"}
        ]
        update_repo_permissions(host, token, repo_id="12345", access_control_list=acls)
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.workspace import RepoAccessControlRequest
    
    # Convert dicts to SDK objects
    acl_requests = []
    for acl in access_control_list:
        acl_requests.append(RepoAccessControlRequest.from_dict(acl))
    
    permissions = client.repos.update_permissions(
        repo_id=repo_id,
        access_control_list=acl_requests,
    )
    
    return permissions.as_dict()


def get_repo_permission_levels(
    host: str,
    token: str,
    repo_id: str,
) -> Dict[str, Any]:
    """
    Get available permission levels.
    
    Gets the permission levels that a user can have on a repo.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        repo_id: Repository ID (as string)
        
    Returns:
        Dict with available permission levels
        
    Example:
        levels = get_repo_permission_levels(host, token, repo_id="12345")
        for level in levels.permission_levels:
            print(f"{level.permission_level}: {level.description}")
    """
    client = get_workspace_client(host, token)
    
    levels = client.repos.get_permission_levels(repo_id=repo_id)
    
    return levels.as_dict()

