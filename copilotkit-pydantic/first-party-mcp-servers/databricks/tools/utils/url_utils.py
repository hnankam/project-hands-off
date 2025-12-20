"""URL utilities for resolving Databricks notebook URLs to workspace paths."""

import re
from urllib.parse import urlparse, unquote
from cache import get_workspace_client
from models import NotebookPathInfo


def resolve_notebook_from_url(host: str, token: str, url: str) -> NotebookPathInfo:
    """
    Resolve notebook workspace path from a Databricks URL.
    
    Handles modern Databricks URL formats:
    - https://.../editor/notebooks/{id}
    - https://.../explore/data/{id}
    - Legacy: https://.../#workspace/path/to/notebook
    
    Note: ID-based URLs require recursively searching the entire workspace to find the 
    notebook path by matching object_id/resource_id. This may take 5-30 seconds for 
    large workspaces (uses SDK's built-in recursive listing).
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        url: Databricks notebook URL (any format)
    
    Returns:
        NotebookPathInfo with resolved path and metadata
    
    Examples:
        URL: https://adb-xxx.azuredatabricks.net/editor/notebooks/1191853414493128
        Returns: NotebookPathInfo with path="/Workspace/Users/user@company.com/General"
    """
    client = get_workspace_client(host, token)
    
    # Try to extract notebook ID from URL (modern format)
    notebook_id = _extract_notebook_id_from_url(url)
    
    if notebook_id:
        # ID-based URL - use list_notebooks with recursive search
        # Databricks doesn't support direct ID->path lookup
        import logging
        logger = logging.getLogger(__name__)
        
        # Import here to avoid circular dependency
        from .notebooks import list_notebooks
        
        logger.info(f"Searching workspace for notebook ID: {notebook_id}")
        
        try:
            # Search entire workspace recursively from root
            logger.info(f"Searching workspace recursively for notebook ID: {notebook_id}")
            
            # List all notebooks recursively from root using SDK's built-in recursive listing
            response = list_notebooks(host, token, path="/", recursive=True)
            
            # Find notebook with matching object_id or resource_id
            for notebook in response.notebooks:
                obj_id = str(notebook.object_id) if notebook.object_id else ''
                res_id = str(notebook.resource_id) if notebook.resource_id else ''
                
                if obj_id == notebook_id or res_id == notebook_id:
                    logger.info(f"✓ Found notebook {notebook_id} at {notebook.path}")
                    return NotebookPathInfo(
                        url=url,
                        notebook_id=notebook_id,
                        path=notebook.path,
                        object_type=notebook.object_type,
                        language=notebook.language,
                        created_at=notebook.created_at,
                        modified_at=notebook.modified_at
                    )
            
            # Not found
            logger.error(f"Notebook {notebook_id} not found in workspace")
            raise ValueError(
                f"Could not find notebook with ID {notebook_id} in workspace. "
                "Searched entire workspace recursively. The notebook may be in a "
                "restricted folder or may not exist."
            )
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Error searching for notebook ID {notebook_id}: {str(e)}")
    
    # Try to extract path from URL (legacy format)
    path = _extract_notebook_path_from_url(url)
    
    if path:
        # Path-based URL - verify it exists
        try:
            status = client.workspace.get_status(path=path)
            
            return NotebookPathInfo(
                url=url,
                notebook_id=None,
                path=path,
                object_type=str(status.object_type) if status.object_type else None,
                language=str(status.language) if status.language else None,
                created_at=status.created_at,
                modified_at=status.modified_at
            )
        except Exception as e:
            raise ValueError(f"Could not find notebook at path {path}: {str(e)}")
    
    # Could not extract ID or path
    raise ValueError(
        f"Could not extract notebook ID or path from URL: {url}. "
        "Supported formats: /editor/notebooks/{{id}}, /explore/data/{{id}}, #workspace/path"
    )


# Helper functions

def _extract_notebook_id_from_url(url: str) -> str | None:
    """
    Extract notebook ID from modern Databricks URLs.
    
    Patterns:
    - /editor/notebooks/1191853414493128
    - /explore/data/1191853414493128
    - /notebooks/1191853414493128
    """
    # Pattern 1: /editor/notebooks/{id}
    match = re.search(r'/editor/notebooks/(\d+)', url)
    if match:
        return match.group(1)
    
    # Pattern 2: /explore/data/{id}
    match = re.search(r'/explore/data/(\d+)', url)
    if match:
        return match.group(1)
    
    # Pattern 3: /notebooks/{id}
    match = re.search(r'/notebooks/(\d+)', url)
    if match:
        return match.group(1)
    
    # Pattern 4: #notebook/{id} (legacy)
    match = re.search(r'#notebook/(\d+)', url)
    if match:
        return match.group(1)
    
    return None


def _extract_notebook_path_from_url(url: str) -> str | None:
    """
    Extract workspace path from legacy Databricks URLs.
    
    Pattern: #workspace/Users/user@company.com/notebook
    """
    parsed = urlparse(url)
    fragment = parsed.fragment
    
    # Pattern: #workspace/path/to/notebook
    if fragment.startswith('workspace/'):
        path = '/' + fragment.replace('workspace/', '')
        return unquote(path)
    
    return None

