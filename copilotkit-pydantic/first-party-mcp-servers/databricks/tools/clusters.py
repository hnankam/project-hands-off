"""Cluster management tools."""

from typing import Any
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.compute import ClusterDetails
from cache import get_workspace_client


def list_clusters(host: str, token: str) -> list[dict[str, Any]]:
    """
    List all clusters in the workspace.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
    
    Returns:
        List of cluster objects with all available ClusterDetails fields
    """
    client = get_workspace_client(host, token)
    
    clusters = []
    for cluster in client.clusters.list():
        cluster_dict = cluster.as_dict()
        
        clusters.append(cluster_dict)
    return clusters


def get_cluster(host: str, token: str, cluster_id: str) -> dict[str, Any]:
    """
    Get details of a specific cluster.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        cluster_id: ID of the cluster to retrieve
    
    Returns:
        Complete cluster details with all ClusterDetails fields
    """
    client = get_workspace_client(host, token)
    cluster = client.clusters.get(cluster_id)
    
    # Use as_dict() method for complete serialization
    if hasattr(cluster, 'as_dict'):
        return cluster.as_dict()
    
    # Fallback: return basic info
    return {
        "cluster_id": cluster.cluster_id,
        "cluster_name": cluster.cluster_name,
        "state": str(cluster.state) if hasattr(cluster, 'state') and cluster.state else None,
        "spark_version": cluster.spark_version if hasattr(cluster, 'spark_version') else None,
        "node_type_id": cluster.node_type_id if hasattr(cluster, 'node_type_id') else None,
        "num_workers": cluster.num_workers if hasattr(cluster, 'num_workers') else None,
    }

