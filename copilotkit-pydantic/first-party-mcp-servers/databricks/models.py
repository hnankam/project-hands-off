"""Pydantic models for Databricks MCP server responses.

These models wrap Databricks SDK dataclass types to provide:
- Type safety for FastMCP
- Automatic validation
- Better JSON serialization
- Clear API documentation
"""

from typing import Any
from pydantic import BaseModel, Field


class DatabricksResponse(BaseModel):
    """Base response model that can wrap any Databricks SDK dataclass."""
    
    class Config:
        # Allow arbitrary types from Databricks SDK
        arbitrary_types_allowed = True
    
    @classmethod
    def from_sdk_object(cls, sdk_obj: Any) -> dict:
        """Convert Databricks SDK dataclass to dict for JSON serialization."""
        if hasattr(sdk_obj, 'as_dict'):
            return sdk_obj.as_dict()
        elif hasattr(sdk_obj, '__dict__'):
            return sdk_obj.__dict__
        else:
            return {"value": str(sdk_obj)}


# For now, we'll return raw dicts since FastMCP handles them well
# and the SDK objects have as_dict() methods that serialize properly.
# This allows maximum flexibility while maintaining type information.

# If you want stricter typing, you can define specific Pydantic models:
# class ClusterInfo(BaseModel):
#     cluster_id: str
#     cluster_name: str | None = None
#     state: str | None = None
#     ...

