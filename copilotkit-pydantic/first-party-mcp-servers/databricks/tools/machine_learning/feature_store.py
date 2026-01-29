"""
Feature Store Tools

This module provides tools for managing the Feature Store in Databricks.
A feature store is a centralized repository for finding and sharing features,
ensuring consistent code for training and inference. Online stores provide
low-latency feature lookup for real-time model inference.
"""

from typing import Optional, Dict, Any
from cache import get_workspace_client
from models import (
    OnlineStoreModel,
    ListOnlineStoresResponse,
    CreateOnlineStoreResponse,
    UpdateOnlineStoreResponse,
    DeleteOnlineStoreResponse,
    PublishTableResponse,
    DeleteOnlineTableResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_online_store(store) -> OnlineStoreModel:
    """Convert SDK OnlineStore to Pydantic model."""
    return OnlineStoreModel(
        name=store.name if hasattr(store, 'name') else None,
        storage_type=store.storage_type if hasattr(store, 'storage_type') else None,
        region=store.region if hasattr(store, 'region') else None,
        status=store.status.value if hasattr(store, 'status') and store.status else None,
        creation_time=store.creation_time if hasattr(store, 'creation_time') else None,
        last_updated_time=store.last_updated_time if hasattr(store, 'last_updated_time') else None,
    )


# ============================================================================
# Online Store Management
# ============================================================================

def list_online_stores(
    host_credential_key: str,
    token_credential_key: str,
    page_size: int = 100,
    page_token: Optional[str] = None,
) -> ListOnlineStoresResponse:
    """
    List online feature stores.
    
    Retrieves all online feature stores in the workspace. Online stores provide
    low-latency feature lookup for real-time model inference.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        page_size: Maximum results per page (default: 100)
        page_token: Pagination token
        
    Returns:
        ListOnlineStoresResponse with online stores
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        stores = []
        next_token = None
    
        for store in client.feature_store.list_online_stores(
            page_size=page_size,
            page_token=page_token,
        ):
            stores.append(_convert_to_online_store(store))
    
        return ListOnlineStoresResponse(
            online_stores=stores,
            next_page_token=next_token,
        )

    except Exception as e:
        return ListOnlineStoresResponse(
            online_stores=[],
            next_page_token=None,
            error_message=f"Failed to list online stores: {str(e)}",
        )


def get_online_store(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> Optional[OnlineStoreModel]:
    """
    Get an online feature store.
    
    Retrieves detailed information about a specific online feature store.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Online store name
        
    Returns:
        OnlineStoreModel with store details, or None on error
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        store = client.feature_store.get_online_store(name=name)
    
        return _convert_to_online_store(store)

    except Exception as e:
        return None


def create_online_store(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    storage_type: str,
    region: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> CreateOnlineStoreResponse:
    """
    Create an online feature store.
    
    Creates a new online feature store for low-latency feature lookup during
    real-time model inference. Online stores enable serving features to
    real-time applications.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Unique name for the online store
        storage_type: Storage backend type
        region: Cloud region (optional)
        config: Additional configuration (optional)
        
    Returns:
        CreateOnlineStoreResponse with created store
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Create OnlineStore object
        from databricks.sdk.service.ml import OnlineStore
    
        online_store_spec = OnlineStore(
            name=name,
            storage_type=storage_type,
            region=region,
        )
    
        # Add config if provided
        if config:
            for key, value in config.items():
                setattr(online_store_spec, key, value)
    
        store = client.feature_store.create_online_store(
            online_store=online_store_spec
        )
    
        return CreateOnlineStoreResponse(
            online_store=_convert_to_online_store(store),
        )

    except Exception as e:
        return CreateOnlineStoreResponse(
            online_store=None,
            error_message=f"Failed to create online store: {str(e)}",
        )


def update_online_store(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    update_mask: str,
    storage_type: Optional[str] = None,
    region: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> UpdateOnlineStoreResponse:
    """
    Update an online feature store.
    
    Updates the configuration of an existing online feature store.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Online store name
        update_mask: Comma-separated list of fields to update
        storage_type: Updated storage type (optional)
        region: Updated region (optional)
        config: Updated configuration (optional)
        
    Returns:
        UpdateOnlineStoreResponse with updated store
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Create OnlineStore object with updates
        from databricks.sdk.service.ml import OnlineStore
    
        online_store_spec = OnlineStore(
            name=name,
            storage_type=storage_type,
            region=region,
        )
    
        # Add config if provided
        if config:
            for key, value in config.items():
                setattr(online_store_spec, key, value)
    
        store = client.feature_store.update_online_store(
            name=name,
            online_store=online_store_spec,
            update_mask=update_mask,
        )
    
        return UpdateOnlineStoreResponse(
            online_store=_convert_to_online_store(store),
        )

    except Exception as e:
        return UpdateOnlineStoreResponse(
            online_store=None,
            error_message=f"Failed to update online store: {str(e)}",
        )


def delete_online_store(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> DeleteOnlineStoreResponse:
    """
    Delete an online feature store.
    
    Deletes an online feature store and all its associated online tables.
    This operation is irreversible.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Online store name
        
    Returns:
        DeleteOnlineStoreResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.feature_store.delete_online_store(name=name)
    
        return DeleteOnlineStoreResponse(
            name=name,
        )

    except Exception as e:
        return DeleteOnlineStoreResponse(
            name=None,
            error_message=f"Failed to delete online store: {str(e)}",
        )


# ============================================================================
# Online Table Management
# ============================================================================

def publish_table(
    host_credential_key: str,
    token_credential_key: str,
    source_table_name: str,
    online_table_name: str,
    primary_keys: list[str],
    timeseries_key: Optional[str] = None,
    timestamp_key: Optional[str] = None,
) -> PublishTableResponse:
    """
    Publish features to an online table.
    
    Publishes a Unity Catalog table to an online feature store for low-latency
    feature lookup. The online table is continuously synchronized with the source.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        source_table_name: Source Unity Catalog table (catalog.schema.table)
        online_table_name: Target online table name (catalog.schema.table)
        primary_keys: List of primary key columns
        timeseries_key: Time series identifier column (optional)
        timestamp_key: Timestamp column for versioning (optional)
        
    Returns:
        PublishTableResponse confirming publication
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Create PublishSpec
        from databricks.sdk.service.ml import PublishSpec
    
        publish_spec = PublishSpec(
            online_table_name=online_table_name,
            primary_keys=primary_keys,
            timeseries_key=timeseries_key,
            timestamp_key=timestamp_key,
        )
    
        result = client.feature_store.publish_table(
            source_table_name=source_table_name,
            publish_spec=publish_spec,
        )
    
        return PublishTableResponse(
            online_table_name=online_table_name,
        )

    except Exception as e:
        return PublishTableResponse(
            online_table_name=None,
            error_message=f"Failed to publish table: {str(e)}",
        )


def delete_online_table(
    host_credential_key: str,
    token_credential_key: str,
    online_table_name: str,
) -> DeleteOnlineTableResponse:
    """
    Delete an online table.
    
    Deletes an online feature table. This stops synchronization from the
    source table and removes the online table data.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        online_table_name: Full online table name (catalog.schema.table)
        
    Returns:
        DeleteOnlineTableResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.feature_store.delete_online_table(
            online_table_name=online_table_name
        )
    
        return DeleteOnlineTableResponse(
            online_table_name=online_table_name,
        )

    except Exception as e:
        return DeleteOnlineTableResponse(
            online_table_name=None,
            error_message=f"Failed to delete online table: {str(e)}",
        )

