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
    token: str,
    repo: str,
    path: str,
    ref: Optional[str] = None,
    base_url: str = "https://api.github.com",
) -> GetFileContentResponse:
    """
    Get file content.

    Retrieves the content of a file from a repository.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        path: File path in repository
        ref: Branch/tag/commit to get file from (optional, defaults to default branch)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        GetFileContentResponse with file content

    Example:
        response = get_file_content(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            path="README.md"
        )
        print(response.content)
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    file_content = repo_obj.get_contents(path, ref=ref) if ref else repo_obj.get_contents(path)
    
    # Handle single file (not directory)
    if isinstance(file_content, list):
        raise ValueError(f"Path '{path}' is a directory, not a file")
    
    # Decode content
    content = file_content.decoded_content.decode('utf-8')
    
    return GetFileContentResponse(
        repo_name=repo,
        path=path,
        content=content,
        sha=file_content.sha,
        size=file_content.size,
    )


def create_file(
    token: str,
    repo: str,
    path: str,
    content: str,
    message: str,
    branch: Optional[str] = None,
    base_url: str = "https://api.github.com",
) -> CreateFileResponse:
    """
    Create a file.

    Creates a new file in a repository.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        path: File path in repository
        content: File content (will be base64 encoded)
        message: Commit message
        branch: Branch to create file in (optional, defaults to default branch)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        CreateFileResponse with confirmation

    Example:
        response = create_file(
            token="ghp_xxx",
            repo="myuser/myrepo",
            path="src/new_file.py",
            content="def hello():\n    print('Hello, World!')\n",
            message="Add new file",
            branch="feature/new-feature"
        )
        print(f"File created: {response.commit_sha}")
    """
    client = get_github_client(token, base_url)
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


def update_file(
    token: str,
    repo: str,
    path: str,
    content: str,
    message: str,
    sha: str,
    branch: Optional[str] = None,
    base_url: str = "https://api.github.com",
) -> UpdateFileResponse:
    """
    Update a file.

    Updates an existing file in a repository.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        path: File path in repository
        content: New file content (will be base64 encoded)
        message: Commit message
        sha: Current file SHA (required for update)
        branch: Branch to update file in (optional, defaults to default branch)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        UpdateFileResponse with confirmation

    Example:
        # First get the file to get its SHA
        file_response = get_file_content(
            token="ghp_xxx",
            repo="myuser/myrepo",
            path="src/file.py"
        )
        
        # Then update it
        response = update_file(
            token="ghp_xxx",
            repo="myuser/myrepo",
            path="src/file.py",
            content="def hello():\n    print('Updated!')\n",
            message="Update file",
            sha=file_response.sha
        )
        print(f"File updated: {response.commit_sha}")
    """
    client = get_github_client(token, base_url)
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


def delete_file(
    token: str,
    repo: str,
    path: str,
    message: str,
    sha: str,
    branch: Optional[str] = None,
    base_url: str = "https://api.github.com",
) -> DeleteFileResponse:
    """
    Delete a file.

    Deletes a file from a repository.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        path: File path in repository
        message: Commit message
        sha: Current file SHA (required for deletion)
        branch: Branch to delete file from (optional, defaults to default branch)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        DeleteFileResponse with confirmation

    Example:
        # First get the file to get its SHA
        file_response = get_file_content(
            token="ghp_xxx",
            repo="myuser/myrepo",
            path="src/old_file.py"
        )
        
        # Then delete it
        response = delete_file(
            token="ghp_xxx",
            repo="myuser/myrepo",
            path="src/old_file.py",
            message="Remove old file",
            sha=file_response.sha
        )
        print(response.message)
    """
    client = get_github_client(token, base_url)
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


def get_directory_contents(
    token: str,
    repo: str,
    path: str = "",
    ref: Optional[str] = None,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Get directory contents.

    Lists files and subdirectories in a directory.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        path: Directory path (empty string for root)
        ref: Branch/tag/commit (optional, defaults to default branch)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with directory contents

    Example:
        response = get_directory_contents(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            path="src"
        )
        for item in response['contents']:
            print(f"{item['type']}: {item['name']}")
    """
    client = get_github_client(token, base_url)
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


def search_code(
    token: str,
    query: str,
    repo: Optional[str] = None,
    sort: Optional[str] = None,
    order: str = "desc",
    per_page: int = 30,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Search code.

    Searches for code across repositories or within a specific repository.

    Args:
        token: GitHub Personal Access Token
        query: Search query (e.g., "addClass", "language:python def")
        repo: Repository name in format "owner/repo" (optional, searches all if omitted)
        sort: Sort by ("indexed", optional)
        order: Sort order ("asc" or "desc")
        per_page: Results per page (max 100)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with search results

    Example:
        # Search code in all repositories
        response = search_code(
            token="ghp_xxx",
            query="addClass in:file language:javascript"
        )

        # Search code in specific repository
        response = search_code(
            token="ghp_xxx",
            query="def main",
            repo="octocat/Hello-World"
        )
    """
    client = get_github_client(token, base_url)
    
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

