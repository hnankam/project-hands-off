"""Confluence Page Label Operations.

This module provides tools for managing page labels:
- Get page labels
- Add labels to page
- Remove labels from page
"""

from typing import Any, Optional, List
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_confluence_client
from models import (
    GetPageLabelsResponse,
    AddPageLabelResponse,
    RemovePageLabelResponse,
)


def get_page_labels(
    url: str,
    api_token: str,
    page_id: str,
    username: str = "",
    cloud: bool = False,
) -> GetPageLabelsResponse:
    """
    Get all labels on a page.

    Retrieves all labels (tags) associated with a Confluence page.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageLabelsResponse with list of labels

    Example:
        # Get page labels (Cloud)
        response = get_page_labels(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            username="user@example.com",
            cloud=True
        )
        print(f"Page has {response.total} labels:")
        for label in response.labels:
            print(f"  - {label['name']}")

        # Get page labels (Server/DC)
        response = get_page_labels(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    labels_data = client.get_page_labels(page_id=page_id)
    
    # Handle different response formats
    if isinstance(labels_data, dict):
        labels = labels_data.get('results', [])
    elif isinstance(labels_data, list):
        labels = labels_data
    else:
        labels = []
    
    return GetPageLabelsResponse(
        page_id=page_id,
        labels=labels,
        total=len(labels)
    )


def add_page_label(
    url: str,
    api_token: str,
    page_id: str,
    label: str,
    username: str = "",
    cloud: bool = False,
) -> AddPageLabelResponse:
    """
    Add a label to a page.

    Adds a label (tag) to a Confluence page. Creates the label if it doesn't exist.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID
        label: Label name to add
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddPageLabelResponse with confirmation

    Example:
        # Add label to page (Cloud)
        response = add_page_label(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            label="documentation",
            username="user@example.com",
            cloud=True
        )
        print(response.message)

        # Add multiple labels (Server/DC)
        for label in ["api", "reference", "v2"]:
            response = add_page_label(
                url="https://wiki.company.com",
                api_token="your_pat",
                page_id="789012",
                label=label,
                cloud=False
            )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    client.set_page_label(page_id=page_id, label=label)
    
    return AddPageLabelResponse(
        page_id=page_id,
        label=label,
        message=f"Successfully added label '{label}' to page {page_id}"
    )


def remove_page_label(
    url: str,
    api_token: str,
    page_id: str,
    label: str,
    username: str = "",
    cloud: bool = False,
) -> RemovePageLabelResponse:
    """
    Remove a label from a page.

    Removes a label (tag) from a Confluence page.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID
        label: Label name to remove
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        RemovePageLabelResponse with confirmation

    Example:
        # Remove label from page (Cloud)
        response = remove_page_label(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            label="draft",
            username="user@example.com",
            cloud=True
        )
        print(response.message)

        # Remove label (Server/DC)
        response = remove_page_label(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            label="obsolete",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    client.remove_page_label(page_id=page_id, label=label)
    
    return RemovePageLabelResponse(
        page_id=page_id,
        label=label,
        message=f"Successfully removed label '{label}' from page {page_id}"
    )

