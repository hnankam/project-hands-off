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
    url: str,
    api_token: str,
    cql: str,
    username: str = "",
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
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        cql: CQL query string (e.g., "type=page AND space=DOCS")
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        expand: Comma-separated list of fields to expand
        include_archived_spaces: Include results from archived spaces (default: False)
        excerpt: Excerpt strategy ("highlight", "none") (default: "highlight")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        SearchContentResponse with search results

    Example:
        # Search for pages in a space (Cloud)
        response = search_content(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            cql="type=page AND space=DOCS AND title~'API'",
            username="user@example.com",
            limit=50,
            cloud=True
        )
        print(f"Found {response.total} results")
        for result in response.results:
            print(f"  {result['title']} - {result['url']}")

        # Search for recently updated pages (Server/DC)
        response = search_content(
            url="https://wiki.company.com",
            api_token="your_pat",
            cql="type=page AND lastModified >= now('-7d')",
            limit=100,
            cloud=False
        )

        # Search for pages with label (Cloud)
        response = search_content(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            cql="type=page AND label='documentation'",
            username="user@example.com",
            cloud=True
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
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
        total=total,
        start=start,
        limit=limit
    )


def get_page_content(
    url: str,
    api_token: str,
    page_id: str,
    username: str = "",
    format: str = "storage",
    version: Optional[int] = None,
    cloud: bool = False,
) -> GetPageContentResponse:
    """
    Get page content in specific format.

    Retrieves the content of a page in HTML (storage) or view format.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        format: Content format ("storage" for HTML source, "view" for rendered HTML) (default: "storage")
        version: Specific version number to retrieve (optional)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        GetPageContentResponse with page content

    Example:
        # Get page content in storage format (Cloud)
        response = get_page_content(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            username="user@example.com",
            format="storage",
            cloud=True
        )
        print(f"Content: {response.content}")

        # Get rendered page content (Server/DC)
        response = get_page_content(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            format="view",
            cloud=False
        )

        # Get specific version (Cloud)
        response = get_page_content(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            username="user@example.com",
            version=5,
            cloud=True
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    
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


def get_page_history(
    url: str,
    api_token: str,
    page_id: str,
    username: str = "",
    start: int = 0,
    limit: int = 25,
    cloud: bool = False,
) -> dict:
    """
    Get page version history.

    Retrieves the version history of a page.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        start: Starting index for pagination (default: 0)
        limit: Maximum results to return (default: 25)
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        Dictionary with page history

    Example:
        # Get page history (Cloud)
        response = get_page_history(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            username="user@example.com",
            limit=50,
            cloud=True
        )
        print(f"Page has {response['total']} versions")
        for version in response['versions']:
            print(f"  v{version['number']}: {version['message']} by {version['by']['displayName']}")

        # Get page history (Server/DC)
        response = get_page_history(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
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
            "versions": versions,
            "total": len(all_versions)
        }
    
    return {
        "page_id": page_id,
        "versions": [],
        "total": 0
    }


def export_page(
    url: str,
    api_token: str,
    page_id: str,
    username: str = "",
    format: str = "pdf",
    cloud: bool = False,
) -> dict:
    """
    Export page to PDF or other formats.

    Exports a Confluence page to various formats.
    **Note:** PDF export is supported, other formats may vary by Confluence version.
    Authentication is token-based:
    - For Confluence Cloud (cloud=True): Use username (email) and API token.
    - For Confluence Server/Data Center (cloud=False): Use an empty username string and a Personal Access Token (PAT).

    Args:
        url: Confluence instance URL
        api_token: API token (for Cloud) or Personal Access Token (for Server)
        page_id: Page ID
        username: Email address (required for Cloud), can be omitted for Server/Data Center (default: "")
        format: Export format ("pdf", "word") (default: "pdf")
        cloud: Whether this is Confluence Cloud (True) or Server/Data Center (False). Defaults to False.

    Returns:
        Dictionary with export information

    Example:
        # Export page to PDF (Cloud)
        response = export_page(
            url="https://yoursite.atlassian.net/wiki",
            api_token="your_api_token",
            page_id="123456",
            username="user@example.com",
            format="pdf",
            cloud=True
        )
        print(f"Export URL: {response['url']}")

        # Export page to PDF (Server/DC)
        response = export_page(
            url="https://wiki.company.com",
            api_token="your_pat",
            page_id="789012",
            cloud=False
        )
    """
    client = get_confluence_client(url, api_token, username=username, cloud=cloud)
    
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

