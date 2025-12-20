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
from ...cache import get_jira_client


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
    url: str,
    api_token: str,
    issue_key: str,
    field: str,
    username: str = "",
    cloud: bool = False,
) -> IssueFieldValueResponse:
    """
    Get the value of a specific issue field.

    Retrieves the current value of a single field from a Jira issue.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        field: Field name or ID (e.g., "summary", "customfield_10000")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        IssueFieldValueResponse with the field value

    Example:
        # Get summary field (Cloud)
        response = get_issue_field_value(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            field="summary",
            username="user@example.com",
            cloud=True
        )
        print(f"Summary: {response.value}")

        # Get custom field (Server/DC)
        response = get_issue_field_value(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="PROJ-456",
            field="customfield_10000",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    value = client.issue_field_value(issue_key, field)
    
    return IssueFieldValueResponse(
        issue_key=issue_key,
        field=field,
        value=value
    )


def bulk_update_issue_field(
    url: str,
    api_token: str,
    issue_keys: List[str],
    fields: Dict[str, Any],
    username: str = "",
    cloud: bool = False,
) -> BulkUpdateResponse:
    """
    Bulk update fields for multiple issues.

    Updates the same fields across multiple issues in a single operation.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_keys: List of issue keys to update
        fields: Dictionary of field names/IDs and their new values
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        BulkUpdateResponse with update results

    Example:
        # Bulk update priority (Cloud)
        response = bulk_update_issue_field(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_keys=["PROJ-1", "PROJ-2", "PROJ-3"],
            fields={"priority": {"name": "High"}},
            username="user@example.com",
            cloud=True
        )
        print(f"Updated {response.updated_count} issues")

        # Bulk add labels (Server/DC)
        response = bulk_update_issue_field(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_keys=["DGROWTH-100", "DGROWTH-101"],
            fields={"labels": ["urgent", "backend"]},
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.bulk_update_issue_field(issue_keys, fields)
    
    return BulkUpdateResponse(
        updated_count=len(issue_keys),
        issue_keys=issue_keys,
        message=f"Successfully updated {len(issue_keys)} issues"
    )


def append_issue_field_value(
    url: str,
    api_token: str,
    issue_key: str,
    field: str,
    value: Dict[str, Any],
    username: str = "",
    notify_users: bool = True,
    cloud: bool = False,
) -> AppendFieldValueResponse:
    """
    Append a value to an issue field.

    Appends a new value to an existing field (useful for multi-value fields).
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        field: Field name or ID
        value: Value to append
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        notify_users: Whether to notify users of the change (default: True)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AppendFieldValueResponse with success message

    Example:
        # Append a watcher (Cloud)
        response = append_issue_field_value(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            field="customfield_10000",
            value={"name": "john.doe"},
            username="user@example.com",
            cloud=True
        )

        # Append a label (Server/DC)
        response = append_issue_field_value(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="PROJ-456",
            field="labels",
            value={"add": "new-label"},
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.issue_field_value_append(issue_key, field, value, notify_users=notify_users)
    
    return AppendFieldValueResponse(
        issue_key=issue_key,
        field=field,
        message=f"Successfully appended value to field '{field}' in issue {issue_key}"
    )


def get_custom_fields(
    url: str,
    api_token: str,
    username: str = "",
    search: Optional[str] = None,
    start: int = 1,
    limit: int = 50,
    cloud: bool = False,
) -> CustomFieldsResponse:
    """
    Get existing custom fields or find by filter.

    Retrieves a list of custom fields, optionally filtered by search term.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        search: Search term to filter custom fields (optional)
        start: Starting index (default: 1)
        limit: Maximum results per page (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CustomFieldsResponse with list of custom fields

    Example:
        # Get all custom fields (Cloud)
        response = get_custom_fields(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            username="user@example.com",
            cloud=True
        )
        for field in response.fields:
            print(f"{field.id}: {field.name}")

        # Search for specific custom fields (Server/DC)
        response = get_custom_fields(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            search="sprint",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
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
    url: str,
    api_token: str,
    issue_key: str,
    username: str = "",
    cloud: bool = False,
) -> IssueExistsResponse:
    """
    Check if an issue exists.

    Verifies whether an issue with the given key exists in Jira.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key to check (e.g., "PROJ-123")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        IssueExistsResponse with existence status

    Example:
        # Check if issue exists (Cloud)
        response = issue_exists(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            cloud=True
        )
        if response.exists:
            print("Issue exists!")

        # Check if issue exists (Server/DC)
        response = issue_exists(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-999",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    exists = client.issue_exists(issue_key)
    
    return IssueExistsResponse(
        issue_key=issue_key,
        exists=exists
    )


def issue_deleted(
    url: str,
    api_token: str,
    issue_key: str,
    username: str = "",
    cloud: bool = False,
) -> IssueDeletedResponse:
    """
    Check if an issue is deleted.

    Verifies whether an issue has been deleted from Jira.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key to check (e.g., "PROJ-123")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        IssueDeletedResponse with deletion status

    Example:
        # Check if issue is deleted (Cloud)
        response = issue_deleted(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            cloud=True
        )
        if response.deleted:
            print("Issue was deleted")

        # Check if issue is deleted (Server/DC)
        response = issue_deleted(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="DGROWTH-999",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    deleted = client.issue_deleted(issue_key)
    
    return IssueDeletedResponse(
        issue_key=issue_key,
        deleted=deleted
    )


def update_issue_with_history_metadata(
    url: str,
    api_token: str,
    issue_key: str,
    username: str = "",
    fields: Optional[Dict[str, Any]] = None,
    update: Optional[Dict[str, Any]] = None,
    history_metadata: Optional[Dict[str, Any]] = None,
    notify_users: bool = True,
    cloud: bool = False,
) -> UpdateWithHistoryResponse:
    """
    Update issue fields with history metadata.

    Updates issue fields while also recording custom history metadata.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        issue_key: Issue key (e.g., "PROJ-123")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        fields: Dictionary of fields to update (optional)
        update: Dictionary of update operations (optional)
        history_metadata: Custom history metadata (optional)
        notify_users: Whether to notify users of the change (default: True)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        UpdateWithHistoryResponse with success message

    Example:
        # Update with history metadata (Cloud)
        response = update_issue_with_history_metadata(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            issue_key="PROJ-123",
            username="user@example.com",
            fields={"summary": "Updated via API"},
            history_metadata={
                "type": "api_update",
                "description": "Updated via automation",
                "actor": {"id": "automation"}
            },
            cloud=True
        )

        # Update with history metadata (Server/DC)
        response = update_issue_with_history_metadata(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            issue_key="PROJ-456",
            fields={"priority": {"name": "High"}},
            update={"labels": [{"add": "automated"}]},
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
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

