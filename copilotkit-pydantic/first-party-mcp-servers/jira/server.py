"""
Jira MCP Server

This server provides tools for interacting with Jira through the Model Context Protocol (MCP).
It enables AI agents to manage Jira issues, projects, boards, and workflows programmatically.
"""

from fastmcp import FastMCP
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastMCP server
mcp = FastMCP("Jira MCP Server")

# ============================================================================
# Import and register tools by category
# ============================================================================

from tools.issues import (
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

# Projects & Components
from tools.projects import (
    # Projects (11 tools)
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
    # Components (4 tools)
    get_component,
    create_component,
    update_component,
    delete_component,
)

# Agile (Boards & Sprints)
from tools.agile import (
    # Boards (10 tools)
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
    # Sprints (6 tools)
    get_all_sprints_from_board,
    get_all_issues_for_sprint_in_board,
    create_sprint,
    update_sprint,
    add_issues_to_sprint,
    get_all_versions_from_board,
)

# Register CRUD Tools (5)
mcp.tool()(create_issue)
mcp.tool()(get_issue)
mcp.tool()(update_issue)
mcp.tool()(delete_issue)
mcp.tool()(search_issues)

# Register Field Operations (7)
mcp.tool()(get_issue_field_value)
mcp.tool()(bulk_update_issue_field)
mcp.tool()(append_issue_field_value)
mcp.tool()(get_custom_fields)
mcp.tool()(issue_exists)
mcp.tool()(issue_deleted)
mcp.tool()(update_issue_with_history_metadata)

# Register Assignments & Transitions (4)
mcp.tool()(assign_issue)
mcp.tool()(get_issue_transitions)
mcp.tool()(transition_issue)
mcp.tool()(set_issue_status)

# Register Comments (4)
mcp.tool()(add_comment)
mcp.tool()(get_comments)
mcp.tool()(update_comment)
mcp.tool()(delete_comment)

# Register Links & Watchers (8)
mcp.tool()(link_issues)
mcp.tool()(get_remote_links)
mcp.tool()(create_remote_link)
mcp.tool()(update_remote_link)
mcp.tool()(delete_remote_link)
mcp.tool()(get_watchers)
mcp.tool()(add_watcher)
mcp.tool()(remove_watcher)

# Register Votes (3)
mcp.tool()(vote_issue)
mcp.tool()(unvote_issue)
mcp.tool()(get_votes)

# Register Worklogs (5)
mcp.tool()(get_worklogs)
mcp.tool()(add_worklog)
mcp.tool()(get_worklog)
mcp.tool()(update_worklog)
mcp.tool()(delete_worklog)

# Register Backlog/Epic (3)
mcp.tool()(move_issues_to_backlog)
mcp.tool()(add_issues_to_backlog)
mcp.tool()(get_epic_issues)

# Register Attachments (4)
mcp.tool()(add_attachment)
mcp.tool()(add_attachment_object)
mcp.tool()(download_attachments_from_issue)
mcp.tool()(get_attachments_ids_from_issue)

# Register Projects (11)
mcp.tool()(list_projects)
mcp.tool()(get_project)
mcp.tool()(delete_project)
mcp.tool()(archive_project)
mcp.tool()(update_project)
mcp.tool()(get_project_components)
mcp.tool()(get_project_versions)
mcp.tool()(add_version)
mcp.tool()(update_version)
mcp.tool()(get_project_issues_count)
mcp.tool()(get_all_project_issues)

# Register Components (4)
mcp.tool()(get_component)
mcp.tool()(create_component)
mcp.tool()(update_component)
mcp.tool()(delete_component)

# Register Boards (10)
mcp.tool()(create_agile_board)
mcp.tool()(get_all_agile_boards)
mcp.tool()(delete_agile_board)
mcp.tool()(get_agile_board)
mcp.tool()(get_issues_for_board)
mcp.tool()(get_agile_board_configuration)
mcp.tool()(get_agile_board_properties)
mcp.tool()(set_agile_board_property)
mcp.tool()(get_agile_board_property)
mcp.tool()(delete_agile_board_property)

# Register Sprints (6)
mcp.tool()(get_all_sprints_from_board)
mcp.tool()(get_all_issues_for_sprint_in_board)
mcp.tool()(create_sprint)
mcp.tool()(update_sprint)
mcp.tool()(add_issues_to_sprint)
mcp.tool()(get_all_versions_from_board)

# ============================================================================
# Server Entry Point
# ============================================================================

if __name__ == "__main__":
    # Run the MCP server
    mcp.run()

