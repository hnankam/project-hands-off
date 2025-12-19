# Type Safety in Databricks MCP Server

## Overview

The Databricks MCP Server uses proper type hints that align with the Databricks SDK to provide type safety, better IDE support, and runtime validation.

## Type Annotations

All tools use explicit type annotations that match the Databricks SDK dataclass types:

### Clusters

```python
from typing import Any
from databricks.sdk.service.compute import ClusterDetails

def list_clusters(host: str, token: str) -> list[dict[str, Any]]:
    """Returns list of cluster details matching SDK ClusterDetails type."""
    ...

def get_cluster(host: str, token: str, cluster_id: str) -> dict[str, Any]:
    """Returns cluster details matching SDK ClusterDetails type."""
    ...
```

### Queries

```python
from databricks.sdk.service.sql import ListQueryObjectsResponseQuery

def list_queries(host: str, token: str) -> list[dict[str, Any]]:
    """Returns list of queries matching SDK ListQueryObjectsResponseQuery type."""
    ...

def get_query(host: str, token: str, query_id: str) -> dict[str, Any]:
    """Returns query details matching SDK Query type."""
    ...
```

### Jobs

```python
from databricks.sdk.service.jobs import BaseJob, Run

def list_jobs(host: str, token: str, limit: int = 25) -> list[dict[str, Any]]:
    """Returns list of jobs matching SDK BaseJob type."""
    ...

def trigger_job(
    host: str, 
    token: str, 
    job_id: int, 
    notebook_params: dict[str, Any] | None = None,
    jar_params: list[str] | None = None
) -> dict[str, Any]:
    """Returns run details matching SDK Run type."""
    ...
```

### Workspace

```python
from databricks.sdk.service.workspace import ObjectInfo

def list_workspace_files(host: str, token: str, path: str = "/") -> list[dict[str, Any]]:
    """Returns list of workspace objects matching SDK ObjectInfo type."""
    ...
```

## Why dict[str, Any] Instead of SDK Types Directly?

The Databricks SDK uses **dataclasses**, not Pydantic models. While we import the SDK types for reference and documentation, we return `dict[str, Any]` because:

1. **JSON Serialization**: MCP protocol requires JSON-serializable responses
2. **SDK Compatibility**: Databricks SDK dataclasses have `.as_dict()` methods for serialization
3. **Flexibility**: Allows dynamic attribute extraction without strict schema enforcement
4. **FastMCP Integration**: FastMCP handles dict responses natively

## Conversion Pattern

All tools follow this pattern:

```python
def some_tool(host: str, token: str) -> dict[str, Any]:
    client = get_workspace_client(host, token)
    
    # Get SDK dataclass object
    sdk_object = client.some_api.some_method()
    
    # Convert to dict for JSON serialization
    if hasattr(sdk_object, 'as_dict'):
        return sdk_object.as_dict()
    
    # Fallback: manual conversion
    result = {}
    for attr in dir(sdk_object):
        if not attr.startswith('_') and not callable(getattr(sdk_object, attr)):
            value = getattr(sdk_object, attr)
            if isinstance(value, (str, int, float, bool, list, dict)):
                result[attr] = value
            elif hasattr(value, 'as_dict'):
                result[attr] = value.as_dict()
            else:
                result[attr] = str(value)
    return result
```

## Benefits

### 1. IDE Support

```python
# IDE knows the return type
clusters: list[dict[str, Any]] = list_clusters(host, token)

# Type checker validates usage
for cluster in clusters:
    cluster_id: str = cluster["cluster_id"]  # ✓ Valid
```

### 2. Type Checking

```bash
# Run mypy to validate types
mypy tools/
```

### 3. Documentation

Type hints serve as inline documentation:

```python
def trigger_job(
    host: str,                              # Clear: expects string
    token: str,                             # Clear: expects string
    job_id: int,                            # Clear: expects integer
    notebook_params: dict[str, Any] | None  # Clear: optional dict
) -> dict[str, Any]:                        # Clear: returns dict
    ...
```

### 4. Runtime Validation

FastMCP automatically validates:
- Parameter types match annotations
- Required parameters are provided
- Return types match annotations

## Pydantic Models (models.py)

The `models.py` file provides a base class for future enhancements:

```python
from typing import Any
from pydantic import BaseModel

class DatabricksResponse(BaseModel):
    """Base response model that can wrap any Databricks SDK dataclass."""
    
    @classmethod
    def from_sdk_object(cls, sdk_obj: Any) -> dict:
        """Convert Databricks SDK dataclass to dict for JSON serialization."""
        if hasattr(sdk_obj, 'as_dict'):
            return sdk_obj.as_dict()
        elif hasattr(sdk_obj, '__dict__'):
            return sdk_obj.__dict__
        else:
            return {"value": str(sdk_obj)}
```

This allows for future strict Pydantic models if needed:

```python
class ClusterInfo(BaseModel):
    cluster_id: str
    cluster_name: str | None = None
    state: str | None = None
    # ... more fields
```

## Type Safety Checklist

When adding new tools:

- ✅ Import relevant SDK types for reference
- ✅ Use `dict[str, Any]` for return types
- ✅ Add proper type hints for all parameters
- ✅ Use `| None` for optional parameters (Python 3.10+ syntax)
- ✅ Document parameter and return types in docstrings
- ✅ Convert SDK objects using `.as_dict()` when available
- ✅ Handle nested SDK objects recursively

## Example: Adding a New Tool

```python
# tools/new_category.py
from typing import Any
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.catalog import CatalogInfo  # Import SDK type
from cache import get_workspace_client

def list_catalogs(host: str, token: str) -> list[dict[str, Any]]:
    """
    List all catalogs in Unity Catalog.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
    
    Returns:
        List of catalog objects matching SDK CatalogInfo structure
    """
    client = get_workspace_client(host, token)
    
    catalogs = []
    for catalog in client.catalogs.list():
        # Convert SDK dataclass to dict
        catalogs.append(catalog.as_dict())
    
    return catalogs
```

## Resources

- [Databricks SDK Python Documentation](https://databricks-sdk-py.readthedocs.io/)
- [Python Type Hints (PEP 484)](https://peps.python.org/pep-0484/)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [FastMCP Documentation](https://github.com/jlowin/fastmcp)

