# Notebook Management Tools

Comprehensive guide for managing Databricks notebooks via the MCP server.

## Available Tools

### 1. list_notebooks

List all notebooks in a workspace directory.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str, optional): Workspace path to list from (default: "/")

**Returns:**
- List of notebook objects with metadata

**Example:**
```python
notebooks = list_notebooks(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/notebooks"
)

# Returns:
[
    {
        "path": "/Users/me/notebooks/analysis",
        "object_type": "NOTEBOOK",
        "language": "PYTHON",
        "created_at": "2024-01-01T00:00:00Z",
        "modified_at": "2024-01-02T00:00:00Z"
    },
    ...
]
```

---

### 2. get_notebook

Export and retrieve notebook content in various formats.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path to the notebook
- `format` (str, optional): Export format (default: "SOURCE")
  - `SOURCE`: Raw source code
  - `HTML`: HTML format
  - `JUPYTER`: Jupyter notebook format (.ipynb)
  - `DBC`: Databricks archive format

**Returns:**
- Dictionary with notebook content and metadata

**Example:**
```python
# Export as source code
notebook = get_notebook(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/notebook",
    format="SOURCE"
)

# Export as Jupyter notebook
jupyter_nb = get_notebook(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/notebook",
    format="JUPYTER"
)
```

---

### 3. import_notebook

Import a notebook into the workspace.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path where notebook should be imported
- `content` (str): Base64-encoded notebook content
- `language` (str, optional): Notebook language (default: "PYTHON")
  - `PYTHON`
  - `SCALA`
  - `SQL`
  - `R`
- `format` (str, optional): Import format (default: "SOURCE")
  - `SOURCE`: Raw source code
  - `HTML`: HTML format
  - `JUPYTER`: Jupyter notebook format
  - `DBC`: Databricks archive format
  - `AUTO`: Auto-detect format
- `overwrite` (bool, optional): Overwrite existing notebook (default: False)

**Returns:**
- Dictionary with import status

**Example:**
```python
import base64

# Read notebook content
with open("notebook.py", "r") as f:
    content = f.read()
    
# Encode to base64
encoded_content = base64.b64encode(content.encode()).decode()

# Import notebook
result = import_notebook(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/imported_notebook",
    content=encoded_content,
    language="PYTHON",
    format="SOURCE",
    overwrite=True
)

# Returns:
{
    "path": "/Users/me/imported_notebook",
    "language": "PYTHON",
    "format": "SOURCE",
    "status": "imported"
}
```

---

### 4. delete_notebook

Delete a notebook from the workspace.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path to the notebook to delete
- `recursive` (bool, optional): Recursively delete (for directories, default: False)

**Returns:**
- Dictionary with deletion status

**Example:**
```python
result = delete_notebook(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/old_notebook"
)

# Returns:
{
    "path": "/Users/me/old_notebook",
    "status": "deleted"
}
```

**⚠️ Warning:** This operation is irreversible. Deleted notebooks cannot be recovered.

---

### 5. create_notebook

Create a new empty notebook in the workspace.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path where notebook should be created
- `language` (str, optional): Notebook language (default: "PYTHON")
  - `PYTHON`
  - `SCALA`
  - `SQL`
  - `R`

**Returns:**
- Dictionary with creation status

**Example:**
```python
result = create_notebook(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/new_analysis",
    language="PYTHON"
)

# Returns:
{
    "path": "/Users/me/new_analysis",
    "language": "PYTHON",
    "status": "created"
}
```

---

### 6. get_notebook_status

Get the status and metadata of a notebook.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path to the notebook

**Returns:**
- Dictionary with notebook metadata

**Example:**
```python
status = get_notebook_status(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/notebook"
)

# Returns:
{
    "path": "/Users/me/notebook",
    "object_type": "NOTEBOOK",
    "language": "PYTHON",
    "created_at": "2024-01-01T00:00:00Z",
    "modified_at": "2024-01-02T00:00:00Z",
    "size": 1024
}
```

---

## Common Use Cases

### 1. Backup Notebooks

```python
# List all notebooks
notebooks = list_notebooks(host, token, path="/Users/me")

# Export each notebook
for nb in notebooks:
    content = get_notebook(host, token, path=nb["path"], format="JUPYTER")
    # Save to local file system
    with open(f"backup/{nb['path'].replace('/', '_')}.ipynb", "w") as f:
        f.write(content["content"])
```

### 2. Deploy Notebooks

```python
import base64

# Read local notebook
with open("production_notebook.py", "r") as f:
    content = base64.b64encode(f.read().encode()).decode()

# Deploy to workspace
import_notebook(
    host, token,
    path="/Production/etl_pipeline",
    content=content,
    language="PYTHON",
    overwrite=True
)
```

### 3. Clone Notebooks

```python
# Export from source
source = get_notebook(host, token, path="/Users/me/source_notebook", format="SOURCE")

# Import to destination
import_notebook(
    host, token,
    path="/Users/me/cloned_notebook",
    content=source["content"],
    language="PYTHON"
)
```

### 4. Migrate Notebooks Between Workspaces

```python
# Export from workspace A
notebook = get_notebook(
    host="https://workspace-a.cloud.databricks.com",
    token="dapi_workspace_a...",
    path="/Users/me/notebook",
    format="JUPYTER"
)

# Import to workspace B
import_notebook(
    host="https://workspace-b.cloud.databricks.com",
    token="dapi_workspace_b...",
    path="/Users/me/notebook",
    content=notebook["content"],
    format="JUPYTER"
)
```

### 5. Organize Notebooks

```python
# List all notebooks in root
notebooks = list_notebooks(host, token, path="/Users/me")

# Move Python notebooks to subfolder
for nb in notebooks:
    if nb.get("language") == "PYTHON":
        # Export notebook
        content = get_notebook(host, token, path=nb["path"], format="SOURCE")
        
        # Import to new location
        new_path = f"/Users/me/python_notebooks/{nb['path'].split('/')[-1]}"
        import_notebook(
            host, token,
            path=new_path,
            content=content["content"],
            language="PYTHON"
        )
        
        # Delete from old location
        delete_notebook(host, token, path=nb["path"])
```

---

## Type Hints

All notebook tools use proper type annotations:

```python
from typing import Any
from databricks.sdk.service.workspace import ObjectInfo, ExportFormat, Language

def list_notebooks(host: str, token: str, path: str = "/") -> list[dict[str, Any]]:
    """Returns list matching SDK ObjectInfo type."""
    ...

def get_notebook(host: str, token: str, path: str, format: str = "SOURCE") -> dict[str, Any]:
    """Returns notebook content with metadata."""
    ...

def import_notebook(
    host: str, 
    token: str, 
    path: str, 
    content: str,
    language: str = "PYTHON",
    format: str = "SOURCE",
    overwrite: bool = False
) -> dict[str, Any]:
    """Imports notebook and returns status."""
    ...
```

---

## Error Handling

Common errors and how to handle them:

### 1. Notebook Not Found
```python
try:
    notebook = get_notebook(host, token, path="/nonexistent")
except Exception as e:
    print(f"Notebook not found: {e}")
```

### 2. Permission Denied
```python
try:
    delete_notebook(host, token, path="/Shared/protected_notebook")
except Exception as e:
    print(f"Permission denied: {e}")
```

### 3. Invalid Format
```python
try:
    notebook = get_notebook(host, token, path="/Users/me/notebook", format="INVALID")
except Exception as e:
    print(f"Invalid format: {e}")
```

### 4. Overwrite Protection
```python
# This will fail if notebook exists and overwrite=False
try:
    import_notebook(host, token, path="/Users/me/existing", content="...", overwrite=False)
except Exception as e:
    print(f"Notebook already exists: {e}")
```

---

## Best Practices

1. **Always use absolute paths**: Start paths with `/Users/` or `/Shared/`
2. **Check notebook status before operations**: Use `get_notebook_status()` to verify existence
3. **Use appropriate export formats**: 
   - `SOURCE` for version control
   - `JUPYTER` for portability
   - `DBC` for complete backups with attachments
4. **Handle overwrite carefully**: Set `overwrite=True` only when intentional
5. **Validate content encoding**: Ensure content is properly base64-encoded for imports
6. **Use recursive delete cautiously**: Only use `recursive=True` when deleting directories

---

## SDK Reference

These tools wrap the following Databricks SDK APIs:

- `workspace.list()` - List workspace objects
- `workspace.export()` - Export notebook content
- `workspace.import_()` - Import notebook content
- `workspace.delete()` - Delete workspace objects
- `workspace.get_status()` - Get object metadata

For more details, see the [Databricks SDK Documentation](https://databricks-sdk-py.readthedocs.io/en/latest/workspace/workspace.html).

---

## Related Tools

- **list_workspace_files**: List all workspace objects (not just notebooks)
- **list_queries**: List SQL queries (separate from SQL notebooks)
- **list_jobs**: List jobs that may reference notebooks

---

## Security Considerations

1. **Credentials**: Never hardcode credentials in notebooks
2. **Content validation**: Validate notebook content before importing
3. **Access control**: Respect workspace permissions and folder structure
4. **Audit trail**: Log all notebook operations for compliance
5. **Sensitive data**: Avoid storing sensitive data in notebook outputs

---

## Troubleshooting

### Issue: "Invalid path format"
**Solution**: Ensure paths start with `/` and use forward slashes

### Issue: "Content encoding error"
**Solution**: Verify content is base64-encoded before importing

### Issue: "Language mismatch"
**Solution**: Ensure language parameter matches notebook content

### Issue: "Format not supported"
**Solution**: Use one of: SOURCE, HTML, JUPYTER, DBC, AUTO

---

## Future Enhancements

Potential additions to notebook tools:

- Batch operations (import/export multiple notebooks)
- Notebook execution and result retrieval
- Notebook scheduling integration
- Version control integration
- Notebook diff and merge capabilities
- Collaborative editing support

