"""Jira Component Management Operations.

This module provides tools for managing project components:
- Get component details
- Create components
- Update components
- Delete components
"""

from typing import Any, Optional, Dict
from pydantic import BaseModel, Field
from cache import get_jira_client


# ============================================================================
# Pydantic Models
# ============================================================================

class ComponentDetails(BaseModel):
    """Component details."""
    id: str = Field(..., description="Component ID")
    name: str = Field(..., description="Component name")
    description: Optional[str] = Field(None, description="Component description")
    lead: Optional[Dict[str, Any]] = Field(None, description="Component lead")
    assigneeType: Optional[str] = Field(None, description="Assignee type")
    assignee: Optional[Dict[str, Any]] = Field(None, description="Default assignee")
    project: Optional[str] = Field(None, description="Project key")
    projectId: Optional[int] = Field(None, description="Project ID")


class GetComponentResponse(BaseModel):
    """Response for getting a component."""
    component: Optional[ComponentDetails] = Field(None, description="Component details")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class CreateComponentResponse(BaseModel):
    """Response for creating a component."""
    component: Optional[ComponentDetails] = Field(None, description="Created component")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class UpdateComponentResponse(BaseModel):
    """Response for updating a component."""
    component_id: str = Field(..., description="Component ID")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DeleteComponentResponse(BaseModel):
    """Response for deleting a component."""
    component_id: str = Field(..., description="Deleted component ID")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Tools
# ============================================================================

def get_component(
    url_credential_key: str,
    token_credential_key: str,
    component_id: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetComponentResponse:
    """
    Get component details by ID.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        component_id: Component ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetComponentResponse with component details
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        component_data = client.component(component_id)
        
        # Parse component
        component = ComponentDetails(**component_data)
        
        return GetComponentResponse(
            component=component
        )
    except Exception as e:
        return GetComponentResponse(
            component=None,
            error_message=f"Failed to get component: {str(e)}"
        )


def create_component(
    url_credential_key: str,
    token_credential_key: str,
    component_data: Dict[str, Any],
    username_credential_key: str = "",
    cloud: bool = False,
) -> CreateComponentResponse:
    """
    Create a new component (subsystem/module) in a project.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        component_data: Component data dictionary with fields like name, description, project, lead, etc.
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CreateComponentResponse with created component information
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        created_component = client.create_component(component_data)
        
        # Parse component
        component = ComponentDetails(**created_component)
        
        return CreateComponentResponse(
            component=component,
            message=f"Successfully created component {component.name}"
        )
    except Exception as e:
        return CreateComponentResponse(
            component=None,
            message="",
            error_message=f"Failed to create component: {str(e)}"
        )


def update_component(
    url_credential_key: str,
    token_credential_key: str,
    component_id: str,
    component_data: Dict[str, Any],
    username_credential_key: str = "",
    cloud: bool = False,
) -> UpdateComponentResponse:
    """
    Update properties of a project component.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        component_id: Component ID to update
        component_data: Dictionary of fields to update (e.g., name, description, lead)
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateComponentResponse with confirmation message
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        client.update_component(component_data, component_id)
        
        return UpdateComponentResponse(
            component_id=component_id,
            message=f"Successfully updated component {component_id}"
        )
    except Exception as e:
        return UpdateComponentResponse(
            component_id=component_id,
            message="",
            error_message=f"Failed to update component: {str(e)}"
        )


def delete_component(
    url_credential_key: str,
    token_credential_key: str,
    component_id: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> DeleteComponentResponse:
    """
    Permanently delete a component from a project.

    **Note:** Issues using this component will have it removed.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        component_id: Component ID to delete
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteComponentResponse with confirmation message
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        client.delete_component(component_id)
        
        return DeleteComponentResponse(
            component_id=component_id,
            message=f"Successfully deleted component {component_id}"
        )
    except Exception as e:
        return DeleteComponentResponse(
            component_id=component_id,
            message="",
            error_message=f"Failed to delete component: {str(e)}"
        )

