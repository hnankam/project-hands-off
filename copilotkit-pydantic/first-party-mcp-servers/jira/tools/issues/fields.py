"""Jira Issue Field Operations.

This module provides tools for managing issue fields including:
- Get field values
- Bulk updates
- Append values
- Custom fields
- Existence checks
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from cache import get_jira_client


# ============================================================================
# Pydantic Models
# ============================================================================

class IssueFieldValueResponse(BaseModel):
    """Response for getting an issue field value."""
    issue_key: str = Field(..., description="Issue key")
    field: str = Field(..., description="Field name or ID")
    value: Any = Field(..., description="Field value")


class BulkUpdateResponse(BaseModel):
    """Response for bulk updating issues."""
    updated_count: int = Field(..., description="Number of issues updated")
    issue_keys: List[str] = Field(..., description="List of updated issue keys")
    message: str = Field(..., description="Success message")


class AppendFieldValueResponse(BaseModel):
    """Response for appending a value to an issue field."""
    issue_key: str = Field(..., description="Issue key")
    field: str = Field(..., description="Field name or ID")
    message: str = Field(..., description="Success message")


class CustomFieldInfo(BaseModel):
    """Information about a custom field."""
    id: str = Field(..., description="Custom field ID")
    name: str = Field(..., description="Custom field name")
    description: Optional[str] = Field(None, description="Field description")
    type: str = Field(..., description="Field type")
    searcherKey: Optional[str] = Field(None, description="Searcher key")


class CustomFieldsResponse(BaseModel):
    """Response for getting custom fields."""
    fields: List[CustomFieldInfo] = Field(..., description="List of custom fields")
    total: int = Field(..., description="Total number of fields")
    start: int = Field(..., description="Start index")
    limit: int = Field(..., description="Limit per page")


class IssueExistsResponse(BaseModel):
    """Response for checking if an issue exists."""
    issue_key: str = Field(..., description="Issue key")
    exists: bool = Field(..., description="Whether the issue exists")


class IssueDeletedResponse(BaseModel):
    """Response for checking if an issue is deleted."""
    issue_key: str = Field(..., description="Issue key")
    deleted: bool = Field(..., description="Whether the issue is deleted")


class UpdateWithHistoryResponse(BaseModel):
    """Response for updating an issue with history metadata."""
    issue_key: str = Field(..., description="Issue key")
    message: str = Field(..., description="Success message")


# ============================================================================
# Tools
# ============================================================================

def get_issue_field_value(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    field: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> IssueFieldValueResponse:
    """
    Get the current value of a single field from an issue.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        field: Field name or ID (e.g., "summary", "customfield_10000")
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        IssueFieldValueResponse with the field value
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    value = client.issue_field_value(issue_key, field)
    
    return IssueFieldValueResponse(
        issue_key=issue_key,
        field=field,
        value=value
    )


def bulk_update_issue_field(
    url_credential_key: str,
    token_credential_key: str,
    issue_keys: List[str],
    fields: Dict[str, Any],
    username_credential_key: str = "",
    cloud: bool = False,
) -> BulkUpdateResponse:
    """
    Update the same fields across multiple issues in a single operation.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_keys: List of issue keys to update
        fields: Dictionary of field names/IDs and their new values
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        BulkUpdateResponse with update results and count
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.bulk_update_issue_field(issue_keys, fields)
    
    return BulkUpdateResponse(
        updated_count=len(issue_keys),
        issue_keys=issue_keys,
        message=f"Successfully updated {len(issue_keys)} issues"
    )


def append_issue_field_value(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    field: str,
    value: Dict[str, Any],
    username_credential_key: str = "",
    notify_users: bool = True,
    cloud: bool = False,
) -> AppendFieldValueResponse:
    """
    Append a new value to an existing field (useful for multi-value fields).

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        field: Field name or ID
        value: Value to append
        username_credential_key: Credential key for username (Cloud only, default: "")
        notify_users: Whether to notify users of the change (default: True)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AppendFieldValueResponse with success message
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.issue_field_value_append(issue_key, field, value, notify_users=notify_users)
    
    return AppendFieldValueResponse(
        issue_key=issue_key,
        field=field,
        message=f"Successfully appended value to field '{field}' in issue {issue_key}"
    )


def get_custom_fields(
    url_credential_key: str,
    token_credential_key: str,
    username_credential_key: str = "",
    search: Optional[str] = None,
    start: int = 1,
    limit: int = 50,
    cloud: bool = False,
) -> CustomFieldsResponse:
    """
    Get a list of custom fields, optionally filtered by search term.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        username_credential_key: Credential key for username (Cloud only, default: "")
        search: Search term to filter custom fields (optional)
        start: Starting index (default: 1)
        limit: Maximum results per page (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CustomFieldsResponse with list of custom fields and pagination info
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    fields_data = client.get_custom_fields(search=search, start=start, limit=limit)
    
    # Parse custom fields
    fields = [CustomFieldInfo(**field) for field in fields_data]
    
    return CustomFieldsResponse(
        fields=fields,
        total=len(fields),
        start=start,
        limit=limit
    )


def issue_exists(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> IssueExistsResponse:
    """
    Check if an issue with the given key exists.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key to check (e.g., "PROJ-123")
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        IssueExistsResponse with existence status (exists: bool)
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    exists = client.issue_exists(issue_key)
    
    return IssueExistsResponse(
        issue_key=issue_key,
        exists=exists
    )


def issue_deleted(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> IssueDeletedResponse:
    """
    Check if an issue has been deleted.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key to check (e.g., "PROJ-123")
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        IssueDeletedResponse with deletion status (deleted: bool)
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    deleted = client.issue_deleted(issue_key)
    
    return IssueDeletedResponse(
        issue_key=issue_key,
        deleted=deleted
    )


def update_issue_with_history_metadata(
    url_credential_key: str,
    token_credential_key: str,
    issue_key: str,
    username_credential_key: str = "",
    fields: Optional[Dict[str, Any]] = None,
    update: Optional[Dict[str, Any]] = None,
    history_metadata: Optional[Dict[str, Any]] = None,
    notify_users: bool = True,
    cloud: bool = False,
) -> UpdateWithHistoryResponse:
    """
    Update issue fields while also recording custom history metadata.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        issue_key: Issue key (e.g., "PROJ-123")
        username_credential_key: Credential key for username (Cloud only, default: "")
        fields: Dictionary of fields to update (optional)
        update: Dictionary of update operations (optional)
        history_metadata: Custom history metadata (optional)
        notify_users: Whether to notify users of the change (default: True)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateWithHistoryResponse with success message
    """
    client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
    client.update_issue_with_history_metadata(
        issue_key=issue_key,
        fields=fields or {},
        update=update or {},
        history_metadata=history_metadata or {},
        notify_users=notify_users
    )
    
    return UpdateWithHistoryResponse(
        issue_key=issue_key,
        message=f"Successfully updated issue {issue_key} with history metadata"
    )

