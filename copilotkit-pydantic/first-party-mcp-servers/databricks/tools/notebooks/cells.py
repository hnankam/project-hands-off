"""Notebook cell-level operations.

These tools enable fine-grained manipulation of individual notebook cells
by exporting notebooks in JUPYTER format, parsing the JSON structure,
modifying the cells array, and re-importing the modified notebook.
"""

import base64
import json
import re
from typing import Any, Optional
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.workspace import ExportFormat, ImportFormat, Language
from cache import get_workspace_client
from models import (
    NotebookCell,
    NotebookCellsResponse,
    CellSearchResult,
    CellSearchResponse,
    CellOperationResponse,
)


def get_notebook_cells(host_credential_key: str, token_credential_key: str, path: str) -> NotebookCellsResponse:
    """
    Get all cells from a notebook.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to the notebook
    
    Returns:
        NotebookCellsResponse with all cells and metadata
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Export notebook as JUPYTER format
    response = client.workspace.export(path=path, format=ExportFormat.JUPYTER)
    
    # Decode and parse JSON
    content_encoded = getattr(response, 'content', '')
    content_str = base64.b64decode(content_encoded).decode('utf-8')
    notebook_data = json.loads(content_str)
    
    # Extract cells
    cells = notebook_data.get('cells', [])
    notebook_metadata = notebook_data.get('metadata', {})
    
    # Convert to Pydantic models
    cell_models = []
    for index, cell in enumerate(cells):
        # Normalize source to string (Jupyter stores as array of lines)
        source = cell.get('source', [])
        if isinstance(source, list):
            source = "".join(source)
        
        # Normalize outputs (text fields are also stored as arrays)
        outputs = _normalize_outputs(cell.get('outputs', []))
        
        cell_model = NotebookCell(
            index=index,
            cell_type=cell.get('cell_type', 'code'),
            source=source,
            metadata=cell.get('metadata', {}),
            outputs=outputs,
            execution_count=cell.get('execution_count'),
            language=_extract_cell_language(cell)
        )
        cell_models.append(cell_model)
    
    return NotebookCellsResponse(
        path=path,
        cells=cell_models,
        total_cells=len(cell_models),
        notebook_metadata=notebook_metadata
    )
    except Exception as e:
        return NotebookCellsResponse(
            path=path,
            cells=[],
            total_cells=0,
            notebook_metadata={},
            error_message=f"Failed to get notebook cells: {str(e)}",
        )


def get_notebook_cell(host_credential_key: str, token_credential_key: str, path: str, cell_index: int) -> Optional[NotebookCell]:
    """
    Get a specific cell from a notebook by index.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to the notebook
        cell_index: Index of the cell to retrieve (0-based)
    
    Returns:
        NotebookCell at the specified index, or None on error
    """
    try:
    cells_response = get_notebook_cells(host_credential_key, token_credential_key, path)
    
        if cells_response.error_message:
            return None
        
    if cell_index < 0 or cell_index >= len(cells_response.cells):
            return None
    
    return cells_response.cells[cell_index]
    except Exception as e:
        return None


def search_notebook_cells(
    host_credential_key: str,
    token_credential_key: str,
    path: str,
    pattern: str,
    cell_type: str | None = None,
    case_sensitive: bool = False
) -> CellSearchResponse:
    """
    Search for cells containing a specific pattern.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to the notebook
        pattern: Text or regex pattern to search for
        cell_type: Filter by cell type (code, markdown, raw) - optional
        case_sensitive: Whether search should be case-sensitive (default: False)
    
    Returns:
        CellSearchResponse with matching cells and search metadata
    """
    try:
    cells_response = get_notebook_cells(host_credential_key, token_credential_key, path)
        
        if cells_response.error_message:
            return CellSearchResponse(
                path=path,
                pattern=pattern,
                cell_type=cell_type,
                case_sensitive=case_sensitive,
                results=[],
                total_matches=0,
                error_message=cells_response.error_message,
            )
        
    results = []
    
    # Compile regex pattern
    flags = 0 if case_sensitive else re.IGNORECASE
    try:
        regex = re.compile(pattern, flags)
    except re.error:
        # If pattern is not valid regex, escape it and search as literal
        regex = re.compile(re.escape(pattern), flags)
    
    for cell in cells_response.cells:
        # Filter by cell type if specified
        if cell_type and cell.cell_type != cell_type:
            continue
        
        # Get cell content as string
        content = cell.source_text
        
        # Find all matches
        matches = regex.findall(content)
        
        if matches:
            result = CellSearchResult(
                cell_index=cell.index,
                cell_type=cell.cell_type,
                match_count=len(matches),
                matches=list(set(matches)),  # All unique matches
                source=content  # Return full cell content
            )
            results.append(result)
    
    return CellSearchResponse(
        path=path,
        pattern=pattern,
        cell_type=cell_type,
        case_sensitive=case_sensitive,
        results=results,
        total_matches=len(results)
    )
    except Exception as e:
        return CellSearchResponse(
            path=path,
            pattern=pattern,
            cell_type=cell_type,
            case_sensitive=case_sensitive,
            results=[],
            total_matches=0,
            error_message=f"Failed to search notebook cells: {str(e)}",
        )


def insert_notebook_cell(
    host_credential_key: str,
    token_credential_key: str,
    path: str,
    cell_index: int,
    cell_content: str,
    cell_type: str = "code",
    language: str | None = None
) -> CellOperationResponse:
    """
    Insert a new cell at the specified position.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to the notebook
        cell_index: Index where the cell should be inserted (0-based)
        cell_content: Content of the new cell
        cell_type: Type of cell (code, markdown, raw) - default: code
        language: Programming language for code cells (python, scala, sql, r)
    
    Returns:
        CellOperationResponse with operation status
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Export notebook
    response = client.workspace.export(path=path, format=ExportFormat.JUPYTER)
    content_encoded = getattr(response, 'content', '')
    content_str = base64.b64decode(content_encoded).decode('utf-8')
    notebook_data = json.loads(content_str)
    
    # Create new cell (convert string to array for Jupyter format)
    source_array = cell_content.splitlines(keepends=True) if isinstance(cell_content, str) else cell_content
    
    new_cell = {
        "cell_type": cell_type,
        "metadata": {},
        "source": source_array
    }
    
    if cell_type == "code":
        new_cell["outputs"] = []
        new_cell["execution_count"] = None
        if language:
            # Add language metadata
            new_cell["metadata"]["language"] = language
    
    # Insert cell at specified index
    cells = notebook_data.get('cells', [])
    if cell_index < 0 or cell_index > len(cells):
            return CellOperationResponse(
                path=path,
                operation="insert",
                cell_index=cell_index,
                status="failed",
                total_cells=len(cells),
                error_message=f"Insert index {cell_index} out of range (0-{len(cells)})",
            )
    
    cells.insert(cell_index, new_cell)
    notebook_data['cells'] = cells
    
    # Serialize and encode
    modified_content = json.dumps(notebook_data, indent=2)
    encoded_content = base64.b64encode(modified_content.encode('utf-8')).decode('ascii')
    
    # Import modified notebook
    client.workspace.import_(
        path=path,
        content=encoded_content,
        format=ImportFormat.JUPYTER,
        overwrite=True
    )
    
    return CellOperationResponse(
        path=path,
        operation="insert",
        cell_index=cell_index,
        status="success",
        total_cells=len(cells)
    )
    except Exception as e:
        return CellOperationResponse(
            path=path,
            operation="insert",
            cell_index=cell_index,
            status="failed",
            total_cells=0,
            error_message=f"Failed to insert notebook cell: {str(e)}",
        )


def update_notebook_cell(
    host_credential_key: str,
    token_credential_key: str,
    path: str,
    cell_index: int,
    cell_content: str
) -> CellOperationResponse:
    """
    Update the content of an existing cell.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to the notebook
        cell_index: Index of the cell to update (0-based)
        cell_content: New content for the cell
    
    Returns:
        CellOperationResponse with operation status
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Export notebook
    response = client.workspace.export(path=path, format=ExportFormat.JUPYTER)
    content_encoded = getattr(response, 'content', '')
    content_str = base64.b64decode(content_encoded).decode('utf-8')
    notebook_data = json.loads(content_str)
    
    # Update cell (convert string to array for Jupyter format)
    cells = notebook_data.get('cells', [])
    if cell_index < 0 or cell_index >= len(cells):
            return CellOperationResponse(
                path=path,
                operation="update",
                cell_index=cell_index,
                status="failed",
                total_cells=len(cells),
                error_message=f"Cell index {cell_index} out of range (0-{len(cells)-1})",
            )
    
    source_array = cell_content.splitlines(keepends=True) if isinstance(cell_content, str) else cell_content
    cells[cell_index]['source'] = source_array
    
    # Clear outputs for code cells when content is updated
    if cells[cell_index].get('cell_type') == 'code':
        cells[cell_index]['outputs'] = []
        cells[cell_index]['execution_count'] = None
    
    notebook_data['cells'] = cells
    
    # Serialize and encode
    modified_content = json.dumps(notebook_data, indent=2)
    encoded_content = base64.b64encode(modified_content.encode('utf-8')).decode('ascii')
    
    # Import modified notebook
    client.workspace.import_(
        path=path,
        content=encoded_content,
        format=ImportFormat.JUPYTER,
        overwrite=True
    )
    
    return CellOperationResponse(
        path=path,
        operation="update",
        cell_index=cell_index,
        status="success",
        total_cells=len(cells)
    )
    except Exception as e:
        return CellOperationResponse(
            path=path,
            operation="update",
            cell_index=cell_index,
            status="failed",
            total_cells=0,
            error_message=f"Failed to update notebook cell: {str(e)}",
        )


def delete_notebook_cell(
    host_credential_key: str,
    token_credential_key: str,
    path: str,
    cell_index: int
) -> CellOperationResponse:
    """
    Delete a cell from the notebook.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to the notebook
        cell_index: Index of the cell to delete (0-based)
    
    Returns:
        CellOperationResponse with operation status
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Export notebook
    response = client.workspace.export(path=path, format=ExportFormat.JUPYTER)
    content_encoded = getattr(response, 'content', '')
    content_str = base64.b64decode(content_encoded).decode('utf-8')
    notebook_data = json.loads(content_str)
    
    # Delete cell
    cells = notebook_data.get('cells', [])
    if cell_index < 0 or cell_index >= len(cells):
            return CellOperationResponse(
                path=path,
                operation="delete",
                cell_index=cell_index,
                status="failed",
                total_cells=len(cells),
                error_message=f"Cell index {cell_index} out of range (0-{len(cells)-1})",
            )
    
    deleted_cell = cells.pop(cell_index)
    notebook_data['cells'] = cells
    
    # Serialize and encode
    modified_content = json.dumps(notebook_data, indent=2)
    encoded_content = base64.b64encode(modified_content.encode('utf-8')).decode('ascii')
    
    # Import modified notebook
    client.workspace.import_(
        path=path,
        content=encoded_content,
        format=ImportFormat.JUPYTER,
        overwrite=True
    )
    
    return CellOperationResponse(
        path=path,
        operation="delete",
        cell_index=cell_index,
        status="success",
        total_cells=len(cells)
    )
    except Exception as e:
        return CellOperationResponse(
            path=path,
            operation="delete",
            cell_index=cell_index,
            status="failed",
            total_cells=0,
            error_message=f"Failed to delete notebook cell: {str(e)}",
        )


def reorder_notebook_cells(
    host_credential_key: str,
    token_credential_key: str,
    path: str,
    from_index: int,
    to_index: int
) -> CellOperationResponse:
    """
    Move a cell from one position to another.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        path: The workspace path to the notebook
        from_index: Current index of the cell to move (0-based)
        to_index: Target index for the cell (0-based)
    
    Returns:
        CellOperationResponse with operation status
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Export notebook
    response = client.workspace.export(path=path, format=ExportFormat.JUPYTER)
    content_encoded = getattr(response, 'content', '')
    content_str = base64.b64decode(content_encoded).decode('utf-8')
    notebook_data = json.loads(content_str)
    
    # Reorder cells
    cells = notebook_data.get('cells', [])
    if from_index < 0 or from_index >= len(cells):
            return CellOperationResponse(
                path=path,
                operation="reorder",
                cell_index=to_index,
                status="failed",
                total_cells=len(cells),
                error_message=f"From index {from_index} out of range (0-{len(cells)-1})",
            )
    if to_index < 0 or to_index >= len(cells):
            return CellOperationResponse(
                path=path,
                operation="reorder",
                cell_index=to_index,
                status="failed",
                total_cells=len(cells),
                error_message=f"To index {to_index} out of range (0-{len(cells)-1})",
            )
    
    # Remove cell from original position
    cell = cells.pop(from_index)
    
    # Insert at new position
    cells.insert(to_index, cell)
    notebook_data['cells'] = cells
    
    # Serialize and encode
    modified_content = json.dumps(notebook_data, indent=2)
    encoded_content = base64.b64encode(modified_content.encode('utf-8')).decode('ascii')
    
    # Import modified notebook
    client.workspace.import_(
        path=path,
        content=encoded_content,
        format=ImportFormat.JUPYTER,
        overwrite=True
    )
    
    return CellOperationResponse(
        path=path,
        operation="reorder",
        cell_index=to_index,
        status="success",
        total_cells=len(cells)
    )
    except Exception as e:
        return CellOperationResponse(
            path=path,
            operation="reorder",
            cell_index=to_index,
            status="failed",
            total_cells=0,
            error_message=f"Failed to reorder notebook cells: {str(e)}",
        )


# Helper functions

def _normalize_outputs(outputs: list) -> list[dict]:
    """Normalize output text fields from arrays to strings.
    
    Jupyter notebooks store text/data fields in outputs as arrays of lines.
    This function normalizes them to strings for easier consumption.
    """
    normalized = []
    for output in outputs:
        output_copy = output.copy()
        
        # Normalize 'text' field (common in stream and error outputs)
        if 'text' in output_copy and isinstance(output_copy['text'], list):
            output_copy['text'] = "".join(output_copy['text'])
        
        # Normalize 'data' field (for display_data and execute_result outputs)
        if 'data' in output_copy and isinstance(output_copy['data'], dict):
            data_copy = output_copy['data'].copy()
            for key, value in data_copy.items():
                if isinstance(value, list) and key.startswith('text/'):
                    data_copy[key] = "".join(value)
            output_copy['data'] = data_copy
        
        # Normalize 'traceback' field (for error outputs)
        if 'traceback' in output_copy and isinstance(output_copy['traceback'], list):
            output_copy['traceback'] = "".join(output_copy['traceback'])
        
        normalized.append(output_copy)
    
    return normalized


def _extract_cell_language(cell: dict) -> str | None:
    """Extract programming language from cell metadata."""
    cell_type = cell.get('cell_type')
    if cell_type != 'code':
        return None
    
    # Check metadata for language info
    metadata = cell.get('metadata', {})
    
    # Check for explicit language metadata
    if 'language' in metadata:
        return metadata['language']
    
    # Check Databricks-specific metadata
    db_metadata = metadata.get('application/vnd.databricks.v1+cell', {})
    if 'language' in db_metadata:
        return db_metadata['language']
    
    # Try to infer from magic commands in source
    source = cell.get('source', [])
    if isinstance(source, list) and source:
        first_line = source[0] if source else ''
    else:
        first_line = str(source)
    
    if first_line.startswith('%python'):
        return 'python'
    elif first_line.startswith('%scala'):
        return 'scala'
    elif first_line.startswith('%sql'):
        return 'sql'
    elif first_line.startswith('%r'):
        return 'r'
    
    # Default to python
    return 'python'

