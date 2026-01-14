"""Notebook management tools."""

import base64
from typing import Any
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.workspace import ExportFormat, Language, ImportFormat
from cache import get_workspace_client
from models import (
    NotebookInfo,
    ListNotebooksResponse,
    NotebookExportResponse,
    NotebookImportResponse,
    NotebookDeleteResponse,
    NotebookCreateResponse,
    NotebookStatusResponse,
)


def list_notebooks(
    host_credential_key: str, 
    token_credential_key: str, 
    path: str = "/",
    recursive: bool = False
) -> ListNotebooksResponse:
    """
    List all notebooks in a workspace directory.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to list notebooks from (default: /)
        recursive: Whether to recursively list notebooks in subdirectories (default: False)
    
    Returns:
        ListNotebooksResponse containing list of notebooks with their metadata
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    notebooks = []
    try:
        # Use the SDK's built-in recursive parameter
        items = client.workspace.list(path, recursive=recursive)
        
        for item in items:
            # Filter for notebooks only
            if item.object_type and item.object_type.value == 'NOTEBOOK':
                item_dict = item.as_dict()
                notebooks.append(NotebookInfo(
                    path=item_dict.get('path'),
                    object_id=item_dict.get('object_id'),
                    resource_id=item_dict.get('resource_id'),
                    object_type=item_dict.get('object_type'),
                    language=item_dict.get('language'),
                    size=item_dict.get('size'),
                    created_at=item_dict.get('created_at'),
                    modified_at=item_dict.get('modified_at')
                ))
    except Exception:
        # Path doesn't exist or no permission
        pass
    
    return ListNotebooksResponse(
        path=path,
        recursive=recursive,
        notebooks=notebooks,
        count=len(notebooks)
    )


def get_notebook(host_credential_key: str, token_credential_key: str, path: str, format: str = "SOURCE") -> NotebookExportResponse:
    """
    Export and retrieve notebook content.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to the notebook
        format: Export format - SOURCE, HTML, JUPYTER, or DBC (default: SOURCE)
    
    Returns:
        NotebookExportResponse with decoded content as string and metadata
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
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
    
    # Extract content (SDK returns base64-encoded content)
    content_encoded = getattr(response, 'content', '')
    if content_encoded is None:
        content_encoded = ''
    
    # Decode base64 content to string
    content_str = ''
    if content_encoded:
        try:
            content_str = base64.b64decode(content_encoded).decode('utf-8')
        except Exception as e:
            # If decoding fails, return the encoded content
            content_str = content_encoded
    
    # Get file type if available
    file_type = getattr(response, 'file_type', None)
    
    return NotebookExportResponse(
        content=content_str,
        path=path,
        format=format.upper(),
        file_type=file_type
    )


def import_notebook(
    host_credential_key: str, 
    token_credential_key: str, 
    path: str, 
    content: str,
    language: str = "PYTHON",
    format: str = "SOURCE",
    overwrite: bool = False
) -> NotebookImportResponse:
    """
    Import a notebook into the workspace.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path where the notebook should be imported
        content: Notebook content as a string (will be base64-encoded internally)
        language: Notebook language - PYTHON, SCALA, SQL, or R (default: PYTHON)
        format: Import format - SOURCE, HTML, JUPYTER, or DBC (default: SOURCE)
        overwrite: Whether to overwrite existing notebook (default: False)
    
    Returns:
        NotebookImportResponse with import status and metadata
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
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
    
    # Encode content to base64 for SDK
    encoded_content = base64.b64encode(content.encode('utf-8')).decode('ascii')
    
    # Import the notebook
    client.workspace.import_(
        path=path,
        content=encoded_content,
        language=notebook_language,
        format=import_format,
        overwrite=overwrite
    )
    
    return NotebookImportResponse(
        path=path,
        language=language.upper(),
        format=format.upper(),
        status="imported",
        overwritten=overwrite
    )


def delete_notebook(host_credential_key: str, token_credential_key: str, path: str, recursive: bool = False) -> NotebookDeleteResponse:
    """
    Delete a notebook from the workspace.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to the notebook to delete
        recursive: Whether to recursively delete (for directories, default: False)
    
    Returns:
        NotebookDeleteResponse with deletion status
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.workspace.delete(path=path, recursive=recursive)
    
    return NotebookDeleteResponse(
        path=path,
        status="deleted",
        recursive=recursive
    )


def create_notebook(
    host_credential_key: str,
    token_credential_key: str,
    path: str,
    language: str = "PYTHON"
) -> NotebookCreateResponse:
    """
    Create a new empty notebook in the workspace.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path where the notebook should be created
        language: Notebook language - PYTHON, SCALA, SQL, or R (default: PYTHON)
    
    Returns:
        NotebookCreateResponse with creation status
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
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
    
    return NotebookCreateResponse(
        path=path,
        language=language.upper(),
        status="created"
    )


def get_notebook_status(host_credential_key: str, token_credential_key: str, path: str) -> NotebookStatusResponse:
    """
    Get the status/metadata of a notebook.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to the notebook
    
    Returns:
        NotebookStatusResponse with notebook metadata
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    status = client.workspace.get_status(path=path)
    status_dict = status.as_dict()
    
    return NotebookStatusResponse(
        path=status_dict.get('path'),
        object_id=status_dict.get('object_id'),
        resource_id=status_dict.get('resource_id'),
        object_type=status_dict.get('object_type'),
        language=status_dict.get('language'),
        size=status_dict.get('size'),
        created_at=status_dict.get('created_at'),
        modified_at=status_dict.get('modified_at')
    )

