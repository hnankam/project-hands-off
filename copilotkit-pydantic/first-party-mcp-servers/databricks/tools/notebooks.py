"""Notebook management tools."""

from typing import Any
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.workspace import ExportFormat, Language, ImportFormat
from cache import get_workspace_client


def list_notebooks(host: str, token: str, path: str = "/") -> list[dict[str, Any]]:
    """
    List all notebooks in a workspace directory.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        path: The workspace path to list notebooks from (default: /)
    
    Returns:
        List of notebook objects with path, language, object_type, etc.
    """
    client = get_workspace_client(host, token)
    
    notebooks = []
    for item in client.workspace.list(path):
        # Filter for notebooks only (NOTEBOOK object type)
        item_dict = item.as_dict()
        if item_dict.get('object_type') == 'NOTEBOOK':
            notebooks.append(item_dict)
    
    return notebooks


def get_notebook(host: str, token: str, path: str, format: str = "SOURCE") -> dict[str, Any]:
    """
    Export and retrieve notebook content.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        path: The workspace path to the notebook
        format: Export format - SOURCE, HTML, JUPYTER, or DBC (default: SOURCE)
    
    Returns:
        Dictionary with notebook content and metadata
    """
    client = get_workspace_client(host, token)
    
    # Map string format to ExportFormat enum
    format_map = {
        "SOURCE": ExportFormat.SOURCE,
        "HTML": ExportFormat.HTML,
        "JUPYTER": ExportFormat.JUPYTER,
        "DBC": ExportFormat.DBC,
    }
    
    export_format = format_map.get(format.upper(), ExportFormat.SOURCE)
    
    # Export the notebook
    response = client.workspace.export(path=path, format=export_format)
    
    return response.as_dict()


def import_notebook(
    host: str, 
    token: str, 
    path: str, 
    content: str,
    language: str = "PYTHON",
    format: str = "SOURCE",
    overwrite: bool = False
) -> dict[str, Any]:
    """
    Import a notebook into the workspace.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        path: The workspace path where the notebook should be imported
        content: Base64-encoded notebook content
        language: Notebook language - PYTHON, SCALA, SQL, or R (default: PYTHON)
        format: Import format - SOURCE, HTML, JUPYTER, or DBC (default: SOURCE)
        overwrite: Whether to overwrite existing notebook (default: False)
    
    Returns:
        Dictionary with import result
    """
    client = get_workspace_client(host, token)
    
    # Map string language to Language enum
    language_map = {
        "PYTHON": Language.PYTHON,
        "SCALA": Language.SCALA,
        "SQL": Language.SQL,
        "R": Language.R,
    }
    
    # Map string format to ImportFormat enum
    format_map = {
        "SOURCE": ImportFormat.SOURCE,
        "HTML": ImportFormat.HTML,
        "JUPYTER": ImportFormat.JUPYTER,
        "DBC": ImportFormat.DBC,
        "AUTO": ImportFormat.AUTO,
    }
    
    notebook_language = language_map.get(language.upper(), Language.PYTHON)
    import_format = format_map.get(format.upper(), ImportFormat.SOURCE)
    
    # Import the notebook
    client.workspace.import_(
        path=path,
        content=content,
        language=notebook_language,
        format=import_format,
        overwrite=overwrite
    )
    
    return {
        "path": path,
        "language": language.upper(),
        "format": format.upper(),
        "status": "imported"
    }


def delete_notebook(host: str, token: str, path: str, recursive: bool = False) -> dict[str, Any]:
    """
    Delete a notebook from the workspace.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        path: The workspace path to the notebook to delete
        recursive: Whether to recursively delete (for directories, default: False)
    
    Returns:
        Dictionary with deletion status
    """
    client = get_workspace_client(host, token)
    
    client.workspace.delete(path=path, recursive=recursive)
    
    return {
        "path": path,
        "status": "deleted"
    }


def create_notebook(
    host: str,
    token: str,
    path: str,
    language: str = "PYTHON"
) -> dict[str, Any]:
    """
    Create a new empty notebook in the workspace.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        path: The workspace path where the notebook should be created
        language: Notebook language - PYTHON, SCALA, SQL, or R (default: PYTHON)
    
    Returns:
        Dictionary with creation result
    """
    client = get_workspace_client(host, token)
    
    # Map string language to Language enum
    language_map = {
        "PYTHON": Language.PYTHON,
        "SCALA": Language.SCALA,
        "SQL": Language.SQL,
        "R": Language.R,
    }
    
    notebook_language = language_map.get(language.upper(), Language.PYTHON)
    
    # Create empty notebook by importing empty content
    client.workspace.import_(
        path=path,
        content="",
        language=notebook_language,
        format=ImportFormat.SOURCE,
        overwrite=False
    )
    
    return {
        "path": path,
        "language": language.upper(),
        "status": "created"
    }


def get_notebook_status(host: str, token: str, path: str) -> dict[str, Any]:
    """
    Get the status/metadata of a notebook.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        path: The workspace path to the notebook
    
    Returns:
        Dictionary with notebook metadata
    """
    client = get_workspace_client(host, token)
    
    status = client.workspace.get_status(path=path)
    
    return status.as_dict()

