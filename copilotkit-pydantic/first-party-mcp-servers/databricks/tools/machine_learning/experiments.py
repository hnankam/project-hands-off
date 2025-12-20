"""
MLflow Experiments Tools

This module provides tools for managing MLflow experiments and runs in Databricks.
MLflow is an open-source platform for managing the end-to-end machine learning lifecycle,
including experimentation, reproducibility, and deployment.
"""

from typing import Optional, List, Dict, Any
from cache import get_workspace_client
from models import (
    ExperimentModel,
    RunModel,
    RunInfoModel,
    RunDataModel,
    ListExperimentsResponse,
    CreateExperimentResponse,
    DeleteExperimentResponse,
    UpdateExperimentResponse,
    CreateRunResponse,
    DeleteRunResponse,
    UpdateRunResponse,
    SearchRunsResponse,
    LogMetricResponse,
    LogParamResponse,
    SetExperimentTagResponse,
    SetRunTagResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_experiment_model(experiment) -> ExperimentModel:
    """Convert SDK Experiment to Pydantic model."""
    tags_list = None
    if experiment.tags:
        tags_list = [{"key": tag.key, "value": tag.value} for tag in experiment.tags]
    
    return ExperimentModel(
        experiment_id=experiment.experiment_id,
        name=experiment.name,
        artifact_location=experiment.artifact_location,
        lifecycle_stage=experiment.lifecycle_stage,
        last_update_time=experiment.last_update_time,
        creation_time=experiment.creation_time,
        tags=tags_list,
    )


def _convert_to_run_info_model(run_info) -> RunInfoModel:
    """Convert SDK RunInfo to Pydantic model."""
    return RunInfoModel(
        run_id=run_info.run_id,
        run_uuid=run_info.run_uuid,
        run_name=run_info.run_name,
        experiment_id=run_info.experiment_id,
        user_id=run_info.user_id,
        status=run_info.status.value if run_info.status else None,
        start_time=run_info.start_time,
        end_time=run_info.end_time,
        artifact_uri=run_info.artifact_uri,
        lifecycle_stage=run_info.lifecycle_stage,
    )


def _convert_to_run_data_model(run_data) -> Optional[RunDataModel]:
    """Convert SDK RunData to Pydantic model."""
    if not run_data:
        return None
    
    metrics_list = None
    if run_data.metrics:
        metrics_list = [{"key": m.key, "value": m.value, "timestamp": m.timestamp, "step": m.step} 
                       for m in run_data.metrics]
    
    params_list = None
    if run_data.params:
        params_list = [{"key": p.key, "value": p.value} for p in run_data.params]
    
    tags_list = None
    if run_data.tags:
        tags_list = [{"key": t.key, "value": t.value} for t in run_data.tags]
    
    return RunDataModel(
        metrics=metrics_list,
        params=params_list,
        tags=tags_list,
    )


def _convert_to_run_model(run) -> RunModel:
    """Convert SDK Run to Pydantic model."""
    return RunModel(
        info=_convert_to_run_info_model(run.info) if run.info else None,
        data=_convert_to_run_data_model(run.data) if run.data else None,
    )


# ============================================================================
# Experiment Management
# ============================================================================

def list_experiments(
    host: str,
    token: str,
    max_results: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListExperimentsResponse:
    """
    List MLflow experiments.
    
    Retrieves all experiments in the workspace. Experiments are the primary unit
    of organization in MLflow; all runs belong to an experiment.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        max_results: Maximum number of experiments to return
        page_token: Pagination token for next page
        
    Returns:
        ListExperimentsResponse with experiments and pagination
        
    Example:
        # List all experiments
        response = list_experiments(host, token)
        for exp in response.experiments:
            print(f"{exp.name} (ID: {exp.experiment_id})")
            print(f"  Location: {exp.artifact_location}")
            print(f"  Created: {exp.creation_time}")
    """
    client = get_workspace_client(host, token)
    
    experiments = []
    next_token = None
    
    for experiment in client.experiments.list_experiments(
        max_results=max_results,
        page_token=page_token,
    ):
        experiments.append(_convert_to_experiment_model(experiment))
    
    return ListExperimentsResponse(
        experiments=experiments,
        next_page_token=next_token,
    )


def get_experiment(
    host: str,
    token: str,
    experiment_id: str,
) -> ExperimentModel:
    """
    Get an MLflow experiment by ID.
    
    Retrieves metadata for a specific experiment including its configuration,
    tags, and storage location.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        experiment_id: ID of the experiment
        
    Returns:
        ExperimentModel with experiment details
        
    Example:
        # Get experiment details
        experiment = get_experiment(host, token, "12345")
        print(f"Name: {experiment.name}")
        print(f"Artifact location: {experiment.artifact_location}")
        print(f"Stage: {experiment.lifecycle_stage}")
    """
    client = get_workspace_client(host, token)
    
    experiment = client.experiments.get_experiment(experiment_id=experiment_id)
    
    return _convert_to_experiment_model(experiment)


def get_experiment_by_name(
    host: str,
    token: str,
    experiment_name: str,
) -> ExperimentModel:
    """
    Get an MLflow experiment by name.
    
    Retrieves experiment metadata using the experiment's name instead of ID.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        experiment_name: Name of the experiment
        
    Returns:
        ExperimentModel with experiment details
        
    Example:
        # Get experiment by name
        experiment = get_experiment_by_name(
            host, token,
            experiment_name="/Users/me/my-ml-project"
        )
        print(f"Experiment ID: {experiment.experiment_id}")
    """
    client = get_workspace_client(host, token)
    
    experiment = client.experiments.get_experiment_by_name(
        experiment_name=experiment_name
    )
    
    return _convert_to_experiment_model(experiment)


def create_experiment(
    host: str,
    token: str,
    name: str,
    artifact_location: Optional[str] = None,
    tags: Optional[Dict[str, str]] = None,
) -> CreateExperimentResponse:
    """
    Create a new MLflow experiment.
    
    Creates an experiment with a name. Each experiment provides a way to organize
    and track multiple ML runs. The experiment name must be unique.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        name: Experiment name (must be unique)
        artifact_location: Location for storing artifacts (optional)
        tags: Dictionary of tags to set on the experiment
        
    Returns:
        CreateExperimentResponse with experiment ID
        
    Example:
        # Create basic experiment
        response = create_experiment(
            host, token,
            name="/Users/me/fraud-detection"
        )
        print(f"Created experiment: {response.experiment_id}")
        
        # Create with tags
        response = create_experiment(
            host, token,
            name="/Users/me/recommendation-model",
            tags={"team": "ml", "project": "recommendations"}
        )
    """
    client = get_workspace_client(host, token)
    
    # Convert tags dictionary to list of ExperimentTag
    tag_list = None
    if tags:
        from databricks.sdk.service.ml import ExperimentTag
        tag_list = [ExperimentTag(key=k, value=v) for k, v in tags.items()]
    
    experiment = client.experiments.create_experiment(
        name=name,
        artifact_location=artifact_location,
        tags=tag_list,
    )
    
    return CreateExperimentResponse(
        experiment_id=experiment.experiment_id,
    )


def update_experiment(
    host: str,
    token: str,
    experiment_id: str,
    new_name: str,
) -> UpdateExperimentResponse:
    """
    Update an MLflow experiment.
    
    Updates experiment metadata. Currently only supports renaming the experiment.
    The new name must be unique.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        experiment_id: ID of the experiment
        new_name: New name for the experiment (must be unique)
        
    Returns:
        UpdateExperimentResponse confirming update
        
    Example:
        # Rename experiment
        response = update_experiment(
            host, token,
            experiment_id="12345",
            new_name="/Users/me/fraud-detection-v2"
        )
    """
    client = get_workspace_client(host, token)
    
    client.experiments.update_experiment(
        experiment_id=experiment_id,
        new_name=new_name,
    )
    
    return UpdateExperimentResponse()


def delete_experiment(
    host: str,
    token: str,
    experiment_id: str,
) -> DeleteExperimentResponse:
    """
    Delete an MLflow experiment.
    
    Marks an experiment and associated runs, metrics, params, and tags for deletion.
    If using FileStore, artifacts are also deleted.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        experiment_id: ID of the experiment to delete
        
    Returns:
        DeleteExperimentResponse confirming deletion
        
    Example:
        # Delete experiment
        response = delete_experiment(host, token, "12345")
        print(response.message)
    """
    client = get_workspace_client(host, token)
    
    client.experiments.delete_experiment(experiment_id=experiment_id)
    
    return DeleteExperimentResponse(
        experiment_id=experiment_id,
    )


def restore_experiment(
    host: str,
    token: str,
    experiment_id: str,
) -> UpdateExperimentResponse:
    """
    Restore a deleted MLflow experiment.
    
    Restores an experiment that was previously marked for deletion.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        experiment_id: ID of the experiment to restore
        
    Returns:
        UpdateExperimentResponse confirming restoration
        
    Example:
        # Restore deleted experiment
        response = restore_experiment(host, token, "12345")
        print(response.message)
    """
    client = get_workspace_client(host, token)
    
    client.experiments.restore_experiment(experiment_id=experiment_id)
    
    return UpdateExperimentResponse(
        message="Experiment restored successfully"
    )


def search_experiments(
    host: str,
    token: str,
    filter: Optional[str] = None,
    max_results: Optional[int] = None,
    order_by: Optional[List[str]] = None,
    page_token: Optional[str] = None,
) -> ListExperimentsResponse:
    """
    Search for MLflow experiments.
    
    Searches for experiments that satisfy the specified filter criteria.
    Supports filtering by name, tags, and other attributes.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        filter: Filter expression (e.g., "name LIKE '/Users/me/%'")
        max_results: Maximum results to return
        order_by: List of order by expressions
        page_token: Pagination token
        
    Returns:
        ListExperimentsResponse with matching experiments
        
    Example:
        # Search by name pattern
        response = search_experiments(
            host, token,
            filter="name LIKE '/Users/me/%'"
        )
        
        # Search with ordering
        response = search_experiments(
            host, token,
            filter="tags.team = 'ml'",
            order_by=["creation_time DESC"]
        )
    """
    client = get_workspace_client(host, token)
    
    experiments = []
    next_token = None
    
    for experiment in client.experiments.search_experiments(
        filter=filter,
        max_results=max_results,
        order_by=order_by,
        page_token=page_token,
    ):
        experiments.append(_convert_to_experiment_model(experiment))
    
    return ListExperimentsResponse(
        experiments=experiments,
        next_page_token=next_token,
    )


# ============================================================================
# Run Management
# ============================================================================

def create_experiment_run(
    host: str,
    token: str,
    experiment_id: str,
    run_name: Optional[str] = None,
    start_time: Optional[int] = None,
    tags: Optional[Dict[str, str]] = None,
) -> CreateRunResponse:
    """
    Create a new MLflow run.
    
    Creates a new run within an experiment. A run tracks parameters, metrics,
    and artifacts for a single execution of ML code.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        experiment_id: ID of the experiment
        run_name: Name for the run (optional)
        start_time: Unix timestamp in milliseconds (optional)
        tags: Dictionary of tags for the run
        
    Returns:
        CreateRunResponse with run information
        
    Example:
        # Create basic run
        response = create_run(
            host, token,
            experiment_id="12345"
        )
        print(f"Run ID: {response.run.info.run_id}")
        
        # Create with name and tags
        response = create_run(
            host, token,
            experiment_id="12345",
            run_name="random-forest-v1",
            tags={"model_type": "random_forest", "version": "1.0"}
        )
    """
    client = get_workspace_client(host, token)
    
    # Convert tags dictionary to list of RunTag
    tag_list = None
    if tags:
        from databricks.sdk.service.ml import RunTag
        tag_list = [RunTag(key=k, value=v) for k, v in tags.items()]
    
    run = client.experiments.create_run(
        experiment_id=experiment_id,
        run_name=run_name,
        start_time=start_time,
        tags=tag_list,
    )
    
    return CreateRunResponse(
        run=_convert_to_run_model(run.run),
    )


def get_experiment_run(
    host: str,
    token: str,
    run_id: str,
) -> RunModel:
    """
    Get an MLflow run.
    
    Retrieves metadata, metrics, parameters, and tags for a specific run.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: ID of the run
        
    Returns:
        RunModel with run details
        
    Example:
        # Get run details
        run = get_run(host, token, "abc123")
        print(f"Run name: {run.info.run_name}")
        print(f"Status: {run.info.status}")
        if run.data:
            print(f"Metrics: {run.data.metrics}")
            print(f"Parameters: {run.data.params}")
    """
    client = get_workspace_client(host, token)
    
    run = client.experiments.get_run(run_id=run_id)
    
    return _convert_to_run_model(run.run)


def update_experiment_run(
    host: str,
    token: str,
    run_id: str,
    status: Optional[str] = None,
    run_name: Optional[str] = None,
    end_time: Optional[int] = None,
) -> UpdateRunResponse:
    """
    Update an MLflow run.
    
    Updates run metadata including status, name, and end time.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: ID of the run
        status: New status (RUNNING, FINISHED, FAILED, KILLED)
        run_name: New name for the run
        end_time: Unix timestamp in milliseconds
        
    Returns:
        UpdateRunResponse with updated run info
        
    Example:
        # Mark run as finished
        response = update_run(
            host, token,
            run_id="abc123",
            status="FINISHED"
        )
        
        # Update name and end time
        import time
        response = update_run(
            host, token,
            run_id="abc123",
            run_name="final-model",
            end_time=int(time.time() * 1000)
        )
    """
    client = get_workspace_client(host, token)
    
    # Convert status string to enum if provided
    status_enum = None
    if status:
        from databricks.sdk.service.ml import UpdateRunStatus
        status_enum = UpdateRunStatus(status)
    
    run = client.experiments.update_run(
        run_id=run_id,
        status=status_enum,
        run_name=run_name,
        end_time=end_time,
    )
    
    return UpdateRunResponse(
        run=_convert_to_run_model(run.run_info) if hasattr(run, 'run_info') else RunModel(),
    )


def delete_experiment_run(
    host: str,
    token: str,
    run_id: str,
) -> DeleteRunResponse:
    """
    Delete an MLflow run.
    
    Marks a run for deletion. The run and associated data will be permanently
    removed from the system.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: ID of the run to delete
        
    Returns:
        DeleteRunResponse confirming deletion
        
    Example:
        # Delete run
        response = delete_run(host, token, "abc123")
        print(response.message)
    """
    client = get_workspace_client(host, token)
    
    client.experiments.delete_run(run_id=run_id)
    
    return DeleteRunResponse(
        run_id=run_id,
    )


def restore_experiment_run(
    host: str,
    token: str,
    run_id: str,
) -> UpdateRunResponse:
    """
    Restore a deleted MLflow run.
    
    Restores a run that was previously marked for deletion.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: ID of the run to restore
        
    Returns:
        UpdateRunResponse confirming restoration
        
    Example:
        # Restore deleted run
        response = restore_run(host, token, "abc123")
        print(response.message)
    """
    client = get_workspace_client(host, token)
    
    client.experiments.restore_run(run_id=run_id)
    
    return UpdateRunResponse(
        message="Run restored successfully"
    )


def search_experiment_runs(
    host: str,
    token: str,
    experiment_ids: Optional[List[str]] = None,
    filter: Optional[str] = None,
    max_results: int = 1000,
    order_by: Optional[List[str]] = None,
    page_token: Optional[str] = None,
) -> SearchRunsResponse:
    """
    Search for MLflow runs.
    
    Searches for runs that satisfy filter expressions. Can filter by metrics,
    parameters, tags, and run attributes.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        experiment_ids: List of experiment IDs to search
        filter: Filter expression (e.g., "metrics.accuracy > 0.9")
        max_results: Maximum results to return (default: 1000)
        order_by: List of order by expressions
        page_token: Pagination token
        
    Returns:
        SearchRunsResponse with matching runs
        
    Example:
        # Search by metric
        response = search_runs(
            host, token,
            experiment_ids=["12345"],
            filter="metrics.accuracy > 0.9"
        )
        
        # Complex filter with ordering
        response = search_runs(
            host, token,
            filter="metrics.rmse < 1 AND params.model_class = 'LogisticRegression'",
            order_by=["metrics.accuracy DESC"]
        )
    """
    client = get_workspace_client(host, token)
    
    runs = []
    next_token = None
    
    for run in client.experiments.search_runs(
        experiment_ids=experiment_ids,
        filter=filter,
        max_results=max_results,
        order_by=order_by,
        page_token=page_token,
    ):
        runs.append(_convert_to_run_model(run))
    
    return SearchRunsResponse(
        runs=runs,
        next_page_token=next_token,
    )


# ============================================================================
# Logging Operations
# ============================================================================

def log_metric(
    host: str,
    token: str,
    run_id: str,
    key: str,
    value: float,
    timestamp: Optional[int] = None,
    step: Optional[int] = None,
) -> LogMetricResponse:
    """
    Log a metric to an MLflow run.
    
    Logs a metric value for a run. Metrics are numeric values that track model
    performance (e.g., accuracy, loss, RMSE).
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: ID of the run
        key: Metric name
        value: Metric value
        timestamp: Unix timestamp in milliseconds (optional)
        step: Training step number (optional)
        
    Returns:
        LogMetricResponse confirming logging
        
    Example:
        # Log simple metric
        response = log_metric(
            host, token,
            run_id="abc123",
            key="accuracy",
            value=0.95
        )
        
        # Log metric with step
        response = log_metric(
            host, token,
            run_id="abc123",
            key="loss",
            value=0.12,
            step=100
        )
    """
    client = get_workspace_client(host, token)
    
    client.experiments.log_metric(
        run_id=run_id,
        key=key,
        value=value,
        timestamp=timestamp,
        step=step,
    )
    
    return LogMetricResponse()


def log_param(
    host: str,
    token: str,
    run_id: str,
    key: str,
    value: str,
) -> LogParamResponse:
    """
    Log a parameter to an MLflow run.
    
    Logs a parameter for a run. Parameters are input values to model training
    (e.g., learning_rate, max_depth, n_estimators).
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: ID of the run
        key: Parameter name
        value: Parameter value
        
    Returns:
        LogParamResponse confirming logging
        
    Example:
        # Log model hyperparameters
        log_param(host, token, run_id="abc123", key="learning_rate", value="0.01")
        log_param(host, token, run_id="abc123", key="max_depth", value="10")
        log_param(host, token, run_id="abc123", key="n_estimators", value="100")
    """
    client = get_workspace_client(host, token)
    
    client.experiments.log_param(
        run_id=run_id,
        key=key,
        value=value,
    )
    
    return LogParamResponse()


# ============================================================================
# Tag Management
# ============================================================================

def set_experiment_tag(
    host: str,
    token: str,
    experiment_id: str,
    key: str,
    value: str,
) -> SetExperimentTagResponse:
    """
    Set a tag on an MLflow experiment.
    
    Sets or updates a tag on an experiment. Tags are metadata for organizing
    and filtering experiments.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        experiment_id: ID of the experiment
        key: Tag key (up to 250 bytes)
        value: Tag value (up to 64KB)
        
    Returns:
        SetExperimentTagResponse confirming tag set
        
    Example:
        # Set experiment tags
        set_experiment_tag(host, token, "12345", "team", "ml-team")
        set_experiment_tag(host, token, "12345", "project", "fraud-detection")
        set_experiment_tag(host, token, "12345", "version", "v2")
    """
    client = get_workspace_client(host, token)
    
    client.experiments.set_experiment_tag(
        experiment_id=experiment_id,
        key=key,
        value=value,
    )
    
    return SetExperimentTagResponse()


def set_run_tag(
    host: str,
    token: str,
    run_id: str,
    key: str,
    value: str,
) -> SetRunTagResponse:
    """
    Set a tag on an MLflow run.
    
    Sets or updates a tag on a run. Tags are metadata that can be set during
    or after a run completes.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: ID of the run
        key: Tag key (up to 250 bytes)
        value: Tag value (up to 64KB)
        
    Returns:
        SetRunTagResponse confirming tag set
        
    Example:
        # Set run tags
        set_run_tag(host, token, "abc123", "model_type", "xgboost")
        set_run_tag(host, token, "abc123", "production", "true")
        set_run_tag(host, token, "abc123", "reviewer", "data-scientist@company.com")
    """
    client = get_workspace_client(host, token)
    
    client.experiments.set_tag(
        run_id=run_id,
        key=key,
        value=value,
    )
    
    return SetRunTagResponse()


def delete_run_tag(
    host: str,
    token: str,
    run_id: str,
    key: str,
) -> SetRunTagResponse:
    """
    Delete a tag from an MLflow run.
    
    Removes a tag from a run. This is useful for cleaning up obsolete or
    incorrect tags.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: ID of the run
        key: Tag key to delete
        
    Returns:
        SetRunTagResponse confirming deletion
        
    Example:
        # Delete a run tag
        response = delete_run_tag(host, token, "abc123", "outdated_tag")
        print(response.message)
    """
    client = get_workspace_client(host, token)
    
    client.experiments.delete_tag(
        run_id=run_id,
        key=key,
    )
    
    return SetRunTagResponse(
        message="Run tag deleted successfully"
    )

