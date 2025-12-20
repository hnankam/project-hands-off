"""Pydantic models for Jira MCP Server."""

from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


# ============================================================================
# Base Response Models
# ============================================================================

class JiraResponse(BaseModel):
    """Base response model for Jira operations."""
    message: str = Field(default="Operation completed successfully", description="Status message")


# ============================================================================
# User Models
# ============================================================================

class JiraUserModel(BaseModel):
    """Jira user information."""
    account_id: Optional[str] = Field(None, description="User account ID")
    email_address: Optional[str] = Field(None, description="User email")
    display_name: Optional[str] = Field(None, description="User display name")
    active: Optional[bool] = Field(None, description="Whether user is active")
    timezone: Optional[str] = Field(None, description="User timezone")


# ============================================================================
# Issue Models
# ============================================================================

class IssueFieldsModel(BaseModel):
    """Issue fields information."""
    summary: Optional[str] = Field(None, description="Issue summary/title")
    description: Optional[str] = Field(None, description="Issue description")
    issuetype: Optional[dict[str, Any]] = Field(None, description="Issue type")
    project: Optional[dict[str, Any]] = Field(None, description="Project information")
    status: Optional[dict[str, Any]] = Field(None, description="Issue status")
    priority: Optional[dict[str, Any]] = Field(None, description="Issue priority")
    assignee: Optional[dict[str, Any]] = Field(None, description="Assigned user")
    reporter: Optional[dict[str, Any]] = Field(None, description="Reporter user")
    labels: Optional[list[str]] = Field(None, description="Issue labels")
    components: Optional[list[dict[str, Any]]] = Field(None, description="Issue components")
    fixVersions: Optional[list[dict[str, Any]]] = Field(None, description="Fix versions")
    created: Optional[str] = Field(None, description="Creation timestamp")
    updated: Optional[str] = Field(None, description="Last update timestamp")
    duedate: Optional[str] = Field(None, description="Due date")
    resolution: Optional[dict[str, Any]] = Field(None, description="Resolution")
    resolutiondate: Optional[str] = Field(None, description="Resolution date")
    customfield: Optional[dict[str, Any]] = Field(None, description="Custom fields")


class IssueModel(BaseModel):
    """Jira issue information."""
    id: Optional[str] = Field(None, description="Issue ID")
    key: Optional[str] = Field(None, description="Issue key (e.g., PROJ-123)")
    self_link: Optional[str] = Field(None, alias="self", description="Issue URL")
    fields: Optional[IssueFieldsModel] = Field(None, description="Issue fields")


class CreateIssueResponse(BaseModel):
    """Response for creating an issue."""
    issue: IssueModel = Field(..., description="Created issue")
    message: str = Field(default="Issue created successfully", description="Status message")


class GetIssueResponse(BaseModel):
    """Response for getting an issue."""
    issue: IssueModel = Field(..., description="Issue details")
    message: str = Field(default="Issue retrieved successfully", description="Status message")


class UpdateIssueResponse(BaseModel):
    """Response for updating an issue."""
    issue_key: str = Field(..., description="Updated issue key")
    message: str = Field(default="Issue updated successfully", description="Status message")


class DeleteIssueResponse(BaseModel):
    """Response for deleting an issue."""
    issue_key: str = Field(..., description="Deleted issue key")
    message: str = Field(default="Issue deleted successfully", description="Status message")


class SearchIssuesResponse(BaseModel):
    """Response for searching issues."""
    issues: list[IssueModel] = Field(default_factory=list, description="List of issues")
    total: int = Field(default=0, description="Total number of results")
    start_at: int = Field(default=0, description="Starting index")
    max_results: int = Field(default=50, description="Maximum results returned")
    message: str = Field(default="Issues retrieved successfully", description="Status message")


# ============================================================================
# Issue Transition Models
# ============================================================================

class TransitionModel(BaseModel):
    """Issue transition information."""
    id: Optional[str] = Field(None, description="Transition ID")
    name: Optional[str] = Field(None, description="Transition name")
    to_status: Optional[dict[str, Any]] = Field(None, alias="to", description="Destination status")
    has_screen: Optional[bool] = Field(None, description="Whether transition has a screen")


class GetTransitionsResponse(BaseModel):
    """Response for getting available transitions."""
    transitions: list[TransitionModel] = Field(default_factory=list, description="Available transitions")
    issue_key: str = Field(..., description="Issue key")
    message: str = Field(default="Transitions retrieved successfully", description="Status message")


class TransitionIssueResponse(BaseModel):
    """Response for transitioning an issue."""
    issue_key: str = Field(..., description="Issue key")
    transition_name: str = Field(..., description="Transition performed")
    message: str = Field(default="Issue transitioned successfully", description="Status message")


# ============================================================================
# Comment Models
# ============================================================================

class CommentModel(BaseModel):
    """Issue comment information."""
    id: Optional[str] = Field(None, description="Comment ID")
    body: Optional[str] = Field(None, description="Comment body")
    author: Optional[dict[str, Any]] = Field(None, description="Comment author")
    created: Optional[str] = Field(None, description="Creation timestamp")
    updated: Optional[str] = Field(None, description="Last update timestamp")


class AddCommentResponse(BaseModel):
    """Response for adding a comment."""
    comment: CommentModel = Field(..., description="Created comment")
    issue_key: str = Field(..., description="Issue key")
    message: str = Field(default="Comment added successfully", description="Status message")


class GetCommentsResponse(BaseModel):
    """Response for getting comments."""
    comments: list[CommentModel] = Field(default_factory=list, description="List of comments")
    issue_key: str = Field(..., description="Issue key")
    total: int = Field(default=0, description="Total number of comments")
    message: str = Field(default="Comments retrieved successfully", description="Status message")


# ============================================================================
# Attachment Models
# ============================================================================

class AttachmentModel(BaseModel):
    """Issue attachment information."""
    id: Optional[str] = Field(None, description="Attachment ID")
    filename: Optional[str] = Field(None, description="Attachment filename")
    size: Optional[int] = Field(None, description="Attachment size in bytes")
    mimetype: Optional[str] = Field(None, description="MIME type")
    content: Optional[str] = Field(None, description="Content URL")
    created: Optional[str] = Field(None, description="Creation timestamp")
    author: Optional[dict[str, Any]] = Field(None, description="Upload author")


class AddAttachmentResponse(BaseModel):
    """Response for adding an attachment."""
    attachments: list[AttachmentModel] = Field(default_factory=list, description="Created attachments")
    issue_key: str = Field(..., description="Issue key")
    message: str = Field(default="Attachment(s) added successfully", description="Status message")


# ============================================================================
# Project Models
# ============================================================================

class ProjectModel(BaseModel):
    """Jira project information."""
    id: Optional[str] = Field(None, description="Project ID")
    key: Optional[str] = Field(None, description="Project key")
    name: Optional[str] = Field(None, description="Project name")
    description: Optional[str] = Field(None, description="Project description")
    lead: Optional[dict[str, Any]] = Field(None, description="Project lead")
    project_type_key: Optional[str] = Field(None, description="Project type")
    style: Optional[str] = Field(None, description="Project style")
    is_private: Optional[bool] = Field(None, description="Whether project is private")


class ListProjectsResponse(BaseModel):
    """Response for listing projects."""
    projects: list[ProjectModel] = Field(default_factory=list, description="List of projects")
    total: int = Field(default=0, description="Total number of projects")
    message: str = Field(default="Projects retrieved successfully", description="Status message")


class GetProjectResponse(BaseModel):
    """Response for getting a project."""
    project: ProjectModel = Field(..., description="Project details")
    message: str = Field(default="Project retrieved successfully", description="Status message")


class CreateProjectResponse(BaseModel):
    """Response for creating a project."""
    project: ProjectModel = Field(..., description="Created project")
    message: str = Field(default="Project created successfully", description="Status message")


# ============================================================================
# Board Models (Agile)
# ============================================================================

class BoardModel(BaseModel):
    """Jira board information."""
    id: Optional[int] = Field(None, description="Board ID")
    name: Optional[str] = Field(None, description="Board name")
    type: Optional[str] = Field(None, description="Board type (scrum/kanban)")
    self_link: Optional[str] = Field(None, alias="self", description="Board URL")


class ListBoardsResponse(BaseModel):
    """Response for listing boards."""
    boards: list[BoardModel] = Field(default_factory=list, description="List of boards")
    total: int = Field(default=0, description="Total number of boards")
    message: str = Field(default="Boards retrieved successfully", description="Status message")


# ============================================================================
# Sprint Models (Agile)
# ============================================================================

class SprintModel(BaseModel):
    """Jira sprint information."""
    id: Optional[int] = Field(None, description="Sprint ID")
    name: Optional[str] = Field(None, description="Sprint name")
    state: Optional[str] = Field(None, description="Sprint state (future/active/closed)")
    start_date: Optional[str] = Field(None, description="Sprint start date")
    end_date: Optional[str] = Field(None, description="Sprint end date")
    complete_date: Optional[str] = Field(None, description="Sprint completion date")
    origin_board_id: Optional[int] = Field(None, description="Origin board ID")
    goal: Optional[str] = Field(None, description="Sprint goal")


class ListSprintsResponse(BaseModel):
    """Response for listing sprints."""
    sprints: list[SprintModel] = Field(default_factory=list, description="List of sprints")
    total: int = Field(default=0, description="Total number of sprints")
    message: str = Field(default="Sprints retrieved successfully", description="Status message")


class CreateSprintResponse(BaseModel):
    """Response for creating a sprint."""
    sprint: SprintModel = Field(..., description="Created sprint")
    message: str = Field(default="Sprint created successfully", description="Status message")


# ============================================================================
# Filter Models
# ============================================================================

class FilterModel(BaseModel):
    """Jira filter information."""
    id: Optional[str] = Field(None, description="Filter ID")
    name: Optional[str] = Field(None, description="Filter name")
    description: Optional[str] = Field(None, description="Filter description")
    owner: Optional[dict[str, Any]] = Field(None, description="Filter owner")
    jql: Optional[str] = Field(None, description="JQL query")
    favourite: Optional[bool] = Field(None, description="Whether filter is favourited")
    share_permissions: Optional[list[dict[str, Any]]] = Field(None, description="Share permissions")


class ListFiltersResponse(BaseModel):
    """Response for listing filters."""
    filters: list[FilterModel] = Field(default_factory=list, description="List of filters")
    total: int = Field(default=0, description="Total number of filters")
    message: str = Field(default="Filters retrieved successfully", description="Status message")


# ============================================================================
# Workflow Models
# ============================================================================

class WorkflowModel(BaseModel):
    """Jira workflow information."""
    name: Optional[str] = Field(None, description="Workflow name")
    description: Optional[str] = Field(None, description="Workflow description")
    is_default: Optional[bool] = Field(None, description="Whether workflow is default")


class ListWorkflowsResponse(BaseModel):
    """Response for listing workflows."""
    workflows: list[WorkflowModel] = Field(default_factory=list, description="List of workflows")
    total: int = Field(default=0, description="Total number of workflows")
    message: str = Field(default="Workflows retrieved successfully", description="Status message")

