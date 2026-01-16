"""SQL Warehouse management tools for compute resource lifecycle."""

from typing import Optional, List
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import (
    CreateWarehouseRequestWarehouseType,
    EditWarehouseRequestWarehouseType,
    EndpointTags as SDKEndpointTags,
    EndpointTagPair as SDKEndpointTagPair,
    SpotInstancePolicy,
    Channel,
)
from cache import get_workspace_client
from models import (
    WarehouseInfo,
    ListWarehousesResponse,
    CreateWarehouseResponse,
    UpdateWarehouseResponse,
    DeleteWarehouseResponse,
    StartWarehouseResponse,
    StopWarehouseResponse,
    EndpointHealth,
    EndpointTags,
    EndpointTagPair,
)


def list_warehouses(
    host_credential_key: str,
    token_credential_key: str,
    limit: int = 25,
    page: int = 0,
) -> ListWarehousesResponse:
    """
    Retrieve a paginated list of SQL warehouses accessible to the user.
    
    Use this to discover available compute resources for SQL execution.
    Essential for agents to find warehouses before executing statements.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        limit: Number of warehouses to return in a single request. Must be positive integer. Default: 25
        page: Zero-indexed page number for pagination. Default: 0
    
    Returns:
        ListWarehousesResponse containing:
        - warehouses: List of WarehouseInfo objects with warehouse metadata
        - count: Integer number of warehouses returned in this page (0 to limit)
        - has_more: Boolean indicating if additional warehouses exist beyond this page
        
    Pagination:
        - Returns up to `limit` warehouses per call
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available
    """
    try:
    from itertools import islice
    
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    response = client.warehouses.list()
    
    skip = page * limit
    warehouses_iterator = islice(response, skip, skip + limit)
    
    warehouses = []
    for endpoint in warehouses_iterator:
        endpoint_dict = endpoint.as_dict()
        warehouses.append(_convert_warehouse_info(endpoint_dict))
    
    # Check for more results
    has_more = False
    try:
        next(response)
        has_more = True
    except StopIteration:
        has_more = False
    
    return ListWarehousesResponse(
        warehouses=warehouses,
        count=len(warehouses),
        has_more=has_more,
    )
    except Exception as e:
        return ListWarehousesResponse(
            warehouses=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list warehouses: {str(e)}",
        )


def get_warehouse(
    host_credential_key: str,
    token_credential_key: str,
    warehouse_id: str
) -> Optional[WarehouseInfo]:
    """
    Get detailed information about a specific SQL warehouse.
    
    Use this to check warehouse state, configuration, and health before
    executing statements.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        warehouse_id: ID of the SQL warehouse
    
    Returns:
        WarehouseInfo with complete warehouse details, or None on error
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    response = client.warehouses.get(id=warehouse_id)
    return _convert_warehouse_info(response.as_dict())
    except Exception as e:
        return WarehouseInfo(
            id=warehouse_id,
            error_message=f"Failed to get warehouse: {str(e)}",
        )


def create_warehouse(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    cluster_size: str = "2X-Small",
    min_num_clusters: int = 1,
    max_num_clusters: int = 1,
    auto_stop_mins: int = 10,
    warehouse_type: Optional[str] = "PRO",
    enable_photon: Optional[bool] = True,
    enable_serverless_compute: Optional[bool] = False,
    tags: Optional[List[EndpointTagPair]] = None,
    spot_instance_policy: Optional[str] = None
) -> CreateWarehouseResponse:
    """
    Create a new SQL warehouse.
    
    Creates a compute resource for executing SQL statements. Useful for agents
    to provision dedicated warehouses for specific workloads.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        name: Unique warehouse name
        cluster_size: Cluster size (2X-Small, X-Small, Small, Medium, Large, X-Large, 2X-Large, 3X-Large, 4X-Large)
        min_num_clusters: Minimum number of clusters (default: 1)
        max_num_clusters: Maximum number of clusters for auto-scaling (default: 1)
        auto_stop_mins: Auto-stop timeout in minutes (0 = disabled, >=10) (default: 10)
        warehouse_type: Warehouse type (PRO or CLASSIC) (default: PRO)
        enable_photon: Enable Photon query engine for performance (default: True)
        enable_serverless_compute: Enable serverless compute (requires PRO type) (default: False)
        tags: List of custom tags for resource tracking
        spot_instance_policy: Spot instance policy (COST_OPTIMIZED, RELIABILITY_OPTIMIZED)
    
    Returns:
        CreateWarehouseResponse with created warehouse details
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Convert tags
    sdk_tags = None
    if tags:
        sdk_tags = SDKEndpointTags(
            custom_tags=[SDKEndpointTagPair(key=t.key, value=t.value) for t in tags]
        )
    
    # Create warehouse (returns long-running operation waiter)
    created = client.warehouses.create(
        name=name,
        cluster_size=cluster_size,
        min_num_clusters=min_num_clusters,
        max_num_clusters=max_num_clusters,
        auto_stop_mins=auto_stop_mins,
        warehouse_type=CreateWarehouseRequestWarehouseType(warehouse_type) if warehouse_type else None,
        enable_photon=enable_photon,
        enable_serverless_compute=enable_serverless_compute,
        tags=sdk_tags,
        spot_instance_policy=SpotInstancePolicy(spot_instance_policy) if spot_instance_policy else None
    ).result()  # Wait for creation to complete
    
    return CreateWarehouseResponse(
        id=created.id,
        name=created.name,
        state=created.state.value if created.state else "UNKNOWN",
        message=f"Warehouse '{name}' created successfully"
    )
    except Exception as e:
        return CreateWarehouseResponse(
            id=None,
            name=name,
            state=None,
            error_message=f"Failed to create warehouse: {str(e)}",
        )


def update_warehouse(
    host_credential_key: str,
    token_credential_key: str,
    warehouse_id: str,
    name: Optional[str] = None,
    cluster_size: Optional[str] = None,
    min_num_clusters: Optional[int] = None,
    max_num_clusters: Optional[int] = None,
    auto_stop_mins: Optional[int] = None,
    enable_photon: Optional[bool] = None,
    enable_serverless_compute: Optional[bool] = None,
    tags: Optional[List[EndpointTagPair]] = None
) -> UpdateWarehouseResponse:
    """
    Update an existing SQL warehouse configuration.
    
    Modify warehouse settings such as size, auto-scaling, and features.
    The warehouse will restart if configuration changes require it.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        warehouse_id: ID of the warehouse to update
        name: New warehouse name
        cluster_size: New cluster size
        min_num_clusters: New minimum clusters
        max_num_clusters: New maximum clusters
        auto_stop_mins: New auto-stop timeout
        enable_photon: Enable/disable Photon
        enable_serverless_compute: Enable/disable serverless
        tags: New custom tags
    
    Returns:
        UpdateWarehouseResponse with updated warehouse details
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Convert tags if provided
    sdk_tags = None
    if tags is not None:
        sdk_tags = SDKEndpointTags(
            custom_tags=[SDKEndpointTagPair(key=t.key, value=t.value) for t in tags]
        )
    
    # Update warehouse
    updated = client.warehouses.edit(
        id=warehouse_id,
        name=name,
        cluster_size=cluster_size,
        min_num_clusters=min_num_clusters,
        max_num_clusters=max_num_clusters,
        auto_stop_mins=auto_stop_mins,
        enable_photon=enable_photon,
        enable_serverless_compute=enable_serverless_compute,
        tags=sdk_tags
    ).result()  # Wait for update to complete
    
    return UpdateWarehouseResponse(
        id=updated.id,
        name=updated.name,
        state=updated.state.value if updated.state else None,
        message=f"Warehouse {warehouse_id} updated successfully"
    )
    except Exception as e:
        return UpdateWarehouseResponse(
            id=warehouse_id,
            error_message=f"Failed to update warehouse: {str(e)}",
        )


def delete_warehouse(
    host_credential_key: str,
    token_credential_key: str,
    warehouse_id: str
) -> DeleteWarehouseResponse:
    """
    Delete a SQL warehouse.
    
    Permanently removes a warehouse and stops all running queries.
    Use with caution - this cannot be undone.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        warehouse_id: ID of the warehouse to delete
    
    Returns:
        DeleteWarehouseResponse confirming deletion
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    client.warehouses.delete(id=warehouse_id)
    
    return DeleteWarehouseResponse(
        id=warehouse_id,
        message=f"Warehouse {warehouse_id} deleted successfully"
    )
    except Exception as e:
        return DeleteWarehouseResponse(
            id=warehouse_id,
            error_message=f"Failed to delete warehouse: {str(e)}",
        )


def start_warehouse(
    host_credential_key: str,
    token_credential_key: str,
    warehouse_id: str
) -> StartWarehouseResponse:
    """
    Start a stopped SQL warehouse.
    
    Starts a warehouse that is in STOPPED state. The operation waits until
    the warehouse reaches RUNNING state (typically 1-2 minutes).
    
    Essential for agents to ensure warehouses are ready before executing statements.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        warehouse_id: ID of the warehouse to start
    
    Returns:
        StartWarehouseResponse with warehouse state
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Start warehouse and wait for RUNNING state
    started = client.warehouses.start(id=warehouse_id).result()
    
    return StartWarehouseResponse(
        id=warehouse_id,
        state=started.state.value if started.state else "UNKNOWN",
        message=f"Warehouse {warehouse_id} is now {started.state.value if started.state else 'UNKNOWN'}"
    )
    except Exception as e:
        return StartWarehouseResponse(
            id=warehouse_id,
            state=None,
            error_message=f"Failed to start warehouse: {str(e)}",
        )


def stop_warehouse(
    host_credential_key: str,
    token_credential_key: str,
    warehouse_id: str
) -> StopWarehouseResponse:
    """
    Stop a running SQL warehouse.
    
    Stops a warehouse to save costs. All running queries will be canceled.
    The operation waits until the warehouse reaches STOPPED state.
    
    Useful for agents to optimize costs by stopping idle warehouses.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        warehouse_id: ID of the warehouse to stop
    
    Returns:
        StopWarehouseResponse with warehouse state
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Stop warehouse and wait for STOPPED state
    stopped = client.warehouses.stop(id=warehouse_id).result()
    
    return StopWarehouseResponse(
        id=warehouse_id,
        state=stopped.state.value if stopped.state else "UNKNOWN",
        message=f"Warehouse {warehouse_id} is now {stopped.state.value if stopped.state else 'UNKNOWN'}"
    )
    except Exception as e:
        return StopWarehouseResponse(
            id=warehouse_id,
            state=None,
            error_message=f"Failed to stop warehouse: {str(e)}",
        )


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_warehouse_info(warehouse_dict: dict) -> WarehouseInfo:
    """Convert warehouse dictionary to Pydantic model."""
    # Convert health
    health = None
    if warehouse_dict.get('health'):
        health_dict = warehouse_dict['health']
        health = EndpointHealth(
            status=health_dict.get('status'),
            summary=health_dict.get('summary'),
            message=health_dict.get('message'),
            details=health_dict.get('details'),
            failure_reason=health_dict.get('failure_reason')
        )
    
    # Convert tags
    tags = None
    if warehouse_dict.get('tags'):
        tags_dict = warehouse_dict['tags']
        tag_pairs = []
        if tags_dict.get('custom_tags'):
            for tag in tags_dict['custom_tags']:
                tag_pairs.append(EndpointTagPair(
                    key=tag.get('key'),
                    value=tag.get('value')
                ))
        tags = EndpointTags(custom_tags=tag_pairs if tag_pairs else None)
    
    return WarehouseInfo(
        id=warehouse_dict.get('id'),
        name=warehouse_dict.get('name'),
        cluster_size=warehouse_dict.get('cluster_size'),
        state=warehouse_dict.get('state'),
        warehouse_type=warehouse_dict.get('warehouse_type'),
        auto_stop_mins=warehouse_dict.get('auto_stop_mins'),
        min_num_clusters=warehouse_dict.get('min_num_clusters'),
        max_num_clusters=warehouse_dict.get('max_num_clusters'),
        enable_photon=warehouse_dict.get('enable_photon'),
        enable_serverless_compute=warehouse_dict.get('enable_serverless_compute'),
        spot_instance_policy=warehouse_dict.get('spot_instance_policy'),
        creator_name=warehouse_dict.get('creator_name'),
        jdbc_url=warehouse_dict.get('jdbc_url'),
        num_clusters=warehouse_dict.get('num_clusters'),
        num_active_sessions=warehouse_dict.get('num_active_sessions'),
        health=health,
        tags=tags,
        instance_profile_arn=warehouse_dict.get('instance_profile_arn'),
        channel=warehouse_dict.get('channel')
    )

