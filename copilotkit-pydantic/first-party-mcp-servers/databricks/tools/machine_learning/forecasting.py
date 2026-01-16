"""
Forecasting Tools

This module provides tools for creating and managing serverless forecasting experiments
in Databricks. The Forecasting API enables automated time series forecasting with
support for multiple frameworks (Prophet, ARIMA, DeepAR).
"""

from typing import Optional, List
from cache import get_workspace_client
from models import (
    ForecastingExperimentModel,
    CreateForecastingExperimentResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_forecasting_experiment(experiment) -> ForecastingExperimentModel:
    """Convert SDK ForecastingExperiment to Pydantic model."""
    return ForecastingExperimentModel(
        experiment_id=experiment.experiment_id,
        state=experiment.state.value if hasattr(experiment, 'state') and experiment.state else None,
        train_data_path=experiment.train_data_path if hasattr(experiment, 'train_data_path') else None,
        target_column=experiment.target_column if hasattr(experiment, 'target_column') else None,
        time_column=experiment.time_column if hasattr(experiment, 'time_column') else None,
        forecast_granularity=experiment.forecast_granularity if hasattr(experiment, 'forecast_granularity') else None,
        forecast_horizon=experiment.forecast_horizon if hasattr(experiment, 'forecast_horizon') else None,
        experiment_path=experiment.experiment_path if hasattr(experiment, 'experiment_path') else None,
        prediction_data_path=experiment.prediction_data_path if hasattr(experiment, 'prediction_data_path') else None,
        register_to=experiment.register_to if hasattr(experiment, 'register_to') else None,
        primary_metric=experiment.primary_metric if hasattr(experiment, 'primary_metric') else None,
        timeseries_identifier_columns=experiment.timeseries_identifier_columns if hasattr(experiment, 'timeseries_identifier_columns') else None,
        training_frameworks=experiment.training_frameworks if hasattr(experiment, 'training_frameworks') else None,
        start_time=experiment.start_time if hasattr(experiment, 'start_time') else None,
        end_time=experiment.end_time if hasattr(experiment, 'end_time') else None,
        error_message=experiment.error_message if hasattr(experiment, 'error_message') else None,
    )


# ============================================================================
# Forecasting Experiments
# ============================================================================

def create_forecasting_experiment(
    host_credential_key: str,
    token_credential_key: str,
    train_data_path: str,
    target_column: str,
    time_column: str,
    forecast_granularity: str,
    forecast_horizon: int,
    experiment_path: Optional[str] = None,
    prediction_data_path: Optional[str] = None,
    future_feature_data_path: Optional[str] = None,
    register_to: Optional[str] = None,
    primary_metric: Optional[str] = None,
    timeseries_identifier_columns: Optional[List[str]] = None,
    include_features: Optional[List[str]] = None,
    training_frameworks: Optional[List[str]] = None,
    split_column: Optional[str] = None,
    custom_weights_column: Optional[str] = None,
    holiday_regions: Optional[List[str]] = None,
    max_runtime: Optional[int] = None,
    wait_for_completion: bool = False,
) -> CreateForecastingExperimentResponse:
    """
    Create a serverless forecasting experiment.
    
    Creates an automated time series forecasting experiment that trains multiple
    models and selects the best one. Supports Prophet, ARIMA, and DeepAR frameworks.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        train_data_path: Unity Catalog table path (catalog.schema.table)
        target_column: Column to predict
        time_column: Timestamp column
        forecast_granularity: Time interval ('Daily', 'Hourly', etc.)
        forecast_horizon: Number of steps to forecast
        experiment_path: Workspace path for experiment (optional)
        prediction_data_path: Output path for predictions (optional)
        future_feature_data_path: Future feature data path (optional)
        register_to: Unity Catalog model path (optional)
        primary_metric: Evaluation metric (optional)
        timeseries_identifier_columns: Grouping columns (optional)
        include_features: Feature columns to include (optional)
        training_frameworks: Frameworks to use (optional, defaults to all)
        split_column: Custom split column (optional)
        custom_weights_column: Custom weights column (optional)
        holiday_regions: Holiday region codes (optional)
        max_runtime: Max runtime in minutes (optional)
        wait_for_completion: Wait for experiment to finish (default: False)
        
    Returns:
        CreateForecastingExperimentResponse with experiment ID
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    if wait_for_completion:
        # Use the blocking version that waits for completion
        experiment = client.forecasting.create_experiment_and_wait(
            train_data_path=train_data_path,
            target_column=target_column,
            time_column=time_column,
            forecast_granularity=forecast_granularity,
            forecast_horizon=forecast_horizon,
            experiment_path=experiment_path,
            prediction_data_path=prediction_data_path,
            future_feature_data_path=future_feature_data_path,
            register_to=register_to,
            primary_metric=primary_metric,
            timeseries_identifier_columns=timeseries_identifier_columns,
            include_features=include_features,
            training_frameworks=training_frameworks,
            split_column=split_column,
            custom_weights_column=custom_weights_column,
            holiday_regions=holiday_regions,
            max_runtime=max_runtime,
        )
    else:
        # Use the non-blocking version
        experiment = client.forecasting.create_experiment(
            train_data_path=train_data_path,
            target_column=target_column,
            time_column=time_column,
            forecast_granularity=forecast_granularity,
            forecast_horizon=forecast_horizon,
            experiment_path=experiment_path,
            prediction_data_path=prediction_data_path,
            future_feature_data_path=future_feature_data_path,
            register_to=register_to,
            primary_metric=primary_metric,
            timeseries_identifier_columns=timeseries_identifier_columns,
            include_features=include_features,
            training_frameworks=training_frameworks,
            split_column=split_column,
            custom_weights_column=custom_weights_column,
            holiday_regions=holiday_regions,
            max_runtime=max_runtime,
        )
        # For long-running operations, we need to wait for the result
        experiment = experiment.result()
    
    return CreateForecastingExperimentResponse(
        experiment_id=experiment.experiment_id,
    )
    except Exception as e:
        return CreateForecastingExperimentResponse(
            experiment_id=None,
            error_message=f"Failed to create forecasting experiment: {str(e)}",
        )


def get_forecasting_experiment(
    host_credential_key: str,
    token_credential_key: str,
    experiment_id: str,
) -> Optional[ForecastingExperimentModel]:
    """
    Get a forecasting experiment by ID.
    
    Retrieves detailed information about a forecasting experiment, including
    its state, configuration, and results.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        experiment_id: Experiment ID
        
    Returns:
        ForecastingExperimentModel with experiment details, or None on error
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    experiment = client.forecasting.get_experiment(experiment_id=experiment_id)
    
    return _convert_to_forecasting_experiment(experiment)
    except Exception as e:
        return None

