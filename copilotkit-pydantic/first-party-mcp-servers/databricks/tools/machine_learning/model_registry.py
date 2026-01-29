"""
Model Registry Tools

This module provides tools for managing the Workspace Model Registry in Databricks.
Note: Databricks recommends using Models in Unity Catalog instead, but this provides
backward compatibility for existing Workspace Model Registry workflows.

The Model Registry enables centralized model management including:
- Model versioning and lineage
- Stage-based deployment (None → Staging → Production → Archived)
- Comments and annotations
- Webhooks for automation
"""

from typing import Optional, List, Dict, Any
from cache import get_workspace_client
from models import (
    RegisteredModelModel,
    ModelVersionModel,
    ModelCommentModel,
    TransitionRequestModel,
    WebhookModel,
    ListModelsResponse,
    CreateModelResponse,
    UpdateModelResponse,
    DeleteModelResponse,
    CreateModelVersionResponse,
    UpdateModelVersionResponse,
    DeleteModelVersionResponse,
    ListModelVersionsResponse,
    TransitionStageResponse,
    CreateTransitionRequestResponse,
    ApproveTransitionRequestResponse,
    CreateCommentResponse,
    UpdateCommentResponse,
    DeleteCommentResponse,
    SetTagResponse,
    DeleteTagResponse,
    CreateWebhookResponse,
    UpdateWebhookResponse,
    DeleteWebhookResponse,
    ListWebhooksResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_registered_model(model) -> RegisteredModelModel:
    """Convert SDK RegisteredModel to Pydantic model."""
    tags_list = None
    if hasattr(model, 'tags') and model.tags:
        tags_list = [{"key": tag.key, "value": tag.value} for tag in model.tags]
    
    return RegisteredModelModel(
        name=model.name,
        creation_timestamp=model.creation_timestamp,
        last_updated_timestamp=model.last_updated_timestamp,
        user_id=model.user_id,
        description=model.description,
        tags=tags_list,
    )


def _convert_to_model_version(version) -> ModelVersionModel:
    """Convert SDK ModelVersion to Pydantic model."""
    tags_list = None
    if hasattr(version, 'tags') and version.tags:
        tags_list = [{"key": tag.key, "value": tag.value} for tag in version.tags]
    
    return ModelVersionModel(
        name=version.name,
        version=version.version,
        creation_timestamp=version.creation_timestamp,
        last_updated_timestamp=version.last_updated_timestamp,
        user_id=version.user_id,
        current_stage=version.current_stage,
        description=version.description,
        source=version.source,
        run_id=version.run_id,
        status=version.status.value if hasattr(version, 'status') and version.status else None,
        status_message=version.status_message if hasattr(version, 'status_message') else None,
        tags=tags_list,
    )


def _convert_to_comment(comment) -> ModelCommentModel:
    """Convert SDK comment to Pydantic model."""
    return ModelCommentModel(
        id=comment.id,
        comment=comment.comment,
        user_id=comment.user_id if hasattr(comment, 'user_id') else None,
        creation_timestamp=comment.creation_timestamp if hasattr(comment, 'creation_timestamp') else None,
        last_updated_timestamp=comment.last_updated_timestamp if hasattr(comment, 'last_updated_timestamp') else None,
    )


def _convert_to_transition_request(request) -> TransitionRequestModel:
    """Convert SDK transition request to Pydantic model."""
    return TransitionRequestModel(
        name=request.name if hasattr(request, 'name') else None,
        version=request.version if hasattr(request, 'version') else None,
        stage=request.stage if hasattr(request, 'stage') else None,
        user_id=request.user_id if hasattr(request, 'user_id') else None,
        creation_timestamp=request.creation_timestamp if hasattr(request, 'creation_timestamp') else None,
        status=request.status if hasattr(request, 'status') else None,
        comment=request.comment if hasattr(request, 'comment') else None,
    )


def _convert_to_webhook(webhook) -> WebhookModel:
    """Convert SDK webhook to Pydantic model."""
    events_list = None
    if hasattr(webhook, 'events') and webhook.events:
        events_list = [event.value for event in webhook.events]
    
    return WebhookModel(
        id=webhook.id,
        model_name=webhook.model_name if hasattr(webhook, 'model_name') else None,
        events=events_list,
        description=webhook.description if hasattr(webhook, 'description') else None,
        status=webhook.status.value if hasattr(webhook, 'status') and webhook.status else None,
        creation_timestamp=webhook.creation_timestamp if hasattr(webhook, 'creation_timestamp') else None,
        last_updated_timestamp=webhook.last_updated_timestamp if hasattr(webhook, 'last_updated_timestamp') else None,
    )


# ============================================================================
# Model Management
# ============================================================================

def list_registry_models(
    host_credential_key: str,
    token_credential_key: str,
    max_results: int = 100,
    page_token: Optional[str] = None,
) -> ListModelsResponse:
    """
    List registered models in the Workspace Model Registry.
    
    Retrieves all registered models with their metadata. Use pagination for
    large model catalogs.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        max_results: Maximum results per page (default: 100)
        page_token: Pagination token
        
    Returns:
        ListModelsResponse with registered models
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        models = []
        next_token = None
    
        for model in client.model_registry.list_models(
            max_results=max_results,
            page_token=page_token,
        ):
            models.append(_convert_to_registered_model(model))
    
        return ListModelsResponse(
            models=models,
            next_page_token=next_token,
        )

    except Exception as e:
        return ListModelsResponse(
            models=[],
            next_page_token=None,
            error_message=f"Failed to list registry models: {str(e)}",
        )


def get_registry_model(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> Optional[RegisteredModelModel]:
    """
    Get a registered model by name.
    
    Retrieves detailed information about a specific registered model.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        
    Returns:
        RegisteredModelModel with model details, or None on error
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        model = client.model_registry.get_model(name=name)
    
        return _convert_to_registered_model(model.registered_model_databricks)

    except Exception as e:
        return None


def create_registry_model(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    description: Optional[str] = None,
    tags: Optional[Dict[str, str]] = None,
) -> CreateModelResponse:
    """
    Create a new registered model.
    
    Creates a new model in the registry with the specified name. The name must
    be unique across the workspace.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Unique model name
        description: Optional model description
        tags: Optional tags as key-value pairs
        
    Returns:
        CreateModelResponse with created model
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Convert tags dictionary to list of ModelTag
        tag_list = None
        if tags:
            from databricks.sdk.service.ml import ModelTag
            tag_list = [ModelTag(key=k, value=v) for k, v in tags.items()]
    
        model = client.model_registry.create_model(
            name=name,
            description=description,
            tags=tag_list,
        )
    
        return CreateModelResponse(
            model=_convert_to_registered_model(model.registered_model),
        )

    except Exception as e:
        return CreateModelResponse(
            model=None,
            error_message=f"Failed to create registry model: {str(e)}",
        )


def update_registry_model(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    description: str,
) -> UpdateModelResponse:
    """
    Update a registered model.
    
    Updates the description of a registered model.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        description: New description
        
    Returns:
        UpdateModelResponse confirming update
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.update_model(
            name=name,
            description=description,
        )
    
        return UpdateModelResponse()

    except Exception as e:
        return UpdateModelResponse(
            error_message=f"Failed to update registry model: {str(e)}",
        )


def delete_registry_model(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> DeleteModelResponse:
    """
    Delete a registered model.
    
    Deletes a registered model and all its versions from the registry.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        
    Returns:
        DeleteModelResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.delete_model(name=name)
    
        return DeleteModelResponse(
            model_name=name,
        )

    except Exception as e:
        return DeleteModelResponse(
            model_name=None,
            error_message=f"Failed to delete registry model: {str(e)}",
        )


# ============================================================================
# Model Version Management
# ============================================================================

def create_model_version(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    source: str,
    run_id: Optional[str] = None,
    description: Optional[str] = None,
    tags: Optional[Dict[str, str]] = None,
) -> CreateModelVersionResponse:
    """
    Create a new model version.
    
    Creates a new version of a registered model. The source must point to a
    valid MLflow model artifact location.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        source: URI of model artifacts (e.g., dbfs:/path, s3://bucket/path)
        run_id: Optional MLflow run ID for lineage
        description: Optional version description
        tags: Optional tags as key-value pairs
        
    Returns:
        CreateModelVersionResponse with created version
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Convert tags dictionary to list of ModelVersionTag
        tag_list = None
        if tags:
            from databricks.sdk.service.ml import ModelVersionTag
            tag_list = [ModelVersionTag(key=k, value=v) for k, v in tags.items()]
    
        version = client.model_registry.create_model_version(
            name=name,
            source=source,
            run_id=run_id,
            description=description,
            tags=tag_list,
        )
    
        return CreateModelVersionResponse(
            model_version=_convert_to_model_version(version.model_version),
        )

    except Exception as e:
        return CreateModelVersionResponse(
            model_version=None,
            error_message=f"Failed to create model version: {str(e)}",
        )


def get_model_version(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    version: str,
) -> Optional[ModelVersionModel]:
    """
    Get a specific model version.
    
    Retrieves detailed information about a specific model version.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        version: Version number
        
    Returns:
        ModelVersionModel with version details, or None on error
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        version = client.model_registry.get_model_version(
            name=name,
            version=version,
        )
    
        return _convert_to_model_version(version.model_version)

    except Exception as e:
        return None


def update_model_version(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    version: str,
    description: str,
) -> UpdateModelVersionResponse:
    """
    Update a model version.
    
    Updates the description of a model version.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        version: Version number
        description: New description
        
    Returns:
        UpdateModelVersionResponse confirming update
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.update_model_version(
            name=name,
            version=version,
            description=description,
        )
    
        return UpdateModelVersionResponse()

    except Exception as e:
        return UpdateModelVersionResponse(
            error_message=f"Failed to update model version: {str(e)}",
        )


def delete_model_version(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    version: str,
) -> DeleteModelVersionResponse:
    """
    Delete a model version.
    
    Deletes a specific version of a model from the registry.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        version: Version number
        
    Returns:
        DeleteModelVersionResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.delete_model_version(
            name=name,
            version=version,
        )
    
        return DeleteModelVersionResponse(
            model_name=name,
            version=version,
        )

    except Exception as e:
        return DeleteModelVersionResponse(
            model_name=None,
            version=None,
            error_message=f"Failed to delete model version: {str(e)}",
        )


def search_model_versions(
    host_credential_key: str,
    token_credential_key: str,
    filter: Optional[str] = None,
    max_results: int = 100,
    order_by: Optional[List[str]] = None,
    page_token: Optional[str] = None,
) -> ListModelVersionsResponse:
    """
    Search for model versions.
    
    Searches for model versions matching filter criteria. Supports filtering
    by name, run_id, source_path, and other attributes.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        filter: Filter expression (e.g., "name = 'my-model'")
        max_results: Maximum results per page (default: 100)
        order_by: List of order by expressions
        page_token: Pagination token
        
    Returns:
        ListModelVersionsResponse with matching versions
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        versions = []
        next_token = None
    
        for version in client.model_registry.search_model_versions(
            filter=filter,
            max_results=max_results,
            order_by=order_by,
            page_token=page_token,
        ):
            versions.append(_convert_to_model_version(version))
    
        return ListModelVersionsResponse(
            model_versions=versions,
            next_page_token=next_token,
        )

    except Exception as e:
        return ListModelVersionsResponse(
            model_versions=[],
            next_page_token=None,
            error_message=f"Failed to search model versions: {str(e)}",
        )


def get_latest_model_versions(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    stages: Optional[List[str]] = None,
) -> ListModelVersionsResponse:
    """
    Get latest versions of a model.
    
    Retrieves the latest versions of a model, optionally filtered by stage.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        stages: Optional list of stages (None, Staging, Production, Archived)
        
    Returns:
        ListModelVersionsResponse with latest versions
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        versions = client.model_registry.get_latest_versions(
            name=name,
            stages=stages,
        )
    
        version_list = [_convert_to_model_version(v) for v in versions.model_versions]
    
        return ListModelVersionsResponse(
            model_versions=version_list,
        )

    except Exception as e:
        return ListModelVersionsResponse(
            model_versions=[],
            error_message=f"Failed to get latest model versions: {str(e)}",
        )


# ============================================================================
# Stage Transitions
# ============================================================================

def transition_model_stage(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    version: str,
    stage: str,
    archive_existing_versions: bool = False,
    comment: Optional[str] = None,
) -> TransitionStageResponse:
    """
    Transition a model version to a new stage.
    
    Moves a model version to a different stage in the deployment lifecycle.
    Stages: None → Staging → Production → Archived.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        version: Version number
        stage: Target stage (None, Staging, Production, Archived)
        archive_existing_versions: Archive other versions in target stage
        comment: Optional comment about the transition
        
    Returns:
        TransitionStageResponse with updated version
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        result = client.model_registry.transition_stage(
            name=name,
            version=version,
            stage=stage,
            archive_existing_versions=archive_existing_versions,
            comment=comment,
        )
    
        return TransitionStageResponse(
            model_version=_convert_to_model_version(result.model_version),
        )

    except Exception as e:
        return TransitionStageResponse(
            model_version=None,
            error_message=f"Failed to transition model stage: {str(e)}",
        )


def create_transition_request(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    version: str,
    stage: str,
    comment: Optional[str] = None,
) -> CreateTransitionRequestResponse:
    """
    Create a stage transition request.
    
    Creates a request to transition a model version to a new stage. This
    enables approval workflows for production deployments.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        version: Version number
        stage: Target stage
        comment: Optional comment
        
    Returns:
        CreateTransitionRequestResponse with request details
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        result = client.model_registry.create_transition_request(
            name=name,
            version=version,
            stage=stage,
            comment=comment,
        )
    
        return CreateTransitionRequestResponse(
            request=_convert_to_transition_request(result.request) if hasattr(result, 'request') else TransitionRequestModel(),
        )

    except Exception as e:
        return CreateTransitionRequestResponse(
            request=None,
            error_message=f"Failed to create transition request: {str(e)}",
        )


def approve_transition_request(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    version: str,
    stage: str,
    archive_existing_versions: bool = False,
    comment: Optional[str] = None,
) -> ApproveTransitionRequestResponse:
    """
    Approve a stage transition request.
    
    Approves a pending transition request, moving the model version to the
    requested stage.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        version: Version number
        stage: Target stage
        archive_existing_versions: Archive other versions in target stage
        comment: Optional approval comment
        
    Returns:
        ApproveTransitionRequestResponse confirming approval
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.approve_transition_request(
            name=name,
            version=version,
            stage=stage,
            archive_existing_versions=archive_existing_versions,
            comment=comment,
        )
    
        return ApproveTransitionRequestResponse()

    except Exception as e:
        return ApproveTransitionRequestResponse(
            error_message=f"Failed to approve transition request: {str(e)}",
        )


def reject_transition_request(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    version: str,
    stage: str,
    comment: Optional[str] = None,
) -> ApproveTransitionRequestResponse:
    """
    Reject a stage transition request.
    
    Rejects a pending transition request, preventing the stage change.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        version: Version number
        stage: Requested stage
        comment: Optional rejection reason
        
    Returns:
        ApproveTransitionRequestResponse confirming rejection
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.reject_transition_request(
            name=name,
            version=version,
            stage=stage,
            comment=comment,
        )
    
        return ApproveTransitionRequestResponse(
            message="Transition request rejected successfully"
        )

    except Exception as e:
        return ApproveTransitionRequestResponse(
            error_message=f"Failed to reject transition request: {str(e)}",
        )


# ============================================================================
# Comments
# ============================================================================

def create_model_comment(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    version: str,
    comment: str,
) -> CreateCommentResponse:
    """
    Create a comment on a model version.
    
    Adds a comment to a model version for documentation, testing notes, or
    deployment information.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        version: Version number
        comment: Comment text
        
    Returns:
        CreateCommentResponse with created comment
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        result = client.model_registry.create_comment(
            name=name,
            version=version,
            comment=comment,
        )
    
        return CreateCommentResponse(
            comment=_convert_to_comment(result.comment),
        )

    except Exception as e:
        return CreateCommentResponse(
            comment=None,
            error_message=f"Failed to create model comment: {str(e)}",
        )


def update_model_comment(
    host_credential_key: str,
    token_credential_key: str,
    comment_id: str,
    comment: str,
) -> UpdateCommentResponse:
    """
    Update a model version comment.
    
    Edits an existing comment on a model version.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        comment_id: Comment ID
        comment: Updated comment text
        
    Returns:
        UpdateCommentResponse confirming update
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.update_comment(
            id=comment_id,
            comment=comment,
        )
    
        return UpdateCommentResponse()

    except Exception as e:
        return UpdateCommentResponse(
            error_message=f"Failed to update model comment: {str(e)}",
        )


def delete_model_comment(
    host_credential_key: str,
    token_credential_key: str,
    comment_id: str,
) -> DeleteCommentResponse:
    """
    Delete a model version comment.
    
    Removes a comment from a model version.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        comment_id: Comment ID
        
    Returns:
        DeleteCommentResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.delete_comment(id=comment_id)
    
        return DeleteCommentResponse(
            comment_id=comment_id,
        )

    except Exception as e:
        return DeleteCommentResponse(
            comment_id=None,
            error_message=f"Failed to delete model comment: {str(e)}",
        )


# ============================================================================
# Tags
# ============================================================================

def set_model_tag(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    key: str,
    value: str,
) -> SetTagResponse:
    """
    Set a tag on a registered model.
    
    Adds or updates a tag on a registered model for organization and filtering.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        key: Tag key (max 250 bytes)
        value: Tag value (max 5000 bytes)
        
    Returns:
        SetTagResponse confirming tag set
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.set_model_tag(
            name=name,
            key=key,
            value=value,
        )
    
        return SetTagResponse()

    except Exception as e:
        return SetTagResponse(
            error_message=f"Failed to set model tag: {str(e)}",
        )


def delete_model_tag(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    key: str,
) -> DeleteTagResponse:
    """
    Delete a tag from a registered model.
    
    Removes a tag from a registered model.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        key: Tag key to delete
        
    Returns:
        DeleteTagResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.delete_model_tag(
            name=name,
            key=key,
        )
    
        return DeleteTagResponse()

    except Exception as e:
        return DeleteTagResponse(
            error_message=f"Failed to delete model tag: {str(e)}",
        )


def set_model_version_tag(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    version: str,
    key: str,
    value: str,
) -> SetTagResponse:
    """
    Set a tag on a model version.
    
    Adds or updates a tag on a specific model version.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        version: Version number
        key: Tag key (max 250 bytes)
        value: Tag value (max 5000 bytes)
        
    Returns:
        SetTagResponse confirming tag set
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.set_model_version_tag(
            name=name,
            version=version,
            key=key,
            value=value,
        )
    
        return SetTagResponse()

    except Exception as e:
        return SetTagResponse(
            error_message=f"Failed to set model version tag: {str(e)}",
        )


def delete_model_version_tag(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    version: str,
    key: str,
) -> DeleteTagResponse:
    """
    Delete a tag from a model version.
    
    Removes a tag from a specific model version.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Model name
        version: Version number
        key: Tag key to delete
        
    Returns:
        DeleteTagResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.delete_model_version_tag(
            name=name,
            version=version,
            key=key,
        )
    
        return DeleteTagResponse()

    except Exception as e:
        return DeleteTagResponse(
            error_message=f"Failed to delete model version tag: {str(e)}",
        )


# ============================================================================
# Webhooks
# ============================================================================

def create_registry_webhook(
    host_credential_key: str,
    token_credential_key: str,
    events: List[str],
    http_url: Optional[str] = None,
    job_id: Optional[str] = None,
    model_name: Optional[str] = None,
    description: Optional[str] = None,
    status: str = "ACTIVE",
) -> CreateWebhookResponse:
    """
    Create a registry webhook.
    
    Creates a webhook that triggers on model registry events. Can trigger HTTP
    endpoints or Databricks jobs.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        events: List of events (e.g., ["MODEL_VERSION_CREATED"])
        http_url: Optional HTTP endpoint URL
        job_id: Optional Databricks job ID to trigger
        model_name: Optional model name to filter events
        description: Optional description
        status: Webhook status (ACTIVE, DISABLED)
        
    Returns:
        CreateWebhookResponse with created webhook
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Convert events to enum
        from databricks.sdk.service.ml import RegistryWebhookEvent, HttpUrlSpec, JobSpec, RegistryWebhookStatus
    
        event_enums = [RegistryWebhookEvent(event) for event in events]
        status_enum = RegistryWebhookStatus(status)
    
        # Create specs
        http_spec = HttpUrlSpec(url=http_url) if http_url else None
        job_spec = JobSpec(job_id=job_id) if job_id else None
    
        result = client.model_registry.create_webhook(
            events=event_enums,
            http_url_spec=http_spec,
            job_spec=job_spec,
            model_name=model_name,
            description=description,
            status=status_enum,
        )
    
        return CreateWebhookResponse(
            webhook=_convert_to_webhook(result.webhook),
        )

    except Exception as e:
        return CreateWebhookResponse(
            webhook=None,
            error_message=f"Failed to create registry webhook: {str(e)}",
        )


def update_registry_webhook(
    host_credential_key: str,
    token_credential_key: str,
    webhook_id: str,
    events: Optional[List[str]] = None,
    http_url: Optional[str] = None,
    job_id: Optional[str] = None,
    description: Optional[str] = None,
    status: Optional[str] = None,
) -> UpdateWebhookResponse:
    """
    Update a registry webhook.
    
    Updates the configuration of an existing webhook.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        webhook_id: Webhook ID
        events: Optional updated events list
        http_url: Optional updated HTTP URL
        job_id: Optional updated job ID
        description: Optional updated description
        status: Optional updated status (ACTIVE, DISABLED)
        
    Returns:
        UpdateWebhookResponse confirming update
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Convert optional parameters
        event_enums = None
        if events:
            from databricks.sdk.service.ml import RegistryWebhookEvent
            event_enums = [RegistryWebhookEvent(event) for event in events]
    
        status_enum = None
        if status:
            from databricks.sdk.service.ml import RegistryWebhookStatus
            status_enum = RegistryWebhookStatus(status)
    
        http_spec = None
        if http_url:
            from databricks.sdk.service.ml import HttpUrlSpec
            http_spec = HttpUrlSpec(url=http_url)
    
        job_spec = None
        if job_id:
            from databricks.sdk.service.ml import JobSpec
            job_spec = JobSpec(job_id=job_id)
    
        client.model_registry.update_webhook(
            id=webhook_id,
            events=event_enums,
            http_url_spec=http_spec,
            job_spec=job_spec,
            description=description,
            status=status_enum,
        )
    
        return UpdateWebhookResponse()

    except Exception as e:
        return UpdateWebhookResponse(
            error_message=f"Failed to update registry webhook: {str(e)}",
        )


def delete_registry_webhook(
    host_credential_key: str,
    token_credential_key: str,
    webhook_id: str,
) -> DeleteWebhookResponse:
    """
    Delete a registry webhook.
    
    Removes a webhook from the model registry.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        webhook_id: Webhook ID
        
    Returns:
        DeleteWebhookResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.model_registry.delete_webhook(id=webhook_id)
    
        return DeleteWebhookResponse(
            webhook_id=webhook_id,
        )

    except Exception as e:
        return DeleteWebhookResponse(
            webhook_id=None,
            error_message=f"Failed to delete registry webhook: {str(e)}",
        )


def list_registry_webhooks(
    host_credential_key: str,
    token_credential_key: str,
    model_name: Optional[str] = None,
    page_token: Optional[str] = None,
) -> ListWebhooksResponse:
    """
    List registry webhooks.
    
    Retrieves all webhooks, optionally filtered by model name.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        model_name: Optional model name filter
        page_token: Optional pagination token
        
    Returns:
        ListWebhooksResponse with webhooks
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        webhooks = []
        next_token = None
    
        for webhook in client.model_registry.list_webhooks(
            model_name=model_name,
            page_token=page_token,
        ):
            webhooks.append(_convert_to_webhook(webhook))
    
        return ListWebhooksResponse(
            webhooks=webhooks,
            next_page_token=next_token,
        )

    except Exception as e:
        return ListWebhooksResponse(
            webhooks=[],
            next_page_token=None,
            error_message=f"Failed to list registry webhooks: {str(e)}",
        )

