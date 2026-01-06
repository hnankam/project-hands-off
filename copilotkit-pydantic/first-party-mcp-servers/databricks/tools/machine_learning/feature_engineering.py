"""
Feature Engineering Tools

This module provides tools for managing features, Kafka configurations, and
materialized features in Databricks. Features can be computed from batch or
streaming data sources, and materialized features provide pre-computed values
for efficient model serving.
"""

from typing import Optional, List, Dict, Any
from cache import get_workspace_client
from models import (
    FeatureModel,
    KafkaConfigModel,
    MaterializedFeatureModel,
    ListFeaturesResponse,
    CreateFeatureResponse,
    UpdateFeatureResponse,
    DeleteFeatureResponse,
    ListKafkaConfigsResponse,
    CreateKafkaConfigResponse,
    UpdateKafkaConfigResponse,
    DeleteKafkaConfigResponse,
    ListMaterializedFeaturesResponse,
    CreateMaterializedFeatureResponse,
    BatchCreateMaterializedFeaturesResponse,
    UpdateMaterializedFeatureResponse,
    DeleteMaterializedFeatureResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_feature(feature) -> FeatureModel:
    """Convert SDK Feature to Pydantic model."""
    return FeatureModel(
        full_name=feature.full_name if hasattr(feature, 'full_name') else None,
        name=feature.name if hasattr(feature, 'name') else None,
        description=feature.description if hasattr(feature, 'description') else None,
        data_type=feature.data_type if hasattr(feature, 'data_type') else None,
        feature_type=feature.feature_type if hasattr(feature, 'feature_type') else None,
        kafka_config_name=feature.kafka_config_name if hasattr(feature, 'kafka_config_name') else None,
        creation_time=feature.creation_time if hasattr(feature, 'creation_time') else None,
        last_updated_time=feature.last_updated_time if hasattr(feature, 'last_updated_time') else None,
    )


def _convert_to_kafka_config(config) -> KafkaConfigModel:
    """Convert SDK KafkaConfig to Pydantic model."""
    return KafkaConfigModel(
        name=config.name if hasattr(config, 'name') else None,
        topic=config.topic if hasattr(config, 'topic') else None,
        bootstrap_servers=config.bootstrap_servers if hasattr(config, 'bootstrap_servers') else None,
        security_protocol=config.security_protocol if hasattr(config, 'security_protocol') else None,
        sasl_mechanism=config.sasl_mechanism if hasattr(config, 'sasl_mechanism') else None,
        creation_time=config.creation_time if hasattr(config, 'creation_time') else None,
        last_updated_time=config.last_updated_time if hasattr(config, 'last_updated_time') else None,
    )


def _convert_to_materialized_feature(mat_feature) -> MaterializedFeatureModel:
    """Convert SDK MaterializedFeature to Pydantic model."""
    return MaterializedFeatureModel(
        materialized_feature_id=mat_feature.materialized_feature_id if hasattr(mat_feature, 'materialized_feature_id') else None,
        feature_name=mat_feature.feature_name if hasattr(mat_feature, 'feature_name') else None,
        pipeline_state=mat_feature.pipeline_state if hasattr(mat_feature, 'pipeline_state') else None,
        schedule=mat_feature.schedule if hasattr(mat_feature, 'schedule') else None,
        destination_table=mat_feature.destination_table if hasattr(mat_feature, 'destination_table') else None,
        creation_time=mat_feature.creation_time if hasattr(mat_feature, 'creation_time') else None,
        last_updated_time=mat_feature.last_updated_time if hasattr(mat_feature, 'last_updated_time') else None,
    )


# ============================================================================
# Feature Management
# ============================================================================

def list_features(
    host_credential_key: str,
    token_credential_key: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListFeaturesResponse:
    """
    List features.
    
    Retrieves all feature definitions in the workspace.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        page_size: Maximum results per page
        page_token: Pagination token
        
    Returns:
        ListFeaturesResponse with features
        
    Example:
        # List all features
        response = list_features(host, token)
        for feature in response.features:
            print(f"{feature.full_name}")
            print(f"  Type: {feature.feature_type}")
            print(f"  Data Type: {feature.data_type}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    features = []
    next_token = None
    
    for feature in client.feature_engineering.list_features(
        page_size=page_size,
        page_token=page_token,
    ):
        features.append(_convert_to_feature(feature))
    
    return ListFeaturesResponse(
        features=features,
        next_page_token=next_token,
    )


def get_feature(
    host_credential_key: str,
    token_credential_key: str,
    full_name: str,
) -> FeatureModel:
    """
    Get a feature.
    
    Retrieves detailed information about a specific feature.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        full_name: Full feature name (catalog.schema.table.column)
        
    Returns:
        FeatureModel with feature details
        
    Example:
        # Get feature details
        feature = get_feature(
            host, token,
            full_name="main.ml_features.user_features.age"
        )
        print(f"Name: {feature.name}")
        print(f"Type: {feature.feature_type}")
        print(f"Description: {feature.description}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    feature = client.feature_engineering.get_feature(full_name=full_name)
    
    return _convert_to_feature(feature)


def create_feature(
    host_credential_key: str,
    token_credential_key: str,
    full_name: str,
    feature_type: str,
    data_type: str,
    description: Optional[str] = None,
    kafka_config_name: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> CreateFeatureResponse:
    """
    Create a feature.
    
    Creates a new feature definition. Features can be computed from batch
    tables or streaming Kafka sources.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        full_name: Full feature name (catalog.schema.table.column)
        feature_type: Feature type (BATCH or STREAMING)
        data_type: Feature data type
        description: Feature description (optional)
        kafka_config_name: Kafka config name for streaming features (optional)
        config: Additional configuration (optional)
        
    Returns:
        CreateFeatureResponse with created feature
        
    Example:
        # Create batch feature
        response = create_feature(
            host, token,
            full_name="main.ml_features.user_features.total_purchases",
            feature_type="BATCH",
            data_type="DOUBLE",
            description="Total user purchases"
        )
        
        # Create streaming feature
        response = create_feature(
            host, token,
            full_name="main.ml_features.realtime.click_count",
            feature_type="STREAMING",
            data_type="LONG",
            kafka_config_name="clickstream_kafka",
            description="Real-time click count"
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.ml import Feature
    
    feature_spec = Feature(
        full_name=full_name,
        feature_type=feature_type,
        data_type=data_type,
        description=description,
        kafka_config_name=kafka_config_name,
    )
    
    if config:
        for key, value in config.items():
            setattr(feature_spec, key, value)
    
    feature = client.feature_engineering.create_feature(feature=feature_spec)
    
    return CreateFeatureResponse(
        feature=_convert_to_feature(feature),
    )


def update_feature(
    host_credential_key: str,
    token_credential_key: str,
    full_name: str,
    update_mask: str,
    description: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> UpdateFeatureResponse:
    """
    Update a feature.
    
    Updates feature metadata such as description.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        full_name: Full feature name
        update_mask: Comma-separated list of fields to update
        description: Updated description (optional)
        config: Updated configuration (optional)
        
    Returns:
        UpdateFeatureResponse with updated feature
        
    Example:
        # Update feature description
        response = update_feature(
            host, token,
            full_name="main.ml_features.user_features.age",
            update_mask="description",
            description="User age in years"
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.ml import Feature
    
    feature_spec = Feature(
        full_name=full_name,
        description=description,
    )
    
    if config:
        for key, value in config.items():
            setattr(feature_spec, key, value)
    
    feature = client.feature_engineering.update_feature(
        full_name=full_name,
        feature=feature_spec,
        update_mask=update_mask,
    )
    
    return UpdateFeatureResponse(
        feature=_convert_to_feature(feature),
    )


def delete_feature(
    host_credential_key: str,
    token_credential_key: str,
    full_name: str,
) -> DeleteFeatureResponse:
    """
    Delete a feature.
    
    Deletes a feature definition. This does not delete the underlying data.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        full_name: Full feature name
        
    Returns:
        DeleteFeatureResponse confirming deletion
        
    Example:
        # Delete feature
        response = delete_feature(
            host, token,
            full_name="main.ml_features.user_features.deprecated_feature"
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.feature_engineering.delete_feature(full_name=full_name)
    
    return DeleteFeatureResponse(
        full_name=full_name,
    )


# ============================================================================
# Kafka Config Management
# ============================================================================

def list_kafka_configs(
    host_credential_key: str,
    token_credential_key: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListKafkaConfigsResponse:
    """
    List Kafka configs.
    
    Retrieves all Kafka configurations for streaming features.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        page_size: Maximum results per page
        page_token: Pagination token
        
    Returns:
        ListKafkaConfigsResponse with Kafka configs
        
    Example:
        # List all Kafka configs
        response = list_kafka_configs(host, token)
        for config in response.kafka_configs:
            print(f"{config.name}")
            print(f"  Topic: {config.topic}")
            print(f"  Servers: {config.bootstrap_servers}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    configs = []
    next_token = None
    
    for config in client.feature_engineering.list_kafka_configs(
        page_size=page_size,
        page_token=page_token,
    ):
        configs.append(_convert_to_kafka_config(config))
    
    return ListKafkaConfigsResponse(
        kafka_configs=configs,
        next_page_token=next_token,
    )


def get_kafka_config(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> KafkaConfigModel:
    """
    Get a Kafka config.
    
    Retrieves detailed information about a Kafka configuration.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Kafka config name
        
    Returns:
        KafkaConfigModel with config details
        
    Example:
        # Get Kafka config
        config = get_kafka_config(host, token, "clickstream_kafka")
        print(f"Topic: {config.topic}")
        print(f"Bootstrap servers: {config.bootstrap_servers}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    config = client.feature_engineering.get_kafka_config(name=name)
    
    return _convert_to_kafka_config(config)


def create_kafka_config(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    topic: str,
    bootstrap_servers: str,
    security_protocol: Optional[str] = None,
    sasl_mechanism: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> CreateKafkaConfigResponse:
    """
    Create a Kafka config.
    
    Creates a Kafka configuration for streaming features. This config can be
    referenced by streaming features to consume data from Kafka topics.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Unique config name
        topic: Kafka topic name
        bootstrap_servers: Comma-separated Kafka bootstrap servers
        security_protocol: Security protocol (optional)
        sasl_mechanism: SASL mechanism (optional)
        config: Additional configuration (optional)
        
    Returns:
        CreateKafkaConfigResponse with created config
        
    Example:
        # Create Kafka config
        response = create_kafka_config(
            host, token,
            name="clickstream_kafka",
            topic="user_clicks",
            bootstrap_servers="kafka1.example.com:9092,kafka2.example.com:9092",
            security_protocol="SASL_SSL",
            sasl_mechanism="PLAIN"
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.ml import KafkaConfig
    
    kafka_spec = KafkaConfig(
        name=name,
        topic=topic,
        bootstrap_servers=bootstrap_servers,
        security_protocol=security_protocol,
        sasl_mechanism=sasl_mechanism,
    )
    
    if config:
        for key, value in config.items():
            setattr(kafka_spec, key, value)
    
    kafka_config = client.feature_engineering.create_kafka_config(
        kafka_config=kafka_spec
    )
    
    return CreateKafkaConfigResponse(
        kafka_config=_convert_to_kafka_config(kafka_config),
    )


def update_kafka_config(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    update_mask: List[str],
    topic: Optional[str] = None,
    bootstrap_servers: Optional[str] = None,
    security_protocol: Optional[str] = None,
    sasl_mechanism: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> UpdateKafkaConfigResponse:
    """
    Update a Kafka config.
    
    Updates Kafka configuration settings.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Kafka config name
        update_mask: List of fields to update
        topic: Updated topic (optional)
        bootstrap_servers: Updated servers (optional)
        security_protocol: Updated protocol (optional)
        sasl_mechanism: Updated SASL mechanism (optional)
        config: Updated configuration (optional)
        
    Returns:
        UpdateKafkaConfigResponse with updated config
        
    Example:
        # Update Kafka servers
        response = update_kafka_config(
            host, token,
            name="clickstream_kafka",
            update_mask=["bootstrap_servers"],
            bootstrap_servers="new-kafka1.example.com:9092"
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.ml import KafkaConfig, FieldMask
    
    kafka_spec = KafkaConfig(
        name=name,
        topic=topic,
        bootstrap_servers=bootstrap_servers,
        security_protocol=security_protocol,
        sasl_mechanism=sasl_mechanism,
    )
    
    if config:
        for key, value in config.items():
            setattr(kafka_spec, key, value)
    
    field_mask = FieldMask(paths=update_mask)
    
    kafka_config = client.feature_engineering.update_kafka_config(
        name=name,
        kafka_config=kafka_spec,
        update_mask=field_mask,
    )
    
    return UpdateKafkaConfigResponse(
        kafka_config=_convert_to_kafka_config(kafka_config),
    )


def delete_kafka_config(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> DeleteKafkaConfigResponse:
    """
    Delete a Kafka config.
    
    Deletes a Kafka configuration. Features using this config must be deleted first.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Kafka config name
        
    Returns:
        DeleteKafkaConfigResponse confirming deletion
        
    Example:
        # Delete Kafka config
        response = delete_kafka_config(host, token, "old_kafka_config")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.feature_engineering.delete_kafka_config(name=name)
    
    return DeleteKafkaConfigResponse(
        name=name,
    )


# ============================================================================
# Materialized Feature Management
# ============================================================================

def list_materialized_features(
    host_credential_key: str,
    token_credential_key: str,
    feature_name: Optional[str] = None,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListMaterializedFeaturesResponse:
    """
    List materialized features.
    
    Retrieves materialized features, optionally filtered by source feature.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        feature_name: Filter by source feature name (optional)
        page_size: Maximum results per page
        page_token: Pagination token
        
    Returns:
        ListMaterializedFeaturesResponse with materialized features
        
    Example:
        # List all materialized features
        response = list_materialized_features(host, token)
        for mat_feature in response.materialized_features:
            print(f"{mat_feature.feature_name}")
            print(f"  State: {mat_feature.pipeline_state}")
            print(f"  Destination: {mat_feature.destination_table}")
        
        # List for specific feature
        response = list_materialized_features(
            host, token,
            feature_name="main.ml_features.user_features.age"
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    mat_features = []
    next_token = None
    
    for mat_feature in client.feature_engineering.list_materialized_features(
        feature_name=feature_name,
        page_size=page_size,
        page_token=page_token,
    ):
        mat_features.append(_convert_to_materialized_feature(mat_feature))
    
    return ListMaterializedFeaturesResponse(
        materialized_features=mat_features,
        next_page_token=next_token,
    )


def get_materialized_feature(
    host_credential_key: str,
    token_credential_key: str,
    materialized_feature_id: str,
) -> MaterializedFeatureModel:
    """
    Get a materialized feature.
    
    Retrieves detailed information about a materialized feature.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        materialized_feature_id: Materialized feature ID
        
    Returns:
        MaterializedFeatureModel with details
        
    Example:
        # Get materialized feature
        mat_feature = get_materialized_feature(host, token, "mat-123")
        print(f"Source: {mat_feature.feature_name}")
        print(f"State: {mat_feature.pipeline_state}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    mat_feature = client.feature_engineering.get_materialized_feature(
        materialized_feature_id=materialized_feature_id
    )
    
    return _convert_to_materialized_feature(mat_feature)


def create_materialized_feature(
    host_credential_key: str,
    token_credential_key: str,
    feature_name: str,
    destination_table: str,
    schedule: Optional[str] = None,
    pipeline_state: str = "ACTIVE",
    config: Optional[Dict[str, Any]] = None,
) -> CreateMaterializedFeatureResponse:
    """
    Create a materialized feature.
    
    Creates a materialized feature that pre-computes and stores feature values
    for efficient serving.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        feature_name: Source feature name
        destination_table: Destination table for materialized values
        schedule: Refresh schedule (optional, e.g., "0 0 * * *" for daily)
        pipeline_state: Pipeline state (ACTIVE or PAUSED)
        config: Additional configuration (optional)
        
    Returns:
        CreateMaterializedFeatureResponse with created materialized feature
        
    Example:
        # Create materialized feature with daily refresh
        response = create_materialized_feature(
            host, token,
            feature_name="main.ml_features.user_features.total_purchases",
            destination_table="main.ml_features.user_purchases_materialized",
            schedule="0 0 * * *",  # Daily at midnight
            pipeline_state="ACTIVE"
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.ml import MaterializedFeature
    
    mat_spec = MaterializedFeature(
        feature_name=feature_name,
        destination_table=destination_table,
        schedule=schedule,
        pipeline_state=pipeline_state,
    )
    
    if config:
        for key, value in config.items():
            setattr(mat_spec, key, value)
    
    mat_feature = client.feature_engineering.create_materialized_feature(
        materialized_feature=mat_spec
    )
    
    return CreateMaterializedFeatureResponse(
        materialized_feature=_convert_to_materialized_feature(mat_feature),
    )


def batch_create_materialized_features(
    host_credential_key: str,
    token_credential_key: str,
    requests: List[Dict[str, Any]],
) -> BatchCreateMaterializedFeaturesResponse:
    """
    Batch create materialized features.
    
    Creates multiple materialized features in a single operation.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        requests: List of materialized feature requests, each containing:
            - feature_name: Source feature name
            - destination_table: Destination table
            - schedule: Refresh schedule (optional)
            - pipeline_state: Pipeline state (optional)
        
    Returns:
        BatchCreateMaterializedFeaturesResponse with created features
        
    Example:
        # Batch create materialized features
        response = batch_create_materialized_features(
            host, token,
            requests=[
                {
                    "feature_name": "main.ml_features.user_features.age",
                    "destination_table": "main.ml_features.age_mat",
                    "schedule": "0 0 * * *"
                },
                {
                    "feature_name": "main.ml_features.user_features.purchases",
                    "destination_table": "main.ml_features.purchases_mat",
                    "schedule": "0 */6 * * *"  # Every 6 hours
                }
            ]
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.ml import CreateMaterializedFeatureRequest
    
    request_objects = []
    for req in requests:
        request_objects.append(CreateMaterializedFeatureRequest(**req))
    
    result = client.feature_engineering.batch_create_materialized_features(
        requests=request_objects
    )
    
    mat_features = []
    if hasattr(result, 'materialized_features') and result.materialized_features:
        for mat_feature in result.materialized_features:
            mat_features.append(_convert_to_materialized_feature(mat_feature))
    
    return BatchCreateMaterializedFeaturesResponse(
        materialized_features=mat_features,
    )


def update_materialized_feature(
    host_credential_key: str,
    token_credential_key: str,
    materialized_feature_id: str,
    update_mask: str,
    pipeline_state: Optional[str] = None,
    schedule: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> UpdateMaterializedFeatureResponse:
    """
    Update a materialized feature.
    
    Updates materialized feature configuration. Commonly used to pause/resume
    the materialization pipeline.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        materialized_feature_id: Materialized feature ID
        update_mask: Comma-separated list of fields to update
        pipeline_state: Updated state (ACTIVE or PAUSED)
        schedule: Updated schedule (optional)
        config: Updated configuration (optional)
        
    Returns:
        UpdateMaterializedFeatureResponse with updated feature
        
    Example:
        # Pause materialized feature
        response = update_materialized_feature(
            host, token,
            materialized_feature_id="mat-123",
            update_mask="pipeline_state",
            pipeline_state="PAUSED"
        )
        
        # Resume and update schedule
        response = update_materialized_feature(
            host, token,
            materialized_feature_id="mat-123",
            update_mask="pipeline_state,schedule",
            pipeline_state="ACTIVE",
            schedule="0 */12 * * *"  # Every 12 hours
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.ml import MaterializedFeature
    
    mat_spec = MaterializedFeature(
        materialized_feature_id=materialized_feature_id,
        pipeline_state=pipeline_state,
        schedule=schedule,
    )
    
    if config:
        for key, value in config.items():
            setattr(mat_spec, key, value)
    
    mat_feature = client.feature_engineering.update_materialized_feature(
        materialized_feature_id=materialized_feature_id,
        materialized_feature=mat_spec,
        update_mask=update_mask,
    )
    
    return UpdateMaterializedFeatureResponse(
        materialized_feature=_convert_to_materialized_feature(mat_feature),
    )


def delete_materialized_feature(
    host_credential_key: str,
    token_credential_key: str,
    materialized_feature_id: str,
) -> DeleteMaterializedFeatureResponse:
    """
    Delete a materialized feature.
    
    Deletes a materialized feature pipeline. The destination table is not deleted.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        materialized_feature_id: Materialized feature ID
        
    Returns:
        DeleteMaterializedFeatureResponse confirming deletion
        
    Example:
        # Delete materialized feature
        response = delete_materialized_feature(host, token, "mat-123")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.feature_engineering.delete_materialized_feature(
        materialized_feature_id=materialized_feature_id
    )
    
    return DeleteMaterializedFeatureResponse(
        materialized_feature_id=materialized_feature_id,
    )

