"""
Unity Catalog Tables Management Tools

This module provides comprehensive table management operations for Unity Catalog,
including listing, querying, and managing table metadata and permissions.
"""

from typing import Optional
from itertools import islice
from cache import get_workspace_client
from models import (
    TableInfoModel,
    TableSummaryModel,
    ListTablesResponse,
    ListTableSummariesResponse,
    TableExistsResponseModel,
    DeleteTableResponse,
    UpdateTableResponse,
    ColumnInfoModel,
)


# ============================================================================
# Table Discovery and Inspection
# ============================================================================

def list_tables(
    host_credential_key: str,
    token_credential_key: str,
    catalog_name: str,
    schema_name: str,
    limit: int = 25,
    page: int = 0,
    include_delta_metadata: Optional[bool] = None,
    include_browse: Optional[bool] = None,
    omit_columns: Optional[bool] = None,
    omit_properties: Optional[bool] = None,
    omit_username: Optional[bool] = None,
) -> ListTablesResponse:
    """
    Retrieve a paginated list of tables within a Unity Catalog schema.
    
    This function returns table metadata for all accessible tables in the specified catalog
    and schema. Use this to discover available tables, check table schemas, or list data assets.
    
    Access Requirements: Caller must have metastore admin privileges, table ownership, or
    SELECT privilege on the tables.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        catalog_name: Name of the Unity Catalog containing the schema. Required. Must be exact match
        schema_name: Name of the schema containing the tables. Required. Must be exact match
        limit: Number of tables to return in a single request. Must be positive integer. Default: 25. Maximum: 20 when include_delta_metadata or include_browse is True
        page: Zero-indexed page number for pagination. Default: 0
        include_delta_metadata: Boolean flag to include Delta Lake-specific metadata (version, format). Default: None (excluded)
        include_browse: Boolean flag to include tables where user has only browse permission (no SELECT). Default: None (excluded)
        omit_columns: Boolean flag to exclude column definitions from response. True improves performance for large schemas. Default: None (columns included)
        omit_properties: Boolean flag to exclude custom table properties from response. Default: None (properties included)
        omit_username: Boolean flag to exclude creator/modifier usernames from response. Default: None (usernames included)
        
    Returns:
        ListTablesResponse containing:
        - tables: List of TableInfoModel objects with full table metadata (name, type, columns, properties, permissions, timestamps)
        - count: Integer number of tables returned in this page (0 to limit)
        - has_more: Boolean indicating if additional tables exist beyond this page
        
    Pagination:
        - Returns up to `limit` tables per call
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available
        - Filters and omit flags apply consistently across all pages
        
    Performance Optimization:
        - Set omit_columns=True when column details are not needed (faster for schemas with many tables)
        - Set omit_properties=True to exclude custom properties
        - Use list_table_summaries() for lightweight discovery when full metadata is not required
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Cap limit at 20 when expand options are True to reduce response size
    effective_limit = min(limit, 20) if (include_delta_metadata or include_browse) else limit
    
    response = client.tables.list(
        catalog_name=catalog_name,
        schema_name=schema_name,
        include_delta_metadata=include_delta_metadata,
        include_browse=include_browse,
        omit_columns=omit_columns,
        omit_properties=omit_properties,
        omit_username=omit_username,
    )
    
    skip = page * effective_limit
    tables_iterator = islice(response, skip, skip + effective_limit)
    
    tables_list = []
    for table in tables_iterator:
        # Extract columns if present
        columns = None
        if table.columns:
            columns = [
                ColumnInfoModel(
                    name=col.name,
                    type_text=col.type_text,
                    type_name=col.type_name.value if col.type_name else None,
                    type_json=col.type_json,
                    position=col.position,
                    comment=col.comment,
                    nullable=col.nullable,
                    partition_index=col.partition_index,
                    type_precision=col.type_precision,
                    type_scale=col.type_scale,
                    type_interval_type=col.type_interval_type,
                    mask=col.mask.as_dict() if col.mask else None,
                )
                for col in table.columns
            ]
        
        tables_list.append(
            TableInfoModel(
                name=table.name,
                full_name=table.full_name,
                catalog_name=table.catalog_name,
                schema_name=table.schema_name,
                table_type=table.table_type.value if table.table_type else None,
                data_source_format=table.data_source_format.value if table.data_source_format else None,
                storage_location=table.storage_location,
                owner=table.owner,
                comment=table.comment,
                properties=table.properties,
                created_at=table.created_at,
                created_by=table.created_by,
                updated_at=table.updated_at,
                updated_by=table.updated_by,
                table_id=table.table_id,
                columns=columns,
                view_definition=table.view_definition,
                sql_path=table.sql_path,
                metastore_id=table.metastore_id,
                deleted_at=table.deleted_at,
                pipeline_id=table.pipeline_id,
                browse_only=table.browse_only,
                access_point=table.access_point,
                storage_credential_name=table.storage_credential_name,
                data_access_configuration_id=table.data_access_configuration_id,
                table_constraints=[tc.as_dict() for tc in table.table_constraints] if table.table_constraints else None,
                row_filter=table.row_filter.as_dict() if table.row_filter else None,
                view_dependencies=table.view_dependencies.as_dict() if table.view_dependencies else None,
                encryption_details=table.encryption_details.as_dict() if table.encryption_details else None,
                enable_predictive_optimization=table.enable_predictive_optimization.value if table.enable_predictive_optimization else None,
                effective_predictive_optimization_flag=table.effective_predictive_optimization_flag.as_dict() if table.effective_predictive_optimization_flag else None,
                delta_runtime_properties_kvpairs=table.delta_runtime_properties_kvpairs.as_dict() if table.delta_runtime_properties_kvpairs else None,
            )
        )
    
    # Check for more results
    has_more = False
    try:
        next(response)
        has_more = True
    except StopIteration:
        has_more = False
    
    return ListTablesResponse(
        tables=tables_list,
        count=len(tables_list),
        has_more=has_more,
    )


def list_table_summaries(
    host_credential_key: str,
    token_credential_key: str,
    catalog_name: str,
    schema_name_pattern: Optional[str] = None,
    table_name_pattern: Optional[str] = None,
    limit: int = 25,
    page: int = 0,
) -> ListTableSummariesResponse:
    """
    Retrieve a lightweight paginated list of table summaries across schemas in a catalog.
    
    This function returns minimal table metadata (name, type only) for efficient discovery
    across multiple schemas. Faster than list_tables when full column and property details
    are not needed. Supports SQL pattern matching for filtering.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        catalog_name: Name of the Unity Catalog to search. Required. Must be exact match
        schema_name_pattern: Optional SQL LIKE pattern to match schema names. Supports wildcards: % (any characters), _ (single character). 
        table_name_pattern: Optional SQL LIKE pattern to match table names. Supports wildcards: % (any characters), _ (single character). 
        limit: Number of table summaries to return in a single request. Must be positive integer. Default: 25
        page: Zero-indexed page number for pagination. Default: 0
        
    Returns:
        ListTableSummariesResponse with list of table summaries
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    response = client.tables.list_summaries(
        catalog_name=catalog_name,
        schema_name_pattern=schema_name_pattern,
        table_name_pattern=table_name_pattern,
    )
    
    skip = page * limit
    summaries_iterator = islice(response, skip, skip + limit)
    
    summaries_list = []
    for summary in summaries_iterator:
        summaries_list.append(
            TableSummaryModel(
                full_name=summary.full_name,
                table_type=summary.table_type.value if summary.table_type else None,
            )
        )
    
    # Check for more results
    has_more = False
    try:
        next(response)
        has_more = True
    except StopIteration:
        has_more = False
    
    return ListTableSummariesResponse(
        summaries=summaries_list,
        count=len(summaries_list),
        has_more=has_more,
    )


def get_table(
    host_credential_key: str,
    token_credential_key: str,
    full_name: str,
    include_delta_metadata: Optional[bool] = None,
    include_browse: Optional[bool] = None,
) -> TableInfoModel:
    """
    Get table details.
    
    Returns detailed information about a specific table including schema,
    metadata, and configuration.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        full_name: Full name of the table (catalog.schema.table)
        include_delta_metadata: Whether delta metadata should be included
        include_browse: Include tables with browse-only access
        
    Returns:
        TableInfoModel with complete table details
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    table = client.tables.get(
        full_name=full_name,
        include_delta_metadata=include_delta_metadata,
        include_browse=include_browse,
    )
    
    # Extract columns if present
    columns = None
    if table.columns:
        columns = [
            ColumnInfoModel(
                name=col.name,
                type_text=col.type_text,
                type_name=col.type_name.value if col.type_name else None,
                type_json=col.type_json,
                position=col.position,
                comment=col.comment,
                nullable=col.nullable,
                partition_index=col.partition_index,
                type_precision=col.type_precision,
                type_scale=col.type_scale,
                type_interval_type=col.type_interval_type,
                mask=col.mask.as_dict() if col.mask else None,
            )
            for col in table.columns
        ]
    
    return TableInfoModel(
        name=table.name,
        full_name=table.full_name,
        catalog_name=table.catalog_name,
        schema_name=table.schema_name,
        table_type=table.table_type.value if table.table_type else None,
        data_source_format=table.data_source_format.value if table.data_source_format else None,
        storage_location=table.storage_location,
        owner=table.owner,
        comment=table.comment,
        properties=table.properties,
        created_at=table.created_at,
        created_by=table.created_by,
        updated_at=table.updated_at,
        updated_by=table.updated_by,
        table_id=table.table_id,
        columns=columns,
        view_definition=table.view_definition,
        sql_path=table.sql_path,
        metastore_id=table.metastore_id,
        deleted_at=table.deleted_at,
        pipeline_id=table.pipeline_id,
        browse_only=table.browse_only,
        access_point=table.access_point,
        storage_credential_name=table.storage_credential_name,
        data_access_configuration_id=table.data_access_configuration_id,
        table_constraints=[tc.as_dict() for tc in table.table_constraints] if table.table_constraints else None,
        row_filter=table.row_filter.as_dict() if table.row_filter else None,
        view_dependencies=table.view_dependencies.as_dict() if table.view_dependencies else None,
        encryption_details=table.encryption_details.as_dict() if table.encryption_details else None,
        enable_predictive_optimization=table.enable_predictive_optimization.value if table.enable_predictive_optimization else None,
        effective_predictive_optimization_flag=table.effective_predictive_optimization_flag.as_dict() if table.effective_predictive_optimization_flag else None,
        delta_runtime_properties_kvpairs=table.delta_runtime_properties_kvpairs.as_dict() if table.delta_runtime_properties_kvpairs else None,
    )


def table_exists(
    host_credential_key: str,
    token_credential_key: str,
    full_name: str,
) -> TableExistsResponseModel:
    """
    Check if a table exists.
    
    Checks if a table exists in the metastore without retrieving full metadata.
    This is more efficient than get_table when you only need to verify existence.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        full_name: Full name of the table (catalog.schema.table)
        
    Returns:
        TableExistsResponseModel with existence status
        
    
        else:
            print(f"Table {exists.full_name} does not exist")
        
        # Guard against missing tables
        table_name = "main.default.temp_analysis"
        if table_exists(host, token, full_name=table_name).table_exists:
            # Safe to proceed with operations
            pass
        else:
            # Create table first
            pass
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    response = client.tables.exists(full_name=full_name)
    
    return TableExistsResponseModel(
        table_exists=response.table_exists or False,
        full_name=full_name,
    )


# ============================================================================
# Table Management
# ============================================================================

def delete_table(
    host_credential_key: str,
    token_credential_key: str,
    full_name: str,
) -> DeleteTableResponse:
    """
    Delete a table.
    
    Deletes a table from the specified parent catalog and schema. The caller
    must be the owner of the parent catalog, have the USE_CATALOG privilege
    on the parent catalog and be the owner of the parent schema, or be the
    owner of the table and have the USE_CATALOG privilege on the parent
    catalog and the USE_SCHEMA privilege on the parent schema.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        full_name: Full name of the table (catalog.schema.table)
        
    Returns:
        DeleteTableResponse confirming deletion
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.tables.delete(full_name=full_name)
    
    return DeleteTableResponse(full_name=full_name)


def update_table_owner(
    host_credential_key: str,
    token_credential_key: str,
    full_name: str,
    owner: str,
) -> UpdateTableResponse:
    """
    Update table owner.
    
    Changes the owner of the table. The caller must be the owner of the parent
    catalog, have the USE_CATALOG privilege on the parent catalog and be the
    owner of the parent schema, or be the owner of the table and have the
    USE_CATALOG privilege on the parent catalog and the USE_SCHEMA privilege
    on the parent schema.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        full_name: Full name of the table (catalog.schema.table)
        owner: New owner username
        
    Returns:
        UpdateTableResponse confirming update
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.tables.update(
        full_name=full_name,
        owner=owner,
    )
    
    return UpdateTableResponse(full_name=full_name)

