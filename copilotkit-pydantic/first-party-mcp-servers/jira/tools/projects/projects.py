"""Jira Project Management Operations.

This module provides tools for managing Jira projects:
- List and get projects
- Update, delete, archive projects
- Manage versions
- Get project issues
- Get project metadata
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from ..cache import get_jira_client


# ============================================================================
# Pydantic Models
# ============================================================================

class ProjectInfo(BaseModel):
    """Project information."""
    id: str = Field(..., description="Project ID")
    key: str = Field(..., description="Project key")
    name: str = Field(..., description="Project name")
    projectTypeKey: Optional[str] = Field(None, description="Project type key")
    description: Optional[str] = Field(None, description="Project description")
    lead: Optional[Dict[str, Any]] = Field(None, description="Project lead")
    url: Optional[str] = Field(None, description="Project URL")
    avatarUrls: Optional[Dict[str, str]] = Field(None, description="Avatar URLs")


class ListProjectsResponse(BaseModel):
    """Response for listing projects."""
    projects: List[ProjectInfo] = Field(..., description="List of projects")
    total: int = Field(..., description="Total number of projects")


class GetProjectResponse(BaseModel):
    """Response for getting a project."""
    project: Dict[str, Any] = Field(..., description="Complete project details")


class DeleteProjectResponse(BaseModel):
    """Response for deleting a project."""
    project_key: str = Field(..., description="Deleted project key")
    message: str = Field(..., description="Success message")


class ArchiveProjectResponse(BaseModel):
    """Response for archiving a project."""
    project_key: str = Field(..., description="Archived project key")
    message: str = Field(..., description="Success message")


class UpdateProjectResponse(BaseModel):
    """Response for updating a project."""
    project_key: str = Field(..., description="Updated project key")
    message: str = Field(..., description="Success message")


class ComponentInfo(BaseModel):
    """Component information."""
    id: str = Field(..., description="Component ID")
    name: str = Field(..., description="Component name")
    description: Optional[str] = Field(None, description="Component description")
    lead: Optional[Dict[str, Any]] = Field(None, description="Component lead")
    assigneeType: Optional[str] = Field(None, description="Assignee type")
    project: Optional[str] = Field(None, description="Project key")


class GetProjectComponentsResponse(BaseModel):
    """Response for getting project components."""
    project_key: str = Field(..., description="Project key")
    components: List[ComponentInfo] = Field(..., description="List of components")
    total: int = Field(..., description="Total number of components")


class VersionInfo(BaseModel):
    """Version information."""
    id: str = Field(..., description="Version ID")
    name: str = Field(..., description="Version name")
    description: Optional[str] = Field(None, description="Version description")
    archived: bool = Field(..., description="Whether version is archived")
    released: bool = Field(..., description="Whether version is released")
    startDate: Optional[str] = Field(None, description="Start date")
    releaseDate: Optional[str] = Field(None, description="Release date")
    projectId: Optional[int] = Field(None, description="Project ID")


class GetProjectVersionsResponse(BaseModel):
    """Response for getting project versions."""
    project_key: str = Field(..., description="Project key")
    versions: List[VersionInfo] = Field(..., description="List of versions")
    total: int = Field(..., description="Total number of versions")


class AddVersionResponse(BaseModel):
    """Response for adding a version."""
    project_key: str = Field(..., description="Project key")
    version: VersionInfo = Field(..., description="Created version")
    message: str = Field(..., description="Success message")


class UpdateVersionResponse(BaseModel):
    """Response for updating a version."""
    version_id: str = Field(..., description="Version ID")
    message: str = Field(..., description="Success message")


class GetProjectIssuesCountResponse(BaseModel):
    """Response for getting project issues count."""
    project_key: str = Field(..., description="Project key")
    count: int = Field(..., description="Total issue count")


class GetAllProjectIssuesResponse(BaseModel):
    """Response for getting all project issues."""
    project_key: str = Field(..., description="Project key")
    issues: List[Dict[str, Any]] = Field(..., description="List of issues")
    total: int = Field(..., description="Total number of issues")


# ============================================================================
# Tools
# ============================================================================

def list_projects(
    url: str,
    api_token: str,
    username: str = "",
    included_archived: Optional[bool] = None,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> ListProjectsResponse:
    """
    List all projects visible to the user.

    Returns all projects which are visible for the currently logged in user.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        included_archived: Include archived projects (optional)
        expand: Fields to expand (optional, e.g., "description,lead")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        ListProjectsResponse with all accessible projects

    Example:
        # List all projects (Cloud)
        response = list_projects(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            username="user@example.com",
            cloud=True
        )
        for project in response.projects:
            print(f"{project.key}: {project.name}")

        # List including archived projects (Server/DC)
        response = list_projects(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            included_archived=True,
            expand="description,lead",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    projects_data = client.projects(included_archived=included_archived, expand=expand)
    
    # Parse projects
    projects = [ProjectInfo(**proj) for proj in projects_data]
    
    return ListProjectsResponse(
        projects=projects,
        total=len(projects)
    )


def get_project(
    url: str,
    api_token: str,
    project_key: str,
    username: str = "",
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetProjectResponse:
    """
    Get project details.

    Retrieves complete information about a specific project.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        project_key: Project key (e.g., "PROJ")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        expand: Fields to expand (optional, e.g., "description,lead,issueTypes")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetProjectResponse with complete project details

    Example:
        # Get project details (Cloud)
        response = get_project(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            project_key="PROJ",
            username="user@example.com",
            expand="description,lead,issueTypes",
            cloud=True
        )
        print(f"Project: {response.project['name']}")
        print(f"Lead: {response.project.get('lead', {}).get('displayName')}")

        # Get project (Server/DC)
        response = get_project(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            project_key="DGROWTH",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    project_data = client.project(project_key, expand=expand)
    
    return GetProjectResponse(
        project=project_data
    )


def delete_project(
    url: str,
    api_token: str,
    project_key: str,
    username: str = "",
    cloud: bool = False,
) -> DeleteProjectResponse:
    """
    Delete a project.

    Permanently deletes a project and all its associated data.
    **WARNING:** This operation is irreversible!
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        project_key: Project key to delete
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteProjectResponse with confirmation

    Example:
        # Delete project (Cloud) - USE WITH CAUTION!
        response = delete_project(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            project_key="OLD",
            username="user@example.com",
            cloud=True
        )
        print(response.message)

        # Delete project (Server/DC)
        response = delete_project(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            project_key="DEPRECATED",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.delete_project(project_key)
    
    return DeleteProjectResponse(
        project_key=project_key,
        message=f"Successfully deleted project {project_key}"
    )


def archive_project(
    url: str,
    api_token: str,
    project_key: str,
    username: str = "",
    cloud: bool = False,
) -> ArchiveProjectResponse:
    """
    Archive a project.

    Archives a project, making it read-only and hiding it from most views.
    Archived projects can be restored later.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        project_key: Project key to archive
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        ArchiveProjectResponse with confirmation

    Example:
        # Archive project (Cloud)
        response = archive_project(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            project_key="OLD",
            username="user@example.com",
            cloud=True
        )
        print(response.message)

        # Archive project (Server/DC)
        response = archive_project(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            project_key="COMPLETED",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.archive_project(project_key)
    
    return ArchiveProjectResponse(
        project_key=project_key,
        message=f"Successfully archived project {project_key}"
    )


def update_project(
    url: str,
    api_token: str,
    project_key: str,
    data: Dict[str, Any],
    username: str = "",
    expand: str = "lead,description",
    cloud: bool = False,
) -> UpdateProjectResponse:
    """
    Update project details.

    Updates project properties like name, description, lead, etc.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        project_key: Project key to update
        data: Dictionary of fields to update (e.g., {"name": "New Name", "description": "..."})
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        expand: Fields to expand (default: "lead,description")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateProjectResponse with confirmation

    Example:
        # Update project (Cloud)
        response = update_project(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            project_key="PROJ",
            data={
                "name": "Updated Project Name",
                "description": "New project description",
                "lead": {"name": "john.doe"}
            },
            username="user@example.com",
            cloud=True
        )

        # Update project description only (Server/DC)
        response = update_project(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            project_key="DGROWTH",
            data={"description": "Updated Q4 2025"},
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.update_project(project_key, data, expand=expand)
    
    return UpdateProjectResponse(
        project_key=project_key,
        message=f"Successfully updated project {project_key}"
    )


def get_project_components(
    url: str,
    api_token: str,
    project_key: str,
    username: str = "",
    cloud: bool = False,
) -> GetProjectComponentsResponse:
    """
    Get project components.

    Retrieves all components (subsystems/modules) defined in a project.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        project_key: Project key
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetProjectComponentsResponse with all components

    Example:
        # Get components (Cloud)
        response = get_project_components(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            project_key="PROJ",
            username="user@example.com",
            cloud=True
        )
        for comp in response.components:
            print(f"{comp.name}: {comp.description}")

        # Get components (Server/DC)
        response = get_project_components(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            project_key="DGROWTH",
            cloud=False
        )
        print(f"Project has {response.total} components")
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    components_data = client.get_project_components(project_key)
    
    # Parse components
    components = [ComponentInfo(**comp) for comp in components_data]
    
    return GetProjectComponentsResponse(
        project_key=project_key,
        components=components,
        total=len(components)
    )


def get_project_versions(
    url: str,
    api_token: str,
    project_key: str,
    username: str = "",
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetProjectVersionsResponse:
    """
    Get project versions.

    Retrieves all versions (releases) defined in a project.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        project_key: Project key
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        expand: Fields to expand (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetProjectVersionsResponse with all versions

    Example:
        # Get versions (Cloud)
        response = get_project_versions(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            project_key="PROJ",
            username="user@example.com",
            cloud=True
        )
        for version in response.versions:
            status = "Released" if version.released else "Unreleased"
            print(f"{version.name}: {status}")

        # Get versions (Server/DC)
        response = get_project_versions(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            project_key="DGROWTH",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    versions_data = client.get_project_versions(project_key, expand=expand)
    
    # Parse versions
    versions = [VersionInfo(**ver) for ver in versions_data]
    
    return GetProjectVersionsResponse(
        project_key=project_key,
        versions=versions,
        total=len(versions)
    )


def add_version(
    url: str,
    api_token: str,
    project_key: str,
    project_id: int,
    version_name: str,
    username: str = "",
    is_archived: bool = False,
    is_released: bool = False,
    cloud: bool = False,
) -> AddVersionResponse:
    """
    Add a version to a project.

    Creates a new version (release) in a project.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        project_key: Project key
        project_id: Project ID (numeric)
        version_name: Version name (e.g., "v1.0.0", "Release 2025-Q1")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        is_archived: Whether version is archived (default: False)
        is_released: Whether version is released (default: False)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddVersionResponse with created version

    Example:
        # Add version (Cloud)
        response = add_version(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            project_key="PROJ",
            project_id=10000,
            version_name="v2.0.0",
            username="user@example.com",
            cloud=True
        )
        print(f"Created version: {response.version.name}")

        # Add released version (Server/DC)
        response = add_version(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            project_key="DGROWTH",
            project_id=12345,
            version_name="Release 2025-Q1",
            is_released=True,
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    version_data = client.add_version(
        project_key,
        project_id,
        version_name,
        is_archived=is_archived,
        is_released=is_released
    )
    
    # Parse version
    version = VersionInfo(**version_data)
    
    return AddVersionResponse(
        project_key=project_key,
        version=version,
        message=f"Successfully added version {version_name} to project {project_key}"
    )


def update_version(
    url: str,
    api_token: str,
    version_id: str,
    username: str = "",
    name: Optional[str] = None,
    description: Optional[str] = None,
    is_archived: Optional[bool] = None,
    is_released: Optional[bool] = None,
    start_date: Optional[str] = None,
    release_date: Optional[str] = None,
    cloud: bool = False,
) -> UpdateVersionResponse:
    """
    Update an existing version.

    Updates properties of a project version.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        version_id: Version ID to update
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        name: New version name (optional)
        description: New description (optional)
        is_archived: Archive status (optional)
        is_released: Release status (optional)
        start_date: Start date in ISO format (optional)
        release_date: Release date in ISO format (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateVersionResponse with confirmation

    Example:
        # Release a version (Cloud)
        response = update_version(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            version_id="10000",
            username="user@example.com",
            is_released=True,
            release_date="2025-12-31",
            cloud=True
        )

        # Update version name and description (Server/DC)
        response = update_version(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            version_id="12345",
            name="v2.0.0 - Final",
            description="Final release for Q4 2025",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.update_version(
        version_id,
        name=name,
        description=description,
        is_archived=is_archived,
        is_released=is_released,
        start_date=start_date,
        release_date=release_date
    )
    
    return UpdateVersionResponse(
        version_id=version_id,
        message=f"Successfully updated version {version_id}"
    )


def get_project_issues_count(
    url: str,
    api_token: str,
    project_key: str,
    username: str = "",
    cloud: bool = False,
) -> GetProjectIssuesCountResponse:
    """
    Get total count of issues in a project.

    Returns the total number of issues in a project.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        project_key: Project key
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetProjectIssuesCountResponse with issue count

    Example:
        # Get issue count (Cloud)
        response = get_project_issues_count(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            project_key="PROJ",
            username="user@example.com",
            cloud=True
        )
        print(f"Project has {response.count} issues")

        # Get issue count (Server/DC)
        response = get_project_issues_count(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            project_key="DGROWTH",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    count = client.get_project_issues_count(project_key)
    
    return GetProjectIssuesCountResponse(
        project_key=project_key,
        count=count
    )


def get_all_project_issues(
    url: str,
    api_token: str,
    project_key: str,
    username: str = "",
    fields: str = "*all",
    start: int = 0,
    limit: int = 500,
    cloud: bool = False,
) -> GetAllProjectIssuesResponse:
    """
    Get all issues from a project.

    Retrieves all issues in a project with pagination support.
    **Note:** For large projects, use pagination to avoid timeouts.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        project_key: Project key
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        fields: Fields to return (default: "*all")
        start: Starting index for pagination (default: 0)
        limit: Maximum results per page (default: 500)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetAllProjectIssuesResponse with issues

    Example:
        # Get all issues (Cloud)
        response = get_all_project_issues(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            project_key="PROJ",
            username="user@example.com",
            limit=100,
            cloud=True
        )
        print(f"Retrieved {response.total} issues")
        for issue in response.issues:
            print(f"  {issue['key']}: {issue['fields']['summary']}")

        # Get issues with specific fields (Server/DC)
        response = get_all_project_issues(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            project_key="DGROWTH",
            fields="summary,status,assignee",
            start=0,
            limit=50,
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    issues_data = client.get_all_project_issues(
        project_key,
        fields=fields,
        start=start,
        limit=limit
    )
    
    # Handle different response formats
    if isinstance(issues_data, dict):
        issues = issues_data.get('issues', [])
        total = issues_data.get('total', len(issues))
    else:
        issues = issues_data if isinstance(issues_data, list) else []
        total = len(issues)
    
    return GetAllProjectIssuesResponse(
        project_key=project_key,
        issues=issues,
        total=total
    )

