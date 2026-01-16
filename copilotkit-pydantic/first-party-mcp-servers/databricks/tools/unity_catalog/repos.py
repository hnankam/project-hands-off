"""
Git Repos Management Tools

This module provides tools for managing Git repositories in Databricks workspace.
"""

from typing import Optional, List, Dict, Any
from itertools import islice
from cache import get_workspace_client
from models import (
    RepoInfo,
    ListReposResponse,
    CreateRepoResponse,
    UpdateRepoResponse,
    DeleteRepoResponse,
)


def list_repos(
    host_credential_key: str,
    token_credential_key: str,
    path_prefix: Optional[str] = None,
    limit: int = 25,
    page: int = 0,
) -> ListReposResponse:
    """
    Retrieve a paginated list of Git repositories in the Databricks workspace.
    
    This function returns repository metadata for Git repos integrated with Databricks.
    Use this to discover available repos, check repo status, or list version-controlled notebooks.
    
    Access Requirements: Only returns repositories where the caller has Manage permissions.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        path_prefix: Optional string to filter repos by workspace path. Only repos with paths starting with this prefix are returned. 
        limit: Number of repositories to return in a single request. Must be positive integer. Default: 25
        page: Zero-indexed page number for pagination. Default: 0
        
    Returns:
        ListReposResponse containing:
        - repos: List of RepoInfo objects with repository details (path, URL, branch, provider, commit ID)
        - count: Integer number of repos returned in this page (0 to limit)
        - has_more: Boolean indicating if additional repos exist beyond this page
        
    Pagination:
        - Returns up to `limit` repos per call
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available
        - path_prefix filter applies consistently across all pages
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    response = client.repos.list(
        path_prefix=path_prefix,
    )
    
    skip = page * limit
    repos_iterator = islice(response, skip, skip + limit)
    
    repos_list = []
    for repo in repos_iterator:
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
    
    # Check for more results
    has_more = False
    try:
        next(response)
        has_more = True
    except StopIteration:
        has_more = False
    
    return ListReposResponse(
        repos=repos_list,
        count=len(repos_list),
        has_more=has_more,
    )
    except Exception as e:
        return ListReposResponse(
            repos=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list repos: {str(e)}",
        )


def get_repo(
    host_credential_key: str,
    token_credential_key: str,
    repo_id: int,
) -> Optional[RepoInfo]:
    """
    Get repository details.
    
    Returns information about a specific Git repository by its ID.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        repo_id: Repository ID
        
    Returns:
        RepoInfo with repository details
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
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
    except Exception as e:
        print(f"Error getting repo: {e}")
        return None


def create_repo(
    host_credential_key: str,
    token_credential_key: str,
    url: str,
    provider: str,
    path: Optional[str] = None,
) -> CreateRepoResponse:
    """
    Create a new Git repository.
    
    Creates a repo in the workspace and links it to a remote Git repository.
    Note that repos created programmatically must be linked to a remote Git repo.
    
    Args:
        host_credential_key: Credential key for workspace URL
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
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
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
    except Exception as e:
        return CreateRepoResponse(
            id=None,
            path=path,
            url=url,
            provider=provider,
            branch=None,
            error_message=f"Failed to create repo: {str(e)}",
        )


def update_repo(
    host_credential_key: str,
    token_credential_key: str,
    repo_id: int,
    branch: Optional[str] = None,
    tag: Optional[str] = None,
) -> UpdateRepoResponse:
    """
    Update repository branch or tag.
    
    Updates the repo to a different branch or tag, or updates the repo to the
    latest commit on the same branch. Specify either branch OR tag, not both.
    
    Args:
        host_credential_key: Credential key for workspace URL
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
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
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
    except Exception as e:
        return UpdateRepoResponse(
            repo_id=repo_id,
            branch=branch,
            tag=tag,
            head_commit_id=None,
            error_message=f"Failed to update repo: {str(e)}",
        )


def delete_repo(
    host_credential_key: str,
    token_credential_key: str,
    repo_id: int,
) -> DeleteRepoResponse:
    """
    Delete a repository.
    
    Deletes the specified Git repository from the workspace. This does not
    delete the remote Git repository, only the workspace link.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        repo_id: Repository ID
        
    Returns:
        DeleteRepoResponse confirming deletion
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.repos.delete(repo_id=repo_id)
    
    return DeleteRepoResponse(repo_id=repo_id)
    except Exception as e:
        return DeleteRepoResponse(
            repo_id=repo_id,
            error_message=f"Failed to delete repo: {str(e)}",
        )


def get_repo_permissions(
    host_credential_key: str,
    token_credential_key: str,
    repo_id: str,
) -> Dict[str, Any]:
    """
    Get repository permissions.
    
    Gets the permissions of a repo. Repos can inherit permissions from their
    root object.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        repo_id: Repository ID (as string)
        
    Returns:
        Dict with permission details
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    permissions = client.repos.get_permissions(repo_id=repo_id)
    
    return permissions.as_dict()
    except Exception as e:
        return {"error": f"Failed to get repo permissions: {str(e)}"}


def set_repo_permissions(
    host_credential_key: str,
    token_credential_key: str,
    repo_id: str,
    access_control_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Set repository permissions.
    
    Sets permissions on a repo, replacing existing permissions if they exist.
    Deletes all direct permissions if none are specified.
    
    Args:
        host_credential_key: Credential key for workspace URL
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
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
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
    except Exception as e:
        return {"error": f"Failed to set repo permissions: {str(e)}"}


def update_repo_permissions(
    host_credential_key: str,
    token_credential_key: str,
    repo_id: str,
    access_control_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Update repository permissions.
    
    Updates the permissions on a repo. Repos can inherit permissions from
    their root object.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        repo_id: Repository ID (as string)
        access_control_list: List of ACL entries to update
        
    Returns:
        Dict with updated permission details
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
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
    except Exception as e:
        return {"error": f"Failed to update repo permissions: {str(e)}"}


def get_repo_permission_levels(
    host_credential_key: str,
    token_credential_key: str,
    repo_id: str,
) -> Dict[str, Any]:
    """
    Get available permission levels.
    
    Gets the permission levels that a user can have on a repo.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        repo_id: Repository ID (as string)
        
    Returns:
        Dict with available permission levels
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    levels = client.repos.get_permission_levels(repo_id=repo_id)
    
    return levels.as_dict()
    except Exception as e:
        return {"error": f"Failed to get repo permission levels: {str(e)}"}

