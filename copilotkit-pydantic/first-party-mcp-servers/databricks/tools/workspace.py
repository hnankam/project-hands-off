"""Workspace file operations."""

from typing import Any
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.workspace import ObjectInfo
from cache import get_workspace_client


def list_workspace_files(host: str, token: str, path: str = "/") -> list[dict[str, Any]]:
    """
    List files and folders in a workspace path.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        path: Workspace path to list (default: '/')
    
    Returns:
        List of workspace objects with path, type, language, etc.
    """
    client = get_workspace_client(host, token)
    
    files = []
    for item in client.workspace.list(path):
        file_dict = {}
        
        # Add string attributes
        for attr in ['path', 'created_at', 'modified_at', 'size']:
            if hasattr(item, attr):
                file_dict[attr] = getattr(item, attr)
        
        # Handle enum attributes (convert to string)
        for attr in ['object_type', 'language']:
            if hasattr(item, attr):
                value = getattr(item, attr)
                file_dict[attr] = str(value) if value else None
        
        files.append(file_dict)
    return files

