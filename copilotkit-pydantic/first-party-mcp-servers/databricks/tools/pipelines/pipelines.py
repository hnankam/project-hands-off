"""
Pipelines (Delta Live Tables) Tools

This module provides tools for managing Databricks Delta Live Tables pipelines.
DLT is a framework for building reliable, maintainable data processing pipelines
with automatic orchestration, monitoring, and data quality management.
"""

from typing import Optional, Dict, Any
from itertools import islice
from cache import get_workspace_client
from models import (
    PipelineInfoModel,
    PipelineSpecModel,
    PipelineStateModel,
    ListPipelinesResponse,
    CreatePipelineResponse,
    UpdatePipelineResponse,
    DeletePipelineResponse,
    UpdateInfoModel,
    StartUpdateResponse,
    ListUpdatesResponse,
    StopPipelineResponse,
    ResetPipelineResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_pipeline_spec(spec) -> Optional[PipelineSpecModel]:
    """Convert SDK PipelineSpec to Pydantic model."""
    if not spec:
        return None
    
    return PipelineSpecModel(
        id=spec.id,
        name=spec.name,
        storage=spec.storage,
        target=spec.target,
        catalog=spec.catalog,
        schema_name=getattr(spec, 'schema', None),
        continuous=spec.continuous,
        development=spec.development,
        edition=spec.edition,
        photon=spec.photon,
        serverless=spec.serverless,
        channel=spec.channel,
    )


def _convert_to_pipeline_state(state) -> Optional[PipelineStateModel]:
    """Convert SDK PipelineState to Pydantic model."""
    if not state:
        return None
    
    return PipelineStateModel(
        state=state.state.value if state.state else None,
        latest_update=state.latest_update,
        creator_user_name=state.creator_user_name,
        last_modified=state.last_modified,
    )


def _convert_to_pipeline_info(pipeline) -> PipelineInfoModel:
    """Convert SDK GetPipelineResponse to Pydantic model."""
    return PipelineInfoModel(
        pipeline_id=pipeline.pipeline_id,
        spec=_convert_to_pipeline_spec(pipeline.spec),
        state=_convert_to_pipeline_state(pipeline.state),
        name=pipeline.name,
        creator_user_name=pipeline.creator_user_name,
        last_modified=pipeline.last_modified,
        latest_updates=pipeline.latest_updates,
    )


def _convert_to_update_info(update) -> UpdateInfoModel:
    """Convert SDK UpdateInfo to Pydantic model."""
    return UpdateInfoModel(
        update_id=update.update_id,
        pipeline_id=update.pipeline_id,
        state=update.state.value if update.state else None,
        creation_time=update.creation_time,
        full_refresh=update.full_refresh,
    )


# ============================================================================
# Pipeline Management
# ============================================================================

def list_pipelines(
    host_credential_key: str,
    token_credential_key: str,
    filter: Optional[str] = None,
    limit: int = 25,
    page: int = 0,
) -> ListPipelinesResponse:
    """
    Retrieve a paginated list of Delta Live Tables (DLT) pipelines in the workspace.
    
    This function returns pipeline definitions for data processing workflows. Use this to
    discover available pipelines, check pipeline status, or list ETL workflows.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        filter: Optional SQL-like filter expression to match pipeline names. Supports wildcards (%). 
        limit: Number of pipelines to return in a single request. Must be positive integer. Default: 25
        page: Zero-indexed page number for pagination. Default: 0
        
    Returns:
        ListPipelinesResponse containing:
        - pipelines: List of PipelineInfoModel objects with pipeline definitions (name, ID, configuration, state, spec)
        - has_more: Boolean indicating if additional pipelines exist beyond this page
        
    Pagination:
        - Returns up to `limit` pipelines per call
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available
        - Filter expression applies consistently across all pages
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    response = client.pipelines.list_pipelines(
        filter=filter,
    )
    
    skip = page * limit
    pipelines_iterator = islice(response, skip, skip + limit)
    
    pipelines = []
    for pipeline in pipelines_iterator:
        pipelines.append(_convert_to_pipeline_info(pipeline))
    
    # Check for more results
    has_more = False
    try:
        next(response)
        has_more = True
    except StopIteration:
        has_more = False
    
    return ListPipelinesResponse(
        pipelines=pipelines,
        has_more=has_more,
    )
    except Exception as e:
        return ListPipelinesResponse(
            pipelines=[],
            has_more=False,
            error_message=f"Failed to list pipelines: {str(e)}",
        )


def get_pipeline(
    host_credential_key: str,
    token_credential_key: str,
    pipeline_id: str,
) -> Optional[PipelineInfoModel]:
    """
    Get Delta Live Tables pipeline details.
    
    Retrieves detailed information about a specific pipeline, including its
    specification, current state, and update history.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline
        
    Returns:
        PipelineInfoModel with pipeline details, or None on error
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    pipeline = client.pipelines.get(pipeline_id=pipeline_id)
    
    return _convert_to_pipeline_info(pipeline)
    except Exception as e:
        return PipelineInfoModel(
            pipeline_id=pipeline_id,
            error_message=f"Failed to get pipeline: {str(e)}",
        )


def create_pipeline(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    storage: str,
    configuration: Optional[Dict[str, str]] = None,
    target: Optional[str] = None,
    catalog: Optional[str] = None,
    schema: Optional[str] = None,
    continuous: bool = False,
    development: bool = False,
    photon: bool = False,
    serverless: bool = False,
    channel: Optional[str] = None,
    edition: Optional[str] = None,
    libraries: Optional[list[Dict[str, Any]]] = None,
    clusters: Optional[list[Dict[str, Any]]] = None,
) -> CreatePipelineResponse:
    """
    Create a new Delta Live Tables pipeline.
    
    Creates a new DLT pipeline with the specified configuration. The pipeline
    defines data transformations and manages execution, monitoring, and quality.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Friendly name for the pipeline
        storage: DBFS path for storing checkpoints and tables
        configuration: Key-value configuration parameters
        target: Target schema/database (Hive Metastore)
        catalog: Unity Catalog catalog name
        schema: Unity Catalog schema name
        continuous: Whether pipeline runs continuously (default: False)
        development: Whether pipeline is in development mode
        photon: Whether to enable Photon acceleration
        serverless: Whether to use serverless compute
        channel: DLT release channel (CURRENT, PREVIEW, etc.)
        edition: Pipeline edition (CORE, PRO, ADVANCED)
        libraries: Notebook or file libraries defining transformations
        clusters: Cluster configurations for pipeline execution
        
    Returns:
        CreatePipelineResponse with pipeline ID
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.pipelines import PipelineLibrary, NotebookLibrary, PipelineCluster
    
    # Convert libraries if provided
    lib_objects = None
    if libraries:
        lib_objects = []
        for lib in libraries:
            if "notebook" in lib:
                lib_objects.append(PipelineLibrary(
                    notebook=NotebookLibrary(path=lib["notebook"]["path"])
                ))
    
    # Convert clusters if provided
    cluster_objects = None
    if clusters:
        from databricks.sdk.service.pipelines import PipelineCluster
        cluster_objects = []
        for cluster in clusters:
            cluster_objects.append(PipelineCluster(**cluster))
    
    pipeline = client.pipelines.create(
        name=name,
        storage=storage,
        configuration=configuration,
        target=target,
        catalog=catalog,
        schema=schema,
        continuous=continuous,
        development=development,
        photon=photon,
        serverless=serverless,
        channel=channel,
        edition=edition,
        libraries=lib_objects,
        clusters=cluster_objects,
    )
    
    return CreatePipelineResponse(
        pipeline_id=pipeline.pipeline_id,
    )
    except Exception as e:
        return CreatePipelineResponse(
            pipeline_id=None,
            error_message=f"Failed to create pipeline: {str(e)}",
        )


def update_pipeline(
    host_credential_key: str,
    token_credential_key: str,
    pipeline_id: str,
    name: Optional[str] = None,
    configuration: Optional[Dict[str, str]] = None,
    target: Optional[str] = None,
    catalog: Optional[str] = None,
    schema: Optional[str] = None,
    continuous: Optional[bool] = None,
    development: Optional[bool] = None,
    photon: Optional[bool] = None,
    serverless: Optional[bool] = None,
    channel: Optional[str] = None,
    edition: Optional[str] = None,
    libraries: Optional[list[Dict[str, Any]]] = None,
    clusters: Optional[list[Dict[str, Any]]] = None,
) -> UpdatePipelineResponse:
    """
    Update a Delta Live Tables pipeline configuration.
    
    Updates the settings and configuration of an existing pipeline. Changes
    take effect on the next pipeline update/run.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline to update
        name: New name for the pipeline
        configuration: Updated configuration parameters
        target: Updated target schema/database
        catalog: Updated Unity Catalog catalog
        schema: Updated Unity Catalog schema
        continuous: Update continuous mode
        development: Update development mode
        photon: Update Photon enablement
        serverless: Update serverless mode
        channel: Update DLT release channel
        edition: Update pipeline edition
        libraries: Updated libraries
        clusters: Updated cluster configurations
        
    Returns:
        UpdatePipelineResponse confirming update
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Convert libraries if provided
    lib_objects = None
    if libraries:
        from databricks.sdk.service.pipelines import PipelineLibrary, NotebookLibrary
        lib_objects = []
        for lib in libraries:
            if "notebook" in lib:
                lib_objects.append(PipelineLibrary(
                    notebook=NotebookLibrary(path=lib["notebook"]["path"])
                ))
    
    # Convert clusters if provided
    cluster_objects = None
    if clusters:
        from databricks.sdk.service.pipelines import PipelineCluster
        cluster_objects = []
        for cluster in clusters:
            cluster_objects.append(PipelineCluster(**cluster))
    
    client.pipelines.update(
        pipeline_id=pipeline_id,
        name=name,
        configuration=configuration,
        target=target,
        catalog=catalog,
        schema=schema,
        continuous=continuous,
        development=development,
        photon=photon,
        serverless=serverless,
        channel=channel,
        edition=edition,
        libraries=lib_objects,
        clusters=cluster_objects,
    )
    
    return UpdatePipelineResponse()
    except Exception as e:
        return UpdatePipelineResponse(
            error_message=f"Failed to update pipeline: {str(e)}",
        )


def delete_pipeline(
    host_credential_key: str,
    token_credential_key: str,
    pipeline_id: str,
) -> DeletePipelineResponse:
    """
    Delete a Delta Live Tables pipeline.
    
    Deletes a pipeline and its associated metadata. This does not delete the
    data produced by the pipeline.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline to delete
        
    Returns:
        DeletePipelineResponse confirming deletion
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.pipelines.delete(pipeline_id=pipeline_id)
    
    return DeletePipelineResponse(
        pipeline_id=pipeline_id,
    )
    except Exception as e:
        return DeletePipelineResponse(
            pipeline_id=pipeline_id,
            error_message=f"Failed to delete pipeline: {str(e)}",
        )


# ============================================================================
# Pipeline Operations
# ============================================================================

def start_pipeline_update(
    host_credential_key: str,
    token_credential_key: str,
    pipeline_id: str,
    full_refresh: bool = False,
    full_refresh_selection: Optional[list[str]] = None,
    refresh_selection: Optional[list[str]] = None,
) -> StartUpdateResponse:
    """
    Start a Delta Live Tables pipeline update.
    
    Triggers an update of the pipeline, which processes data according to the
    pipeline definition. Can do full refresh or incremental updates.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline
        full_refresh: Reset all tables before running (default: False)
        full_refresh_selection: List of specific tables to fully refresh
        refresh_selection: List of tables to incrementally update
        
    Returns:
        StartUpdateResponse with update ID
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    update = client.pipelines.start_update(
        pipeline_id=pipeline_id,
        full_refresh=full_refresh,
        full_refresh_selection=full_refresh_selection,
        refresh_selection=refresh_selection,
    )
    
    return StartUpdateResponse(
        update_id=update.update_id,
    )
    except Exception as e:
        return StartUpdateResponse(
            update_id=None,
            error_message=f"Failed to start pipeline update: {str(e)}",
        )


def stop_pipeline(
    host_credential_key: str,
    token_credential_key: str,
    pipeline_id: str,
) -> StopPipelineResponse:
    """
    Stop a running Delta Live Tables pipeline.
    
    Stops the pipeline by canceling the active update. If there is no active
    update, this is a no-op.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline
        
    Returns:
        StopPipelineResponse confirming stop
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.pipelines.stop(pipeline_id=pipeline_id)
    
    return StopPipelineResponse(
        pipeline_id=pipeline_id,
    )
    except Exception as e:
        return StopPipelineResponse(
            pipeline_id=pipeline_id,
            error_message=f"Failed to stop pipeline: {str(e)}",
        )


def reset_pipeline(
    host_credential_key: str,
    token_credential_key: str,
    pipeline_id: str,
) -> ResetPipelineResponse:
    """
    Reset a Delta Live Tables pipeline.
    
    Resets the pipeline state and triggers a full refresh of all tables on the
    next update. This clears all state and checkpoints.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline
        
    Returns:
        ResetPipelineResponse confirming reset
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.pipelines.reset(pipeline_id=pipeline_id)
    
    return ResetPipelineResponse(
        pipeline_id=pipeline_id,
    )
    except Exception as e:
        return ResetPipelineResponse(
            pipeline_id=pipeline_id,
            error_message=f"Failed to reset pipeline: {str(e)}",
        )


# ============================================================================
# Pipeline Updates
# ============================================================================

def list_pipeline_updates(
    host_credential_key: str,
    token_credential_key: str,
    pipeline_id: str,
    limit: int = 25,
    page: int = 0,
) -> ListUpdatesResponse:
    """
    Retrieve paginated execution history of updates for a specific Delta Live Tables pipeline.
    
    This function returns update records (pipeline executions) for a given pipeline, ordered by
    creation time (most recent first). Use this to monitor pipeline runs, track failures, or
    analyze execution patterns.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        pipeline_id: Unique identifier of the pipeline. Required. Must be valid pipeline ID string
        limit: Number of updates to return in a single request. Must be positive integer. Default: 25
        page: Zero-indexed page number for pagination. Default: 0
        
    Returns:
        ListUpdatesResponse containing:
        - updates: List of UpdateInfoModel objects with execution details (state, creation time, full refresh flag)
        - has_more: Boolean indicating if additional updates exist beyond this page
        
    Pagination:
        - Returns up to `limit` updates per call, ordered by creation time (newest first)
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    response = client.pipelines.list_updates(
        pipeline_id=pipeline_id,
    )
    
    skip = page * limit
    updates_iterator = islice(response, skip, skip + limit)
    
    updates = []
    for update in updates_iterator:
        updates.append(_convert_to_update_info(update))
    
    # Check for more results
    has_more = False
    try:
        next(response)
        has_more = True
    except StopIteration:
        has_more = False
    
    return ListUpdatesResponse(
        updates=updates,
        has_more=has_more,
    )
    except Exception as e:
        return ListUpdatesResponse(
            updates=[],
            has_more=False,
            error_message=f"Failed to list pipeline updates: {str(e)}",
        )


def get_pipeline_update(
    host_credential_key: str,
    token_credential_key: str,
    pipeline_id: str,
    update_id: str,
) -> Optional[UpdateInfoModel]:
    """
    Get details of a specific pipeline update.
    
    Retrieves detailed information about a specific pipeline update, including
    its current state and execution details.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline
        update_id: ID of the update
        
    Returns:
        UpdateInfoModel with update details, or None on error
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    update = client.pipelines.get_update(
        pipeline_id=pipeline_id,
        update_id=update_id,
    )
    
    return _convert_to_update_info(update)
    except Exception as e:
        return UpdateInfoModel(
            pipeline_id=pipeline_id,
            update_id=update_id,
            error_message=f"Failed to get pipeline update: {str(e)}",
        )

