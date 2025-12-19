"""Pydantic models for Databricks MCP server responses.

These models wrap Databricks SDK dataclass types to provide:
- Type safety for FastMCP
- Automatic validation
- Better JSON serialization
- Clear API documentation
"""

from typing import Any, Optional, List, Dict
from pydantic import BaseModel, Field


# ============================================================================
# SQL Query Models
# ============================================================================

class QueryInfo(BaseModel):
    """Information about a SQL query.
    
    Attributes:
        id: Unique query ID
        display_name: Query display name
        query_text: The SQL query text
        description: Query description
        warehouse_id: SQL warehouse ID
        owner_user_name: Owner username
        catalog: Unity Catalog name
        schema: Schema name
        tags: List of tags
        parent_path: Parent folder path
        lifecycle_state: Query lifecycle state
        run_as_mode: Run as mode (VIEWER or OWNER)
        create_time: Creation timestamp
        update_time: Last update timestamp
        last_modifier_user_name: Last modifier username
        apply_auto_limit: Whether to apply auto limit
        parameters: Query parameters
    """
    id: Optional[str] = Field(None, description="Unique query ID")
    display_name: Optional[str] = Field(None, description="Query display name")
    query_text: Optional[str] = Field(None, description="SQL query text")
    description: Optional[str] = Field(None, description="Query description")
    warehouse_id: Optional[str] = Field(None, description="SQL warehouse ID")
    owner_user_name: Optional[str] = Field(None, description="Owner username")
    catalog: Optional[str] = Field(None, description="Unity Catalog name")
    schema_name: Optional[str] = Field(None, description="Schema name")
    tags: Optional[List[str]] = Field(None, description="List of tags")
    parent_path: Optional[str] = Field(None, description="Parent folder path")
    lifecycle_state: Optional[str] = Field(None, description="Lifecycle state")
    run_as_mode: Optional[str] = Field(None, description="Run as mode (VIEWER or OWNER)")
    create_time: Optional[str] = Field(None, description="Creation timestamp")
    update_time: Optional[str] = Field(None, description="Last update timestamp")
    last_modifier_user_name: Optional[str] = Field(None, description="Last modifier username")
    apply_auto_limit: Optional[bool] = Field(None, description="Whether to apply auto limit")
    parameters: Optional[List[Dict[str, Any]]] = Field(None, description="Query parameters")


class ListQueriesResponse(BaseModel):
    """Response model for listing queries."""
    queries: List[QueryInfo] = Field(..., description="List of queries")
    count: int = Field(..., description="Total number of queries returned")
    next_page_token: Optional[str] = Field(None, description="Token for next page of results")


class CreateQueryResponse(BaseModel):
    """Response model for creating a query."""
    id: str = Field(..., description="Created query ID")
    display_name: Optional[str] = Field(None, description="Query display name")
    query_text: Optional[str] = Field(None, description="SQL query text")
    warehouse_id: Optional[str] = Field(None, description="SQL warehouse ID")
    status: str = Field(default="created", description="Status message")


class UpdateQueryResponse(BaseModel):
    """Response model for updating a query."""
    id: str = Field(..., description="Updated query ID")
    display_name: Optional[str] = Field(None, description="Query display name")
    query_text: Optional[str] = Field(None, description="SQL query text")
    update_time: Optional[str] = Field(None, description="Last update timestamp")
    status: str = Field(default="updated", description="Status message")


class DeleteQueryResponse(BaseModel):
    """Response model for deleting a query."""
    id: str = Field(..., description="Deleted query ID")
    status: str = Field(default="deleted", description="Status message (moved to trash)")


class VisualizationInfo(BaseModel):
    """Information about a query visualization."""
    id: Optional[str] = Field(None, description="Visualization ID")
    query_id: Optional[str] = Field(None, description="Parent query ID")
    type: Optional[str] = Field(None, description="Visualization type")
    display_name: Optional[str] = Field(None, description="Visualization display name")
    create_time: Optional[str] = Field(None, description="Creation timestamp")
    update_time: Optional[str] = Field(None, description="Last update timestamp")
    serialized_options: Optional[str] = Field(None, description="Serialized visualization options")
    serialized_query_plan: Optional[str] = Field(None, description="Serialized query plan")


class ListVisualizationsResponse(BaseModel):
    """Response model for listing query visualizations."""
    query_id: str = Field(..., description="Query ID")
    visualizations: List[VisualizationInfo] = Field(..., description="List of visualizations")
    count: int = Field(..., description="Total number of visualizations")


# ============================================================================
# Query History Models
# ============================================================================

class TimeRange(BaseModel):
    """Time range filter for query history."""
    start_time_ms: Optional[int] = Field(None, description="Start time in milliseconds since epoch")
    end_time_ms: Optional[int] = Field(None, description="End time in milliseconds since epoch")


class QueryFilter(BaseModel):
    """Filter criteria for query history."""
    query_start_time_range: Optional[TimeRange] = Field(None, description="Filter by query start time range")
    statement_ids: Optional[List[str]] = Field(None, description="Filter by statement IDs")
    statuses: Optional[List[str]] = Field(None, description="Filter by query statuses (QUEUED, RUNNING, CANCELED, FAILED, FINISHED)")
    user_ids: Optional[List[int]] = Field(None, description="Filter by user IDs")
    warehouse_ids: Optional[List[str]] = Field(None, description="Filter by SQL warehouse IDs")


class QueryMetrics(BaseModel):
    """Metrics for a query execution."""
    compilation_time_ms: Optional[int] = Field(None, description="Time spent compiling the query (ms)")
    execution_time_ms: Optional[int] = Field(None, description="Time spent executing the query (ms)")
    network_sent_bytes: Optional[int] = Field(None, description="Bytes sent over network")
    photon_total_time_ms: Optional[int] = Field(None, description="Time spent in Photon engine (ms)")
    provisioning_queue_start_timestamp: Optional[int] = Field(None, description="Timestamp when provisioning started")
    query_compilation_start_timestamp: Optional[int] = Field(None, description="Timestamp when compilation started")
    read_bytes: Optional[int] = Field(None, description="Bytes read")
    read_cache_bytes: Optional[int] = Field(None, description="Bytes read from cache")
    read_files_count: Optional[int] = Field(None, description="Number of files read")
    read_partitions_count: Optional[int] = Field(None, description="Number of partitions read")
    read_remote_bytes: Optional[int] = Field(None, description="Bytes read from remote storage")
    result_fetch_time_ms: Optional[int] = Field(None, description="Time spent fetching results (ms)")
    result_from_cache: Optional[bool] = Field(None, description="Whether results came from cache")
    rows_produced_count: Optional[int] = Field(None, description="Number of rows produced")
    rows_read_count: Optional[int] = Field(None, description="Number of rows read")
    spill_to_disk_bytes: Optional[int] = Field(None, description="Bytes spilled to disk")
    task_total_time_ms: Optional[int] = Field(None, description="Total task time (ms)")
    total_time_ms: Optional[int] = Field(None, description="Total query time (ms)")
    write_remote_bytes: Optional[int] = Field(None, description="Bytes written to remote storage")


class QueryExecutionInfo(BaseModel):
    """Information about a query execution from history."""
    query_id: Optional[str] = Field(None, description="Unique query execution ID")
    query_text: Optional[str] = Field(None, description="SQL query text")
    status: Optional[str] = Field(None, description="Query status (QUEUED, RUNNING, CANCELED, FAILED, FINISHED)")
    statement_type: Optional[str] = Field(None, description="Statement type (SELECT, INSERT, etc.)")
    
    # User information
    user_id: Optional[int] = Field(None, description="User ID who executed the query")
    user_name: Optional[str] = Field(None, description="Username who executed the query")
    executed_as_user_id: Optional[int] = Field(None, description="User ID the query was executed as")
    executed_as_user_name: Optional[str] = Field(None, description="Username the query was executed as")
    
    # Warehouse information
    warehouse_id: Optional[str] = Field(None, description="SQL warehouse ID")
    endpoint_id: Optional[str] = Field(None, description="Endpoint ID (deprecated, use warehouse_id)")
    
    # Timing information
    query_start_time_ms: Optional[int] = Field(None, description="Query start timestamp (ms since epoch)")
    query_end_time_ms: Optional[int] = Field(None, description="Query end timestamp (ms since epoch)")
    execution_end_time_ms: Optional[int] = Field(None, description="Execution end timestamp (ms since epoch)")
    duration: Optional[int] = Field(None, description="Query duration in milliseconds")
    
    # Results and performance
    rows_produced: Optional[int] = Field(None, description="Number of rows produced")
    metrics: Optional[QueryMetrics] = Field(None, description="Detailed query metrics")
    
    # Error handling
    error_message: Optional[str] = Field(None, description="Error message if query failed")
    
    # Additional metadata
    spark_ui_url: Optional[str] = Field(None, description="Spark UI URL for the query")
    client_application: Optional[str] = Field(None, description="Client application name")
    is_final: Optional[bool] = Field(None, description="Whether this is the final state")
    lookup_key: Optional[str] = Field(None, description="Lookup key for the query")
    plans_state: Optional[str] = Field(None, description="Query plans state")


class ListQueryHistoryResponse(BaseModel):
    """Response model for listing query execution history."""
    queries: List[QueryExecutionInfo] = Field(..., description="List of query executions")
    count: int = Field(..., description="Number of queries returned")
    has_next_page: bool = Field(..., description="Whether there are more results")
    next_page_token: Optional[str] = Field(None, description="Token for next page of results")


# ============================================================================
# Statement Execution Models
# ============================================================================

class StatementParameter(BaseModel):
    """Parameter for parameterized SQL statements."""
    name: str = Field(..., description="Parameter name (without colon prefix)")
    value: Optional[str] = Field(None, description="Parameter value (omit or set to null for NULL)")
    type: Optional[str] = Field(None, description="SQL type (e.g., 'DATE', 'INT', 'STRING')")


class ColumnInfo(BaseModel):
    """Schema information for a result column."""
    name: Optional[str] = Field(None, description="Column name")
    type_text: Optional[str] = Field(None, description="SQL type as text")
    type_name: Optional[str] = Field(None, description="Type name enum")
    position: Optional[int] = Field(None, description="Column position (0-based)")
    type_precision: Optional[int] = Field(None, description="Precision for numeric types")
    type_scale: Optional[int] = Field(None, description="Scale for numeric types")
    type_interval_type: Optional[str] = Field(None, description="Interval type if applicable")


class ResultSchema(BaseModel):
    """Schema of the result set."""
    columns: Optional[List[ColumnInfo]] = Field(None, description="Column definitions")
    column_count: Optional[int] = Field(None, description="Total number of columns")


class ChunkInfo(BaseModel):
    """Information about a result chunk."""
    chunk_index: Optional[int] = Field(None, description="Chunk index")
    row_offset: Optional[int] = Field(None, description="Starting row offset")
    row_count: Optional[int] = Field(None, description="Number of rows in chunk")
    byte_count: Optional[int] = Field(None, description="Size in bytes")


class ExternalLink(BaseModel):
    """External link for downloading result chunk."""
    external_link: Optional[str] = Field(None, description="URL to download chunk")
    expiration: Optional[str] = Field(None, description="Link expiration timestamp")
    chunk_index: Optional[int] = Field(None, description="Chunk index")
    row_offset: Optional[int] = Field(None, description="Starting row offset")
    row_count: Optional[int] = Field(None, description="Number of rows")
    byte_count: Optional[int] = Field(None, description="Size in bytes")
    http_headers: Optional[Dict[str, str]] = Field(None, description="Required HTTP headers")
    next_chunk_index: Optional[int] = Field(None, description="Next chunk index")
    next_chunk_internal_link: Optional[str] = Field(None, description="Internal link to next chunk")


class ResultManifest(BaseModel):
    """Manifest describing the complete result set."""
    format: Optional[str] = Field(None, description="Result format (JSON_ARRAY, ARROW_STREAM, CSV)")
    schema_name: Optional[ResultSchema] = Field(None, description="Result schema")
    total_row_count: Optional[int] = Field(None, description="Total number of rows")
    total_chunk_count: Optional[int] = Field(None, description="Total number of chunks")
    total_byte_count: Optional[int] = Field(None, description="Total size in bytes")
    truncated: Optional[bool] = Field(None, description="Whether results were truncated")
    chunks: Optional[List[ChunkInfo]] = Field(None, description="Information about each chunk")


class ResultData(BaseModel):
    """Result data from statement execution."""
    chunk_index: Optional[int] = Field(None, description="Current chunk index")
    row_offset: Optional[int] = Field(None, description="Starting row offset")
    row_count: Optional[int] = Field(None, description="Number of rows in this chunk")
    byte_count: Optional[int] = Field(None, description="Size in bytes")
    data_array: Optional[List[List[Optional[str]]]] = Field(None, description="Result data as 2D array (INLINE mode)")
    external_links: Optional[List[ExternalLink]] = Field(None, description="Download links (EXTERNAL_LINKS mode)")
    next_chunk_index: Optional[int] = Field(None, description="Next chunk index")
    next_chunk_internal_link: Optional[str] = Field(None, description="Internal link to next chunk")


class ServiceError(BaseModel):
    """Error information from statement execution."""
    error_code: Optional[str] = Field(None, description="Error code")
    message: Optional[str] = Field(None, description="Error message")


class StatementStatus(BaseModel):
    """Status of statement execution."""
    state: Optional[str] = Field(None, description="Statement state (PENDING, RUNNING, SUCCEEDED, FAILED, CANCELED, CLOSED)")
    error: Optional[ServiceError] = Field(None, description="Error details if failed")


class StatementResponse(BaseModel):
    """Response from statement execution or status request."""
    statement_id: Optional[str] = Field(None, description="Unique statement ID for polling")
    status: Optional[StatementStatus] = Field(None, description="Execution status")
    manifest: Optional[ResultManifest] = Field(None, description="Result manifest (when succeeded)")
    result: Optional[ResultData] = Field(None, description="First chunk of result data (when succeeded)")


class ExecuteStatementResponse(BaseModel):
    """Response model for executing a SQL statement."""
    statement_id: str = Field(..., description="Statement ID for polling")
    status: StatementStatus = Field(..., description="Current execution status")
    manifest: Optional[ResultManifest] = Field(None, description="Result manifest (if completed)")
    result: Optional[ResultData] = Field(None, description="First chunk of results (if completed)")


class CancelExecutionResponse(BaseModel):
    """Response model for canceling statement execution."""
    statement_id: str = Field(..., description="Canceled statement ID")
    message: str = Field(..., description="Confirmation message")


# ============================================================================
# SQL Warehouses Models
# ============================================================================

class EndpointTagPair(BaseModel):
    """Key-value tag pair for warehouse resources."""
    key: Optional[str] = Field(None, description="Tag key")
    value: Optional[str] = Field(None, description="Tag value")


class EndpointTags(BaseModel):
    """Tags to apply to warehouse resources."""
    custom_tags: Optional[List[EndpointTagPair]] = Field(None, description="List of custom tags")


class EndpointHealth(BaseModel):
    """Health status of a SQL warehouse."""
    status: Optional[str] = Field(None, description="Health status (HEALTHY, DEGRADED, FAILED)")
    summary: Optional[str] = Field(None, description="Health summary")
    message: Optional[str] = Field(None, description="Health message")
    details: Optional[str] = Field(None, description="Detailed health information")
    failure_reason: Optional[Dict[str, Any]] = Field(None, description="Failure reason if unhealthy")


class WarehouseInfo(BaseModel):
    """Information about a SQL warehouse."""
    id: Optional[str] = Field(None, description="Warehouse ID")
    name: Optional[str] = Field(None, description="Warehouse name")
    cluster_size: Optional[str] = Field(None, description="Cluster size (2X-Small to 4X-Large)")
    state: Optional[str] = Field(None, description="State (RUNNING, STOPPED, STARTING, STOPPING, DELETED, DELETING)")
    warehouse_type: Optional[str] = Field(None, description="Warehouse type (PRO, CLASSIC)")
    
    # Configuration
    auto_stop_mins: Optional[int] = Field(None, description="Auto-stop timeout in minutes")
    min_num_clusters: Optional[int] = Field(None, description="Minimum number of clusters")
    max_num_clusters: Optional[int] = Field(None, description="Maximum number of clusters")
    enable_photon: Optional[bool] = Field(None, description="Whether Photon is enabled")
    enable_serverless_compute: Optional[bool] = Field(None, description="Whether serverless compute is enabled")
    spot_instance_policy: Optional[str] = Field(None, description="Spot instance policy")
    
    # Metadata
    creator_name: Optional[str] = Field(None, description="Creator username")
    jdbc_url: Optional[str] = Field(None, description="JDBC connection URL")
    num_clusters: Optional[int] = Field(None, description="Current number of clusters")
    num_active_sessions: Optional[int] = Field(None, description="Number of active sessions")
    
    # Health
    health: Optional[EndpointHealth] = Field(None, description="Health status")
    
    # Tags and advanced
    tags: Optional[EndpointTags] = Field(None, description="Resource tags")
    instance_profile_arn: Optional[str] = Field(None, description="AWS instance profile ARN")
    channel: Optional[Dict[str, Any]] = Field(None, description="Channel information")


class ListWarehousesResponse(BaseModel):
    """Response model for listing SQL warehouses."""
    warehouses: List[WarehouseInfo] = Field(..., description="List of SQL warehouses")
    count: int = Field(..., description="Number of warehouses returned")


class CreateWarehouseResponse(BaseModel):
    """Response model for creating a SQL warehouse."""
    id: str = Field(..., description="Created warehouse ID")
    name: str = Field(..., description="Warehouse name")
    state: str = Field(..., description="Initial state")
    message: str = Field(default="Warehouse created successfully", description="Status message")


class UpdateWarehouseResponse(BaseModel):
    """Response model for updating a SQL warehouse."""
    id: str = Field(..., description="Updated warehouse ID")
    name: Optional[str] = Field(None, description="Warehouse name")
    state: Optional[str] = Field(None, description="Current state")
    message: str = Field(default="Warehouse updated successfully", description="Status message")


class DeleteWarehouseResponse(BaseModel):
    """Response model for deleting a SQL warehouse."""
    id: str = Field(..., description="Deleted warehouse ID")
    message: str = Field(default="Warehouse deleted successfully", description="Status message")


class StartWarehouseResponse(BaseModel):
    """Response model for starting a SQL warehouse."""
    id: str = Field(..., description="Started warehouse ID")
    state: str = Field(..., description="Current state (STARTING or RUNNING)")
    message: str = Field(..., description="Status message")


class StopWarehouseResponse(BaseModel):
    """Response model for stopping a SQL warehouse."""
    id: str = Field(..., description="Stopped warehouse ID")
    state: str = Field(..., description="Current state (STOPPING or STOPPED)")
    message: str = Field(..., description="Status message")


# ============================================================================
# Secrets Management Models
# ============================================================================

class SecretScopeInfo(BaseModel):
    """Information about a secret scope."""
    name: Optional[str] = Field(None, description="Scope name")
    backend_type: Optional[str] = Field(None, description="Backend type (DATABRICKS, AZURE_KEYVAULT)")
    keyvault_metadata: Optional[Dict[str, Any]] = Field(None, description="Azure KeyVault metadata if applicable")


class ListSecretScopesResponse(BaseModel):
    """Response model for listing secret scopes."""
    scopes: List[SecretScopeInfo] = Field(..., description="List of secret scopes")
    count: int = Field(..., description="Number of scopes returned")


class CreateSecretScopeResponse(BaseModel):
    """Response model for creating a secret scope."""
    scope: str = Field(..., description="Created scope name")
    backend_type: str = Field(..., description="Backend type")
    message: str = Field(default="Secret scope created successfully", description="Status message")


class DeleteSecretScopeResponse(BaseModel):
    """Response model for deleting a secret scope."""
    scope: str = Field(..., description="Deleted scope name")
    message: str = Field(default="Secret scope deleted successfully", description="Status message")


class SecretMetadataInfo(BaseModel):
    """Metadata information about a secret."""
    key: Optional[str] = Field(None, description="Secret key name")
    last_updated_timestamp: Optional[int] = Field(None, description="Last update timestamp (milliseconds since epoch)")


class ListSecretsResponse(BaseModel):
    """Response model for listing secrets in a scope."""
    scope: str = Field(..., description="Scope name")
    secrets: List[SecretMetadataInfo] = Field(..., description="List of secret metadata")
    count: int = Field(..., description="Number of secrets")


class PutSecretResponse(BaseModel):
    """Response model for storing a secret."""
    scope: str = Field(..., description="Scope name")
    key: str = Field(..., description="Secret key")
    message: str = Field(default="Secret stored successfully", description="Status message")


class DeleteSecretResponse(BaseModel):
    """Response model for deleting a secret."""
    scope: str = Field(..., description="Scope name")
    key: str = Field(..., description="Secret key")
    message: str = Field(default="Secret deleted successfully", description="Status message")


class AclInfo(BaseModel):
    """ACL information for a secret scope."""
    principal: str = Field(..., description="Principal (user or group)")
    permission: str = Field(..., description="Permission level (MANAGE, WRITE, READ)")


class ListAclsResponse(BaseModel):
    """Response model for listing ACLs on a scope."""
    scope: str = Field(..., description="Scope name")
    acls: List[AclInfo] = Field(..., description="List of ACLs")
    count: int = Field(..., description="Number of ACLs")


class PutAclResponse(BaseModel):
    """Response model for setting an ACL."""
    scope: str = Field(..., description="Scope name")
    principal: str = Field(..., description="Principal")
    permission: str = Field(..., description="Permission level")
    message: str = Field(default="ACL updated successfully", description="Status message")


class DeleteAclResponse(BaseModel):
    """Response model for deleting an ACL."""
    scope: str = Field(..., description="Scope name")
    principal: str = Field(..., description="Principal")
    message: str = Field(default="ACL deleted successfully", description="Status message")


# ============================================================================
# Git Repos Models
# ============================================================================

class RepoInfo(BaseModel):
    """Information about a Git repository."""
    id: Optional[int] = Field(None, description="Unique ID of the repository")
    path: Optional[str] = Field(None, description="Workspace path of the repo")
    url: Optional[str] = Field(None, description="URL of the linked Git repository")
    provider: Optional[str] = Field(None, description="Git provider (github, gitlab, bitbucket, etc.)")
    branch: Optional[str] = Field(None, description="Current branch")
    head_commit_id: Optional[str] = Field(None, description="HEAD commit ID")
    sparse_checkout: Optional[Dict[str, Any]] = Field(None, description="Sparse checkout configuration")


class ListReposResponse(BaseModel):
    """Response model for listing repositories."""
    repos: List[RepoInfo] = Field(..., description="List of repositories")
    count: int = Field(..., description="Number of repositories returned")
    next_page_token: Optional[str] = Field(None, description="Token for next page of results")


class CreateRepoResponse(BaseModel):
    """Response model for creating a repository."""
    id: int = Field(..., description="Created repository ID")
    path: str = Field(..., description="Workspace path")
    url: str = Field(..., description="Git repository URL")
    provider: str = Field(..., description="Git provider")
    branch: Optional[str] = Field(None, description="Current branch")
    message: str = Field(default="Repository created successfully", description="Status message")


class UpdateRepoResponse(BaseModel):
    """Response model for updating a repository."""
    repo_id: int = Field(..., description="Repository ID")
    branch: Optional[str] = Field(None, description="Current branch")
    tag: Optional[str] = Field(None, description="Current tag (if detached HEAD)")
    head_commit_id: Optional[str] = Field(None, description="HEAD commit ID")
    message: str = Field(default="Repository updated successfully", description="Status message")


class DeleteRepoResponse(BaseModel):
    """Response model for deleting a repository."""
    repo_id: int = Field(..., description="Deleted repository ID")
    message: str = Field(default="Repository deleted successfully", description="Status message")


# ============================================================================
# Jobs API Models
# ============================================================================

class JobTaskInfo(BaseModel):
    """Information about a job task."""
    task_key: str = Field(..., description="Unique key for the task")
    description: Optional[str] = Field(None, description="Task description")
    depends_on: Optional[list[Dict[str, Any]]] = Field(None, description="Task dependencies")
    notebook_task: Optional[Dict[str, Any]] = Field(None, description="Notebook task configuration")
    spark_jar_task: Optional[Dict[str, Any]] = Field(None, description="Spark JAR task configuration")
    spark_python_task: Optional[Dict[str, Any]] = Field(None, description="Spark Python task configuration")
    spark_submit_task: Optional[Dict[str, Any]] = Field(None, description="Spark submit task configuration")
    python_wheel_task: Optional[Dict[str, Any]] = Field(None, description="Python wheel task configuration")
    sql_task: Optional[Dict[str, Any]] = Field(None, description="SQL task configuration")
    dbt_task: Optional[Dict[str, Any]] = Field(None, description="DBT task configuration")
    pipeline_task: Optional[Dict[str, Any]] = Field(None, description="Pipeline task configuration")
    existing_cluster_id: Optional[str] = Field(None, description="Existing cluster ID to use")
    new_cluster: Optional[Dict[str, Any]] = Field(None, description="New cluster configuration")
    timeout_seconds: Optional[int] = Field(None, description="Task timeout in seconds")


class JobSettingsInfo(BaseModel):
    """Job settings information."""
    name: Optional[str] = Field(None, description="Job name")
    description: Optional[str] = Field(None, description="Job description")
    tags: Optional[Dict[str, str]] = Field(None, description="Job tags")
    tasks: Optional[list[JobTaskInfo]] = Field(None, description="List of tasks")
    schedule: Optional[Dict[str, Any]] = Field(None, description="Cron schedule")
    max_concurrent_runs: Optional[int] = Field(None, description="Max concurrent runs")
    timeout_seconds: Optional[int] = Field(None, description="Job timeout in seconds")
    email_notifications: Optional[Dict[str, Any]] = Field(None, description="Email notifications")
    webhook_notifications: Optional[Dict[str, Any]] = Field(None, description="Webhook notifications")
    notification_settings: Optional[Dict[str, Any]] = Field(None, description="Notification settings")
    git_source: Optional[Dict[str, Any]] = Field(None, description="Git source configuration")
    job_clusters: Optional[list[Dict[str, Any]]] = Field(None, description="Job cluster definitions")
    format: Optional[str] = Field(None, description="Job format (SINGLE_TASK, MULTI_TASK)")
    run_as: Optional[Dict[str, Any]] = Field(None, description="Run as user/service principal")
    parameters: Optional[list[Dict[str, Any]]] = Field(None, description="Job parameters")


class JobInfo(BaseModel):
    """Information about a Databricks job."""
    job_id: int = Field(..., description="Unique job identifier")
    name: Optional[str] = Field(None, description="Job name")
    created_time: Optional[int] = Field(None, description="Creation timestamp (epoch ms)")
    creator_user_name: Optional[str] = Field(None, description="Creator username")
    settings: Optional[JobSettingsInfo] = Field(None, description="Job settings")
    run_as_user_name: Optional[str] = Field(None, description="Run as username")


class ListJobsResponse(BaseModel):
    """Response model for listing jobs."""
    jobs: list[JobInfo] = Field(..., description="List of jobs")
    count: int = Field(..., description="Number of jobs returned")
    has_more: Optional[bool] = Field(None, description="Whether more jobs exist")


class CreateJobResponse(BaseModel):
    """Response model for creating a job."""
    job_id: int = Field(..., description="Created job ID")
    message: str = Field(default="Job created successfully", description="Status message")


class UpdateJobResponse(BaseModel):
    """Response model for updating a job."""
    job_id: int = Field(..., description="Updated job ID")
    message: str = Field(default="Job updated successfully", description="Status message")


class DeleteJobResponse(BaseModel):
    """Response model for deleting a job."""
    job_id: int = Field(..., description="Deleted job ID")
    message: str = Field(default="Job deleted successfully", description="Status message")


class RunStateInfo(BaseModel):
    """Run state information."""
    life_cycle_state: Optional[str] = Field(None, description="Life cycle state (PENDING, RUNNING, TERMINATING, TERMINATED, SKIPPED, INTERNAL_ERROR)")
    state_message: Optional[str] = Field(None, description="State message")
    result_state: Optional[str] = Field(None, description="Result state (SUCCESS, FAILED, TIMEDOUT, CANCELED)")
    user_cancelled_or_timedout: Optional[bool] = Field(None, description="Whether user cancelled or timed out")
    queue_reason: Optional[str] = Field(None, description="Queue reason if queued")


class RunTaskInfo(BaseModel):
    """Information about a run task."""
    task_key: str = Field(..., description="Task key")
    run_id: Optional[int] = Field(None, description="Task run ID")
    state: Optional[RunStateInfo] = Field(None, description="Task state")
    start_time: Optional[int] = Field(None, description="Start time (epoch ms)")
    end_time: Optional[int] = Field(None, description="End time (epoch ms)")
    execution_duration: Optional[int] = Field(None, description="Execution duration (ms)")
    cleanup_duration: Optional[int] = Field(None, description="Cleanup duration (ms)")
    setup_duration: Optional[int] = Field(None, description="Setup duration (ms)")
    attempt_number: Optional[int] = Field(None, description="Attempt number")


class RunInfo(BaseModel):
    """Information about a job run."""
    run_id: int = Field(..., description="Unique run identifier")
    job_id: Optional[int] = Field(None, description="Job ID")
    run_name: Optional[str] = Field(None, description="Run name")
    number_in_job: Optional[int] = Field(None, description="Sequential number of this run")
    creator_user_name: Optional[str] = Field(None, description="Creator username")
    state: Optional[RunStateInfo] = Field(None, description="Run state")
    start_time: Optional[int] = Field(None, description="Start time (epoch ms)")
    end_time: Optional[int] = Field(None, description="End time (epoch ms)")
    setup_duration: Optional[int] = Field(None, description="Setup duration (ms)")
    execution_duration: Optional[int] = Field(None, description="Execution duration (ms)")
    cleanup_duration: Optional[int] = Field(None, description="Cleanup duration (ms)")
    run_duration: Optional[int] = Field(None, description="Total run duration (ms)")
    run_page_url: Optional[str] = Field(None, description="URL to run page in UI")
    run_type: Optional[str] = Field(None, description="Run type (JOB_RUN, WORKFLOW_RUN, SUBMIT_RUN)")
    tasks: Optional[list[RunTaskInfo]] = Field(None, description="Task runs")
    git_source: Optional[Dict[str, Any]] = Field(None, description="Git source used")
    cluster_spec: Optional[Dict[str, Any]] = Field(None, description="Cluster specification")
    trigger: Optional[str] = Field(None, description="Trigger type")


class ListRunsResponse(BaseModel):
    """Response model for listing runs."""
    runs: list[RunInfo] = Field(..., description="List of runs")
    count: int = Field(..., description="Number of runs returned")
    has_more: Optional[bool] = Field(None, description="Whether more runs exist")


class RunNowResponse(BaseModel):
    """Response model for running a job now."""
    run_id: int = Field(..., description="Started run ID")
    number_in_job: int = Field(..., description="Sequential number of this run")
    message: str = Field(default="Job run triggered successfully", description="Status message")


class SubmitRunResponse(BaseModel):
    """Response model for submitting a one-time run."""
    run_id: int = Field(..., description="Submitted run ID")
    message: str = Field(default="Run submitted successfully", description="Status message")


class CancelRunResponse(BaseModel):
    """Response model for canceling a run."""
    run_id: int = Field(..., description="Canceled run ID")
    message: str = Field(default="Run canceled successfully", description="Status message")


class DeleteRunResponse(BaseModel):
    """Response model for deleting a run."""
    run_id: int = Field(..., description="Deleted run ID")
    message: str = Field(default="Run deleted successfully", description="Status message")


class RepairRunResponse(BaseModel):
    """Response model for repairing a run."""
    run_id: int = Field(..., description="Original run ID")
    repair_id: int = Field(..., description="Repair attempt ID")
    message: str = Field(default="Run repair initiated successfully", description="Status message")


class RunOutputInfo(BaseModel):
    """Run output information."""
    notebook_output: Optional[Dict[str, Any]] = Field(None, description="Notebook output")
    sql_output: Optional[Dict[str, Any]] = Field(None, description="SQL output")
    dbt_output: Optional[Dict[str, Any]] = Field(None, description="DBT output")
    logs: Optional[str] = Field(None, description="Run logs")
    logs_truncated: Optional[bool] = Field(None, description="Whether logs are truncated")
    error: Optional[str] = Field(None, description="Error message if failed")
    error_trace: Optional[str] = Field(None, description="Error trace if failed")
    metadata: Optional[RunInfo] = Field(None, description="Run metadata")


class ExportRunView(BaseModel):
    """Exported run view."""
    content: Optional[str] = Field(None, description="View content")
    name: Optional[str] = Field(None, description="View name")
    type: Optional[str] = Field(None, description="View type (CODE, DASHBOARDS, ALL)")


class ExportRunResponse(BaseModel):
    """Response model for exporting a run."""
    views: list[ExportRunView] = Field(..., description="Exported views")


# ============================================================================
# Clusters API Models
# ============================================================================

class ClusterStateInfo(BaseModel):
    """Cluster state information."""
    state: Optional[str] = Field(None, description="Cluster state (PENDING, RUNNING, RESTARTING, RESIZING, TERMINATING, TERMINATED, ERROR, UNKNOWN)")
    state_message: Optional[str] = Field(None, description="Human-readable state message")


class AutoScaleInfo(BaseModel):
    """Auto-scaling configuration."""
    min_workers: Optional[int] = Field(None, description="Minimum number of workers")
    max_workers: Optional[int] = Field(None, description="Maximum number of workers")


class ClusterInfo(BaseModel):
    """Information about a Databricks cluster."""
    cluster_id: str = Field(..., description="Canonical identifier for the cluster")
    cluster_name: Optional[str] = Field(None, description="Cluster name")
    spark_version: Optional[str] = Field(None, description="Spark version (e.g., 13.3.x-scala2.12)")
    node_type_id: Optional[str] = Field(None, description="Node type ID (e.g., i3.xlarge)")
    driver_node_type_id: Optional[str] = Field(None, description="Driver node type ID")
    num_workers: Optional[int] = Field(None, description="Number of worker nodes")
    autoscale: Optional[AutoScaleInfo] = Field(None, description="Auto-scaling configuration")
    autotermination_minutes: Optional[int] = Field(None, description="Minutes before auto-termination")
    state: Optional[ClusterStateInfo] = Field(None, description="Current cluster state")
    creator_user_name: Optional[str] = Field(None, description="Creator username")
    start_time: Optional[int] = Field(None, description="Start time (epoch ms)")
    terminated_time: Optional[int] = Field(None, description="Termination time (epoch ms)")
    last_restarted_time: Optional[int] = Field(None, description="Last restart time (epoch ms)")
    cluster_cores: Optional[float] = Field(None, description="Total cores available")
    cluster_memory_mb: Optional[int] = Field(None, description="Total memory in MB")
    spark_context_id: Optional[int] = Field(None, description="Spark context ID")
    jdbc_port: Optional[int] = Field(None, description="JDBC/ODBC port")
    cluster_source: Optional[str] = Field(None, description="Source (UI, API, JOB)")
    instance_pool_id: Optional[str] = Field(None, description="Instance pool ID")
    driver_instance_pool_id: Optional[str] = Field(None, description="Driver instance pool ID")
    policy_id: Optional[str] = Field(None, description="Cluster policy ID")
    enable_elastic_disk: Optional[bool] = Field(None, description="Enable elastic disk")
    enable_local_disk_encryption: Optional[bool] = Field(None, description="Enable local disk encryption")
    data_security_mode: Optional[str] = Field(None, description="Data security mode")
    runtime_engine: Optional[str] = Field(None, description="Runtime engine (STANDARD, PHOTON)")
    single_user_name: Optional[str] = Field(None, description="Single user name for data security")
    is_single_node: Optional[bool] = Field(None, description="Whether cluster is single-node")
    spark_conf: Optional[Dict[str, str]] = Field(None, description="Spark configuration")
    spark_env_vars: Optional[Dict[str, str]] = Field(None, description="Spark environment variables")
    custom_tags: Optional[Dict[str, str]] = Field(None, description="Custom tags")
    init_scripts: Optional[list[Dict[str, Any]]] = Field(None, description="Initialization scripts")
    docker_image: Optional[Dict[str, Any]] = Field(None, description="Docker image configuration")
    ssh_public_keys: Optional[list[str]] = Field(None, description="SSH public keys")
    aws_attributes: Optional[Dict[str, Any]] = Field(None, description="AWS-specific attributes")
    azure_attributes: Optional[Dict[str, Any]] = Field(None, description="Azure-specific attributes")
    gcp_attributes: Optional[Dict[str, Any]] = Field(None, description="GCP-specific attributes")
    cluster_log_conf: Optional[Dict[str, Any]] = Field(None, description="Cluster log configuration")
    termination_reason: Optional[Dict[str, Any]] = Field(None, description="Termination reason details")


class ListClustersResponse(BaseModel):
    """Response model for listing clusters."""
    clusters: list[ClusterInfo] = Field(..., description="List of clusters")
    count: int = Field(..., description="Number of clusters returned")


class CreateClusterResponse(BaseModel):
    """Response model for creating a cluster."""
    cluster_id: str = Field(..., description="Created cluster ID")
    message: str = Field(default="Cluster created successfully", description="Status message")


class EditClusterResponse(BaseModel):
    """Response model for editing a cluster."""
    cluster_id: str = Field(..., description="Edited cluster ID")
    message: str = Field(default="Cluster edited successfully", description="Status message")


class DeleteClusterResponse(BaseModel):
    """Response model for deleting/terminating a cluster."""
    cluster_id: str = Field(..., description="Deleted cluster ID")
    message: str = Field(default="Cluster deleted successfully", description="Status message")


class StartClusterResponse(BaseModel):
    """Response model for starting a cluster."""
    cluster_id: str = Field(..., description="Started cluster ID")
    message: str = Field(default="Cluster start initiated", description="Status message")


class RestartClusterResponse(BaseModel):
    """Response model for restarting a cluster."""
    cluster_id: str = Field(..., description="Restarted cluster ID")
    message: str = Field(default="Cluster restart initiated", description="Status message")


# ============================================================================
# Unity Catalog - Tables API Models
# ============================================================================

class ColumnInfoModel(BaseModel):
    """Information about a table column."""
    name: Optional[str] = Field(None, description="Column name")
    type_text: Optional[str] = Field(None, description="Full data type specification as SQL text")
    type_name: Optional[str] = Field(None, description="Name of type (INT, STRUCT, MAP, etc.)")
    type_json: Optional[str] = Field(None, description="Full data type specification in JSON")
    position: Optional[int] = Field(None, description="Ordinal position of column (starting at 0)")
    comment: Optional[str] = Field(None, description="User-provided free-form text description")
    nullable: Optional[bool] = Field(None, description="Whether field may be null")
    partition_index: Optional[int] = Field(None, description="Partition index for column")
    type_precision: Optional[int] = Field(None, description="Precision for DECIMAL columns")
    type_scale: Optional[int] = Field(None, description="Scale for DECIMAL columns")
    type_interval_type: Optional[str] = Field(None, description="Format of INTERVAL columns")
    mask: Optional[Dict[str, Any]] = Field(None, description="Column mask configuration")


class TableInfoModel(BaseModel):
    """Detailed information about a Unity Catalog table."""
    name: Optional[str] = Field(None, description="Name of table, relative to parent schema")
    full_name: Optional[str] = Field(None, description="Full name of table (catalog.schema.table)")
    catalog_name: Optional[str] = Field(None, description="Name of parent catalog")
    schema_name: Optional[str] = Field(None, description="Name of parent schema relative to catalog")
    table_type: Optional[str] = Field(None, description="Table type (MANAGED, EXTERNAL, VIEW)")
    data_source_format: Optional[str] = Field(None, description="Data source format (DELTA, PARQUET, CSV, JSON, etc.)")
    storage_location: Optional[str] = Field(None, description="Storage root URL for table")
    owner: Optional[str] = Field(None, description="Username of table owner")
    comment: Optional[str] = Field(None, description="User-provided free-form text description")
    properties: Optional[Dict[str, str]] = Field(None, description="Map of user-provided key-value properties")
    created_at: Optional[int] = Field(None, description="Time of creation (epoch ms)")
    created_by: Optional[str] = Field(None, description="Username of creator")
    updated_at: Optional[int] = Field(None, description="Time of last modification (epoch ms)")
    updated_by: Optional[str] = Field(None, description="Username of last modifier")
    table_id: Optional[str] = Field(None, description="Unique identifier of table")
    columns: Optional[list[ColumnInfoModel]] = Field(None, description="Array of table columns")
    view_definition: Optional[str] = Field(None, description="View definition SQL (for views)")
    sql_path: Optional[str] = Field(None, description="SQL path for accessing the table")
    metastore_id: Optional[str] = Field(None, description="Unique identifier of parent metastore")
    deleted_at: Optional[int] = Field(None, description="Deletion time (epoch ms, for soft-deleted tables)")
    pipeline_id: Optional[str] = Field(None, description="Delta Live Tables pipeline ID")
    browse_only: Optional[bool] = Field(None, description="Whether table can only be browsed (limited metadata)")
    access_point: Optional[str] = Field(None, description="Access point for the table")
    storage_credential_name: Optional[str] = Field(None, description="Storage credential name")
    data_access_configuration_id: Optional[str] = Field(None, description="Data access configuration ID")
    table_constraints: Optional[list[Dict[str, Any]]] = Field(None, description="Table constraints")
    row_filter: Optional[Dict[str, Any]] = Field(None, description="Row filter configuration")
    view_dependencies: Optional[Dict[str, Any]] = Field(None, description="View dependencies")
    encryption_details: Optional[Dict[str, Any]] = Field(None, description="Encryption details")
    enable_predictive_optimization: Optional[str] = Field(None, description="Predictive optimization setting")
    effective_predictive_optimization_flag: Optional[Dict[str, Any]] = Field(None, description="Effective predictive optimization flag")
    delta_runtime_properties_kvpairs: Optional[Dict[str, Any]] = Field(None, description="Delta runtime properties")


class TableSummaryModel(BaseModel):
    """Summary information about a Unity Catalog table."""
    full_name: Optional[str] = Field(None, description="Full name of table (catalog.schema.table)")
    table_type: Optional[str] = Field(None, description="Table type (MANAGED, EXTERNAL, VIEW)")


class ListTablesResponse(BaseModel):
    """Response model for listing tables."""
    tables: list[TableInfoModel] = Field(..., description="List of tables")
    count: int = Field(..., description="Number of tables returned")
    next_page_token: Optional[str] = Field(None, description="Token for next page of results")


class ListTableSummariesResponse(BaseModel):
    """Response model for listing table summaries."""
    summaries: list[TableSummaryModel] = Field(..., description="List of table summaries")
    count: int = Field(..., description="Number of summaries returned")
    next_page_token: Optional[str] = Field(None, description="Token for next page of results")


class TableExistsResponseModel(BaseModel):
    """Response model for checking table existence."""
    table_exists: bool = Field(..., description="Whether the table exists")
    full_name: str = Field(..., description="Full name that was checked")


class DeleteTableResponse(BaseModel):
    """Response model for deleting a table."""
    full_name: str = Field(..., description="Full name of deleted table")
    message: str = Field(default="Table deleted successfully", description="Status message")


class UpdateTableResponse(BaseModel):
    """Response model for updating a table."""
    full_name: str = Field(..., description="Full name of updated table")
    message: str = Field(default="Table updated successfully", description="Status message")


# ============================================================================
# Unity Catalog - Schemas API Models
# ============================================================================

class SchemaInfoModel(BaseModel):
    """Detailed information about a Unity Catalog schema."""
    name: Optional[str] = Field(None, description="Name of schema, relative to parent catalog")
    full_name: Optional[str] = Field(None, description="Full name of schema (catalog.schema)")
    catalog_name: Optional[str] = Field(None, description="Name of parent catalog")
    catalog_type: Optional[str] = Field(None, description="Type of parent catalog")
    comment: Optional[str] = Field(None, description="User-provided free-form text description")
    properties: Optional[Dict[str, str]] = Field(None, description="Map of user-provided key-value properties")
    storage_root: Optional[str] = Field(None, description="Storage root URL for managed tables")
    storage_location: Optional[str] = Field(None, description="Storage location")
    owner: Optional[str] = Field(None, description="Username of schema owner")
    created_at: Optional[int] = Field(None, description="Time of creation (epoch ms)")
    created_by: Optional[str] = Field(None, description="Username of creator")
    updated_at: Optional[int] = Field(None, description="Time of last modification (epoch ms)")
    updated_by: Optional[str] = Field(None, description="Username of last modifier")
    schema_id: Optional[str] = Field(None, description="Unique identifier of schema")
    metastore_id: Optional[str] = Field(None, description="Unique identifier of parent metastore")
    browse_only: Optional[bool] = Field(None, description="Whether schema can only be browsed (limited metadata)")
    enable_predictive_optimization: Optional[str] = Field(None, description="Predictive optimization setting")
    effective_predictive_optimization_flag: Optional[Dict[str, Any]] = Field(None, description="Effective predictive optimization flag")


class ListSchemasResponse(BaseModel):
    """Response model for listing schemas."""
    schemas: list[SchemaInfoModel] = Field(..., description="List of schemas")
    count: int = Field(..., description="Number of schemas returned")
    next_page_token: Optional[str] = Field(None, description="Token for next page of results")


class CreateSchemaResponse(BaseModel):
    """Response model for creating a schema."""
    schema_info: SchemaInfoModel = Field(..., description="Created schema information")
    message: str = Field(default="Schema created successfully", description="Status message")


class DeleteSchemaResponse(BaseModel):
    """Response model for deleting a schema."""
    full_name: str = Field(..., description="Full name of deleted schema")
    message: str = Field(default="Schema deleted successfully", description="Status message")


class UpdateSchemaResponse(BaseModel):
    """Response model for updating a schema."""
    schema_info: SchemaInfoModel = Field(..., description="Updated schema information")
    message: str = Field(default="Schema updated successfully", description="Status message")


# ============================================================================
# Unity Catalog - Catalogs API Models
# ============================================================================

class CatalogInfoModel(BaseModel):
    """Detailed information about a Unity Catalog catalog."""
    name: Optional[str] = Field(None, description="Name of catalog")
    full_name: Optional[str] = Field(None, description="Full name of catalog")
    catalog_type: Optional[str] = Field(None, description="Type of catalog (MANAGED_CATALOG, DELTASHARING_CATALOG, etc.)")
    comment: Optional[str] = Field(None, description="User-provided free-form text description")
    connection_name: Optional[str] = Field(None, description="Name of connection to external data source")
    properties: Optional[Dict[str, str]] = Field(None, description="Map of user-provided key-value properties")
    options: Optional[Dict[str, str]] = Field(None, description="Map of key-value options")
    storage_root: Optional[str] = Field(None, description="Storage root URL for managed tables")
    storage_location: Optional[str] = Field(None, description="Storage location")
    provider_name: Optional[str] = Field(None, description="Name of Delta Sharing provider")
    share_name: Optional[str] = Field(None, description="Name of share under the share provider")
    owner: Optional[str] = Field(None, description="Username of catalog owner")
    created_at: Optional[int] = Field(None, description="Time of creation (epoch ms)")
    created_by: Optional[str] = Field(None, description="Username of creator")
    updated_at: Optional[int] = Field(None, description="Time of last modification (epoch ms)")
    updated_by: Optional[str] = Field(None, description="Username of last modifier")
    metastore_id: Optional[str] = Field(None, description="Unique identifier of parent metastore")
    isolation_mode: Optional[str] = Field(None, description="Isolation mode (OPEN, ISOLATED)")
    securable_type: Optional[str] = Field(None, description="Type of securable")
    browse_only: Optional[bool] = Field(None, description="Whether catalog can only be browsed (limited metadata)")
    enable_predictive_optimization: Optional[str] = Field(None, description="Predictive optimization setting")
    effective_predictive_optimization_flag: Optional[Dict[str, Any]] = Field(None, description="Effective predictive optimization flag")
    provisioning_info: Optional[Dict[str, Any]] = Field(None, description="Provisioning information")


class ListCatalogsResponse(BaseModel):
    """Response model for listing catalogs."""
    catalogs: list[CatalogInfoModel] = Field(..., description="List of catalogs")
    count: int = Field(..., description="Number of catalogs returned")
    next_page_token: Optional[str] = Field(None, description="Token for next page of results")


class CreateCatalogResponse(BaseModel):
    """Response model for creating a catalog."""
    catalog_info: CatalogInfoModel = Field(..., description="Created catalog information")
    message: str = Field(default="Catalog created successfully", description="Status message")


class DeleteCatalogResponse(BaseModel):
    """Response model for deleting a catalog."""
    name: str = Field(..., description="Name of deleted catalog")
    message: str = Field(default="Catalog deleted successfully", description="Status message")


class UpdateCatalogResponse(BaseModel):
    """Response model for updating a catalog."""
    catalog_info: CatalogInfoModel = Field(..., description="Updated catalog information")
    message: str = Field(default="Catalog updated successfully", description="Status message")


# ============================================================================
# Unity Catalog - Functions API Models
# ============================================================================

class FunctionParameterInfoModel(BaseModel):
    """Information about a function parameter."""
    name: str = Field(..., description="Parameter name")
    type_text: str = Field(..., description="Full data type specification as SQL text")
    type_name: str = Field(..., description="Name of type (INT, STRING, etc.)")
    type_json: Optional[str] = Field(None, description="Full data type specification in JSON")
    position: int = Field(..., description="Ordinal position of parameter")
    parameter_mode: Optional[str] = Field(None, description="Parameter mode (IN, OUT, INOUT)")
    parameter_type: Optional[str] = Field(None, description="Parameter type (PARAM, COLUMN)")
    parameter_default: Optional[str] = Field(None, description="Default value")
    comment: Optional[str] = Field(None, description="User-provided free-form text description")


class FunctionInfoModel(BaseModel):
    """Detailed information about a Unity Catalog function."""
    name: Optional[str] = Field(None, description="Name of function, relative to parent schema")
    full_name: Optional[str] = Field(None, description="Full name of function (catalog.schema.function)")
    catalog_name: Optional[str] = Field(None, description="Name of parent catalog")
    schema_name: Optional[str] = Field(None, description="Name of parent schema")
    function_id: Optional[str] = Field(None, description="Unique identifier of function")
    comment: Optional[str] = Field(None, description="User-provided free-form text description")
    owner: Optional[str] = Field(None, description="Username of function owner")
    created_at: Optional[int] = Field(None, description="Time of creation (epoch ms)")
    created_by: Optional[str] = Field(None, description="Username of creator")
    updated_at: Optional[int] = Field(None, description="Time of last modification (epoch ms)")
    updated_by: Optional[str] = Field(None, description="Username of last modifier")
    metastore_id: Optional[str] = Field(None, description="Unique identifier of parent metastore")
    data_type: Optional[str] = Field(None, description="Return data type")
    full_data_type: Optional[str] = Field(None, description="Full return data type specification")
    routine_body: Optional[str] = Field(None, description="Function body type (SQL, EXTERNAL)")
    routine_definition: Optional[str] = Field(None, description="Function definition/implementation")
    routine_dependencies: Optional[Dict[str, Any]] = Field(None, description="Function dependencies")
    parameter_style: Optional[str] = Field(None, description="Parameter style (S for SQL)")
    is_deterministic: Optional[bool] = Field(None, description="Whether function is deterministic")
    is_null_call: Optional[bool] = Field(None, description="Whether function is called on NULL input")
    security_type: Optional[str] = Field(None, description="Security type (DEFINER)")
    sql_data_access: Optional[str] = Field(None, description="SQL data access (CONTAINS_SQL, READS_SQL_DATA, etc.)")
    sql_path: Optional[str] = Field(None, description="SQL path")
    specific_name: Optional[str] = Field(None, description="Specific name of function")
    external_language: Optional[str] = Field(None, description="External language for external functions")
    external_name: Optional[str] = Field(None, description="External name for external functions")
    properties: Optional[str] = Field(None, description="JSON-encoded key-value properties")
    input_params: Optional[list[FunctionParameterInfoModel]] = Field(None, description="Input parameters")
    return_params: Optional[list[FunctionParameterInfoModel]] = Field(None, description="Return parameters")
    browse_only: Optional[bool] = Field(None, description="Whether function can only be browsed (limited metadata)")


class ListFunctionsResponse(BaseModel):
    """Response model for listing functions."""
    functions: list[FunctionInfoModel] = Field(..., description="List of functions")
    count: int = Field(..., description="Number of functions returned")
    next_page_token: Optional[str] = Field(None, description="Token for next page of results")


class CreateFunctionResponse(BaseModel):
    """Response model for creating a function."""
    function_info: FunctionInfoModel = Field(..., description="Created function information")
    message: str = Field(default="Function created successfully", description="Status message")


class DeleteFunctionResponse(BaseModel):
    """Response model for deleting a function."""
    name: str = Field(..., description="Full name of deleted function")
    message: str = Field(default="Function deleted successfully", description="Status message")


class UpdateFunctionResponse(BaseModel):
    """Response model for updating a function."""
    function_info: FunctionInfoModel = Field(..., description="Updated function information")
    message: str = Field(default="Function updated successfully", description="Status message")


# ============================================================================
# Unity Catalog - Volumes API Models
# ============================================================================

class EncryptionDetailsModel(BaseModel):
    """Encryption details for a volume."""
    sse_encryption_details: Optional[Dict[str, Any]] = Field(None, description="Server-side encryption details")


class VolumeInfoModel(BaseModel):
    """Detailed information about a Unity Catalog volume."""
    name: Optional[str] = Field(None, description="Name of volume, relative to parent schema")
    full_name: Optional[str] = Field(None, description="Full name of volume (catalog.schema.volume)")
    catalog_name: Optional[str] = Field(None, description="Name of parent catalog")
    schema_name: Optional[str] = Field(None, description="Name of parent schema")
    volume_id: Optional[str] = Field(None, description="Unique identifier of volume")
    volume_type: Optional[str] = Field(None, description="Type of volume (MANAGED, EXTERNAL)")
    storage_location: Optional[str] = Field(None, description="Storage location on cloud (for external volumes)")
    comment: Optional[str] = Field(None, description="User-provided free-form text description")
    owner: Optional[str] = Field(None, description="Username of volume owner")
    created_at: Optional[int] = Field(None, description="Time of creation (epoch ms)")
    created_by: Optional[str] = Field(None, description="Username of creator")
    updated_at: Optional[int] = Field(None, description="Time of last modification (epoch ms)")
    updated_by: Optional[str] = Field(None, description="Username of last modifier")
    metastore_id: Optional[str] = Field(None, description="Unique identifier of parent metastore")
    access_point: Optional[str] = Field(None, description="Access point URL for the volume")
    encryption_details: Optional[EncryptionDetailsModel] = Field(None, description="Encryption details")
    browse_only: Optional[bool] = Field(None, description="Whether volume can only be browsed (limited metadata)")


class ListVolumesResponse(BaseModel):
    """Response model for listing volumes."""
    volumes: list[VolumeInfoModel] = Field(..., description="List of volumes")
    count: int = Field(..., description="Number of volumes returned")
    next_page_token: Optional[str] = Field(None, description="Token for next page of results")


class CreateVolumeResponse(BaseModel):
    """Response model for creating a volume."""
    volume_info: VolumeInfoModel = Field(..., description="Created volume information")
    message: str = Field(default="Volume created successfully", description="Status message")


class DeleteVolumeResponse(BaseModel):
    """Response model for deleting a volume."""
    name: str = Field(..., description="Full name of deleted volume")
    message: str = Field(default="Volume deleted successfully", description="Status message")


class UpdateVolumeResponse(BaseModel):
    """Response model for updating a volume."""
    volume_info: VolumeInfoModel = Field(..., description="Updated volume information")
    message: str = Field(default="Volume updated successfully", description="Status message")


# ============================================================================
# Unity Catalog - External Lineage API Models
# ============================================================================

class ColumnRelationshipModel(BaseModel):
    """Column-level lineage relationship."""
    source: Optional[str] = Field(None, description="Source column name")
    target: Optional[str] = Field(None, description="Target column name")


class ExternalLineageTableModel(BaseModel):
    """Reference to a Databricks table."""
    name: Optional[str] = Field(None, description="Three-level name of table (catalog.schema.table)")


class ExternalLineagePathModel(BaseModel):
    """Reference to a file path."""
    url: Optional[str] = Field(None, description="File path URL")


class ExternalLineageModelVersionModel(BaseModel):
    """Reference to a model version."""
    name: Optional[str] = Field(None, description="Model name")
    version: Optional[str] = Field(None, description="Model version")


class ExternalLineageExternalMetadataModel(BaseModel):
    """Reference to external metadata object."""
    name: Optional[str] = Field(None, description="Name of external metadata object")


class ExternalLineageObjectModel(BaseModel):
    """A Databricks or external metadata object."""
    table: Optional[ExternalLineageTableModel] = Field(None, description="Reference to a Databricks table")
    path: Optional[ExternalLineagePathModel] = Field(None, description="Reference to a file path")
    model_version: Optional[ExternalLineageModelVersionModel] = Field(None, description="Reference to a model version")
    external_metadata: Optional[ExternalLineageExternalMetadataModel] = Field(None, description="Reference to external metadata")


class ExternalLineageRelationshipModel(BaseModel):
    """External lineage relationship between two objects."""
    source: ExternalLineageObjectModel = Field(..., description="Source object in lineage")
    target: ExternalLineageObjectModel = Field(..., description="Target object in lineage")
    id: Optional[str] = Field(None, description="Unique identifier for the relationship")
    columns: Optional[list[ColumnRelationshipModel]] = Field(None, description="Column-level lineage mappings")
    properties: Optional[Dict[str, str]] = Field(None, description="Custom properties (key-value pairs)")


class ListExternalLineageResponse(BaseModel):
    """Response model for listing external lineage relationships."""
    lineage_relationships: list[Dict[str, Any]] = Field(..., description="List of lineage relationships")
    count: int = Field(..., description="Number of relationships returned")
    next_page_token: Optional[str] = Field(None, description="Token for next page of results")


class CreateExternalLineageResponse(BaseModel):
    """Response model for creating external lineage relationship."""
    relationship: ExternalLineageRelationshipModel = Field(..., description="Created lineage relationship")
    message: str = Field(default="External lineage relationship created successfully", description="Status message")


class DeleteExternalLineageResponse(BaseModel):
    """Response model for deleting external lineage relationship."""
    source: str = Field(..., description="Source object identifier")
    target: str = Field(..., description="Target object identifier")
    message: str = Field(default="External lineage relationship deleted successfully", description="Status message")


class UpdateExternalLineageResponse(BaseModel):
    """Response model for updating external lineage relationship."""
    relationship: ExternalLineageRelationshipModel = Field(..., description="Updated lineage relationship")
    message: str = Field(default="External lineage relationship updated successfully", description="Status message")


class DatabricksResponse(BaseModel):
    """Base response model that can wrap any Databricks SDK dataclass."""
    
    class Config:
        # Allow arbitrary types from Databricks SDK
        arbitrary_types_allowed = True
    
    @classmethod
    def from_sdk_object(cls, sdk_obj: Any) -> dict:
        """Convert Databricks SDK dataclass to dict for JSON serialization."""
        if hasattr(sdk_obj, 'as_dict'):
            return sdk_obj.as_dict()
        elif hasattr(sdk_obj, '__dict__'):
            return sdk_obj.__dict__
        else:
            return {"value": str(sdk_obj)}


class NotebookExportResponse(BaseModel):
    """Response model for notebook export operations.
    
    Attributes:
        content: The decoded notebook content as a string (UTF-8 decoded from base64)
        path: The workspace path of the notebook
        format: The export format used (SOURCE, HTML, JUPYTER, DBC)
        file_type: The file type/extension of the exported content
    """
    content: str = Field(..., description="Decoded notebook content as UTF-8 string")
    path: Optional[str] = Field(None, description="Workspace path of the notebook")
    format: Optional[str] = Field(None, description="Export format (SOURCE, HTML, JUPYTER, DBC)")
    file_type: Optional[str] = Field(None, description="File type/extension of the exported content")
    
    class Config:
        json_schema_extra = {
            "example": {
                "content": "# Databricks notebook source\nprint('Hello World')",
                "path": "/Users/me/notebook",
                "format": "SOURCE",
                "file_type": "python"
            }
        }


class NotebookImportResponse(BaseModel):
    """Response model for notebook import operations.
    
    Attributes:
        path: The workspace path where the notebook was imported
        language: The language of the imported notebook (PYTHON, SCALA, SQL, R)
        format: The import format used (SOURCE, HTML, JUPYTER, DBC, AUTO)
        status: The status of the import operation
        overwritten: Whether an existing notebook was overwritten
    """
    path: str = Field(..., description="Workspace path where notebook was imported")
    language: str = Field(..., description="Notebook language (PYTHON, SCALA, SQL, R)")
    format: str = Field(..., description="Import format (SOURCE, HTML, JUPYTER, DBC, AUTO)")
    status: str = Field(default="imported", description="Status of the import operation")
    overwritten: bool = Field(default=False, description="Whether an existing notebook was overwritten")
    
    class Config:
        json_schema_extra = {
            "example": {
                "path": "/Users/me/imported_notebook",
                "language": "PYTHON",
                "format": "SOURCE",
                "status": "imported",
                "overwritten": False
            }
        }


class NotebookDeleteResponse(BaseModel):
    """Response model for notebook delete operations.
    
    Attributes:
        path: The workspace path of the deleted notebook
        status: The status of the delete operation
        recursive: Whether the delete was recursive (for directories)
    """
    path: str = Field(..., description="Workspace path of the deleted notebook")
    status: str = Field(default="deleted", description="Status of the delete operation")
    recursive: bool = Field(default=False, description="Whether delete was recursive")
    
    class Config:
        json_schema_extra = {
            "example": {
                "path": "/Users/me/old_notebook",
                "status": "deleted",
                "recursive": False
            }
        }


class NotebookCreateResponse(BaseModel):
    """Response model for notebook create operations.
    
    Attributes:
        path: The workspace path where the notebook was created
        language: The language of the created notebook (PYTHON, SCALA, SQL, R)
        status: The status of the create operation
    """
    path: str = Field(..., description="Workspace path where notebook was created")
    language: str = Field(..., description="Notebook language (PYTHON, SCALA, SQL, R)")
    status: str = Field(default="created", description="Status of the create operation")
    
    class Config:
        json_schema_extra = {
            "example": {
                "path": "/Users/me/new_notebook",
                "language": "PYTHON",
                "status": "created"
            }
        }


class NotebookStatusResponse(BaseModel):
    """Response model for notebook status/metadata operations.
    
    Attributes:
        path: The workspace path of the notebook
        object_id: Unique object identifier
        resource_id: Resource identifier
        object_type: Type of workspace object (NOTEBOOK, DIRECTORY, etc.)
        language: Programming language (PYTHON, SCALA, SQL, R)
        size: Size in bytes
        created_at: Creation timestamp (milliseconds since epoch)
        modified_at: Last modified timestamp (milliseconds since epoch)
    """
    path: str = Field(..., description="Workspace path")
    object_id: Optional[int] = Field(None, description="Unique object ID")
    resource_id: Optional[str] = Field(None, description="Resource identifier")
    object_type: Optional[str] = Field(None, description="Object type")
    language: Optional[str] = Field(None, description="Programming language")
    size: Optional[int] = Field(None, description="Size in bytes")
    created_at: Optional[int] = Field(None, description="Creation timestamp (ms)")
    modified_at: Optional[int] = Field(None, description="Last modified timestamp (ms)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "path": "/Users/me/analysis",
                "object_id": 1191853414493128,
                "resource_id": "1191853414493128",
                "object_type": "NOTEBOOK",
                "language": "PYTHON",
                "size": 4096,
                "created_at": 1640000000000,
                "modified_at": 1640100000000
            }
        }


# ============================================================================
# Notebook Cell Models
# ============================================================================

class NotebookCellMetadata(BaseModel):
    """Metadata for a notebook cell, including Databricks-specific fields.
    
    Attributes:
        databricks_metadata: Databricks-specific cell metadata
        additional_metadata: Any additional metadata fields
    """
    databricks_metadata: Optional[dict[str, Any]] = Field(
        None, 
        alias="application/vnd.databricks.v1+cell",
        description="Databricks-specific cell metadata"
    )
    additional_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata fields"
    )
    
    class Config:
        populate_by_name = True
        extra = "allow"


class NotebookCell(BaseModel):
    """Represents a single notebook cell.
    
    Attributes:
        index: Position of the cell in the notebook (0-based)
        cell_type: Type of cell (code, markdown, raw)
        source: Cell content as string (normalized from Jupyter's array format)
        metadata: Cell metadata including Databricks extensions
        outputs: Cell execution outputs (for code cells)
        execution_count: Execution counter (for code cells)
        language: Programming language for code cells
    
    Note: The source is always returned as a string, even though Jupyter notebooks
    store it as an array of lines. The normalization happens in get_notebook_cells.
    """
    index: int = Field(..., description="Cell position in notebook (0-based)")
    cell_type: str = Field(..., description="Cell type: code, markdown, or raw")
    source: str | list[str] = Field(..., description="Cell content (normalized to string)")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Cell metadata")
    outputs: list[dict[str, Any]] = Field(default_factory=list, description="Cell outputs")
    execution_count: Optional[int] = Field(None, description="Execution counter")
    language: Optional[str] = Field(None, description="Programming language for code cells")
    
    @property
    def source_text(self) -> str:
        """Get cell source as a single string (for backward compatibility)."""
        if isinstance(self.source, list):
            return "".join(self.source)
        return self.source
    
    class Config:
        json_schema_extra = {
            "example": {
                "index": 0,
                "cell_type": "code",
                "source": "print('Hello World')",
                "metadata": {},
                "outputs": [],
                "execution_count": 1,
                "language": "python"
            }
        }


class NotebookCellsResponse(BaseModel):
    """Response model containing all cells from a notebook.
    
    Attributes:
        path: Workspace path of the notebook
        cells: List of notebook cells
        total_cells: Total number of cells
        notebook_metadata: Notebook-level metadata
    """
    path: str = Field(..., description="Workspace path of the notebook")
    cells: list[NotebookCell] = Field(..., description="List of notebook cells")
    total_cells: int = Field(..., description="Total number of cells")
    notebook_metadata: dict[str, Any] = Field(default_factory=dict, description="Notebook metadata")
    
    class Config:
        json_schema_extra = {
            "example": {
                "path": "/Users/me/notebook",
                "cells": [],
                "total_cells": 5,
                "notebook_metadata": {}
            }
        }


class CellSearchResult(BaseModel):
    """Search result for cell content matching a pattern.
    
    Attributes:
        cell_index: Index of the cell containing matches
        cell_type: Type of the cell
        match_count: Number of matches found in the cell
        matches: List of matching text snippets
        source: Full cell content (complete source code or markdown)
    """
    cell_index: int = Field(..., description="Index of matching cell")
    cell_type: str = Field(..., description="Type of cell")
    match_count: int = Field(..., description="Number of matches in cell")
    matches: list[str] = Field(..., description="Matching text snippets")
    source: str = Field(..., description="Full cell content")
    
    class Config:
        json_schema_extra = {
            "example": {
                "cell_index": 2,
                "cell_type": "code",
                "match_count": 2,
                "matches": ["import pandas", "pandas.DataFrame"],
                "source": "import pandas as pd\nimport numpy as np\n\ndf = pandas.DataFrame({'a': [1, 2, 3]})"
            }
        }


class CellSearchResponse(BaseModel):
    """Response model for searching notebook cells.
    
    Attributes:
        path: The notebook path that was searched
        pattern: The regex pattern used
        cell_type: Filter for cell type (if specified)
        case_sensitive: Whether the search was case-sensitive
        results: List of cells containing matches
        total_matches: Total number of matching cells found
    """
    path: str = Field(..., description="Notebook path searched")
    pattern: str = Field(..., description="Search pattern used")
    cell_type: Optional[str] = Field(None, description="Cell type filter")
    case_sensitive: bool = Field(..., description="Whether search was case-sensitive")
    results: List[CellSearchResult] = Field(..., description="Matching cells")
    total_matches: int = Field(..., description="Total matching cells")
    
    class Config:
        json_schema_extra = {
            "example": {
                "path": "/Users/user@company.com/analysis",
                "pattern": "pandas|numpy",
                "cell_type": "code",
                "case_sensitive": False,
                "results": [
                    {
                        "cell_index": 2,
                        "cell_type": "code",
                        "match_count": 2,
                        "matches": ["import pandas", "pandas.DataFrame"],
                        "source": "import pandas as pd\nimport numpy as np"
                    }
                ],
                "total_matches": 1
            }
        }


class CellOperationResponse(BaseModel):
    """Response for cell modification operations.
    
    Attributes:
        path: Workspace path of the notebook
        operation: Type of operation performed
        cell_index: Index of the affected cell
        status: Status of the operation
        total_cells: Total number of cells after operation
    """
    path: str = Field(..., description="Workspace path of the notebook")
    operation: str = Field(..., description="Operation performed (insert, update, delete, reorder)")
    cell_index: int = Field(..., description="Index of affected cell")
    status: str = Field(default="success", description="Operation status")
    total_cells: int = Field(..., description="Total cells after operation")
    
    class Config:
        json_schema_extra = {
            "example": {
                "path": "/Users/me/notebook",
                "operation": "insert",
                "cell_index": 3,
                "status": "success",
                "total_cells": 6
            }
        }


# ============================================================================
# Directory Management Models
# ============================================================================

class DirectoryInfo(BaseModel):
    """Information about a workspace item (directory, notebook, file, repo, dashboard, library).
    
    Attributes:
        path: Full workspace path
        object_type: Type of object (DIRECTORY, NOTEBOOK, FILE, LIBRARY, REPO, DASHBOARD)
        object_id: Unique object ID
        resource_id: Resource identifier
        language: Programming language (for notebooks)
        size: Size in bytes
        created_at: Creation timestamp (ms)
        modified_at: Last modified timestamp (ms)
    """
    path: str = Field(..., description="Full workspace path")
    object_type: str = Field(..., description="Object type (DIRECTORY, NOTEBOOK, FILE, LIBRARY, REPO, DASHBOARD)")
    object_id: Optional[int] = Field(None, description="Unique object ID")
    resource_id: Optional[str] = Field(None, description="Resource identifier")
    language: Optional[str] = Field(None, description="Programming language (for notebooks)")
    size: Optional[int] = Field(None, description="Size in bytes")
    created_at: Optional[int] = Field(None, description="Creation timestamp (ms)")
    modified_at: Optional[int] = Field(None, description="Last modified timestamp (ms)")


class ListDirectoriesResponse(BaseModel):
    """Response model for listing workspace items.
    
    Attributes:
        path: The workspace path that was searched
        recursive: Whether the search was recursive (always False - returns current level only)
        items: List of workspace items (DIRECTORY, NOTEBOOK, FILE, LIBRARY, REPO, DASHBOARD)
        count: Total number of items
    """
    path: str = Field(..., description="Workspace path searched")
    recursive: bool = Field(..., description="Whether search was recursive")
    items: List[DirectoryInfo] = Field(..., description="List of workspace items (all types)")
    count: int = Field(..., description="Total items found")


class DirectoryCreateResponse(BaseModel):
    """Response model for directory creation.
    
    Attributes:
        path: The workspace path where directory was created
        status: Status message
    """
    path: str = Field(..., description="Workspace path created")
    status: str = Field(default="created", description="Status message")


class DirectoryDeleteResponse(BaseModel):
    """Response model for directory deletion.
    
    Attributes:
        path: The workspace path that was deleted
        recursive: Whether deletion was recursive
        status: Status message
    """
    path: str = Field(..., description="Workspace path deleted")
    recursive: bool = Field(..., description="Whether deletion was recursive")
    status: str = Field(default="deleted", description="Status message")


class DirectoryInfoResponse(BaseModel):
    """Response model for directory metadata.
    
    Attributes:
        path: Full workspace path
        object_id: Unique object ID
        resource_id: Resource identifier
        object_type: Should be "DIRECTORY"
        created_at: Creation timestamp (ms)
        modified_at: Last modified timestamp (ms)
    """
    path: str = Field(..., description="Full workspace path")
    object_id: Optional[int] = Field(None, description="Unique object ID")
    resource_id: Optional[str] = Field(None, description="Resource identifier")
    object_type: str = Field(..., description="Object type (DIRECTORY)")
    created_at: Optional[int] = Field(None, description="Creation timestamp (ms)")
    modified_at: Optional[int] = Field(None, description="Last modified timestamp (ms)")


class DirectoryTreeNode(BaseModel):
    """A node in the directory tree structure.
    
    Attributes:
        name: Name of the item
        path: Full workspace path
        type: Type of object (DIRECTORY, NOTEBOOK, FILE, LIBRARY, REPO, DASHBOARD)
        children: Child nodes (only for directories)
    """
    name: str = Field(..., description="Name of the item")
    path: str = Field(..., description="Full workspace path")
    type: str = Field(..., description="Object type (DIRECTORY, NOTEBOOK, FILE, LIBRARY, REPO, DASHBOARD)")
    children: Optional[List['DirectoryTreeNode']] = Field(None, description="Child nodes")


# Enable forward references for recursive model
DirectoryTreeNode.model_rebuild()


class DirectoryTreeResponse(BaseModel):
    """Response model for directory tree structure.
    
    Attributes:
        path: The root path of the tree
        max_depth: Maximum depth traversed
        tree: The root node of the tree
    """
    path: str = Field(..., description="Root path")
    max_depth: int = Field(..., description="Maximum depth")
    tree: DirectoryTreeNode = Field(..., description="Directory tree structure")


class LanguageBreakdown(BaseModel):
    """Breakdown of notebooks by language."""
    PYTHON: int = Field(default=0, description="Number of Python notebooks")
    SQL: int = Field(default=0, description="Number of SQL notebooks")
    SCALA: int = Field(default=0, description="Number of Scala notebooks")
    R: int = Field(default=0, description="Number of R notebooks")


class DirectoryStatsResponse(BaseModel):
    """Response model for directory statistics.
    
    Attributes:
        path: The directory path analyzed
        recursive: Whether stats were collected recursively
        total_notebooks: Total number of notebooks
        total_directories: Total number of subdirectories
        total_files: Total number of other items (FILE, LIBRARY, REPO, DASHBOARD)
        language_breakdown: Breakdown by notebook language
        total_size_bytes: Total size in bytes (if available)
    """
    path: str = Field(..., description="Directory path")
    recursive: bool = Field(..., description="Whether stats are recursive")
    total_notebooks: int = Field(..., description="Total notebooks")
    total_directories: int = Field(..., description="Total subdirectories")
    total_files: int = Field(..., description="Total other items (FILE, LIBRARY, REPO, DASHBOARD)")
    language_breakdown: LanguageBreakdown = Field(..., description="Notebooks by language")
    total_size_bytes: int = Field(default=0, description="Total size in bytes")


class DirectorySearchResult(BaseModel):
    """A single directory search result.
    
    Attributes:
        path: Full workspace path
        name: Directory name
        object_id: Unique object ID
        created_at: Creation timestamp (ms)
        modified_at: Last modified timestamp (ms)
    """
    path: str = Field(..., description="Full workspace path")
    name: str = Field(..., description="Directory name")
    object_id: Optional[int] = Field(None, description="Unique object ID")
    created_at: Optional[int] = Field(None, description="Creation timestamp (ms)")
    modified_at: Optional[int] = Field(None, description="Last modified timestamp (ms)")


class DirectorySearchResponse(BaseModel):
    """Response model for directory search.
    
    Attributes:
        path: The root path searched
        pattern: The regex pattern used
        recursive: Whether search was recursive
        results: List of matching directories
        total_matches: Total number of matches
    """
    path: str = Field(..., description="Root path searched")
    pattern: str = Field(..., description="Search pattern")
    recursive: bool = Field(..., description="Whether search was recursive")
    results: List[DirectorySearchResult] = Field(..., description="Matching directories")
    total_matches: int = Field(..., description="Total matches found")


# ============================================================================
# Notebook Listing Models
# ============================================================================

class NotebookInfo(BaseModel):
    """Information about a notebook in the workspace.
    
    Attributes:
        path: Full workspace path of the notebook
        object_id: Unique object ID
        resource_id: Resource identifier
        object_type: Type of object (NOTEBOOK, DIRECTORY, etc.)
        language: Programming language (PYTHON, SCALA, SQL, R)
        size: Size in bytes
        created_at: Creation timestamp (milliseconds since epoch)
        modified_at: Last modified timestamp (milliseconds since epoch)
    """
    path: str = Field(..., description="Full workspace path")
    object_id: Optional[int] = Field(None, description="Unique object ID")
    resource_id: Optional[str] = Field(None, description="Resource identifier")
    object_type: Optional[str] = Field(None, description="Object type")
    language: Optional[str] = Field(None, description="Programming language")
    size: Optional[int] = Field(None, description="Size in bytes")
    created_at: Optional[int] = Field(None, description="Creation timestamp (ms)")
    modified_at: Optional[int] = Field(None, description="Last modified timestamp (ms)")


class ListNotebooksResponse(BaseModel):
    """Response model for listing notebooks.
    
    Attributes:
        path: The workspace path that was searched
        recursive: Whether the search was recursive
        notebooks: List of notebooks found
        count: Total number of notebooks
    """
    path: str = Field(..., description="Workspace path searched")
    recursive: bool = Field(..., description="Whether search was recursive")
    notebooks: List[NotebookInfo] = Field(..., description="List of notebooks")
    count: int = Field(..., description="Total notebooks found")
    
    class Config:
        json_schema_extra = {
            "example": {
                "path": "/Users/user@company.com",
                "recursive": True,
                "notebooks": [
                    {
                        "path": "/Users/user@company.com/analysis",
                        "object_id": 1191853414493128,
                        "resource_id": "1191853414493128",
                        "object_type": "NOTEBOOK",
                        "language": "PYTHON",
                        "size": 4096,
                        "created_at": 1640000000000,
                        "modified_at": 1640100000000
                    }
                ],
                "count": 1
            }
        }


# ============================================================================
# URL Resolution Models
# ============================================================================

class NotebookPathInfo(BaseModel):
    """Information about a notebook resolved from a URL.
    
    Attributes:
        url: Original URL provided
        notebook_id: Extracted notebook ID (if ID-based URL)
        path: Resolved workspace path
        object_type: Type of object (NOTEBOOK, DIRECTORY, etc.)
        language: Programming language (PYTHON, SCALA, SQL, R)
        created_at: Creation timestamp
        modified_at: Last modification timestamp
    """
    url: str = Field(..., description="Original URL")
    notebook_id: Optional[str] = Field(None, description="Notebook ID from URL")
    path: str = Field(..., description="Workspace path")
    object_type: Optional[str] = Field(None, description="Object type")
    language: Optional[str] = Field(None, description="Programming language")
    created_at: Optional[int] = Field(None, description="Creation timestamp (ms)")
    modified_at: Optional[int] = Field(None, description="Last modified timestamp (ms)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "url": "https://workspace.cloud.databricks.com/editor/notebooks/1191853414493128",
                "notebook_id": "1191853414493128",
                "path": "/Workspace/Users/user@company.com/notebook",
                "object_type": "NOTEBOOK",
                "language": "PYTHON",
                "created_at": 1640000000000,
                "modified_at": 1640100000000
            }
        }
