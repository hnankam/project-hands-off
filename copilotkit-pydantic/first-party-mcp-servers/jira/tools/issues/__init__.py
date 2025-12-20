"""Jira Issue Tools.

This package provides comprehensive tools for managing Jira issues:
- CRUD operations (create, read, update, delete, search)
- Field operations (get, bulk update, append, custom fields, existence checks)
- Assignments and transitions (assign, transition, set status)
- Comments (add, get, update, delete)
- Links (issue links, remote links)
- Watchers (get, add, remove)
- Votes (vote, unvote, get votes)
- Worklogs (get, add, update, delete)
- Backlog/Epic (move to backlog, add to backlog, get epic issues)
"""

# CRUD Operations
from .crud import (
    create_issue,
    get_issue,
    update_issue,
    delete_issue,
    search_issues,
)

# Field Operations
from .fields import (
    get_issue_field_value,
    bulk_update_issue_field,
    append_issue_field_value,
    get_custom_fields,
    issue_exists,
    issue_deleted,
    update_issue_with_history_metadata,
)

# Assignments and Transitions
from .transitions import (
    assign_issue,
    get_issue_transitions,
    transition_issue,
    set_issue_status,
)

# Comments
from .comments import (
    add_comment,
    get_comments,
    update_comment,
    delete_comment,
)

# Links
from .links import (
    link_issues,
    get_remote_links,
    create_remote_link,
    update_remote_link,
    delete_remote_link,
    get_watchers,
    add_watcher,
    remove_watcher,
)

# Votes
from .votes import (
    vote_issue,
    unvote_issue,
    get_votes,
)

# Worklogs
from .worklogs import (
    get_worklogs,
    add_worklog,
    get_worklog,
    update_worklog,
    delete_worklog,
)

# Backlog/Epic
from .backlog import (
    move_issues_to_backlog,
    add_issues_to_backlog,
    get_epic_issues,
)

# Attachments
from .attachments import (
    add_attachment,
    add_attachment_object,
    download_attachments_from_issue,
    get_attachments_ids_from_issue,
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
]
