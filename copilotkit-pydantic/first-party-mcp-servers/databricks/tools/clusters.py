"""
Cluster Management Tools

This module provides comprehensive cluster lifecycle management including
creation, configuration, state management, and permission control.
"""

from typing import Optional, List, Dict, Any
from cache import get_workspace_client
from models import (
    ClusterInfo,
    ClusterStateInfo,
    AutoScaleInfo,
    ListClustersResponse,
    CreateClusterResponse,
    EditClusterResponse,
    DeleteClusterResponse,
    StartClusterResponse,
    RestartClusterResponse,
)


# ============================================================================
# Cluster Lifecycle Management
# ============================================================================

def list_clusters(
    host: str,
    token: str,
) -> ListClustersResponse:
    """
    List all clusters.
    
    Lists all clusters in the workspace that the user has access to.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        
    Returns:
        ListClustersResponse with list of clusters
        
    Example:
        clusters = list_clusters(host, token)
        for cluster in clusters.clusters:
            print(f"{cluster.cluster_name} ({cluster.cluster_id}): {cluster.state.state if cluster.state else 'UNKNOWN'}")
    """
    client = get_workspace_client(host, token)
    
    clusters_list = []
    for cluster in client.clusters.list():
        # Extract state
        state = None
        if cluster.state:
            state = ClusterStateInfo(
                state=cluster.state.value if hasattr(cluster.state, 'value') else str(cluster.state),
                state_message=cluster.state_message,
            )
        
        # Extract autoscale
        autoscale = None
        if cluster.autoscale:
            autoscale = AutoScaleInfo(
                min_workers=cluster.autoscale.min_workers,
                max_workers=cluster.autoscale.max_workers,
            )
        
        clusters_list.append(
            ClusterInfo(
                cluster_id=cluster.cluster_id,
                cluster_name=cluster.cluster_name,
                spark_version=cluster.spark_version,
                node_type_id=cluster.node_type_id,
                driver_node_type_id=cluster.driver_node_type_id,
                num_workers=cluster.num_workers,
                autoscale=autoscale,
                autotermination_minutes=cluster.autotermination_minutes,
                state=state,
                creator_user_name=cluster.creator_user_name,
                start_time=cluster.start_time,
                terminated_time=cluster.terminated_time,
                last_restarted_time=cluster.last_restarted_time,
                cluster_cores=cluster.cluster_cores,
                cluster_memory_mb=cluster.cluster_memory_mb,
                spark_context_id=cluster.spark_context_id,
                jdbc_port=cluster.jdbc_port,
                cluster_source=cluster.cluster_source.value if cluster.cluster_source else None,
                instance_pool_id=cluster.instance_pool_id,
                driver_instance_pool_id=cluster.driver_instance_pool_id,
                policy_id=cluster.policy_id,
                enable_elastic_disk=cluster.enable_elastic_disk,
                enable_local_disk_encryption=cluster.enable_local_disk_encryption,
                data_security_mode=cluster.data_security_mode.value if cluster.data_security_mode else None,
                runtime_engine=cluster.runtime_engine.value if cluster.runtime_engine else None,
                single_user_name=cluster.single_user_name,
                is_single_node=cluster.is_single_node,
                spark_conf=cluster.spark_conf,
                spark_env_vars=cluster.spark_env_vars,
                custom_tags=cluster.custom_tags,
                init_scripts=[script.as_dict() for script in cluster.init_scripts] if cluster.init_scripts else None,
                docker_image=cluster.docker_image.as_dict() if cluster.docker_image else None,
                ssh_public_keys=cluster.ssh_public_keys,
                aws_attributes=cluster.aws_attributes.as_dict() if cluster.aws_attributes else None,
                azure_attributes=cluster.azure_attributes.as_dict() if cluster.azure_attributes else None,
                gcp_attributes=cluster.gcp_attributes.as_dict() if cluster.gcp_attributes else None,
                cluster_log_conf=cluster.cluster_log_conf.as_dict() if cluster.cluster_log_conf else None,
                termination_reason=cluster.termination_reason.as_dict() if cluster.termination_reason else None,
            )
        )
    
    return ListClustersResponse(
        clusters=clusters_list,
        count=len(clusters_list),
    )


def get_cluster(
    host: str,
    token: str,
    cluster_id: str,
) -> ClusterInfo:
    """
    Get cluster details.
    
    Returns detailed information about a specific cluster including state,
    configuration, and resource usage.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: Cluster ID
        
    Returns:
        ClusterInfo with complete cluster details
        
    Example:
        cluster = get_cluster(host, token, cluster_id="1234-567890-abc123")
        print(f"Cluster: {cluster.cluster_name}")
        print(f"State: {cluster.state.state if cluster.state else 'UNKNOWN'}")
        print(f"Workers: {cluster.num_workers}")
        print(f"Cores: {cluster.cluster_cores}")
        print(f"Memory: {cluster.cluster_memory_mb} MB")
    """
    client = get_workspace_client(host, token)
    
    cluster = client.clusters.get(cluster_id=cluster_id)
    
    # Extract state
    state = None
    if cluster.state:
        state = ClusterStateInfo(
            state=cluster.state.value if hasattr(cluster.state, 'value') else str(cluster.state),
            state_message=cluster.state_message,
        )
    
    # Extract autoscale
    autoscale = None
    if cluster.autoscale:
        autoscale = AutoScaleInfo(
            min_workers=cluster.autoscale.min_workers,
            max_workers=cluster.autoscale.max_workers,
        )
    
    return ClusterInfo(
        cluster_id=cluster.cluster_id,
        cluster_name=cluster.cluster_name,
        spark_version=cluster.spark_version,
        node_type_id=cluster.node_type_id,
        driver_node_type_id=cluster.driver_node_type_id,
        num_workers=cluster.num_workers,
        autoscale=autoscale,
        autotermination_minutes=cluster.autotermination_minutes,
        state=state,
        creator_user_name=cluster.creator_user_name,
        start_time=cluster.start_time,
        terminated_time=cluster.terminated_time,
        last_restarted_time=cluster.last_restarted_time,
        cluster_cores=cluster.cluster_cores,
        cluster_memory_mb=cluster.cluster_memory_mb,
        spark_context_id=cluster.spark_context_id,
        jdbc_port=cluster.jdbc_port,
        cluster_source=cluster.cluster_source.value if cluster.cluster_source else None,
        instance_pool_id=cluster.instance_pool_id,
        driver_instance_pool_id=cluster.driver_instance_pool_id,
        policy_id=cluster.policy_id,
        enable_elastic_disk=cluster.enable_elastic_disk,
        enable_local_disk_encryption=cluster.enable_local_disk_encryption,
        data_security_mode=cluster.data_security_mode.value if cluster.data_security_mode else None,
        runtime_engine=cluster.runtime_engine.value if cluster.runtime_engine else None,
        single_user_name=cluster.single_user_name,
        is_single_node=cluster.is_single_node,
        spark_conf=cluster.spark_conf,
        spark_env_vars=cluster.spark_env_vars,
        custom_tags=cluster.custom_tags,
        init_scripts=[script.as_dict() for script in cluster.init_scripts] if cluster.init_scripts else None,
        docker_image=cluster.docker_image.as_dict() if cluster.docker_image else None,
        ssh_public_keys=cluster.ssh_public_keys,
        aws_attributes=cluster.aws_attributes.as_dict() if cluster.aws_attributes else None,
        azure_attributes=cluster.azure_attributes.as_dict() if cluster.azure_attributes else None,
        gcp_attributes=cluster.gcp_attributes.as_dict() if cluster.gcp_attributes else None,
        cluster_log_conf=cluster.cluster_log_conf.as_dict() if cluster.cluster_log_conf else None,
        termination_reason=cluster.termination_reason.as_dict() if cluster.termination_reason else None,
    )


def create_cluster(
    host: str,
    token: str,
    spark_version: str,
    node_type_id: Optional[str] = None,
    num_workers: Optional[int] = None,
    cluster_name: Optional[str] = None,
    autoscale: Optional[Dict[str, int]] = None,
    autotermination_minutes: Optional[int] = None,
    spark_conf: Optional[Dict[str, str]] = None,
    spark_env_vars: Optional[Dict[str, str]] = None,
    custom_tags: Optional[Dict[str, str]] = None,
    instance_pool_id: Optional[str] = None,
    driver_instance_pool_id: Optional[str] = None,
    driver_node_type_id: Optional[str] = None,
    policy_id: Optional[str] = None,
    enable_elastic_disk: Optional[bool] = None,
    enable_local_disk_encryption: Optional[bool] = None,
    data_security_mode: Optional[str] = None,
    runtime_engine: Optional[str] = None,
    single_user_name: Optional[str] = None,
    is_single_node: Optional[bool] = None,
    init_scripts: Optional[List[Dict[str, Any]]] = None,
    docker_image: Optional[Dict[str, Any]] = None,
    ssh_public_keys: Optional[List[str]] = None,
    aws_attributes: Optional[Dict[str, Any]] = None,
    azure_attributes: Optional[Dict[str, Any]] = None,
    gcp_attributes: Optional[Dict[str, Any]] = None,
    cluster_log_conf: Optional[Dict[str, Any]] = None,
) -> CreateClusterResponse:
    """
    Create a new cluster.
    
    Creates a new all-purpose cluster for interactive analysis. The cluster
    can be manually started, stopped, and terminated.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        spark_version: Spark version (e.g., "13.3.x-scala2.12")
        node_type_id: Node type ID (e.g., "i3.xlarge")
        num_workers: Number of worker nodes (use 0 for single-node)
        cluster_name: Cluster name
        autoscale: Auto-scaling config {"min_workers": 2, "max_workers": 8}
        autotermination_minutes: Minutes before auto-termination (10-10000)
        spark_conf: Spark configuration overrides
        spark_env_vars: Spark environment variables
        custom_tags: Custom tags for the cluster
        instance_pool_id: Instance pool ID to use
        driver_instance_pool_id: Driver instance pool ID
        driver_node_type_id: Driver node type ID
        policy_id: Cluster policy ID
        enable_elastic_disk: Enable elastic disk
        enable_local_disk_encryption: Enable local disk encryption
        data_security_mode: Data security mode (NONE, SINGLE_USER, USER_ISOLATION, LEGACY_TABLE_ACL, LEGACY_PASSTHROUGH, LEGACY_SINGLE_USER)
        runtime_engine: Runtime engine (STANDARD, PHOTON)
        single_user_name: Single user name for data security
        is_single_node: Whether cluster is single-node
        init_scripts: List of initialization scripts
        docker_image: Docker image configuration
        ssh_public_keys: SSH public keys
        aws_attributes: AWS-specific attributes
        azure_attributes: Azure-specific attributes
        gcp_attributes: GCP-specific attributes
        cluster_log_conf: Cluster log configuration
        
    Returns:
        CreateClusterResponse with cluster ID
        
    Example:
        # Create standard cluster
        cluster = create_cluster(
            host, token,
            spark_version="13.3.x-scala2.12",
            node_type_id="i3.xlarge",
            num_workers=2,
            cluster_name="Analytics Cluster",
            autotermination_minutes=30
        )
        print(f"Created cluster {cluster.cluster_id}")
        
        # Create auto-scaling cluster
        cluster = create_cluster(
            host, token,
            spark_version="13.3.x-scala2.12",
            node_type_id="i3.xlarge",
            cluster_name="Auto-scaling Cluster",
            autoscale={"min_workers": 2, "max_workers": 8},
            autotermination_minutes=60
        )
        
        # Create single-node cluster
        cluster = create_cluster(
            host, token,
            spark_version="13.3.x-scala2.12",
            node_type_id="i3.xlarge",
            num_workers=0,
            cluster_name="Single Node Cluster",
            is_single_node=True
        )
        
        # Create cluster with custom Spark config
        cluster = create_cluster(
            host, token,
            spark_version="13.3.x-scala2.12",
            node_type_id="i3.xlarge",
            num_workers=4,
            cluster_name="Custom Config Cluster",
            spark_conf={
                "spark.sql.adaptive.enabled": "true",
                "spark.databricks.delta.optimizeWrite.enabled": "true"
            },
            spark_env_vars={
                "PYSPARK_PYTHON": "/databricks/python3/bin/python3"
            }
        )
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.compute import (
        AutoScale, InitScriptInfo, DockerImage, DataSecurityMode, RuntimeEngine,
        AwsAttributes, AzureAttributes, GcpAttributes, ClusterLogConf
    )
    
    # Convert autoscale
    autoscale_obj = None
    if autoscale:
        autoscale_obj = AutoScale(
            min_workers=autoscale.get("min_workers"),
            max_workers=autoscale.get("max_workers"),
        )
    
    # Convert init scripts
    init_scripts_obj = None
    if init_scripts:
        init_scripts_obj = [InitScriptInfo.from_dict(script) for script in init_scripts]
    
    # Convert docker image
    docker_image_obj = DockerImage.from_dict(docker_image) if docker_image else None
    
    # Convert data security mode
    data_security_mode_obj = DataSecurityMode(data_security_mode) if data_security_mode else None
    
    # Convert runtime engine
    runtime_engine_obj = RuntimeEngine(runtime_engine) if runtime_engine else None
    
    # Convert cloud attributes
    aws_attributes_obj = AwsAttributes.from_dict(aws_attributes) if aws_attributes else None
    azure_attributes_obj = AzureAttributes.from_dict(azure_attributes) if azure_attributes else None
    gcp_attributes_obj = GcpAttributes.from_dict(gcp_attributes) if gcp_attributes else None
    
    # Convert cluster log conf
    cluster_log_conf_obj = ClusterLogConf.from_dict(cluster_log_conf) if cluster_log_conf else None
    
    response = client.clusters.create(
        spark_version=spark_version,
        node_type_id=node_type_id,
        num_workers=num_workers,
        cluster_name=cluster_name,
        autoscale=autoscale_obj,
        autotermination_minutes=autotermination_minutes,
        spark_conf=spark_conf,
        spark_env_vars=spark_env_vars,
        custom_tags=custom_tags,
        instance_pool_id=instance_pool_id,
        driver_instance_pool_id=driver_instance_pool_id,
        driver_node_type_id=driver_node_type_id,
        policy_id=policy_id,
        enable_elastic_disk=enable_elastic_disk,
        enable_local_disk_encryption=enable_local_disk_encryption,
        data_security_mode=data_security_mode_obj,
        runtime_engine=runtime_engine_obj,
        single_user_name=single_user_name,
        is_single_node=is_single_node,
        init_scripts=init_scripts_obj,
        docker_image=docker_image_obj,
        ssh_public_keys=ssh_public_keys,
        aws_attributes=aws_attributes_obj,
        azure_attributes=azure_attributes_obj,
        gcp_attributes=gcp_attributes_obj,
        cluster_log_conf=cluster_log_conf_obj,
    ).result()  # Wait for cluster to be created
    
    return CreateClusterResponse(cluster_id=response.cluster_id)


def edit_cluster(
    host: str,
    token: str,
    cluster_id: str,
    spark_version: str,
    node_type_id: Optional[str] = None,
    num_workers: Optional[int] = None,
    cluster_name: Optional[str] = None,
    autoscale: Optional[Dict[str, int]] = None,
    autotermination_minutes: Optional[int] = None,
    spark_conf: Optional[Dict[str, str]] = None,
    spark_env_vars: Optional[Dict[str, str]] = None,
    custom_tags: Optional[Dict[str, str]] = None,
    instance_pool_id: Optional[str] = None,
    driver_instance_pool_id: Optional[str] = None,
    driver_node_type_id: Optional[str] = None,
    policy_id: Optional[str] = None,
    enable_elastic_disk: Optional[bool] = None,
    enable_local_disk_encryption: Optional[bool] = None,
    data_security_mode: Optional[str] = None,
    runtime_engine: Optional[str] = None,
    single_user_name: Optional[str] = None,
    is_single_node: Optional[bool] = None,
    init_scripts: Optional[List[Dict[str, Any]]] = None,
    docker_image: Optional[Dict[str, Any]] = None,
    ssh_public_keys: Optional[List[str]] = None,
    aws_attributes: Optional[Dict[str, Any]] = None,
    azure_attributes: Optional[Dict[str, Any]] = None,
    gcp_attributes: Optional[Dict[str, Any]] = None,
    cluster_log_conf: Optional[Dict[str, Any]] = None,
) -> EditClusterResponse:
    """
    Edit cluster configuration.
    
    Updates the configuration of an existing cluster. If the cluster is running,
    it will be restarted to apply changes. If terminated, changes apply on next start.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: Cluster ID
        spark_version: Spark version (REQUIRED)
        [... same parameters as create_cluster ...]
        
    Returns:
        EditClusterResponse confirming edit
        
    Example:
        # Change number of workers
        edit_cluster(
            host, token,
            cluster_id="1234-567890-abc123",
            spark_version="13.3.x-scala2.12",
            node_type_id="i3.xlarge",
            num_workers=4
        )
        
        # Enable auto-scaling
        edit_cluster(
            host, token,
            cluster_id="1234-567890-abc123",
            spark_version="13.3.x-scala2.12",
            node_type_id="i3.xlarge",
            autoscale={"min_workers": 2, "max_workers": 10}
        )
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.compute import (
        AutoScale, InitScriptInfo, DockerImage, DataSecurityMode, RuntimeEngine,
        AwsAttributes, AzureAttributes, GcpAttributes, ClusterLogConf
    )
    
    # Convert parameters (same as create_cluster)
    autoscale_obj = AutoScale(
        min_workers=autoscale.get("min_workers"),
        max_workers=autoscale.get("max_workers"),
    ) if autoscale else None
    
    init_scripts_obj = [InitScriptInfo.from_dict(script) for script in init_scripts] if init_scripts else None
    docker_image_obj = DockerImage.from_dict(docker_image) if docker_image else None
    data_security_mode_obj = DataSecurityMode(data_security_mode) if data_security_mode else None
    runtime_engine_obj = RuntimeEngine(runtime_engine) if runtime_engine else None
    aws_attributes_obj = AwsAttributes.from_dict(aws_attributes) if aws_attributes else None
    azure_attributes_obj = AzureAttributes.from_dict(azure_attributes) if azure_attributes else None
    gcp_attributes_obj = GcpAttributes.from_dict(gcp_attributes) if gcp_attributes else None
    cluster_log_conf_obj = ClusterLogConf.from_dict(cluster_log_conf) if cluster_log_conf else None
    
    client.clusters.edit(
        cluster_id=cluster_id,
        spark_version=spark_version,
        node_type_id=node_type_id,
        num_workers=num_workers,
        cluster_name=cluster_name,
        autoscale=autoscale_obj,
        autotermination_minutes=autotermination_minutes,
        spark_conf=spark_conf,
        spark_env_vars=spark_env_vars,
        custom_tags=custom_tags,
        instance_pool_id=instance_pool_id,
        driver_instance_pool_id=driver_instance_pool_id,
        driver_node_type_id=driver_node_type_id,
        policy_id=policy_id,
        enable_elastic_disk=enable_elastic_disk,
        enable_local_disk_encryption=enable_local_disk_encryption,
        data_security_mode=data_security_mode_obj,
        runtime_engine=runtime_engine_obj,
        single_user_name=single_user_name,
        is_single_node=is_single_node,
        init_scripts=init_scripts_obj,
        docker_image=docker_image_obj,
        ssh_public_keys=ssh_public_keys,
        aws_attributes=aws_attributes_obj,
        azure_attributes=azure_attributes_obj,
        gcp_attributes=gcp_attributes_obj,
        cluster_log_conf=cluster_log_conf_obj,
    )
    
    return EditClusterResponse(cluster_id=cluster_id)


def delete_cluster(
    host: str,
    token: str,
    cluster_id: str,
) -> DeleteClusterResponse:
    """
    Delete/terminate a cluster.
    
    Terminates a cluster. The cluster is not immediately removed but marked
    for deletion. Configuration is retained for 30 days unless permanently deleted.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: Cluster ID
        
    Returns:
        DeleteClusterResponse confirming deletion
        
    Example:
        delete_cluster(host, token, cluster_id="1234-567890-abc123")
    """
    client = get_workspace_client(host, token)
    
    client.clusters.delete(cluster_id=cluster_id)
    
    return DeleteClusterResponse(cluster_id=cluster_id)


def permanent_delete_cluster(
    host: str,
    token: str,
    cluster_id: str,
) -> DeleteClusterResponse:
    """
    Permanently delete a cluster.
    
    Permanently deletes a cluster including its configuration. This cannot be undone.
    The cluster must be terminated first.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: Cluster ID
        
    Returns:
        DeleteClusterResponse confirming permanent deletion
        
    Example:
        # First terminate the cluster
        delete_cluster(host, token, cluster_id="1234-567890-abc123")
        
        # Then permanently delete
        permanent_delete_cluster(host, token, cluster_id="1234-567890-abc123")
    """
    client = get_workspace_client(host, token)
    
    client.clusters.permanent_delete(cluster_id=cluster_id)
    
    return DeleteClusterResponse(
        cluster_id=cluster_id,
        message="Cluster permanently deleted"
    )


def start_cluster(
    host: str,
    token: str,
    cluster_id: str,
) -> StartClusterResponse:
    """
    Start a terminated cluster.
    
    Starts a previously terminated cluster. The cluster retains its previous
    configuration and ID.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: Cluster ID
        
    Returns:
        StartClusterResponse confirming start initiated
        
    Example:
        start = start_cluster(host, token, cluster_id="1234-567890-abc123")
        print(start.message)
        
        # Poll for status
        import time
        while True:
            cluster = get_cluster(host, token, cluster_id="1234-567890-abc123")
            state = cluster.state.state if cluster.state else "UNKNOWN"
            if state == "RUNNING":
                print("Cluster is running")
                break
            print(f"Cluster state: {state}")
            time.sleep(10)
    """
    client = get_workspace_client(host, token)
    
    client.clusters.start(cluster_id=cluster_id).result()  # Wait for start
    
    return StartClusterResponse(cluster_id=cluster_id)


def restart_cluster(
    host: str,
    token: str,
    cluster_id: str,
) -> RestartClusterResponse:
    """
    Restart a cluster.
    
    Restarts a running cluster. If the cluster is not running, nothing happens.
    This is useful for applying configuration changes or recovering from issues.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: Cluster ID
        
    Returns:
        RestartClusterResponse confirming restart initiated
        
    Example:
        restart = restart_cluster(host, token, cluster_id="1234-567890-abc123")
        print(restart.message)
    """
    client = get_workspace_client(host, token)
    
    client.clusters.restart(cluster_id=cluster_id).result()  # Wait for restart
    
    return RestartClusterResponse(cluster_id=cluster_id)


# ============================================================================
# Permission Management
# ============================================================================

def get_cluster_permissions(
    host: str,
    token: str,
    cluster_id: str,
) -> Dict[str, Any]:
    """
    Get cluster permissions.
    
    Gets the permissions of a cluster including ACLs.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: Cluster ID
        
    Returns:
        Dict with permission details
        
    Example:
        permissions = get_cluster_permissions(host, token, cluster_id="1234-567890-abc123")
        for acl in permissions['access_control_list']:
            principal = acl.get('user_name') or acl.get('group_name')
            perms = [p['permission_level'] for p in acl['all_permissions']]
            print(f"{principal}: {perms}")
    """
    client = get_workspace_client(host, token)
    
    permissions = client.clusters.get_permissions(cluster_id=cluster_id)
    
    return permissions.as_dict()


def set_cluster_permissions(
    host: str,
    token: str,
    cluster_id: str,
    access_control_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Set cluster permissions.
    
    Sets permissions on a cluster, replacing existing permissions if they exist.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: Cluster ID
        access_control_list: List of ACL entries
        
    Returns:
        Dict with updated permission details
        
    ACL Entry Format:
        {
            "user_name": "user@company.com",
            "permission_level": "CAN_RESTART"  # or CAN_ATTACH_TO, CAN_MANAGE
        }
        
    Permission Levels:
        - CAN_ATTACH_TO - Attach notebooks and run commands
        - CAN_RESTART - Attach, restart, resize clusters
        - CAN_MANAGE - Full control (edit, delete, permissions)
        
    Example:
        acls = [
            {"user_name": "admin@company.com", "permission_level": "CAN_MANAGE"},
            {"group_name": "data-engineers", "permission_level": "CAN_RESTART"},
            {"group_name": "analysts", "permission_level": "CAN_ATTACH_TO"}
        ]
        set_cluster_permissions(host, token, cluster_id="1234-567890-abc123", access_control_list=acls)
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.compute import ClusterAccessControlRequest
    
    acl_requests = [ClusterAccessControlRequest.from_dict(acl) for acl in access_control_list]
    
    permissions = client.clusters.set_permissions(
        cluster_id=cluster_id,
        access_control_list=acl_requests,
    )
    
    return permissions.as_dict()


def update_cluster_permissions(
    host: str,
    token: str,
    cluster_id: str,
    access_control_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Update cluster permissions.
    
    Updates the permissions on a cluster without replacing all existing permissions.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: Cluster ID
        access_control_list: List of ACL entries to update
        
    Returns:
        Dict with updated permission details
        
    Example:
        acls = [
            {"user_name": "new-user@company.com", "permission_level": "CAN_ATTACH_TO"}
        ]
        update_cluster_permissions(host, token, cluster_id="1234-567890-abc123", access_control_list=acls)
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.compute import ClusterAccessControlRequest
    
    acl_requests = [ClusterAccessControlRequest.from_dict(acl) for acl in access_control_list]
    
    permissions = client.clusters.update_permissions(
        cluster_id=cluster_id,
        access_control_list=acl_requests,
    )
    
    return permissions.as_dict()


def get_cluster_permission_levels(
    host: str,
    token: str,
    cluster_id: str,
) -> Dict[str, Any]:
    """
    Get available permission levels.
    
    Gets the permission levels that a user can have on a cluster.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: Cluster ID
        
    Returns:
        Dict with available permission levels
        
    Example:
        levels = get_cluster_permission_levels(host, token, cluster_id="1234-567890-abc123")
        for level in levels['permission_levels']:
            print(f"{level['permission_level']}: {level['description']}")
    """
    client = get_workspace_client(host, token)
    
    levels = client.clusters.get_permission_levels(cluster_id=cluster_id)
    
    return levels.as_dict()
