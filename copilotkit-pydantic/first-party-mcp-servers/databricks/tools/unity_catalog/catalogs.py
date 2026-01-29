"""
Unity Catalog Catalogs Management Tools

This module provides comprehensive catalog management operations for Unity Catalog,
including creating, listing, updating, and managing catalog metadata and isolation modes.
"""

from typing import Optional, Dict
from itertools import islice
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
    host_credential_key: str,
    token_credential_key: str,
    limit: int = 25,
    page: int = 0,
    include_browse: Optional[bool] = None,
) -> ListCatalogsResponse:
    """
    Retrieve a paginated list of catalogs within the Unity Catalog metastore.
    
    This function returns catalog metadata for all accessible catalogs in the metastore.
    Use this to discover available catalogs, check catalog types, or list top-level data organization.
    
    Access Behavior:
    - Metastore admins receive all catalogs in the metastore
    - Other users receive only catalogs they own or have USE_CATALOG privilege on
    - Results filtered based on caller's permissions automatically
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        limit: Number of catalogs to return in a single request. Must be positive integer. Default: 25. Maximum: 20 when include_browse=True
        page: Zero-indexed page number for pagination. Default: 0
        include_browse: Boolean flag to include catalogs where user has only browse permission (no USE_CATALOG). Default: None (excluded)
        
    Returns:
        ListCatalogsResponse with list of catalogs and pagination info
    """
    try:
        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Cap limit at 20 when include_browse is True to reduce response size
        effective_limit = min(limit, 20) if include_browse else limit
    
        response = client.catalogs.list(
            include_browse=include_browse,
        )
    
        skip = page * effective_limit
        catalogs_iterator = islice(response, skip, skip + effective_limit)
    
        catalogs_list = []
        for catalog in catalogs_iterator:
            catalogs_list.append(_convert_catalog_to_model(catalog))
    
        # Check for more results
        has_more = False
        try:
            next(response)
            has_more = True
        except StopIteration:
            has_more = False
        
        return ListCatalogsResponse(
            catalogs=catalogs_list,
            count=len(catalogs_list),
            has_more=has_more,
        )
    except Exception as e:
        return ListCatalogsResponse(
            catalogs=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list catalogs: {str(e)}",
        )


def get_catalog(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    include_browse: Optional[bool] = None,
) -> Optional[CatalogInfoModel]:
    """
    Get catalog details.
    
    Returns detailed information about a specific catalog including metadata,
    configuration, and isolation settings.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Name of the catalog
        include_browse: Include catalogs with browse-only access
        
    Returns:
        CatalogInfoModel with complete catalog details
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        catalog = client.catalogs.get(
            name=name,
            include_browse=include_browse,
        )
    
        return _convert_catalog_to_model(catalog)

    except Exception as e:
        return CatalogInfoModel(
            name=name,
            error_message=f"Failed to get catalog: {str(e)}",
        )


# ============================================================================
# Catalog Management
# ============================================================================

def create_catalog(
    host_credential_key: str,
    token_credential_key: str,
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
        host_credential_key: Credential key for workspace URL
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
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
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

    except Exception as e:
        return CreateCatalogResponse(
            catalog_info=None,
            error_message=f"Failed to create catalog: {str(e)}",
        )


def delete_catalog(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    force: Optional[bool] = None,
) -> DeleteCatalogResponse:
    """
    Delete a catalog.
    
    Deletes the catalog that matches the supplied name. The caller must be
    a metastore admin or the owner of the catalog.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Name of the catalog
        force: Force deletion even if the catalog is not empty
        
    Returns:
        DeleteCatalogResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.catalogs.delete(
            name=name,
            force=force,
        )
    
        return DeleteCatalogResponse(name=name)

    except Exception as e:
        return DeleteCatalogResponse(
            name=name,
            error_message=f"Failed to delete catalog: {str(e)}",
        )


def update_catalog(
    host_credential_key: str,
    token_credential_key: str,
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
        host_credential_key: Credential key for workspace URL
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
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
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

    except Exception as e:
        return UpdateCatalogResponse(
            catalog_info=None,
            error_message=f"Failed to update catalog: {str(e)}",
        )

