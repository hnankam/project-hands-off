"""SQL Query management tools."""

from typing import Any, List, Optional
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import CreateQueryRequestQuery, UpdateQueryRequestQuery
from cache import get_workspace_client
from models import (
    QueryInfo,
    ListQueriesResponse,
    CreateQueryResponse,
    UpdateQueryResponse,
    DeleteQueryResponse,
    VisualizationInfo,
    ListVisualizationsResponse,
)


def list_queries(
    host: str,
    token: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None
) -> ListQueriesResponse:
    """
    List all SQL queries in the workspace.
    
    Warning: Calling this API concurrently 10 or more times could result in 
    throttling, service degradation, or a temporary ban.
    
    Args:
        host: Databricks workspace URL (e.g., https://my-workspace.cloud.databricks.com)
        token: Personal Access Token (starts with 'dapi')
        page_size: Optional maximum number of queries to return per page
        page_token: Optional page token from a previous request for pagination
    
    Returns:
        ListQueriesResponse containing list of queries with metadata
    """
    client = get_workspace_client(host, token)
    
    queries = []
    for query in client.queries.list(page_size=page_size, page_token=page_token):
        query_dict = query.as_dict()
        
        # Convert parameters to list of dicts if present
        parameters = None
        if query_dict.get('parameters'):
            parameters = [p if isinstance(p, dict) else p.as_dict() for p in query_dict['parameters']]
        
        queries.append(QueryInfo(
            id=query_dict.get('id'),
            display_name=query_dict.get('display_name'),
            query_text=query_dict.get('query_text'),
            description=query_dict.get('description'),
            warehouse_id=query_dict.get('warehouse_id'),
            owner_user_name=query_dict.get('owner_user_name'),
            catalog=query_dict.get('catalog'),
            schema_name=query_dict.get('schema'),
            tags=query_dict.get('tags'),
            parent_path=query_dict.get('parent_path'),
            lifecycle_state=query_dict.get('lifecycle_state'),
            run_as_mode=query_dict.get('run_as_mode'),
            create_time=query_dict.get('create_time'),
            update_time=query_dict.get('update_time'),
            last_modifier_user_name=query_dict.get('last_modifier_user_name'),
            apply_auto_limit=query_dict.get('apply_auto_limit'),
            parameters=parameters
        ))
    
    return ListQueriesResponse(
        queries=queries,
        count=len(queries),
        next_page_token=None  # SDK iterator handles pagination internally
    )


def get_query(host: str, token: str, query_id: str) -> QueryInfo:
    """
    Get details of a specific SQL query.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        query_id: ID of the query to retrieve
    
    Returns:
        QueryInfo with complete query details including SQL text, metadata, and tags
    """
    client = get_workspace_client(host, token)
    query = client.queries.get(id=query_id)
    query_dict = query.as_dict()
    
    # Convert parameters to list of dicts if present
    parameters = None
    if query_dict.get('parameters'):
        parameters = [p if isinstance(p, dict) else p.as_dict() for p in query_dict['parameters']]
    
    return QueryInfo(
        id=query_dict.get('id'),
        display_name=query_dict.get('display_name'),
        query_text=query_dict.get('query_text'),
        description=query_dict.get('description'),
        warehouse_id=query_dict.get('warehouse_id'),
        owner_user_name=query_dict.get('owner_user_name'),
        catalog=query_dict.get('catalog'),
        schema_name=query_dict.get('schema'),
        tags=query_dict.get('tags'),
        parent_path=query_dict.get('parent_path'),
        lifecycle_state=query_dict.get('lifecycle_state'),
        run_as_mode=query_dict.get('run_as_mode'),
        create_time=query_dict.get('create_time'),
        update_time=query_dict.get('update_time'),
        last_modifier_user_name=query_dict.get('last_modifier_user_name'),
        apply_auto_limit=query_dict.get('apply_auto_limit'),
        parameters=parameters
    )


def create_query(
    host: str,
    token: str,
    display_name: str,
    warehouse_id: str,
    query_text: str,
    description: Optional[str] = None,
    catalog: Optional[str] = None,
    schema: Optional[str] = None,
    tags: Optional[List[str]] = None,
    parent_path: Optional[str] = None,
    run_as_mode: Optional[str] = None,
    apply_auto_limit: Optional[bool] = None
) -> CreateQueryResponse:
    """
    Create a new SQL query.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        display_name: Query display name
        warehouse_id: SQL warehouse ID to run the query on
        query_text: The SQL query text
        description: Optional query description
        catalog: Optional Unity Catalog name
        schema: Optional schema name
        tags: Optional list of tags
        parent_path: Optional parent folder path
        run_as_mode: Optional run as mode (VIEWER or OWNER)
        apply_auto_limit: Optional whether to apply auto limit
    
    Returns:
        CreateQueryResponse with the created query details
    """
    client = get_workspace_client(host, token)
    
    query_request = CreateQueryRequestQuery(
        display_name=display_name,
        warehouse_id=warehouse_id,
        query_text=query_text,
        description=description,
        catalog=catalog,
        schema=schema,
        tags=tags,
        parent_path=parent_path,
        run_as_mode=run_as_mode,
        apply_auto_limit=apply_auto_limit
    )
    
    created_query = client.queries.create(query=query_request)
    
    return CreateQueryResponse(
        id=created_query.id,
        display_name=created_query.display_name,
        query_text=created_query.query_text,
        warehouse_id=created_query.warehouse_id,
        status=f"Query '{display_name}' created successfully"
    )


def update_query(
    host: str,
    token: str,
    query_id: str,
    display_name: Optional[str] = None,
    query_text: Optional[str] = None,
    description: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    catalog: Optional[str] = None,
    schema: Optional[str] = None,
    tags: Optional[List[str]] = None,
    run_as_mode: Optional[str] = None,
    apply_auto_limit: Optional[bool] = None
) -> UpdateQueryResponse:
    """
    Update an existing SQL query.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        query_id: ID of the query to update
        display_name: Optional new display name
        query_text: Optional new SQL query text
        description: Optional new description
        warehouse_id: Optional new SQL warehouse ID
        catalog: Optional new Unity Catalog name
        schema: Optional new schema name
        tags: Optional new list of tags
        run_as_mode: Optional new run as mode (VIEWER or OWNER)
        apply_auto_limit: Optional new apply auto limit setting
    
    Returns:
        UpdateQueryResponse with the updated query details
    """
    client = get_workspace_client(host, token)
    
    # Build update mask based on provided parameters
    update_fields = []
    update_dict = {}
    
    if display_name is not None:
        update_fields.append("display_name")
        update_dict["display_name"] = display_name
    if query_text is not None:
        update_fields.append("query_text")
        update_dict["query_text"] = query_text
    if description is not None:
        update_fields.append("description")
        update_dict["description"] = description
    if warehouse_id is not None:
        update_fields.append("warehouse_id")
        update_dict["warehouse_id"] = warehouse_id
    if catalog is not None:
        update_fields.append("catalog")
        update_dict["catalog"] = catalog
    if schema is not None:
        update_fields.append("schema")
        update_dict["schema"] = schema
    if tags is not None:
        update_fields.append("tags")
        update_dict["tags"] = tags
    if run_as_mode is not None:
        update_fields.append("run_as_mode")
        update_dict["run_as_mode"] = run_as_mode
    if apply_auto_limit is not None:
        update_fields.append("apply_auto_limit")
        update_dict["apply_auto_limit"] = apply_auto_limit
    
    if not update_fields:
        raise ValueError("At least one field must be provided for update")
    
    update_mask = ",".join(update_fields)
    query_request = UpdateQueryRequestQuery(**update_dict)
    
    updated_query = client.queries.update(
        id=query_id,
        update_mask=update_mask,
        query=query_request
    )
    
    return UpdateQueryResponse(
        id=updated_query.id,
        display_name=updated_query.display_name,
        query_text=updated_query.query_text,
        update_time=updated_query.update_time,
        status=f"Query '{query_id}' updated successfully"
    )


def delete_query(host: str, token: str, query_id: str) -> DeleteQueryResponse:
    """
    Delete a SQL query (moves to trash).
    
    Trashed queries immediately disappear from searches and list views,
    and cannot be used for alerts. A trashed query is permanently deleted
    after 30 days and can be restored through the UI before then.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        query_id: ID of the query to delete
    
    Returns:
        DeleteQueryResponse confirming the deletion
    """
    client = get_workspace_client(host, token)
    
    client.queries.delete(id=query_id)
    
    return DeleteQueryResponse(
        id=query_id,
        status=f"Query '{query_id}' moved to trash (recoverable for 30 days)"
    )


def list_query_visualizations(
    host: str,
    token: str,
    query_id: str
) -> ListVisualizationsResponse:
    """
    List all visualizations for a specific query.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        query_id: ID of the query
    
    Returns:
        ListVisualizationsResponse with all visualizations for the query
    """
    client = get_workspace_client(host, token)
    
    visualizations = []
    for viz in client.queries.list_visualizations(id=query_id):
        viz_dict = viz.as_dict()
        visualizations.append(VisualizationInfo(
            id=viz_dict.get('id'),
            query_id=viz_dict.get('query_id'),
            type=viz_dict.get('type'),
            display_name=viz_dict.get('display_name'),
            create_time=viz_dict.get('create_time'),
            update_time=viz_dict.get('update_time'),
            serialized_options=viz_dict.get('serialized_options'),
            serialized_query_plan=viz_dict.get('serialized_query_plan')
        ))
    
    return ListVisualizationsResponse(
        query_id=query_id,
        visualizations=visualizations,
        count=len(visualizations)
    )

