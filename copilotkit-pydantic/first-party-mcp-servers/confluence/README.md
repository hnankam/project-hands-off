# Confluence MCP Server

A powerful Model Context Protocol (MCP) server for Confluence that enables AI agents to interact with Confluence pages, spaces, comments, and search functionality programmatically.

## 🎯 Overview

This MCP server provides **27 production-ready tools** for comprehensive Confluence management:

- **Page Management** (13 tools) - Complete lifecycle management
- **Space Management** (6 tools) - Space CRUD operations  
- **Search & Content** (4 tools) - CQL search and content retrieval
- **Comments** (4 tools) - Comment management

## 📦 Features

### ✅ Complete Page Management
- Create, read, update, and delete pages
- Get pages by ID or title
- Manage page hierarchy (children, ancestors)
- Label management (add, remove, list)
- Attachment management (upload, download, delete)

### ✅ Space Management
- List, create, update, and delete spaces
- Get space details and content
- Filter by space type and status

### ✅ Search & Content
- Advanced CQL (Confluence Query Language) search
- Retrieve page content in multiple formats (storage, view)
- Access page version history
- Export pages to PDF

### ✅ Comments & Collaboration
- View, add, update, and delete comments
- Support for threaded comments (replies)
- Comment history tracking

### ✅ Technical Excellence
- **Type Safety**: All tools use Pydantic models
- **Authentication**: Token-based auth (API tokens for Cloud, PAT for Server/DC)
- **Connection Pooling**: TTL-based caching for performance
- **FastMCP Integration**: Automatic tool discovery and registration
- **Cloud & Server Support**: Works with both Confluence Cloud and Server/Data Center

---

## 🚀 Quick Start

### 1. Installation

```bash
cd confluence
pip install -r requirements.txt
```

### 2. Run the Server

```bash
# Start the MCP server
python server.py
```

### 3. Configure Authentication

#### Confluence Cloud
- **Username**: Your email address
- **API Token**: Generate from https://id.atlassian.com/manage/api-tokens
- **cloud**: Set to `True`

#### Confluence Server/Data Center
- **Username**: Leave empty (`""`)
- **PAT**: Generate Personal Access Token from your Confluence instance
- **cloud**: Set to `False`

---

## 📚 Tool Categories

### Page Management (13 tools)

#### CRUD Operations (7 tools)
```python
# Get page by ID
response = get_page(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    page_id="123456",
    username="user@example.com",
    expand="body.storage,version,space",
    cloud=True
)

# Get page by title
response = get_page_by_title(
    url="https://wiki.company.com",
    api_token="your_pat",
    space_key="DOCS",
    title="Getting Started",
    cloud=False
)

# Create new page
response = create_page(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    space_key="DOCS",
    title="New Documentation Page",
    body="<h1>Welcome</h1><p>Content here.</p>",
    username="user@example.com",
    parent_id="parent123",  # Optional: creates child page
    cloud=True
)

# Update page
response = update_page(
    url="https://wiki.company.com",
    api_token="your_pat",
    page_id="123456",
    title="Updated Title",
    body="<p>Updated content</p>",
    version_comment="Fixed typos",
    cloud=False
)

# Delete page
response = delete_page(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    page_id="123456",
    username="user@example.com",
    cloud=True
)

# Get child pages
response = get_page_children(
    url="https://wiki.company.com",
    api_token="your_pat",
    page_id="123456",
    limit=50,
    cloud=False
)

# Get page ancestors (breadcrumb)
response = get_page_ancestors(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    page_id="123456",
    username="user@example.com",
    cloud=True
)
```

#### Label Management (3 tools)
```python
# Get page labels
response = get_page_labels(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    page_id="123456",
    username="user@example.com",
    cloud=True
)

# Add label
response = add_page_label(
    url="https://wiki.company.com",
    api_token="your_pat",
    page_id="123456",
    label="documentation",
    cloud=False
)

# Remove label
response = remove_page_label(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    page_id="123456",
    label="draft",
    username="user@example.com",
    cloud=True
)
```

#### Attachment Management (3 tools)
```python
# Get page attachments
response = get_page_attachments(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    page_id="123456",
    username="user@example.com",
    limit=50,
    cloud=True
)

# Upload attachment
response = upload_attachment(
    url="https://wiki.company.com",
    api_token="your_pat",
    page_id="123456",
    filename="/path/to/diagram.png",
    comment="Architecture diagram v2",
    cloud=False
)

# Delete attachment
response = delete_attachment(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    page_id="123456",
    attachment_id="att123",
    username="user@example.com",
    cloud=True
)
```

---

### Space Management (6 tools)

```python
# List all spaces
response = list_spaces(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    username="user@example.com",
    space_type="global",  # or "personal"
    limit=50,
    cloud=True
)

# Get space details
response = get_space(
    url="https://wiki.company.com",
    api_token="your_pat",
    space_key="DOCS",
    expand="homepage,description",
    cloud=False
)

# Create space
response = create_space(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    space_key="DOCS",
    space_name="Documentation",
    username="user@example.com",
    description="Product documentation and guides",
    cloud=True
)

# Update space
response = update_space(
    url="https://wiki.company.com",
    api_token="your_pat",
    space_key="DOCS",
    name="Product Documentation",
    description="Updated description",
    cloud=False
)

# Delete space (USE WITH CAUTION!)
response = delete_space(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    space_key="OLD",
    username="user@example.com",
    cloud=True
)

# Get space content
response = get_space_content(
    url="https://wiki.company.com",
    api_token="your_pat",
    space_key="DOCS",
    depth="all",  # or "root"
    limit=100,
    cloud=False
)
```

---

### Search & Content (4 tools)

```python
# Search content using CQL
response = search_content(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    cql="type=page AND space=DOCS AND title~'API'",
    username="user@example.com",
    limit=50,
    cloud=True
)

# More CQL examples:
# - Recent updates: "type=page AND lastModified >= now('-7d')"
# - By label: "type=page AND label='documentation'"
# - By creator: "type=page AND creator=currentUser()"
# - Multiple conditions: "space=DOCS AND (label='api' OR label='reference')"

# Get page content
response = get_page_content(
    url="https://wiki.company.com",
    api_token="your_pat",
    page_id="123456",
    format="storage",  # or "view" for rendered HTML
    cloud=False
)

# Get page history
response = get_page_history(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    page_id="123456",
    username="user@example.com",
    limit=50,
    cloud=True
)

# Export page to PDF
response = export_page(
    url="https://wiki.company.com",
    api_token="your_pat",
    page_id="123456",
    format="pdf",
    cloud=False
)
```

---

### Comments (4 tools)

```python
# Get page comments
response = get_page_comments(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    page_id="123456",
    username="user@example.com",
    expand="body.view,version",
    limit=50,
    cloud=True
)

# Add comment
response = add_comment(
    url="https://wiki.company.com",
    api_token="your_pat",
    page_id="123456",
    comment_body="<p>Great documentation!</p>",
    cloud=False
)

# Reply to comment
response = add_comment(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    page_id="123456",
    comment_body="<p>Thanks for the feedback!</p>",
    username="user@example.com",
    parent_comment_id="comment123",
    cloud=True
)

# Update comment
response = update_comment(
    url="https://wiki.company.com",
    api_token="your_pat",
    comment_id="comment123",
    comment_body="<p>Updated comment text</p>",
    cloud=False
)

# Delete comment
response = delete_comment(
    url="https://yoursite.atlassian.net/wiki",
    api_token="your_api_token",
    comment_id="comment123",
    username="user@example.com",
    cloud=True
)
```

---

## 🔒 Authentication

### Confluence Cloud

1. Generate an API token:
   - Visit https://id.atlassian.com/manage/api-tokens
   - Click "Create API token"
   - Save the token securely

2. Use in tools:
```python
url = "https://yoursite.atlassian.net/wiki"
username = "your.email@example.com"
api_token = "your_api_token_here"
cloud = True
```

### Confluence Server/Data Center

1. Generate a Personal Access Token (PAT):
   - Go to your Confluence profile settings
   - Navigate to "Personal Access Tokens"
   - Create a new token with appropriate permissions

2. Use in tools:
```python
url = "https://wiki.company.com"
username = ""  # Empty for PAT authentication
api_token = "your_personal_access_token"
cloud = False
```

---

## 📊 Tool Summary

| Category | Tools | Description |
|----------|-------|-------------|
| **Page CRUD** | 7 | Get, create, update, delete, children, ancestors, get by title |
| **Page Labels** | 3 | Get, add, remove labels |
| **Page Attachments** | 3 | Get, upload, delete attachments |
| **Space Management** | 6 | List, get, create, update, delete, get content |
| **Search & Content** | 4 | CQL search, get content, history, export |
| **Comments** | 4 | Get, add, update, delete comments |
| **TOTAL** | **27** | Production-ready tools |

---

## 🎯 Use Cases

### 1. Documentation Management
- Create and organize documentation pages
- Manage page hierarchy and navigation
- Label pages for easy discovery
- Track changes with version history

### 2. Content Search & Discovery
- Search across all spaces using CQL
- Find pages by title, label, or content
- Filter by space, date, creator, or status
- Export search results

### 3. Collaboration & Review
- Add review comments to pages
- Respond to feedback with threaded replies
- Track comment history
- Manage discussion threads

### 4. Knowledge Base Automation
- Bulk create pages from templates
- Automated content updates
- Synchronized documentation
- Label-based organization

### 5. Attachment Management
- Upload diagrams and images
- Manage document versions
- Bulk attachment operations
- Attachment metadata tracking

---

## 🏗️ Architecture

```
confluence/
├── cache.py                    # Client connection pooling
├── models.py                   # Pydantic models
├── server.py                   # FastMCP server
├── requirements.txt            # Dependencies
└── tools/
    ├── pages/                  # Page management (13 tools)
    │   ├── crud.py            # CRUD operations
    │   ├── labels.py          # Label management
    │   ├── attachments.py     # Attachment management
    │   └── __init__.py
    ├── spaces/                 # Space management (6 tools)
    │   ├── spaces.py          # Space operations
    │   └── __init__.py
    ├── search/                 # Search & comments (8 tools)
    │   ├── search.py          # Search & content
    │   ├── comments.py        # Comment management
    │   └── __init__.py
    └── __init__.py
```

---

## 🔧 Technical Details

### Dependencies
- `fastmcp>=0.3.0` - MCP framework
- `atlassian-python-api>=3.41.0` - Confluence SDK
- `cachetools>=5.3.0` - Connection caching
- `uvicorn[standard]>=0.27.0` - Web server
- `pydantic>=2.0.0` - Type safety

### Connection Pooling
- TTL-based cache (1 hour default)
- Thread-safe implementation
- Keyed by (url, username, api_token, cloud)
- Maximum 1000 cached connections

### Pydantic Models
- 30+ type-safe models
- Complete input/output validation
- Clear documentation
- Consistent structure

---

## 📝 CQL (Confluence Query Language) Examples

### Basic Searches
```cql
# All pages in a space
type=page AND space=DOCS

# Pages with specific title
type=page AND title~"API"

# Pages with exact title
type=page AND title="Getting Started"
```

### Advanced Filters
```cql
# Recent updates (last 7 days)
type=page AND lastModified >= now('-7d')

# By creator
type=page AND creator=currentUser()
type=page AND creator="john.doe"

# By contributor
type=page AND contributor=currentUser()

# Multiple spaces
space IN (DOCS, ENG, PROD)
```

### Label-Based
```cql
# Single label
type=page AND label='documentation'

# Multiple labels (AND)
type=page AND label='api' AND label='reference'

# Multiple labels (OR)
type=page AND (label='api' OR label='reference')
```

### Complex Queries
```cql
# API documentation updated in last 30 days
type=page AND space=DOCS AND label='api' AND lastModified >= now('-30d')

# Pages created by team in specific space
type=page AND space=ENG AND creator IN ("alice", "bob", "charlie")

# Exclude archived
type=page AND space=DOCS AND status=current
```

---

## 🎓 Comparison with Jira MCP Server

| Aspect | Jira | Confluence | Status |
|--------|------|------------|--------|
| **Total Tools** | 75 | 27 | ✅ Complete |
| **Categories** | 14 | 4 | ✅ Complete |
| **Pydantic Models** | ~89 | ~30 | ✅ Complete |
| **Authentication** | Token-based | Token-based | ✅ Same |
| **Cloud Support** | ✅ | ✅ | ✅ Same |
| **Server/DC Support** | ✅ | ✅ | ✅ Same |
| **Type Safety** | Full | Full | ✅ Same |
| **Production Ready** | Yes | Yes | ✅ Same |

---

## ✅ Production Ready

- ✅ **27 tools** across 4 categories
- ✅ **~30 Pydantic models** for type safety
- ✅ **Connection pooling** for performance
- ✅ **FastMCP integration** with auto-discovery
- ✅ **Token authentication** (Cloud + Server/DC)
- ✅ **No linter errors**
- ✅ **Comprehensive documentation**
- ✅ **Clean folder structure**

---

## 🚀 Getting Started

1. **Install Dependencies**
```bash
cd confluence
pip install -r requirements.txt
```

2. **Configure Authentication**
- Cloud: Get API token from https://id.atlassian.com/manage/api-tokens
- Server/DC: Generate Personal Access Token in Confluence settings

3. **Run Server**
```bash
python server.py
```

4. **Start Using Tools**
- Use with AI agents via MCP
- Natural language Confluence management
- Automated documentation workflows

---

## 📚 Resources

- [Confluence REST API Documentation](https://developer.atlassian.com/cloud/confluence/rest/v1/)
- [Atlassian Python API Documentation](https://atlassian-python-api.readthedocs.io/confluence.html)
- [CQL (Confluence Query Language)](https://developer.atlassian.com/cloud/confluence/advanced-searching-using-cql/)
- [FastMCP Documentation](https://github.com/jlowin/fastmcp)

---

## 📄 License

This MCP server is part of the `project-hands-off` first-party MCP servers collection.

---

**Status:** ✅ **PRODUCTION READY**  
**Date:** December 19, 2025  
**Total Tools:** 27  
**Pydantic Models:** ~30  
**Lines of Code:** ~2,500

