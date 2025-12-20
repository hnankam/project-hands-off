"""
Data Quality Tools

This module provides tools for managing data quality monitors on Unity Catalog
objects (schemas and tables). Data quality monitors track data quality metrics,
anomalies, and drift over time, providing visibility into data health.
"""

from typing import Optional, Dict, Any
from cache import get_workspace_client
from models import (
    DataQualityMonitorModel,
    CreateMonitorResponse,
    UpdateMonitorResponse,
    DeleteMonitorResponse,
    ListMonitorsResponse,
    DataQualityRefreshModel,
    CreateRefreshResponse,
    CancelRefreshResponse,
    ListRefreshesResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_monitor(monitor) -> DataQualityMonitorModel:
    """Convert SDK Monitor to Pydantic model."""
    return DataQualityMonitorModel(
        monitor_id=monitor.monitor_id if hasattr(monitor, 'monitor_id') else None,
        object_type=monitor.object_type if hasattr(monitor, 'object_type') else None,
        object_id=monitor.object_id if hasattr(monitor, 'object_id') else None,
        table_name=monitor.table_name if hasattr(monitor, 'table_name') else None,
        schema_name=monitor.schema_name if hasattr(monitor, 'schema_name') else None,
        status=monitor.status.value if hasattr(monitor, 'status') and monitor.status else None,
        dashboard_id=monitor.dashboard_id if hasattr(monitor, 'dashboard_id') else None,
        drift_metrics_table_name=monitor.drift_metrics_table_name if hasattr(monitor, 'drift_metrics_table_name') else None,
        profile_metrics_table_name=monitor.profile_metrics_table_name if hasattr(monitor, 'profile_metrics_table_name') else None,
    )


def _convert_to_refresh(refresh) -> DataQualityRefreshModel:
    """Convert SDK Refresh to Pydantic model."""
    return DataQualityRefreshModel(
        refresh_id=refresh.refresh_id if hasattr(refresh, 'refresh_id') else None,
        object_type=refresh.object_type if hasattr(refresh, 'object_type') else None,
        object_id=refresh.object_id if hasattr(refresh, 'object_id') else None,
        status=refresh.status.value if hasattr(refresh, 'status') and refresh.status else None,
        start_time=refresh.start_time if hasattr(refresh, 'start_time') else None,
        end_time=refresh.end_time if hasattr(refresh, 'end_time') else None,
    )


# ============================================================================
# Data Quality Monitor Management
# ============================================================================

def create_data_quality_monitor(
    host: str,
    token: str,
    object_type: str,
    object_id: str,
    monitor_config: Dict[str, Any],
) -> CreateMonitorResponse:
    """
    Create a data quality monitor.
    
    Creates a data quality monitor on a Unity Catalog object (schema or table).
    For tables, provide data_profiling_config. For schemas, provide
    anomaly_detection_config.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        object_type: Object type ("schema" or "table")
        object_id: Object ID (schema_id or table_id)
        monitor_config: Monitor configuration dictionary
        
    Returns:
        CreateMonitorResponse with created monitor
        
    Example:
        # Create table monitor with data profiling
        response = create_data_quality_monitor(
            host, token,
            object_type="table",
            object_id="abc-123-def",
            monitor_config={
                "table_name": "main.sales.transactions",
                "output_schema_name": "main.data_quality",
                "data_profiling_config": {
                    "enabled": True,
                    "schedule": {
                        "quartz_cron_expression": "0 0 0 * * ?"
                    }
                }
            }
        )
        print(f"Created monitor: {response.monitor.monitor_id}")
        print(f"Dashboard: {response.monitor.dashboard_id}")
        
        # Create schema monitor with anomaly detection
        response = create_data_quality_monitor(
            host, token,
            object_type="schema",
            object_id="xyz-456-uvw",
            monitor_config={
                "schema_name": "main.sales",
                "anomaly_detection_config": {
                    "enabled": True
                }
            }
        )
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.dataquality import Monitor
    
    # Create Monitor object from config
    monitor_spec = Monitor.from_dict(monitor_config)
    
    monitor = client.data_quality.create_monitor(monitor=monitor_spec)
    
    return CreateMonitorResponse(
        monitor=_convert_to_monitor(monitor),
    )


def get_data_quality_monitor(
    host: str,
    token: str,
    object_type: str,
    object_id: str,
) -> DataQualityMonitorModel:
    """
    Get a data quality monitor.
    
    Retrieves detailed information about a data quality monitor.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        object_type: Object type ("schema" or "table")
        object_id: Object ID (schema_id or table_id)
        
    Returns:
        DataQualityMonitorModel with monitor details
        
    Example:
        # Get table monitor
        monitor = get_data_quality_monitor(
            host, token,
            object_type="table",
            object_id="abc-123-def"
        )
        print(f"Monitor ID: {monitor.monitor_id}")
        print(f"Status: {monitor.status}")
        print(f"Dashboard: {monitor.dashboard_id}")
        print(f"Metrics table: {monitor.profile_metrics_table_name}")
        
        # Get schema monitor
        monitor = get_data_quality_monitor(
            host, token,
            object_type="schema",
            object_id="xyz-456-uvw"
        )
    """
    client = get_workspace_client(host, token)
    
    monitor = client.data_quality.get_monitor(
        object_type=object_type,
        object_id=object_id,
    )
    
    return _convert_to_monitor(monitor)


def update_data_quality_monitor(
    host: str,
    token: str,
    object_type: str,
    object_id: str,
    update_mask: str,
    monitor_config: Dict[str, Any],
) -> UpdateMonitorResponse:
    """
    Update a data quality monitor.
    
    Updates the configuration of an existing data quality monitor.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        object_type: Object type ("schema" or "table")
        object_id: Object ID (schema_id or table_id)
        update_mask: Comma-separated list of fields to update
        monitor_config: Updated monitor configuration
        
    Returns:
        UpdateMonitorResponse with updated monitor
        
    Example:
        # Update schedule for table monitor
        response = update_data_quality_monitor(
            host, token,
            object_type="table",
            object_id="abc-123-def",
            update_mask="data_profiling_config.schedule.quartz_cron_expression",
            monitor_config={
                "data_profiling_config": {
                    "schedule": {
                        "quartz_cron_expression": "0 0 12 * * ?"  # Daily at noon
                    }
                }
            }
        )
        
        # Update custom metrics
        response = update_data_quality_monitor(
            host, token,
            object_type="table",
            object_id="abc-123-def",
            update_mask="data_profiling_config.custom_metrics",
            monitor_config={
                "data_profiling_config": {
                    "custom_metrics": [
                        {
                            "name": "revenue_check",
                            "type": "AGGREGATE",
                            "definition": "SUM(revenue) > 1000000"
                        }
                    ]
                }
            }
        )
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.dataquality import Monitor
    
    # Create Monitor object from config
    monitor_spec = Monitor.from_dict(monitor_config)
    
    monitor = client.data_quality.update_monitor(
        object_type=object_type,
        object_id=object_id,
        monitor=monitor_spec,
        update_mask=update_mask,
    )
    
    return UpdateMonitorResponse(
        monitor=_convert_to_monitor(monitor),
    )


def delete_data_quality_monitor(
    host: str,
    token: str,
    object_type: str,
    object_id: str,
) -> DeleteMonitorResponse:
    """
    Delete a data quality monitor.
    
    Deletes a data quality monitor. Note that metric tables and dashboards
    are not automatically deleted and must be cleaned up manually if desired.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        object_type: Object type ("schema" or "table")
        object_id: Object ID (schema_id or table_id)
        
    Returns:
        DeleteMonitorResponse confirming deletion
        
    Example:
        # Delete table monitor
        response = delete_data_quality_monitor(
            host, token,
            object_type="table",
            object_id="abc-123-def"
        )
        print(response.message)
        
    Note:
        - Metric tables are NOT deleted
        - Dashboard is NOT deleted
        - Manual cleanup required if desired
    """
    client = get_workspace_client(host, token)
    
    client.data_quality.delete_monitor(
        object_type=object_type,
        object_id=object_id,
    )
    
    return DeleteMonitorResponse(
        object_type=object_type,
        object_id=object_id,
    )


def list_data_quality_monitors(
    host: str,
    token: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListMonitorsResponse:
    """
    List data quality monitors.
    
    Retrieves all data quality monitors in the workspace.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        page_size: Maximum results per page (optional)
        page_token: Pagination token (optional)
        
    Returns:
        ListMonitorsResponse with monitors
        
    Example:
        # List all monitors
        response = list_data_quality_monitors(host, token)
        for monitor in response.monitors:
            print(f"{monitor.table_name or monitor.schema_name}")
            print(f"  Status: {monitor.status}")
            print(f"  Dashboard: {monitor.dashboard_id}")
            
    Note:
        This operation may be unimplemented in some SDK versions.
    """
    client = get_workspace_client(host, token)
    
    monitors = []
    next_token = None
    
    try:
        for monitor in client.data_quality.list_monitor(
            page_size=page_size,
            page_token=page_token,
        ):
            monitors.append(_convert_to_monitor(monitor))
    except Exception as e:
        # list_monitor may be unimplemented
        pass
    
    return ListMonitorsResponse(
        monitors=monitors,
        next_page_token=next_token,
    )


# ============================================================================
# Data Quality Refresh Management
# ============================================================================

def create_data_quality_refresh(
    host: str,
    token: str,
    object_type: str,
    object_id: str,
    refresh_config: Optional[Dict[str, Any]] = None,
) -> CreateRefreshResponse:
    """
    Create a data quality refresh.
    
    Triggers a manual refresh of data quality metrics. Currently only
    supported for table monitors.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        object_type: Object type ("table")
        object_id: Object ID (table_id)
        refresh_config: Refresh configuration (optional)
        
    Returns:
        CreateRefreshResponse with created refresh
        
    Example:
        # Trigger manual refresh for table monitor
        response = create_data_quality_refresh(
            host, token,
            object_type="table",
            object_id="abc-123-def"
        )
        print(f"Refresh ID: {response.refresh.refresh_id}")
        print(f"Status: {response.refresh.status}")
        
        # Monitor refresh progress
        refresh = get_data_quality_refresh(
            host, token,
            object_type="table",
            object_id="abc-123-def",
            refresh_id=response.refresh.refresh_id
        )
        print(f"Status: {refresh.status}")
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.dataquality import Refresh
    
    # Create Refresh object from config
    if refresh_config:
        refresh_spec = Refresh.from_dict(refresh_config)
    else:
        refresh_spec = Refresh()
    
    refresh = client.data_quality.create_refresh(
        object_type=object_type,
        object_id=object_id,
        refresh=refresh_spec,
    )
    
    return CreateRefreshResponse(
        refresh=_convert_to_refresh(refresh),
    )


def get_data_quality_refresh(
    host: str,
    token: str,
    object_type: str,
    object_id: str,
    refresh_id: int,
) -> DataQualityRefreshModel:
    """
    Get a data quality refresh.
    
    Retrieves information about a specific refresh operation.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        object_type: Object type ("table" or "schema")
        object_id: Object ID
        refresh_id: Refresh ID
        
    Returns:
        DataQualityRefreshModel with refresh details
        
    Example:
        # Get refresh status
        refresh = get_data_quality_refresh(
            host, token,
            object_type="table",
            object_id="abc-123-def",
            refresh_id=12345
        )
        print(f"Status: {refresh.status}")
        print(f"Start time: {refresh.start_time}")
        print(f"End time: {refresh.end_time}")
    """
    client = get_workspace_client(host, token)
    
    refresh = client.data_quality.get_refresh(
        object_type=object_type,
        object_id=object_id,
        refresh_id=refresh_id,
    )
    
    return _convert_to_refresh(refresh)


def list_data_quality_refreshes(
    host: str,
    token: str,
    object_type: str,
    object_id: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListRefreshesResponse:
    """
    List data quality refreshes.
    
    Retrieves all refresh operations for a monitored object.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        object_type: Object type ("table" or "schema")
        object_id: Object ID
        page_size: Maximum results per page (optional)
        page_token: Pagination token (optional)
        
    Returns:
        ListRefreshesResponse with refreshes
        
    Example:
        # List all refreshes for a table monitor
        response = list_data_quality_refreshes(
            host, token,
            object_type="table",
            object_id="abc-123-def"
        )
        for refresh in response.refreshes:
            print(f"Refresh {refresh.refresh_id}")
            print(f"  Status: {refresh.status}")
            print(f"  Start: {refresh.start_time}")
            print(f"  End: {refresh.end_time}")
    """
    client = get_workspace_client(host, token)
    
    refreshes = []
    next_token = None
    
    for refresh in client.data_quality.list_refresh(
        object_type=object_type,
        object_id=object_id,
        page_size=page_size,
        page_token=page_token,
    ):
        refreshes.append(_convert_to_refresh(refresh))
    
    return ListRefreshesResponse(
        refreshes=refreshes,
        next_page_token=next_token,
    )


def cancel_data_quality_refresh(
    host: str,
    token: str,
    object_type: str,
    object_id: str,
    refresh_id: int,
) -> CancelRefreshResponse:
    """
    Cancel a data quality refresh.
    
    Cancels an in-progress refresh operation. Currently only supported
    for table monitors.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        object_type: Object type ("table")
        object_id: Object ID (table_id)
        refresh_id: Refresh ID to cancel
        
    Returns:
        CancelRefreshResponse confirming cancellation
        
    Example:
        # Cancel a running refresh
        response = cancel_data_quality_refresh(
            host, token,
            object_type="table",
            object_id="abc-123-def",
            refresh_id=12345
        )
        print(response.message)
        
        # Typical workflow:
        # 1. Create refresh
        # 2. Monitor progress
        # 3. Cancel if needed
        refresh_response = create_data_quality_refresh(
            host, token,
            object_type="table",
            object_id="abc-123-def"
        )
        
        # ... later, if needed ...
        cancel_data_quality_refresh(
            host, token,
            object_type="table",
            object_id="abc-123-def",
            refresh_id=refresh_response.refresh.refresh_id
        )
    """
    client = get_workspace_client(host, token)
    
    client.data_quality.cancel_refresh(
        object_type=object_type,
        object_id=object_id,
        refresh_id=refresh_id,
    )
    
    return CancelRefreshResponse(
        refresh_id=refresh_id,
    )

