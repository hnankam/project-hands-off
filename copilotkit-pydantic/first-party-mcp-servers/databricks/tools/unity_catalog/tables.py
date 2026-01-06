"""
Unity Catalog Tables Management Tools

This module provides comprehensive table management operations for Unity Catalog,
including listing, querying, and managing table metadata and permissions.
"""

from typing import Optional
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
    max_results: Optional[int] = None,
    page_token: Optional[str] = None,
    include_delta_metadata: Optional[bool] = None,
    include_browse: Optional[bool] = None,
    omit_columns: Optional[bool] = None,
    omit_properties: Optional[bool] = None,
    omit_username: Optional[bool] = None,
) -> ListTablesResponse:
    """
    List tables in a schema.
    
    Gets an array of all tables for the current metastore under the parent
    catalog and schema. The caller must be a metastore admin or an owner of
    (or have the SELECT privilege on) the table.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        catalog_name: Name of parent catalog for tables
        schema_name: Parent schema of tables
        max_results: Maximum number of tables to return (0 for server default)
        page_token: Opaque token for next page of results
        include_delta_metadata: Whether delta metadata should be included
        include_browse: Include tables with browse-only access
        omit_columns: Whether to omit the columns from the response
        omit_properties: Whether to omit the properties from the response
        omit_username: Whether to omit usernames from the response
        
    Returns:
        ListTablesResponse with list of tables and pagination info
        
    Example:
        # List all tables in a schema
        tables = list_tables(
            host, token,
            catalog_name="main",
            schema_name="default"
        )
        for table in tables.tables:
            print(f"{table.full_name} ({table.table_type})")
        
        # List with pagination
        tables = list_tables(
            host, token,
            catalog_name="main",
            schema_name="default",
            max_results=100
        )
        print(f"Found {tables.count} tables")
        if tables.next_page_token:
            next_page = list_tables(
                host, token,
                catalog_name="main",
                schema_name="default",
                max_results=100,
                page_token=tables.next_page_token
            )
        
        # List without column details for faster response
        tables = list_tables(
            host, token,
            catalog_name="main",
            schema_name="default",
            omit_columns=True,
            omit_properties=True
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    tables_list = []
    next_token = None
    
    for table in client.tables.list(
        catalog_name=catalog_name,
        schema_name=schema_name,
        max_results=max_results,
        page_token=page_token,
        include_delta_metadata=include_delta_metadata,
        include_browse=include_browse,
        omit_columns=omit_columns,
        omit_properties=omit_properties,
        omit_username=omit_username,
    ):
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
    
    return ListTablesResponse(
        tables=tables_list,
        count=len(tables_list),
        next_page_token=next_token,
    )


def list_table_summaries(
    host_credential_key: str,
    token_credential_key: str,
    catalog_name: str,
    schema_name_pattern: Optional[str] = None,
    table_name_pattern: Optional[str] = None,
    max_results: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListTableSummariesResponse:
    """
    List table summaries across schemas.
    
    Gets an array of table summaries for tables in a catalog. Supports SQL LIKE
    patterns (% and _) for filtering by schema and table names. This is more
    efficient than list_tables when you only need basic information.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        catalog_name: Name of parent catalog
        schema_name_pattern: SQL LIKE pattern for schema names (e.g., "prod_%")
        table_name_pattern: SQL LIKE pattern for table names (e.g., "%_fact")
        max_results: Maximum number of summaries to return (0 for server default)
        page_token: Opaque token for next page of results
        
    Returns:
        ListTableSummariesResponse with list of table summaries
        
    Example:
        # List all tables in a catalog
        summaries = list_table_summaries(
            host, token,
            catalog_name="main"
        )
        for summary in summaries.summaries:
            print(f"{summary.full_name}: {summary.table_type}")
        
        # Find all fact tables in production schemas
        summaries = list_table_summaries(
            host, token,
            catalog_name="main",
            schema_name_pattern="prod_%",
            table_name_pattern="%_fact"
        )
        
        # Efficient discovery of all tables
        summaries = list_table_summaries(
            host, token,
            catalog_name="main",
            max_results=1000
        )
        print(f"Found {summaries.count} tables")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    summaries_list = []
    next_token = None
    
    for summary in client.tables.list_summaries(
        catalog_name=catalog_name,
        schema_name_pattern=schema_name_pattern,
        table_name_pattern=table_name_pattern,
        max_results=max_results,
        page_token=page_token,
    ):
        summaries_list.append(
            TableSummaryModel(
                full_name=summary.full_name,
                table_type=summary.table_type.value if summary.table_type else None,
            )
        )
    
    return ListTableSummariesResponse(
        summaries=summaries_list,
        count=len(summaries_list),
        next_page_token=next_token,
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
        
    Example:
        # Get full table details
        table = get_table(
            host, token,
            full_name="main.default.sales"
        )
        print(f"Table: {table.full_name}")
        print(f"Type: {table.table_type}")
        print(f"Format: {table.data_source_format}")
        print(f"Location: {table.storage_location}")
        print(f"Owner: {table.owner}")
        print(f"Columns: {len(table.columns) if table.columns else 0}")
        
        # Get with Delta metadata
        table = get_table(
            host, token,
            full_name="main.default.sales",
            include_delta_metadata=True
        )
        if table.delta_runtime_properties_kvpairs:
            print(f"Delta properties: {table.delta_runtime_properties_kvpairs}")
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
        
    Example:
        # Check if table exists before querying
        exists = table_exists(
            host, token,
            full_name="main.default.sales"
        )
        if exists.table_exists:
            print(f"Table {exists.full_name} exists")
            table = get_table(host, token, full_name=exists.full_name)
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
        
    Example:
        # Delete a table
        result = delete_table(
            host, token,
            full_name="main.default.temp_table"
        )
        print(result.message)
        
        # Delete after checking existence
        if table_exists(host, token, full_name="main.default.old_data").table_exists:
            delete_table(host, token, full_name="main.default.old_data")
            print("Old data table deleted")
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
        
    Example:
        # Transfer table ownership
        result = update_table_owner(
            host, token,
            full_name="main.default.sales",
            owner="data-engineer@company.com"
        )
        print(result.message)
        
        # Update multiple tables
        tables = ["main.default.sales", "main.default.customers", "main.default.orders"]
        new_owner = "analytics-team@company.com"
        for table in tables:
            update_table_owner(host, token, full_name=table, owner=new_owner)
            print(f"Updated owner for {table}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.tables.update(
        full_name=full_name,
        owner=owner,
    )
    
    return UpdateTableResponse(full_name=full_name)

