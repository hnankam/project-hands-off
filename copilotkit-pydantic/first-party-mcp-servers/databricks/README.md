# Databricks MCP Server (FastMCP)

First-party MCP server for Databricks workspace operations built with **FastMCP**.

## Features

- **SQL Queries**: List, create, update, delete queries and visualizations
- **Query History**: Monitor query executions with performance metrics
- **Statement Execution**: Execute SQL statements and fetch results
- **SQL Warehouses**: Manage compute resources (create, start, stop, configure)
- **Secrets**: Secure credential storage and access control
- **Git Repos**: Version control integration (clone, branch, permissions)
- **Jobs**: Complete orchestration (create, update, delete, run, monitor, repair)
- **Clusters**: Complete compute management (create, edit, start, stop, restart, delete)
- **Unity Catalog - Catalogs**: Create, list, update, and manage catalogs (top-level namespace)
- **Unity Catalog - Schemas**: Create, list, update, and manage schemas (databases)
- **Unity Catalog - Tables**: Discover, inspect, and manage tables (list, get, exists, delete, update owner)
- **Unity Catalog - Functions**: Create, list, and manage User-Defined Functions (UDFs)
- **Unity Catalog - Volumes**: Create, list, update, and manage file storage volumes (managed & external)
- **Unity Catalog - External Lineage**: Track data flows between Databricks and external systems with column-level lineage
- **Postgres**: Manage Postgres database projects, branches, and endpoints
- **Command Execution**: Execute Python, SQL, Scala, and R code remotely on clusters
- **Notebooks**: Create, import, export, delete, and list notebooks
- **Notebook Cells**: Read, search, insert, update, delete, and reorder individual cells
- **Directories**: Complete folder management (create, delete, list, tree, stats, search)
- **URL Resolution**: Convert Databricks URLs to workspace paths
- **Workspace**: List workspace files
- **Connection Pooling**: Automatic caching of WorkspaceClient instances
- **Type Safety**: All tools return proper Pydantic models
- **143 Total Tools**: Comprehensive Databricks automation

## Installation

```bash
cd copilotkit-pydantic/first-party-mcp-servers/databricks
pip install -r requirements.txt
```

## Running the Server

### Standard Mode (stdio)

```bash
python server.py
```

### SSE Mode (HTTP)

```bash
fastmcp run server.py --transport sse
# or shorthand:
fastmcp run server.py -t sse
```

### Development Mode

```bash
fastmcp dev server.py
```

## Usage with MCP Client

FastMCP automatically provides MCP protocol support. The server can be used via:

1. **stdio transport** - Direct process communication
2. **SSE transport** - HTTP-based streaming

### Calling Tools

Tools expect **credential keys** (not raw credential values) as parameters:

```python
# Example tool call using credential keys
result = await client.call_tool(
    "list_queries",
    arguments={
        "host_credential_key": "my_databricks_host",
        "token_credential_key": "my_databricks_token"
    }
)
```

**Security Note**: The agent never receives actual credential values. It only provides credential keys (globally unique identifiers from the `workspace_credentials` table), and the server fetches and decrypts the actual values server-side.

## Registering with Your Application

### For stdio Transport

```json
{
  "mcpServers": {
    "databricks": {
      "command": "python",
      "args": ["/path/to/server.py"],
      "env": {}
    }
  }
}
```

### For SSE Transport

```json
{
  "mcpServers": {
    "databricks": {
      "url": "http://localhost:8000/sse",
      "transport": "sse"
    }
  }
}
```

### Via Admin UI

1. Go to Admin UI → Tools → MCP Servers
2. Click "Add MCP Server"
3. Fill in:
   - **Server Key**: `databricks`
   - **Display Name**: `Databricks`
   - **Transport**: `stdio` or `sse`
   - **Command**: `python` (for stdio)
   - **Args**: `["/path/to/server.py"]` (for stdio)
   - **URL**: `http://localhost:8000/sse` (for SSE)
4. Save

## Available Tools

**Note**: All tools require `host_credential_key` and `token_credential_key` parameters (credential keys from the `workspace_credentials` table).

| Tool | Description | Additional Parameters |
|------|-------------|----------------------|
| `list_queries` | List SQL queries | `page_size` (optional), `page_token` (optional) |
| `get_query` | Get query details | `query_id` |
| `create_query` | Create new SQL query | `display_name`, `warehouse_id`, `query_text`, `description` (optional), etc. |
| `update_query` | Update existing query | `query_id`, `display_name` (optional), `query_text` (optional), etc. |
| `delete_query` | Delete query (move to trash) | `query_id` |
| `list_query_visualizations` | List query visualizations | `query_id` |
| `list_query_history` | List query execution history | `filter_by` (optional), `include_metrics` (optional), `max_results` (optional), `page_token` (optional) |
| `execute_statement` | Execute SQL and get results | `statement`, `warehouse_id`, `wait_timeout` (optional), `format` (optional), `disposition` (optional), etc. |
| `get_statement` | Poll statement status/results | `statement_id` |
| `get_statement_result_chunk` | Fetch specific result chunk | `statement_id`, `chunk_index` |
| `cancel_execution` | Cancel running statement | `statement_id` |
| `list_warehouses` | List SQL warehouses | - |
| `get_warehouse` | Get warehouse details | `warehouse_id` |
| `create_warehouse` | Create new SQL warehouse | `name`, `cluster_size` (optional), etc. |
| `update_warehouse` | Update warehouse config | `warehouse_id`, `cluster_size` (optional), etc. |
| `delete_warehouse` | Delete SQL warehouse | `warehouse_id` |
| `start_warehouse` | Start stopped warehouse | `warehouse_id` |
| `stop_warehouse` | Stop running warehouse | `warehouse_id` |
| `list_secret_scopes` | List secret scopes | - |
| `create_secret_scope` | Create secret scope | `scope`, `backend_type` (optional), `initial_manage_principal` (optional) |
| `delete_secret_scope` | Delete secret scope | `scope` |
| `list_secrets` | List secrets in scope | `scope` |
| `put_secret` | Store/update secret | `scope`, `key`, `string_value` or `bytes_value` |
| `delete_secret` | Delete secret | `scope`, `key` |
| `list_secret_acls` | List ACLs on scope | `host`, `token`, `scope` |
| `get_secret_acl` | Get ACL for principal | `host`, `token`, `scope`, `principal` |
| `put_secret_acl` | Set ACL | `host`, `token`, `scope`, `principal`, `permission` |
| `delete_secret_acl` | Delete ACL | `host`, `token`, `scope`, `principal` |
| `list_repos` | List Git repositories | `host`, `token`, `path_prefix` (optional), `next_page_token` (optional) |
| `get_repo` | Get repository details | `host`, `token`, `repo_id` |
| `create_repo` | Create and link Git repo | `host`, `token`, `url`, `provider`, `path` (optional) |
| `update_repo` | Switch branch/tag or pull | `host`, `token`, `repo_id`, `branch` (optional), `tag` (optional) |
| `delete_repo` | Delete repository | `host`, `token`, `repo_id` |
| `get_repo_permissions` | Get repo permissions | `host`, `token`, `repo_id` |
| `set_repo_permissions` | Set repo permissions | `host`, `token`, `repo_id`, `access_control_list` |
| `update_repo_permissions` | Update repo permissions | `host`, `token`, `repo_id`, `access_control_list` |
| `get_repo_permission_levels` | Get available permission levels | `host`, `token`, `repo_id` |
| `list_jobs` | List jobs | `host`, `token`, `limit` (optional), `name` (optional), `expand_tasks` (optional), `page_token` (optional) |
| `get_job` | Get job details | `host`, `token`, `job_id` |
| `create_job` | Create new job | `host`, `token`, `name`, `tasks`, `schedule` (optional), etc. |
| `update_job` | Update job settings | `host`, `token`, `job_id`, `new_settings` (optional), `fields_to_remove` (optional) |
| `reset_job` | Reset job (overwrite all) | `host`, `token`, `job_id`, `new_settings` |
| `delete_job` | Delete job | `host`, `token`, `job_id` |
| `run_now` | Trigger job run | `host`, `token`, `job_id`, `notebook_params` (optional), `jar_params` (optional), etc. |
| `submit_run` | Submit one-time run | `host`, `token`, `run_name`, `tasks`, `git_source` (optional), etc. |
| `get_run` | Get run details | `host`, `token`, `run_id`, `include_history` (optional) |
| `list_runs` | List job runs | `host`, `token`, `job_id` (optional), `active_only` (optional), `completed_only` (optional), etc. |
| `cancel_run` | Cancel a run | `host`, `token`, `run_id` |
| `cancel_all_runs` | Cancel all runs of job | `host`, `token`, `job_id` (optional), `all_queued_runs` (optional) |
| `delete_run` | Delete run | `host`, `token`, `run_id` |
| `repair_run` | Repair failed run | `host`, `token`, `run_id`, `rerun_tasks` (optional), `rerun_all_failed_tasks` (optional), etc. |
| `get_run_output` | Get run output/logs | `host`, `token`, `run_id` |
| `export_run` | Export run views | `host`, `token`, `run_id`, `views_to_export` (optional) |
| `get_job_permissions` | Get job permissions | `host`, `token`, `job_id` |
| `set_job_permissions` | Set job permissions | `host`, `token`, `job_id`, `access_control_list` |
| `update_job_permissions` | Update job permissions | `host`, `token`, `job_id`, `access_control_list` |
| `get_job_permission_levels` | Get available permission levels | `host`, `token`, `job_id` |
| `list_clusters` | List clusters | `host`, `token` |
| `get_cluster` | Get cluster details | `host`, `token`, `cluster_id` |
| `create_cluster` | Create new cluster | `host`, `token`, `spark_version`, `node_type_id` (optional), `num_workers` (optional), etc. |
| `edit_cluster` | Edit cluster configuration | `host`, `token`, `cluster_id`, `spark_version`, `node_type_id` (optional), etc. |
| `delete_cluster` | Delete/terminate cluster | `host`, `token`, `cluster_id` |
| `permanent_delete_cluster` | Permanently delete cluster | `host`, `token`, `cluster_id` |
| `start_cluster` | Start terminated cluster | `host`, `token`, `cluster_id` |
| `restart_cluster` | Restart running cluster | `host`, `token`, `cluster_id` |
| `get_cluster_permissions` | Get cluster permissions | `host`, `token`, `cluster_id` |
| `set_cluster_permissions` | Set cluster permissions | `host`, `token`, `cluster_id`, `access_control_list` |
| `update_cluster_permissions` | Update cluster permissions | `host`, `token`, `cluster_id`, `access_control_list` |
| `get_cluster_permission_levels` | Get available permission levels | `host`, `token`, `cluster_id` |
| `list_tables` | List tables in schema | `host`, `token`, `catalog_name`, `schema_name`, `max_results` (optional), `page_token` (optional), etc. |
| `list_table_summaries` | List table summaries | `host`, `token`, `catalog_name`, `schema_name_pattern` (optional), `table_name_pattern` (optional), etc. |
| `get_table` | Get table details | `host`, `token`, `full_name`, `include_delta_metadata` (optional), `include_browse` (optional) |
| `table_exists` | Check if table exists | `host`, `token`, `full_name` |
| `delete_table` | Delete table | `host`, `token`, `full_name` |
| `update_table_owner` | Update table owner | `host`, `token`, `full_name`, `owner` |
| `list_schemas` | List schemas in catalog | `host`, `token`, `catalog_name`, `max_results` (optional), `page_token` (optional), `include_browse` (optional) |
| `get_schema` | Get schema details | `host`, `token`, `full_name`, `include_browse` (optional) |
| `create_schema` | Create new schema | `host`, `token`, `name`, `catalog_name`, `comment` (optional), `properties` (optional), `storage_root` (optional) |
| `delete_schema` | Delete schema | `host`, `token`, `full_name`, `force` (optional) |
| `update_schema` | Update schema | `host`, `token`, `full_name`, `new_name` (optional), `comment` (optional), `owner` (optional), `properties` (optional), `enable_predictive_optimization` (optional) |
| `list_catalogs` | List catalogs in metastore | `host`, `token`, `max_results` (optional), `page_token` (optional), `include_browse` (optional) |
| `get_catalog` | Get catalog details | `host`, `token`, `name`, `include_browse` (optional) |
| `create_catalog` | Create new catalog | `host`, `token`, `name`, `comment` (optional), `properties` (optional), `storage_root` (optional), `connection_name` (optional), `options` (optional), `provider_name` (optional), `share_name` (optional) |
| `delete_catalog` | Delete catalog | `host`, `token`, `name`, `force` (optional) |
| `update_catalog` | Update catalog | `host`, `token`, `name`, `new_name` (optional), `comment` (optional), `owner` (optional), `properties` (optional), `options` (optional), `isolation_mode` (optional), `enable_predictive_optimization` (optional) |
| `list_functions` | List functions in schema | `host`, `token`, `catalog_name`, `schema_name`, `max_results` (optional), `page_token` (optional), `include_browse` (optional) |
| `get_function` | Get function details | `host`, `token`, `name`, `include_browse` (optional) |
| `create_function` | Create new function (UDF) | `host`, `token`, `name`, `catalog_name`, `schema_name`, `input_params`, `data_type`, `full_data_type`, `routine_body`, `routine_definition`, `parameter_style`, `is_deterministic`, `sql_data_access`, `is_null_call`, `security_type`, `specific_name`, plus optional params |
| `delete_function` | Delete function | `host`, `token`, `name`, `force` (optional) |
| `update_function_owner` | Update function owner | `host`, `token`, `name`, `owner` |
| `list_volumes` | List volumes in schema | `host`, `token`, `catalog_name`, `schema_name`, `max_results` (optional), `page_token` (optional), `include_browse` (optional) |
| `get_volume` | Get volume details | `host`, `token`, `name`, `include_browse` (optional) |
| `create_volume` | Create new volume | `host`, `token`, `catalog_name`, `schema_name`, `name`, `volume_type`, `comment` (optional), `storage_location` (optional) |
| `delete_volume` | Delete volume | `host`, `token`, `name` |
| `update_volume` | Update volume metadata | `host`, `token`, `name`, `new_name` (optional), `comment` (optional), `owner` (optional) |
| `list_external_lineage` | List external lineage relationships | `host`, `token`, `object_info`, `lineage_direction`, `page_size` (optional), `page_token` (optional) |
| `create_external_lineage` | Create lineage relationship | `host`, `token`, `source`, `target`, `id` (optional), `columns` (optional), `properties` (optional) |
| `delete_external_lineage` | Delete lineage relationship | `host`, `token`, `source`, `target`, `id` (optional) |
| `update_external_lineage` | Update lineage relationship | `host`, `token`, `source`, `target`, `update_mask`, `id` (optional), `columns` (optional), `properties` (optional) |
| `list_postgres_projects` | List Postgres projects | `host`, `token`, `page_size` (optional), `page_token` (optional) |
| `get_postgres_project` | Get project details | `host`, `token`, `name` |
| `create_postgres_project` | Create new project | `host`, `token`, `project_id` (optional), `display_name` (optional), `pg_version` (optional), `settings` (optional) |
| `update_postgres_project` | Update project | `host`, `token`, `name`, `update_mask`, plus optional fields |
| `delete_postgres_project` | Delete project | `host`, `token`, `name` |
| `list_postgres_branches` | List branches in project | `host`, `token`, `parent`, `page_size` (optional), `page_token` (optional) |
| `get_postgres_branch` | Get branch details | `host`, `token`, `name` |
| `create_postgres_branch` | Create new branch | `host`, `token`, `parent`, `branch_id` (optional), `is_protected` (optional), `source_branch` (optional) |
| `update_postgres_branch` | Update branch | `host`, `token`, `name`, `update_mask`, `is_protected` (optional) |
| `delete_postgres_branch` | Delete branch | `host`, `token`, `name` |
| `list_postgres_endpoints` | List endpoints in branch | `host`, `token`, `parent`, `page_size` (optional), `page_token` (optional) |
| `get_postgres_endpoint` | Get endpoint details | `host`, `token`, `name` |
| `create_postgres_endpoint` | Create new endpoint | `host`, `token`, `parent`, `endpoint_type`, plus optional fields |
| `update_postgres_endpoint` | Update endpoint | `host`, `token`, `name`, `update_mask`, plus optional fields |
| `delete_postgres_endpoint` | Delete endpoint | `host`, `token`, `name` |
| `get_postgres_operation` | Get operation status | `host`, `token`, `name` |
| `create_execution_context` | Create execution context | `host`, `token`, `cluster_id`, `language` (default: "python") |
| `get_context_status` | Get context status | `host`, `token`, `cluster_id`, `context_id` |
| `destroy_execution_context` | Destroy context | `host`, `token`, `cluster_id`, `context_id` |
| `execute_command` | Execute code on cluster | `host`, `token`, `cluster_id`, `context_id`, `command`, `language` (default: "python") |
| `get_command_status` | Get command status/results | `host`, `token`, `cluster_id`, `context_id`, `command_id` |
| `cancel_command` | Cancel running command | `host`, `token`, `cluster_id`, `context_id`, `command_id` |
| `list_notebooks` | List notebooks in path | `host`, `token`, `path` (optional), `recursive` (optional) |
| `get_notebook` | Export notebook content | `host`, `token`, `path`, `format` (optional) |
| `import_notebook` | Import notebook | `host`, `token`, `path`, `content`, `language` (optional), `format` (optional), `overwrite` (optional) |
| `delete_notebook` | Delete notebook | `host`, `token`, `path`, `recursive` (optional) |
| `create_notebook` | Create new notebook | `host`, `token`, `path`, `language` (optional) |
| `get_notebook_status` | Get notebook metadata | `host`, `token`, `path` |
| `get_notebook_cells` | Get all cells from notebook | `host`, `token`, `path` |
| `get_notebook_cell` | Get specific cell by index | `host`, `token`, `path`, `cell_index` |
| `search_notebook_cells` | Search cells by pattern | `host`, `token`, `path`, `pattern`, `cell_type` (optional), `case_sensitive` (optional) |
| `insert_notebook_cell` | Insert new cell at position | `host`, `token`, `path`, `cell_index`, `cell_content`, `cell_type` (optional), `language` (optional) |
| `update_notebook_cell` | Update cell content | `host`, `token`, `path`, `cell_index`, `cell_content` |
| `delete_notebook_cell` | Delete cell by index | `host`, `token`, `path`, `cell_index` |
| `reorder_notebook_cells` | Move cell to new position | `host`, `token`, `path`, `from_index`, `to_index` |
| `resolve_notebook_from_url` | Get notebook path from URL | `host`, `token`, `url` |
| `list_directories` | List directories in path | `host`, `token`, `path` (optional), `recursive` (optional) |
| `create_directory` | Create new directory | `host`, `token`, `path` |
| `delete_directory` | Delete directory | `host`, `token`, `path`, `recursive` (optional) |
| `get_directory_info` | Get directory metadata | `host`, `token`, `path` |
| `get_directory_tree` | Get hierarchical tree structure | `host`, `token`, `path` (optional), `max_depth` (optional) |
| `get_directory_stats` | Get directory statistics | `host`, `token`, `path` (optional), `recursive` (optional) |
| `search_directories` | Search directories by pattern | `host`, `token`, `path` (optional), `pattern` (optional), `recursive` (optional), `case_sensitive` (optional) |
| `list_workspace_files` | List workspace files | `host`, `token`, `path` (optional) |

## Tool Parameters

All tools require:
- **host**: Databricks workspace URL (e.g., `https://my-workspace.cloud.databricks.com`)
- **token**: Personal Access Token (starts with `dapi`)

## How Credentials Work

1. **Frontend**: User enters credentials in UI
2. **Context**: Credentials sent via copilot context
3. **Agent**: Extracts credentials from context
4. **MCP Server**: Receives credentials per-tool-call
5. **Caching**: WorkspaceClient cached for 1 hour

**Security**:
- ✅ No credentials stored on server
- ✅ Client connections cached with SHA-256 hashed keys
- ✅ 1-hour TTL on cached connections
- ✅ Credentials only in memory during requests

## Testing

### Using FastMCP Inspector

```bash
fastmcp dev server.py
```

Opens an interactive inspector at `http://localhost:5173`

### Manual Testing

```python
from databricks.sdk import WorkspaceClient

# Test credentials
host = "https://your-workspace.cloud.databricks.com"
token = "dapi..."

client = WorkspaceClient(host=host, token=token)
print(list(client.queries.list()))
```

## Project Structure

```
databricks/
├── server.py                  # FastMCP server entry point
├── cache.py                   # WorkspaceClient connection pooling
├── models.py                  # Pydantic models for type safety
├── requirements.txt           # Dependencies
├── tools/                     # Tools organized by category
│   ├── __init__.py           # Tool exports
│   ├── queries.py            # SQL query tools
│   ├── jobs.py               # Job management tools
│   ├── clusters.py           # Cluster tools
│   ├── notebooks.py          # Notebook management tools
│   ├── cells.py              # Cell-level operations
│   ├── directories.py        # Directory management tools
│   ├── url_utils.py          # URL resolution utilities
│   └── workspace.py          # Workspace file tools
├── README.md                 # This file
├── QUICKSTART.md             # Quick start guide
├── NOTEBOOKS.md              # Notebook tools documentation
├── CELLS.md                  # Cell operations documentation
├── CELL_OPERATIONS_FEASIBILITY.md  # Cell operations investigation
└── test_server.sh            # Test script
```

## Why FastMCP?

FastMCP provides:
- ✅ **MCP Protocol**: Built-in MCP standard support
- ✅ **Tool Decorators**: Simple `@mcp.tool()` syntax
- ✅ **Auto-discovery**: Tools automatically registered
- ✅ **Type Safety**: Pydantic validation for parameters and return types
- ✅ **Multiple Transports**: stdio, SSE, WebSocket
- ✅ **Developer Tools**: Built-in inspector and debugging

## SQL Query Management

Complete CRUD operations for SQL queries:

### List Queries
```python
# List all SQL queries in workspace
response = list_queries(host, token)
print(f"Found {response.count} queries")

for query in response.queries:
    print(f"{query.display_name}: {query.query_text[:50]}...")

# With pagination (limit results per request)
response = list_queries(host, token, page_size=50)
print(f"Fetched {response.count} queries (page size: 50)")
```

### Get Query Details
```python
# Get complete query details
query = get_query(host, token, query_id="abc123")
print(f"Query: {query.display_name}")
print(f"SQL: {query.query_text}")
print(f"Warehouse: {query.warehouse_id}")
```

### Create Query
```python
# Create a new SQL query
response = create_query(
    host, token,
    display_name="Sales Analysis",
    warehouse_id="abc123def456",
    query_text="SELECT * FROM sales WHERE date > '2024-01-01'",
    description="Monthly sales report",
    tags=["sales", "reporting"],
    catalog="main",
    schema="analytics"
)
print(f"Created query ID: {response.id}")
```

### Update Query
```python
# Update existing query
response = update_query(
    host, token,
    query_id="abc123",
    display_name="Updated Sales Analysis",
    query_text="SELECT * FROM sales WHERE date > '2024-06-01'",
    description="Updated to show H2 2024 data"
)
print(response.status)
```

### Delete Query
```python
# Move query to trash (recoverable for 30 days)
response = delete_query(host, token, query_id="abc123")
print(response.status)  # "Query moved to trash (recoverable for 30 days)"
```

### List Query Visualizations
```python
# Get all visualizations for a query
response = list_query_visualizations(host, token, query_id="abc123")
print(f"Found {response.count} visualizations")

for viz in response.visualizations:
    print(f"{viz.type}: {viz.display_name}")
```

**Use Cases:**
- 📊 **Query Management**: Full lifecycle management of SQL queries
- 🤖 **Automated Analysis**: Agents create and update queries based on analysis needs
- 🧹 **Cleanup**: Remove old or unused queries programmatically
- 📈 **Dashboard Integration**: Manage query visualizations for reporting

## SQL Query History & Monitoring

Track and analyze query execution history across SQL warehouses and serverless compute:

### List Query History
```python
from datetime import datetime, timedelta

# Get failed queries from last 24 hours
end_time = int(datetime.now().timestamp() * 1000)
start_time = int((datetime.now() - timedelta(days=1)).timestamp() * 1000)

response = list_query_history(
    host, token,
    filter_by=QueryFilter(
        query_start_time_range=TimeRange(
            start_time_ms=start_time,
            end_time_ms=end_time
        ),
        statuses=["FAILED"]
    ),
    include_metrics=True,
    max_results=50
)

print(f"Found {response.count} failed queries")
for query in response.queries:
    print(f"Query {query.query_id}: {query.error_message}")
    print(f"  Duration: {query.duration}ms")
    print(f"  User: {query.user_name}")
```

### Monitor Performance
```python
# Get slow queries (> 10 seconds) with detailed metrics
response = list_query_history(
    host, token,
    filter_by=QueryFilter(
        query_start_time_range=TimeRange(
            start_time_ms=start_time,
            end_time_ms=end_time
        ),
        statuses=["FINISHED"]
    ),
    include_metrics=True,
    max_results=100
)

slow_queries = [q for q in response.queries if q.duration and q.duration > 10000]
print(f"Found {len(slow_queries)} slow queries")

for query in slow_queries:
    print(f"\nQuery: {query.query_text[:100]}...")
    print(f"Duration: {query.duration}ms")
    if query.metrics:
        print(f"  Execution: {query.metrics.execution_time_ms}ms")
        print(f"  Compilation: {query.metrics.compilation_time_ms}ms")
        print(f"  Rows read: {query.metrics.rows_read_count}")
        print(f"  Bytes read: {query.metrics.read_bytes}")
        print(f"  Cache hit: {query.metrics.result_from_cache}")
```

### Filter by User and Warehouse
```python
# Get queries from specific user on specific warehouse
response = list_query_history(
    host, token,
    filter_by=QueryFilter(
        user_ids=[12345],
        warehouse_ids=["abc123def456"],
        statuses=["FINISHED", "FAILED"]
    ),
    include_metrics=False,
    max_results=100
)

print(f"User executed {response.count} queries on this warehouse")
```

### Pagination for Large Result Sets
```python
# Fetch all queries in pages
all_queries = []
page_token = None

while True:
    response = list_query_history(
        host, token,
        max_results=1000,  # Max per page
        page_token=page_token
    )
    
    all_queries.extend(response.queries)
    
    if not response.has_next_page:
        break
    
    page_token = response.next_page_token

print(f"Fetched {len(all_queries)} total queries")
```

**Key Features:**
- ⏱️ **Performance Monitoring**: Track query execution times and identify bottlenecks
- 🐛 **Failure Analysis**: Quickly identify and debug failed queries
- 📊 **Usage Analytics**: Analyze query patterns by user, warehouse, and time
- 💰 **Cost Optimization**: Identify expensive queries consuming resources
- 🔍 **Detailed Metrics**: Compilation time, execution time, bytes read/written, cache hits
- 🎯 **Smart Filtering**: Filter by time range, user, warehouse, status

**Use Cases:**
- 🚨 **Automated Alerting**: Detect anomalous query times or high failure rates
- ⚡ **Performance Optimization**: Find and optimize slow queries
- 📈 **Capacity Planning**: Analyze warehouse usage patterns
- 🔍 **Debugging**: Investigate query failures with detailed error messages
- 💡 **Cost Analysis**: Track query resource consumption
- 🤖 **Agentic Monitoring**: AI agents autonomously monitor and optimize queries

## SQL Statement Execution

Execute SQL statements directly and fetch actual data - the most powerful API for data-driven agents:

### Execute Statement (Synchronous)
```python
# Execute and wait for results (up to 30 seconds)
response = execute_statement(
    host, token,
    statement="SELECT * FROM sales WHERE date > '2024-01-01' LIMIT 1000",
    warehouse_id="abc123def456",
    wait_timeout="30s",
    on_wait_timeout="CANCEL"  # Cancel if not done in 30s
)

if response.status.state == "SUCCEEDED":
    print(f"Total rows: {response.manifest.total_row_count}")
    print(f"Schema: {[col.name for col in response.manifest.schema_name.columns]}")
    print(f"Data: {response.result.data_array[:5]}")  # First 5 rows
elif response.status.state == "FAILED":
    print(f"Error: {response.status.error.message}")
```

### Execute Statement (Asynchronous)
```python
# Start execution and poll for results
response = execute_statement(
    host, token,
    statement="SELECT COUNT(*) FROM massive_table",
    warehouse_id="abc123def456",
    wait_timeout="0s"  # Return immediately
)

print(f"Statement ID: {response.statement_id}")

# Poll until complete
import time
while True:
    status_response = get_statement(host, token, response.statement_id)
    
    if status_response.status.state == "SUCCEEDED":
        print(f"Result: {status_response.result.data_array}")
        break
    elif status_response.status.state in ["FAILED", "CANCELED", "CLOSED"]:
        print(f"Failed: {status_response.status.error.message}")
        break
    
    print(f"Status: {status_response.status.state}")
    time.sleep(2)  # Poll every 2 seconds
```

### Parameterized Queries (Safe SQL)
```python
# Use named parameters for SQL injection protection
response = execute_statement(
    host, token,
    statement="""
        SELECT * FROM users 
        WHERE name = :user_name 
        AND created_date > :start_date
        AND status = :status
    """,
    warehouse_id="abc123def456",
    parameters=[
        StatementParameter(name="user_name", value="Alice"),
        StatementParameter(name="start_date", value="2024-01-01", type="DATE"),
        StatementParameter(name="status", value="active")
    ],
    wait_timeout="10s"
)
```

### Large Results with External Links
```python
# Fetch large datasets (up to 100 GB)
response = execute_statement(
    host, token,
    statement="SELECT * FROM massive_table",
    warehouse_id="abc123def456",
    disposition="EXTERNAL_LINKS",  # Get download URLs
    format="ARROW_STREAM",         # High-performance format
    wait_timeout="30s"
)

if response.status.state == "SUCCEEDED":
    print(f"Total: {response.manifest.total_row_count} rows")
    print(f"Chunks: {response.manifest.total_chunk_count}")
    
    # Download first chunk via external link
    first_link = response.result.external_links[0]
    print(f"Download URL: {first_link.external_link}")
    print(f"Expires: {first_link.expiration}")
    print(f"Chunk size: {first_link.byte_count} bytes")
```

### Fetch Result Chunks
```python
# Execute query
response = execute_statement(
    host, token,
    statement="SELECT * FROM large_table",
    warehouse_id="abc123def456",
    wait_timeout="30s"
)

if response.status.state == "SUCCEEDED":
    # First chunk is in response.result
    all_data = response.result.data_array
    print(f"Chunk 0: {len(all_data)} rows")
    
    # Fetch remaining chunks (can be done in parallel)
    total_chunks = response.manifest.total_chunk_count
    for chunk_idx in range(1, total_chunks):
        chunk = get_statement_result_chunk(
            host, token,
            response.statement_id,
            chunk_idx
        )
        all_data.extend(chunk.data_array)
        print(f"Chunk {chunk_idx}: {len(chunk.data_array)} rows")
    
    print(f"Total fetched: {len(all_data)} rows")
```

### Cancel Long-Running Query
```python
# Start query
response = execute_statement(
    host, token,
    statement="SELECT * FROM massive_table",
    warehouse_id="abc123def456",
    wait_timeout="0s"
)

# Cancel it
cancel_response = cancel_execution(host, token, response.statement_id)
print(cancel_response.message)

# Verify cancellation
import time
while True:
    status = get_statement(host, token, response.statement_id)
    if status.status.state in ["CANCELED", "CLOSED"]:
        print("Successfully canceled")
        break
    time.sleep(1)
```

### Set Catalog and Schema Context
```python
# Execute with default database context
response = execute_statement(
    host, token,
    statement="SELECT * FROM sales",  # Resolves to catalog.schema.sales
    warehouse_id="abc123def456",
    catalog="production",
    schema="analytics",
    wait_timeout="10s"
)
```

### Result Formats
```python
# JSON_ARRAY (default) - Best for small results
response = execute_statement(
    host, token,
    statement="SELECT * FROM small_table",
    warehouse_id="abc123",
    format="JSON_ARRAY",
    disposition="INLINE"  # Up to 25 MB
)

# ARROW_STREAM - Best for large results and performance
response = execute_statement(
    host, token,
    statement="SELECT * FROM large_table",
    warehouse_id="abc123",
    format="ARROW_STREAM",
    disposition="EXTERNAL_LINKS"  # Up to 100 GB
)

# CSV - Standard format
response = execute_statement(
    host, token,
    statement="SELECT * FROM table",
    warehouse_id="abc123",
    format="CSV",
    disposition="EXTERNAL_LINKS"
)
```

**Execution Modes:**

| Mode | wait_timeout | on_wait_timeout | Behavior |
|------|--------------|-----------------|----------|
| **Synchronous** | 5s-50s | CANCEL | Wait for results or cancel |
| **Hybrid** (default) | 10s | CONTINUE | Wait 10s, then return statement_id |
| **Asynchronous** | 0s | (ignored) | Return statement_id immediately |

**Result Disposition:**

| Disposition | Format Support | Max Size | Use Case |
|-------------|---------------|----------|----------|
| **INLINE** | JSON_ARRAY only | 25 MB | Small results, immediate access |
| **EXTERNAL_LINKS** | All formats | 100 GB | Large results, high throughput |

**Key Features:**
- 🎯 **Three Execution Modes**: Sync, async, or hybrid
- 📊 **Multiple Formats**: JSON, Arrow, CSV
- 🔒 **Parameterized Queries**: Safe from SQL injection
- 📦 **Chunked Results**: Parallel fetching for large datasets
- ⚡ **Up to 100 GB**: Massive result sets via external links
- 🛑 **Cancellation**: Stop long-running queries
- 🗂️ **Context Setting**: Default catalog and schema

**Use Cases:**
- 📊 **Data Analysis**: Fetch and analyze real data
- 🔍 **Data Discovery**: Query schemas, sample tables, validate quality
- 🤖 **Dynamic SQL**: Agents generate and execute queries based on user intent
- 📈 **Real-time Insights**: Fresh data for dashboards and metrics
- 🔄 **ETL/Processing**: Execute transformations and load data
- 💡 **Query Optimization**: Test variations and analyze performance
- 🎯 **Agentic Workflows**: Complete data-driven AI agent capabilities

**Important Limits:**
- INLINE: Max 25 MiB (internal storage metrics)
- EXTERNAL_LINKS: Max 100 GiB (results truncated beyond)
- Query text: Max 16 MiB
- Result retention: 1 hour after completion
- Keepalive: Poll at least every 15 minutes

## SQL Warehouses Management

Manage compute resources (SQL warehouses) for executing SQL statements. Essential for agents to discover, control, and optimize warehouse infrastructure:

### List Warehouses
```python
# Discover all available warehouses
response = list_warehouses(host, token)

for wh in response.warehouses:
    print(f"{wh.name} ({wh.id})")
    print(f"  State: {wh.state}")
    print(f"  Size: {wh.cluster_size}")
    print(f"  Type: {wh.warehouse_type}")
    print(f"  Active sessions: {wh.num_active_sessions}")
    print(f"  Clusters: {wh.num_clusters}/{wh.max_num_clusters}")
    print(f"  Health: {wh.health.status if wh.health else 'N/A'}")
```

### Get Warehouse Details
```python
# Check specific warehouse status
warehouse = get_warehouse(host, token, "abc123")

print(f"Name: {warehouse.name}")
print(f"State: {warehouse.state}")
print(f"JDBC URL: {warehouse.jdbc_url}")
print(f"Photon enabled: {warehouse.enable_photon}")
print(f"Auto-stop: {warehouse.auto_stop_mins} minutes")
```

### Auto-Start Before Execution
```python
# Intelligent execution with auto-start
def execute_with_auto_start(host, token, statement, warehouse_id):
    # Check warehouse state
    warehouse = get_warehouse(host, token, warehouse_id)
    
    # Start if stopped
    if warehouse.state == "STOPPED":
        print(f"Starting warehouse {warehouse.name}...")
        start_response = start_warehouse(host, token, warehouse_id)
        print(f"Warehouse state: {start_response.state}")
    elif warehouse.state in ["STARTING", "STOPPING"]:
        raise Exception(f"Warehouse is {warehouse.state}, please wait")
    
    # Execute statement
    return execute_statement(host, token, statement, warehouse_id)

# Usage
result = execute_with_auto_start(
    host, token,
    "SELECT * FROM sales WHERE date > '2024-01-01'",
    "my-warehouse-id"
)
```

### Create Warehouse
```python
# Create a small warehouse for development
response = create_warehouse(
    host, token,
    name="dev-analytics-warehouse",
    cluster_size="X-Small",
    min_num_clusters=1,
    max_num_clusters=1,
    auto_stop_mins=10,
    enable_photon=True,
    tags=[
        EndpointTagPair(key="Environment", value="Development"),
        EndpointTagPair(key="Team", value="Analytics")
    ]
)
print(f"Created warehouse {response.id}: {response.state}")

# Create a production warehouse with auto-scaling
response = create_warehouse(
    host, token,
    name="prod-warehouse",
    cluster_size="2X-Large",
    min_num_clusters=2,
    max_num_clusters=10,
    auto_stop_mins=0,  # Never auto-stop
    enable_photon=True,
    enable_serverless_compute=False,
    warehouse_type="PRO"
)
```

### Update Warehouse Configuration
```python
# Scale up for heavy workload
response = update_warehouse(
    host, token,
    warehouse_id="abc123",
    cluster_size="2X-Large",
    max_num_clusters=10
)
print(response.message)

# Optimize for cost savings
response = update_warehouse(
    host, token,
    warehouse_id="abc123",
    auto_stop_mins=5,  # Stop after 5 minutes idle
    min_num_clusters=1
)
```

### Start and Stop Warehouses
```python
# Start warehouse
response = start_warehouse(host, token, "abc123")
print(f"State: {response.state}")  # STARTING or RUNNING

# Stop warehouse to save costs
response = stop_warehouse(host, token, "abc123")
print(f"State: {response.state}")  # STOPPING or STOPPED
```

### Cost Optimization - Stop Idle Warehouses
```python
# Automatically stop idle warehouses
warehouses = list_warehouses(host, token)

for wh in warehouses.warehouses:
    if wh.state == "RUNNING" and wh.num_active_sessions == 0:
        print(f"Stopping idle warehouse: {wh.name}")
        response = stop_warehouse(host, token, wh.id)
        print(f"  {response.message}")
```

### Intelligent Warehouse Selection
```python
# Choose best warehouse for query
def select_warehouse_for_query(host, token, query_type="small"):
    warehouses = list_warehouses(host, token)
    
    # Filter running warehouses
    running = [w for w in warehouses.warehouses if w.state == "RUNNING"]
    
    if query_type == "small":
        # Choose smallest running warehouse
        return min(running, key=lambda w: w.cluster_size)
    elif query_type == "large":
        # Choose largest warehouse with capacity
        return max(running, key=lambda w: (w.max_num_clusters, w.cluster_size))
    
    return running[0] if running else None

# Use it
warehouse = select_warehouse_for_query(host, token, "large")
if warehouse:
    result = execute_statement(
        host, token,
        "SELECT * FROM massive_table",
        warehouse.id
    )
```

### Delete Warehouse
```python
# Delete temporary or unused warehouse
response = delete_warehouse(host, token, "temp-warehouse-123")
print(response.message)
```

**Cluster Sizes:**
- `2X-Small` - Smallest, cost-effective for light queries
- `X-Small` - Small development workloads
- `Small` - Moderate workloads
- `Medium` - General production use
- `Large` - Heavy analytics
- `X-Large`, `2X-Large`, `3X-Large`, `4X-Large` - Very large workloads

**Warehouse States:**
- `RUNNING` - Ready to execute queries
- `STOPPED` - Not consuming resources, must start before use
- `STARTING` - Starting up (1-2 minutes)
- `STOPPING` - Shutting down
- `DELETING` - Being deleted
- `DELETED` - Removed

**Key Features:**
- 🔍 **Discovery**: Find all accessible warehouses
- ▶️ **Lifecycle Management**: Start, stop, create, delete
- ⚙️ **Configuration**: Resize, enable Photon, adjust auto-scaling
- 💰 **Cost Optimization**: Auto-stop, intelligent selection
- 🏷️ **Tagging**: Organize warehouses with custom tags
- 📊 **Monitoring**: Check state, health, active sessions
- 🚀 **Auto-start**: Ensure warehouses are running before execution

**Use Cases:**
- 🤖 **Autonomous Agents**: Discover and manage compute resources automatically
- ⚡ **Auto-start**: Start warehouses on-demand before query execution
- 💰 **Cost Control**: Stop idle warehouses to reduce spending
- 📈 **Dynamic Scaling**: Adjust warehouse size based on workload
- 🎯 **Workload Optimization**: Select best warehouse for each query type
- 🆕 **Self-service**: Create dedicated warehouses for specific tasks
- 🔍 **Infrastructure Discovery**: Map available compute resources

## Secrets Management

Securely manage credentials for external data sources. Store API keys, passwords, and tokens encrypted in secret scopes:

### List Secret Scopes
```python
# Discover all secret scopes
response = list_secret_scopes(host, token)

for scope in response.scopes:
    print(f"{scope.name} ({scope.backend_type})")
```

### Create Secret Scope
```python
# Create scope for database credentials
response = create_secret_scope(
    host, token,
    scope="jdbc-credentials",
    backend_type="DATABRICKS",
    initial_manage_principal="users"  # Grant all users MANAGE permission
)
print(response.message)

# Create scope for production API keys
response = create_secret_scope(
    host, token,
    scope="prod-api-keys"
)
```

### Store Secrets
```python
# Store database password
response = put_secret(
    host, token,
    scope="jdbc-credentials",
    key="db-password",
    string_value="secretpassword123"
)

# Store API key
response = put_secret(
    host, token,
    scope="prod-api-keys",
    key="external-api-token",
    string_value="sk-1234567890abcdef"
)

# Reference secret in SQL (executed on cluster):
# CREATE TABLE external_data
# USING JDBC OPTIONS (
#   url "jdbc:mysql://host:3306/db",
#   user "admin",
#   password "${secrets/jdbc-credentials/db-password}",
#   dbtable "table"
# )
```

### List Secrets (Metadata Only)
```python
# List secret keys (NOT values)
response = list_secrets(host, token, "jdbc-credentials")

for secret in response.secrets:
    print(f"{secret.key} (last updated: {secret.last_updated_timestamp})")

# Note: Secret VALUES can only be read from DBUtils within notebooks
# This API returns metadata (key names and timestamps) only
```

### Manage Access Control
```python
# Grant read access to data scientists group
response = put_secret_acl(
    host, token,
    scope="jdbc-credentials",
    principal="data-scientists",
    permission="READ"  # Can read secrets
)

# Grant manage access to admins
response = put_secret_acl(
    host, token,
    scope="prod-api-keys",
    principal="admins",
    permission="MANAGE"  # Can manage ACLs and read/write secrets
)

# Grant write access to developers
response = put_secret_acl(
    host, token,
    scope="dev-credentials",
    principal="developers",
    permission="WRITE"  # Can read and write secrets
)

# List who has access
response = list_secret_acls(host, token, "prod-api-keys")
for acl in response.acls:
    print(f"{acl.principal}: {acl.permission}")

# Check specific principal's permission
acl = get_secret_acl(host, token, "prod-api-keys", "data-scientists")
print(f"Permission: {acl.permission}")

# Revoke access
response = delete_secret_acl(host, token, "temp-scope", "former-employee")
```

### Delete Secrets and Scopes
```python
# Delete a secret
response = delete_secret(
    host, token,
    scope="temp-credentials",
    key="old-api-key"
)

# Delete entire scope (and all secrets within it)
response = delete_secret_scope(host, token, "temp-credentials")
```

### Complete Workflow - Setup External Database
```python
# 1. Create scope for database credentials
create_secret_scope(host, token, "external-db")

# 2. Store credentials
put_secret(host, token, "external-db", "username", string_value="admin")
put_secret(host, token, "external-db", "password", string_value="secret123")
put_secret(host, token, "external-db", "jdbc-url", 
          string_value="jdbc:mysql://db.example.com:3306/mydb")

# 3. Grant access to data team
put_secret_acl(host, token, "external-db", "data-engineers", "WRITE")
put_secret_acl(host, token, "external-db", "data-scientists", "READ")

# 4. Execute SQL using secrets (on cluster)
execute_statement(
    host, token,
    statement="""
    CREATE TABLE imported_data
    USING JDBC OPTIONS (
      url "${secrets/external-db/jdbc-url}",
      user "${secrets/external-db/username}",
      password "${secrets/external-db/password}",
      dbtable "source_table"
    )
    """,
    warehouse_id="abc123"
)
```

**Permission Levels:**
- `MANAGE` - Change ACLs, read and write secrets
- `WRITE` - Read and write secrets
- `READ` - Read secrets only

**Naming Rules:**
- Scope names: Alphanumeric, dashes, underscores, periods (max 128 chars)
- Secret keys: Alphanumeric, dashes, underscores, periods (max 128 chars)

**Limits:**
- Max 128 KB per secret value
- Max 1000 secrets per scope

**Important Notes:**
- ⚠️ **Secret values CANNOT be read via API** - Only from DBUtils in notebooks/jobs
- ✅ **Secret metadata CAN be read** - Key names and timestamps
- 🔒 **Values are encrypted** - Server encrypts before storing
- 📝 **Reference in SQL** - Use `${secrets/scope/key}` syntax

**Key Features:**
- 🔒 **Secure Storage**: Encrypted credential storage
- 🎯 **Scope Isolation**: Organize secrets by project/environment
- 👥 **Access Control**: Fine-grained permissions (MANAGE, WRITE, READ)
- 🔑 **External Integration**: Store credentials for JDBC, APIs, etc.
- 📊 **Metadata Access**: List scopes and secret keys
- ☁️ **Azure KeyVault**: Optional Azure KeyVault backend
- 🚀 **SQL Integration**: Reference secrets in SQL statements

**Use Cases:**
- 🗄️ **Database Credentials**: Store JDBC passwords securely
- 🔑 **API Keys**: Manage external service tokens
- 🔐 **Production Secrets**: Isolate production credentials
- 🏗️ **Infrastructure Setup**: Programmatically configure secrets
- 📋 **Compliance**: Audit who has access to sensitive data
- 🤖 **Agentic Workflows**: Autonomous secret management

## Job Orchestration

Complete job lifecycle management for workflow automation. Create multi-task jobs, monitor runs, handle failures, and control permissions:

### List Jobs
```python
# List all jobs
jobs = list_jobs(host, token)
for job in jobs.jobs:
    print(f"{job.name} (ID: {job.job_id})")
    print(f"  Created: {job.created_time}")
    print(f"  Tasks: {len(job.settings.tasks) if job.settings and job.settings.tasks else 0}")

# Filter by name
jobs = list_jobs(host, token, name="Daily ETL")

# List with pagination
jobs = list_jobs(host, token, limit=50, page_token="...")
```

### Get Job Details
```python
# Get complete job configuration
job = get_job(host, token, job_id=12345)

print(f"Job: {job.name}")
print(f"Schedule: {job.settings.schedule if job.settings else None}")
print(f"Max Concurrent Runs: {job.settings.max_concurrent_runs if job.settings else None}")

# Inspect tasks
if job.settings and job.settings.tasks:
    for task in job.settings.tasks:
        print(f"  Task: {task.task_key}")
        if task.notebook_task:
            print(f"    Notebook: {task.notebook_task}")
        if task.depends_on:
            deps = [d['task_key'] for d in task.depends_on]
            print(f"    Depends on: {deps}")
```

### Create Job
```python
# Create single-task job
job = create_job(
    host, token,
    name="Daily Report",
    tasks=[{
        "task_key": "run_report",
        "notebook_task": {"notebook_path": "/Reports/daily"},
        "existing_cluster_id": "cluster-123"
    }],
    schedule={
        "quartz_cron_expression": "0 9 * * *",
        "timezone_id": "UTC"
    }
)
print(f"Created job {job.job_id}")

# Create multi-task ETL workflow
job = create_job(
    host, token,
    name="ETL Pipeline",
    description="Daily data pipeline with dependencies",
    tasks=[
        {
            "task_key": "extract",
            "notebook_task": {"notebook_path": "/ETL/extract"},
            "existing_cluster_id": "cluster-123"
        },
        {
            "task_key": "transform",
            "notebook_task": {"notebook_path": "/ETL/transform"},
            "depends_on": [{"task_key": "extract"}],
            "existing_cluster_id": "cluster-123"
        },
        {
            "task_key": "load",
            "notebook_task": {"notebook_path": "/ETL/load"},
            "depends_on": [{"task_key": "transform"}],
            "existing_cluster_id": "cluster-123"
        }
    ],
    schedule={"quartz_cron_expression": "0 0 * * *", "timezone_id": "UTC"},
    max_concurrent_runs=1,
    timeout_seconds=3600,
    tags={"environment": "production", "team": "data-engineering"}
)

# Create job with Git source
job = create_job(
    host, token,
    name="Analytics from Git",
    tasks=[{
        "task_key": "analysis",
        "notebook_task": {"notebook_path": "notebooks/analysis.py"},
        "existing_cluster_id": "cluster-123"
    }],
    git_source={
        "git_url": "https://github.com/company/analytics",
        "git_branch": "main",
        "git_provider": "github"
    }
)
```

**Task Types Supported:**
- `notebook_task` - Run Databricks notebooks
- `spark_jar_task` - Run Spark JAR jobs
- `spark_python_task` - Run Python Spark jobs
- `spark_submit_task` - Run spark-submit jobs
- `python_wheel_task` - Run Python wheel packages
- `sql_task` - Run SQL queries
- `dbt_task` - Run DBT transformations
- `pipeline_task` - Run Delta Live Tables pipelines

### Update Job
```python
# Update job name and concurrent runs
update_job(
    host, token,
    job_id=12345,
    new_settings={
        "name": "Updated ETL Pipeline",
        "max_concurrent_runs": 3
    }
)

# Add a task to existing job
update_job(
    host, token,
    job_id=12345,
    new_settings={
        "tasks": [
            # ... existing tasks ...
            {
                "task_key": "validate",
                "notebook_task": {"notebook_path": "/ETL/validate"},
                "depends_on": [{"task_key": "load"}],
                "existing_cluster_id": "cluster-123"
            }
        ]
    }
)

# Remove schedule (make job manual-only)
update_job(
    host, token,
    job_id=12345,
    fields_to_remove=["schedule"]
)
```

### Delete Job
```python
# Delete job (cancels active runs)
delete_job(host, token, job_id=12345)
```

### Run Job
```python
# Trigger job run
run = run_now(host, token, job_id=12345)
print(f"Started run {run.run_id} (#{run.number_in_job})")

# Run with parameters
run = run_now(
    host, token,
    job_id=12345,
    notebook_params={"date": "2024-01-01", "region": "us-west"}
)

# Run with idempotency token (prevents duplicates)
run = run_now(
    host, token,
    job_id=12345,
    idempotency_token="run-2024-01-01"
)

# Submit one-time run (no job creation needed)
run = submit_run(
    host, token,
    run_name="Ad-hoc Analysis 2024-01-01",
    tasks=[{
        "task_key": "analyze",
        "notebook_task": {"notebook_path": "/Analysis/report"},
        "existing_cluster_id": "cluster-123"
    }]
)
print(f"Submitted run {run.run_id}")
```

### Monitor Runs
```python
# Get run status
run = get_run(host, token, run_id=67890)

print(f"Run {run.run_id}: {run.state.life_cycle_state}")
print(f"Result: {run.state.result_state}")
print(f"Started: {run.start_time}")
print(f"Duration: {run.execution_duration}ms")

# Check task status
if run.tasks:
    for task in run.tasks:
        print(f"  Task {task.task_key}: {task.state.life_cycle_state}")
        if task.state.result_state:
            print(f"    Result: {task.state.result_state}")

# List all runs for a job
runs = list_runs(host, token, job_id=12345)
for run in runs.runs:
    state = run.state.life_cycle_state if run.state else "UNKNOWN"
    result = run.state.result_state if run.state else "N/A"
    print(f"Run {run.run_id}: {state} - {result}")

# List active runs only
active_runs = list_runs(host, token, job_id=12345, active_only=True)

# List runs in time range
runs = list_runs(
    host, token,
    job_id=12345,
    start_time_from=1704067200000,  # 2024-01-01 00:00:00
    start_time_to=1704153600000     # 2024-01-02 00:00:00
)

# Poll until completion
import time
while True:
    run = get_run(host, token, run_id=67890)
    state = run.state.life_cycle_state if run.state else "UNKNOWN"
    
    if state in ["TERMINATED", "SKIPPED", "INTERNAL_ERROR"]:
        result = run.state.result_state if run.state else "UNKNOWN"
        print(f"Run completed: {result}")
        break
    
    print(f"Run {state}... waiting")
    time.sleep(10)
```

**Run Lifecycle States:**
- `PENDING` - Run is queued
- `RUNNING` - Run is executing
- `TERMINATING` - Run is stopping
- `TERMINATED` - Run completed
- `SKIPPED` - Run was skipped
- `INTERNAL_ERROR` - Internal error occurred

**Run Result States:**
- `SUCCESS` - Run succeeded
- `FAILED` - Run failed
- `TIMEDOUT` - Run timed out
- `CANCELED` - Run was canceled

### Get Run Output
```python
# Get run results and logs
output = get_run_output(host, token, run_id=67890)

if output.error:
    print(f"Run failed: {output.error}")
    print(f"Error trace: {output.error_trace}")
elif output.notebook_output:
    print(f"Notebook output: {output.notebook_output}")
    
if output.logs:
    print(f"Logs ({output.logs_truncated and 'truncated' or 'complete'}):")
    print(output.logs)
```

### Cancel Runs
```python
# Cancel specific run
cancel_run(host, token, run_id=67890)

# Cancel all runs of a job
cancel_all_runs(host, token, job_id=12345)

# Cancel all queued runs in workspace
cancel_all_runs(host, token, all_queued_runs=True)
```

### Repair Failed Runs
```python
# Repair all failed tasks
repair = repair_run(
    host, token,
    run_id=67890,
    rerun_all_failed_tasks=True
)
print(f"Repair initiated: repair_id={repair.repair_id}")

# Repair specific tasks
repair = repair_run(
    host, token,
    run_id=67890,
    rerun_tasks=["transform", "load"],
    rerun_dependent_tasks=True  # Also rerun tasks that depend on these
)

# Repair with different parameters
repair = repair_run(
    host, token,
    run_id=67890,
    rerun_tasks=["extract"],
    notebook_params={"retry": "true", "timeout": "600"}
)
```

### Delete Runs
```python
# Delete completed run (frees up history)
delete_run(host, token, run_id=67890)
```

### Export Runs
```python
# Export run views for backup/analysis
export = export_run(host, token, run_id=67890, views_to_export="ALL")

for view in export.views:
    print(f"View: {view.name} ({view.type})")
    # Save view content
    with open(f"{view.name}.html", "w") as f:
        f.write(view.content)
```

### Manage Job Permissions
```python
# Grant permissions to teams
acls = [
    {"user_name": "admin@company.com", "permission_level": "CAN_MANAGE"},
    {"group_name": "data-engineers", "permission_level": "CAN_MANAGE_RUN"},
    {"group_name": "analysts", "permission_level": "CAN_VIEW"}
]
set_job_permissions(host, token, job_id="12345", access_control_list=acls)

# Update permissions (add new user)
acls = [
    {"user_name": "new-engineer@company.com", "permission_level": "CAN_MANAGE_RUN"}
]
update_job_permissions(host, token, job_id="12345", access_control_list=acls)

# Check current permissions
permissions = get_job_permissions(host, token, job_id="12345")
for acl in permissions['access_control_list']:
    principal = acl.get('user_name') or acl.get('group_name')
    perms = [p['permission_level'] for p in acl['all_permissions']]
    print(f"{principal}: {perms}")

# Get available permission levels
levels = get_job_permission_levels(host, token, job_id="12345")
for level in levels['permission_levels']:
    print(f"{level['permission_level']}: {level['description']}")
```

**Job Permission Levels:**
- `CAN_VIEW` - View job configuration and runs
- `CAN_MANAGE_RUN` - Trigger runs, cancel runs, view outputs
- `CAN_MANAGE` - Full control (edit, delete, permissions)

### Complete Workflow - Create and Monitor Pipeline
```python
# 1. Create ETL pipeline job
job = create_job(
    host, token,
    name="Customer Data Pipeline",
    description="Nightly customer data processing",
    tasks=[
        {
            "task_key": "extract_customers",
            "notebook_task": {"notebook_path": "/ETL/extract_customers"},
            "existing_cluster_id": "etl-cluster-id"
        },
        {
            "task_key": "transform_customers",
            "notebook_task": {"notebook_path": "/ETL/transform_customers"},
            "depends_on": [{"task_key": "extract_customers"}],
            "existing_cluster_id": "etl-cluster-id"
        },
        {
            "task_key": "load_to_warehouse",
            "sql_task": {
                "query": {"query_id": "warehouse-query-id"},
                "warehouse_id": "sql-warehouse-id"
            },
            "depends_on": [{"task_key": "transform_customers"}]
        },
        {
            "task_key": "data_quality_check",
            "notebook_task": {"notebook_path": "/ETL/validate"},
            "depends_on": [{"task_key": "load_to_warehouse"}],
            "existing_cluster_id": "etl-cluster-id"
        }
    ],
    schedule={"quartz_cron_expression": "0 2 * * *", "timezone_id": "UTC"},
    max_concurrent_runs=1,
    timeout_seconds=7200,
    email_notifications={
        "on_failure": ["data-team@company.com"],
        "on_success": ["data-team@company.com"]
    }
)
print(f"Created job {job.job_id}")

# 2. Grant permissions
set_job_permissions(
    host, token,
    job_id=str(job.job_id),
    access_control_list=[
        {"group_name": "data-engineers", "permission_level": "CAN_MANAGE"},
        {"group_name": "analysts", "permission_level": "CAN_VIEW"}
    ]
)

# 3. Trigger initial run
run = run_now(host, token, job_id=job.job_id)
print(f"Started run {run.run_id}")

# 4. Monitor execution
import time
while True:
    run_status = get_run(host, token, run_id=run.run_id)
    state = run_status.state.life_cycle_state if run_status.state else "UNKNOWN"
    
    if state == "TERMINATED":
        result = run_status.state.result_state if run_status.state else "UNKNOWN"
        print(f"Run completed: {result}")
        
        # Check task results
        if run_status.tasks:
            for task in run_status.tasks:
                task_result = task.state.result_state if task.state else "UNKNOWN"
                print(f"  {task.task_key}: {task_result}")
        
        # If failed, get error details
        if result == "FAILED":
            output = get_run_output(host, token, run_id=run.run_id)
            print(f"Error: {output.error}")
            
            # Attempt repair
            repair = repair_run(
                host, token,
                run_id=run.run_id,
                rerun_all_failed_tasks=True
            )
            print(f"Initiated repair: {repair.repair_id}")
        
        break
    
    print(f"Run {state}...")
    time.sleep(30)

# 5. View run history
runs = list_runs(host, token, job_id=job.job_id, limit=10)
success_count = sum(1 for r in runs.runs if r.state and r.state.result_state == "SUCCESS")
failure_count = sum(1 for r in runs.runs if r.state and r.state.result_state == "FAILED")
print(f"Last 10 runs: {success_count} succeeded, {failure_count} failed")
```

### Workflow - Automated Failure Recovery
```python
# Monitor all active jobs and auto-repair failures
jobs = list_jobs(host, token)

for job in jobs.jobs:
    # Check recent runs
    runs = list_runs(host, token, job_id=job.job_id, limit=5)
    
    for run in runs.runs:
        if run.state and run.state.result_state == "FAILED":
            print(f"Found failed run {run.run_id} for job {job.name}")
            
            # Attempt automatic repair
            try:
                repair = repair_run(
                    host, token,
                    run_id=run.run_id,
                    rerun_all_failed_tasks=True
                )
                print(f"  Initiated repair: {repair.repair_id}")
            except Exception as e:
                print(f"  Repair failed: {e}")
                # Cancel and notify
                cancel_run(host, token, run_id=run.run_id)
```

**Important Notes:**
- ⚠️ **Concurrent Runs**: Set `max_concurrent_runs` to prevent resource exhaustion
- 🔄 **Dependencies**: Tasks with `depends_on` wait for parent tasks to succeed
- ⏱️ **Timeouts**: Set `timeout_seconds` to prevent runaway jobs
- 🔒 **Permissions**: Control who can view, run, or manage jobs
- 📧 **Notifications**: Configure email/webhook alerts for success/failure
- 🔁 **Idempotency**: Use `idempotency_token` to prevent duplicate runs
- 🛠️ **Repair**: Repair runs preserve original run ID for tracking

**Key Features:**
- 🏗️ **Complete CRUD**: Create, read, update, delete jobs
- 🚀 **Run Management**: Trigger, monitor, cancel, repair runs
- 📊 **Run Monitoring**: Real-time status, logs, outputs
- 🔄 **Failure Recovery**: Auto-repair failed tasks
- 👥 **Permission Control**: Fine-grained access management
- ⚡ **Ad-hoc Execution**: Submit one-time runs without creating jobs
- 📈 **Run History**: Track execution history and performance
- 🎯 **Multi-Task Workflows**: Complex pipelines with dependencies
- 📅 **Scheduling**: Cron-based job scheduling
- 🔗 **Git Integration**: Run code from Git repositories
- 📋 **Export**: Backup run data and views

**Use Cases:**
- 🔄 **ETL Pipelines**: Orchestrate data extraction, transformation, loading
- 📊 **Analytics Workflows**: Schedule report generation
- 🧪 **ML Pipelines**: Train and deploy models
- 🔍 **Data Quality**: Automated validation and monitoring
- 🚨 **Alerting**: Trigger jobs based on conditions
- 📈 **Performance Testing**: Load testing and benchmarking
- 🤖 **Agentic Automation**: Autonomous workflow management
- 🏗️ **Infrastructure as Code**: Programmatic job deployment
- 🔧 **Auto-Remediation**: Detect and repair failures
- 📋 **Compliance**: Audit job execution history

## Git Repository Management

Manage Git repositories for version-controlled development. Link remote Git repos to workspace, manage branches, and control access:

### List Repositories
```python
# List all accessible repos
response = list_repos(host, token)

for repo in response.repos:
    print(f"{repo.path} -> {repo.url} ({repo.branch})")
    print(f"  HEAD: {repo.head_commit_id}")

# Filter by path prefix
response = list_repos(host, token, path_prefix="/Repos/team")
```

### Create Repository
```python
# Clone a GitHub repo
repo = create_repo(
    host, token,
    url="https://github.com/company/analytics.git",
    provider="github",
    path="/Repos/team/analytics"
)
print(f"Created repo {repo.id} at {repo.path}")

# Clone from GitLab
repo = create_repo(
    host, token,
    url="https://gitlab.com/company/ml-models.git",
    provider="gitlab",
    path="/Repos/data-science/ml-models"
)

# Clone from Azure DevOps
repo = create_repo(
    host, token,
    url="https://dev.azure.com/org/project/_git/repo",
    provider="azureDevOpsServices",
    path="/Repos/team/azure-project"
)
```

**Supported Providers:**
- `github` - GitHub
- `githubEnterprise` - GitHub Enterprise
- `gitlab` - GitLab
- `gitlabEnterpriseEdition` - GitLab Enterprise
- `bitbucketCloud` - Bitbucket Cloud
- `bitbucketServer` - Bitbucket Server
- `azureDevOpsServices` - Azure DevOps
- `awsCodeCommit` - AWS CodeCommit

### Get Repository Details
```python
# Get repo info by ID
repo = get_repo(host, token, repo_id=12345)

print(f"Path: {repo.path}")
print(f"URL: {repo.url}")
print(f"Provider: {repo.provider}")
print(f"Branch: {repo.branch}")
print(f"HEAD: {repo.head_commit_id}")
```

### Update Repository (Branch/Tag Management)
```python
# Switch to feature branch
response = update_repo(
    host, token,
    repo_id=12345,
    branch="feature/new-analysis"
)
print(f"Switched to branch: {response.branch}")

# Pull latest changes on current branch
repo = get_repo(host, token, repo_id=12345)
response = update_repo(
    host, token,
    repo_id=12345,
    branch=repo.branch  # Updates to latest commit
)
print(f"Updated to HEAD: {response.head_commit_id}")

# Check out specific tag (detached HEAD)
response = update_repo(
    host, token,
    repo_id=12345,
    tag="v1.0.0"
)
print(f"Checked out tag: {response.tag}")

# Switch back to main
response = update_repo(
    host, token,
    repo_id=12345,
    branch="main"
)
```

### Delete Repository
```python
# Delete repo from workspace (doesn't affect remote)
response = delete_repo(host, token, repo_id=12345)
print(response.message)
```

### Manage Permissions
```python
# Grant edit access to data scientists
acls = [
    {"user_name": "user@company.com", "permission_level": "CAN_EDIT"},
    {"group_name": "data-scientists", "permission_level": "CAN_READ"}
]
permissions = set_repo_permissions(
    host, token,
    repo_id="12345",
    access_control_list=acls
)

# Update permissions (adds/modifies without removing others)
acls = [
    {"user_name": "admin@company.com", "permission_level": "CAN_MANAGE"}
]
permissions = update_repo_permissions(
    host, token,
    repo_id="12345",
    access_control_list=acls
)

# Check current permissions
permissions = get_repo_permissions(host, token, repo_id="12345")
for acl in permissions['access_control_list']:
    principal = acl.get('user_name') or acl.get('group_name')
    perms = [p['permission_level'] for p in acl['all_permissions']]
    print(f"{principal}: {perms}")

# Get available permission levels
levels = get_repo_permission_levels(host, token, repo_id="12345")
for level in levels['permission_levels']:
    print(f"{level['permission_level']}: {level['description']}")
```

**Permission Levels:**
- `CAN_MANAGE` - Full control (manage permissions, edit code)
- `CAN_EDIT` - Edit code, commit, push
- `CAN_RUN` - Run code in notebooks
- `CAN_READ` - Read-only access

### Complete Workflow - Team Development Setup
```python
# 1. Clone team repository
repo = create_repo(
    host, token,
    url="https://github.com/company/analytics-pipeline.git",
    provider="github",
    path="/Repos/analytics/pipeline"
)

# 2. Grant team access
acls = [
    {"group_name": "analytics-leads", "permission_level": "CAN_MANAGE"},
    {"group_name": "data-engineers", "permission_level": "CAN_EDIT"},
    {"group_name": "data-analysts", "permission_level": "CAN_READ"}
]
set_repo_permissions(host, token, repo_id=str(repo.id), access_control_list=acls)

# 3. Create development branches
update_repo(host, token, repo_id=repo.id, branch="develop")

# 4. Set up compute resources
warehouse = create_warehouse(
    host, token,
    name="analytics-dev",
    cluster_size="2X-Small"
)

# 5. Execute notebook from repo
execute_statement(
    host, token,
    statement="%run /Repos/analytics/pipeline/notebooks/data_processing",
    warehouse_id=warehouse.id
)

# 6. When ready, switch to main for production
update_repo(host, token, repo_id=repo.id, branch="main")
```

### Workflow - Feature Development
```python
# Get repo
repos = list_repos(host, token, path_prefix="/Repos/team/analytics")
repo = repos.repos[0]

# Create feature branch
update_repo(host, token, repo_id=repo.id, branch="feature/new-dashboard")

# Make changes (edit notebooks/files in Databricks UI)
# ...

# Test changes
execute_statement(
    host, token,
    statement="%run /Repos/team/analytics/notebooks/test_suite",
    warehouse_id="test-warehouse-id"
)

# When ready, switch back to main
update_repo(host, token, repo_id=repo.id, branch="main")
```

### Workflow - Release Management
```python
# List all project repos
repos = list_repos(host, token, path_prefix="/Repos/projects")

# Check out release tag for each
for repo in repos.repos:
    update_repo(
        host, token,
        repo_id=repo.id,
        tag="v2.0.0"
    )
    print(f"Updated {repo.path} to v2.0.0")

# Execute release validation
execute_statement(
    host, token,
    statement="%run /Repos/projects/validation/smoke_tests",
    warehouse_id="prod-warehouse-id"
)
```

**Important Notes:**
- ⚠️ **Detached HEAD**: Checking out a tag creates detached HEAD state - switch to branch before committing
- 🔄 **Pull Changes**: Update with current branch name to pull latest changes
- 🔗 **Remote Link Required**: Repos must be linked to remote Git repositories
- 📁 **Workspace Path**: Repos are visible in `/Repos` directory
- 🔒 **Permissions**: Control who can view, edit, or manage repos

**Repository Management Rules:**
- Path must be in `/Repos/{folder}/{repo-name}` format
- Repository names follow workspace naming conventions
- Deleting workspace repo doesn't affect remote Git repository
- Updates pull from remote, not push (use Git UI for push)

**Key Features:**
- 🔄 **Git Integration**: Full Git workflow (clone, branch, tag, pull)
- 👥 **Team Collaboration**: Multi-user access with permissions
- 🌿 **Branch Management**: Switch branches, check out tags
- 🔍 **Repository Discovery**: List and filter accessible repos
- 🔒 **Access Control**: Fine-grained permissions (MANAGE, EDIT, RUN, READ)
- 🏢 **Multi-Provider**: GitHub, GitLab, Bitbucket, Azure DevOps, AWS CodeCommit
- 📂 **Workspace Integration**: Repos appear in workspace file system
- 🚀 **CI/CD Ready**: Programmatic repo management for automation

**Use Cases:**
- 📦 **Version Control**: Manage code with Git best practices
- 👥 **Team Development**: Collaborative coding with branch workflows
- 🔄 **CI/CD Pipelines**: Automated deployment and testing
- 🏗️ **Environment Setup**: Programmatically clone and configure repos
- 🌿 **Feature Branches**: Isolate development work
- 📋 **Release Management**: Tag and deploy specific versions
- 🤖 **Agentic Workflows**: Autonomous repo management and code deployment
- 🔒 **Access Governance**: Control who can access and modify code

## Notebook Management

The server provides comprehensive notebook management capabilities:

### List Notebooks
```python
# List notebooks in a directory (returns ListNotebooksResponse)
response = list_notebooks(host, token, path="/Users/me/notebooks")
print(f"Found {response.count} notebooks")

# List notebooks recursively (includes all subdirectories)
response = list_notebooks(host, token, path="/Users/me", recursive=True)

# Each notebook is a NotebookInfo object with full metadata
for notebook in response.notebooks:
    print(f"{notebook.path} (ID: {notebook.object_id})")
    print(f"  Language: {notebook.language}")
    print(f"  Modified: {notebook.modified_at}")
```

### Export Notebooks
```python
# Export notebook in different formats (returns Pydantic model)
notebook = get_notebook(host, token, path="/Users/me/notebook", format="SOURCE")
# Access decoded content as string (ready to use)
content = notebook.content  # Decoded UTF-8 string
format_used = notebook.format  # "SOURCE"
file_type = notebook.file_type  # e.g., "python"
# Formats: SOURCE, HTML, JUPYTER, DBC
```

### Import Notebooks
```python
# Read notebook content from file
with open("notebook.py", "r") as f:
    content = f.read()

# Import notebook (encoding handled internally)
import_notebook(
    host, token,
    path="/Users/me/new_notebook",
    content=content,    # Pass decoded string directly
    language="PYTHON",  # PYTHON, SCALA, SQL, R
    format="SOURCE",    # SOURCE, HTML, JUPYTER, DBC, AUTO
    overwrite=False
)
```

### Create Notebooks
```python
# Create a new empty notebook
create_notebook(host, token, path="/Users/me/notebook", language="PYTHON")
```

### Delete Notebooks
```python
# Delete a notebook
delete_notebook(host, token, path="/Users/me/notebook")
```

### Get Notebook Status
```python
# Get notebook metadata
status = get_notebook_status(host, token, path="/Users/me/notebook")
```

## Notebook Cell Operations

Fine-grained control over individual notebook cells:

### Get All Cells
```python
# Get all cells from a notebook
cells_response = get_notebook_cells(host, token, path="/Users/me/notebook")
print(f"Total cells: {cells_response.total_cells}")
for cell in cells_response.cells:
    print(f"Cell {cell.index}: {cell.cell_type} - {cell.source_text[:50]}...")
```

### Get Specific Cell
```python
# Get cell at index 2
cell = get_notebook_cell(host, token, path="/Users/me/notebook", cell_index=2)
print(f"Cell content: {cell.source_text}")
```

### Search Cells
```python
# Search for cells containing "pandas"
results = search_notebook_cells(
    host, token,
    path="/Users/me/notebook",
    pattern="pandas",
    cell_type="code"  # Optional: filter by cell type
)
for result in results:
    print(f"Found in cell {result.cell_index}: {result.match_count} matches")
```

### Insert Cell
```python
# Insert a new code cell at position 3
result = insert_notebook_cell(
    host, token,
    path="/Users/me/notebook",
    cell_index=3,
    cell_content="print('New cell')",
    cell_type="code"
)
```

### Update Cell
```python
# Update cell content at index 2
result = update_notebook_cell(
    host, token,
    path="/Users/me/notebook",
    cell_index=2,
    cell_content="# Updated content\nprint('Modified')"
)
```

### Delete Cell
```python
# Delete cell at index 5
result = delete_notebook_cell(host, token, path="/Users/me/notebook", cell_index=5)
```

### Reorder Cells
```python
# Move cell from index 3 to index 1
result = reorder_notebook_cells(
    host, token,
    path="/Users/me/notebook",
    from_index=3,
    to_index=1
)
```

## URL Resolution

Convert Databricks notebook URLs to workspace paths:

### Resolve Notebook from URL
```python
# Modern Databricks URL with notebook ID
url = "https://adb-xxx.azuredatabricks.net/editor/notebooks/1191853414493128"

info = resolve_notebook_from_url(host, token, url)
print(f"Notebook path: {info.path}")  # /Workspace/Users/user@company.com/General
print(f"Language: {info.language}")   # PYTHON
print(f"Notebook ID: {info.notebook_id}")  # 1191853414493128

# Now use the path with other tools
cells = get_notebook_cells(host, token, path=info.path)
```

**Supported URL Formats:**
- `/editor/notebooks/{id}` (modern)
- `/explore/data/{id}` (modern)
- `#workspace/path/to/notebook` (legacy)
- `#notebook/{id}` (legacy)

**How It Works:**
- For ID-based URLs: Uses SDK's built-in `workspace.list(recursive=True)` to search the workspace
- Searches from root (`/`) recursively through all subdirectories
- Matches notebooks by `object_id` or `resource_id`
- Note: First call may take 5-30 seconds for large workspaces

## Directory Management

Complete set of tools for managing workspace directories:

### List Directories
```python
# List directories in a path
response = list_directories(host, token, path="/Projects")
print(f"Found {response.count} directories")

# List recursively (all subdirectories)
response = list_directories(host, token, path="/Projects", recursive=True)
for directory in response.directories:
    print(f"{directory.path} (ID: {directory.object_id})")
```

### Create and Delete Directories
```python
# Create directory (automatically creates parent directories)
response = create_directory(host, token, path="/Projects/ML/Models")
print(response.status)  # "Directory '/Projects/ML/Models' created successfully"

# Delete directory (recursive option for non-empty directories)
response = delete_directory(host, token, path="/Projects/Old", recursive=True)
print(response.status)
```

### Get Directory Metadata
```python
# Get directory info
info = get_directory_info(host, token, path="/Projects/ML")
print(f"Created: {info.created_at}")
print(f"Modified: {info.modified_at}")
print(f"Object ID: {info.object_id}")
```

### Directory Tree Structure
```python
# Get hierarchical tree (max 3 levels deep by default)
tree_response = get_directory_tree(host, token, path="/Projects", max_depth=3)

def print_tree(node, indent=0):
    print("  " * indent + f"[{node.type}] {node.name}")
    if node.children:
        for child in node.children:
            print_tree(child, indent + 1)

print_tree(tree_response.tree)
# Output:
# [DIRECTORY] Projects
#   [DIRECTORY] ML
#     [DIRECTORY] Models
#       [NOTEBOOK] training_pipeline
#     [DIRECTORY] Data
#   [DIRECTORY] Analytics
#     [NOTEBOOK] sales_report
```

### Directory Statistics
```python
# Get comprehensive statistics about a directory
stats = get_directory_stats(host, token, path="/Projects", recursive=True)

print(f"Total notebooks: {stats.total_notebooks}")
print(f"Total directories: {stats.total_directories}")
print(f"Total files: {stats.total_files}")
print(f"Total size: {stats.total_size_bytes / 1024 / 1024:.2f} MB")

# Language breakdown
print("\nNotebooks by language:")
print(f"  Python: {stats.language_breakdown.PYTHON}")
print(f"  SQL: {stats.language_breakdown.SQL}")
print(f"  Scala: {stats.language_breakdown.SCALA}")
print(f"  R: {stats.language_breakdown.R}")
```

### Search Directories
```python
# Search for directories by name pattern (regex)
response = search_directories(
    host, token,
    path="/Projects",
    pattern=".*analysis.*",  # Find all directories with "analysis" in name
    recursive=True,
    case_sensitive=False
)

print(f"Found {response.total_matches} matching directories:")
for result in response.results:
    print(f"  {result.path}")
    print(f"    Name: {result.name}")
    print(f"    Modified: {result.modified_at}")
```

**Use Cases:**
- 🗂️ **Workspace Organization**: Programmatically create organized folder structures
- 🔍 **Discovery**: Find and navigate directory hierarchies
- 📊 **Analytics**: Understand workspace composition and usage patterns
- 🧹 **Cleanup**: Identify and remove old or unused directories
- 📈 **Reporting**: Generate workspace structure reports

## Type Safety

All tools use proper type hints that match the Databricks SDK:

```python
from typing import Any
from databricks.sdk.service.compute import ClusterDetails
from databricks.sdk.service.sql import ListQueryObjectsResponseQuery
from databricks.sdk.service.jobs import BaseJob, Run

def list_clusters(host: str, token: str) -> list[dict[str, Any]]:
    """Returns list of cluster details matching SDK ClusterDetails type."""
    ...

def list_queries(host: str, token: str) -> list[dict[str, Any]]:
    """Returns list of queries matching SDK ListQueryObjectsResponseQuery type."""
    ...
```

This ensures:
- **IDE autocomplete** for return types
- **Type checking** with mypy/pyright
- **Runtime validation** via Pydantic
- **Consistent API** matching Databricks SDK

## Production Deployment

### Using systemd

Create `/etc/systemd/system/databricks-mcp.service`:

```ini
[Unit]
Description=Databricks MCP Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/databricks
ExecStart=/usr/bin/python3 server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable databricks-mcp
sudo systemctl start databricks-mcp
```

### Using Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "server.py"]
```

Build and run:
```bash
docker build -t databricks-mcp .
docker run databricks-mcp
```

## Unity Catalog - Tables

The Unity Catalog Tables API provides comprehensive table management capabilities for discovering, inspecting, and managing tables in your Unity Catalog metastore.

### List Tables

```python
# List all tables in a schema
tables = list_tables(
    host, token,
    catalog_name="main",
    schema_name="default"
)
for table in tables.tables:
    print(f"{table.full_name} ({table.table_type})")
    print(f"  Owner: {table.owner}")
    print(f"  Format: {table.data_source_format}")
    print(f"  Location: {table.storage_location}")
    if table.columns:
        print(f"  Columns: {len(table.columns)}")

# List with pagination
tables = list_tables(
    host, token,
    catalog_name="main",
    schema_name="default",
    max_results=100
)
print(f"Found {tables.count} tables")
if tables.next_page_token:
    next_page = list_tables(
        host, token,
        catalog_name="main",
        schema_name="default",
        max_results=100,
        page_token=tables.next_page_token
    )

# Optimize for speed by omitting detailed info
tables = list_tables(
    host, token,
    catalog_name="main",
    schema_name="default",
    omit_columns=True,  # Skip column details
    omit_properties=True,  # Skip table properties
    omit_username=True  # Skip username fields
)
```

### List Table Summaries

```python
# Efficiently discover all tables in a catalog
summaries = list_table_summaries(
    host, token,
    catalog_name="main"
)
for summary in summaries.summaries:
    print(f"{summary.full_name}: {summary.table_type}")

# Find all fact tables in production schemas
summaries = list_table_summaries(
    host, token,
    catalog_name="main",
    schema_name_pattern="prod_%",  # SQL LIKE pattern
    table_name_pattern="%_fact"  # SQL LIKE pattern
)
print(f"Found {summaries.count} fact tables in production schemas")

# Find all staging tables
summaries = list_table_summaries(
    host, token,
    catalog_name="main",
    schema_name_pattern="staging%",
    max_results=1000
)
```

### Get Table Details

```python
# Get complete table information
table = get_table(
    host, token,
    full_name="main.default.sales"
)
print(f"Table: {table.full_name}")
print(f"Type: {table.table_type}")
print(f"Format: {table.data_source_format}")
print(f"Location: {table.storage_location}")
print(f"Owner: {table.owner}")
print(f"Created: {table.created_at} by {table.created_by}")
print(f"Updated: {table.updated_at} by {table.updated_by}")

# Print column details
if table.columns:
    print(f"\nColumns ({len(table.columns)}):")
    for col in table.columns:
        nullable = "NULL" if col.nullable else "NOT NULL"
        print(f"  {col.position}: {col.name} {col.type_text} {nullable}")
        if col.comment:
            print(f"     {col.comment}")

# Get with Delta metadata for Delta tables
table = get_table(
    host, token,
    full_name="main.default.delta_table",
    include_delta_metadata=True
)
if table.delta_runtime_properties_kvpairs:
    print(f"Delta properties: {table.delta_runtime_properties_kvpairs}")

# Get view definition
table = get_table(host, token, full_name="main.default.customer_view")
if table.view_definition:
    print(f"View SQL:\n{table.view_definition}")
```

### Check Table Existence

```python
# Check if table exists before querying
exists = table_exists(
    host, token,
    full_name="main.default.sales"
)
if exists.table_exists:
    print(f"Table {exists.full_name} exists")
    # Safe to proceed
    table = get_table(host, token, full_name=exists.full_name)
else:
    print(f"Table {exists.full_name} does not exist")
    # Create table first

# Guard against missing tables in workflows
table_name = "main.default.temp_analysis"
if not table_exists(host, token, full_name=table_name).table_exists:
    print(f"Creating {table_name}...")
    # Create table via SQL
else:
    print(f"{table_name} already exists")
```

### Delete Table

```python
# Delete a table
result = delete_table(
    host, token,
    full_name="main.default.temp_table"
)
print(result.message)

# Delete after checking existence
if table_exists(host, token, full_name="main.default.old_data").table_exists:
    delete_table(host, token, full_name="main.default.old_data")
    print("Old data table deleted")

# Cleanup temporary tables
temp_tables = [
    "main.staging.temp_1",
    "main.staging.temp_2",
    "main.staging.temp_3"
]
for table_name in temp_tables:
    if table_exists(host, token, full_name=table_name).table_exists:
        delete_table(host, token, full_name=table_name)
        print(f"Deleted {table_name}")
```

### Update Table Owner

```python
# Transfer table ownership
result = update_table_owner(
    host, token,
    full_name="main.default.sales",
    owner="data-engineer@company.com"
)
print(result.message)

# Update ownership for multiple tables
tables = [
    "main.default.sales",
    "main.default.customers",
    "main.default.orders"
]
new_owner = "analytics-team@company.com"
for table in tables:
    update_table_owner(host, token, full_name=table, owner=new_owner)
    print(f"Updated owner for {table}")

# Transfer ownership of all tables in a schema
all_tables = list_tables(
    host, token,
    catalog_name="main",
    schema_name="legacy",
    omit_columns=True
)
for table in all_tables.tables:
    update_table_owner(
        host, token,
        full_name=table.full_name,
        owner="new-owner@company.com"
    )
    print(f"Transferred {table.full_name}")
```

**Table Types:**
- `MANAGED` - Data managed by Unity Catalog (stored in managed storage)
- `EXTERNAL` - Data stored in external location
- `VIEW` - Virtual table defined by SQL query

**Data Source Formats:**
- `DELTA` - Delta Lake tables (recommended)
- `PARQUET` - Apache Parquet files
- `CSV` - Comma-separated values
- `JSON` - JSON files
- `ORC` - Optimized Row Columnar
- `AVRO` - Apache Avro
- `TEXT` - Plain text files

**Key Features:**
- 📊 **Table Discovery**: Efficiently discover tables across schemas with pattern matching
- 🔍 **Deep Inspection**: Get complete table metadata including columns, constraints, and properties
- ⚡ **Performance**: List summaries for fast discovery, detailed metadata when needed
- 🎯 **Filtering**: SQL LIKE patterns for flexible schema and table name matching
- 📄 **Pagination**: Handle large result sets with built-in pagination support
- 🗂️ **Column Details**: Full column schema including types, nullability, and comments
- 👁️ **View Definitions**: Retrieve SQL definitions for views
- 🏷️ **Metadata**: Access creation time, owner, storage location, and custom properties
- ⚡ **Existence Checks**: Fast table existence verification without full metadata fetch
- 🔧 **Management**: Delete tables and update ownership

**Use Cases:**
- 📋 **Data Catalog**: Build automated data catalogs and documentation
- 🔍 **Table Discovery**: Find tables by name patterns and schemas
- 📊 **Schema Analysis**: Analyze table structures and column types
- 🔄 **Migration**: Transfer table ownership and manage lifecycle
- 🧹 **Cleanup**: Identify and remove temporary or unused tables
- 🎯 **Access Control**: Audit table ownership and permissions
- 🤖 **Agentic Discovery**: Enable agents to autonomously discover and understand data structures

**Permissions Required:**
- `USE_CATALOG` - Required on parent catalog
- `USE_SCHEMA` - Required on parent schema
- `SELECT` - Required on table (for read operations)
- Ownership or admin privileges for delete and update operations

## Unity Catalog - Catalogs

The Unity Catalog Catalogs API provides comprehensive catalog management capabilities. A catalog is the first layer of Unity Catalog's three-level namespace and is used to organize your data assets.

### List Catalogs

```python
# List all catalogs
catalogs = list_catalogs(host, token)
for catalog in catalogs.catalogs:
    print(f"{catalog.name}")
    print(f"  Owner: {catalog.owner}")
    print(f"  Type: {catalog.catalog_type}")
    print(f"  Storage: {catalog.storage_root}")
    print(f"  Isolation: {catalog.isolation_mode}")

# List with pagination
catalogs = list_catalogs(
    host, token,
    max_results=50
)
print(f"Found {catalogs.count} catalogs")
if catalogs.next_page_token:
    next_page = list_catalogs(
        host, token,
        max_results=50,
        page_token=catalogs.next_page_token
    )
```

### Get Catalog Details

```python
# Get full catalog details
catalog = get_catalog(host, token, name="main")
print(f"Catalog: {catalog.name}")
print(f"Type: {catalog.catalog_type}")
print(f"Owner: {catalog.owner}")
print(f"Storage: {catalog.storage_root}")
print(f"Isolation: {catalog.isolation_mode}")
print(f"Comment: {catalog.comment}")
print(f"Created: {catalog.created_at} by {catalog.created_by}")
print(f"Updated: {catalog.updated_at} by {catalog.updated_by}")

# Check custom properties
if catalog.properties:
    print("Properties:")
    for key, value in catalog.properties.items():
        print(f"  {key}: {value}")
```

### Create Catalog

```python
# Create a basic catalog
result = create_catalog(
    host, token,
    name="analytics",
    comment="Analytics data catalog"
)
print(f"Created catalog: {result.catalog_info.name}")

# Create catalog with custom storage
result = create_catalog(
    host, token,
    name="external_data",
    comment="External data sources",
    storage_root="s3://my-bucket/external/"
)
print(f"Catalog created with storage: {result.catalog_info.storage_root}")

# Create catalog with properties
result = create_catalog(
    host, token,
    name="prod_data",
    comment="Production data catalog",
    properties={
        "environment": "production",
        "cost_center": "12345",
        "data_classification": "confidential",
        "backup_enabled": "true"
    }
)
print(f"Catalog {result.catalog_info.name} created with properties")

# Create Delta Sharing catalog
result = create_catalog(
    host, token,
    name="shared_catalog",
    comment="Shared data catalog",
    provider_name="my_sharing_provider",
    share_name="my_share"
)
print(f"Delta Sharing catalog created: {result.catalog_info.name}")

# Create catalog connected to external source
result = create_catalog(
    host, token,
    name="external_db",
    comment="External database catalog",
    connection_name="my_external_connection",
    options={
        "database": "my_database",
        "schema": "public"
    }
)
```

### Delete Catalog

```python
# Delete an empty catalog
result = delete_catalog(host, token, name="temp_catalog")
print(result.message)

# Force delete a catalog with schemas and tables
result = delete_catalog(
    host, token,
    name="old_catalog",
    force=True
)
print(f"Force deleted {result.name}")

# Safe deletion with error handling
try:
    catalog = get_catalog(host, token, name="staging")
    delete_catalog(host, token, name="staging")
    print("Catalog deleted successfully")
except Exception as e:
    print(f"Cannot delete catalog: {e}")

# Cleanup temporary catalogs
temp_catalogs = ["temp_1", "temp_2", "temp_3"]
for catalog_name in temp_catalogs:
    try:
        delete_catalog(host, token, name=catalog_name, force=True)
        print(f"Deleted {catalog_name}")
    except Exception as e:
        print(f"Could not delete {catalog_name}: {e}")
```

### Update Catalog

```python
# Update catalog comment
result = update_catalog(
    host, token,
    name="analytics",
    comment="Updated analytics catalog with new data sources"
)
print(f"Updated: {result.catalog_info.name}")
print(f"New comment: {result.catalog_info.comment}")

# Transfer catalog ownership
result = update_catalog(
    host, token,
    name="staging",
    owner="data-engineer@company.com"
)
print(f"New owner: {result.catalog_info.owner}")

# Rename catalog
result = update_catalog(
    host, token,
    name="old_name",
    new_name="new_name"
)
print(f"Renamed to: {result.catalog_info.name}")

# Set isolation mode to ISOLATED
result = update_catalog(
    host, token,
    name="sensitive_data",
    isolation_mode="ISOLATED"
)
print(f"Isolation mode: {result.catalog_info.isolation_mode}")

# Update catalog properties
result = update_catalog(
    host, token,
    name="prod",
    properties={
        "environment": "production",
        "data_classification": "confidential",
        "backup_enabled": "true",
        "retention_days": "365"
    }
)

# Enable predictive optimization
result = update_catalog(
    host, token,
    name="analytics",
    enable_predictive_optimization="ENABLE"
)
print("Predictive optimization enabled")

# Bulk ownership transfer
catalogs = list_catalogs(host, token)
new_owner = "admin-team@company.com"
for catalog in catalogs.catalogs:
    if catalog.owner == "old-admin@company.com":
        update_catalog(
            host, token,
            name=catalog.name,
            owner=new_owner
        )
        print(f"Transferred {catalog.name} to {new_owner}")
```

**Catalog Types:**
- `MANAGED_CATALOG` - Standard Unity Catalog managed catalog
- `DELTASHARING_CATALOG` - Delta Sharing catalog (based on remote share)
- `SYSTEM_CATALOG` - System catalog (read-only)

**Isolation Modes:**
- `OPEN` - Catalog accessible from all workspaces (default)
- `ISOLATED` - Catalog accessible only from specific workspaces

**Key Features:**
- 🗂️ **Top-Level Namespace**: First layer of Unity Catalog's 3-level hierarchy
- 📁 **Data Organization**: Organize schemas and tables logically
- 💾 **Custom Storage**: Configure custom storage locations for managed tables
- 🔗 **External Connections**: Connect to external data sources
- 🤝 **Delta Sharing**: Create catalogs based on Delta shares
- 🏷️ **Metadata**: Add comments and custom properties
- 👥 **Ownership**: Transfer ownership and manage access
- 🔒 **Isolation**: Control workspace access with isolation modes
- 📄 **Pagination**: Handle large numbers of catalogs
- ⚡ **Predictive Optimization**: Enable automatic optimization
- 🔄 **Rename**: Update catalog names while preserving data
- 🗑️ **Force Delete**: Remove catalogs even when they contain schemas

**Common Use Cases:**
- 🏗️ **Multi-Tenant Setup**: Separate catalogs for different tenants or departments
- 🔐 **Data Segregation**: Isolate sensitive data in dedicated catalogs
- 🌍 **Geographic Separation**: Catalogs for different regions or locations
- 🔄 **Environment Separation**: Separate catalogs for dev, test, prod
- 🤝 **Data Sharing**: Delta Sharing catalogs for cross-organization sharing
- 🔗 **External Integration**: Connect to external databases and data sources
- 📊 **Domain-Driven Design**: Catalogs aligned with business domains
- 🎯 **Compliance**: Organize data by regulatory requirements

**Predictive Optimization Values:**
- `ENABLE` - Enable predictive optimization for the catalog
- `DISABLE` - Disable predictive optimization
- `INHERIT` - Inherit setting from metastore (default)

**Permissions Required:**
- `CREATE_CATALOG` - Required on metastore to create catalogs
- `USE_CATALOG` - Required to access catalog contents
- Ownership or admin privileges for update, delete, and rename operations
- Metastore admin privileges to change ownership
- Force delete requires ownership or metastore admin privileges

## Unity Catalog - Schemas

The Unity Catalog Schemas API provides comprehensive schema (database) management capabilities for organizing tables, views, and functions within catalogs.

### List Schemas

```python
# List all schemas in a catalog
schemas = list_schemas(
    host, token,
    catalog_name="main"
)
for schema in schemas.schemas:
    print(f"{schema.full_name}")
    print(f"  Owner: {schema.owner}")
    print(f"  Storage: {schema.storage_root}")
    print(f"  Comment: {schema.comment}")

# List with pagination
schemas = list_schemas(
    host, token,
    catalog_name="main",
    max_results=50
)
print(f"Found {schemas.count} schemas")
if schemas.next_page_token:
    next_page = list_schemas(
        host, token,
        catalog_name="main",
        max_results=50,
        page_token=schemas.next_page_token
    )
```

### Get Schema Details

```python
# Get full schema details
schema = get_schema(
    host, token,
    full_name="main.analytics"
)
print(f"Schema: {schema.full_name}")
print(f"Catalog: {schema.catalog_name}")
print(f"Owner: {schema.owner}")
print(f"Storage: {schema.storage_root}")
print(f"Comment: {schema.comment}")
print(f"Created: {schema.created_at} by {schema.created_by}")
print(f"Updated: {schema.updated_at} by {schema.updated_by}")

# Check custom properties
if schema.properties:
    print("Properties:")
    for key, value in schema.properties.items():
        print(f"  {key}: {value}")
```

### Create Schema

```python
# Create a basic schema
result = create_schema(
    host, token,
    name="analytics",
    catalog_name="main",
    comment="Analytics tables and views"
)
print(f"Created schema: {result.schema_info.full_name}")

# Create schema with custom storage location
result = create_schema(
    host, token,
    name="staging",
    catalog_name="main",
    comment="Staging data",
    storage_root="s3://my-bucket/staging/"
)
print(f"Schema created with storage: {result.schema_info.storage_root}")

# Create schema with properties
result = create_schema(
    host, token,
    name="prod",
    catalog_name="main",
    comment="Production tables",
    properties={
        "environment": "production",
        "owner_team": "data-engineering",
        "cost_center": "12345",
        "data_classification": "confidential"
    }
)
print(f"Schema {result.schema_info.full_name} created with properties")

# Create multiple schemas for different environments
environments = ["dev", "test", "staging", "prod"]
for env in environments:
    result = create_schema(
        host, token,
        name=f"sales_{env}",
        catalog_name="main",
        comment=f"Sales data for {env} environment",
        properties={"environment": env}
    )
    print(f"Created: {result.schema_info.full_name}")
```

### Delete Schema

```python
# Delete an empty schema
result = delete_schema(
    host, token,
    full_name="main.temp_schema"
)
print(result.message)

# Force delete a schema with tables
result = delete_schema(
    host, token,
    full_name="main.old_schema",
    force=True
)
print(f"Force deleted {result.full_name}")

# Safe deletion with error handling
try:
    schema = get_schema(host, token, full_name="main.staging")
    delete_schema(host, token, full_name="main.staging")
    print("Schema deleted successfully")
except Exception as e:
    print(f"Cannot delete schema: {e}")

# Cleanup temporary schemas
temp_schemas = ["main.temp_1", "main.temp_2", "main.temp_3"]
for schema_name in temp_schemas:
    try:
        delete_schema(host, token, full_name=schema_name, force=True)
        print(f"Deleted {schema_name}")
    except Exception as e:
        print(f"Could not delete {schema_name}: {e}")
```

### Update Schema

```python
# Update schema comment
result = update_schema(
    host, token,
    full_name="main.analytics",
    comment="Updated analytics schema with new datasets and dashboards"
)
print(f"Updated: {result.schema_info.full_name}")
print(f"New comment: {result.schema_info.comment}")

# Transfer schema ownership
result = update_schema(
    host, token,
    full_name="main.staging",
    owner="data-engineer@company.com"
)
print(f"New owner: {result.schema_info.owner}")

# Rename schema
result = update_schema(
    host, token,
    full_name="main.old_name",
    new_name="new_name"
)
print(f"Renamed to: {result.schema_info.full_name}")

# Update schema properties
result = update_schema(
    host, token,
    full_name="main.prod",
    properties={
        "environment": "production",
        "data_classification": "confidential",
        "backup_enabled": "true",
        "retention_days": "365"
    }
)

# Enable predictive optimization
result = update_schema(
    host, token,
    full_name="main.analytics",
    enable_predictive_optimization="ENABLE"
)
print("Predictive optimization enabled")

# Bulk ownership transfer
schemas = list_schemas(host, token, catalog_name="main")
new_owner = "analytics-team@company.com"
for schema in schemas.schemas:
    if schema.owner == "old-owner@company.com":
        update_schema(
            host, token,
            full_name=schema.full_name,
            owner=new_owner
        )
        print(f"Transferred {schema.full_name} to {new_owner}")
```

**Key Features:**
- 📁 **Schema Organization**: Organize tables, views, and functions in logical schemas
- 🗂️ **Catalog Hierarchy**: Schemas sit between catalogs and tables in Unity Catalog
- 💾 **Custom Storage**: Configure custom storage locations for managed tables
- 🏷️ **Metadata**: Add comments and custom properties for documentation
- 👥 **Ownership**: Transfer ownership and manage access control
- 📄 **Pagination**: Handle large numbers of schemas with built-in pagination
- ⚡ **Predictive Optimization**: Enable automatic optimization for better performance
- 🔄 **Rename**: Update schema names while preserving data
- 🗑️ **Force Delete**: Remove schemas even when they contain tables

**Common Use Cases:**
- 🏗️ **Multi-Environment Setup**: Create separate schemas for dev, test, staging, prod
- 🔐 **Data Segregation**: Separate sensitive data into different schemas
- 📊 **Logical Grouping**: Group related tables by domain (sales, marketing, finance)
- 🔄 **Migration**: Create new schemas for data migration workflows
- 👥 **Team Organization**: Dedicated schemas for different teams or projects
- 🧪 **Experimentation**: Temporary schemas for testing and experimentation
- 📋 **Compliance**: Organize data by classification or retention requirements

**Predictive Optimization Values:**
- `ENABLE` - Enable predictive optimization for the schema
- `DISABLE` - Disable predictive optimization
- `INHERIT` - Inherit setting from parent catalog (default)

**Permissions Required:**
- `CREATE_SCHEMA` - Required on parent catalog to create schemas
- `USE_SCHEMA` - Required to access schema contents
- Ownership or admin privileges for update, delete, and rename operations
- Force delete requires ownership or catalog admin privileges

## Development

### Adding New Tools

**Step 1**: Create a new tool function in the appropriate category file (or create a new category):

```python
# In tools/queries.py (or create tools/new_category.py)
from typing import Any
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import SomeSDKType  # Import SDK type
from cache import get_workspace_client

def my_new_tool(host: str, token: str, param1: str) -> dict[str, Any]:
    """Tool description.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        param1: Description of parameter
        
    Returns:
        Dictionary matching SDK SomeSDKType structure
    """
    client = get_workspace_client(host, token)
    # Your implementation
    result = client.some_api.some_method(param1)
    
    # Convert SDK dataclass to dict
    if hasattr(result, 'as_dict'):
        return result.as_dict()
    return {"result": str(result)}
```

**Step 2**: Export the tool in `tools/__init__.py`:

```python
from .queries import list_queries, get_query, my_new_tool

__all__ = [
    'list_queries',
    'get_query',
    'my_new_tool',  # Add here
]
```

**Step 3**: Register the tool in `server.py`:

```python
from tools.queries import list_queries, get_query, my_new_tool

mcp.tool()(my_new_tool)
```

FastMCP automatically:
- Registers the tool
- Validates parameters
- Handles errors
- Provides documentation

### Cache Management

View cache stats:
```python
from cache import get_cache_info
print(get_cache_info())
```

Clear cache:
```python
from cache import clear_cache
clear_cache()
```

## Troubleshooting

**Server won't start:**
```bash
pip install -r requirements.txt
```

**Invalid credentials:**
- Verify workspace URL format
- Check token starts with `dapi`
- Verify token permissions in Databricks

**Connection timeout:**
- Check workspace URL is accessible
- Verify network connectivity
- Check firewall rules

## Resources

- [FastMCP Documentation](https://github.com/jlowin/fastmcp)
- [Databricks SDK Documentation](https://databricks-sdk-py.readthedocs.io/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

## License

Same as parent project.
