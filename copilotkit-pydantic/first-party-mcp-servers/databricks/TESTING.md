# Testing the Databricks MCP Server

This guide shows how to test the Databricks MCP server with the new credential key-based architecture.

## Prerequisites

### 1. Install Dependencies

```bash
cd /Users/hnankam/Downloads/data/project-hands-off/copilotkit-pydantic/first-party-mcp-servers/databricks
pip install -r requirements.txt
```

### 2. Set Up Database Environment

Create a `.env` file with database credentials:

```bash
# Database configuration
DB_HOST=your-database-host.com
DB_PORT=5432
DB_DATABASE=your_database
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_OTHER_PARAMS=sslmode=require

# Encryption key (must match Node.js backend)
ENCRYPTION_MASTER_SECRET=your-32-character-secret-key
```

### 3. Create Test Credentials in Database

Before testing, you need to add Databricks credentials to the `workspace_credentials` table.

**IMPORTANT**: The `key` column is used as the credential identifier and must be **globally unique** across all users. Use descriptive, unique keys like:
- `my_prod_databricks_host`
- `my_prod_databricks_token`
- `team_analytics_databricks_host`

#### Option A: Using the Admin UI (Recommended)
1. Navigate to the Home page → Workspace tab
2. Click "Add Credential"
3. Add two credentials:
   - **Host Credential**: 
     - Name: "My Databricks Host"
     - Type: "databricks_host"
     - Key: `my_databricks_host` ← **REQUIRED: Globally unique identifier**
     - Password: `https://your-workspace.cloud.databricks.com`
   - **Token Credential**:
     - Name: "My Databricks Token"
     - Type: "databricks_token"
     - Key: `my_databricks_token` ← **REQUIRED: Globally unique identifier**
     - Password: `dapi1234567890abcdef...` (your PAT)

4. Use these keys when calling MCP tools

#### Option B: Using SQL (For Testing)

```sql
-- Insert test credentials (encrypted)
-- Note: These should be properly encrypted using the encryption utilities

-- 1. Get your user_id
SELECT id FROM "user" WHERE email = 'your-email@example.com';

-- 2. Insert credentials (you'll need to use the Node.js API to encrypt properly)
-- Example via the workspace credentials API endpoint:
POST /api/workspace/credentials
{
  "name": "My Databricks Host",
  "type": "databricks_host",
  "key": "my_databricks_host",
  "password": "https://your-workspace.cloud.databricks.com"
}

POST /api/workspace/credentials
{
  "name": "My Databricks Token",
  "type": "databricks_token",
  "key": "my_databricks_token",
  "password": "dapi1234567890abcdef..."
}

-- 3. Use the keys you provided (my_databricks_host, my_databricks_token) in tool calls
```

## Testing Methods

### Method 1: FastMCP Inspector (Recommended for Development)

The FastMCP Inspector provides a web UI to test tools interactively.

```bash
cd /Users/hnankam/Downloads/data/project-hands-off/copilotkit-pydantic/first-party-mcp-servers/databricks
fastmcp dev server.py
```

Then open: http://localhost:5173

**Test a tool:**
1. Select a tool (e.g., `list_clusters`)
2. Enter credential keys:
   ```json
   {
     "host_credential_key": "my_databricks_host",
     "token_credential_key": "my_databricks_token"
   }
   ```
3. Click "Run Tool"
4. View results

### Method 2: Run Server (stdio mode)

Run the server directly:

```bash
python server.py
```

The server will listen on stdin/stdout for MCP protocol messages.

### Method 3: SSE Mode (HTTP)

Run as an HTTP server:

```bash
fastmcp run server.py --transport sse
# or shorthand:
fastmcp run server.py -t sse
```

Server runs on: http://localhost:8000/sse

### Method 4: Python Test Script

Create a test script:

```python
# test_databricks_mcp.py
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def test_list_clusters():
    """Test listing Databricks clusters."""
    
    # Credential IDs from your database
    HOST_CREDENTIAL_KEY = "my_databricks_host"
    TOKEN_CREDENTIAL_KEY = "my_databricks_token"
    
    async with stdio_client(
        StdioServerParameters(
            command='python',
            args=['server.py']
        )
    ) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize session
            await session.initialize()
            
            # Call the tool
            result = await session.call_tool(
                'list_clusters',
                arguments={
                    'host_credential_key': HOST_CREDENTIAL_KEY,
                    'token_credential_key': TOKEN_CREDENTIAL_KEY
                }
            )
            
            print("Clusters:", result)

if __name__ == "__main__":
    asyncio.run(test_list_clusters())
```

Run:
```bash
python test_databricks_mcp.py
```

## Test Cases

### 1. List Clusters

```json
{
  "tool": "list_clusters",
  "arguments": {
    "host_credential_key": "my_databricks_host",
    "token_credential_key": "my_databricks_token"
  }
}
```

Expected: List of clusters with their states

### 2. Execute SQL Statement

```json
{
  "tool": "execute_statement",
  "arguments": {
    "host_credential_key": "my_databricks_host",
    "token_credential_key": "my_databricks_token",
    "statement": "SELECT * FROM samples.nyctaxi.trips LIMIT 10",
    "warehouse_id": "your-warehouse-id",
    "wait_timeout": "30s"
  }
}
```

Expected: Query results with data

### 3. List Warehouses

```json
{
  "tool": "list_warehouses",
  "arguments": {
    "host_credential_key": "my_databricks_host",
    "token_credential_key": "my_databricks_token"
  }
}
```

Expected: List of SQL warehouses

### 4. List Unity Catalog Tables

```json
{
  "tool": "list_tables",
  "arguments": {
    "host_credential_key": "my_databricks_host",
    "token_credential_key": "my_databricks_token",
    "catalog_name": "main",
    "schema_name": "default"
  }
}
```

Expected: List of tables in the schema

## Debugging

### Enable Verbose Logging

```python
# In server.py, change logging level
logging.basicConfig(level=logging.DEBUG)
```

### Check Credential Resolution

Test the credential resolver directly:

```python
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.credential_resolver import resolve_credential

# Test resolving a credential
credential_id = "your-credential-uuid"
value = resolve_credential(credential_id)
print(f"Resolved: {value[:20]}...")  # Print first 20 chars
```

### Common Issues

1. **Import Error: "credential_resolver" could not be resolved**
   - ✅ Fixed: Using `from shared.credential_resolver import resolve_credential`
   - Path is added dynamically in cache.py

2. **Database Connection Failed**
   - Check `.env` file has correct DB credentials
   - Verify database is accessible

3. **Credential Not Found**
   - Verify credential UUID exists in database
   - Check `workspace_credentials` table

4. **Decryption Failed**
   - Ensure `ENCRYPTION_MASTER_SECRET` matches Node.js backend
   - Credentials must be encrypted with same key

5. **Databricks API Errors**
   - Verify workspace URL is correct
   - Check token has necessary permissions
   - Test token directly with Databricks REST API

## Monitoring

### Cache Statistics

Check credential cache:

```python
from shared.credential_resolver import get_credential_cache_info

stats = get_credential_cache_info()
print(stats)
# Output: {'size': 2, 'maxsize': 1000, 'ttl': 3600}
```

Check client cache:

```python
from databricks.cache import get_cache_info

stats = get_cache_info()
print(stats)
# Output: {'workspace': {'size': 1, 'maxsize': 1000, 'ttl': 3600}, ...}
```

## Integration with Main Application

### Register the Server

In your admin UI, register the Databricks MCP server:

```json
{
  "name": "Databricks",
  "command": "python",
  "args": [
    "/path/to/copilotkit-pydantic/first-party-mcp-servers/databricks/server.py"
  ],
  "env": {
    "DB_HOST": "your-database-host",
    "DB_PORT": "5432",
    "DB_DATABASE": "your_database",
    "DB_USERNAME": "your_username",
    "DB_PASSWORD": "your_password",
    "ENCRYPTION_MASTER_SECRET": "your-secret-key"
  }
}
```

### Agent Usage

The agent will:
1. Receive credential metadata (IDs only, not values)
2. Call tools with credential keys
3. Server resolves IDs to actual values
4. Execute Databricks API calls

**Security:** The agent never sees actual credential values!

## Performance Testing

### Benchmark Credential Resolution

```python
import time
from shared.credential_resolver import resolve_credential

credential_id = "your-test-credential-uuid"

# First call (cache miss)
start = time.time()
value1 = resolve_credential(credential_id)
time1 = time.time() - start
print(f"First call (cache miss): {time1*1000:.2f}ms")

# Second call (cache hit)
start = time.time()
value2 = resolve_credential(credential_id)
time2 = time.time() - start
print(f"Second call (cache hit): {time2*1000:.2f}ms")

# Expected: <50ms for miss, <1ms for hit
```

## Next Steps

1. ✅ Set up database credentials
2. ✅ Test credential resolution
3. ✅ Run FastMCP Inspector
4. ✅ Test basic tools (list_clusters, list_warehouses)
5. ✅ Test SQL execution
6. ✅ Register with main application
7. ✅ Test end-to-end with agent

## Helpful Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run inspector
fastmcp dev server.py

# Run server (stdio)
python server.py

# Run server (SSE)
fastmcp run server.py --sse

# Test import
python -c "from shared.credential_resolver import resolve_credential; print('✓')"

# Check tools
fastmcp inspect server.py
```

## Support

For issues:
1. Check logs for error messages
2. Verify database connection
3. Test credential resolution separately
4. Verify Databricks API access
5. Check encryption key matches Node.js backend

