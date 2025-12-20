"""Jira Agile Board and Sprint Management Tools.

This package provides tools for managing Agile boards and sprints:
- Board operations (create, get, delete, configure)
- Board properties
- Sprint operations (create, update, manage issues)
- Version management for boards
"""

# Board Management
from .boards import (
    create_agile_board,
    get_all_agile_boards,
    delete_agile_board,
    get_agile_board,
    get_issues_for_board,
    get_agile_board_configuration,
    get_agile_board_properties,
    set_agile_board_property,
    get_agile_board_property,
    delete_agile_board_property,
)

# Sprint Management
from .sprints import (
    get_all_sprints_from_board,
    get_all_issues_for_sprint_in_board,
    create_sprint,
    update_sprint,
    add_issues_to_sprint,
    get_all_versions_from_board,
)

__all__ = [
    # Boards (10 tools)
    "create_agile_board",
    "get_all_agile_boards",
    "delete_agile_board",
    "get_agile_board",
    "get_issues_for_board",
    "get_agile_board_configuration",
    "get_agile_board_properties",
    "set_agile_board_property",
    "get_agile_board_property",
    "delete_agile_board_property",
    # Sprints (6 tools)
    "get_all_sprints_from_board",
    "get_all_issues_for_sprint_in_board",
    "create_sprint",
    "update_sprint",
    "add_issues_to_sprint",
    "get_all_versions_from_board",
]

