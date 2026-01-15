"""
Unity Catalog Schemas Management Tools

This module provides comprehensive schema (database) management operations for
Unity Catalog, including creating, listing, updating, and managing schema metadata.
"""

from typing import Optional, Dict
from itertools import islice
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
    limit: int = 25,
    page: int = 0,
    include_browse: Optional[bool] = None,
) -> ListSchemasResponse:
    """
    Retrieve a paginated list of schemas (databases) within a Unity Catalog.
    
    This function returns schema metadata for all accessible schemas in the specified catalog.
    Use this to discover available schemas, check schema ownership, or list organizational units.
    
    Access Behavior:
    - Metastore admins and catalog owners receive all schemas in the catalog
    - Other users receive only schemas they own or have USE_SCHEMA privilege on
    - Results filtered based on caller's permissions automatically
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        catalog_name: Name of the Unity Catalog containing the schemas. Required. Must be exact match
        limit: Number of schemas to return in a single request. Must be positive integer. Default: 25. Maximum: 20 when include_browse=True
        page: Zero-indexed page number for pagination. Default: 0
        include_browse: Boolean flag to include schemas where user has only browse permission (no USE_SCHEMA). Default: None (excluded)
        
    Returns:
        ListSchemasResponse with list of schemas and pagination info
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Cap limit at 20 when include_browse is True to reduce response size
    effective_limit = min(limit, 20) if include_browse else limit
    
    response = client.schemas.list(
        catalog_name=catalog_name,
        include_browse=include_browse,
    )
    
    skip = page * effective_limit
    schemas_iterator = islice(response, skip, skip + effective_limit)
    
    schemas_list = []
    for schema in schemas_iterator:
        schemas_list.append(_convert_schema_to_model(schema))
    
    # Check for more results
    has_more = False
    try:
        next(response)
        has_more = True
    except StopIteration:
        has_more = False
    
    return ListSchemasResponse(
        schemas=schemas_list,
        count=len(schemas_list),
        has_more=has_more,
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

