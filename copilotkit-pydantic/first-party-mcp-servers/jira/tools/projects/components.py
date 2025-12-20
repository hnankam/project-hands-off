"""Jira Component Management Operations.

This module provides tools for managing project components:
- Get component details
- Create components
- Update components
- Delete components
"""

from typing import Any, Optional, Dict
from pydantic import BaseModel, Field
from ..cache import get_jira_client


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
    component: ComponentDetails = Field(..., description="Component details")


class CreateComponentResponse(BaseModel):
    """Response for creating a component."""
    component: ComponentDetails = Field(..., description="Created component")
    message: str = Field(..., description="Success message")


class UpdateComponentResponse(BaseModel):
    """Response for updating a component."""
    component_id: str = Field(..., description="Component ID")
    message: str = Field(..., description="Success message")


class DeleteComponentResponse(BaseModel):
    """Response for deleting a component."""
    component_id: str = Field(..., description="Deleted component ID")
    message: str = Field(..., description="Success message")


# ============================================================================
# Tools
# ============================================================================

def get_component(
    url: str,
    api_token: str,
    component_id: str,
    username: str = "",
    cloud: bool = False,
) -> GetComponentResponse:
    """
    Get component details.

    Retrieves complete information about a specific component.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        component_id: Component ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetComponentResponse with component details

    Example:
        # Get component (Cloud)
        response = get_component(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            component_id="10000",
            username="user@example.com",
            cloud=True
        )
        print(f"Component: {response.component.name}")
        print(f"Description: {response.component.description}")

        # Get component (Server/DC)
        response = get_component(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            component_id="12345",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    component_data = client.component(component_id)
    
    # Parse component
    component = ComponentDetails(**component_data)
    
    return GetComponentResponse(
        component=component
    )


def create_component(
    url: str,
    api_token: str,
    component_data: Dict[str, Any],
    username: str = "",
    cloud: bool = False,
) -> CreateComponentResponse:
    """
    Create a new component.

    Creates a new component (subsystem/module) in a project.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        component_data: Component data dictionary with fields like name, description, project, lead, etc.
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CreateComponentResponse with created component

    Example:
        # Create component (Cloud)
        response = create_component(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            component_data={
                "name": "Backend API",
                "description": "Backend services and API layer",
                "project": "PROJ",
                "leadUserName": "john.doe",
                "assigneeType": "COMPONENT_LEAD"
            },
            username="user@example.com",
            cloud=True
        )
        print(f"Created: {response.component.name} (ID: {response.component.id})")

        # Create simple component (Server/DC)
        response = create_component(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            component_data={
                "name": "Frontend",
                "description": "React frontend application",
                "project": "DGROWTH"
            },
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    created_component = client.create_component(component_data)
    
    # Parse component
    component = ComponentDetails(**created_component)
    
    return CreateComponentResponse(
        component=component,
        message=f"Successfully created component {component.name}"
    )


def update_component(
    url: str,
    api_token: str,
    component_id: str,
    component_data: Dict[str, Any],
    username: str = "",
    cloud: bool = False,
) -> UpdateComponentResponse:
    """
    Update an existing component.

    Updates properties of a project component.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        component_id: Component ID to update
        component_data: Dictionary of fields to update (e.g., name, description, lead)
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateComponentResponse with confirmation

    Example:
        # Update component (Cloud)
        response = update_component(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            component_id="10000",
            component_data={
                "name": "Backend API v2",
                "description": "Updated backend services",
                "leadUserName": "jane.smith"
            },
            username="user@example.com",
            cloud=True
        )

        # Update component description (Server/DC)
        response = update_component(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            component_id="12345",
            component_data={
                "description": "React 18 frontend with TypeScript"
            },
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.update_component(component_data, component_id)
    
    return UpdateComponentResponse(
        component_id=component_id,
        message=f"Successfully updated component {component_id}"
    )


def delete_component(
    url: str,
    api_token: str,
    component_id: str,
    username: str = "",
    cloud: bool = False,
) -> DeleteComponentResponse:
    """
    Delete a component.

    Permanently deletes a component from a project.
    **Note:** Issues using this component will have it removed.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        component_id: Component ID to delete
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteComponentResponse with confirmation

    Example:
        # Delete component (Cloud)
        response = delete_component(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            component_id="10000",
            username="user@example.com",
            cloud=True
        )
        print(response.message)

        # Delete component (Server/DC)
        response = delete_component(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            component_id="12345",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.delete_component(component_id)
    
    return DeleteComponentResponse(
        component_id=component_id,
        message=f"Successfully deleted component {component_id}"
    )

