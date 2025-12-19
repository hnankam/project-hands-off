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
    host: str,
    token: str
) -> ListWarehousesResponse:
    """
    List all SQL warehouses that the user has access to.
    
    Use this to discover available compute resources for SQL execution.
    Essential for agents to find warehouses before executing statements.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
    
    Returns:
        ListWarehousesResponse with warehouse information
    
    Example:
        # List all warehouses
        response = list_warehouses(host, token)
        
        for wh in response.warehouses:
            print(f"{wh.name}: {wh.state} ({wh.cluster_size})")
            print(f"  ID: {wh.id}")
            print(f"  Active sessions: {wh.num_active_sessions}")
            print(f"  Clusters: {wh.num_clusters}/{wh.max_num_clusters}")
    """
    client = get_workspace_client(host, token)
    
    warehouses = []
    for endpoint in client.warehouses.list():
        endpoint_dict = endpoint.as_dict()
        warehouses.append(_convert_warehouse_info(endpoint_dict))
    
    return ListWarehousesResponse(
        warehouses=warehouses,
        count=len(warehouses)
    )


def get_warehouse(
    host: str,
    token: str,
    warehouse_id: str
) -> WarehouseInfo:
    """
    Get detailed information about a specific SQL warehouse.
    
    Use this to check warehouse state, configuration, and health before
    executing statements.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        warehouse_id: ID of the SQL warehouse
    
    Returns:
        WarehouseInfo with complete warehouse details
    
    Example:
        # Check warehouse status
        warehouse = get_warehouse(host, token, "abc123")
        
        if warehouse.state == "STOPPED":
            print("Warehouse is stopped, starting...")
            start_warehouse(host, token, warehouse.id)
        elif warehouse.state == "RUNNING":
            print(f"Warehouse ready! {warehouse.num_active_sessions} active sessions")
            print(f"Health: {warehouse.health.status}")
    """
    client = get_workspace_client(host, token)
    response = client.warehouses.get(id=warehouse_id)
    return _convert_warehouse_info(response.as_dict())


def create_warehouse(
    host: str,
    token: str,
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
        host: Databricks workspace URL
        token: Personal Access Token
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
    
    Example:
        # Create a small warehouse for development
        response = create_warehouse(
            host, token,
            name="dev-warehouse",
            cluster_size="X-Small",
            auto_stop_mins=10,
            enable_photon=True
        )
        print(f"Created warehouse {response.id}: {response.state}")
        
        # Create a large warehouse for production
        response = create_warehouse(
            host, token,
            name="prod-warehouse",
            cluster_size="2X-Large",
            min_num_clusters=2,
            max_num_clusters=10,
            auto_stop_mins=0,  # Never auto-stop
            enable_photon=True,
            tags=[
                EndpointTagPair(key="Environment", value="Production"),
                EndpointTagPair(key="Team", value="Analytics")
            ]
        )
    """
    client = get_workspace_client(host, token)
    
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


def update_warehouse(
    host: str,
    token: str,
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
        host: Databricks workspace URL
        token: Personal Access Token
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
    
    Example:
        # Scale up for heavy workload
        response = update_warehouse(
            host, token,
            warehouse_id="abc123",
            cluster_size="2X-Large",
            max_num_clusters=10
        )
        
        # Change auto-stop for cost savings
        response = update_warehouse(
            host, token,
            warehouse_id="abc123",
            auto_stop_mins=5  # Stop after 5 mins idle
        )
    """
    client = get_workspace_client(host, token)
    
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


def delete_warehouse(
    host: str,
    token: str,
    warehouse_id: str
) -> DeleteWarehouseResponse:
    """
    Delete a SQL warehouse.
    
    Permanently removes a warehouse and stops all running queries.
    Use with caution - this cannot be undone.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        warehouse_id: ID of the warehouse to delete
    
    Returns:
        DeleteWarehouseResponse confirming deletion
    
    Example:
        # Delete temporary warehouse
        response = delete_warehouse(host, token, "temp-warehouse-123")
        print(response.message)
    """
    client = get_workspace_client(host, token)
    client.warehouses.delete(id=warehouse_id)
    
    return DeleteWarehouseResponse(
        id=warehouse_id,
        message=f"Warehouse {warehouse_id} deleted successfully"
    )


def start_warehouse(
    host: str,
    token: str,
    warehouse_id: str
) -> StartWarehouseResponse:
    """
    Start a stopped SQL warehouse.
    
    Starts a warehouse that is in STOPPED state. The operation waits until
    the warehouse reaches RUNNING state (typically 1-2 minutes).
    
    Essential for agents to ensure warehouses are ready before executing statements.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        warehouse_id: ID of the warehouse to start
    
    Returns:
        StartWarehouseResponse with warehouse state
    
    Example:
        # Ensure warehouse is running
        warehouse = get_warehouse(host, token, "abc123")
        
        if warehouse.state == "STOPPED":
            print("Starting warehouse...")
            response = start_warehouse(host, token, warehouse.id)
            print(f"State: {response.state}")
        
        # Now execute statement
        execute_statement(host, token, "SELECT * FROM table", warehouse.id)
    """
    client = get_workspace_client(host, token)
    
    # Start warehouse and wait for RUNNING state
    started = client.warehouses.start(id=warehouse_id).result()
    
    return StartWarehouseResponse(
        id=warehouse_id,
        state=started.state.value if started.state else "UNKNOWN",
        message=f"Warehouse {warehouse_id} is now {started.state.value if started.state else 'UNKNOWN'}"
    )


def stop_warehouse(
    host: str,
    token: str,
    warehouse_id: str
) -> StopWarehouseResponse:
    """
    Stop a running SQL warehouse.
    
    Stops a warehouse to save costs. All running queries will be canceled.
    The operation waits until the warehouse reaches STOPPED state.
    
    Useful for agents to optimize costs by stopping idle warehouses.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        warehouse_id: ID of the warehouse to stop
    
    Returns:
        StopWarehouseResponse with warehouse state
    
    Example:
        # Stop idle warehouse to save costs
        warehouses = list_warehouses(host, token)
        
        for wh in warehouses.warehouses:
            if wh.state == "RUNNING" and wh.num_active_sessions == 0:
                print(f"Stopping idle warehouse {wh.name}")
                response = stop_warehouse(host, token, wh.id)
                print(response.message)
    """
    client = get_workspace_client(host, token)
    
    # Stop warehouse and wait for STOPPED state
    stopped = client.warehouses.stop(id=warehouse_id).result()
    
    return StopWarehouseResponse(
        id=warehouse_id,
        state=stopped.state.value if stopped.state else "UNKNOWN",
        message=f"Warehouse {warehouse_id} is now {stopped.state.value if stopped.state else 'UNKNOWN'}"
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

