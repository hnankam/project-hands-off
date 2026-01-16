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
from cache import get_jira_client


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
    projects: List[ProjectInfo] = Field(default_factory=list, description="List of projects")
    total: int = Field(0, description="Total number of projects")
    start_at: int = Field(0, description="Starting index for pagination")
    max_results: int = Field(50, description="Maximum results returned")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetProjectResponse(BaseModel):
    """Response for getting a project."""
    project: Optional[Dict[str, Any]] = Field(None, description="Complete project details")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DeleteProjectResponse(BaseModel):
    """Response for deleting a project."""
    project_key: str = Field(..., description="Deleted project key")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class ArchiveProjectResponse(BaseModel):
    """Response for archiving a project."""
    project_key: str = Field(..., description="Archived project key")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class UpdateProjectResponse(BaseModel):
    """Response for updating a project."""
    project_key: str = Field(..., description="Updated project key")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


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
    components: List[ComponentInfo] = Field(default_factory=list, description="List of components")
    total: int = Field(0, description="Total number of components")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


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
    versions: List[VersionInfo] = Field(default_factory=list, description="List of versions")
    total: int = Field(0, description="Total number of versions")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class AddVersionResponse(BaseModel):
    """Response for adding a version."""
    project_key: str = Field(..., description="Project key")
    version: Optional[VersionInfo] = Field(None, description="Created version")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class UpdateVersionResponse(BaseModel):
    """Response for updating a version."""
    version_id: str = Field(..., description="Version ID")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetProjectIssuesCountResponse(BaseModel):
    """Response for getting project issues count."""
    project_key: str = Field(..., description="Project key")
    count: int = Field(0, description="Total issue count")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetAllProjectIssuesResponse(BaseModel):
    """Response for getting all project issues."""
    project_key: str = Field(..., description="Project key")
    issues: List[Dict[str, Any]] = Field(default_factory=list, description="List of issues")
    total: int = Field(0, description="Total number of issues")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Tools
# ============================================================================

def list_projects(
    url_credential_key: str,
    token_credential_key: str,
    username_credential_key: str = "",
    included_archived: Optional[bool] = None,
    expand: Optional[str] = None,
    start_at: int = 0,
    max_results: int = 50,
    cloud: bool = False,
) -> ListProjectsResponse:
    """
    List all projects visible to the user with pagination support.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        username_credential_key: Credential key for username (Cloud only, default: "")
        included_archived: Include archived projects (optional)
        expand: Fields to expand (optional, e.g., "description,lead")
        start_at: Starting index for pagination (default: 0)
        max_results: Maximum results to return (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        ListProjectsResponse with paginated projects
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        projects_data = client.projects(included_archived=included_archived, expand=expand)
        
        # Parse all projects
        all_projects = [ProjectInfo(**proj) for proj in projects_data]
        
        # Apply manual pagination
        total_projects = len(all_projects)
        paginated_projects = all_projects[start_at:start_at + max_results]
        
        return ListProjectsResponse(
            projects=paginated_projects,
            total=total_projects,
            start_at=start_at,
            max_results=max_results
        )
    except Exception as e:
        return ListProjectsResponse(
            projects=[],
            total=0,
            start_at=start_at,
            max_results=max_results,
            error_message=f"Failed to list projects: {str(e)}"
        )


def get_project(
    url_credential_key: str,
    token_credential_key: str,
    project_key: str,
    username_credential_key: str = "",
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetProjectResponse:
    """
    Get project details by key.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        project_key: Project key (e.g., "PROJ")
        username_credential_key: Credential key for username (Cloud only, default: "")
        expand: Fields to expand (optional, e.g., "description,lead,issueTypes")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetProjectResponse with complete project details
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        project_data = client.project(project_key, expand=expand)
        
        return GetProjectResponse(
            project=project_data
        )
    except Exception as e:
        return GetProjectResponse(
            project=None,
            error_message=f"Failed to get project: {str(e)}"
        )


def delete_project(
    url_credential_key: str,
    token_credential_key: str,
    project_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> DeleteProjectResponse:
    """
    Permanently delete a project and all its associated data.
    
    **Warning:** This operation is irreversible!

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        project_key: Project key to delete
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteProjectResponse with confirmation message
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        client.delete_project(project_key)
        
        return DeleteProjectResponse(
            project_key=project_key,
            message=f"Successfully deleted project {project_key}"
        )
    except Exception as e:
        return DeleteProjectResponse(
            project_key=project_key,
            message="",
            error_message=f"Failed to delete project: {str(e)}"
        )


def archive_project(
    url_credential_key: str,
    token_credential_key: str,
    project_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> ArchiveProjectResponse:
    """
    Archive a project, making it read-only and hiding it from most views.

    Archived projects can be restored later.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        project_key: Project key to archive
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        ArchiveProjectResponse with confirmation message
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        client.archive_project(project_key)
        
        return ArchiveProjectResponse(
            project_key=project_key,
            message=f"Successfully archived project {project_key}"
        )
    except Exception as e:
        return ArchiveProjectResponse(
            project_key=project_key,
            message="",
            error_message=f"Failed to archive project: {str(e)}"
        )


def update_project(
    url_credential_key: str,
    token_credential_key: str,
    project_key: str,
    data: Dict[str, Any],
    username_credential_key: str = "",
    expand: str = "lead,description",
    cloud: bool = False,
) -> UpdateProjectResponse:
    """
    Update project properties like name, description, lead, etc.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        project_key: Project key to update
        data: Dictionary of fields to update (e.g., {"name": "New Name", "description": "..."})
        username_credential_key: Credential key for username (Cloud only, default: "")
        expand: Fields to expand (default: "lead,description")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateProjectResponse with confirmation message
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        client.update_project(project_key, data, expand=expand)
        
        return UpdateProjectResponse(
            project_key=project_key,
            message=f"Successfully updated project {project_key}"
        )
    except Exception as e:
        return UpdateProjectResponse(
            project_key=project_key,
            message="",
            error_message=f"Failed to update project: {str(e)}"
        )


def get_project_components(
    url_credential_key: str,
    token_credential_key: str,
    project_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetProjectComponentsResponse:
    """
    Get all components (subsystems/modules) defined in a project.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        project_key: Project key
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetProjectComponentsResponse with all components
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        components_data = client.get_project_components(project_key)
        
        # Parse components
        components = [ComponentInfo(**comp) for comp in components_data]
        
        return GetProjectComponentsResponse(
            project_key=project_key,
            components=components,
            total=len(components)
        )
    except Exception as e:
        return GetProjectComponentsResponse(
            project_key=project_key,
            components=[],
            total=0,
            error_message=f"Failed to get project components: {str(e)}"
        )


def get_project_versions(
    url_credential_key: str,
    token_credential_key: str,
    project_key: str,
    username_credential_key: str = "",
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetProjectVersionsResponse:
    """
    Get all versions (releases) defined in a project.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        project_key: Project key
        username_credential_key: Credential key for username (Cloud only, default: "")
        expand: Fields to expand (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetProjectVersionsResponse with all versions
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        versions_data = client.get_project_versions(project_key, expand=expand)
        
        # Parse versions
        versions = [VersionInfo(**ver) for ver in versions_data]
        
        return GetProjectVersionsResponse(
            project_key=project_key,
            versions=versions,
            total=len(versions)
        )
    except Exception as e:
        return GetProjectVersionsResponse(
            project_key=project_key,
            versions=[],
            total=0,
            error_message=f"Failed to get project versions: {str(e)}"
        )


def add_version(
    url_credential_key: str,
    token_credential_key: str,
    project_key: str,
    project_id: int,
    version_name: str,
    username_credential_key: str = "",
    is_archived: bool = False,
    is_released: bool = False,
    cloud: bool = False,
) -> AddVersionResponse:
    """
    Create a new version (release) for a project.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        project_key: Project key
        project_id: Project ID (numeric)
        version_name: Version name (e.g., "v1.0.0", "Release 2025-Q1")
        username_credential_key: Credential key for username (Cloud only, default: "")
        is_archived: Whether version is archived (default: False)
        is_released: Whether version is released (default: False)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddVersionResponse with created version information
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
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
    except Exception as e:
        return AddVersionResponse(
            project_key=project_key,
            version=None,
            message="",
            error_message=f"Failed to add version: {str(e)}"
        )


def update_version(
    url_credential_key: str,
    token_credential_key: str,
    version_id: str,
    username_credential_key: str = "",
    name: Optional[str] = None,
    description: Optional[str] = None,
    is_archived: Optional[bool] = None,
    is_released: Optional[bool] = None,
    start_date: Optional[str] = None,
    release_date: Optional[str] = None,
    cloud: bool = False,
) -> UpdateVersionResponse:
    """
    Update properties of a project version.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        version_id: Version ID to update
        username_credential_key: Credential key for username (Cloud only, default: "")
        name: New version name (optional)
        description: New description (optional)
        is_archived: Archive status (optional)
        is_released: Release status (optional)
        start_date: Start date in ISO format (optional)
        release_date: Release date in ISO format (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateVersionResponse with confirmation message
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
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
    except Exception as e:
        return UpdateVersionResponse(
            version_id=version_id,
            message="",
            error_message=f"Failed to update version: {str(e)}"
        )


def get_project_issues_count(
    url_credential_key: str,
    token_credential_key: str,
    project_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetProjectIssuesCountResponse:
    """
    Get total count of issues in a project.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        project_key: Project key
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetProjectIssuesCountResponse with issue count
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        count = client.get_project_issues_count(project_key)
        
        return GetProjectIssuesCountResponse(
            project_key=project_key,
            count=count
        )
    except Exception as e:
        return GetProjectIssuesCountResponse(
            project_key=project_key,
            count=0,
            error_message=f"Failed to get project issues count: {str(e)}"
        )


def get_all_project_issues(
    url_credential_key: str,
    token_credential_key: str,
    project_key: str,
    username_credential_key: str = "",
    fields: str = "*all",
    start: int = 0,
    limit: int = 500,
    cloud: bool = False,
) -> GetAllProjectIssuesResponse:
    """
    Get all issues from a project with pagination support.

    **Note:** For large projects, use pagination to avoid timeouts.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        project_key: Project key
        username_credential_key: Credential key for username (Cloud only, default: "")
        fields: Fields to return (default: "*all")
        start: Starting index for pagination (default: 0)
        limit: Maximum results per page (default: 500)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetAllProjectIssuesResponse with issues and total count
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
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
    except Exception as e:
        return GetAllProjectIssuesResponse(
            project_key=project_key,
            issues=[],
            total=0,
            error_message=f"Failed to get project issues: {str(e)}"
        )

