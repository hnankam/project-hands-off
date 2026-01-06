"""Databricks MCP Server using FastMCP.

This server accepts credential keys (globally unique identifiers) as parameters
in each tool call. The server resolves these keys to actual credentials from the
workspace_credentials table and uses them to interact with user-specific 
Databricks workspaces.

Security: Credential values are never exposed to the agent. The agent only provides
credential keys (e.g., "my_databricks_host", "my_databricks_token"), and the server
fetches and decrypts the actual values server-side.
"""

from pathlib import Path
import os

# Load .env file before anything else
try:
    from dotenv import load_dotenv
    
    env_paths = [
        Path(__file__).parent.parent.parent / '.env',  # copilotkit-pydantic/.env
        Path(__file__).parent.parent / '.env',          # first-party-mcp-servers/.env
        Path(__file__).parent / '.env',                 # databricks/.env
    ]
    
    for env_path in env_paths:
        if env_path.exists():
            load_dotenv(env_path)
            print(f"[Databricks MCP] Loaded environment from: {env_path}")
            break
except ImportError:
    print("[Databricks MCP] Warning: python-dotenv not installed, using system env vars")

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

from tools.sql.queries import (
    list_queries,
    get_query,
    create_query,
    update_query,
    delete_query,
    list_query_visualizations,
)
from tools.sql.query_history import list_query_history
from tools.sql.statement_execution import (
    execute_statement,
    get_statement,
    get_statement_result_chunk,
    cancel_execution,
)
from tools.sql.warehouses import (
    list_warehouses,
    get_warehouse,
    create_warehouse,
    update_warehouse,
    delete_warehouse,
    start_warehouse,
    stop_warehouse,
)
from tools.unity_catalog.secrets import (
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
from tools.unity_catalog.repos import (
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
from tools.compute.jobs import (
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
from tools.compute.clusters import (
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
from tools.compute.command_execution import (
    create_execution_context,
    get_context_status,
    destroy_execution_context,
    execute_command,
    get_command_status,
    cancel_command,
)
from tools.notebooks.notebooks import (
    list_notebooks,
    get_notebook,
    import_notebook,
    delete_notebook,
    create_notebook,
    get_notebook_status,
)
from tools.notebooks.cells import (
    get_notebook_cells,
    get_notebook_cell,
    search_notebook_cells,
    insert_notebook_cell,
    update_notebook_cell,
    delete_notebook_cell,
    reorder_notebook_cells,
)
from tools.utils.url_utils import resolve_notebook_from_url
from tools.unity_catalog.workspace import list_workspace_files
from tools.notebooks.directories import (
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
from tools.unity_catalog.external_locations import (
    list_external_locations,
    get_external_location,
    create_external_location,
    update_external_location,
    delete_external_location,
)
from tools.compute.postgres import (
    list_postgres_projects,
    get_postgres_project,
    create_postgres_project,
    update_postgres_project,
    delete_postgres_project,
    list_postgres_branches,
    get_postgres_branch,
    create_postgres_branch,
    update_postgres_branch,
    delete_postgres_branch,
    list_postgres_endpoints,
    get_postgres_endpoint,
    create_postgres_endpoint,
    update_postgres_endpoint,
    delete_postgres_endpoint,
    get_postgres_operation,
)
from tools.pipelines.pipelines import (
    list_pipelines,
    get_pipeline,
    create_pipeline,
    update_pipeline,
    delete_pipeline,
    start_pipeline_update,
    stop_pipeline,
    reset_pipeline,
    list_pipeline_updates,
    get_pipeline_update,
)
from tools.machine_learning.experiments import (
    list_experiments,
    get_experiment,
    get_experiment_by_name,
    create_experiment,
    update_experiment,
    delete_experiment,
    restore_experiment,
    search_experiments,
    create_experiment_run,
    get_experiment_run,
    update_experiment_run,
    delete_experiment_run,
    restore_experiment_run,
    search_experiment_runs,
    log_metric,
    log_param,
    set_experiment_tag,
    set_run_tag,
    delete_run_tag,
)
from tools.machine_learning.model_registry import (
    list_registry_models,
    get_registry_model,
    create_registry_model,
    update_registry_model,
    delete_registry_model,
    create_model_version,
    get_model_version,
    update_model_version,
    delete_model_version,
    search_model_versions,
    get_latest_model_versions,
    transition_model_stage,
    create_transition_request,
    approve_transition_request,
    reject_transition_request,
    create_model_comment,
    update_model_comment,
    delete_model_comment,
    set_model_tag,
    delete_model_tag,
    set_model_version_tag,
    delete_model_version_tag,
    create_registry_webhook,
    update_registry_webhook,
    delete_registry_webhook,
    list_registry_webhooks,
)
from tools.machine_learning.forecasting import (
    create_forecasting_experiment,
    get_forecasting_experiment,
)
from tools.machine_learning.feature_store import (
    list_online_stores,
    get_online_store,
    create_online_store,
    update_online_store,
    delete_online_store,
    publish_table,
    delete_online_table,
)
from tools.machine_learning.feature_engineering import (
    list_features,
    get_feature,
    create_feature,
    update_feature,
    delete_feature,
    list_kafka_configs,
    get_kafka_config,
    create_kafka_config,
    update_kafka_config,
    delete_kafka_config,
    list_materialized_features,
    get_materialized_feature,
    create_materialized_feature,
    batch_create_materialized_features,
    update_materialized_feature,
    delete_materialized_feature,
)
from tools.vector_search.endpoints import (
    list_vector_search_endpoints,
    get_vector_search_endpoint,
    create_vector_search_endpoint,
    delete_vector_search_endpoint,
    update_endpoint_budget_policy,
    update_endpoint_custom_tags,
    retrieve_endpoint_metrics,
)
from tools.vector_search.indexes import (
    list_vector_search_indexes,
    get_vector_search_index,
    create_vector_search_index,
    delete_vector_search_index,
    query_vector_search_index,
    query_vector_search_next_page,
    scan_vector_search_index,
    upsert_vector_search_data,
    delete_vector_search_data,
    sync_vector_search_index,
)
from tools.unity_catalog.data_quality import (
    create_data_quality_monitor,
    get_data_quality_monitor,
    update_data_quality_monitor,
    delete_data_quality_monitor,
    list_data_quality_monitors,
    create_data_quality_refresh,
    get_data_quality_refresh,
    list_data_quality_refreshes,
    cancel_data_quality_refresh,
)
from tools.accounts.billing import download_billable_usage
from tools.accounts.metastores import (
    create_account_metastore,
    get_account_metastore,
    list_account_metastores,
    update_account_metastore,
    delete_account_metastore,
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

# Register Unity Catalog - External Locations Tools
mcp.tool()(list_external_locations)
mcp.tool()(get_external_location)
mcp.tool()(create_external_location)
mcp.tool()(update_external_location)
mcp.tool()(delete_external_location)

# Register Postgres Tools
mcp.tool()(list_postgres_projects)
mcp.tool()(get_postgres_project)
mcp.tool()(create_postgres_project)
mcp.tool()(update_postgres_project)
mcp.tool()(delete_postgres_project)
mcp.tool()(list_postgres_branches)
mcp.tool()(get_postgres_branch)
mcp.tool()(create_postgres_branch)
mcp.tool()(update_postgres_branch)
mcp.tool()(delete_postgres_branch)
mcp.tool()(list_postgres_endpoints)
mcp.tool()(get_postgres_endpoint)
mcp.tool()(create_postgres_endpoint)
mcp.tool()(update_postgres_endpoint)
mcp.tool()(delete_postgres_endpoint)
mcp.tool()(get_postgres_operation)

# Register Command Execution Tools
mcp.tool()(create_execution_context)
mcp.tool()(get_context_status)
mcp.tool()(destroy_execution_context)
mcp.tool()(execute_command)
mcp.tool()(get_command_status)
mcp.tool()(cancel_command)

# Register Pipelines (Delta Live Tables) Tools
mcp.tool()(list_pipelines)
mcp.tool()(get_pipeline)
mcp.tool()(create_pipeline)
mcp.tool()(update_pipeline)
mcp.tool()(delete_pipeline)
mcp.tool()(start_pipeline_update)
mcp.tool()(stop_pipeline)
mcp.tool()(reset_pipeline)
mcp.tool()(list_pipeline_updates)
mcp.tool()(get_pipeline_update)

# Register Machine Learning (MLflow Experiments) Tools
mcp.tool()(list_experiments)
mcp.tool()(get_experiment)
mcp.tool()(get_experiment_by_name)
mcp.tool()(create_experiment)
mcp.tool()(update_experiment)
mcp.tool()(delete_experiment)
mcp.tool()(restore_experiment)
mcp.tool()(search_experiments)
mcp.tool()(create_experiment_run)
mcp.tool()(get_experiment_run)
mcp.tool()(update_experiment_run)
mcp.tool()(delete_experiment_run)
mcp.tool()(restore_experiment_run)
mcp.tool()(search_experiment_runs)
mcp.tool()(log_metric)
mcp.tool()(log_param)
mcp.tool()(set_experiment_tag)
mcp.tool()(set_run_tag)
mcp.tool()(delete_run_tag)

# Register Machine Learning (Model Registry) Tools
mcp.tool()(list_registry_models)
mcp.tool()(get_registry_model)
mcp.tool()(create_registry_model)
mcp.tool()(update_registry_model)
mcp.tool()(delete_registry_model)
mcp.tool()(create_model_version)
mcp.tool()(get_model_version)
mcp.tool()(update_model_version)
mcp.tool()(delete_model_version)
mcp.tool()(search_model_versions)
mcp.tool()(get_latest_model_versions)
mcp.tool()(transition_model_stage)
mcp.tool()(create_transition_request)
mcp.tool()(approve_transition_request)
mcp.tool()(reject_transition_request)
mcp.tool()(create_model_comment)
mcp.tool()(update_model_comment)
mcp.tool()(delete_model_comment)
mcp.tool()(set_model_tag)
mcp.tool()(delete_model_tag)
mcp.tool()(set_model_version_tag)
mcp.tool()(delete_model_version_tag)
mcp.tool()(create_registry_webhook)
mcp.tool()(update_registry_webhook)
mcp.tool()(delete_registry_webhook)
mcp.tool()(list_registry_webhooks)

# Register Machine Learning (Forecasting) Tools
mcp.tool()(create_forecasting_experiment)
mcp.tool()(get_forecasting_experiment)

# Register Machine Learning (Feature Store) Tools
mcp.tool()(list_online_stores)
mcp.tool()(get_online_store)
mcp.tool()(create_online_store)
mcp.tool()(update_online_store)
mcp.tool()(delete_online_store)
mcp.tool()(publish_table)
mcp.tool()(delete_online_table)

# Register Machine Learning (Feature Engineering) Tools
mcp.tool()(list_features)
mcp.tool()(get_feature)
mcp.tool()(create_feature)
mcp.tool()(update_feature)
mcp.tool()(delete_feature)
mcp.tool()(list_kafka_configs)
mcp.tool()(get_kafka_config)
mcp.tool()(create_kafka_config)
mcp.tool()(update_kafka_config)
mcp.tool()(delete_kafka_config)
mcp.tool()(list_materialized_features)
mcp.tool()(get_materialized_feature)
mcp.tool()(create_materialized_feature)
mcp.tool()(batch_create_materialized_features)
mcp.tool()(update_materialized_feature)
mcp.tool()(delete_materialized_feature)

# Register Vector Search (Endpoints) Tools
mcp.tool()(list_vector_search_endpoints)
mcp.tool()(get_vector_search_endpoint)
mcp.tool()(create_vector_search_endpoint)
mcp.tool()(delete_vector_search_endpoint)
mcp.tool()(update_endpoint_budget_policy)
mcp.tool()(update_endpoint_custom_tags)
mcp.tool()(retrieve_endpoint_metrics)

# Register Vector Search (Indexes) Tools
mcp.tool()(list_vector_search_indexes)
mcp.tool()(get_vector_search_index)
mcp.tool()(create_vector_search_index)
mcp.tool()(delete_vector_search_index)
mcp.tool()(query_vector_search_index)
mcp.tool()(query_vector_search_next_page)
mcp.tool()(scan_vector_search_index)
mcp.tool()(upsert_vector_search_data)
mcp.tool()(delete_vector_search_data)
mcp.tool()(sync_vector_search_index)

# Register Data Quality Tools
mcp.tool()(create_data_quality_monitor)
mcp.tool()(get_data_quality_monitor)
mcp.tool()(update_data_quality_monitor)
mcp.tool()(delete_data_quality_monitor)
mcp.tool()(list_data_quality_monitors)
mcp.tool()(create_data_quality_refresh)
mcp.tool()(get_data_quality_refresh)
mcp.tool()(list_data_quality_refreshes)
mcp.tool()(cancel_data_quality_refresh)

# Register Account Billing Tools
mcp.tool()(download_billable_usage)

# Register Account Metastores Tools
mcp.tool()(create_account_metastore)
mcp.tool()(get_account_metastore)
mcp.tool()(list_account_metastores)
mcp.tool()(update_account_metastore)
mcp.tool()(delete_account_metastore)

# ============================================================================
# Server Entry Point
# ============================================================================

if __name__ == "__main__":
    # Run the MCP server
    mcp.run()
