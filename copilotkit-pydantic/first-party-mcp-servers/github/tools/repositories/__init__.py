"""GitHub Repository Management Tools.

This package provides tools for managing GitHub repositories:
- CRUD operations (list, get, create, delete, fork)
- Repository statistics and information
- Repository settings and configuration
"""

# CRUD Operations
from .crud import (
    list_repositories,
    get_repository,
    create_repository,
    delete_repository,
    fork_repository,
)

# Management Operations
from .management import (
    get_repository_stats,
    list_contributors,
    list_languages,
    list_topics,
    update_repository,
    archive_repository,
    unarchive_repository,
    get_clone_url,
    get_readme,
)

__all__ = [
    # CRUD (5 tools)
    "list_repositories",
    "get_repository",
    "create_repository",
    "delete_repository",
    "fork_repository",
    # Management (10 tools)
    "get_repository_stats",
    "list_contributors",
    "list_languages",
    "list_topics",
    "update_repository",
    "archive_repository",
    "unarchive_repository",
    "get_clone_url",
    "get_readme",
]

