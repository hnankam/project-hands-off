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

from tools.queries import (
    list_queries,
    get_query,
    create_query,
    update_query,
    delete_query,
    list_query_visualizations,
)
from tools.query_history import list_query_history
from tools.statement_execution import (
    execute_statement,
    get_statement,
    get_statement_result_chunk,
    cancel_execution,
)
from tools.warehouses import (
    list_warehouses,
    get_warehouse,
    create_warehouse,
    update_warehouse,
    delete_warehouse,
    start_warehouse,
    stop_warehouse,
)
from tools.secrets import (
    list_secret_scopes,
    create_secret_scope,
    delete_secret_scope,
    list_secrets,
    put_secret,
    delete_secret,
    list_secret_acls,
    get_secret_acl,
    put_secret_acl,
    delete_secret_acl,
)
from tools.repos import (
    list_repos,
    get_repo,
    create_repo,
    update_repo,
    delete_repo,
    get_repo_permissions,
    set_repo_permissions,
    update_repo_permissions,
    get_repo_permission_levels,
)
from tools.jobs import (
    list_jobs,
    get_job,
    create_job,
    update_job,
    reset_job,
    delete_job,
    run_now,
    submit_run,
    get_run,
    list_runs,
    cancel_run,
    cancel_all_runs,
    delete_run,
    repair_run,
    get_run_output,
    export_run,
    get_job_permissions,
    set_job_permissions,
    update_job_permissions,
    get_job_permission_levels,
)
from tools.clusters import (
    list_clusters,
    get_cluster,
    create_cluster,
    edit_cluster,
    delete_cluster,
    permanent_delete_cluster,
    start_cluster,
    restart_cluster,
    get_cluster_permissions,
    set_cluster_permissions,
    update_cluster_permissions,
    get_cluster_permission_levels,
)
from tools.notebooks import (
    list_notebooks,
    get_notebook,
    import_notebook,
    delete_notebook,
    create_notebook,
    get_notebook_status,
)
from tools.cells import (
    get_notebook_cells,
    get_notebook_cell,
    search_notebook_cells,
    insert_notebook_cell,
    update_notebook_cell,
    delete_notebook_cell,
    reorder_notebook_cells,
)
from tools.url_utils import resolve_notebook_from_url
from tools.workspace import list_workspace_files
from tools.directories import (
    list_directories,
    create_directory,
    delete_directory,
    get_directory_info,
    get_directory_tree,
    get_directory_stats,
    search_directories,
)
from tools.unity_catalog.tables import (
    list_tables,
    list_table_summaries,
    get_table,
    table_exists,
    delete_table,
    update_table_owner,
)
from tools.unity_catalog.schemas import (
    list_schemas,
    get_schema,
    create_schema,
    delete_schema,
    update_schema,
)
from tools.unity_catalog.catalogs import (
    list_catalogs,
    get_catalog,
    create_catalog,
    delete_catalog,
    update_catalog,
)
from tools.unity_catalog.functions import (
    list_functions,
    get_function,
    create_function,
    delete_function,
    update_function_owner,
)
from tools.unity_catalog.volumes import (
    list_volumes,
    get_volume,
    create_volume,
    delete_volume,
    update_volume,
)
from tools.unity_catalog.external_lineage import (
    list_external_lineage,
    create_external_lineage,
    delete_external_lineage,
    update_external_lineage,
)

# Register Query Tools
mcp.tool()(list_queries)
mcp.tool()(get_query)
mcp.tool()(create_query)
mcp.tool()(update_query)
mcp.tool()(delete_query)
mcp.tool()(list_query_visualizations)

# Register Query History Tools
mcp.tool()(list_query_history)

# Register Statement Execution Tools
mcp.tool()(execute_statement)
mcp.tool()(get_statement)
mcp.tool()(get_statement_result_chunk)
mcp.tool()(cancel_execution)

# Register Warehouse Tools
mcp.tool()(list_warehouses)
mcp.tool()(get_warehouse)
mcp.tool()(create_warehouse)
mcp.tool()(update_warehouse)
mcp.tool()(delete_warehouse)
mcp.tool()(start_warehouse)
mcp.tool()(stop_warehouse)

# Register Secrets Tools
mcp.tool()(list_secret_scopes)
mcp.tool()(create_secret_scope)
mcp.tool()(delete_secret_scope)
mcp.tool()(list_secrets)
mcp.tool()(put_secret)
mcp.tool()(delete_secret)
mcp.tool()(list_secret_acls)
mcp.tool()(get_secret_acl)
mcp.tool()(put_secret_acl)
mcp.tool()(delete_secret_acl)

# Register Git Repos Tools
mcp.tool()(list_repos)
mcp.tool()(get_repo)
mcp.tool()(create_repo)
mcp.tool()(update_repo)
mcp.tool()(delete_repo)
mcp.tool()(get_repo_permissions)
mcp.tool()(set_repo_permissions)
mcp.tool()(update_repo_permissions)
mcp.tool()(get_repo_permission_levels)

# Register Job Tools
mcp.tool()(list_jobs)
mcp.tool()(get_job)
mcp.tool()(create_job)
mcp.tool()(update_job)
mcp.tool()(reset_job)
mcp.tool()(delete_job)
mcp.tool()(run_now)
mcp.tool()(submit_run)
mcp.tool()(get_run)
mcp.tool()(list_runs)
mcp.tool()(cancel_run)
mcp.tool()(cancel_all_runs)
mcp.tool()(delete_run)
mcp.tool()(repair_run)
mcp.tool()(get_run_output)
mcp.tool()(export_run)
mcp.tool()(get_job_permissions)
mcp.tool()(set_job_permissions)
mcp.tool()(update_job_permissions)
mcp.tool()(get_job_permission_levels)

# Register Cluster Tools
mcp.tool()(list_clusters)
mcp.tool()(get_cluster)
mcp.tool()(create_cluster)
mcp.tool()(edit_cluster)
mcp.tool()(delete_cluster)
mcp.tool()(permanent_delete_cluster)
mcp.tool()(start_cluster)
mcp.tool()(restart_cluster)
mcp.tool()(get_cluster_permissions)
mcp.tool()(set_cluster_permissions)
mcp.tool()(update_cluster_permissions)
mcp.tool()(get_cluster_permission_levels)

# Register Notebook Tools
mcp.tool()(list_notebooks)
mcp.tool()(get_notebook)
mcp.tool()(import_notebook)
mcp.tool()(delete_notebook)
mcp.tool()(create_notebook)
mcp.tool()(get_notebook_status)

# Register Cell Tools
mcp.tool()(get_notebook_cells)
mcp.tool()(get_notebook_cell)
mcp.tool()(search_notebook_cells)
mcp.tool()(insert_notebook_cell)
mcp.tool()(update_notebook_cell)
mcp.tool()(delete_notebook_cell)
mcp.tool()(reorder_notebook_cells)

# Register URL Utilities
mcp.tool()(resolve_notebook_from_url)

# Register Workspace Tools
mcp.tool()(list_workspace_files)

# Register Directory Tools
mcp.tool()(list_directories)
mcp.tool()(create_directory)
mcp.tool()(delete_directory)
mcp.tool()(get_directory_info)
mcp.tool()(get_directory_tree)
mcp.tool()(get_directory_stats)
mcp.tool()(search_directories)

# Register Unity Catalog - Tables Tools
mcp.tool()(list_tables)
mcp.tool()(list_table_summaries)
mcp.tool()(get_table)
mcp.tool()(table_exists)
mcp.tool()(delete_table)
mcp.tool()(update_table_owner)

# Register Unity Catalog - Schemas Tools
mcp.tool()(list_schemas)
mcp.tool()(get_schema)
mcp.tool()(create_schema)
mcp.tool()(delete_schema)
mcp.tool()(update_schema)

# Register Unity Catalog - Catalogs Tools
mcp.tool()(list_catalogs)
mcp.tool()(get_catalog)
mcp.tool()(create_catalog)
mcp.tool()(delete_catalog)
mcp.tool()(update_catalog)

# Register Unity Catalog - Functions Tools
mcp.tool()(list_functions)
mcp.tool()(get_function)
mcp.tool()(create_function)
mcp.tool()(delete_function)
mcp.tool()(update_function_owner)

# Register Unity Catalog - Volumes Tools
mcp.tool()(list_volumes)
mcp.tool()(get_volume)
mcp.tool()(create_volume)
mcp.tool()(delete_volume)
mcp.tool()(update_volume)

# Register Unity Catalog - External Lineage Tools
mcp.tool()(list_external_lineage)
mcp.tool()(create_external_lineage)
mcp.tool()(delete_external_lineage)
mcp.tool()(update_external_lineage)

# ============================================================================
# Server Entry Point
# ============================================================================

if __name__ == "__main__":
    # Run the MCP server
    mcp.run()
