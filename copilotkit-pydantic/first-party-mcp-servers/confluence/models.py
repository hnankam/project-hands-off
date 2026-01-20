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
    page: Optional[Dict[str, Any]] = Field(None, description="Complete page details")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class CreatePageResponse(BaseModel):
    """Response for creating a page."""
    page: Optional[PageInfo] = Field(None, description="Created page")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class UpdatePageResponse(BaseModel):
    """Response for updating a page."""
    page_id: Optional[str] = Field(None, description="Updated page ID")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DeletePageResponse(BaseModel):
    """Response for deleting a page."""
    page_id: Optional[str] = Field(None, description="Deleted page ID")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetPageChildrenResponse(BaseModel):
    """Response for getting page children."""
    page_id: Optional[str] = Field(None, description="Parent page ID")
    children: List[Dict[str, Any]] = Field(default_factory=list, description="List of child pages")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetPageLabelsResponse(BaseModel):
    """Response for getting page labels."""
    page_id: Optional[str] = Field(None, description="Page ID")
    labels: List[Dict[str, Any]] = Field(default_factory=list, description="List of labels")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class AddPageLabelResponse(BaseModel):
    """Response for adding a label to page."""
    page_id: Optional[str] = Field(None, description="Page ID")
    label: Optional[str] = Field(None, description="Label added")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class RemovePageLabelResponse(BaseModel):
    """Response for removing a label from page."""
    page_id: Optional[str] = Field(None, description="Page ID")
    label: Optional[str] = Field(None, description="Label removed")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Space Response Models
# ============================================================================

class ListSpacesResponse(BaseModel):
    """Response for listing spaces."""
    spaces: List[SpaceInfo] = Field(default_factory=list, description="List of spaces")
    start_at: int = Field(0, description="Starting index")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetSpaceResponse(BaseModel):
    """Response for getting a space."""
    space: Optional[Dict[str, Any]] = Field(None, description="Complete space details")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class CreateSpaceResponse(BaseModel):
    """Response for creating a space."""
    space: Optional[SpaceInfo] = Field(None, description="Created space")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class UpdateSpaceResponse(BaseModel):
    """Response for updating a space."""
    space_key: Optional[str] = Field(None, description="Updated space key")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DeleteSpaceResponse(BaseModel):
    """Response for deleting a space."""
    space_key: Optional[str] = Field(None, description="Deleted space key")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Content Response Models
# ============================================================================

class GetPageContentResponse(BaseModel):
    """Response for getting page content."""
    page_id: Optional[str] = Field(None, description="Page ID")
    content: Optional[str] = Field(None, description="Page content (HTML or storage format)")
    format: Optional[str] = Field(None, description="Content format (storage, view)")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class SearchContentResponse(BaseModel):
    """Response for searching content."""
    results: List[Dict[str, Any]] = Field(default_factory=list, description="Search results")
    start: int = Field(0, description="Start index")
    limit: int = Field(25, description="Maximum results returned")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Attachment Response Models
# ============================================================================

class GetPageAttachmentsResponse(BaseModel):
    """Response for getting page attachments."""
    page_id: Optional[str] = Field(None, description="Page ID")
    attachments: List[Dict[str, Any]] = Field(default_factory=list, description="List of attachments")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class AddAttachmentResponse(BaseModel):
    """Response for adding an attachment."""
    page_id: Optional[str] = Field(None, description="Page ID")
    attachment: Optional[Dict[str, Any]] = Field(None, description="Attachment details")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Comment Response Models
# ============================================================================

class GetPageCommentsResponse(BaseModel):
    """Response for getting page comments."""
    page_id: Optional[str] = Field(None, description="Page ID")
    comments: List[Dict[str, Any]] = Field(default_factory=list, description="List of comments")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class AddCommentResponse(BaseModel):
    """Response for adding a comment."""
    page_id: Optional[str] = Field(None, description="Page ID")
    comment: Optional[Dict[str, Any]] = Field(None, description="Comment details")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class UpdateCommentResponse(BaseModel):
    """Response for updating a comment."""
    comment_id: Optional[str] = Field(None, description="Comment ID")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DeleteCommentResponse(BaseModel):
    """Response for deleting a comment."""
    comment_id: Optional[str] = Field(None, description="Comment ID")
    message: Optional[str] = Field(None, description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")

