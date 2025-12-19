"""Databricks MCP tools organized by category."""

from .queries import (
    list_queries,
    get_query,
    create_query,
    update_query,
    delete_query,
    list_query_visualizations,
)
from .query_history import list_query_history
from .statement_execution import (
    execute_statement,
    get_statement,
    get_statement_result_chunk,
    cancel_execution,
)
from .warehouses import (
    list_warehouses,
    get_warehouse,
    create_warehouse,
    update_warehouse,
    delete_warehouse,
    start_warehouse,
    stop_warehouse,
)
from .secrets import (
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
from .repos import (
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
from .jobs import (
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
from .clusters import (
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
from .notebooks import (
    list_notebooks,
    get_notebook,
    import_notebook,
    delete_notebook,
    create_notebook,
    get_notebook_status,
)
from .cells import (
    get_notebook_cells,
    get_notebook_cell,
    search_notebook_cells,
    insert_notebook_cell,
    update_notebook_cell,
    delete_notebook_cell,
    reorder_notebook_cells,
)
from .url_utils import resolve_notebook_from_url
from .workspace import list_workspace_files
from .directories import (
    list_directories,
    create_directory,
    delete_directory,
    get_directory_info,
    get_directory_tree,
    get_directory_stats,
    search_directories,
)
from .unity_catalog.tables import (
    list_tables,
    list_table_summaries,
    get_table,
    table_exists,
    delete_table,
    update_table_owner,
)
from .unity_catalog.schemas import (
    list_schemas,
    get_schema,
    create_schema,
    delete_schema,
    update_schema,
)
from .unity_catalog.catalogs import (
    list_catalogs,
    get_catalog,
    create_catalog,
    delete_catalog,
    update_catalog,
)
from .unity_catalog.functions import (
    list_functions,
    get_function,
    create_function,
    delete_function,
    update_function_owner,
)
from .unity_catalog.volumes import (
    list_volumes,
    get_volume,
    create_volume,
    delete_volume,
    update_volume,
)
from .unity_catalog.external_lineage import (
    list_external_lineage,
    create_external_lineage,
    delete_external_lineage,
    update_external_lineage,
)

__all__ = [
    # Query tools
    'list_queries',
    'get_query',
    'create_query',
    'update_query',
    'delete_query',
    'list_query_visualizations',
    # Query history tools
    'list_query_history',
    # Statement execution tools
    'execute_statement',
    'get_statement',
    'get_statement_result_chunk',
    'cancel_execution',
    # Warehouse tools
    'list_warehouses',
    'get_warehouse',
    'create_warehouse',
    'update_warehouse',
    'delete_warehouse',
    'start_warehouse',
    'stop_warehouse',
    # Secrets tools
    'list_secret_scopes',
    'create_secret_scope',
    'delete_secret_scope',
    'list_secrets',
    'put_secret',
    'delete_secret',
    'list_secret_acls',
    'get_secret_acl',
    'put_secret_acl',
    'delete_secret_acl',
    # Git Repos tools
    'list_repos',
    'get_repo',
    'create_repo',
    'update_repo',
    'delete_repo',
    'get_repo_permissions',
    'set_repo_permissions',
    'update_repo_permissions',
    'get_repo_permission_levels',
    # Job tools
    'list_jobs',
    'get_job',
    'create_job',
    'update_job',
    'reset_job',
    'delete_job',
    'run_now',
    'submit_run',
    'get_run',
    'list_runs',
    'cancel_run',
    'cancel_all_runs',
    'delete_run',
    'repair_run',
    'get_run_output',
    'export_run',
    'get_job_permissions',
    'set_job_permissions',
    'update_job_permissions',
    'get_job_permission_levels',
    # Cluster tools
    'list_clusters',
    'get_cluster',
    'create_cluster',
    'edit_cluster',
    'delete_cluster',
    'permanent_delete_cluster',
    'start_cluster',
    'restart_cluster',
    'get_cluster_permissions',
    'set_cluster_permissions',
    'update_cluster_permissions',
    'get_cluster_permission_levels',
    # Notebook tools
    'list_notebooks',
    'get_notebook',
    'import_notebook',
    'delete_notebook',
    'create_notebook',
    'get_notebook_status',
    # Cell tools
    'get_notebook_cells',
    'get_notebook_cell',
    'search_notebook_cells',
    'insert_notebook_cell',
    'update_notebook_cell',
    'delete_notebook_cell',
    'reorder_notebook_cells',
    # URL utilities
    'resolve_notebook_from_url',
    # Workspace tools
    'list_workspace_files',
    # Directory tools
    'list_directories',
    'create_directory',
    'delete_directory',
    'get_directory_info',
    'get_directory_tree',
    'get_directory_stats',
    'search_directories',
    # Unity Catalog - Tables tools
    'list_tables',
    'list_table_summaries',
    'get_table',
    'table_exists',
    'delete_table',
    'update_table_owner',
    # Unity Catalog - Schemas tools
    'list_schemas',
    'get_schema',
    'create_schema',
    'delete_schema',
    'update_schema',
    # Unity Catalog - Catalogs tools
    'list_catalogs',
    'get_catalog',
    'create_catalog',
    'delete_catalog',
    'update_catalog',
    # Unity Catalog - Functions tools
    'list_functions',
    'get_function',
    'create_function',
    'delete_function',
    'update_function_owner',
    # Unity Catalog - Volumes tools
    'list_volumes',
    'get_volume',
    'create_volume',
    'delete_volume',
    'update_volume',
    # Unity Catalog - External Lineage tools
    'list_external_lineage',
    'create_external_lineage',
    'delete_external_lineage',
    'update_external_lineage',
]

