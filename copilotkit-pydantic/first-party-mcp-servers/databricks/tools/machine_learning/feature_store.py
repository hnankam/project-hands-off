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
    host: str,
    token: str,
    page_size: int = 100,
    page_token: Optional[str] = None,
) -> ListOnlineStoresResponse:
    """
    List online feature stores.
    
    Retrieves all online feature stores in the workspace. Online stores provide
    low-latency feature lookup for real-time model inference.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        page_size: Maximum results per page (default: 100)
        page_token: Pagination token
        
    Returns:
        ListOnlineStoresResponse with online stores
        
    Example:
        # List all online stores
        response = list_online_stores(host, token)
        for store in response.online_stores:
            print(f"{store.name}")
            print(f"  Type: {store.storage_type}")
            print(f"  Region: {store.region}")
            print(f"  Status: {store.status}")
    """
    client = get_workspace_client(host, token)
    
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


def get_online_store(
    host: str,
    token: str,
    name: str,
) -> OnlineStoreModel:
    """
    Get an online feature store.
    
    Retrieves detailed information about a specific online feature store.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        name: Online store name
        
    Returns:
        OnlineStoreModel with store details
        
    Example:
        # Get store details
        store = get_online_store(host, token, "my-online-store")
        print(f"Name: {store.name}")
        print(f"Storage Type: {store.storage_type}")
        print(f"Region: {store.region}")
        print(f"Status: {store.status}")
    """
    client = get_workspace_client(host, token)
    
    store = client.feature_store.get_online_store(name=name)
    
    return _convert_to_online_store(store)


def create_online_store(
    host: str,
    token: str,
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
        host: Databricks workspace URL
        token: Authentication token
        name: Unique name for the online store
        storage_type: Storage backend type
        region: Cloud region (optional)
        config: Additional configuration (optional)
        
    Returns:
        CreateOnlineStoreResponse with created store
        
    Example:
        # Create basic online store
        response = create_online_store(
            host, token,
            name="production-features",
            storage_type="DATABRICKS_ONLINE_STORE"
        )
        print(f"Created: {response.online_store.name}")
        
        # Create with region
        response = create_online_store(
            host, token,
            name="production-features",
            storage_type="DATABRICKS_ONLINE_STORE",
            region="us-west-2"
        )
    """
    client = get_workspace_client(host, token)
    
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


def update_online_store(
    host: str,
    token: str,
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
        host: Databricks workspace URL
        token: Authentication token
        name: Online store name
        update_mask: Comma-separated list of fields to update
        storage_type: Updated storage type (optional)
        region: Updated region (optional)
        config: Updated configuration (optional)
        
    Returns:
        UpdateOnlineStoreResponse with updated store
        
    Example:
        # Update store configuration
        response = update_online_store(
            host, token,
            name="production-features",
            update_mask="region",
            region="us-east-1"
        )
    """
    client = get_workspace_client(host, token)
    
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


def delete_online_store(
    host: str,
    token: str,
    name: str,
) -> DeleteOnlineStoreResponse:
    """
    Delete an online feature store.
    
    Deletes an online feature store and all its associated online tables.
    This operation is irreversible.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        name: Online store name
        
    Returns:
        DeleteOnlineStoreResponse confirming deletion
        
    Example:
        # Delete online store
        response = delete_online_store(host, token, "old-features")
        print(response.message)
    """
    client = get_workspace_client(host, token)
    
    client.feature_store.delete_online_store(name=name)
    
    return DeleteOnlineStoreResponse(
        name=name,
    )


# ============================================================================
# Online Table Management
# ============================================================================

def publish_table(
    host: str,
    token: str,
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
        host: Databricks workspace URL
        token: Authentication token
        source_table_name: Source Unity Catalog table (catalog.schema.table)
        online_table_name: Target online table name (catalog.schema.table)
        primary_keys: List of primary key columns
        timeseries_key: Time series identifier column (optional)
        timestamp_key: Timestamp column for versioning (optional)
        
    Returns:
        PublishTableResponse confirming publication
        
    Example:
        # Publish basic feature table
        response = publish_table(
            host, token,
            source_table_name="main.ml_features.user_features",
            online_table_name="main.ml_features.user_features_online",
            primary_keys=["user_id"]
        )
        print(response.message)
        
        # Publish time series features
        response = publish_table(
            host, token,
            source_table_name="main.ml_features.sensor_readings",
            online_table_name="main.ml_features.sensor_readings_online",
            primary_keys=["sensor_id"],
            timeseries_key="sensor_id",
            timestamp_key="timestamp"
        )
        
        # Typical use case workflow:
        # 1. Create offline feature table in Unity Catalog
        # 2. Publish to online store for low-latency lookup
        # 3. Use online table in real-time model serving
        response = publish_table(
            host, token,
            source_table_name="prod.features.customer_features",
            online_table_name="prod.features.customer_features_online",
            primary_keys=["customer_id"]
        )
    """
    client = get_workspace_client(host, token)
    
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


def delete_online_table(
    host: str,
    token: str,
    online_table_name: str,
) -> DeleteOnlineTableResponse:
    """
    Delete an online table.
    
    Deletes an online feature table. This stops synchronization from the
    source table and removes the online table data.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        online_table_name: Full online table name (catalog.schema.table)
        
    Returns:
        DeleteOnlineTableResponse confirming deletion
        
    Example:
        # Delete online table
        response = delete_online_table(
            host, token,
            online_table_name="main.ml_features.user_features_online"
        )
        print(response.message)
    """
    client = get_workspace_client(host, token)
    
    client.feature_store.delete_online_table(
        online_table_name=online_table_name
    )
    
    return DeleteOnlineTableResponse(
        online_table_name=online_table_name,
    )

