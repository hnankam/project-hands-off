# Notebook Cell Operations

Comprehensive guide for working with individual notebook cells via the MCP server.

## Overview

Cell-level operations enable fine-grained manipulation of Databricks notebooks by:
1. Exporting notebooks in JUPYTER format
2. Parsing the JSON structure
3. Modifying the `cells` array
4. Re-importing the modified notebook

This approach provides reliable, atomic operations without requiring running clusters.

## Available Operations

### 1. get_notebook_cells

Get all cells from a notebook with complete metadata.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path to the notebook

**Returns:**
- `NotebookCellsResponse` Pydantic model with:
  - `path` (str): Notebook path
  - `cells` (list[NotebookCell]): List of all cells
  - `total_cells` (int): Total number of cells
  - `notebook_metadata` (dict): Notebook-level metadata

**Example:**
```python
cells_response = get_notebook_cells(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/analysis"
)

print(f"Notebook has {cells_response.total_cells} cells")

for cell in cells_response.cells:
    print(f"Cell {cell.index}: {cell.cell_type}")
    print(f"Content: {cell.source_text[:100]}...")
    if cell.execution_count:
        print(f"Executed: {cell.execution_count} times")
```

---

### 2. get_notebook_cell

Get a specific cell by its index.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path to the notebook
- `cell_index` (int): Index of the cell (0-based)

**Returns:**
- `NotebookCell` Pydantic model with:
  - `index` (int): Cell position
  - `cell_type` (str): code, markdown, or raw
  - `source` (str | list[str]): Cell content
  - `metadata` (dict): Cell metadata
  - `outputs` (list): Execution outputs
  - `execution_count` (int | None): Execution counter
  - `language` (str | None): Programming language

**Example:**
```python
# Get the third cell (index 2)
cell = get_notebook_cell(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/analysis",
    cell_index=2
)

print(f"Cell type: {cell.cell_type}")
print(f"Content:\n{cell.source_text}")
print(f"Language: {cell.language}")
```

**Error Handling:**
```python
try:
    cell = get_notebook_cell(host, token, path="/Users/me/notebook", cell_index=100)
except IndexError as e:
    print(f"Cell not found: {e}")
```

---

### 3. search_notebook_cells

Search for cells containing a specific pattern.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path to the notebook
- `pattern` (str): Text or regex pattern to search for
- `cell_type` (str, optional): Filter by cell type (code, markdown, raw)
- `case_sensitive` (bool, optional): Case-sensitive search (default: False)

**Returns:**
- `list[CellSearchResult]` with:
  - `cell_index` (int): Index of matching cell
  - `cell_type` (str): Type of cell
  - `match_count` (int): Number of matches
  - `matches` (list[str]): Matching text snippets
  - `source` (str): Full cell content

**Example:**
```python
# Search for all cells using pandas
results = search_notebook_cells(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/analysis",
    pattern="pandas",
    cell_type="code"
)

for result in results:
    print(f"Cell {result.cell_index}: {result.match_count} matches")
    print(f"Matches: {result.matches}")
    print(f"Full content:\n{result.source}\n")

# Regex search
results = search_notebook_cells(
    host, token,
    path="/Users/me/notebook",
    pattern=r"def\s+\w+\(",  # Find function definitions
    case_sensitive=True
)

# Search markdown cells for TODO items
todos = search_notebook_cells(
    host, token,
    path="/Users/me/notebook",
    pattern="TODO:",
    cell_type="markdown"
)
```

---

### 4. insert_notebook_cell

Insert a new cell at a specific position.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path to the notebook
- `cell_index` (int): Position to insert (0-based)
- `cell_content` (str): Content of the new cell
- `cell_type` (str, optional): code, markdown, or raw (default: code)
- `language` (str, optional): python, scala, sql, r (for code cells)

**Returns:**
- `CellOperationResponse` with:
  - `path` (str): Notebook path
  - `operation` (str): "insert"
  - `cell_index` (int): Index where cell was inserted
  - `status` (str): "success"
  - `total_cells` (int): Total cells after operation

**Example:**
```python
# Insert a code cell at the beginning
result = insert_notebook_cell(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/analysis",
    cell_index=0,
    cell_content="# Setup imports\nimport pandas as pd\nimport numpy as np",
    cell_type="code",
    language="python"
)

print(f"Inserted cell at index {result.cell_index}")
print(f"Notebook now has {result.total_cells} cells")

# Insert markdown cell
result = insert_notebook_cell(
    host, token,
    path="/Users/me/notebook",
    cell_index=5,
    cell_content="## Data Analysis Section",
    cell_type="markdown"
)

# Insert at end (use large index)
cells_response = get_notebook_cells(host, token, path="/Users/me/notebook")
insert_notebook_cell(
    host, token,
    path="/Users/me/notebook",
    cell_index=cells_response.total_cells,  # Append at end
    cell_content="print('Last cell')"
)
```

---

### 5. update_notebook_cell

Update the content of an existing cell.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path to the notebook
- `cell_index` (int): Index of cell to update (0-based)
- `cell_content` (str): New content for the cell

**Returns:**
- `CellOperationResponse` with operation status

**Example:**
```python
# Update cell content
result = update_notebook_cell(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/analysis",
    cell_index=3,
    cell_content="# Updated analysis\ndf = pd.read_csv('new_data.csv')"
)

print(f"Updated cell {result.cell_index}")
```

**Note:** Updating a code cell clears its execution outputs and execution count.

---

### 6. delete_notebook_cell

Delete a cell from the notebook.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path to the notebook
- `cell_index` (int): Index of cell to delete (0-based)

**Returns:**
- `CellOperationResponse` with operation status

**Example:**
```python
# Delete cell at index 5
result = delete_notebook_cell(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/analysis",
    cell_index=5
)

print(f"Deleted cell {result.cell_index}")
print(f"Notebook now has {result.total_cells} cells")
```

**⚠️ Warning:** This operation is irreversible. The cell is permanently removed.

---

### 7. reorder_notebook_cells

Move a cell from one position to another.

**Parameters:**
- `host` (str): Databricks workspace URL
- `token` (str): Personal Access Token
- `path` (str): Workspace path to the notebook
- `from_index` (int): Current position of the cell (0-based)
- `to_index` (int): Target position for the cell (0-based)

**Returns:**
- `CellOperationResponse` with operation status

**Example:**
```python
# Move cell from position 5 to position 2
result = reorder_notebook_cells(
    host="https://my-workspace.cloud.databricks.com",
    token="dapi...",
    path="/Users/me/analysis",
    from_index=5,
    to_index=2
)

print(f"Moved cell to index {result.cell_index}")

# Move cell to end
cells_response = get_notebook_cells(host, token, path="/Users/me/notebook")
reorder_notebook_cells(
    host, token,
    path="/Users/me/notebook",
    from_index=0,
    to_index=cells_response.total_cells - 1
)
```

---

## Common Use Cases

### 1. Extract All Code from Notebook

```python
cells_response = get_notebook_cells(host, token, path="/Users/me/notebook")

code_cells = [cell for cell in cells_response.cells if cell.cell_type == "code"]

for cell in code_cells:
    print(f"=== Cell {cell.index} ===")
    print(cell.source_text)
    print()
```

### 2. Add Logging to All Functions

```python
# Find all cells with function definitions
results = search_notebook_cells(
    host, token,
    path="/Users/me/notebook",
    pattern=r"def\s+\w+\("
)

# Add logging import at the beginning if not present
cells_response = get_notebook_cells(host, token, path="/Users/me/notebook")
first_cell = cells_response.cells[0]

if "import logging" not in first_cell.source_text:
    insert_notebook_cell(
        host, token,
        path="/Users/me/notebook",
        cell_index=0,
        cell_content="import logging\nlogging.basicConfig(level=logging.INFO)"
    )
```

### 3. Create Notebook from Template

```python
template_cells = [
    {
        "content": "# Data Analysis Notebook\n\nCreated: 2024-01-01",
        "type": "markdown"
    },
    {
        "content": "# Setup\nimport pandas as pd\nimport numpy as np",
        "type": "code"
    },
    {
        "content": "## Load Data",
        "type": "markdown"
    },
    {
        "content": "df = pd.read_csv('data.csv')",
        "type": "code"
    }
]

# Create empty notebook
create_notebook(host, token, path="/Users/me/new_analysis", language="PYTHON")

# Add template cells
for i, cell in enumerate(template_cells):
    insert_notebook_cell(
        host, token,
        path="/Users/me/new_analysis",
        cell_index=i,
        cell_content=cell["content"],
        cell_type=cell["type"]
    )
```

### 4. Remove All Empty Cells

```python
cells_response = get_notebook_cells(host, token, path="/Users/me/notebook")

# Find empty cells (iterate backwards to maintain indices)
for cell in reversed(cells_response.cells):
    if not cell.source_text.strip():
        delete_notebook_cell(host, token, path="/Users/me/notebook", cell_index=cell.index)
        print(f"Deleted empty cell at index {cell.index}")
```

### 5. Organize Cells by Type

```python
cells_response = get_notebook_cells(host, token, path="/Users/me/notebook")

# Separate code and markdown cells
code_cells = [c for c in cells_response.cells if c.cell_type == "code"]
markdown_cells = [c for c in cells_response.cells if c.cell_type == "markdown"]

# Reorganize: all markdown first, then code
# (This is a simplified example - real implementation would be more complex)
print(f"Found {len(code_cells)} code cells and {len(markdown_cells)} markdown cells")
```

### 6. Find and Replace Across Cells

```python
# Search for cells containing old variable name
results = search_notebook_cells(
    host, token,
    path="/Users/me/notebook",
    pattern="old_variable_name"
)

# Update each matching cell
for result in results:
    cell = get_notebook_cell(host, token, path="/Users/me/notebook", cell_index=result.cell_index)
    updated_content = cell.source_text.replace("old_variable_name", "new_variable_name")
    update_notebook_cell(
        host, token,
        path="/Users/me/notebook",
        cell_index=result.cell_index,
        cell_content=updated_content
    )
    print(f"Updated cell {result.cell_index}")
```

### 7. Extract Documentation

```python
cells_response = get_notebook_cells(host, token, path="/Users/me/notebook")

# Extract all markdown cells for documentation
markdown_content = []
for cell in cells_response.cells:
    if cell.cell_type == "markdown":
        markdown_content.append(cell.source_text)

# Save to file
documentation = "\n\n".join(markdown_content)
with open("notebook_docs.md", "w") as f:
    f.write(documentation)
```

## Performance Considerations

### Operation Costs

| Operation | API Calls | Time | Notes |
|-----------|-----------|------|-------|
| `get_notebook_cells` | 1 export | ~1-2s | Reads entire notebook |
| `get_notebook_cell` | 1 export | ~1-2s | Reads entire notebook |
| `search_notebook_cells` | 1 export | ~1-3s | Depends on notebook size |
| `insert_notebook_cell` | 1 export + 1 import | ~2-4s | Atomic operation |
| `update_notebook_cell` | 1 export + 1 import | ~2-4s | Clears outputs |
| `delete_notebook_cell` | 1 export + 1 import | ~2-4s | Atomic operation |
| `reorder_notebook_cells` | 1 export + 1 import | ~2-4s | Atomic operation |

### Optimization Tips

1. **Batch Read Operations**: Get all cells once, then work with the data locally
2. **Minimize Writes**: Collect all changes, then apply in sequence
3. **Cache Results**: Store `NotebookCellsResponse` for multiple read operations
4. **Use Search**: More efficient than iterating all cells

### Limitations

- ❌ **Execution outputs are lost** when cells are modified
- ❌ **No partial updates** - entire notebook is re-imported
- ❌ **Race conditions** possible if notebook modified elsewhere
- ❌ **No cell execution** - use Command Execution API separately
- ✅ **Atomic operations** - changes are all-or-nothing

## Error Handling

### Common Errors

```python
# IndexError: Cell index out of range
try:
    cell = get_notebook_cell(host, token, path="/Users/me/notebook", cell_index=999)
except IndexError as e:
    print(f"Invalid cell index: {e}")

# Notebook not found
try:
    cells = get_notebook_cells(host, token, path="/Users/me/nonexistent")
except Exception as e:
    print(f"Notebook not found: {e}")

# Invalid cell type
try:
    insert_notebook_cell(
        host, token,
        path="/Users/me/notebook",
        cell_index=0,
        cell_content="content",
        cell_type="invalid_type"  # Should be: code, markdown, or raw
    )
except Exception as e:
    print(f"Invalid cell type: {e}")
```

## Best Practices

1. **Always check cell count** before accessing by index
2. **Use search** to find cells instead of hardcoding indices
3. **Backup notebooks** before bulk modifications
4. **Test on copies** before modifying production notebooks
5. **Handle errors gracefully** - operations can fail
6. **Document changes** in markdown cells
7. **Validate content** before inserting/updating
8. **Consider execution order** when reordering cells

## Security Considerations

1. **Input Validation**: Sanitize cell content before insertion
2. **Code Injection**: Be cautious with dynamic cell content
3. **Permissions**: Verify user has write access to notebook
4. **Audit Trail**: Log all cell modifications
5. **Sensitive Data**: Avoid storing secrets in cells

## Comparison with Alternatives

### vs. Full Notebook Import/Export
- ✅ **More granular** - modify specific cells
- ✅ **Better for automation** - programmatic access
- ❌ **More API calls** - each operation requires export/import

### vs. Manual Editing
- ✅ **Automatable** - can be scripted
- ✅ **Consistent** - no human error
- ❌ **No visual feedback** - can't see notebook UI

### vs. Databricks Repos/Git
- ✅ **Immediate** - changes apply instantly
- ❌ **No version control** - no commit history
- ❌ **No collaboration features** - no merge/diff

## Future Enhancements

Potential additions:
- Batch cell operations (insert/update/delete multiple)
- Cell execution via Command Execution API
- Cell dependency analysis
- Automatic cell numbering/ordering
- Cell templates library
- Diff between notebook versions
- Cell-level permissions

## Resources

- [Databricks SDK Documentation](https://databricks-sdk-py.readthedocs.io/)
- [Jupyter Notebook Format](https://nbformat.readthedocs.io/)
- [CELL_OPERATIONS_FEASIBILITY.md](./CELL_OPERATIONS_FEASIBILITY.md) - Technical investigation

## Summary

Cell-level operations provide powerful capabilities for programmatic notebook manipulation. They're ideal for:
- 🤖 AI agents analyzing and modifying notebooks
- 🔄 Automated notebook generation and refactoring
- 🔍 Code analysis and documentation extraction
- 📝 Template-based notebook creation
- 🧹 Notebook cleanup and organization

All operations are reliable, atomic, and don't require running clusters, making them cost-effective and suitable for production use.

