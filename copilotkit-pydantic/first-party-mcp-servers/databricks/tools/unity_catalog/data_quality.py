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
    host_credential_key: str,
    token_credential_key: str,
    monitor_config: Dict[str, Any],
) -> CreateMonitorResponse:
    """
    Create a data quality monitor.
    
    Creates a data quality monitor on a Unity Catalog object (schema or table).
    For tables, provide data_profiling_config. For schemas, provide
    anomaly_detection_config.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Authentication token
        monitor_config: Monitor configuration dictionary (must include object_type and object_id)
        
    Returns:
        CreateMonitorResponse with created monitor
        
    Note:
        The monitor_config should include:
        - table_name or schema_name: Full name of the object to monitor
        - baseline_table_name: Optional baseline table for comparisons
        - output_schema_name: Schema for storing monitoring results
        - Other monitor-specific configuration
    """
    try:
        client = get_workspace_client(host_credential_key, token_credential_key)
    
        from databricks.sdk.service.dataquality import Monitor
    
        # Create Monitor object from config
        monitor_spec = Monitor.from_dict(monitor_config)
    
        monitor = client.data_quality.create_monitor(monitor=monitor_spec)
    
        return CreateMonitorResponse(
            monitor=_convert_to_monitor(monitor),
        )

    except Exception as e:
        return CreateMonitorResponse(
            monitor=None,
            error_message=f"Failed to create data quality monitor: {str(e)}",
        )


def get_data_quality_monitor(
    host_credential_key: str,
    token_credential_key: str,
    object_type: str,
    object_id: str,
) -> Optional[DataQualityMonitorModel]:
    """
    Get a data quality monitor.
    
    Retrieves detailed information about a data quality monitor.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        object_type: Object type ("schema" or "table")
        object_id: Object ID (schema_id or table_id)
        
    Returns:
        DataQualityMonitorModel with monitor details
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        monitor = client.data_quality.get_monitor(
            object_type=object_type,
            object_id=object_id,
        )
    
        return _convert_to_monitor(monitor)

    except Exception as e:
        print(f"Error getting data quality monitor: {e}")
        return None


def update_data_quality_monitor(
    host_credential_key: str,
    token_credential_key: str,
    object_type: str,
    object_id: str,
    update_mask: str,
    monitor_config: Dict[str, Any],
) -> UpdateMonitorResponse:
    """
    Update a data quality monitor.
    
    Updates the configuration of an existing data quality monitor.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        object_type: Object type ("schema" or "table")
        object_id: Object ID (schema_id or table_id)
        update_mask: Comma-separated list of fields to update
        monitor_config: Updated monitor configuration
        
    Returns:
        UpdateMonitorResponse with updated monitor
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
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

    except Exception as e:
        return UpdateMonitorResponse(
            monitor=None,
            error_message=f"Failed to update data quality monitor: {str(e)}",
        )


def delete_data_quality_monitor(
    host_credential_key: str,
    token_credential_key: str,
    object_type: str,
    object_id: str,
) -> DeleteMonitorResponse:
    """
    Delete a data quality monitor.
    
    Deletes a data quality monitor. Note that metric tables and dashboards
    are not automatically deleted and must be cleaned up manually if desired.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        object_type: Object type ("schema" or "table")
        object_id: Object ID (schema_id or table_id)
        
    Returns:
        DeleteMonitorResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.data_quality.delete_monitor(
            object_type=object_type,
            object_id=object_id,
        )
    
        return DeleteMonitorResponse(
            object_type=object_type,
            object_id=object_id,
        )

    except Exception as e:
        return DeleteMonitorResponse(
            object_type=object_type,
            object_id=object_id,
            error_message=f"Failed to delete data quality monitor: {str(e)}",
        )


def list_data_quality_monitors(
    host_credential_key: str,
    token_credential_key: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListMonitorsResponse:
    """
    List data quality monitors.
    
    Retrieves all data quality monitors in the workspace.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        page_size: Maximum results per page (optional)
        page_token: Pagination token (optional)
        
    Returns:
        ListMonitorsResponse with monitors
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
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
    except Exception as e:
        return ListMonitorsResponse(
            monitors=[],
            next_page_token=None,
            error_message=f"Failed to list data quality monitors: {str(e)}",
        )


# ============================================================================
# Data Quality Refresh Management
# ============================================================================

def create_data_quality_refresh(
    host_credential_key: str,
    token_credential_key: str,
    object_type: str,
    object_id: str,
    refresh_config: Optional[Dict[str, Any]] = None,
) -> CreateRefreshResponse:
    """
    Create a data quality refresh.
    
    Triggers a manual refresh of data quality metrics. Currently only
    supported for table monitors.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        object_type: Object type ("table")
        object_id: Object ID (table_id)
        refresh_config: Refresh configuration (optional)
        
    Returns:
        CreateRefreshResponse with created refresh
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
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

    except Exception as e:
        return CreateRefreshResponse(
            refresh=None,
            error_message=f"Failed to create data quality refresh: {str(e)}",
        )


def get_data_quality_refresh(
    host_credential_key: str,
    token_credential_key: str,
    object_type: str,
    object_id: str,
    refresh_id: int,
) -> Optional[DataQualityRefreshModel]:
    """
    Get a data quality refresh.
    
    Retrieves information about a specific refresh operation.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        object_type: Object type ("table" or "schema")
        object_id: Object ID
        refresh_id: Refresh ID
        
    Returns:
        DataQualityRefreshModel with refresh details
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        refresh = client.data_quality.get_refresh(
            object_type=object_type,
            object_id=object_id,
            refresh_id=refresh_id,
        )
    
        return _convert_to_refresh(refresh)

    except Exception as e:
        print(f"Error getting data quality refresh: {e}")
        return None


def list_data_quality_refreshes(
    host_credential_key: str,
    token_credential_key: str,
    object_type: str,
    object_id: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListRefreshesResponse:
    """
    List data quality refreshes.
    
    Retrieves all refresh operations for a monitored object.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        object_type: Object type ("table" or "schema")
        object_id: Object ID
        page_size: Maximum results per page (optional)
        page_token: Pagination token (optional)
        
    Returns:
        ListRefreshesResponse with refreshes
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
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

    except Exception as e:
        return ListRefreshesResponse(
            refreshes=[],
            next_page_token=None,
            error_message=f"Failed to list data quality refreshes: {str(e)}",
        )


def cancel_data_quality_refresh(
    host_credential_key: str,
    token_credential_key: str,
    object_type: str,
    object_id: str,
    refresh_id: int,
) -> CancelRefreshResponse:
    """
    Cancel a data quality refresh.
    
    Cancels an in-progress refresh operation. Currently only supported
    for table monitors.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        object_type: Object type ("table")
        object_id: Object ID (table_id)
        refresh_id: Refresh ID to cancel
        
    Returns:
        CancelRefreshResponse confirming cancellation
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.data_quality.cancel_refresh(
            object_type=object_type,
            object_id=object_id,
            refresh_id=refresh_id,
        )
    
        return CancelRefreshResponse(
            refresh_id=refresh_id,
        )

    except Exception as e:
        return CancelRefreshResponse(
            refresh_id=refresh_id,
            error_message=f"Failed to cancel data quality refresh: {str(e)}",
        )

