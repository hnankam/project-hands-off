"""
Unity Catalog Schemas Management Tools

This module provides comprehensive schema (database) management operations for
Unity Catalog, including creating, listing, updating, and managing schema metadata.
"""

from typing import Optional, Dict
from cache import get_workspace_client
from models import (
    SchemaInfoModel,
    ListSchemasResponse,
    CreateSchemaResponse,
    DeleteSchemaResponse,
    UpdateSchemaResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_schema_to_model(schema) -> SchemaInfoModel:
    """Convert SDK SchemaInfo to Pydantic model."""
    return SchemaInfoModel(
        name=schema.name,
        full_name=schema.full_name,
        catalog_name=schema.catalog_name,
        catalog_type=schema.catalog_type,
        comment=schema.comment,
        properties=schema.properties,
        storage_root=schema.storage_root,
        storage_location=schema.storage_location,
        owner=schema.owner,
        created_at=schema.created_at,
        created_by=schema.created_by,
        updated_at=schema.updated_at,
        updated_by=schema.updated_by,
        schema_id=schema.schema_id,
        metastore_id=schema.metastore_id,
        browse_only=schema.browse_only,
        enable_predictive_optimization=schema.enable_predictive_optimization.value if schema.enable_predictive_optimization else None,
        effective_predictive_optimization_flag=schema.effective_predictive_optimization_flag.as_dict() if schema.effective_predictive_optimization_flag else None,
    )


# ============================================================================
# Schema Discovery and Inspection
# ============================================================================

def list_schemas(
    host_credential_key: str,
    token_credential_key: str,
    catalog_name: str,
    max_results: Optional[int] = None,
    page_token: Optional[str] = None,
    include_browse: Optional[bool] = None,
) -> ListSchemasResponse:
    """
    List schemas in a catalog.
    
    Gets an array of schemas for a catalog in the metastore. If the caller is
    the metastore admin or the owner of the parent catalog, all schemas will
    be retrieved. Otherwise, only schemas owned by the caller (or for which
    the caller has the USE_SCHEMA privilege) will be retrieved.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        catalog_name: Parent catalog for schemas
        max_results: Maximum number of schemas to return (0 for server default)
        page_token: Opaque token for next page of results
        include_browse: Include schemas with browse-only access
        
    Returns:
        ListSchemasResponse with list of schemas and pagination info
        
    Example:
        # List all schemas in a catalog
        schemas = list_schemas(
            host, token,
            catalog_name="main"
        )
        for schema in schemas.schemas:
            print(f"{schema.full_name}")
            print(f"  Owner: {schema.owner}")
            print(f"  Storage: {schema.storage_root}")
        
        # List with pagination
        schemas = list_schemas(
            host, token,
            catalog_name="main",
            max_results=50
        )
        print(f"Found {schemas.count} schemas")
        if schemas.next_page_token:
            next_page = list_schemas(
                host, token,
                catalog_name="main",
                max_results=50,
                page_token=schemas.next_page_token
            )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    schemas_list = []
    next_token = None
    
    for schema in client.schemas.list(
        catalog_name=catalog_name,
        max_results=max_results,
        page_token=page_token,
        include_browse=include_browse,
    ):
        schemas_list.append(_convert_schema_to_model(schema))
    
    return ListSchemasResponse(
        schemas=schemas_list,
        count=len(schemas_list),
        next_page_token=next_token,
    )


def get_schema(
    host_credential_key: str,
    token_credential_key: str,
    full_name: str,
    include_browse: Optional[bool] = None,
) -> SchemaInfoModel:
    """
    Get schema details.
    
    Returns detailed information about a specific schema including metadata
    and configuration.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        full_name: Full name of the schema (catalog.schema)
        include_browse: Include schemas with browse-only access
        
    Returns:
        SchemaInfoModel with complete schema details
        
    Example:
        # Get full schema details
        schema = get_schema(
            host, token,
            full_name="main.default"
        )
        print(f"Schema: {schema.full_name}")
        print(f"Catalog: {schema.catalog_name}")
        print(f"Owner: {schema.owner}")
        print(f"Storage: {schema.storage_root}")
        print(f"Comment: {schema.comment}")
        print(f"Created: {schema.created_at} by {schema.created_by}")
        
        # Check properties
        if schema.properties:
            print("Properties:")
            for key, value in schema.properties.items():
                print(f"  {key}: {value}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    schema = client.schemas.get(
        full_name=full_name,
        include_browse=include_browse,
    )
    
    return _convert_schema_to_model(schema)


# ============================================================================
# Schema Management
# ============================================================================

def create_schema(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    catalog_name: str,
    comment: Optional[str] = None,
    properties: Optional[Dict[str, str]] = None,
    storage_root: Optional[str] = None,
) -> CreateSchemaResponse:
    """
    Create a new schema.
    
    Creates a new schema (database) for a catalog in the metastore. The caller
    must be a metastore admin or have the CREATE_SCHEMA privilege in the
    parent catalog.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Name of schema, relative to parent catalog
        catalog_name: Name of parent catalog
        comment: User-provided free-form text description
        properties: Map of key-value properties attached to the schema
        storage_root: Storage root URL for managed tables within schema
        
    Returns:
        CreateSchemaResponse with created schema information
        
    Example:
        # Create a basic schema
        result = create_schema(
            host, token,
            name="analytics",
            catalog_name="main",
            comment="Analytics tables and views"
        )
        print(f"Created schema: {result.schema_info.full_name}")
        
        # Create schema with custom storage
        result = create_schema(
            host, token,
            name="staging",
            catalog_name="main",
            comment="Staging data",
            storage_root="s3://my-bucket/staging/"
        )
        
        # Create schema with properties
        result = create_schema(
            host, token,
            name="prod",
            catalog_name="main",
            comment="Production tables",
            properties={
                "environment": "production",
                "owner_team": "data-engineering",
                "cost_center": "12345"
            }
        )
        print(f"Schema {result.schema_info.full_name} created with properties")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    schema = client.schemas.create(
        name=name,
        catalog_name=catalog_name,
        comment=comment,
        properties=properties,
        storage_root=storage_root,
    )
    
    return CreateSchemaResponse(
        schema_info=_convert_schema_to_model(schema),
    )


def delete_schema(
    host_credential_key: str,
    token_credential_key: str,
    full_name: str,
    force: Optional[bool] = None,
) -> DeleteSchemaResponse:
    """
    Delete a schema.
    
    Deletes the specified schema from the parent catalog. The caller must be
    the owner of the schema or an owner of the parent catalog.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        full_name: Full name of the schema (catalog.schema)
        force: Force deletion even if the schema is not empty
        
    Returns:
        DeleteSchemaResponse confirming deletion
        
    Example:
        # Delete an empty schema
        result = delete_schema(
            host, token,
            full_name="main.temp_schema"
        )
        print(result.message)
        
        # Force delete a schema with tables
        result = delete_schema(
            host, token,
            full_name="main.old_schema",
            force=True
        )
        print(f"Force deleted {result.full_name}")
        
        # Delete after checking if exists
        try:
            schema = get_schema(host, token, full_name="main.staging")
            delete_schema(host, token, full_name="main.staging")
            print("Schema deleted")
        except Exception as e:
            print(f"Schema not found or cannot be deleted: {e}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.schemas.delete(
        full_name=full_name,
        force=force,
    )
    
    return DeleteSchemaResponse(full_name=full_name)


def update_schema(
    host_credential_key: str,
    token_credential_key: str,
    full_name: str,
    new_name: Optional[str] = None,
    comment: Optional[str] = None,
    owner: Optional[str] = None,
    properties: Optional[Dict[str, str]] = None,
    enable_predictive_optimization: Optional[str] = None,
) -> UpdateSchemaResponse:
    """
    Update a schema.
    
    Updates a schema for a catalog. The caller must be the owner of the schema
    or a metastore admin. If the caller is a metastore admin, only the owner
    field can be changed. If the name field must be updated, the caller must
    be a metastore admin or have the CREATE_SCHEMA privilege on the parent catalog.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        full_name: Full name of the schema (catalog.schema)
        new_name: New name for the schema
        comment: User-provided free-form text description
        owner: New owner username
        properties: Map of key-value properties
        enable_predictive_optimization: Predictive optimization setting
        
    Returns:
        UpdateSchemaResponse with updated schema information
        
    Example:
        # Update schema comment
        result = update_schema(
            host, token,
            full_name="main.analytics",
            comment="Updated analytics schema with new datasets"
        )
        print(f"Updated: {result.schema_info.full_name}")
        
        # Transfer ownership
        result = update_schema(
            host, token,
            full_name="main.staging",
            owner="data-engineer@company.com"
        )
        print(f"New owner: {result.schema_info.owner}")
        
        # Rename schema
        result = update_schema(
            host, token,
            full_name="main.old_name",
            new_name="new_name"
        )
        print(f"Renamed to: {result.schema_info.full_name}")
        
        # Update properties
        result = update_schema(
            host, token,
            full_name="main.prod",
            properties={
                "environment": "production",
                "data_classification": "confidential",
                "backup_enabled": "true"
            }
        )
        
        # Enable predictive optimization
        result = update_schema(
            host, token,
            full_name="main.analytics",
            enable_predictive_optimization="ENABLE"
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Convert enable_predictive_optimization string to enum if provided
    enable_pred_opt = None
    if enable_predictive_optimization:
        from databricks.sdk.service.catalog import EnablePredictiveOptimization
        enable_pred_opt = EnablePredictiveOptimization(enable_predictive_optimization)
    
    schema = client.schemas.update(
        full_name=full_name,
        new_name=new_name,
        comment=comment,
        owner=owner,
        properties=properties,
        enable_predictive_optimization=enable_pred_opt,
    )
    
    return UpdateSchemaResponse(
        schema_info=_convert_schema_to_model(schema),
    )

