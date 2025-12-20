# Microsoft 365 MCP Server

**Unified MCP Server for Microsoft 365 Services via Microsoft Graph API**

## 🎯 Overview

This MCP server provides comprehensive access to Microsoft 365 services through a unified Microsoft Graph API integration. Instead of separate servers for each Office application, this single server handles OneDrive, SharePoint, Excel, Outlook, Teams, and more through one authentication point.

## ✨ Features

### Currently Implemented

#### ✅ OneDrive (15 tools) - COMPLETE
- **File Management**: List, get, upload, download, delete files
- **Folder Operations**: Create, navigate folders
- **Search**: Search files across OneDrive
- **Sharing**: Share files, manage permissions
- **Advanced**: Copy, move, version management, thumbnails

#### 🚧 SharePoint (15 tools) - IN PROGRESS
- **Sites**: List sites, get site details
- **Document Libraries**: List libraries, manage files
- **Lists**: CRUD operations on SharePoint lists
- **Search**: Search content, manage permissions

#### 🚧 Excel (12 tools) - PENDING
- **Workbooks**: List, open Excel files
- **Worksheets**: Manage sheets
- **Data Operations**: Read/write cells and ranges
- **Tables**: Create and manage tables

#### 🚧 Outlook (15 tools) - PENDING
- **Email**: Send, read, search, manage emails
- **Calendar**: Create, update, manage events
- **Folders**: Organize emails

### Planned Features

- **Teams**: Channel messages, file operations
- **PowerPoint**: Presentation management
- **Word**: Document management
- **Planner**: Task management

## 📦 Installation

### Prerequisites

- Python 3.9+
- Azure AD tenant with appropriate permissions
- Registered Azure AD application

### Install Dependencies

```bash
cd copilotkit-pydantic/first-party-mcp-servers/microsoft365
pip install -r requirements.txt
```

### Dependencies

```
fastmcp>=0.3.0              # MCP framework
msgraph-sdk>=1.0.0          # Microsoft Graph SDK
azure-identity>=1.15.0      # Authentication
azure-core>=1.30.0          # Azure core libraries
cachetools>=5.3.0           # Client connection pooling
uvicorn[standard]>=0.27.0   # Web server
pydantic>=2.0.0             # Type safety
requests>=2.31.0            # HTTP client
python-dateutil>=2.8.2      # Date/time handling
```

## 🔐 Authentication Setup

### 1. Register Azure AD Application

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
   - Name: `Microsoft 365 MCP Server`
   - Supported account types: Choose based on your needs
   - Redirect URI: Leave blank for now
4. Click **Register**

### 2. Configure API Permissions

After registration, configure permissions:

1. Go to **API permissions** > **Add a permission**
2. Select **Microsoft Graph** > **Delegated permissions**
3. Add these permissions:

**OneDrive & SharePoint**:
- `Files.ReadWrite.All` - Read and write user files
- `Sites.ReadWrite.All` - Read and write SharePoint items

**Outlook (Email & Calendar)**:
- `Mail.ReadWrite` - Read and write user mail
- `Mail.Send` - Send mail as user
- `Calendars.ReadWrite` - Read and write user calendars

**Teams** (optional):
- `Team.ReadBasic.All` - Read basic team info
- `ChannelMessage.Send` - Send channel messages

**Planner** (optional):
- `Tasks.ReadWrite` - Read and write user tasks

4. Click **Grant admin consent** (requires admin)

### 3. Create Client Secret

1. Go to **Certificates & secrets** > **New client secret**
2. Description: `MCP Server Secret`
3. Expires: Choose duration (recommended: 12-24 months)
4. Click **Add**
5. **Copy the secret value immediately** (it won't be shown again)

### 4. Note Your Credentials

You'll need these three values:

```
Tenant ID:     Found on Overview page
Client ID:     Found on Overview page (Application ID)
Client Secret: The value you just copied
```

## 🚀 Usage

### Starting the Server

```bash
# Development mode
python server.py

# Production mode
uvicorn server:mcp.app --host 0.0.0.0 --port 8000
```

### Using OneDrive Tools

#### List Files in OneDrive

```python
from tools.onedrive import list_drive_items

response = list_drive_items(
    tenant_id="your-tenant-id",
    client_id="your-client-id",
    client_secret="your-client-secret",
    folder_path="root"  # or "/Documents"
)

for item in response.items:
    print(f"{item.name} ({item.item_type}) - {item.size} bytes")
```

#### Upload File to OneDrive

```python
from tools.onedrive import upload_file

with open("report.xlsx", "rb") as f:
    content = f.read()

response = upload_file(
    tenant_id="your-tenant-id",
    client_id="your-client-id",
    client_secret="your-client-secret",
    file_path="report.xlsx",
    file_content=content,
    parent_folder_path="/Documents"
)

print(f"Uploaded: {response.item.name} - {response.item.web_url}")
```

#### Search Files

```python
from tools.onedrive import search_files

response = search_files(
    tenant_id="your-tenant-id",
    client_id="your-client-id",
    client_secret="your-client-secret",
    query="budget"
)

print(f"Found {response.total} files:")
for item in response.items:
    print(f"- {item.name} ({item.item_type})")
```

#### Share a File

```python
from tools.onedrive import share_item

response = share_item(
    tenant_id="your-tenant-id",
    client_id="your-client-id",
    client_secret="your-client-secret",
    item_id="file-item-id",
    share_type="view",  # "view", "edit", or "embed"
    recipients=["user@company.com"]
)

print(f"Share link: {response.share_link}")
```

### Using SharePoint Tools

#### List SharePoint Sites

```python
from tools.sharepoint import list_sites

response = list_sites(
    tenant_id="your-tenant-id",
    client_id="your-client-id",
    client_secret="your-client-secret"
)

for site in response.sites:
    print(f"{site.name}: {site.web_url}")
```

#### Upload to SharePoint Library

```python
from tools.sharepoint import upload_file_to_library

with open("document.docx", "rb") as f:
    content = f.read()

response = upload_file_to_library(
    tenant_id="your-tenant-id",
    client_id="your-client-id",
    client_secret="your-client-secret",
    site_id="your-site-id",
    library_id="your-library-id",
    file_path="document.docx",
    file_content=content
)

print(f"Uploaded: {response.item.web_url}")
```

## 📚 Available Tools

### OneDrive Tools (15)

| Tool | Description |
|------|-------------|
| `list_drive_items` | List files/folders in a folder |
| `get_drive_item` | Get item details by ID or path |
| `upload_file` | Upload file to OneDrive |
| `download_file` | Download file from OneDrive |
| `create_folder` | Create a new folder |
| `delete_item` | Delete file or folder |
| `search_files` | Search files by query |
| `share_item` | Create sharing link |
| `get_item_permissions` | Get item permissions |
| `copy_item` | Copy file/folder |
| `move_item` | Move file/folder |
| `list_item_versions` | List file versions |
| `restore_version` | Restore previous version |
| `get_item_thumbnail` | Get file thumbnail |
| `get_item_preview_link` | Get preview link |

### SharePoint Tools (15)

| Tool | Description |
|------|-------------|
| `list_sites` | List SharePoint sites |
| `get_site` | Get site details |
| `list_document_libraries` | List document libraries |
| `list_files_in_library` | List files in library |
| `upload_file_to_library` | Upload to library |
| `download_file_from_library` | Download from library |
| `create_folder_in_library` | Create folder in library |
| `share_library_file` | Share library file |
| `list_sharepoint_lists` | List SharePoint lists |
| `get_list_items` | Get list items |
| `create_list_item` | Create list item |
| `update_list_item` | Update list item |
| `delete_list_item` | Delete list item |
| `search_sharepoint_content` | Search content |
| `get_file_permissions` | Get file permissions |

## 🏗️ Architecture

### Component Structure

```
microsoft365/
├── cache.py                      # GraphServiceClient connection pooling
├── models.py                     # Pydantic models (82 models)
├── requirements.txt              # Dependencies
├── server.py                     # FastMCP server (to be created)
├── tools/
│   ├── onedrive/
│   │   ├── files.py             # File operations (11 tools)
│   │   ├── versions.py          # Version management (2 tools)
│   │   ├── preview.py           # Preview/thumbnail (2 tools)
│   │   └── __init__.py
│   ├── sharepoint/
│   │   ├── sites.py             # Site & document operations (8 tools)
│   │   ├── lists.py             # List operations (5 tools)
│   │   ├── search.py            # Search & permissions (2 tools)
│   │   └── __init__.py
│   ├── excel/                    # To be implemented (12 tools)
│   └── outlook/                  # To be implemented (15 tools)
└── README.md                     # This file
```

### Connection Pooling

The server uses TTL-based caching for `GraphServiceClient` instances:
- **Cache Size**: 1000 clients
- **TTL**: 3600 seconds (1 hour)
- **Thread-Safe**: Uses locking mechanism
- **Key**: Hash of `tenant_id:client_id:client_secret`

### Error Handling

All tools follow consistent error handling:
- Proper exception raising with context
- Meaningful error messages
- Graph API error propagation

## ⚡ Performance

### Rate Limiting

Microsoft Graph API has rate limits:
- **Per app**: ~2000 requests per second per tenant
- **Per user**: ~150 requests per 5 minutes

**Recommendations**:
- Implement exponential backoff on 429 errors
- Use batch requests where possible
- Cache frequently accessed data

### Caching Strategy

Client connection pooling reduces authentication overhead:
- **First request**: ~1-2 seconds (authentication)
- **Cached requests**: ~100-300ms (direct API call)

## 🔒 Security Best Practices

### 1. Credential Management
- **Never hardcode credentials** in source code
- Use environment variables or secure vaults (Azure Key Vault)
- Rotate client secrets regularly (every 6-12 months)

### 2. Principle of Least Privilege
- Request only necessary permissions
- Use delegated permissions when possible
- Avoid `*.All` permissions unless required

### 3. Secure Storage
- Client secrets are sensitive - treat like passwords
- Use encrypted storage for credentials
- Implement secure credential injection

### 4. Audit & Monitoring
- Enable Azure AD audit logs
- Monitor API usage patterns
- Set up alerts for unusual activity

## 🐛 Troubleshooting

### Common Issues

#### 1. `Unauthorized (401)`

**Cause**: Invalid credentials or token

**Solutions**:
- Verify `tenant_id`, `client_id`, `client_secret`
- Ensure client secret hasn't expired
- Check permissions are granted and consented

#### 2. `Forbidden (403)`

**Cause**: Insufficient permissions

**Solutions**:
- Verify API permissions in Azure AD
- Ensure admin consent is granted
- Check user has access to the resource

#### 3. `Too Many Requests (429)`

**Cause**: Rate limit exceeded

**Solutions**:
- Implement exponential backoff
- Reduce request frequency
- Use batch operations

#### 4. `Resource Not Found (404)`

**Cause**: Invalid ID or path

**Solutions**:
- Verify item/site/library IDs are correct
- Check path format (no leading slash for root)
- Ensure resource exists and is accessible

### Debug Mode

Enable detailed logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## 📊 API Reference

### Authentication Parameters

All tools require these three parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `tenant_id` | str | Azure AD tenant ID |
| `client_id` | str | Application (client) ID |
| `client_secret` | str | Application client secret |

### Response Models

All tools return Pydantic models with:
- Type safety and validation
- Clear field descriptions
- Consistent structure
- Status messages

Example:
```python
class ListDriveItemsResponse(BaseModel):
    items: List[DriveItemInfo]
    total: int
```

## 🤝 Contributing

### Implementation Status

See `IMPLEMENTATION_STATUS.md` for current progress.

### Adding New Tools

Follow the established pattern:

1. **Add Pydantic model** in `models.py`
2. **Implement tool** in appropriate `tools/` subfolder
3. **Export** from `__init__.py`
4. **Register** in `server.py`
5. **Document** in README

### Code Standards

- Use type hints
- Follow docstring format
- Include usage examples
- Handle errors properly
- Write comprehensive tests

## 📝 License

This project follows the same license as the parent CopilotKit project.

## 🎉 Acknowledgments

- **Microsoft Graph API**: Unified Microsoft 365 API
- **msgraph-sdk-python**: Official Python SDK
- **FastMCP**: MCP server framework
- **Pydantic**: Data validation framework

## 📞 Support

For issues or questions:
1. Check `IMPLEMENTATION_STATUS.md` for progress
2. Review troubleshooting section
3. Check Microsoft Graph API documentation
4. Open an issue in the repository

---

**Status**: MVP in development - OneDrive complete, SharePoint in progress

**Next Steps**: Complete SharePoint, Excel, and Outlook tools, then create `server.py` registration.

