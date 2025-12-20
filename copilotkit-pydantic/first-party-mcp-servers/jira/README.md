# Jira MCP Server

A **Model Context Protocol (MCP)** server for Jira that enables AI agents to interact with Jira programmatically. Built with **FastMCP** and the **Atlassian Python API**.

## Features

### ✅ Current Capabilities (Phase 1 - MVP)

**Issue Management (5 tools)**
- ✅ `create_issue` - Create new issues
- ✅ `get_issue` - Get issue details
- ✅ `update_issue` - Update issue fields
- ✅ `delete_issue` - Delete issues
- ✅ `search_issues` - Search using JQL (Jira Query Language)

### 🚀 Planned Capabilities

**Issue Operations (Coming Soon)**
- Issue transitions (workflow automation)
- Comments (add, edit, delete)
- Attachments (upload, download)
- Issue links

**Project Management (Coming Soon)**
- List, get, create projects
- Manage components and versions
- Project permissions

**Agile/Scrum (Coming Soon)**
- Board management
- Sprint operations
- Backlog management

**Search & Filters (Coming Soon)**
- Saved filters
- Advanced JQL queries

## Installation

### Prerequisites

- Python 3.11 or higher
- Jira Cloud or Server/Data Center instance
- Jira API token

### Setup

1. **Install dependencies:**
   ```bash
   cd jira
   pip install -r requirements.txt
   ```

2. **Get your Jira API token:**
   - Jira Cloud: https://id.atlassian.com/manage-profile/security/api-tokens
   - Jira Server/Data Center: Use username and password

3. **Configure credentials:**
   
   Credentials are passed per-request via the AI agent. No configuration file needed.

## Usage

### Running the Server

```bash
# Development mode
fastmcp dev server.py

# Production mode
python server.py
```

### Using with AI Agents

The server exposes tools that AI agents can call. Credentials are provided per-request.

#### Create an Issue

```python
# Jira Cloud (with API token)
create_issue(
    url="https://yoursite.atlassian.net",
    username="user@example.com",  # Email required
    api_token="your_api_token",   # API token (not password!)
    project_key="PROJ",
    summary="Login button not working",
    issue_type="Bug",
    description="Users cannot click the login button on mobile",
    priority="High",
    labels=["frontend", "mobile"],
    cloud=True
)

# Jira Server/Data Center (with PAT)
create_issue(
    url="https://jira.company.com",
    username="",  # Empty for Server/Data Center
    api_token="your_personal_access_token",  # PAT (not password!)
    project_key="PROJ",
    summary="Login button not working",
    issue_type="Bug",
    cloud=False  # Default
)
```

#### Search for Issues

```python
# Find all open bugs (Jira Cloud with API token)
search_issues(
    url="https://yoursite.atlassian.net",
    username="user@example.com",  # Email required
    api_token="your_api_token",
    jql="project = PROJ AND status = Open AND type = Bug",
    cloud=True
)

# Find my assigned issues (Jira Server/Data Center with PAT)
search_issues(
    url="https://jira.company.com",
    username="",  # Empty for Server/Data Center
    api_token="your_personal_access_token",
    jql="assignee = currentUser() AND status != Done",
    cloud=False  # Default
)

# Find recent high-priority issues (Jira Cloud)
search_issues(
    url="https://yoursite.atlassian.net",
    username="user@example.com",
    api_token="your_api_token",
    jql="created >= -7d AND priority = High",
    cloud=True
)
```

#### Get Issue Details

```python
# Jira Cloud (with API token)
get_issue(
    url="https://yoursite.atlassian.net",
    username="user@example.com",
    api_token="your_api_token",
    issue_key="PROJ-123",
    cloud=True
)

# Jira Server/Data Center (with PAT)
get_issue(
    url="https://jira.company.com",
    username="",  # Empty for Server/Data Center
    api_token="your_personal_access_token",
    issue_key="PROJ-123",
    cloud=False  # Default
)
```

#### Update an Issue

```python
# Jira Cloud (with API token)
update_issue(
    url="https://yoursite.atlassian.net",
    username="user@example.com",
    api_token="your_api_token",
    issue_key="PROJ-123",
    summary="Updated: Login button not working",
    priority="Critical",
    cloud=True
)

# Jira Server/Data Center (with PAT)
update_issue(
    url="https://jira.company.com",
    username="",  # Empty for Server/Data Center
    api_token="your_personal_access_token",
    issue_key="PROJ-123",
    priority="Critical",
    cloud=False  # Default
)
```

## JQL (Jira Query Language) Examples

JQL is a powerful query language for searching issues in Jira:

```jql
# Basic searches
project = PROJ
status = "In Progress"
assignee = currentUser()

# Combining conditions
project = PROJ AND status = Open AND type = Bug
assignee = currentUser() AND status != Done

# Date searches
created >= -7d
updated >= startOfWeek()
duedate < now()

# Text searches
summary ~ "login"
description ~ "error"

# Priority and component searches
priority in (High, Critical)
component = "Frontend"

# Advanced queries
project = PROJ AND (priority = High OR priority = Critical) AND assignee is EMPTY
created >= -30d AND status changed to Done AND type in (Bug, Story)
```

## Natural Language Examples

With an AI agent, users can interact with Jira using natural language:

**Creating Issues:**
- "Create a bug ticket for the login timeout issue"
- "Make a task to update the API documentation"
- "Create a high-priority story for the new payment feature"

**Searching Issues:**
- "What tickets are assigned to me?"
- "Show all open bugs in the PROJ project"
- "Find all critical issues created this week"
- "What's blocking the current sprint?"

**Updating Issues:**
- "Update PROJ-123 to set priority to high"
- "Assign PROJ-456 to jane.smith@example.com"
- "Change the summary of PROJ-789 to include 'urgent'"

**Getting Information:**
- "Tell me about issue PROJ-123"
- "What's the status of PROJ-456?"
- "Who is assigned to PROJ-789?"

## Architecture

```
jira/
├── server.py               # FastMCP server entry point
├── cache.py                # Jira client connection pooling
├── models.py               # Pydantic models for type safety
├── requirements.txt        # Python dependencies
├── README.md              # This file
└── tools/                 # Tool implementations
    ├── __init__.py
    ├── issues/            # Issue management
    │   ├── __init__.py
    │   └── crud.py        # Create, read, update, delete, search
    ├── projects/          # Project management (coming soon)
    ├── search/            # Advanced search (coming soon)
    └── boards/            # Agile boards (coming soon)
```

## Key Features

### 🔒 Security
- **No stored credentials**: Credentials provided per-request
- **Client caching**: Secure TTL-based connection pooling
- **API token authentication**: Secure authentication method

### ⚡ Performance
- **Connection pooling**: Reuses Jira client connections (1-hour TTL)
- **Efficient caching**: Hash-based client cache
- **Fast responses**: Optimized API calls

### 🛡️ Type Safety
- **Pydantic models**: Full type validation for all operations
- **IDE support**: Excellent autocomplete and type checking
- **Error handling**: Comprehensive error messages

### 📊 MCP Integration
- **FastMCP framework**: Built-in MCP protocol support
- **Tool discovery**: Automatic tool registration
- **Streaming support**: Efficient data transfer

## Configuration

### 🔐 Token-Only Authentication (Secure)

**IMPORTANT:** This server **only supports token-based authentication** for enhanced security. Passwords are **not supported**.

### Understanding the `cloud` Parameter

The `cloud` parameter determines which type of token authentication to use:

- **`cloud=True`**: Jira Cloud - Uses API token with email (Basic Auth)
- **`cloud=False`**: Jira Server/Data Center - Uses Personal Access Token/PAT (token-only authentication)

---

### Jira Cloud Configuration

```python
url = "https://yoursite.atlassian.net"
username = "user@example.com"  # Your Atlassian account email
api_token = "your_api_token"   # API token (NOT password!)
cloud = True  # REQUIRED for Cloud instances
```

**How to get an API token:**  
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a label and copy the token
4. Use this token (not your password!)

---

### Jira Server/Data Center Configuration

```python
url = "https://jira.yourcompany.com"
username = ""  # Empty string for Server/Data Center
api_token = "your_personal_access_token"  # PAT (NOT password!)
cloud = False  # Default - for Server/Data Center
```

**How to get a Personal Access Token (PAT):**  
1. Log in to your Jira instance
2. Click your profile icon → **Profile**
3. Navigate to **Personal Access Tokens**
4. Click **Create token**
5. Give it a name, set expiration, and copy the token
6. Use this PAT (not your password!)

**Minimum Version:** Jira Server/Data Center 8.14+

---

### Quick Reference

| Aspect | Jira Cloud | Jira Server/Data Center |
|--------|-----------|-------------------------|
| **URL Pattern** | `https://yoursite.atlassian.net` | `https://jira.company.com` |
| **Username** | Email address | Empty string `""` |
| **Credentials** | API token | Personal Access Token (PAT) |
| **cloud Parameter** | `True` | `False` (default) |
| **Authentication** | Basic Auth (email + API token) | Token-based (PAT only) |
| **Password Support** | ❌ No | ❌ No |
| **Token Support** | ✅ Yes | ✅ Yes |

---

### Why Token-Only?

**Security Benefits:**
- ✅ **Revocable**: Tokens can be revoked without changing passwords
- ✅ **Scoped**: Tokens can have limited permissions
- ✅ **Auditable**: Token usage is logged
- ✅ **Expirable**: Tokens can have expiration dates
- ✅ **Independent**: Revoking a token doesn't affect other integrations
- ✅ **Best Practice**: Industry standard for API authentication

## Troubleshooting

### Authentication Errors

**Issue:** "401 Unauthorized"
- **Jira Cloud:** Verify API token is correct
- **Jira Server:** Check username and password

**Issue:** "403 Forbidden"
- Check user has required permissions in Jira
- Verify project access permissions

### Connection Errors

**Issue:** "Connection timeout"
- Verify Jira URL is correct
- Check network connectivity
- Verify firewall allows outbound connections

### JQL Syntax Errors

**Issue:** "Invalid JQL query"
- Verify JQL syntax using Jira's built-in query validator
- Check field names match your Jira instance
- Ensure custom fields use correct format: `cf[10001]`

## Development

### Adding New Tools

1. Create tool function in appropriate module
2. Add Pydantic models to `models.py`
3. Export from `tools/__init__.py`
4. Register in `server.py`

Example:
```python
# tools/issues/comments.py
def add_comment(url, username, api_token, issue_key, comment_text):
    client = get_jira_client(url, username, api_token)
    result = client.issue_add_comment(issue_key, comment_text)
    return AddCommentResponse(...)
```

### Testing

```bash
# Test imports
python -c "import server; print('✅ Server imports successfully')"

# Test client connection
python -c "from cache import get_jira_client; client = get_jira_client('https://yoursite.atlassian.net', 'user@example.com', 'token'); print('✅ Client created')"
```

## Roadmap

### Phase 1: MVP (Current - Week 1)
- ✅ Core infrastructure (FastMCP, caching, models)
- ✅ Issue CRUD operations
- ✅ JQL search

### Phase 2: Essential Features (Week 2)
- ⏳ Issue transitions (workflow automation)
- ⏳ Comments (add, edit, delete)
- ⏳ Attachments (upload, download)
- ⏳ Project management (list, get, create)

### Phase 3: Advanced Features (Week 3)
- ⏳ Board management (Agile/Scrum)
- ⏳ Sprint operations
- ⏳ Custom fields handling
- ⏳ Saved filters
- ⏳ Comprehensive testing

### Future Enhancements
- Webhooks management
- Automation rules
- Advanced reporting
- Bulk operations
- Custom field schemas

## Resources

- **Jira REST API:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/
- **Atlassian Python API:** https://atlassian-python-api.readthedocs.io/
- **FastMCP:** https://github.com/jlowin/fastmcp
- **JQL Guide:** https://support.atlassian.com/jira-software-cloud/docs/use-advanced-search-with-jira-query-language-jql/

## License

This server is part of the CopilotKit first-party MCP servers project.

## Support

For issues, questions, or contributions, please refer to the main project repository.

