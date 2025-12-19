"""Databricks MCP Server using FastMCP.

This server accepts credentials (host + token) as parameters in each tool call,
allowing agents to interact with user-specific Databricks workspaces.
"""

from fastmcp import FastMCP
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastMCP server
mcp = FastMCP("Databricks MCP Server")

# ============================================================================
# Import and register tools by category
# ============================================================================

from tools.queries import list_queries, get_query
from tools.jobs import list_jobs, get_job, trigger_job
from tools.clusters import list_clusters, get_cluster
from tools.notebooks import (
    list_notebooks,
    get_notebook,
    import_notebook,
    delete_notebook,
    create_notebook,
    get_notebook_status,
)
from tools.workspace import list_workspace_files

# Register Query Tools
mcp.tool()(list_queries)
mcp.tool()(get_query)

# Register Job Tools
mcp.tool()(list_jobs)
mcp.tool()(get_job)
mcp.tool()(trigger_job)

# Register Cluster Tools
mcp.tool()(list_clusters)
mcp.tool()(get_cluster)

# Register Notebook Tools
mcp.tool()(list_notebooks)
mcp.tool()(get_notebook)
mcp.tool()(import_notebook)
mcp.tool()(delete_notebook)
mcp.tool()(create_notebook)
mcp.tool()(get_notebook_status)

# Register Workspace Tools
mcp.tool()(list_workspace_files)

# ============================================================================
# Server Entry Point
# ============================================================================

if __name__ == "__main__":
    # Run the MCP server
    mcp.run()
