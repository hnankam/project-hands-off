"""Jira MCP Server Tools.

This package provides all tools for the Jira MCP server.
"""

# Issue Management Tools
from .issues import (
    # CRUD Operations (5 tools)
    create_issue,
    get_issue,
    update_issue,
    delete_issue,
    search_issues,
    # Field Operations (7 tools)
    get_issue_field_value,
    bulk_update_issue_field,
    append_issue_field_value,
    get_custom_fields,
    issue_exists,
    issue_deleted,
    update_issue_with_history_metadata,
    # Assignments & Transitions (4 tools)
    assign_issue,
    get_issue_transitions,
    transition_issue,
    set_issue_status,
    # Comments (4 tools)
    add_comment,
    get_comments,
    update_comment,
    delete_comment,
    # Links & Watchers (8 tools)
    link_issues,
    get_remote_links,
    create_remote_link,
    update_remote_link,
    delete_remote_link,
    get_watchers,
    add_watcher,
    remove_watcher,
    # Votes (3 tools)
    vote_issue,
    unvote_issue,
    get_votes,
    # Worklogs (5 tools)
    get_worklogs,
    add_worklog,
    get_worklog,
    update_worklog,
    delete_worklog,
    # Backlog/Epic (3 tools)
    move_issues_to_backlog,
    add_issues_to_backlog,
    get_epic_issues,
    # Attachments (4 tools)
    add_attachment,
    add_attachment_object,
    download_attachments_from_issue,
    get_attachments_ids_from_issue,
)

# Project Management Tools
from .projects import (
    list_projects,
    get_project,
    delete_project,
    archive_project,
    update_project,
    get_project_components,
    get_project_versions,
    add_version,
    update_version,
    get_project_issues_count,
    get_all_project_issues,
    get_component,
    create_component,
    update_component,
    delete_component,
)

# Agile Tools (Boards & Sprints)
from .agile import (
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
    get_all_sprints_from_board,
    get_all_issues_for_sprint_in_board,
    create_sprint,
    update_sprint,
    add_issues_to_sprint,
    get_all_versions_from_board,
)

__all__ = [
    # CRUD (5 tools)
    "create_issue",
    "get_issue",
    "update_issue",
    "delete_issue",
    "search_issues",
    # Fields (7 tools)
    "get_issue_field_value",
    "bulk_update_issue_field",
    "append_issue_field_value",
    "get_custom_fields",
    "issue_exists",
    "issue_deleted",
    "update_issue_with_history_metadata",
    # Assignments & Transitions (4 tools)
    "assign_issue",
    "get_issue_transitions",
    "transition_issue",
    "set_issue_status",
    # Comments (4 tools)
    "add_comment",
    "get_comments",
    "update_comment",
    "delete_comment",
    # Links & Watchers (8 tools)
    "link_issues",
    "get_remote_links",
    "create_remote_link",
    "update_remote_link",
    "delete_remote_link",
    "get_watchers",
    "add_watcher",
    "remove_watcher",
    # Votes (3 tools)
    "vote_issue",
    "unvote_issue",
    "get_votes",
    # Worklogs (5 tools)
    "get_worklogs",
    "add_worklog",
    "get_worklog",
    "update_worklog",
    "delete_worklog",
    # Backlog/Epic (3 tools)
    "move_issues_to_backlog",
    "add_issues_to_backlog",
    "get_epic_issues",
    # Attachments (4 tools)
    "add_attachment",
    "add_attachment_object",
    "download_attachments_from_issue",
    "get_attachments_ids_from_issue",
    # Projects (11 tools)
    "list_projects",
    "get_project",
    "delete_project",
    "archive_project",
    "update_project",
    "get_project_components",
    "get_project_versions",
    "add_version",
    "update_version",
    "get_project_issues_count",
    "get_all_project_issues",
    # Components (4 tools)
    "get_component",
    "create_component",
    "update_component",
    "delete_component",
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
