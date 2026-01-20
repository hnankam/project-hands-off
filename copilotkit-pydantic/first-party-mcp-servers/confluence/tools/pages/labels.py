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
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> GetPageLabelsResponse:
    """
    Get all labels on a page.

    Retrieves all labels (tags) associated with a Confluence page.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageLabelsResponse with list of labels
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
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
            labels=labels
        )
    except Exception as e:
        return GetPageLabelsResponse(
            page_id=page_id,
            labels=[],
            error_message=f"Failed to get labels for page {page_id}: {str(e)}"
        )


def add_page_label(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    label: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> AddPageLabelResponse:
    """
    Add a label to a page.

    Adds a label (tag) to a Confluence page. Creates the label if it doesn't exist.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID
        label: Label name to add
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        AddPageLabelResponse with confirmation
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        client.set_page_label(page_id=page_id, label=label)
        
        return AddPageLabelResponse(
            page_id=page_id,
            label=label,
            message=f"Successfully added label '{label}' to page {page_id}"
        )
    except Exception as e:
        return AddPageLabelResponse(
            page_id=page_id,
            label=label,
            message=None,
            error_message=f"Failed to add label '{label}' to page {page_id}: {str(e)}"
        )


def remove_page_label(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    label: str,
    username_credential_key: str = "",
    cloud: bool = False,
) -> RemovePageLabelResponse:
    """
    Remove a label from a page.

    Removes a label (tag) from a Confluence page.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID
        label: Label name to remove
        username_credential_key: Credential key for username (Cloud only, default: "")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        RemovePageLabelResponse with confirmation
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        client.remove_page_label(page_id=page_id, label=label)
        
        return RemovePageLabelResponse(
            page_id=page_id,
            label=label,
            message=f"Successfully removed label '{label}' from page {page_id}"
        )
    except Exception as e:
        return RemovePageLabelResponse(
            page_id=page_id,
            label=label,
            message=None,
            error_message=f"Failed to remove label '{label}' from page {page_id}: {str(e)}"
        )

