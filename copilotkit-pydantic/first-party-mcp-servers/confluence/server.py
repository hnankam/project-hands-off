"""
Confluence MCP Server

This server provides tools for interacting with Confluence through the Model Context Protocol (MCP).
It enables AI agents to manage Confluence pages, spaces, comments, and search content programmatically.

## Credential Resolution

All tools use credential KEYS rather than raw credentials:
- url_credential_key: Key for the Confluence instance URL
- token_credential_key: Key for the API token or PAT
- username_credential_key: Key for username (Cloud only)

These keys are resolved at runtime from a secure credential store, ensuring:
- Credentials are never hardcoded or exposed in function calls
- Centralized credential management and rotation
- Audit trail for credential usage
- Multi-tenant support via unique credential keys

## Authentication Methods

1. **Confluence Cloud** (cloud=True):
   - Requires: username (email) + API token
   - Get token: https://id.atlassian.com/manage-profile/security/api-tokens

2. **Confluence Server/Data Center** (cloud=False):
   - Requires: Personal Access Token (PAT) only
   - Get PAT: Profile → Personal Access Tokens → Create token
"""

from fastmcp import FastMCP
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastMCP server
mcp = FastMCP("Confluence MCP Server")

# ============================================================================
# Import and register tools by category
# ============================================================================

from tools.pages import (
    # Page CRUD (7 tools)
    get_page,
    get_page_by_title,
    create_page,
    update_page,
    delete_page,
    get_page_children,
    get_page_ancestors,
    # Page Labels (3 tools)
    get_page_labels,
    add_page_label,
    remove_page_label,
    # Page Attachments (3 tools)
    get_page_attachments,
    upload_attachment,
    delete_attachment,
)

from tools.spaces import (
    # Space Management (6 tools)
    list_spaces,
    get_space,
    create_space,
    update_space,
    delete_space,
    get_space_content,
)

from tools.search import (
    # Search & Content (4 tools)
    search_content,
    get_page_content,
    get_page_history,
    export_page,
    # Comments (4 tools)
    get_page_comments,
    add_comment,
    update_comment,
    delete_comment,
)

# Register Page CRUD Tools (7)
mcp.tool()(get_page)
mcp.tool()(get_page_by_title)
mcp.tool()(create_page)
mcp.tool()(update_page)
mcp.tool()(delete_page)
mcp.tool()(get_page_children)
mcp.tool()(get_page_ancestors)

# Register Page Label Tools (3)
mcp.tool()(get_page_labels)
mcp.tool()(add_page_label)
mcp.tool()(remove_page_label)

# Register Page Attachment Tools (3)
mcp.tool()(get_page_attachments)
mcp.tool()(upload_attachment)
mcp.tool()(delete_attachment)

# Register Space Management Tools (6)
mcp.tool()(list_spaces)
mcp.tool()(get_space)
mcp.tool()(create_space)
mcp.tool()(update_space)
mcp.tool()(delete_space)
mcp.tool()(get_space_content)

# Register Search & Content Tools (4)
mcp.tool()(search_content)
mcp.tool()(get_page_content)
mcp.tool()(get_page_history)
mcp.tool()(export_page)

# Register Comment Tools (4)
mcp.tool()(get_page_comments)
mcp.tool()(add_comment)
mcp.tool()(update_comment)
mcp.tool()(delete_comment)

# ============================================================================
# Server Entry Point
# ============================================================================

if __name__ == "__main__":
    # Run the MCP server
    mcp.run()

