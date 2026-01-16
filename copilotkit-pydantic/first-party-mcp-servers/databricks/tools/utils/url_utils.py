"""URL utilities for resolving Databricks notebook URLs to workspace paths."""

import re
from urllib.parse import urlparse, unquote
from cache import get_workspace_client
from models import NotebookPathInfo


def resolve_notebook_from_url(host_credential_key: str, token_credential_key: str, url: str) -> NotebookPathInfo:
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
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        url: Databricks notebook URL (any format)
    
    Returns:
        NotebookPathInfo with resolved path and metadata
    
    
        URL: https://adb-xxx.azuredatabricks.net/editor/notebooks/1191853414493128
        Returns: NotebookPathInfo with path="/Workspace/Users/user@company.com/General"
    """
    try:
        client = get_workspace_client(host_credential_key, token_credential_key)
        
        # Try to extract notebook ID from URL (modern format)
        notebook_id = _extract_notebook_id_from_url(url)
        
        if notebook_id:
            # ID-based URL - search workspace directly without collecting all notebooks first
            # Databricks doesn't support direct ID->path lookup
            import logging
            logger = logging.getLogger(__name__)
            
            logger.info(f"Searching workspace for notebook ID: {notebook_id}")
            
            # Try multiple root paths in order of likelihood
            search_paths = [
                "/Users",          # User directories
                "/Workspace",      # Modern workspace root
                "/",               # Legacy root
            ]
            
            notebooks_checked = 0
            
            for search_root in search_paths:
                logger.info(f"Searching from root: {search_root}")
                
                try:
                    # Iterate directly through workspace items without collecting them all first
                    items = client.workspace.list(search_root, recursive=True)
                    
                    for item in items:
                        # Filter for notebooks only
                        if item.object_type and item.object_type.value == 'NOTEBOOK':
                            notebooks_checked += 1
                            
                            # Check if this is the notebook we're looking for
                            obj_id = str(item.object_id) if item.object_id else ''
                            res_id = str(item.resource_id) if item.resource_id else ''
                            
                            # Log progress every 100 notebooks
                            if notebooks_checked % 100 == 0:
                                logger.info(f"Checked {notebooks_checked} notebooks so far...")
                            
                            if obj_id == notebook_id or res_id == notebook_id:
                                logger.info(f"✓ Found notebook {notebook_id} at {item.path} (checked {notebooks_checked} notebooks)")
                                item_dict = item.as_dict()
                                return NotebookPathInfo(
                                    url=url,
                                    notebook_id=notebook_id,
                                    path=item_dict.get('path'),
                                    object_type=item_dict.get('object_type'),
                                    language=item_dict.get('language'),
                                    created_at=item_dict.get('created_at'),
                                    modified_at=item_dict.get('modified_at')
                                )
                
                except Exception as e:
                    # Path might not exist or no permission, try next path
                    logger.warning(f"Could not search {search_root}: {str(e)}")
                    continue
            
            # Not found after searching all roots
            logger.error(f"Notebook {notebook_id} not found after checking {notebooks_checked} notebooks in {len(search_paths)} root paths")
            return NotebookPathInfo(
                url=url,
                notebook_id=notebook_id,
                path=None,
                error_message=(
                f"Could not find notebook with ID {notebook_id} in workspace. "
                f"Searched {notebooks_checked} notebooks across roots: {', '.join(search_paths)}. "
                "The notebook may be in a restricted folder or may not exist."
            )
            )
        
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
                    return NotebookPathInfo(
                        url=url,
                        notebook_id=None,
                        path=None,
                        error_message=f"Could not find notebook at path {path}: {str(e)}"
                    )
        
        # Could not extract ID or path
            return NotebookPathInfo(
                url=url,
                notebook_id=None,
                path=None,
                error_message=(
            f"Could not extract notebook ID or path from URL: {url}. "
            "Supported formats: /editor/notebooks/{{id}}, /explore/data/{{id}}, #workspace/path"
                )
            )
    except Exception as e:
        return NotebookPathInfo(
            url=url,
            notebook_id=None,
            path=None,
            error_message=f"Failed to resolve notebook from URL: {str(e)}"
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

