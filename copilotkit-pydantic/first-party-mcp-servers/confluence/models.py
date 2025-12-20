"""Pydantic models for Confluence objects."""

from typing import Any, Optional, List, Dict
from pydantic import BaseModel, Field


# ============================================================================
# Base Models
# ============================================================================

class UserInfo(BaseModel):
    """User information."""
    username: Optional[str] = Field(None, description="Username")
    displayName: Optional[str] = Field(None, description="Display name")
    userKey: Optional[str] = Field(None, description="User key")
    accountId: Optional[str] = Field(None, description="Account ID (Cloud)")


class SpaceInfo(BaseModel):
    """Space information."""
    id: Optional[int] = Field(None, description="Space ID")
    key: str = Field(..., description="Space key")
    name: str = Field(..., description="Space name")
    type: Optional[str] = Field(None, description="Space type (global, personal)")
    status: Optional[str] = Field(None, description="Space status")


class PageInfo(BaseModel):
    """Page information."""
    id: str = Field(..., description="Page ID")
    type: str = Field(..., description="Content type (page, blogpost)")
    status: str = Field(..., description="Page status (current, archived)")
    title: str = Field(..., description="Page title")
    space: Optional[Dict[str, Any]] = Field(None, description="Space information")
    version: Optional[Dict[str, Any]] = Field(None, description="Version information")


# ============================================================================
# Page Response Models
# ============================================================================

class GetPageResponse(BaseModel):
    """Response for getting a page."""
    page: Dict[str, Any] = Field(..., description="Complete page details")


class CreatePageResponse(BaseModel):
    """Response for creating a page."""
    page: PageInfo = Field(..., description="Created page")
    message: str = Field(..., description="Success message")


class UpdatePageResponse(BaseModel):
    """Response for updating a page."""
    page_id: str = Field(..., description="Updated page ID")
    message: str = Field(..., description="Success message")


class DeletePageResponse(BaseModel):
    """Response for deleting a page."""
    page_id: str = Field(..., description="Deleted page ID")
    message: str = Field(..., description="Success message")


class GetPageChildrenResponse(BaseModel):
    """Response for getting page children."""
    page_id: str = Field(..., description="Parent page ID")
    children: List[Dict[str, Any]] = Field(..., description="List of child pages")
    total: int = Field(..., description="Total number of children")


class GetPageLabelsResponse(BaseModel):
    """Response for getting page labels."""
    page_id: str = Field(..., description="Page ID")
    labels: List[Dict[str, Any]] = Field(..., description="List of labels")
    total: int = Field(..., description="Total number of labels")


class AddPageLabelResponse(BaseModel):
    """Response for adding a label to page."""
    page_id: str = Field(..., description="Page ID")
    label: str = Field(..., description="Label added")
    message: str = Field(..., description="Success message")


class RemovePageLabelResponse(BaseModel):
    """Response for removing a label from page."""
    page_id: str = Field(..., description="Page ID")
    label: str = Field(..., description="Label removed")
    message: str = Field(..., description="Success message")


# ============================================================================
# Space Response Models
# ============================================================================

class ListSpacesResponse(BaseModel):
    """Response for listing spaces."""
    spaces: List[SpaceInfo] = Field(..., description="List of spaces")
    start_at: int = Field(..., description="Starting index")
    max_results: int = Field(..., description="Maximum results per page")
    total: int = Field(..., description="Total number of spaces")


class GetSpaceResponse(BaseModel):
    """Response for getting a space."""
    space: Dict[str, Any] = Field(..., description="Complete space details")


class CreateSpaceResponse(BaseModel):
    """Response for creating a space."""
    space: SpaceInfo = Field(..., description="Created space")
    message: str = Field(..., description="Success message")


class UpdateSpaceResponse(BaseModel):
    """Response for updating a space."""
    space_key: str = Field(..., description="Updated space key")
    message: str = Field(..., description="Success message")


class DeleteSpaceResponse(BaseModel):
    """Response for deleting a space."""
    space_key: str = Field(..., description="Deleted space key")
    message: str = Field(..., description="Success message")


# ============================================================================
# Content Response Models
# ============================================================================

class GetPageContentResponse(BaseModel):
    """Response for getting page content."""
    page_id: str = Field(..., description="Page ID")
    content: str = Field(..., description="Page content (HTML or storage format)")
    format: str = Field(..., description="Content format (storage, view)")


class SearchContentResponse(BaseModel):
    """Response for searching content."""
    results: List[Dict[str, Any]] = Field(..., description="Search results")
    total: int = Field(..., description="Total number of results")
    start: int = Field(..., description="Start index")
    limit: int = Field(..., description="Maximum results returned")


# ============================================================================
# Attachment Response Models
# ============================================================================

class GetPageAttachmentsResponse(BaseModel):
    """Response for getting page attachments."""
    page_id: str = Field(..., description="Page ID")
    attachments: List[Dict[str, Any]] = Field(..., description="List of attachments")
    total: int = Field(..., description="Total number of attachments")


class AddAttachmentResponse(BaseModel):
    """Response for adding an attachment."""
    page_id: str = Field(..., description="Page ID")
    attachment: Dict[str, Any] = Field(..., description="Attachment details")
    message: str = Field(..., description="Success message")


# ============================================================================
# Comment Response Models
# ============================================================================

class GetPageCommentsResponse(BaseModel):
    """Response for getting page comments."""
    page_id: str = Field(..., description="Page ID")
    comments: List[Dict[str, Any]] = Field(..., description="List of comments")
    total: int = Field(..., description="Total number of comments")


class AddCommentResponse(BaseModel):
    """Response for adding a comment."""
    page_id: str = Field(..., description="Page ID")
    comment: Dict[str, Any] = Field(..., description="Comment details")
    message: str = Field(..., description="Success message")


class UpdateCommentResponse(BaseModel):
    """Response for updating a comment."""
    comment_id: str = Field(..., description="Comment ID")
    message: str = Field(..., description="Success message")


class DeleteCommentResponse(BaseModel):
    """Response for deleting a comment."""
    comment_id: str = Field(..., description="Comment ID")
    message: str = Field(..., description="Success message")

