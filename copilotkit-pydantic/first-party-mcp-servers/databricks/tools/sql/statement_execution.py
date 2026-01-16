"""SQL Statement Execution tools for running queries and fetching results.

All credential parameters use credential keys (globally unique identifiers) that are resolved
server-side from the workspace_credentials table.
"""

from typing import Optional, List
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import (
    StatementParameterListItem,
    Disposition,
    Format,
    ExecuteStatementRequestOnWaitTimeout,
)
from cache import get_workspace_client
from models import (
    StatementParameter,
    StatementResponse,
    ExecuteStatementResponse,
    StatementStatus,
    ResultManifest,
    ResultData,
    ResultSchema,
    ColumnInfo,
    ChunkInfo,
    ExternalLink,
    ServiceError,
    CancelExecutionResponse,
)


def execute_statement(
    host_credential_key: str,
    token_credential_key: str,
    statement: str,
    warehouse_id: str,
    wait_timeout: Optional[str] = "30s",
    on_wait_timeout: Optional[str] = "CONTINUE",
    format: Optional[str] = "JSON_ARRAY",
    disposition: Optional[str] = "INLINE",
    catalog: Optional[str] = None,
    schema: Optional[str] = None,
    parameters: Optional[List[StatementParameter]] = None,
    row_limit: Optional[int] = None,
    byte_limit: Optional[int] = None
) -> ExecuteStatementResponse:
    """
    Execute a SQL statement on a SQL warehouse and optionally await results.
    
    This is the primary API for running SQL queries and fetching data. Supports three
    execution modes: synchronous (wait for results), asynchronous (immediate return),
    or hybrid (wait then fallback to async).
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        statement: SQL statement to execute
        warehouse_id: SQL warehouse ID to execute on
        wait_timeout: Wait time ("0s" for async, "5s"-"50s" for sync, default: "30s")
        on_wait_timeout: Action on timeout: "CONTINUE" (async) or "CANCEL" (default: "CONTINUE")
        format: Result format: "JSON_ARRAY", "ARROW_STREAM", "CSV" (default: "JSON_ARRAY")
        disposition: Result disposition: "INLINE" (≤25MB) or "EXTERNAL_LINKS" (≤100GB) (default: "INLINE")
        catalog: Default catalog for statement execution
        schema: Default schema for statement execution
        parameters: Named parameters for parameterized queries (e.g., :param_name)
        row_limit: Maximum number of rows to return
        byte_limit: Maximum bytes to return (default: 25MB for INLINE, 100GB for EXTERNAL_LINKS)
    
    Returns:
        ExecuteStatementResponse with statement_id, status, and optionally results
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Convert parameters to SDK format
    sdk_parameters = None
    if parameters:
        sdk_parameters = [
            StatementParameterListItem(
                name=p.name,
                value=p.value,
                type=p.type
            )
            for p in parameters
        ]
    
    # Execute statement
    response = client.statement_execution.execute_statement(
        statement=statement,
        warehouse_id=warehouse_id,
        wait_timeout=wait_timeout,
        on_wait_timeout=ExecuteStatementRequestOnWaitTimeout(on_wait_timeout) if on_wait_timeout else None,
        format=Format(format) if format else None,
        disposition=Disposition(disposition) if disposition else None,
        catalog=catalog,
        schema=schema,
        parameters=sdk_parameters,
        row_limit=row_limit,
        byte_limit=byte_limit
    )
    
    # Convert to Pydantic models
    return _convert_statement_response(response)
    except Exception as e:
        return ExecuteStatementResponse(
            statement_id=None,
            status=None,
            error_message=f"Failed to execute statement: {str(e)}",
        )


def get_statement(
    host_credential_key: str,
    token_credential_key: str,
    statement_id: str
) -> StatementResponse:
    """
    Poll for statement execution status and results.
    
    Use this to check the status of an asynchronously executed statement.
    When the statement reaches SUCCEEDED state, this returns the result manifest
    and first chunk of data.
    
    Note: This call may take up to 5 seconds to return the latest status.
    Results are available for 1 hour after completion.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        statement_id: Statement ID from execute_statement
    
    Returns:
        StatementResponse with current status and results (if completed)
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    response = client.statement_execution.get_statement(statement_id=statement_id)
    return _convert_statement_response(response)
    except Exception as e:
        return StatementResponse(
            statement_id=statement_id,
            error_message=f"Failed to get statement: {str(e)}",
        )


def get_statement_result_chunk(
    host_credential_key: str,
    token_credential_key: str,
    statement_id: str,
    chunk_index: int
) -> Optional[ResultData]:
    """
    Fetch a specific result chunk by index.
    
    After statement execution succeeds, use this to fetch result chunks beyond the
    first one. Chunks can be fetched in any order and in parallel for high throughput.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        statement_id: Statement ID from execute_statement
        chunk_index: Zero-based chunk index to fetch
    
    Returns:
        ResultData with the requested chunk, or None on error
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    result = client.statement_execution.get_statement_result_chunk_n(
        statement_id=statement_id,
        chunk_index=chunk_index
    )
    return _convert_result_data(result)
    except Exception as e:
        return None


def cancel_execution(
    host_credential_key: str,
    token_credential_key: str,
    statement_id: str
) -> CancelExecutionResponse:
    """
    Request cancellation of an executing statement.
    
    This sends a cancel request to the execution engine. The cancellation may
    not be immediate, and you should poll with get_statement() until a terminal
    state (CANCELED, FAILED, SUCCEEDED, CLOSED) is reached.
    
    Note: Cancellation might silently fail if the statement has already completed.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        statement_id: Statement ID to cancel
    
    Returns:
        CancelExecutionResponse confirming the cancel request was received
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    client.statement_execution.cancel_execution(statement_id=statement_id)
    
    return CancelExecutionResponse(
        statement_id=statement_id,
        message=f"Cancel request sent for statement {statement_id}. Poll with get_statement() to confirm cancellation."
    )
    except Exception as e:
        return CancelExecutionResponse(
            statement_id=statement_id,
            error_message=f"Failed to cancel execution: {str(e)}",
        )


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_statement_response(response) -> StatementResponse:
    """Convert SDK StatementResponse to Pydantic model."""
    response_dict = response.as_dict()
    
    # Convert status
    status = None
    if response_dict.get('status'):
        status_dict = response_dict['status']
        error = None
        if status_dict.get('error'):
            error_dict = status_dict['error']
            error = ServiceError(
                error_code=error_dict.get('error_code'),
                message=error_dict.get('message')
            )
        status = StatementStatus(
            state=status_dict.get('state'),
            error=error
        )
    
    # Convert manifest
    manifest = None
    if response_dict.get('manifest'):
        manifest = _convert_manifest(response_dict['manifest'])
    
    # Convert result
    result = None
    if response_dict.get('result'):
        result = _convert_result_data_dict(response_dict['result'])
    
    return StatementResponse(
        statement_id=response_dict.get('statement_id'),
        status=status,
        manifest=manifest,
        result=result
    )


def _convert_manifest(manifest_dict: dict) -> ResultManifest:
    """Convert manifest dictionary to Pydantic model."""
    # Convert schema
    schema_obj = None
    if manifest_dict.get('schema'):
        schema_dict = manifest_dict['schema']
        columns = []
        if schema_dict.get('columns'):
            for col_dict in schema_dict['columns']:
                columns.append(ColumnInfo(
                    name=col_dict.get('name'),
                    type_text=col_dict.get('type_text'),
                    type_name=col_dict.get('type_name'),
                    position=col_dict.get('position'),
                    type_precision=col_dict.get('type_precision'),
                    type_scale=col_dict.get('type_scale'),
                    type_interval_type=col_dict.get('type_interval_type')
                ))
        schema_obj = ResultSchema(
            columns=columns,
            column_count=schema_dict.get('column_count')
        )
    
    # Convert chunks
    chunks = []
    if manifest_dict.get('chunks'):
        for chunk_dict in manifest_dict['chunks']:
            chunks.append(ChunkInfo(
                chunk_index=chunk_dict.get('chunk_index'),
                row_offset=chunk_dict.get('row_offset'),
                row_count=chunk_dict.get('row_count'),
                byte_count=chunk_dict.get('byte_count')
            ))
    
    return ResultManifest(
        format=manifest_dict.get('format'),
        schema_name=schema_obj,
        total_row_count=manifest_dict.get('total_row_count'),
        total_chunk_count=manifest_dict.get('total_chunk_count'),
        total_byte_count=manifest_dict.get('total_byte_count'),
        truncated=manifest_dict.get('truncated'),
        chunks=chunks if chunks else None
    )


def _convert_result_data(result) -> ResultData:
    """Convert SDK ResultData to Pydantic model."""
    return _convert_result_data_dict(result.as_dict())


def _convert_result_data_dict(result_dict: dict) -> ResultData:
    """Convert result dictionary to Pydantic model."""
    # Convert external links
    external_links = []
    if result_dict.get('external_links'):
        for link_dict in result_dict['external_links']:
            external_links.append(ExternalLink(
                external_link=link_dict.get('external_link'),
                expiration=link_dict.get('expiration'),
                chunk_index=link_dict.get('chunk_index'),
                row_offset=link_dict.get('row_offset'),
                row_count=link_dict.get('row_count'),
                byte_count=link_dict.get('byte_count'),
                http_headers=link_dict.get('http_headers'),
                next_chunk_index=link_dict.get('next_chunk_index'),
                next_chunk_internal_link=link_dict.get('next_chunk_internal_link')
            ))
    
    return ResultData(
        chunk_index=result_dict.get('chunk_index'),
        row_offset=result_dict.get('row_offset'),
        row_count=result_dict.get('row_count'),
        byte_count=result_dict.get('byte_count'),
        data_array=result_dict.get('data_array'),
        external_links=external_links if external_links else None,
        next_chunk_index=result_dict.get('next_chunk_index'),
        next_chunk_internal_link=result_dict.get('next_chunk_internal_link')
    )

