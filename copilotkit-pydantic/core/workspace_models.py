"""Pydantic models for workspace resources."""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime


class WorkspaceFile(BaseModel):
    """Personal file uploaded by user."""
    id: str
    user_id: str
    file_name: str
    file_type: str
    file_size: int
    storage_url: str
    extracted_text: Optional[str] = None
    page_count: Optional[int] = None
    folder: str = 'root'
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class WorkspaceNote(BaseModel):
    """Personal note created by user."""
    id: str
    user_id: str
    title: str
    content: str
    folder: str = 'root'
    tags: List[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class WorkspaceConnection(BaseModel):
    """Personal API connection (OAuth or API key)."""
    id: str
    user_id: str
    connection_name: str
    connection_type: Literal['oauth2_gmail', 'oauth2_slack', 'api_key']
    service_name: str
    status: Literal['active', 'disconnected', 'error']
    token_expires_at: Optional[datetime] = None
    scopes: List[str] = Field(default_factory=list)
    last_used_at: Optional[datetime] = None
    last_sync_at: Optional[datetime] = None
    description: Optional[str] = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class WorkspaceSummary(BaseModel):
    """Summary of user's workspace for context."""
    file_count: int
    note_count: int
    connection_count: int
    total_size: int
    recent_files: List[dict] = Field(default_factory=list)
    recent_notes: List[dict] = Field(default_factory=list)
    active_connections: List[dict] = Field(default_factory=list)

