"""Jira Board Management Operations.

This module provides tools for managing Agile boards:
- Create, get, delete boards
- Get board configuration and properties
- Get issues for board
- Manage board properties
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from ..cache import get_jira_client


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
    board: BoardInfo = Field(..., description="Created board")
    message: str = Field(..., description="Success message")


class GetAllBoardsResponse(BaseModel):
    """Response for getting all boards."""
    boards: List[BoardInfo] = Field(..., description="List of boards")
    total: int = Field(..., description="Total number of boards")
    start: int = Field(..., description="Start index")
    max_results: int = Field(..., description="Maximum results")


class DeleteBoardResponse(BaseModel):
    """Response for deleting a board."""
    board_id: int = Field(..., description="Deleted board ID")
    message: str = Field(..., description="Success message")


class GetBoardResponse(BaseModel):
    """Response for getting a board."""
    board: Dict[str, Any] = Field(..., description="Complete board details")


class GetBoardIssuesResponse(BaseModel):
    """Response for getting board issues."""
    board_id: int = Field(..., description="Board ID")
    issues: List[Dict[str, Any]] = Field(..., description="List of issues")
    total: int = Field(..., description="Total number of issues")
    start_at: int = Field(..., description="Start index")
    max_results: int = Field(..., description="Maximum results")


class GetBoardConfigurationResponse(BaseModel):
    """Response for getting board configuration."""
    board_id: int = Field(..., description="Board ID")
    configuration: Dict[str, Any] = Field(..., description="Board configuration")


class GetBoardPropertiesResponse(BaseModel):
    """Response for getting board properties."""
    board_id: int = Field(..., description="Board ID")
    properties: Dict[str, Any] = Field(..., description="Board properties")


class SetBoardPropertyResponse(BaseModel):
    """Response for setting a board property."""
    board_id: int = Field(..., description="Board ID")
    property_key: str = Field(..., description="Property key")
    message: str = Field(..., description="Success message")


class GetBoardPropertyResponse(BaseModel):
    """Response for getting a board property."""
    board_id: int = Field(..., description="Board ID")
    property_key: str = Field(..., description="Property key")
    value: Any = Field(..., description="Property value")


class DeleteBoardPropertyResponse(BaseModel):
    """Response for deleting a board property."""
    board_id: int = Field(..., description="Board ID")
    property_key: str = Field(..., description="Property key")
    message: str = Field(..., description="Success message")


# ============================================================================
# Tools
# ============================================================================

def create_agile_board(
    url: str,
    api_token: str,
    name: str,
    board_type: str,
    filter_id: int,
    username: str = "",
    location: Optional[Dict[str, Any]] = None,
    cloud: bool = False,
) -> CreateBoardResponse:
    """
    Create a new Agile board.

    Creates a new Scrum or Kanban board with the specified filter.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        name: Board name
        board_type: Board type ("scrum" or "kanban")
        filter_id: Filter ID to use for the board
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        location: Optional location configuration
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        CreateBoardResponse with created board

    Example:
        # Create Scrum board (Cloud)
        response = create_agile_board(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            name="Sprint Board",
            board_type="scrum",
            filter_id=10000,
            username="user@example.com",
            cloud=True
        )
        print(f"Created board: {response.board.name} (ID: {response.board.id})")

        # Create Kanban board (Server/DC)
        response = create_agile_board(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            name="Development Board",
            board_type="kanban",
            filter_id=12345,
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    board_data = client.create_agile_board(name, board_type, filter_id, location=location)
    
    # Parse board
    board = BoardInfo(**board_data)
    
    return CreateBoardResponse(
        board=board,
        message=f"Successfully created board {name}"
    )


def get_all_agile_boards(
    url: str,
    api_token: str,
    username: str = "",
    board_name: Optional[str] = None,
    project_key: Optional[str] = None,
    board_type: Optional[str] = None,
    start: int = 0,
    limit: int = 50,
    cloud: bool = False,
) -> GetAllBoardsResponse:
    """
    Get all Agile boards.

    Returns all boards that the user has permission to view.
    Supports filtering by name, project, and type.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        board_name: Filter by board name (optional)
        project_key: Filter by project key (optional)
        board_type: Filter by board type ("scrum", "kanban") (optional)
        start: Starting index (default: 0)
        limit: Maximum results (default: 50)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetAllBoardsResponse with list of boards

    Example:
        # Get all boards (Cloud)
        response = get_all_agile_boards(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            username="user@example.com",
            cloud=True
        )
        for board in response.boards:
            print(f"{board.name} ({board.type})")

        # Get Scrum boards for project (Server/DC)
        response = get_all_agile_boards(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            project_key="DGROWTH",
            board_type="scrum",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
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


def delete_agile_board(
    url: str,
    api_token: str,
    board_id: int,
    username: str = "",
    cloud: bool = False,
) -> DeleteBoardResponse:
    """
    Delete an Agile board.

    Permanently deletes a board.
    **Note:** This operation is irreversible!
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        board_id: Board ID to delete
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteBoardResponse with confirmation

    Example:
        # Delete board (Cloud)
        response = delete_agile_board(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            board_id=123,
            username="user@example.com",
            cloud=True
        )
        print(response.message)

        # Delete board (Server/DC)
        response = delete_agile_board(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            board_id=456,
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.delete_agile_board(board_id)
    
    return DeleteBoardResponse(
        board_id=board_id,
        message=f"Successfully deleted board {board_id}"
    )


def get_agile_board(
    url: str,
    api_token: str,
    board_id: int,
    username: str = "",
    cloud: bool = False,
) -> GetBoardResponse:
    """
    Get Agile board details.

    Retrieves complete information about a specific board.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        board_id: Board ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardResponse with board details

    Example:
        # Get board (Cloud)
        response = get_agile_board(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            board_id=123,
            username="user@example.com",
            cloud=True
        )
        print(f"Board: {response.board['name']}")
        print(f"Type: {response.board['type']}")

        # Get board (Server/DC)
        response = get_agile_board(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            board_id=456,
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    board_data = client.get_agile_board(board_id)
    
    return GetBoardResponse(
        board=board_data
    )


def get_issues_for_board(
    url: str,
    api_token: str,
    board_id: int,
    username: str = "",
    start_at: int = 0,
    max_results: int = 50,
    jql: Optional[str] = None,
    validate_query: bool = True,
    fields: Optional[str] = None,
    expand: Optional[str] = None,
    cloud: bool = False,
) -> GetBoardIssuesResponse:
    """
    Get issues for an Agile board.

    Retrieves all issues on a board with optional JQL filtering.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        board_id: Board ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        start_at: Starting index (default: 0)
        max_results: Maximum results (default: 50)
        jql: Optional JQL query to filter issues
        validate_query: Validate JQL query (default: True)
        fields: Comma-separated list of fields to return (optional)
        expand: Comma-separated list of parameters to expand (optional)
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardIssuesResponse with board issues

    Example:
        # Get board issues (Cloud)
        response = get_issues_for_board(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            board_id=123,
            username="user@example.com",
            jql="status = 'In Progress'",
            max_results=100,
            cloud=True
        )
        print(f"Found {response.total} issues")
        for issue in response.issues:
            print(f"  {issue['key']}: {issue['fields']['summary']}")

        # Get board issues (Server/DC)
        response = get_issues_for_board(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            board_id=456,
            fields="summary,status,assignee",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
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


def get_agile_board_configuration(
    url: str,
    api_token: str,
    board_id: int,
    username: str = "",
    cloud: bool = False,
) -> GetBoardConfigurationResponse:
    """
    Get Agile board configuration.

    Retrieves the configuration settings for a board.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        board_id: Board ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardConfigurationResponse with board configuration

    Example:
        # Get board configuration (Cloud)
        response = get_agile_board_configuration(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            board_id=123,
            username="user@example.com",
            cloud=True
        )
        print(f"Configuration: {response.configuration}")

        # Get board configuration (Server/DC)
        response = get_agile_board_configuration(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            board_id=456,
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    config_data = client.get_agile_board_configuration(board_id)
    
    return GetBoardConfigurationResponse(
        board_id=board_id,
        configuration=config_data
    )


def get_agile_board_properties(
    url: str,
    api_token: str,
    board_id: int,
    username: str = "",
    cloud: bool = False,
) -> GetBoardPropertiesResponse:
    """
    Get all board properties.

    Retrieves all custom properties set on a board.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        board_id: Board ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardPropertiesResponse with all board properties

    Example:
        # Get board properties (Cloud)
        response = get_agile_board_properties(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            board_id=123,
            username="user@example.com",
            cloud=True
        )
        print(f"Properties: {response.properties}")

        # Get board properties (Server/DC)
        response = get_agile_board_properties(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            board_id=456,
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    properties_data = client.get_agile_board_properties(board_id)
    
    return GetBoardPropertiesResponse(
        board_id=board_id,
        properties=properties_data
    )


def set_agile_board_property(
    url: str,
    api_token: str,
    board_id: int,
    property_key: str,
    value: Any,
    username: str = "",
    cloud: bool = False,
) -> SetBoardPropertyResponse:
    """
    Set a board property.

    Sets a custom property on a board.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        board_id: Board ID
        property_key: Property key
        value: Property value
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        SetBoardPropertyResponse with confirmation

    Example:
        # Set board property (Cloud)
        response = set_agile_board_property(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            board_id=123,
            property_key="team_size",
            value=8,
            username="user@example.com",
            cloud=True
        )

        # Set board property (Server/DC)
        response = set_agile_board_property(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            board_id=456,
            property_key="sprint_length",
            value="2 weeks",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.set_agile_board_property(board_id, property_key, value)
    
    return SetBoardPropertyResponse(
        board_id=board_id,
        property_key=property_key,
        message=f"Successfully set property {property_key} on board {board_id}"
    )


def get_agile_board_property(
    url: str,
    api_token: str,
    board_id: int,
    property_key: str,
    username: str = "",
    cloud: bool = False,
) -> GetBoardPropertyResponse:
    """
    Get a specific board property.

    Retrieves the value of a specific board property.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        board_id: Board ID
        property_key: Property key
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetBoardPropertyResponse with property value

    Example:
        # Get board property (Cloud)
        response = get_agile_board_property(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            board_id=123,
            property_key="team_size",
            username="user@example.com",
            cloud=True
        )
        print(f"Team size: {response.value}")

        # Get board property (Server/DC)
        response = get_agile_board_property(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            board_id=456,
            property_key="sprint_length",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    value = client.get_agile_board_property(board_id, property_key)
    
    return GetBoardPropertyResponse(
        board_id=board_id,
        property_key=property_key,
        value=value
    )


def delete_agile_board_property(
    url: str,
    api_token: str,
    board_id: int,
    property_key: str,
    username: str = "",
    cloud: bool = False,
) -> DeleteBoardPropertyResponse:
    """
    Delete a board property.

    Removes a custom property from a board.
    Authentication is token-based:
    - For Jira Cloud (cloud=True): Use username (email) and API token.
    - For Jira Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Jira instance URL
        api_token: API token (Cloud) or Personal Access Token/PAT (Server/Data Center)
        board_id: Board ID
        property_key: Property key to delete
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Jira Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        DeleteBoardPropertyResponse with confirmation

    Example:
        # Delete board property (Cloud)
        response = delete_agile_board_property(
            url="https://yoursite.atlassian.net",
            api_token="your_api_token",
            board_id=123,
            property_key="team_size",
            username="user@example.com",
            cloud=True
        )

        # Delete board property (Server/DC)
        response = delete_agile_board_property(
            url="https://jira.corp.company.com",
            api_token="your_pat",
            board_id=456,
            property_key="sprint_length",
            cloud=False
        )
    """
    client = get_jira_client(url, username, api_token, cloud=cloud)
    client.delete_agile_board_property(board_id, property_key)
    
    return DeleteBoardPropertyResponse(
        board_id=board_id,
        property_key=property_key,
        message=f"Successfully deleted property {property_key} from board {board_id}"
    )

