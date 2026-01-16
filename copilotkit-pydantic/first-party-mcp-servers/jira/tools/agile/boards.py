"""Jira Board Management Operations.

This module provides tools for managing Agile boards:
- Create, get, delete boards
- Get board configuration and properties
- Get issues for board
- Manage board properties
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from cache import get_jira_client


# ============================================================================
# Pydantic Models
# ============================================================================

class BoardInfo(BaseModel):
    """Board information."""
    id: int = Field(..., description="Board ID")
    name: str = Field(..., description="Board name")
    type: str = Field(..., description="Board type (scrum, kanban)")
    self: Optional[str] = Field(None, description="Board self URL")


class CreateBoardResponse(BaseModel):
    """Response for creating a board."""
    board: Optional[BoardInfo] = Field(None, description="Created board")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetAllBoardsResponse(BaseModel):
    """Response for getting all boards."""
    boards: List[BoardInfo] = Field(default_factory=list, description="List of boards")
    total: int = Field(0, description="Total number of boards")
    start: int = Field(0, description="Start index")
    max_results: int = Field(0, description="Maximum results")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DeleteBoardResponse(BaseModel):
    """Response for deleting a board."""
    board_id: int = Field(..., description="Deleted board ID")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetBoardResponse(BaseModel):
    """Response for getting a board."""
    board: Optional[Dict[str, Any]] = Field(None, description="Complete board details")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetBoardIssuesResponse(BaseModel):
    """Response for getting board issues."""
    board_id: int = Field(..., description="Board ID")
    issues: List[Dict[str, Any]] = Field(default_factory=list, description="List of issues")
    total: int = Field(0, description="Total number of issues")
    start_at: int = Field(0, description="Start index")
    max_results: int = Field(0, description="Maximum results")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetBoardConfigurationResponse(BaseModel):
    """Response for getting board configuration."""
    board_id: int = Field(..., description="Board ID")
    configuration: Optional[Dict[str, Any]] = Field(None, description="Board configuration")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetBoardPropertiesResponse(BaseModel):
    """Response for getting board properties."""
    board_id: int = Field(..., description="Board ID")
    properties: Optional[Dict[str, Any]] = Field(None, description="Board properties")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class SetBoardPropertyResponse(BaseModel):
    """Response for setting a board property."""
    board_id: int = Field(..., description="Board ID")
    property_key: str = Field(..., description="Property key")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class GetBoardPropertyResponse(BaseModel):
    """Response for getting a board property."""
    board_id: int = Field(..., description="Board ID")
    property_key: str = Field(..., description="Property key")
    value: Optional[Any] = Field(None, description="Property value")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


class DeleteBoardPropertyResponse(BaseModel):
    """Response for deleting a board property."""
    board_id: int = Field(..., description="Board ID")
    property_key: str = Field(..., description="Property key")
    message: str = Field(..., description="Success message")
    error_message: Optional[str] = Field(None, description="Error message if operation failed")


# ============================================================================
# Tools
# ============================================================================

def create_agile_board(
    url_credential_key: str,
    token_credential_key: str,
    name: str,
    board_type: str,
    filter_id: int,
    username_credential_key: str = "",
    location: Optional[Dict[str, Any]] = None,
    cloud: bool = False,
) -> CreateBoardResponse:
    """
    Create a new Scrum or Kanban board with the specified filter.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        name: Board name
        board_type: Board type ("scrum" or "kanban")
        filter_id: Filter ID to use for the board
        username_credential_key: Credential key for username (Cloud only, default: "")
        location: Optional location configuration dict
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CreateBoardResponse with created board information
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        board_data = client.create_agile_board(name, board_type, filter_id, location=location)
        
        # Parse board
        board = BoardInfo(**board_data)
        
        return CreateBoardResponse(
            board=board,
            message=f"Successfully created board {name}"
        )
    except Exception as e:
        return CreateBoardResponse(
            board=None,
            message="",
            error_message=f"Failed to create board: {str(e)}"
        )


def get_all_agile_boards(
    url_credential_key: str,
    token_credential_key: str,
    username_credential_key: str = "",
    board_name: Optional[str] = None,
    project_key: Optional[str] = None,
    board_type: Optional[str] = None,
    start: int = 0,
    limit: int = 50,
    cloud: bool = False,
) -> GetAllBoardsResponse:
    """
    Get all Agile boards that the user has permission to view.
    
    Supports filtering by name, project, and type with pagination.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        username_credential_key: Credential key for username (Cloud only, default: "")
        board_name: Filter by board name (optional)
        project_key: Filter by project key (optional)
        board_type: Filter by board type ("scrum", "kanban") (optional)
        start: Starting index (default: 0)
        limit: Maximum results (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetAllBoardsResponse with list of boards and pagination info
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        boards_data = client.get_all_agile_boards(
            board_name=board_name,
            project_key=project_key,
            board_type=board_type,
            start=start,
            limit=limit
        )
        
        # Parse boards
        boards = [BoardInfo(**board) for board in boards_data.get('values', [])]
        
        return GetAllBoardsResponse(
            boards=boards,
            total=boards_data.get('total', len(boards)),
            start=boards_data.get('startAt', start),
            max_results=boards_data.get('maxResults', limit)
        )
    except Exception as e:
        return GetAllBoardsResponse(
            boards=[],
            total=0,
            start=0,
            max_results=0,
            error_message=f"Failed to get boards: {str(e)}"
        )


def delete_agile_board(
    url_credential_key: str,
    token_credential_key: str,
    board_id: int,
    username_credential_key: str = "",
    cloud: bool = False,
) -> DeleteBoardResponse:
    """
    Permanently delete an Agile board.

    **Warning:** This operation is irreversible!

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        board_id: Board ID to delete
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteBoardResponse with confirmation message
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        client.delete_agile_board(board_id)
        
        return DeleteBoardResponse(
            board_id=board_id,
            message=f"Successfully deleted board {board_id}"
        )
    except Exception as e:
        return DeleteBoardResponse(
            board_id=board_id,
            message="",
            error_message=f"Failed to delete board: {str(e)}"
        )


def get_agile_board(
    url_credential_key: str,
    token_credential_key: str,
    board_id: int,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetBoardResponse:
    """
    Get Agile board details by ID.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        board_id: Board ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardResponse with board details
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        board_data = client.get_agile_board(board_id)
        
        return GetBoardResponse(
            board=board_data
        )
    except Exception as e:
        return GetBoardResponse(
            board=None,
            error_message=f"Failed to get board: {str(e)}"
        )


def get_issues_for_board(
    url_credential_key: str,
    token_credential_key: str,
    board_id: int,
    username_credential_key: str = "",
    start_at: int = 0,
    max_results: int = 50,
    jql: Optional[str] = None,
    validate_query: bool = True,
    fields: Optional[str] = None,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetBoardIssuesResponse:
    """
    Get all issues on an Agile board with optional JQL filtering.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        board_id: Board ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        start_at: Starting index (default: 0)
        max_results: Maximum results (default: 50)
        jql: Optional JQL query to filter issues
        validate_query: Validate JQL query (default: True)
        fields: Comma-separated list of fields to return (optional)
        expand: Comma-separated list of parameters to expand (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardIssuesResponse with board issues and pagination info
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        issues_data = client.get_issues_for_board(
            board_id,
            start_at=start_at,
            max_results=max_results,
            jql=jql,
            validate_query=validate_query,
            fields=fields,
            expand=expand
        )
        
        return GetBoardIssuesResponse(
            board_id=board_id,
            issues=issues_data.get('issues', []),
            total=issues_data.get('total', 0),
            start_at=issues_data.get('startAt', start_at),
            max_results=issues_data.get('maxResults', max_results)
        )
    except Exception as e:
        return GetBoardIssuesResponse(
            board_id=board_id,
            issues=[],
            total=0,
            start_at=0,
            max_results=0,
            error_message=f"Failed to get board issues: {str(e)}"
        )


def get_agile_board_configuration(
    url_credential_key: str,
    token_credential_key: str,
    board_id: int,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetBoardConfigurationResponse:
    """
    Get Agile board configuration settings.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        board_id: Board ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardConfigurationResponse with board configuration
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        config_data = client.get_agile_board_configuration(board_id)
        
        return GetBoardConfigurationResponse(
            board_id=board_id,
            configuration=config_data
        )
    except Exception as e:
        return GetBoardConfigurationResponse(
            board_id=board_id,
            configuration=None,
            error_message=f"Failed to get board configuration: {str(e)}"
        )


def get_agile_board_properties(
    url_credential_key: str,
    token_credential_key: str,
    board_id: int,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetBoardPropertiesResponse:
    """
    Get all custom properties set on a board.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        board_id: Board ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardPropertiesResponse with all board properties
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        properties_data = client.get_agile_board_properties(board_id)
        
        return GetBoardPropertiesResponse(
            board_id=board_id,
            properties=properties_data
        )
    except Exception as e:
        return GetBoardPropertiesResponse(
            board_id=board_id,
            properties=None,
            error_message=f"Failed to get board properties: {str(e)}"
        )


def set_agile_board_property(
    url_credential_key: str,
    token_credential_key: str,
    board_id: int,
    property_key: str,
    value: Any,
    username_credential_key: str = "",
    cloud: bool = False,
) -> SetBoardPropertyResponse:
    """
    Set a custom property on a board.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        board_id: Board ID
        property_key: Property key
        value: Property value
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        SetBoardPropertyResponse with confirmation message
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        client.set_agile_board_property(board_id, property_key, value)
        
        return SetBoardPropertyResponse(
            board_id=board_id,
            property_key=property_key,
            message=f"Successfully set property {property_key} on board {board_id}"
        )
    except Exception as e:
        return SetBoardPropertyResponse(
            board_id=board_id,
            property_key=property_key,
            message="",
            error_message=f"Failed to set board property: {str(e)}"
        )


def get_agile_board_property(
    url_credential_key: str,
    token_credential_key: str,
    board_id: int,
    property_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetBoardPropertyResponse:
    """
    Get a specific board property value.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        board_id: Board ID
        property_key: Property key
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardPropertyResponse with property value
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        value = client.get_agile_board_property(board_id, property_key)
        
        return GetBoardPropertyResponse(
            board_id=board_id,
            property_key=property_key,
            value=value
        )
    except Exception as e:
        return GetBoardPropertyResponse(
            board_id=board_id,
            property_key=property_key,
            value=None,
            error_message=f"Failed to get board property: {str(e)}"
        )


def delete_agile_board_property(
    url_credential_key: str,
    token_credential_key: str,
    board_id: int,
    property_key: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> DeleteBoardPropertyResponse:
    """
    Delete a custom property from a board.

    Args:
        url_credential_key: Credential key for Jira instance URL
        token_credential_key: Credential key for API token
        board_id: Board ID
        property_key: Property key to delete
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteBoardPropertyResponse with confirmation message
    """
    try:
        client = get_jira_client(url_credential_key, token_credential_key, username_credential_key, cloud=cloud)
        client.delete_agile_board_property(board_id, property_key)
        
        return DeleteBoardPropertyResponse(
            board_id=board_id,
            property_key=property_key,
            message=f"Successfully deleted property {property_key} from board {board_id}"
        )
    except Exception as e:
        return DeleteBoardPropertyResponse(
            board_id=board_id,
            property_key=property_key,
            message="",
            error_message=f"Failed to delete board property: {str(e)}"
        )

