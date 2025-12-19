"""SQL Query management tools."""

from typing import Any
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import ListQueryObjectsResponseQuery
from cache import get_workspace_client


def list_queries(host: str, token: str) -> list[dict[str, Any]]:
    """
    List all SQL queries in the workspace.
    
    Args:
        host: Databricks workspace URL (e.g., https://my-workspace.cloud.databricks.com)
        token: Personal Access Token (starts with 'dapi')
    
    Returns:
        List of query objects with id, display_name, query_text, etc.
    """
    client = get_workspace_client(host, token)
    
    queries = []
    for query in client.queries.list():
        query_dict = {
            "id": query.id if hasattr(query, 'id') else None,
            "display_name": query.display_name if hasattr(query, 'display_name') else None,
            "query_text": query.query_text if hasattr(query, 'query_text') else None,
            "owner_user_name": query.owner_user_name if hasattr(query, 'owner_user_name') else None,
        }
        
        # Add optional attributes that may exist
        optional_attrs = ['description', 'created_at', 'updated_at', 'parent', 
                         'parent_path', 'lifecycle_state', 'warehouse_id']
        for attr in optional_attrs:
            if hasattr(query, attr):
                value = getattr(query, attr)
                query_dict[attr] = str(value) if value and attr in ['created_at', 'updated_at', 'lifecycle_state'] else value
        
        queries.append(query_dict)
    return queries


def get_query(host: str, token: str, query_id: str) -> dict[str, Any]:
    """
    Get details of a specific SQL query.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        query_id: ID of the query to retrieve
    
    Returns:
        Query details including SQL text, metadata, and tags
    """
    client = get_workspace_client(host, token)
    query = client.queries.get(query_id)
    
    # Build response dict with core attributes
    result = {
        "id": query.id if hasattr(query, 'id') else None,
        "display_name": query.display_name if hasattr(query, 'display_name') else None,
        "query_text": query.query_text if hasattr(query, 'query_text') else None,
        "owner_user_name": query.owner_user_name if hasattr(query, 'owner_user_name') else None,
    }
    
    # Add all other available attributes
    optional_attrs = ['description', 'created_at', 'updated_at', 'parent', 'parent_path',
                     'lifecycle_state', 'warehouse_id', 'tags', 'run_as_mode',
                     'created_by_id', 'updated_by_id', 'last_run_at']
    for attr in optional_attrs:
        if hasattr(query, attr):
            value = getattr(query, attr)
            result[attr] = str(value) if value and attr in ['created_at', 'updated_at', 'last_run_at', 'lifecycle_state'] else value
    
    return result

