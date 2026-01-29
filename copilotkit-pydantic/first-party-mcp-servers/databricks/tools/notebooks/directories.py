"""Directory management tools for Databricks workspace."""

import re
from typing import Any, Dict, List
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.workspace import ObjectType
from cache import get_workspace_client
from models import (
    DirectoryInfo,
    ListDirectoriesResponse,
    DirectoryCreateResponse,
    DirectoryDeleteResponse,
    DirectoryInfoResponse,
    DirectoryTreeNode,
    DirectoryTreeResponse,
    LanguageBreakdown,
    DirectoryStatsResponse,
    DirectorySearchResult,
    DirectorySearchResponse,
)


# ============================================================================
# Phase 1: Essential Directory Operations
# ============================================================================

def list_directories(
    host_credential_key: str,
    token_credential_key: str,
    path: str = "/",
    limit: int = 25,
    page: int = 0,
) -> ListDirectoriesResponse:
    """
    Retrieve a paginated list of workspace items at a given path (non-recursive).
    
    Returns all items (directories, notebooks, files, etc.) at the current level only.
    For recursive traversal, the agent should call this function for each subdirectory.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        path: The workspace path to list from. Default: / (root)
        limit: Number of items to return in a single request. Must be positive integer. Default: 25
        page: Zero-indexed page number for pagination. Default: 0
    
    Returns:
        ListDirectoriesResponse containing:
        - items: List of DirectoryInfo objects with workspace item metadata
        - count: Integer number of items returned in this page (0 to limit)
        - has_more: Boolean indicating if additional items exist beyond this page
        
    Pagination:
        - Returns up to `limit` items per call
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available
    """
    from itertools import islice
    
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        items_list = []
        has_more = False
    
        # List only immediate children (no recursive flag)
        items = client.workspace.list(path)
    
        # Calculate pagination
        skip = page * limit
        collected = 0
        skipped = 0
    
        for item in items:
            # Include all items (directories, notebooks, files, etc.)
            if not item.object_type:
                continue
            
            # Skip items for previous pages
            if skipped < skip:
                skipped += 1
                continue
        
            # Check if we've collected enough
            if collected >= limit:
                has_more = True
                break
        
            item_type = item.object_type.value
            language = item.language.value if item.language else None
        
            items_list.append(DirectoryInfo(
                path=item.path,
                object_type=item_type,
                object_id=item.object_id,
                resource_id=item.resource_id,
                language=language,
                size=item.size,
                created_at=item.created_at,
                modified_at=item.modified_at
            ))
            collected += 1

        return ListDirectoriesResponse(
            path=path,
            recursive=False,
            items=items_list,
            count=len(items_list),
            has_more=has_more,
        )

    except Exception as e:
        return ListDirectoriesResponse(
            path=path,
            recursive=False,
            items=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list directories: {str(e)}",
        )


def create_directory(
    host_credential_key: str,
    token_credential_key: str,
    path: str
) -> DirectoryCreateResponse:
    """
    Create a new directory in the workspace.
    Automatically creates parent directories if they don't exist.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path where directory should be created
    
    Returns:
        DirectoryCreateResponse indicating success
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # mkdirs automatically creates parent directories
        client.workspace.mkdirs(path=path)
    
        return DirectoryCreateResponse(
            path=path,
            status=f"Directory '{path}' created successfully"
        )

    except Exception as e:
        return DirectoryCreateResponse(
            path=None,
            status="failed",
            error_message=f"Failed to create directory: {str(e)}",
        )


def delete_directory(
    host_credential_key: str,
    token_credential_key: str,
    path: str,
    recursive: bool = False
) -> DirectoryDeleteResponse:
    """
    Delete a directory from the workspace.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to delete
        recursive: If true, delete all contents recursively (default: False)
    
    Returns:
        DirectoryDeleteResponse indicating success
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.workspace.delete(path=path, recursive=recursive)
    
        return DirectoryDeleteResponse(
            path=path,
            recursive=recursive,
            status=f"Directory '{path}' deleted successfully"
        )

    except Exception as e:
        return DirectoryDeleteResponse(
            path=None,
            recursive=recursive,
            status="failed",
            error_message=f"Failed to delete directory: {str(e)}",
        )


def get_directory_info(
    host_credential_key: str,
    token_credential_key: str,
    path: str
) -> DirectoryInfoResponse:
    """
    Get metadata about a directory.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to get info for
    
    Returns:
        DirectoryInfoResponse with directory metadata
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        status = client.workspace.get_status(path=path)
        status_dict = status.as_dict()
    
        return DirectoryInfoResponse(
            path=status_dict.get('path'),
            object_id=status_dict.get('object_id'),
            resource_id=status_dict.get('resource_id'),
            object_type=status_dict.get('object_type', 'DIRECTORY'),
            created_at=status_dict.get('created_at'),
            modified_at=status_dict.get('modified_at')
        )

    except Exception as e:
        return DirectoryInfoResponse(
            path=None,
            object_id=None,
            resource_id=None,
            object_type=None,
            created_at=None,
            modified_at=None,
            error_message=f"Failed to get directory info: {str(e)}",
        )


# ============================================================================
# Phase 2: Enhanced Directory Operations
# ============================================================================

def get_directory_tree(
    host_credential_key: str,
    token_credential_key: str,
    path: str = "/",
    max_depth: int = 3
) -> DirectoryTreeResponse:
    """
    Get hierarchical tree structure of a directory.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The root path to build tree from (default: /)
        max_depth: Maximum depth to traverse (default: 3)
    
    Returns:
        DirectoryTreeResponse with nested tree structure
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        def build_tree(current_path: str, current_depth: int) -> DirectoryTreeNode:
            """Recursively build directory tree."""
            # Get the name from the path
            name = current_path.split('/')[-1] or "root"
        
            # Create node for current directory
            node = DirectoryTreeNode(
                name=name,
                path=current_path,
                type="DIRECTORY",
                children=[]
            )
        
            # Stop if max depth reached
            if current_depth >= max_depth:
                return node
        
            # List contents
            try:
                items = client.workspace.list(current_path, recursive=False)
            
                for item in items:
                    if item.object_type:
                        item_type = item.object_type.value
                        item_name = item.path.split('/')[-1]
                    
                        if item_type == 'DIRECTORY':
                            # Recursively build subtree
                            child_node = build_tree(item.path, current_depth + 1)
                            node.children.append(child_node)
                        else:
                            # Add leaf node (notebook or file)
                            leaf = DirectoryTreeNode(
                                name=item_name,
                                path=item.path,
                                type=item_type,
                                children=None
                            )
                            node.children.append(leaf)
            except Exception:
                # No permission or doesn't exist
                pass
        
            return node
    
        tree = build_tree(path, 0)
    
        return DirectoryTreeResponse(
            path=path,
            max_depth=max_depth,
            tree=tree
        )

    except Exception as e:
        return DirectoryTreeResponse(
            path=path,
            max_depth=max_depth,
            tree=None,
            error_message=f"Failed to get directory tree: {str(e)}",
        )


def get_directory_stats(
    host_credential_key: str,
    token_credential_key: str,
    path: str = "/"
) -> DirectoryStatsResponse:
    """
    Get statistics about a directory at the current level (non-recursive).
    
    Counts items only at the immediate level. For recursive statistics,
    the agent should aggregate results from multiple calls.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to analyze (default: /)
    
    Returns:
        DirectoryStatsResponse with counts and breakdowns for current level
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        total_notebooks = 0
        total_directories = 0
        total_files = 0
        total_size = 0
        language_counts = {
            'PYTHON': 0,
            'SQL': 0,
            'SCALA': 0,
            'R': 0
        }

        # List only immediate children (no recursive flag)
        items = client.workspace.list(path)
    
        for item in items:
            if not item.object_type:
                continue
            
            item_type = item.object_type.value
        
            if item_type == 'NOTEBOOK':
                total_notebooks += 1
                if item.language:
                    lang = item.language.value
                    if lang in language_counts:
                        language_counts[lang] += 1
            elif item_type == 'DIRECTORY':
                total_directories += 1
            elif item_type in ['FILE', 'LIBRARY', 'REPO', 'DASHBOARD']:
                total_files += 1
        
            # Add size if available
            if item.size:
                total_size += item.size
    
        return DirectoryStatsResponse(
            path=path,
            recursive=False,
            total_notebooks=total_notebooks,
            total_directories=total_directories,
            total_files=total_files,
            language_breakdown=LanguageBreakdown(**language_counts),
            total_size_bytes=total_size
        )

    except Exception as e:
        return DirectoryStatsResponse(
            path=path,
            recursive=False,
            total_notebooks=0,
            total_directories=0,
            total_files=0,
            language_breakdown=LanguageBreakdown(),
            total_size_bytes=0,
            error_message=f"Failed to get directory stats: {str(e)}",
        )


def search_directories(
    host_credential_key: str,
    token_credential_key: str,
    path: str = "/",
    pattern: str = ".*",
    case_sensitive: bool = False
) -> DirectorySearchResponse:
    """
    Search for directories matching a pattern at the current level (non-recursive).
    
    For recursive search, the agent should call this function for each subdirectory.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The path to search in (default: /)
        pattern: Regex pattern to match directory names (default: .*)
        case_sensitive: Whether search is case-sensitive (default: False)
    
    Returns:
        DirectorySearchResponse with matching directories at current level
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Compile regex pattern
        flags = 0 if case_sensitive else re.IGNORECASE
        try:
            regex = re.compile(pattern, flags)

        except re.error:
            # If pattern is not valid regex, escape it and search as literal
            regex = re.compile(re.escape(pattern), flags)
        
        results = []
        
            # List only immediate children (no recursive flag)
        items = client.workspace.list(path)
        
        for item in items:
            # Filter for directories only
            if not item.object_type:
                continue
                
            item_type = item.object_type.value
            
            if item_type == 'DIRECTORY':
                # Get directory name
                dir_name = item.path.split('/')[-1]
                
                # Check if name matches pattern
                if regex.search(dir_name):
                    results.append(DirectorySearchResult(
                        path=item.path,
                        name=dir_name,
                        object_id=item.object_id,
                        created_at=item.created_at,
                        modified_at=item.modified_at
                    ))
        
        return DirectorySearchResponse(
            path=path,
            pattern=pattern,
            recursive=False,
            results=results,
            total_matches=len(results)
        )
    except Exception as e:
        return DirectorySearchResponse(
            path=path,
            pattern=pattern,
            recursive=False,
            results=[],
            total_matches=0,
            error_message=f"Failed to search directories: {str(e)}",
        )

