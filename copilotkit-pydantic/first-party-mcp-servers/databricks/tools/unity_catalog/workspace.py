"""Workspace file operations."""

from typing import Any
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.workspace import ObjectInfo
from cache import get_workspace_client


def list_workspace_files(host_credential_key: str, token_credential_key: str, path: str = "/") -> list[dict[str, Any]]:
    """
    List files and folders in a workspace path.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: Workspace path to list (default: '/')
    
    Returns:
        List of workspace objects with path, type, language, etc.
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
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

    except Exception as e:
        return [{"error": f"Failed to list workspace files: {str(e)}"}]

