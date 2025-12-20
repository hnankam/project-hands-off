"""
Pipelines (Delta Live Tables) Tools

This module provides tools for managing Databricks Delta Live Tables pipelines.
DLT is a framework for building reliable, maintainable data processing pipelines
with automatic orchestration, monitoring, and data quality management.
"""

from typing import Optional, Dict, Any
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
    host: str,
    token: str,
    filter: Optional[str] = None,
    max_results: int = 25,
    page_token: Optional[str] = None,
) -> ListPipelinesResponse:
    """
    List Delta Live Tables pipelines.
    
    Retrieves a list of pipelines defined in the workspace. Supports filtering
    and pagination for efficient querying.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        filter: Optional filter string (e.g., "name LIKE 'prod%'")
        max_results: Maximum number of results per page (default: 25)
        page_token: Pagination token for next page
        
    Returns:
        ListPipelinesResponse with pipelines and pagination token
        
    Example:
        # List all pipelines
        response = list_pipelines(host, token)
        for pipeline in response.pipelines:
            print(f"{pipeline.name}: {pipeline.pipeline_id}")
            print(f"  State: {pipeline.state.state if pipeline.state else 'Unknown'}")
        
        # List with filter
        response = list_pipelines(
            host, token,
            filter="name LIKE 'production%'"
        )
        
        # List with pagination
        response = list_pipelines(host, token, max_results=100)
        if response.next_page_token:
            next_page = list_pipelines(
                host, token,
                max_results=100,
                page_token=response.next_page_token
            )
    """
    client = get_workspace_client(host, token)
    
    pipelines = []
    next_token = None
    
    for pipeline in client.pipelines.list_pipelines(
        filter=filter,
        max_results=max_results,
        page_token=page_token,
    ):
        pipelines.append(_convert_to_pipeline_info(pipeline))
    
    return ListPipelinesResponse(
        pipelines=pipelines,
        next_page_token=next_token,
    )


def get_pipeline(
    host: str,
    token: str,
    pipeline_id: str,
) -> PipelineInfoModel:
    """
    Get Delta Live Tables pipeline details.
    
    Retrieves detailed information about a specific pipeline, including its
    specification, current state, and update history.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline
        
    Returns:
        PipelineInfoModel with pipeline details
        
    Example:
        # Get pipeline details
        pipeline = get_pipeline(host, token, "abc123")
        print(f"Name: {pipeline.name}")
        print(f"State: {pipeline.state.state}")
        print(f"Target: {pipeline.spec.target}")
        print(f"Continuous: {pipeline.spec.continuous}")
        print(f"Serverless: {pipeline.spec.serverless}")
    """
    client = get_workspace_client(host, token)
    
    pipeline = client.pipelines.get(pipeline_id=pipeline_id)
    
    return _convert_to_pipeline_info(pipeline)


def create_pipeline(
    host: str,
    token: str,
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
        host: Databricks workspace URL
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
        
    Example:
        # Create basic pipeline
        response = create_pipeline(
            host, token,
            name="sales_etl",
            storage="dbfs:/pipelines/sales",
            target="sales_db",
            continuous=False,
            development=True
        )
        print(f"Created pipeline: {response.pipeline_id}")
        
        # Create Unity Catalog pipeline with serverless
        response = create_pipeline(
            host, token,
            name="uc_pipeline",
            storage="dbfs:/pipelines/uc",
            catalog="production",
            schema="sales",
            serverless=True,
            photon=True,
            libraries=[{
                "notebook": {"path": "/Users/me/etl_notebook"}
            }]
        )
    """
    client = get_workspace_client(host, token)
    
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


def update_pipeline(
    host: str,
    token: str,
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
        host: Databricks workspace URL
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
        
    Example:
        # Update pipeline name and mode
        response = update_pipeline(
            host, token,
            pipeline_id="abc123",
            name="production_sales_etl",
            development=False,
            continuous=True
        )
        
        # Enable serverless and Photon
        response = update_pipeline(
            host, token,
            pipeline_id="abc123",
            serverless=True,
            photon=True
        )
    """
    client = get_workspace_client(host, token)
    
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


def delete_pipeline(
    host: str,
    token: str,
    pipeline_id: str,
) -> DeletePipelineResponse:
    """
    Delete a Delta Live Tables pipeline.
    
    Deletes a pipeline and its associated metadata. This does not delete the
    data produced by the pipeline.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline to delete
        
    Returns:
        DeletePipelineResponse confirming deletion
        
    Example:
        # Delete pipeline
        response = delete_pipeline(host, token, "abc123")
        print(response.message)
    """
    client = get_workspace_client(host, token)
    
    client.pipelines.delete(pipeline_id=pipeline_id)
    
    return DeletePipelineResponse(
        pipeline_id=pipeline_id,
    )


# ============================================================================
# Pipeline Operations
# ============================================================================

def start_pipeline_update(
    host: str,
    token: str,
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
        host: Databricks workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline
        full_refresh: Reset all tables before running (default: False)
        full_refresh_selection: List of specific tables to fully refresh
        refresh_selection: List of tables to incrementally update
        
    Returns:
        StartUpdateResponse with update ID
        
    Example:
        # Start incremental update
        response = start_pipeline_update(host, token, "abc123")
        print(f"Update started: {response.update_id}")
        
        # Full refresh all tables
        response = start_pipeline_update(
            host, token,
            pipeline_id="abc123",
            full_refresh=True
        )
        
        # Refresh specific tables
        response = start_pipeline_update(
            host, token,
            pipeline_id="abc123",
            refresh_selection=["orders", "customers"]
        )
    """
    client = get_workspace_client(host, token)
    
    update = client.pipelines.start_update(
        pipeline_id=pipeline_id,
        full_refresh=full_refresh,
        full_refresh_selection=full_refresh_selection,
        refresh_selection=refresh_selection,
    )
    
    return StartUpdateResponse(
        update_id=update.update_id,
    )


def stop_pipeline(
    host: str,
    token: str,
    pipeline_id: str,
) -> StopPipelineResponse:
    """
    Stop a running Delta Live Tables pipeline.
    
    Stops the pipeline by canceling the active update. If there is no active
    update, this is a no-op.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline
        
    Returns:
        StopPipelineResponse confirming stop
        
    Example:
        # Stop running pipeline
        response = stop_pipeline(host, token, "abc123")
        print(response.message)
    """
    client = get_workspace_client(host, token)
    
    client.pipelines.stop(pipeline_id=pipeline_id)
    
    return StopPipelineResponse(
        pipeline_id=pipeline_id,
    )


def reset_pipeline(
    host: str,
    token: str,
    pipeline_id: str,
) -> ResetPipelineResponse:
    """
    Reset a Delta Live Tables pipeline.
    
    Resets the pipeline state and triggers a full refresh of all tables on the
    next update. This clears all state and checkpoints.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline
        
    Returns:
        ResetPipelineResponse confirming reset
        
    Example:
        # Reset pipeline (clears all state)
        response = reset_pipeline(host, token, "abc123")
        print(response.message)
        
        # Typical workflow: reset then start update
        reset_pipeline(host, token, "abc123")
        start_pipeline_update(host, token, "abc123", full_refresh=True)
    """
    client = get_workspace_client(host, token)
    
    client.pipelines.reset(pipeline_id=pipeline_id)
    
    return ResetPipelineResponse(
        pipeline_id=pipeline_id,
    )


# ============================================================================
# Pipeline Updates
# ============================================================================

def list_pipeline_updates(
    host: str,
    token: str,
    pipeline_id: str,
    max_results: int = 25,
    page_token: Optional[str] = None,
) -> ListUpdatesResponse:
    """
    List updates for a Delta Live Tables pipeline.
    
    Retrieves the update history for a pipeline, including status and timing
    information for each update.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline
        max_results: Maximum results per page (default: 25)
        page_token: Pagination token
        
    Returns:
        ListUpdatesResponse with update history
        
    Example:
        # List recent updates
        response = list_pipeline_updates(host, token, "abc123")
        for update in response.updates:
            print(f"Update {update.update_id}: {update.state}")
            print(f"  Created: {update.creation_time}")
            print(f"  Full Refresh: {update.full_refresh}")
    """
    client = get_workspace_client(host, token)
    
    updates = []
    next_token = None
    
    for update in client.pipelines.list_updates(
        pipeline_id=pipeline_id,
        max_results=max_results,
        page_token=page_token,
    ):
        updates.append(_convert_to_update_info(update))
    
    return ListUpdatesResponse(
        updates=updates,
        next_page_token=next_token,
    )


def get_pipeline_update(
    host: str,
    token: str,
    pipeline_id: str,
    update_id: str,
) -> UpdateInfoModel:
    """
    Get details of a specific pipeline update.
    
    Retrieves detailed information about a specific pipeline update, including
    its current state and execution details.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        pipeline_id: ID of the pipeline
        update_id: ID of the update
        
    Returns:
        UpdateInfoModel with update details
        
    Example:
        # Get update details
        update = get_pipeline_update(
            host, token,
            pipeline_id="abc123",
            update_id="update-456"
        )
        print(f"State: {update.state}")
        print(f"Full Refresh: {update.full_refresh}")
    """
    client = get_workspace_client(host, token)
    
    update = client.pipelines.get_update(
        pipeline_id=pipeline_id,
        update_id=update_id,
    )
    
    return _convert_to_update_info(update)

