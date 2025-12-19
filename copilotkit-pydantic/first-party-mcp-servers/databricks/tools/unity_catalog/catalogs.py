"""
Unity Catalog Catalogs Management Tools

This module provides comprehensive catalog management operations for Unity Catalog,
including creating, listing, updating, and managing catalog metadata and isolation modes.
"""

from typing import Optional, Dict
from cache import get_workspace_client
from models import (
    CatalogInfoModel,
    ListCatalogsResponse,
    CreateCatalogResponse,
    DeleteCatalogResponse,
    UpdateCatalogResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_catalog_to_model(catalog) -> CatalogInfoModel:
    """Convert SDK CatalogInfo to Pydantic model."""
    return CatalogInfoModel(
        name=catalog.name,
        full_name=catalog.full_name,
        catalog_type=catalog.catalog_type.value if catalog.catalog_type else None,
        comment=catalog.comment,
        connection_name=catalog.connection_name,
        properties=catalog.properties,
        options=catalog.options,
        storage_root=catalog.storage_root,
        storage_location=catalog.storage_location,
        provider_name=catalog.provider_name,
        share_name=catalog.share_name,
        owner=catalog.owner,
        created_at=catalog.created_at,
        created_by=catalog.created_by,
        updated_at=catalog.updated_at,
        updated_by=catalog.updated_by,
        metastore_id=catalog.metastore_id,
        isolation_mode=catalog.isolation_mode.value if catalog.isolation_mode else None,
        securable_type=catalog.securable_type,
        browse_only=catalog.browse_only,
        enable_predictive_optimization=catalog.enable_predictive_optimization.value if catalog.enable_predictive_optimization else None,
        effective_predictive_optimization_flag=catalog.effective_predictive_optimization_flag.as_dict() if catalog.effective_predictive_optimization_flag else None,
        provisioning_info=catalog.provisioning_info.as_dict() if catalog.provisioning_info else None,
    )


# ============================================================================
# Catalog Discovery and Inspection
# ============================================================================

def list_catalogs(
    host: str,
    token: str,
    max_results: Optional[int] = None,
    page_token: Optional[str] = None,
    include_browse: Optional[bool] = None,
) -> ListCatalogsResponse:
    """
    List catalogs in the metastore.
    
    Gets an array of catalogs in the metastore. If the caller is the metastore
    admin, all catalogs will be retrieved. Otherwise, only catalogs owned by
    the caller (or for which the caller has the USE_CATALOG privilege) will
    be retrieved.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        max_results: Maximum number of catalogs to return (0 for server default)
        page_token: Opaque token for next page of results
        include_browse: Include catalogs with browse-only access
        
    Returns:
        ListCatalogsResponse with list of catalogs and pagination info
        
    Example:
        # List all catalogs
        catalogs = list_catalogs(host, token)
        for catalog in catalogs.catalogs:
            print(f"{catalog.name}")
            print(f"  Owner: {catalog.owner}")
            print(f"  Type: {catalog.catalog_type}")
            print(f"  Storage: {catalog.storage_root}")
        
        # List with pagination
        catalogs = list_catalogs(
            host, token,
            max_results=50
        )
        print(f"Found {catalogs.count} catalogs")
        if catalogs.next_page_token:
            next_page = list_catalogs(
                host, token,
                max_results=50,
                page_token=catalogs.next_page_token
            )
    """
    client = get_workspace_client(host, token)
    
    catalogs_list = []
    next_token = None
    
    for catalog in client.catalogs.list(
        max_results=max_results,
        page_token=page_token,
        include_browse=include_browse,
    ):
        catalogs_list.append(_convert_catalog_to_model(catalog))
    
    return ListCatalogsResponse(
        catalogs=catalogs_list,
        count=len(catalogs_list),
        next_page_token=next_token,
    )


def get_catalog(
    host: str,
    token: str,
    name: str,
    include_browse: Optional[bool] = None,
) -> CatalogInfoModel:
    """
    Get catalog details.
    
    Returns detailed information about a specific catalog including metadata,
    configuration, and isolation settings.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        name: Name of the catalog
        include_browse: Include catalogs with browse-only access
        
    Returns:
        CatalogInfoModel with complete catalog details
        
    Example:
        # Get full catalog details
        catalog = get_catalog(host, token, name="main")
        print(f"Catalog: {catalog.name}")
        print(f"Type: {catalog.catalog_type}")
        print(f"Owner: {catalog.owner}")
        print(f"Storage: {catalog.storage_root}")
        print(f"Isolation: {catalog.isolation_mode}")
        print(f"Comment: {catalog.comment}")
        print(f"Created: {catalog.created_at} by {catalog.created_by}")
        
        # Check properties
        if catalog.properties:
            print("Properties:")
            for key, value in catalog.properties.items():
                print(f"  {key}: {value}")
    """
    client = get_workspace_client(host, token)
    
    catalog = client.catalogs.get(
        name=name,
        include_browse=include_browse,
    )
    
    return _convert_catalog_to_model(catalog)


# ============================================================================
# Catalog Management
# ============================================================================

def create_catalog(
    host: str,
    token: str,
    name: str,
    comment: Optional[str] = None,
    properties: Optional[Dict[str, str]] = None,
    storage_root: Optional[str] = None,
    connection_name: Optional[str] = None,
    options: Optional[Dict[str, str]] = None,
    provider_name: Optional[str] = None,
    share_name: Optional[str] = None,
) -> CreateCatalogResponse:
    """
    Create a new catalog.
    
    Creates a new catalog instance in the parent metastore. The caller must
    be a metastore admin or have the CREATE_CATALOG privilege.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        name: Name of catalog
        comment: User-provided free-form text description
        properties: Map of key-value properties attached to the catalog
        storage_root: Storage root URL for managed tables within catalog
        connection_name: Name of connection to external data source
        options: Map of key-value options
        provider_name: Name of Delta Sharing provider (for Delta Sharing catalogs)
        share_name: Name of share under the share provider (for Delta Sharing catalogs)
        
    Returns:
        CreateCatalogResponse with created catalog information
        
    Example:
        # Create a basic catalog
        result = create_catalog(
            host, token,
            name="analytics",
            comment="Analytics data catalog"
        )
        print(f"Created catalog: {result.catalog_info.name}")
        
        # Create catalog with custom storage
        result = create_catalog(
            host, token,
            name="external_data",
            comment="External data sources",
            storage_root="s3://my-bucket/external/"
        )
        
        # Create catalog with properties
        result = create_catalog(
            host, token,
            name="prod_data",
            comment="Production data catalog",
            properties={
                "environment": "production",
                "cost_center": "12345",
                "data_classification": "confidential"
            }
        )
        print(f"Catalog {result.catalog_info.name} created with properties")
        
        # Create Delta Sharing catalog
        result = create_catalog(
            host, token,
            name="shared_catalog",
            comment="Shared data catalog",
            provider_name="my_sharing_provider",
            share_name="my_share"
        )
    """
    client = get_workspace_client(host, token)
    
    catalog = client.catalogs.create(
        name=name,
        comment=comment,
        properties=properties,
        storage_root=storage_root,
        connection_name=connection_name,
        options=options,
        provider_name=provider_name,
        share_name=share_name,
    )
    
    return CreateCatalogResponse(
        catalog_info=_convert_catalog_to_model(catalog),
    )


def delete_catalog(
    host: str,
    token: str,
    name: str,
    force: Optional[bool] = None,
) -> DeleteCatalogResponse:
    """
    Delete a catalog.
    
    Deletes the catalog that matches the supplied name. The caller must be
    a metastore admin or the owner of the catalog.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        name: Name of the catalog
        force: Force deletion even if the catalog is not empty
        
    Returns:
        DeleteCatalogResponse confirming deletion
        
    Example:
        # Delete an empty catalog
        result = delete_catalog(host, token, name="temp_catalog")
        print(result.message)
        
        # Force delete a catalog with schemas
        result = delete_catalog(
            host, token,
            name="old_catalog",
            force=True
        )
        print(f"Force deleted {result.name}")
        
        # Delete after checking if exists
        try:
            catalog = get_catalog(host, token, name="staging")
            delete_catalog(host, token, name="staging")
            print("Catalog deleted")
        except Exception as e:
            print(f"Catalog not found or cannot be deleted: {e}")
    """
    client = get_workspace_client(host, token)
    
    client.catalogs.delete(
        name=name,
        force=force,
    )
    
    return DeleteCatalogResponse(name=name)


def update_catalog(
    host: str,
    token: str,
    name: str,
    new_name: Optional[str] = None,
    comment: Optional[str] = None,
    owner: Optional[str] = None,
    properties: Optional[Dict[str, str]] = None,
    options: Optional[Dict[str, str]] = None,
    isolation_mode: Optional[str] = None,
    enable_predictive_optimization: Optional[str] = None,
) -> UpdateCatalogResponse:
    """
    Update a catalog.
    
    Updates the catalog that matches the supplied name. The caller must be
    either the owner of the catalog or a metastore admin (when changing the
    owner field of the catalog).
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        name: Name of the catalog
        new_name: New name for the catalog
        comment: User-provided free-form text description
        owner: New owner username
        properties: Map of key-value properties
        options: Map of key-value options
        isolation_mode: Isolation mode (OPEN, ISOLATED)
        enable_predictive_optimization: Predictive optimization setting
        
    Returns:
        UpdateCatalogResponse with updated catalog information
        
    Example:
        # Update catalog comment
        result = update_catalog(
            host, token,
            name="analytics",
            comment="Updated analytics catalog with new datasets"
        )
        print(f"Updated: {result.catalog_info.name}")
        
        # Transfer ownership
        result = update_catalog(
            host, token,
            name="staging",
            owner="data-engineer@company.com"
        )
        print(f"New owner: {result.catalog_info.owner}")
        
        # Rename catalog
        result = update_catalog(
            host, token,
            name="old_name",
            new_name="new_name"
        )
        print(f"Renamed to: {result.catalog_info.name}")
        
        # Set isolation mode to ISOLATED
        result = update_catalog(
            host, token,
            name="sensitive_data",
            isolation_mode="ISOLATED"
        )
        print(f"Isolation mode: {result.catalog_info.isolation_mode}")
        
        # Update properties
        result = update_catalog(
            host, token,
            name="prod",
            properties={
                "environment": "production",
                "data_classification": "confidential",
                "backup_enabled": "true"
            }
        )
        
        # Enable predictive optimization
        result = update_catalog(
            host, token,
            name="analytics",
            enable_predictive_optimization="ENABLE"
        )
    """
    client = get_workspace_client(host, token)
    
    # Convert string parameters to enums if provided
    isolation_mode_obj = None
    if isolation_mode:
        from databricks.sdk.service.catalog import CatalogIsolationMode
        isolation_mode_obj = CatalogIsolationMode(isolation_mode)
    
    enable_pred_opt = None
    if enable_predictive_optimization:
        from databricks.sdk.service.catalog import EnablePredictiveOptimization
        enable_pred_opt = EnablePredictiveOptimization(enable_predictive_optimization)
    
    catalog = client.catalogs.update(
        name=name,
        new_name=new_name,
        comment=comment,
        owner=owner,
        properties=properties,
        options=options,
        isolation_mode=isolation_mode_obj,
        enable_predictive_optimization=enable_pred_opt,
    )
    
    return UpdateCatalogResponse(
        catalog_info=_convert_catalog_to_model(catalog),
    )

