"""SQL Query History tools for monitoring query executions."""

from typing import Optional, List
from itertools import islice
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import QueryFilter as SDKQueryFilter, TimeRange as SDKTimeRange, QueryStatus
from cache import get_workspace_client
from models import (
    QueryFilter,
    TimeRange,
    QueryExecutionInfo,
    QueryMetrics,
    ListQueryHistoryResponse,
)


def list_query_history(
    host_credential_key: str,
    token_credential_key: str,
    filter_by: Optional[QueryFilter] = None,
    include_metrics: Optional[bool] = False,
    limit: int = 25,
    page: int = 0,
) -> ListQueryHistoryResponse:
    """
    Retrieve paginated execution history of SQL queries run on Databricks SQL warehouses and serverless compute.
    
    This function returns query execution records (not query definitions) ordered by start time
    (most recent first). Use this to monitor performance, debug failures, audit usage, or analyze metrics.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        filter_by: Optional QueryFilter object to narrow results. Can filter by time range (query_start_time_range), user IDs, user names, warehouse IDs, execution statuses, and query text content (query_text_contains). Multiple filters combine with AND logic. Default: None (no filtering)
        include_metrics: Boolean flag to include detailed execution metrics (compilation time, bytes read/written, row counts, cache usage). Increases response size. Default: False
        limit: Number of query executions to return in a single request. Must be positive integer. Default: 25
        page: Zero-indexed page number for pagination. Default: 0
    
    Returns:
        ListQueryHistoryResponse containing:
        - queries: List of QueryExecutionInfo objects with execution records (status, timing, user, warehouse, metrics)
        - count: Integer number of query executions returned in this page (0 to limit)
        - has_more: Boolean indicating if additional query executions exist beyond this page
        
    Pagination:
        - Returns up to `limit` query executions per call, ordered by start time (most recent first)
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available
        - Filter criteria apply consistently across all pages
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Store client-side filters (SDK doesn't support these)
    query_text_filter = None
    user_names_filter = None
    
    if filter_by:
        if filter_by.query_text_contains:
            query_text_filter = filter_by.query_text_contains.lower()
        if filter_by.user_names:
            # Normalize user names to lowercase for case-insensitive matching
            user_names_filter = [name.lower() for name in filter_by.user_names]
    
    # Convert Pydantic filter to SDK filter
    sdk_filter = None
    if filter_by:
        # Convert time range if present
        time_range = None
        if filter_by.query_start_time_range:
            time_range = SDKTimeRange(
                start_time_ms=filter_by.query_start_time_range.start_time_ms,
                end_time_ms=filter_by.query_start_time_range.end_time_ms
            )
        
        # Convert statuses to enum if present
        statuses = None
        if filter_by.statuses:
            statuses = [QueryStatus(status) for status in filter_by.statuses]
        
        sdk_filter = SDKQueryFilter(
            query_start_time_range=time_range,
            statement_ids=filter_by.statement_ids,
            statuses=statuses,
            user_ids=filter_by.user_ids,
            warehouse_ids=filter_by.warehouse_ids
        )
    
    # Call SDK - request significantly more to account for client-side filtering
    # If text or user name filters are present, request 10x more to ensure we get enough matches
    multiplier = 10 if (query_text_filter or user_names_filter) else 2
    response = client.query_history.list(
        filter_by=sdk_filter,
        include_metrics=include_metrics,
        max_results=(page + multiplier) * limit
    )
    
    # Apply client-side filtering if needed
    filtered_results = response.res if response.res else []
    
    # Filter by query text
    if query_text_filter:
        filtered_results = [
            query_info for query_info in filtered_results
            if query_info.query_text and query_text_filter in query_info.query_text.lower()
        ]
    
    # Filter by user names
    if user_names_filter:
        filtered_results = [
            query_info for query_info in filtered_results
            if query_info.user_name and query_info.user_name.lower() in user_names_filter
        ]
    
    # Paginate the filtered results
    start_idx = page * limit
    end_idx = start_idx + limit
    paginated_results = filtered_results[start_idx:end_idx]
    has_more = len(filtered_results) > end_idx
    
    # Convert to Pydantic models
    query_executions = []
    for query_info in paginated_results:
        query_dict = query_info.as_dict()
        
        # Convert metrics if present
        metrics = None
        if query_dict.get('metrics'):
            metrics_dict = query_dict['metrics']
            metrics = QueryMetrics(
                compilation_time_ms=metrics_dict.get('compilation_time_ms'),
                execution_time_ms=metrics_dict.get('execution_time_ms'),
                network_sent_bytes=metrics_dict.get('network_sent_bytes'),
                photon_total_time_ms=metrics_dict.get('photon_total_time_ms'),
                provisioning_queue_start_timestamp=metrics_dict.get('provisioning_queue_start_timestamp'),
                query_compilation_start_timestamp=metrics_dict.get('query_compilation_start_timestamp'),
                read_bytes=metrics_dict.get('read_bytes'),
                read_cache_bytes=metrics_dict.get('read_cache_bytes'),
                read_files_count=metrics_dict.get('read_files_count'),
                read_partitions_count=metrics_dict.get('read_partitions_count'),
                read_remote_bytes=metrics_dict.get('read_remote_bytes'),
                result_fetch_time_ms=metrics_dict.get('result_fetch_time_ms'),
                result_from_cache=metrics_dict.get('result_from_cache'),
                rows_produced_count=metrics_dict.get('rows_produced_count'),
                rows_read_count=metrics_dict.get('rows_read_count'),
                spill_to_disk_bytes=metrics_dict.get('spill_to_disk_bytes'),
                task_total_time_ms=metrics_dict.get('task_total_time_ms'),
                total_time_ms=metrics_dict.get('total_time_ms'),
                write_remote_bytes=metrics_dict.get('write_remote_bytes')
            )
        
        query_executions.append(QueryExecutionInfo(
            query_id=query_dict.get('query_id'),
            query_text=query_dict.get('query_text'),
            status=query_dict.get('status'),
            statement_type=query_dict.get('statement_type'),
            user_id=query_dict.get('user_id'),
            user_name=query_dict.get('user_name'),
            executed_as_user_id=query_dict.get('executed_as_user_id'),
            executed_as_user_name=query_dict.get('executed_as_user_name'),
            warehouse_id=query_dict.get('warehouse_id'),
            endpoint_id=query_dict.get('endpoint_id'),
            query_start_time_ms=query_dict.get('query_start_time_ms'),
            query_end_time_ms=query_dict.get('query_end_time_ms'),
            execution_end_time_ms=query_dict.get('execution_end_time_ms'),
            duration=query_dict.get('duration'),
            rows_produced=query_dict.get('rows_produced'),
            metrics=metrics,
            error_message=query_dict.get('error_message'),
            spark_ui_url=query_dict.get('spark_ui_url'),
            client_application=query_dict.get('client_application'),
            is_final=query_dict.get('is_final'),
            lookup_key=query_dict.get('lookup_key'),
            plans_state=query_dict.get('plans_state')
        ))
    
    return ListQueryHistoryResponse(
        queries=query_executions,
        count=len(query_executions),
        has_more=has_more,
    )

