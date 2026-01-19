"""GitHub File Operations.

This module provides tools for file operations:
- Get, create, update, delete files
- Get directory contents
"""

from typing import Any, Optional, List, Dict
import sys
from pathlib import Path
import base64

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_github_client
from models import (
    GetFileContentResponse,
    CreateFileResponse,
    UpdateFileResponse,
    DeleteFileResponse,
)


def get_file_content(
    token_credential_key: str,
    repo: str,
    path: str,
    base_url_credential_key: str = "",
    ref: Optional[str] = None,
) -> GetFileContentResponse:
    """
    Get the content of a file from a repository.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        path: File path in repository
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        ref: Branch/tag/commit to get file from (optional, defaults to default branch)

    Returns:
        GetFileContentResponse with file content, SHA, and size
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        file_content = repo_obj.get_contents(path, ref=ref) if ref else repo_obj.get_contents(path)
        
        # Handle single file (not directory)
        if isinstance(file_content, list):
            return GetFileContentResponse(
                repo_name=repo,
                path=path,
                content=None,
                sha=None,
                size=0,
                error_message=f"Path '{path}' is a directory, not a file",
            )
        
        # Decode content
        content = file_content.decoded_content.decode('utf-8')
        
        return GetFileContentResponse(
            repo_name=repo,
            path=path,
            content=content,
            sha=file_content.sha,
            size=file_content.size,
        )
    except Exception as e:
        return GetFileContentResponse(
            repo_name=repo,
            path=path,
            content=None,
            sha=None,
            size=0,
            error_message=f"Failed to get file content: {str(e)}",
        )


def create_file(
    token_credential_key: str,
    repo: str,
    path: str,
    content: str,
    message: str,
    base_url_credential_key: str = "",
    branch: Optional[str] = None,
) -> CreateFileResponse:
    """
    Create a new file in a repository.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        path: File path in repository
        content: File content (will be base64 encoded)
        message: Commit message
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        branch: Branch to create file in (optional, defaults to default branch)

    Returns:
        CreateFileResponse with confirmation and commit SHA
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        result = repo_obj.create_file(
            path=path,
            message=message,
            content=content,
            branch=branch,
        )
        
        return CreateFileResponse(
            repo_name=repo,
            path=path,
            commit_sha=result['commit'].sha,
            message=f"Successfully created file {path}"
        )
    except Exception as e:
        return CreateFileResponse(
            repo_name=repo,
            path=path,
            commit_sha=None,
            message=None,
            error_message=f"Failed to create file {path}: {str(e)}",
        )


def update_file(
    token_credential_key: str,
    repo: str,
    path: str,
    content: str,
    message: str,
    sha: str,
    base_url_credential_key: str = "",
    branch: Optional[str] = None,
) -> UpdateFileResponse:
    """
    Update an existing file in a repository.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        path: File path in repository
        content: New file content (will be base64 encoded)
        message: Commit message
        sha: Current file SHA (required for update)
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        branch: Branch to update file in (optional, defaults to default branch)

    Returns:
        UpdateFileResponse with confirmation and commit SHA
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        result = repo_obj.update_file(
            path=path,
            message=message,
            content=content,
            sha=sha,
            branch=branch,
        )
        
        return UpdateFileResponse(
            repo_name=repo,
            path=path,
            commit_sha=result['commit'].sha,
            message=f"Successfully updated file {path}"
        )
    except Exception as e:
        return UpdateFileResponse(
            repo_name=repo,
            path=path,
            commit_sha=None,
            message=None,
            error_message=f"Failed to update file {path}: {str(e)}",
        )


def delete_file(
    token_credential_key: str,
    repo: str,
    path: str,
    message: str,
    sha: str,
    base_url_credential_key: str = "",
    branch: Optional[str] = None,
) -> DeleteFileResponse:
    """
    Delete a file from a repository.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        path: File path in repository
        message: Commit message
        sha: Current file SHA (required for deletion)
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        branch: Branch to delete file from (optional, defaults to default branch)

    Returns:
        DeleteFileResponse with confirmation and commit SHA
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        result = repo_obj.delete_file(
            path=path,
            message=message,
            sha=sha,
            branch=branch,
        )
        
        return DeleteFileResponse(
            repo_name=repo,
            path=path,
            commit_sha=result['commit'].sha,
            message=f"Successfully deleted file {path}"
        )
    except Exception as e:
        return DeleteFileResponse(
            repo_name=repo,
            path=path,
            commit_sha=None,
            message=None,
            error_message=f"Failed to delete file {path}: {str(e)}",
        )


def get_directory_contents(
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
    path: str = "",
    ref: Optional[str] = None,
) -> Dict[str, Any]:
    """
    List files and subdirectories in a directory.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        path: Directory path (empty string for root)
        ref: Branch/tag/commit (optional, defaults to default branch)

    Returns:
        Dictionary with directory contents (items list and total count)
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        
        contents = repo_obj.get_contents(path, ref=ref) if ref else repo_obj.get_contents(path)
        
        # Handle both single file and directory
        if not isinstance(contents, list):
            contents = [contents]
        
        items = []
        for item in contents:
            items.append({
                "name": item.name,
                "path": item.path,
                "type": item.type,  # "file" or "dir"
                "size": item.size,
                "sha": item.sha,
                "url": item.html_url,
            })
        
        return {
            "repo": repo,
            "path": path,
            "contents": items,
            "total": len(items)
        }
    except Exception as e:
        return {
            "repo": repo,
            "path": path,
            "contents": [],
            "total": 0,
            "error": f"Failed to get directory contents: {str(e)}"
        }


def search_code(
    token_credential_key: str,
    query: str,
    base_url_credential_key: str = "",
    repo: Optional[str] = None,
    sort: Optional[str] = None,
    order: str = "desc",
    per_page: int = 30,
) -> Dict[str, Any]:
    """
    Search for code across repositories or within a specific repository.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        query: Search query (e.g., "addClass", "language:python def")
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        repo: Repository name in format "owner/repo" (optional, searches all if omitted)
        sort: Sort by ("indexed", optional)
        order: Sort order ("asc" or "desc", default: "desc")
        per_page: Results per page (max 100, default: 30)

    Returns:
        Dictionary with search results (results list and total count)
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        
        # Add repo to query if specified
        full_query = query
        if repo:
            full_query = f"{query} repo:{repo}"
        
        code_results = client.search_code(query=full_query, sort=sort, order=order)
        
        results = []
        for code in list(code_results)[:per_page]:
            results.append({
                "name": code.name,
                "path": code.path,
                "repository": code.repository.full_name if code.repository else None,
                "sha": code.sha,
                "url": code.html_url,
            })
        
        return {
            "query": query,
            "repo": repo,
            "results": results,
            "total": len(results)
        }
    except Exception as e:
        return {
            "query": query,
            "repo": repo,
            "results": [],
            "total": 0,
            "error": f"Failed to search code: {str(e)}"
        }

