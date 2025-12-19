# Databricks MCP Server - Quick Start Guide (FastMCP)

## 📦 Installation

```bash
cd copilotkit-pydantic/first-party-mcp-servers/databricks
pip install -r requirements.txt
```

## 🚀 Running the Server

### Option 1: stdio (Default)

```bash
python server.py
```

### Option 2: SSE (HTTP-based)

```bash
fastmcp run server.py --sse
```

This starts an HTTP server on `http://localhost:8000/sse`

### Option 3: Development Mode (with Inspector)

```bash
fastmcp dev server.py
```

Opens interactive tool inspector at `http://localhost:5173`

## 🧪 Testing

### Using FastMCP Inspector (Recommended)

```bash
fastmcp dev server.py
```

Then open `http://localhost:5173` in your browser to:
- See all available tools
- Test tools with different parameters
- View tool schemas
- Debug responses

### Testing with MCP Client

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async with stdio_client(
    StdioServerParameters(
        command="python",
        args=["server.py"]
    )
) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
        
        # List available tools
        tools = await session.list_tools()
        print(tools)
        
        # Call a tool
        result = await session.call_tool(
            "list_queries",
            arguments={
                "host": "https://your-workspace.cloud.databricks.com",
                "token": "dapi..."
            }
        )
        print(result)
```

## 🔧 Registering with Your Application

### Via Admin UI

1. **Start the server** (choose transport type)
   
2. **Go to Admin UI** → Tools → MCP Servers

3. **Click "Add MCP Server"**

4. **For stdio transport:**
   - **Server Key**: `databricks`
   - **Display Name**: `Databricks`
   - **Transport**: `stdio`
   - **Command**: `python`
   - **Args**: `["/absolute/path/to/server.py"]`

5. **For SSE transport:**
   - **Server Key**: `databricks`
   - **Display Name**: `Databricks`
   - **Transport**: `sse`
   - **URL**: `http://localhost:8000/sse`

6. **Save** - Tools will be auto-discovered

7. **Assign to Agents** - Configure which agents can use Databricks tools

## 📝 Available Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_queries` | `host`, `token` | List all SQL queries |
| `get_query` | `host`, `token`, `query_id` | Get query details |
| `list_jobs` | `host`, `token`, `limit?` | List jobs |
| `get_job` | `host`, `token`, `job_id` | Get job details |
| `trigger_job` | `host`, `token`, `job_id`, params? | Trigger job run |
| `list_clusters` | `host`, `token` | List clusters |
| `get_cluster` | `host`, `token`, `cluster_id` | Get cluster details |
| `list_workspace_files` | `host`, `token`, `path?` | List workspace files |

**All tools require:**
- `host`: Databricks workspace URL (e.g., `https://my-workspace.cloud.databricks.com`)
- `token`: Personal Access Token (starts with `dapi`)

## 🔐 How Credentials Work

1. **Frontend**: User enters credentials in credential UI
2. **Context**: Credentials sent via `useCopilotReadable` in copilot context
3. **Agent**: Extracts `{databricks_host, databricks_token}` from context
4. **Tool Call**: Agent passes credentials to MCP tool as parameters
5. **MCP Server**: Receives credentials, creates/retrieves cached client
6. **Databricks API**: Makes authenticated API calls

**Security Features:**
- ✅ No credentials stored on MCP server
- ✅ Credentials only in memory during request
- ✅ Client connections cached with SHA-256 hashed keys
- ✅ 1-hour TTL on cached connections

## 🎯 Example Agent Usage

When user asks: *"List my Databricks SQL queries"*

1. Agent sees `list_queries` tool in available tools
2. Agent extracts `{databricks_host, databricks_token}` from context
3. Agent calls:
   ```python
   list_queries(
       host="https://workspace.cloud.databricks.com",
       token="dapi..."
   )
   ```
4. MCP server executes and returns results
5. Agent presents results to user

## 🐛 Troubleshooting

### Server won't start

```bash
# Check Python version (3.10+)
python --version

# Reinstall dependencies
pip install -r requirements.txt

# Try verbose mode
python server.py --verbose
```

### Connection errors

```bash
# Verify server is running (stdio)
ps aux | grep server.py

# Verify server is running (SSE)
curl http://localhost:8000/sse

# Check server logs
# (logs appear in console where you ran python server.py)
```

### Invalid credentials

- Verify URL format: `https://your-workspace.cloud.databricks.com`
- Verify token starts with `dapi`
- Test credentials manually:
  ```python
  from databricks.sdk import WorkspaceClient
  client = WorkspaceClient(host="https://...", token="dapi...")
  list(client.queries.list())
  ```

### Tools not appearing in UI

1. Check server is registered correctly
2. Verify transport type matches (stdio vs SSE)
3. Check server logs for errors
4. Try re-registering the server

## 📈 Production Deployment

### Using systemd

```bash
# Create service file
sudo nano /etc/systemd/system/databricks-mcp.service
```

```ini
[Unit]
Description=Databricks MCP Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/databricks
ExecStart=/usr/bin/python3 /path/to/databricks/server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl enable databricks-mcp
sudo systemctl start databricks-mcp
sudo systemctl status databricks-mcp
```

### Using Docker

```bash
docker build -t databricks-mcp .
docker run -d --name databricks-mcp databricks-mcp
```

### Using Process Manager (PM2)

```bash
npm install -g pm2
pm2 start server.py --interpreter python3 --name databricks-mcp
pm2 save
pm2 startup
```

## 🔄 Next Steps

1. ✅ Install dependencies
2. ✅ Run server
3. ⏭️ Test with FastMCP inspector
4. ⏭️ Register server in admin UI
5. ⏭️ Assign tools to agents
6. ⏭️ Test with real Databricks credentials
7. ⏭️ Deploy to production

## 📚 Additional Resources

- [FastMCP Documentation](https://github.com/jlowin/fastmcp)
- [Databricks SDK Documentation](https://databricks-sdk-py.readthedocs.io/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- Full README: `README.md`

## 💡 Pro Tips

1. **Use FastMCP Inspector** during development - it's amazing for testing
2. **Cache is automatic** - no need to manage connections manually
3. **Type hints matter** - FastMCP uses them for validation
4. **Credentials per-call** - always pass fresh credentials, don't store them
5. **Error handling** - FastMCP automatically wraps errors in MCP format
