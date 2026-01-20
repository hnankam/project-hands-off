"""Confluence Search and Content Operations.

This module provides tools for searching and retrieving content:
- Search content using CQL
- Get page content (HTML or storage format)
- Get page history
- Export content
"""

from typing import Any, Optional, List
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_confluence_client
from models import (
    SearchContentResponse,
    GetPageContentResponse,
)


def search_content(
    url_credential_key: str,
    token_credential_key: str,
    cql: str,
    username_credential_key: str = "",
    start: int = 0,
    limit: int = 25,
    expand: Optional[str] = None,
    include_archived_spaces: bool = False,
    excerpt: str = "highlight",
    cloud: bool = False,
) -> SearchContentResponse:
    """
    Search for content using CQL (Confluence Query Language).

    Searches across all accessible content using CQL queries.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        cql: CQL query string (e.g., "type=page AND space=DOCS")
        username_credential_key: Credential key for username (Cloud only, default: "")
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        expand: Comma-separated list of fields to expand
        include_archived_spaces: Include results from archived spaces (default: False)
        excerpt: Excerpt strategy ("highlight", "none") (default: "highlight")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        SearchContentResponse with search results
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        search_data = client.cql(
            cql=cql,
            start=start,
            limit=limit,
            expand=expand,
            include_archived_spaces=include_archived_spaces,
            excerpt=excerpt
        )
        
        # Handle different response formats
        if isinstance(search_data, dict):
            results = search_data.get('results', [])
            total = search_data.get('totalSize', len(results))
        else:
            results = []
            total = 0
        
        return SearchContentResponse(
            results=results,
            start=start,
            limit=len(results)
        )
    except Exception as e:
        return SearchContentResponse(
            results=[],
            start=start,
            limit=0,
            error_message=f"Failed to search content with CQL '{cql}': {str(e)}"
        )


def get_page_content(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    username_credential_key: str = "",
    format: str = "storage",
    version: Optional[int] = None,
    cloud: bool = False,
) -> GetPageContentResponse:
    """
    Get page content in specific format.

    Retrieves the content of a page in HTML (storage) or view format.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        format: Content format ("storage" for HTML source, "view" for rendered HTML) (default: "storage")
        version: Specific version number to retrieve (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageContentResponse with page content
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        
        # Get page with body expansion
        expand_param = f"body.{format}"
        if version:
            expand_param += ",version"
        
        page_data = client.get_page_by_id(
            page_id=page_id,
            expand=expand_param,
            version=version
        )
        
        # Extract content from response
        content = page_data.get('body', {}).get(format, {}).get('value', '')
        
        return GetPageContentResponse(
            page_id=page_id,
            content=content,
            format=format
        )
    except Exception as e:
        return GetPageContentResponse(
            page_id=page_id,
            content=None,
            format=format,
            error_message=f"Failed to get content for page {page_id}: {str(e)}"
        )


def get_page_history(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    username_credential_key: str = "",
    start: int = 0,
    limit: int = 25,
    cloud: bool = False,
) -> dict:
    """
    Get page version history.

    Retrieves the version history of a page.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        Dictionary with page history
    """
    try:
        client = get_confluence_client(url_credential_key, token_credential_key, username_credential_key=username_credential_key, cloud=cloud)
        history_data = client.history(page_id=page_id)
        
        # Extract versions from history
        if isinstance(history_data, dict):
            all_versions = []
            
            # Get latest versions
            latest = history_data.get('latest', {})
            if latest:
                all_versions.append(latest)
            
            # Get previous versions
            previous_versions = history_data.get('previousVersion', {})
            if previous_versions:
                all_versions.append(previous_versions)
            
            # Apply pagination
            versions = all_versions[start:start+limit]
            
            return {
                "page_id": page_id,
                "versions": versions
            }
        
        return {
            "page_id": page_id,
            "versions": []
        }
    except Exception as e:
        return {
            "page_id": page_id,
            "versions": [],
            "error": f"Failed to get history for page {page_id}: {str(e)}"
        }


def export_page(
    url_credential_key: str,
    token_credential_key: str,
    page_id: str,
    username_credential_key: str = "",
    format: str = "pdf",
    cloud: bool = False,
) -> dict:
    """
    Export page to PDF or other formats.

    Exports a Confluence page to various formats.
    **Note:** PDF export is supported, other formats may vary by Confluence version.
    
    Args:
        url_credential_key: Credential key for Confluence instance URL
        token_credential_key: Credential key for API token
        page_id: Page ID
        username_credential_key: Credential key for username (Cloud only, default: "")
        format: Export format ("pdf", "word") (default: "pdf")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        Dictionary with export information
    """
    try:
        from shared.credential_resolver import resolve_credential
        import sys
        from pathlib import Path
        
        # Resolve URL to construct export URL
        parent_path = Path(__file__).parent.parent.parent.parent
        if str(parent_path) not in sys.path:
            sys.path.insert(0, str(parent_path))
        
        url = resolve_credential(url_credential_key)
        
        # Construct export URL
        if format == "pdf":
            export_url = f"{url}/spaces/flyingpdf/pdfpageexport.action?pageId={page_id}"
        else:
            export_url = f"{url}/exportword?pageId={page_id}"
        
        return {
            "page_id": page_id,
            "format": format,
            "url": export_url,
            "message": f"Page {page_id} can be exported from {export_url}"
        }
    except Exception as e:
        return {
            "page_id": page_id,
            "format": format,
            "url": None,
            "message": None,
            "error": f"Failed to generate export URL for page {page_id}: {str(e)}"
        }

