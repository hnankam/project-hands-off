"""
Vector Search Endpoints Tools

This module provides tools for managing vector search endpoints in Databricks.
Vector search endpoints represent the compute resources to host vector search indexes,
enabling semantic search and similarity matching capabilities for AI applications.
"""

from typing import Optional, List
from cache import get_workspace_client
from models import (
    EndpointInfoModel,
    ListEndpointsResponse,
    CreateEndpointResponse,
    DeleteEndpointResponse,
    UpdateEndpointBudgetPolicyResponse,
    CustomTagModel,
    UpdateEndpointCustomTagsResponse,
    RetrieveMetricsResponse,
    MetricSeries,
    MetricDataPoint,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_endpoint_info(endpoint) -> EndpointInfoModel:
    """Convert SDK EndpointInfo to Pydantic model."""
    return EndpointInfoModel(
        name=endpoint.name if hasattr(endpoint, 'name') else None,
        endpoint_type=endpoint.endpoint_type.value if hasattr(endpoint, 'endpoint_type') and endpoint.endpoint_type else None,
        endpoint_status=endpoint.endpoint_status.value if hasattr(endpoint, 'endpoint_status') and endpoint.endpoint_status else None,
        creator=endpoint.creator if hasattr(endpoint, 'creator') else None,
        creation_timestamp=endpoint.creation_timestamp if hasattr(endpoint, 'creation_timestamp') else None,
        last_updated_timestamp=endpoint.last_updated_timestamp if hasattr(endpoint, 'last_updated_timestamp') else None,
        num_indexes=endpoint.num_indexes if hasattr(endpoint, 'num_indexes') else None,
        budget_policy_id=endpoint.budget_policy_id if hasattr(endpoint, 'budget_policy_id') else None,
    )


# ============================================================================
# Vector Search Endpoint Management
# ============================================================================

def list_vector_search_endpoints(
    host_credential_key: str,
    token_credential_key: str,
    page_token: Optional[str] = None,
) -> ListEndpointsResponse:
    """
    List all vector search endpoints.
    
    Retrieves all vector search endpoints in the workspace. Vector search
    endpoints represent compute resources that host vector search indexes
    for semantic search and similarity matching.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        page_token: Pagination token (optional)
        
    Returns:
        ListEndpointsResponse with endpoints
        
    Example:
        # List all vector search endpoints
        response = list_vector_search_endpoints(host, token)
        for endpoint in response.endpoints:
            print(f"{endpoint.name}")
            print(f"  Type: {endpoint.endpoint_type}")
            print(f"  Status: {endpoint.endpoint_status}")
            print(f"  Indexes: {endpoint.num_indexes}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    endpoints = []
    next_token = None
    
    for endpoint in client.vector_search_endpoints.list_endpoints(
        page_token=page_token,
    ):
        endpoints.append(_convert_to_endpoint_info(endpoint))
    
    return ListEndpointsResponse(
        endpoints=endpoints,
        next_page_token=next_token,
    )


def get_vector_search_endpoint(
    host_credential_key: str,
    token_credential_key: str,
    endpoint_name: str,
) -> EndpointInfoModel:
    """
    Get a vector search endpoint.
    
    Retrieves detailed information about a specific vector search endpoint.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        endpoint_name: Vector search endpoint name
        
    Returns:
        EndpointInfoModel with endpoint details
        
    Example:
        # Get endpoint details
        endpoint = get_vector_search_endpoint(
            host, token,
            endpoint_name="vector-search-prod"
        )
        print(f"Name: {endpoint.name}")
        print(f"Type: {endpoint.endpoint_type}")
        print(f"Status: {endpoint.endpoint_status}")
        print(f"Creator: {endpoint.creator}")
        print(f"Number of indexes: {endpoint.num_indexes}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    endpoint = client.vector_search_endpoints.get_endpoint(
        endpoint_name=endpoint_name
    )
    
    return _convert_to_endpoint_info(endpoint)


def create_vector_search_endpoint(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    endpoint_type: str,
    budget_policy_id: Optional[str] = None,
) -> CreateEndpointResponse:
    """
    Create a vector search endpoint.
    
    Creates a new vector search endpoint to host vector search indexes.
    The endpoint provides the compute resources for semantic search and
    similarity matching operations.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Unique endpoint name
        endpoint_type: Endpoint type (e.g., "STANDARD")
        budget_policy_id: Budget policy ID (optional)
        
    Returns:
        CreateEndpointResponse with created endpoint
        
    Example:
        # Create standard vector search endpoint
        response = create_vector_search_endpoint(
            host, token,
            name="vector-search-prod",
            endpoint_type="STANDARD"
        )
        print(f"Created: {response.endpoint.name}")
        print(f"Status: {response.endpoint.endpoint_status}")
        
        # Create with budget policy
        response = create_vector_search_endpoint(
            host, token,
            name="vector-search-dev",
            endpoint_type="STANDARD",
            budget_policy_id="budget-policy-123"
        )
        
    Note:
        - Endpoint creation is asynchronous and may take several minutes
        - Monitor endpoint_status to check when it's ONLINE
        - Once ONLINE, you can create vector search indexes on this endpoint
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.vectorsearch import EndpointType
    
    # Convert string to EndpointType enum
    endpoint_type_enum = EndpointType[endpoint_type.upper()]
    
    # Create endpoint and wait for it to be online
    waiter = client.vector_search_endpoints.create_endpoint(
        name=name,
        endpoint_type=endpoint_type_enum,
        budget_policy_id=budget_policy_id,
    )
    
    # Wait for endpoint to be online (with timeout)
    endpoint = waiter.result(timeout=1200)  # 20 minutes timeout
    
    return CreateEndpointResponse(
        endpoint=_convert_to_endpoint_info(endpoint),
    )


def delete_vector_search_endpoint(
    host_credential_key: str,
    token_credential_key: str,
    endpoint_name: str,
) -> DeleteEndpointResponse:
    """
    Delete a vector search endpoint.
    
    Deletes a vector search endpoint. All indexes hosted on this endpoint
    must be deleted first.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        endpoint_name: Endpoint name to delete
        
    Returns:
        DeleteEndpointResponse confirming deletion
        
    Example:
        # Delete vector search endpoint
        response = delete_vector_search_endpoint(
            host, token,
            endpoint_name="vector-search-old"
        )
        print(response.message)
        
    Note:
        - All indexes on the endpoint must be deleted first
        - This operation is irreversible
        - Endpoint deletion may take several minutes
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.vector_search_endpoints.delete_endpoint(
        endpoint_name=endpoint_name
    )
    
    return DeleteEndpointResponse(
        endpoint_name=endpoint_name,
    )


def update_endpoint_budget_policy(
    host_credential_key: str,
    token_credential_key: str,
    endpoint_name: str,
    budget_policy_id: str,
) -> UpdateEndpointBudgetPolicyResponse:
    """
    Update endpoint budget policy.
    
    Updates the budget policy applied to a vector search endpoint to control
    compute costs.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        endpoint_name: Endpoint name
        budget_policy_id: New budget policy ID
        
    Returns:
        UpdateEndpointBudgetPolicyResponse confirming update
        
    Example:
        # Update budget policy
        response = update_endpoint_budget_policy(
            host, token,
            endpoint_name="vector-search-prod",
            budget_policy_id="budget-policy-production"
        )
        print(f"Updated budget policy for {response.endpoint_name}")
        
        # Change to development budget
        response = update_endpoint_budget_policy(
            host, token,
            endpoint_name="vector-search-dev",
            budget_policy_id="budget-policy-dev"
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.vector_search_endpoints.update_endpoint_budget_policy(
        endpoint_name=endpoint_name,
        budget_policy_id=budget_policy_id,
    )
    
    return UpdateEndpointBudgetPolicyResponse(
        endpoint_name=endpoint_name,
        budget_policy_id=budget_policy_id,
    )


def update_endpoint_custom_tags(
    host_credential_key: str,
    token_credential_key: str,
    endpoint_name: str,
    custom_tags: List[dict],
) -> UpdateEndpointCustomTagsResponse:
    """
    Update endpoint custom tags.
    
    Updates custom tags for a vector search endpoint for organization and
    cost tracking purposes.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        endpoint_name: Endpoint name
        custom_tags: List of custom tags, each with 'key' and 'value'
        
    Returns:
        UpdateEndpointCustomTagsResponse confirming update
        
    Example:
        # Update custom tags
        response = update_endpoint_custom_tags(
            host, token,
            endpoint_name="vector-search-prod",
            custom_tags=[
                {"key": "environment", "value": "production"},
                {"key": "team", "value": "ml-platform"},
                {"key": "cost-center", "value": "engineering"}
            ]
        )
        print(f"Updated tags for {response.endpoint_name}")
        
        # Add project tags
        response = update_endpoint_custom_tags(
            host, token,
            endpoint_name="vector-search-dev",
            custom_tags=[
                {"key": "project", "value": "rag-chatbot"},
                {"key": "owner", "value": "data-science-team"}
            ]
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.vectorsearch import CustomTag
    
    # Convert dict tags to CustomTag objects
    tag_objects = [CustomTag(key=tag['key'], value=tag['value']) for tag in custom_tags]
    
    client.vector_search_endpoints.update_endpoint_custom_tags(
        endpoint_name=endpoint_name,
        custom_tags=tag_objects,
    )
    
    # Convert back to Pydantic models for response
    tag_models = [CustomTagModel(key=tag['key'], value=tag['value']) for tag in custom_tags]
    
    return UpdateEndpointCustomTagsResponse(
        endpoint_name=endpoint_name,
        custom_tags=tag_models,
    )


def retrieve_endpoint_metrics(
    host_credential_key: str,
    token_credential_key: str,
    endpoint_name: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    metrics: Optional[List[str]] = None,
    granularity_in_seconds: Optional[int] = None,
    page_token: Optional[str] = None,
) -> RetrieveMetricsResponse:
    """
    Retrieve endpoint metrics.
    
    Retrieves user-visible metrics for a vector search endpoint, such as
    query latency, throughput, and resource utilization.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        endpoint_name: Endpoint name
        start_time: Start time (ISO 8601 format, optional)
        end_time: End time (ISO 8601 format, optional)
        metrics: List of metric names to retrieve (optional)
        granularity_in_seconds: Metric granularity (optional)
        page_token: Pagination token (optional)
        
    Returns:
        RetrieveMetricsResponse with metric data
        
    Example:
        # Get recent metrics
        response = retrieve_endpoint_metrics(
            host, token,
            endpoint_name="vector-search-prod"
        )
        for series in response.metrics:
            print(f"Metric: {series.metric_name}")
            for point in series.data_points:
                print(f"  {point.timestamp}: {point.value}")
        
        # Get specific metrics with time range
        response = retrieve_endpoint_metrics(
            host, token,
            endpoint_name="vector-search-prod",
            start_time="2024-01-01T00:00:00Z",
            end_time="2024-01-02T00:00:00Z",
            metrics=["query_latency_p99", "queries_per_second"],
            granularity_in_seconds=300  # 5-minute granularity
        )
        
    Note:
        - Available metrics depend on endpoint type and configuration
        - Common metrics: query_latency, throughput, cpu_utilization
        - Time range is limited based on retention policy
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.vectorsearch import Metric
    
    # Convert string metrics to Metric enum if provided
    metric_enums = None
    if metrics:
        metric_enums = [Metric[m.upper()] for m in metrics]
    
    result = client.vector_search_endpoints.retrieve_user_visible_metrics(
        name=endpoint_name,
        start_time=start_time,
        end_time=end_time,
        metrics=metric_enums,
        granularity_in_seconds=granularity_in_seconds,
        page_token=page_token,
    )
    
    # Convert result to Pydantic models
    metric_series = []
    if hasattr(result, 'metrics') and result.metrics:
        for series in result.metrics:
            data_points = []
            if hasattr(series, 'data_points') and series.data_points:
                for point in series.data_points:
                    data_points.append(MetricDataPoint(
                        timestamp=point.timestamp if hasattr(point, 'timestamp') else None,
                        value=point.value if hasattr(point, 'value') else None,
                    ))
            
            metric_series.append(MetricSeries(
                metric_name=series.metric_name if hasattr(series, 'metric_name') else None,
                data_points=data_points,
            ))
    
    next_token = result.next_page_token if hasattr(result, 'next_page_token') else None
    
    return RetrieveMetricsResponse(
        endpoint_name=endpoint_name,
        metrics=metric_series,
        next_page_token=next_token,
    )

