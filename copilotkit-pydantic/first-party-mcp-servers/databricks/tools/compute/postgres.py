"""
Postgres Management Tools

This module provides tools for managing Databricks Postgres database projects, branches, 
and endpoints via REST API.

All credential parameters use credential keys (globally unique identifiers) that are resolved
server-side from the workspace_credentials table.
"""

from typing import Optional, Dict, Any
from cache import get_workspace_client
from models import (
    PostgresProjectModel,
    PostgresBranchModel,
    PostgresEndpointModel,
    PostgresOperationModel,
    ListPostgresProjectsResponse,
    ListPostgresBranchesResponse,
    ListPostgresEndpointsResponse,
    CreatePostgresProjectResponse,
    CreatePostgresBranchResponse,
    CreatePostgresEndpointResponse,
    DeletePostgresResponse,
    UpdatePostgresResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_project_to_model(project) -> PostgresProjectModel:
    """Convert SDK Project to Pydantic model."""
    return PostgresProjectModel(
        name=project.name,
        uid=project.uid,
        display_name=project.display_name or project.effective_display_name,
        pg_version=project.pg_version or project.effective_pg_version,
        create_time=str(project.create_time) if project.create_time else None,
        update_time=str(project.update_time) if project.update_time else None,
        settings=project.settings.as_dict() if project.settings else None,
        history_retention_duration=str(project.history_retention_duration) if project.history_retention_duration else None,
        branch_logical_size_limit_bytes=project.branch_logical_size_limit_bytes,
        synthetic_storage_size_bytes=project.synthetic_storage_size_bytes,
    )


def _convert_branch_to_model(branch) -> PostgresBranchModel:
    """Convert SDK Branch to Pydantic model."""
    return PostgresBranchModel(
        name=branch.name,
        uid=branch.uid,
        parent=branch.parent,
        default=branch.default or branch.effective_default,
        is_protected=branch.is_protected or branch.effective_is_protected,
        create_time=str(branch.create_time) if branch.create_time else None,
        update_time=str(branch.update_time) if branch.update_time else None,
        current_state=branch.current_state.value if branch.current_state else None,
        logical_size_bytes=branch.logical_size_bytes,
        source_branch=branch.source_branch or branch.effective_source_branch,
    )


def _convert_endpoint_to_model(endpoint) -> PostgresEndpointModel:
    """Convert SDK Endpoint to Pydantic model."""
    return PostgresEndpointModel(
        name=endpoint.name,
        uid=endpoint.uid,
        parent=endpoint.parent,
        endpoint_type=endpoint.endpoint_type.value if endpoint.endpoint_type else None,
        host=endpoint.host,
        disabled=endpoint.disabled or endpoint.effective_disabled,
        pooler_mode=endpoint.pooler_mode.value if endpoint.pooler_mode else (endpoint.effective_pooler_mode.value if endpoint.effective_pooler_mode else None),
        autoscaling_limit_min_cu=endpoint.autoscaling_limit_min_cu or endpoint.effective_autoscaling_limit_min_cu,
        autoscaling_limit_max_cu=endpoint.autoscaling_limit_max_cu or endpoint.effective_autoscaling_limit_max_cu,
        suspend_timeout_duration=str(endpoint.suspend_timeout_duration) if endpoint.suspend_timeout_duration else None,
        create_time=str(endpoint.create_time) if endpoint.create_time else None,
        update_time=str(endpoint.update_time) if endpoint.update_time else None,
        current_state=endpoint.current_state.value if endpoint.current_state else None,
    )


def _convert_operation_to_model(operation) -> PostgresOperationModel:
    """Convert SDK Operation to Pydantic model."""
    return PostgresOperationModel(
        name=operation.name,
        done=operation.done,
        error=operation.error.as_dict() if operation.error else None,
        response=operation.response,
        metadata=operation.metadata,
    )


# ============================================================================
# Project Management
# ============================================================================

def list_postgres_projects(
    host_credential_key: str,
    token_credential_key: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListPostgresProjectsResponse:
    """
    List Postgres projects.
    
    Lists all Postgres database projects in the workspace.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        page_size: Maximum number of projects to return
        page_token: Pagination token for next page
        
    Returns:
        ListPostgresProjectsResponse with list of projects
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    projects_list = []
    
    for project in client.postgres.list_projects(
        page_size=page_size,
        page_token=page_token,
    ):
        projects_list.append(_convert_project_to_model(project))
    
    return ListPostgresProjectsResponse(
        projects=projects_list,
        count=len(projects_list),
        next_page_token=None,
    )
    except Exception as e:
        return ListPostgresProjectsResponse(
            projects=[],
            count=0,
            next_page_token=None,
            error_message=f"Failed to list Postgres projects: {str(e)}",
        )


def get_postgres_project(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> PostgresProjectModel:
    """
    Get Postgres project details.
    
    Retrieves detailed information about a specific Postgres project.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Project name (format: projects/{project_id})
        
    Returns:
        PostgresProjectModel with project details
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    project = client.postgres.get_project(name=name)
    
    return _convert_project_to_model(project)
    except Exception as e:
        return None


def create_postgres_project(
    host_credential_key: str,
    token_credential_key: str,
    project_id: Optional[str] = None,
    display_name: Optional[str] = None,
    pg_version: Optional[int] = None,
    settings: Optional[Dict[str, Any]] = None,
) -> CreatePostgresProjectResponse:
    """
    Create a Postgres project.
    
    Creates a new Postgres database project. This is a long-running operation.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        project_id: Project ID (4-63 chars, a-z0-9-)
        display_name: User-defined display name
        pg_version: PostgreSQL version
        settings: Project settings
        
    Returns:
        CreatePostgresProjectResponse with operation info
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.postgres import Project, ProjectSettings
    
    project_obj = Project(
        display_name=display_name,
        pg_version=pg_version,
        settings=ProjectSettings(**settings) if settings else None,
    )
    
    operation = client.postgres.create_project(
        project=project_obj,
        project_id=project_id,
    )
    
    return CreatePostgresProjectResponse(
        operation=_convert_operation_to_model(operation),
    )
    except Exception as e:
        return CreatePostgresProjectResponse(
            operation=None,
            error_message=f"Failed to create Postgres project: {str(e)}",
        )


def update_postgres_project(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    update_mask: str,
    display_name: Optional[str] = None,
    pg_version: Optional[int] = None,
    settings: Optional[Dict[str, Any]] = None,
) -> UpdatePostgresResponse:
    """
    Update a Postgres project.
    
    Updates the specified Postgres project. This is a long-running operation.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Project name (format: projects/{project_id})
        update_mask: Fields to update (comma-separated, e.g. "display_name,settings")
        display_name: New display name
        pg_version: New PostgreSQL version
        settings: New project settings
        
    Returns:
        UpdatePostgresResponse with operation info
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.postgres import Project, ProjectSettings, FieldMask
    
    project_obj = Project(
        name=name,
        display_name=display_name,
        pg_version=pg_version,
        settings=ProjectSettings(**settings) if settings else None,
    )
    
    operation = client.postgres.update_project(
        name=name,
        project=project_obj,
        update_mask=FieldMask(update_mask),
    )
    
    return UpdatePostgresResponse(
        operation=_convert_operation_to_model(operation),
    )
    except Exception as e:
        return UpdatePostgresResponse(
            operation=None,
            error_message=f"Failed to update Postgres project {name}: {str(e)}",
        )


def delete_postgres_project(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> DeletePostgresResponse:
    """
    Delete a Postgres project.
    
    Deletes the specified Postgres project and all its branches and endpoints.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Project name (format: projects/{project_id})
        
    Returns:
        DeletePostgresResponse confirming deletion
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.postgres.delete_project(name=name)
    
    return DeletePostgresResponse(name=name)
    except Exception as e:
        return DeletePostgresResponse(
            name=name,
            error_message=f"Failed to delete Postgres project {name}: {str(e)}",
        )


# ============================================================================
# Branch Management
# ============================================================================

def list_postgres_branches(
    host_credential_key: str,
    token_credential_key: str,
    parent: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListPostgresBranchesResponse:
    """
    List Postgres branches.
    
    Lists all branches within a Postgres project.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        parent: Parent project name (format: projects/{project_id})
        page_size: Maximum number of branches to return
        page_token: Pagination token for next page
        
    Returns:
        ListPostgresBranchesResponse with list of branches
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    branches_list = []
    
    for branch in client.postgres.list_branches(
        parent=parent,
        page_size=page_size,
        page_token=page_token,
    ):
        branches_list.append(_convert_branch_to_model(branch))
    
    return ListPostgresBranchesResponse(
        branches=branches_list,
        count=len(branches_list),
        next_page_token=None,
    )
    except Exception as e:
        return ListPostgresBranchesResponse(
            branches=[],
            count=0,
            next_page_token=None,
            error_message=f"Failed to list Postgres branches: {str(e)}",
        )


def get_postgres_branch(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> PostgresBranchModel:
    """
    Get Postgres branch details.
    
    Retrieves detailed information about a specific branch.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Branch name (format: projects/{project_id}/branches/{branch_id})
        
    Returns:
        PostgresBranchModel with branch details
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    branch = client.postgres.get_branch(name=name)
    
    return _convert_branch_to_model(branch)
    except Exception as e:
        return None


def create_postgres_branch(
    host_credential_key: str,
    token_credential_key: str,
    parent: str,
    branch_id: Optional[str] = None,
    is_protected: Optional[bool] = None,
    source_branch: Optional[str] = None,
) -> CreatePostgresBranchResponse:
    """
    Create a Postgres branch.
    
    Creates a new branch in a Postgres project. This is a long-running operation.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        parent: Parent project name (format: projects/{project_id})
        branch_id: Branch ID (4-63 chars, a-z0-9-)
        is_protected: Whether to protect branch from deletion
        source_branch: Source branch to create from
        
    Returns:
        CreatePostgresBranchResponse with operation info
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.postgres import Branch
    
    branch_obj = Branch(
        parent=parent,
        is_protected=is_protected,
        source_branch=source_branch,
    )
    
    operation = client.postgres.create_branch(
        parent=parent,
        branch=branch_obj,
        branch_id=branch_id,
    )
    
    return CreatePostgresBranchResponse(
        operation=_convert_operation_to_model(operation),
    )
    except Exception as e:
        return CreatePostgresBranchResponse(
            operation=None,
            error_message=f"Failed to create Postgres branch: {str(e)}",
        )


def update_postgres_branch(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    update_mask: str,
    is_protected: Optional[bool] = None,
) -> UpdatePostgresResponse:
    """
    Update a Postgres branch.
    
    Updates the specified branch. This is a long-running operation.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Branch name (format: projects/{project_id}/branches/{branch_id})
        update_mask: Fields to update (e.g. "is_protected")
        is_protected: Whether to protect branch from deletion
        
    Returns:
        UpdatePostgresResponse with operation info
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.postgres import Branch, FieldMask
    
    branch_obj = Branch(
        name=name,
        is_protected=is_protected,
    )
    
    operation = client.postgres.update_branch(
        name=name,
        branch=branch_obj,
        update_mask=FieldMask(update_mask),
    )
    
    return UpdatePostgresResponse(
        operation=_convert_operation_to_model(operation),
    )
    except Exception as e:
        return UpdatePostgresResponse(
            operation=None,
            error_message=f"Failed to update Postgres branch {name}: {str(e)}",
        )


def delete_postgres_branch(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> DeletePostgresResponse:
    """
    Delete a Postgres branch.
    
    Deletes the specified branch and all its endpoints.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Branch name (format: projects/{project_id}/branches/{branch_id})
        
    Returns:
        DeletePostgresResponse confirming deletion
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.postgres.delete_branch(name=name)
    
    return DeletePostgresResponse(name=name)
    except Exception as e:
        return DeletePostgresResponse(
            name=name,
            error_message=f"Failed to delete Postgres branch {name}: {str(e)}",
        )


# ============================================================================
# Endpoint Management
# ============================================================================

def list_postgres_endpoints(
    host_credential_key: str,
    token_credential_key: str,
    parent: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListPostgresEndpointsResponse:
    """
    List Postgres endpoints.
    
    Lists all endpoints within a branch.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        parent: Parent branch name (format: projects/{project_id}/branches/{branch_id})
        page_size: Maximum number of endpoints to return
        page_token: Pagination token for next page
        
    Returns:
        ListPostgresEndpointsResponse with list of endpoints
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    endpoints_list = []
    
    for endpoint in client.postgres.list_endpoints(
        parent=parent,
        page_size=page_size,
        page_token=page_token,
    ):
        endpoints_list.append(_convert_endpoint_to_model(endpoint))
    
    return ListPostgresEndpointsResponse(
        endpoints=endpoints_list,
        count=len(endpoints_list),
        next_page_token=None,
    )
    except Exception as e:
        return ListPostgresEndpointsResponse(
            endpoints=[],
            count=0,
            next_page_token=None,
            error_message=f"Failed to list Postgres endpoints: {str(e)}",
        )


def get_postgres_endpoint(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> PostgresEndpointModel:
    """
    Get Postgres endpoint details.
    
    Retrieves detailed information about a specific endpoint.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Endpoint name (format: projects/{project_id}/branches/{branch_id}/endpoints/{endpoint_id})
        
    Returns:
        PostgresEndpointModel with endpoint details
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    endpoint = client.postgres.get_endpoint(name=name)
    
    return _convert_endpoint_to_model(endpoint)
    except Exception as e:
        return None


def create_postgres_endpoint(
    host_credential_key: str,
    token_credential_key: str,
    parent: str,
    endpoint_type: str,
    endpoint_id: Optional[str] = None,
    autoscaling_limit_min_cu: Optional[float] = None,
    autoscaling_limit_max_cu: Optional[float] = None,
    pooler_mode: Optional[str] = None,
    disabled: Optional[bool] = None,
) -> CreatePostgresEndpointResponse:
    """
    Create a Postgres endpoint.
    
    Creates a new endpoint in a branch. This is a long-running operation.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        parent: Parent branch name (format: projects/{project_id}/branches/{branch_id})
        endpoint_type: Endpoint type ("READ_WRITE" or "READ_ONLY")
        endpoint_id: Endpoint ID (4-63 chars, a-z0-9-)
        autoscaling_limit_min_cu: Minimum compute units
        autoscaling_limit_max_cu: Maximum compute units
        pooler_mode: Pooler mode ("TRANSACTION" or "SESSION")
        disabled: Whether to create endpoint in disabled state
        
    Returns:
        CreatePostgresEndpointResponse with operation info
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.postgres import Endpoint, EndpointType, EndpointPoolerMode
    
    endpoint_obj = Endpoint(
        parent=parent,
        endpoint_type=EndpointType(endpoint_type),
        autoscaling_limit_min_cu=autoscaling_limit_min_cu,
        autoscaling_limit_max_cu=autoscaling_limit_max_cu,
        pooler_mode=EndpointPoolerMode(pooler_mode) if pooler_mode else None,
        disabled=disabled,
    )
    
    operation = client.postgres.create_endpoint(
        parent=parent,
        endpoint=endpoint_obj,
        endpoint_id=endpoint_id,
    )
    
    return CreatePostgresEndpointResponse(
        operation=_convert_operation_to_model(operation),
    )
    except Exception as e:
        return CreatePostgresEndpointResponse(
            operation=None,
            error_message=f"Failed to create Postgres endpoint: {str(e)}",
        )


def update_postgres_endpoint(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    update_mask: str,
    autoscaling_limit_min_cu: Optional[float] = None,
    autoscaling_limit_max_cu: Optional[float] = None,
    pooler_mode: Optional[str] = None,
    disabled: Optional[bool] = None,
) -> UpdatePostgresResponse:
    """
    Update a Postgres endpoint.
    
    Updates the specified endpoint. This is a long-running operation.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Endpoint name (format: projects/{project_id}/branches/{branch_id}/endpoints/{endpoint_id})
        update_mask: Fields to update (comma-separated)
        autoscaling_limit_min_cu: New minimum compute units
        autoscaling_limit_max_cu: New maximum compute units
        pooler_mode: New pooler mode
        disabled: Whether to disable endpoint
        
    Returns:
        UpdatePostgresResponse with operation info
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.postgres import Endpoint, EndpointPoolerMode, FieldMask
    
    endpoint_obj = Endpoint(
        name=name,
        endpoint_type=None,  # Required field but not used in update
        autoscaling_limit_min_cu=autoscaling_limit_min_cu,
        autoscaling_limit_max_cu=autoscaling_limit_max_cu,
        pooler_mode=EndpointPoolerMode(pooler_mode) if pooler_mode else None,
        disabled=disabled,
    )
    
    operation = client.postgres.update_endpoint(
        name=name,
        endpoint=endpoint_obj,
        update_mask=FieldMask(update_mask),
    )
    
    return UpdatePostgresResponse(
        operation=_convert_operation_to_model(operation),
    )
    except Exception as e:
        return UpdatePostgresResponse(
            operation=None,
            error_message=f"Failed to update Postgres endpoint {name}: {str(e)}",
        )


def delete_postgres_endpoint(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> DeletePostgresResponse:
    """
    Delete a Postgres endpoint.
    
    Deletes the specified endpoint.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Endpoint name (format: projects/{project_id}/branches/{branch_id}/endpoints/{endpoint_id})
        
    Returns:
        DeletePostgresResponse confirming deletion
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.postgres.delete_endpoint(name=name)
    
    return DeletePostgresResponse(name=name)
    except Exception as e:
        return DeletePostgresResponse(
            name=name,
            error_message=f"Failed to delete Postgres endpoint {name}: {str(e)}",
        )


# ============================================================================
# Operation Management
# ============================================================================

def get_postgres_operation(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> PostgresOperationModel:
    """
    Get operation status.
    
    Retrieves the status of a long-running operation.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Operation name
        
    Returns:
        PostgresOperationModel with operation status
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    operation = client.postgres.get_operation(name=name)
    
    return _convert_operation_to_model(operation)
    except Exception as e:
        return None

