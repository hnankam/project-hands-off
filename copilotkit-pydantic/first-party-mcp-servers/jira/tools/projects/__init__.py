"""Jira Project and Component Management Tools.

This package provides tools for managing projects and components:
- Project operations (list, get, update, delete, archive)
- Version management
- Component management
- Project issues
"""

# Project Management
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
)

# Component Management
from .components import (
    get_component,
    create_component,
    update_component,
    delete_component,
)

__all__ = [
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
]

