"""
Cluster Management Tools

This module provides comprehensive cluster lifecycle management including
creation, configuration, state management, and permission control.

All credential parameters use credential keys (globally unique identifiers) that are resolved
server-side from the workspace_credentials table.
"""

from typing import Optional, List, Dict, Any
from itertools import islice
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
    host_credential_key: str,
    token_credential_key: str,
    limit: int = 10,
    page: int = 0,
    cluster_name: Optional[str] = None,
) -> ListClustersResponse:
    """
    Retrieve a paginated list of Databricks clusters accessible to the authenticated user.
    
    This function returns clusters in the workspace with support for filtering and pagination.
    Use this to discover available clusters, check cluster configurations, or iterate through large cluster lists.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        limit: Number of clusters to return in a single request. Must be positive integer. Maximum 10. Default: 10
        page: Zero-indexed page number for pagination. Page 0 returns first `limit` clusters, page 1 returns next `limit` clusters. Default: 0
        cluster_name: Optional cluster name for filtering. Filters by partial match (case-insensitive). Default: None (no filtering)
        
    Returns:
        ListClustersResponse containing:
        - clusters: List of ClusterInfo objects with cluster details
        - count: Integer number of clusters returned in this page (0 to limit)
        - has_more: Boolean indicating if additional clusters exist beyond this page
        
    Pagination:
        - Returns up to `limit` clusters per call
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available, call again with page+1
        - has_more=False indicates this is the final page
        - Empty list (count=0) with has_more=False means no clusters match criteria
    """
    try:

        # Cap limit at maximum page size
        limit = min(limit, 10)
    
        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Get clusters iterator
        response = client.clusters.list()
    
        # For filtering and pagination, we need to iterate through all clusters
        # Skip filtered items based on page number, then collect up to limit
        skip_count = page * limit
        collected = 0
        skipped = 0
        has_more = False
    
        clusters_list = []
        for cluster in response:
            # Apply name filter if specified (case-insensitive partial match)
            if cluster_name and cluster.cluster_name:
                if cluster_name.lower() not in cluster.cluster_name.lower():
                    continue
        
            # Skip items for previous pages
            if skipped < skip_count:
                skipped += 1
                continue
        
            # Collect this cluster if we haven't reached the limit
            if collected >= limit:
                # We found one more filtered item beyond our limit
                # This means has_more = True, so we can break
                has_more = True
                break
        
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
            collected += 1
    
        # If we exited the loop normally (not via break), has_more is already False
        # has_more was set to True in the loop if we found an extra item beyond limit
    
        return ListClustersResponse(
            clusters=clusters_list,
            count=len(clusters_list),
            has_more=has_more,
        )

    except Exception as e:
        return ListClustersResponse(
            clusters=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list clusters: {str(e)}",
        )


def get_cluster(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
) -> ClusterInfo:
    """
    Get cluster details.
    
    Returns detailed information about a specific cluster including state,
    configuration, and resource usage.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks workspace URL
        token_credential_key: Globally unique key for the credential containing authentication token
        cluster_id: Cluster ID
        
    Returns:
        ClusterInfo with complete cluster details
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
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

    except Exception as e:
        # For functions returning models directly, return None on error
        # FastMCP will handle the None return appropriately
        return None


def create_cluster(
    host_credential_key: str,
    token_credential_key: str,
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
        host_credential_key: Globally unique key for the credential containing Databricks workspace URL
        token_credential_key: Globally unique key for the credential containing authentication token
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
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
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

    except Exception as e:
        return CreateClusterResponse(
            cluster_id=None,
            error_message=f"Failed to create cluster: {str(e)}",
        )


def edit_cluster(
    host_credential_key: str,
    token_credential_key: str,
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
        host_credential_key: Globally unique key for the credential containing Databricks workspace URL
        token_credential_key: Globally unique key for the credential containing authentication token
        cluster_id: Cluster ID
        spark_version: Spark version (REQUIRED)
        [... same parameters as create_cluster ...]
        
    Returns:
        EditClusterResponse confirming edit
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
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

    except Exception as e:
        return EditClusterResponse(
            cluster_id=cluster_id,
            error_message=f"Failed to edit cluster {cluster_id}: {str(e)}",
        )


def delete_cluster(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
) -> DeleteClusterResponse:
    """
    Delete/terminate a cluster.
    
    Terminates a cluster. The cluster is not immediately removed but marked
    for deletion. Configuration is retained for 30 days unless permanently deleted.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks workspace URL
        token_credential_key: Globally unique key for the credential containing authentication token
        cluster_id: Cluster ID
        
    Returns:
        DeleteClusterResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.clusters.delete(cluster_id=cluster_id)
    
        return DeleteClusterResponse(cluster_id=cluster_id)

    except Exception as e:
        return DeleteClusterResponse(
            cluster_id=cluster_id,
            error_message=f"Failed to delete cluster {cluster_id}: {str(e)}",
        )


def permanent_delete_cluster(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
) -> DeleteClusterResponse:
    """
    Permanently delete a cluster.
    
    Permanently deletes a cluster including its configuration. This cannot be undone.
    The cluster must be terminated first.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks workspace URL
        token_credential_key: Globally unique key for the credential containing authentication token
        cluster_id: Cluster ID
        
    Returns:
        DeleteClusterResponse confirming permanent deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.clusters.permanent_delete(cluster_id=cluster_id)
    
        return DeleteClusterResponse(
            cluster_id=cluster_id,
            message="Cluster permanently deleted"
        )

    except Exception as e:
        return DeleteClusterResponse(
            cluster_id=cluster_id,
            error_message=f"Failed to permanently delete cluster {cluster_id}: {str(e)}",
        )


def start_cluster(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
) -> StartClusterResponse:
    """
    Start a terminated cluster.
    
    Starts a previously terminated cluster. The cluster retains its previous
    configuration and ID.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks workspace URL
        token_credential_key: Globally unique key for the credential containing authentication token
        cluster_id: Cluster ID
        
    Returns:
        StartClusterResponse confirming start initiated
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.clusters.start(cluster_id=cluster_id).result()  # Wait for start
    
        return StartClusterResponse(cluster_id=cluster_id)

    except Exception as e:
        return StartClusterResponse(
            cluster_id=cluster_id,
            error_message=f"Failed to start cluster {cluster_id}: {str(e)}",
        )


def restart_cluster(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
) -> RestartClusterResponse:
    """
    Restart a cluster.
    
    Restarts a running cluster. If the cluster is not running, nothing happens.
    This is useful for applying configuration changes or recovering from issues.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks workspace URL
        token_credential_key: Globally unique key for the credential containing authentication token
        cluster_id: Cluster ID
        
    Returns:
        RestartClusterResponse confirming restart initiated
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.clusters.restart(cluster_id=cluster_id).result()  # Wait for restart
    
        return RestartClusterResponse(cluster_id=cluster_id)

    except Exception as e:
        return RestartClusterResponse(
            cluster_id=cluster_id,
            error_message=f"Failed to restart cluster {cluster_id}: {str(e)}",
        )


# ============================================================================
# Permission Management
# ============================================================================

def get_cluster_permissions(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
) -> Dict[str, Any]:
    """
    Get cluster permissions.
    
    Gets the permissions of a cluster including ACLs.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks workspace URL
        token_credential_key: Globally unique key for the credential containing authentication token
        cluster_id: Cluster ID
        
    Returns:
        Dict with permission details
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        permissions = client.clusters.get_permissions(cluster_id=cluster_id)
    
        return permissions.as_dict()

    except Exception as e:
        return {"error": f"Failed to get cluster permissions for {cluster_id}: {str(e)}"}


def set_cluster_permissions(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
    access_control_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Set cluster permissions.
    
    Sets permissions on a cluster, replacing existing permissions if they exist.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks workspace URL
        token_credential_key: Globally unique key for the credential containing authentication token
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
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        from databricks.sdk.service.compute import ClusterAccessControlRequest
    
        acl_requests = [ClusterAccessControlRequest.from_dict(acl) for acl in access_control_list]
    
        permissions = client.clusters.set_permissions(
            cluster_id=cluster_id,
            access_control_list=acl_requests,
        )
    
        return permissions.as_dict()

    except Exception as e:
        return {"error": f"Failed to set cluster permissions for {cluster_id}: {str(e)}"}


def update_cluster_permissions(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
    access_control_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Update cluster permissions.
    
    Updates the permissions on a cluster without replacing all existing permissions.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks workspace URL
        token_credential_key: Globally unique key for the credential containing authentication token
        cluster_id: Cluster ID
        access_control_list: List of ACL entries to update
        
    Returns:
        Dict with updated permission details
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        from databricks.sdk.service.compute import ClusterAccessControlRequest
    
        acl_requests = [ClusterAccessControlRequest.from_dict(acl) for acl in access_control_list]
    
        permissions = client.clusters.update_permissions(
            cluster_id=cluster_id,
            access_control_list=acl_requests,
        )
    
        return permissions.as_dict()

    except Exception as e:
        return {"error": f"Failed to update cluster permissions for {cluster_id}: {str(e)}"}


def get_cluster_permission_levels(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
) -> Dict[str, Any]:
    """
    Get available permission levels.
    
    Gets the permission levels that a user can have on a cluster.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks workspace URL
        token_credential_key: Globally unique key for the credential containing authentication token
        cluster_id: Cluster ID
        
    Returns:
        Dict with available permission levels
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        levels = client.clusters.get_permission_levels(cluster_id=cluster_id)
    
        return levels.as_dict()

    except Exception as e:
        return {"error": f"Failed to get cluster permission levels for {cluster_id}: {str(e)}"}
