"""Outlook tools for Microsoft 365 MCP Server."""

from .mail import (
    list_messages,
    get_message,
    send_message,
    reply_message,
    forward_message,
    delete_message,
    move_message,
    search_messages,
    list_mail_folders,
    create_mail_folder,
)

from .calendar import (
    list_events,
    get_event,
    create_event,
    update_event,
    delete_event,
)

__all__ = [
    # Mail operations (10)
    "list_messages",
    "get_message",
    "send_message",
    "reply_message",
    "forward_message",
    "delete_message",
    "move_message",
    "search_messages",
    "list_mail_folders",
    "create_mail_folder",
    # Calendar operations (5)
    "list_events",
    "get_event",
    "create_event",
    "update_event",
    "delete_event",
]

