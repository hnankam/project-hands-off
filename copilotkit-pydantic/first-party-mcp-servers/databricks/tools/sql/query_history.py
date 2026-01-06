"""SQL Query History tools for monitoring query executions."""

from typing import Optional, List
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
    max_results: Optional[int] = 100,
    page_token: Optional[str] = None
) -> ListQueryHistoryResponse:
    """
    List the history of queries executed through SQL warehouses and serverless compute.
    
    Returns most recently started queries first. Use this to monitor query performance,
    debug failures, track usage patterns, and analyze execution metrics.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        filter_by: Optional filter criteria (time range, user IDs, warehouse IDs, statuses)
        include_metrics: Whether to include detailed query metrics (default: False)
        max_results: Maximum number of results per page (max 1000, default 100)
        page_token: Pagination token from previous request
    
    Returns:
        ListQueryHistoryResponse with query execution history and metrics
    
    Example:
        # Get queries from last 24 hours with metrics
        from datetime import datetime, timedelta
        
        end_time = int(datetime.now().timestamp() * 1000)
        start_time = int((datetime.now() - timedelta(days=1)).timestamp() * 1000)
        
        response = list_query_history(
            host, token,
            filter_by=QueryFilter(
                query_start_time_range=TimeRange(
                    start_time_ms=start_time,
                    end_time_ms=end_time
                ),
                statuses=["FAILED", "FINISHED"]
            ),
            include_metrics=True,
            max_results=50
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
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
    
    # Call SDK
    response = client.query_history.list(
        filter_by=sdk_filter,
        include_metrics=include_metrics,
        max_results=max_results,
        page_token=page_token
    )
    
    # Convert to Pydantic models
    query_executions = []
    for query_info in response.res:
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
        has_next_page=response.has_next_page if hasattr(response, 'has_next_page') else False,
        next_page_token=response.next_page_token if hasattr(response, 'next_page_token') else None
    )

