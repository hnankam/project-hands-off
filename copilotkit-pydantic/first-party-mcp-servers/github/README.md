# GitHub MCP Server

A comprehensive Model Context Protocol (MCP) server for GitHub integration, providing **62 tools** for complete GitHub workflow automation.

## 🎯 Overview

This MCP server enables AI agents to interact with GitHub repositories, branches, commits, pull requests, issues, and files through a unified interface. Built with FastMCP and PyGithub, it provides enterprise-ready features including connection pooling, type safety with Pydantic models, and support for GitHub Enterprise.

## ✨ Features

- **🔐 Secure Authentication**: Token-based authentication (PAT or Fine-grained tokens)
- **⚡ Connection Pooling**: TTL-based caching for optimal performance
- **🏢 GitHub Enterprise Support**: Works with both GitHub.com and GitHub Enterprise
- **📊 Type Safety**: Comprehensive Pydantic models for all responses
- **🔍 Rich Search**: Search across repositories, issues, commits, and code
- **🤖 Agent-Friendly**: Designed for AI agent workflows and automation

## 📦 Installation

```bash
cd github
pip install -r requirements.txt
```

### Dependencies

- `fastmcp>=0.3.0` - MCP framework
- `PyGithub>=2.1.1` - GitHub SDK
- `cachetools>=5.3.0` - Connection caching
- `uvicorn[standard]>=0.27.0` - ASGI server
- `pydantic>=2.0.0` - Type safety

## 🚀 Quick Start

### Development Mode

```bash
fastmcp dev server.py
```

### Production Mode

```bash
fastmcp run server.py
```

## 🔑 Authentication

All tools require a GitHub Personal Access Token (PAT):

### Creating a PAT

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Click "Generate new token" (classic or fine-grained)
3. Select required scopes:
   - `repo` - Full repository access
   - `workflow` - GitHub Actions workflows
   - `admin:org` - Organization management (if needed)
   - `delete_repo` - Repository deletion (if needed)

### Token Usage

Tokens are passed per-request via the `token` parameter:

```python
response = github_list_repositories(
    token="ghp_yourPersonalAccessToken",
    user="octocat"
)
```

### GitHub Enterprise

For GitHub Enterprise, pass the `base_url` parameter:

```python
response = github_list_repositories(
    token="ghp_yourToken",
    base_url="https://github.mycompany.com/api/v3"
)
```

## 📚 Tool Categories

### 1. Repository Management (15 tools)

Comprehensive repository operations including CRUD, statistics, and management.

| Tool | Description |
|------|-------------|
| `github_list_repositories` | List repositories for user/org |
| `github_get_repository` | Get detailed repository info |
| `github_create_repository` | Create new repository |
| `github_delete_repository` | Delete repository (⚠️ irreversible) |
| `github_fork_repository` | Fork a repository |
| `github_get_repository_stats` | Get stats (stars, forks, issues) |
| `github_list_contributors` | List contributors |
| `github_list_languages` | List languages used |
| `github_list_topics` | List repository topics |
| `github_update_repository` | Update repository settings |
| `github_archive_repository` | Archive (read-only) |
| `github_unarchive_repository` | Unarchive |
| `github_get_clone_url` | Get clone URLs |
| `github_get_readme` | Get README content |

**Example:**

```python
# Create a new repository
response = github_create_repository(
    token="ghp_xxx",
    name="my-new-project",
    description="An awesome project",
    private=True,
    auto_init=True,
    gitignore_template="Python",
    license_template="mit"
)
print(f"Created: {response.repository.html_url}")
```

### 2. Branch Management (9 tools)

Complete branch lifecycle management with protection rules.

| Tool | Description |
|------|-------------|
| `github_list_branches` | List all branches |
| `github_get_branch` | Get branch details |
| `github_create_branch` | Create new branch |
| `github_delete_branch` | Delete branch |
| `github_protect_branch` | Add protection rules |
| `github_unprotect_branch` | Remove protection |
| `github_get_branch_protection` | Get protection settings |
| `github_compare_branches` | Compare two branches |
| `github_merge_branch` | Merge branches directly |

**Example:**

```python
# Create a feature branch
github_create_branch(
    token="ghp_xxx",
    repo="myuser/myrepo",
    branch_name="feature/new-feature",
    source_branch="main"
)

# Protect main branch
github_protect_branch(
    token="ghp_xxx",
    repo="myuser/myrepo",
    branch="main",
    require_reviews=2,
    require_code_owner_reviews=True,
    enforce_admins=True
)
```

### 3. Commit Operations (8 tools)

View commit history, diffs, status, and comments.

| Tool | Description |
|------|-------------|
| `github_list_commits` | List commits with filters |
| `github_get_commit` | Get commit details |
| `github_compare_commits` | Compare two commits |
| `github_get_commit_status` | Get CI/CD status |
| `github_create_commit_comment` | Add commit comment |
| `github_list_commit_comments` | List comments |
| `github_get_commit_diff` | Get file changes |
| `github_search_commits` | Search commits |

**Example:**

```python
# List recent commits by author
response = github_list_commits(
    token="ghp_xxx",
    repo="octocat/Hello-World",
    author="octocat",
    since="2024-01-01T00:00:00Z"
)

for commit in response.commits:
    print(f"{commit.sha[:7]}: {commit.message}")
```

### 4. Pull Request Management (12 tools)

Complete PR workflow including reviews, comments, and merging.

| Tool | Description |
|------|-------------|
| `github_list_pull_requests` | List PRs with filters |
| `github_get_pull_request` | Get PR details |
| `github_create_pull_request` | Create new PR |
| `github_update_pull_request` | Update PR |
| `github_close_pull_request` | Close PR |
| `github_merge_pull_request` | Merge PR |
| `github_list_pr_commits` | List PR commits |
| `github_list_pr_files` | List changed files |
| `github_add_pr_review` | Add review |
| `github_list_pr_reviews` | List reviews |
| `github_add_pr_comment` | Add comment |
| `github_list_pr_comments` | List comments |

**Example:**

```python
# Create a pull request
pr = github_create_pull_request(
    token="ghp_xxx",
    repo="myuser/myrepo",
    title="Add new feature",
    head="feature/new-feature",
    base="main",
    body="This PR adds a new feature that does XYZ"
)

# Add an approval review
github_add_pr_review(
    token="ghp_xxx",
    repo="myuser/myrepo",
    pr_number=pr.pull_request.number,
    body="Looks great! 🚀",
    event="APPROVE"
)

# Merge the PR
github_merge_pull_request(
    token="ghp_xxx",
    repo="myuser/myrepo",
    pr_number=pr.pull_request.number,
    merge_method="squash"
)
```

### 5. Issue Management (12 tools)

Full issue tracking with labels, assignments, and comments.

| Tool | Description |
|------|-------------|
| `github_list_issues` | List issues with filters |
| `github_get_issue` | Get issue details |
| `github_create_issue` | Create new issue |
| `github_update_issue` | Update issue |
| `github_close_issue` | Close issue |
| `github_add_issue_comment` | Add comment |
| `github_list_issue_comments` | List comments |
| `github_add_issue_labels` | Add labels |
| `github_remove_issue_label` | Remove label |
| `github_assign_issue` | Assign users |
| `github_unassign_issue` | Unassign user |
| `github_search_issues` | Search issues |

**Example:**

```python
# Create a bug report
issue = github_create_issue(
    token="ghp_xxx",
    repo="myuser/myrepo",
    title="Bug: App crashes on startup",
    body="Description of the bug...",
    labels=["bug", "high-priority"],
    assignees=["developer1"]
)

# Add a comment
github_add_issue_comment(
    token="ghp_xxx",
    repo="myuser/myrepo",
    issue_number=issue.issue.number,
    body="I'm investigating this issue"
)

# Close when fixed
github_close_issue(
    token="ghp_xxx",
    repo="myuser/myrepo",
    issue_number=issue.issue.number
)
```

### 6. File Operations (6 tools)

Read, write, and search files in repositories.

| Tool | Description |
|------|-------------|
| `github_get_file_content` | Get file content |
| `github_create_file` | Create new file |
| `github_update_file` | Update existing file |
| `github_delete_file` | Delete file |
| `github_get_directory_contents` | List directory |
| `github_search_code` | Search code |

**Example:**

```python
# Create a new file
github_create_file(
    token="ghp_xxx",
    repo="myuser/myrepo",
    path="src/new_module.py",
    content="def hello():\n    print('Hello, World!')\n",
    message="Add new module",
    branch="feature/new-feature"
)

# Get file content
file = github_get_file_content(
    token="ghp_xxx",
    repo="myuser/myrepo",
    path="src/new_module.py"
)
print(file.content)

# Update the file
github_update_file(
    token="ghp_xxx",
    repo="myuser/myrepo",
    path="src/new_module.py",
    content="def hello():\n    print('Updated!')\n",
    message="Update module",
    sha=file.sha
)

# Search for code
results = github_search_code(
    token="ghp_xxx",
    query="def hello",
    repo="myuser/myrepo"
)
```

## 🔍 Search Capabilities

### Search Issues

```python
# Search open bugs
github_search_issues(
    token="ghp_xxx",
    query="is:open label:bug",
    repo="myuser/myrepo"
)

# Search across all repos
github_search_issues(
    token="ghp_xxx",
    query="is:issue author:octocat"
)
```

### Search Commits

```python
# Search commits by message
github_search_commits(
    token="ghp_xxx",
    query="fix bug",
    repo="myuser/myrepo"
)

# Search by author
github_search_commits(
    token="ghp_xxx",
    query="author:octocat merge"
)
```

### Search Code

```python
# Search for function definitions
github_search_code(
    token="ghp_xxx",
    query="def main language:python",
    repo="myuser/myrepo"
)

# Search across all repos
github_search_code(
    token="ghp_xxx",
    query="addClass in:file language:javascript"
)
```

## 🏗️ Architecture

```
github/
├── __init__.py          # Package initialization
├── cache.py             # Connection pooling (TTL-based)
├── models.py            # Pydantic models (~30 models)
├── requirements.txt     # Python dependencies
├── server.py            # FastMCP server (62 tools)
├── tools/               # Tool implementations
│   ├── __init__.py
│   ├── repositories/    # 15 repository tools
│   ├── branches/        # 9 branch tools
│   ├── commits/         # 8 commit tools
│   ├── pull_requests/   # 12 PR tools
│   ├── issues/          # 12 issue tools
│   └── files/           # 6 file tools
└── README.md            # This file
```

## 🔧 Connection Pooling

The server uses TTL-based caching for GitHub clients:

- **Cache Size**: 1000 clients
- **TTL**: 3600 seconds (1 hour)
- **Thread-Safe**: Uses locking for concurrent access
- **Key**: Hash of `(token, base_url)`

```python
from cache import get_github_client, clear_cache, get_cache_info

# Get cached client (or create new)
client = get_github_client(token="ghp_xxx")

# Clear cache (testing/maintenance)
clear_cache()

# Get cache statistics
stats = get_cache_info()
```

## 📊 Pydantic Models

All responses use Pydantic models for type safety:

- `RepositoryInfo` - Repository details
- `BranchInfo` - Branch information
- `CommitInfo` - Commit details
- `PullRequestInfo` - PR information
- `IssueInfo` - Issue details
- `UserInfo` - User information
- And ~25 more response models

## 🎯 Use Cases

### 1. **Automated Code Review**
```python
# Get PR files and add review comments
files = github_list_pr_files(token, repo, pr_number)
for file in files['files']:
    if file['changes'] > 100:
        github_add_pr_comment(
            token, repo, pr_number,
            f"⚠️ {file['filename']} has {file['changes']} changes"
        )
```

### 2. **Issue Triage**
```python
# Auto-label issues based on content
issues = github_list_issues(token, repo, state="open")
for issue in issues.issues:
    if "bug" in issue.title.lower():
        github_add_issue_labels(token, repo, issue.number, ["bug"])
```

### 3. **Release Automation**
```python
# Create release branch and PR
github_create_branch(token, repo, "release/v1.0", "develop")
github_create_pull_request(
    token, repo,
    title="Release v1.0",
    head="release/v1.0",
    base="main"
)
```

### 4. **Code Migration**
```python
# Update files across multiple repos
for repo in repos:
    file = github_get_file_content(token, repo, "config.yaml")
    updated = file.content.replace("old_value", "new_value")
    github_update_file(token, repo, "config.yaml", updated, "Update config", file.sha)
```

## 🛡️ Security Best Practices

1. **Token Scope**: Use minimum required scopes
2. **Fine-Grained Tokens**: Prefer fine-grained tokens over classic PATs
3. **Token Rotation**: Rotate tokens regularly
4. **No Hardcoding**: Never hardcode tokens in source code
5. **Environment Variables**: Use env vars or secure vaults
6. **Audit Logs**: Monitor GitHub audit logs for suspicious activity

## 🐛 Troubleshooting

### Authentication Errors

```python
# Error: 401 Unauthorized
# Solution: Check token validity and scopes
```

### Rate Limiting

```python
# Error: 403 Rate limit exceeded
# Solution: Implement exponential backoff or use authenticated requests
```

### GitHub Enterprise

```python
# Error: 404 Not Found
# Solution: Verify base_url is correct (include /api/v3)
response = github_list_repositories(
    token="ghp_xxx",
    base_url="https://github.company.com/api/v3"  # ✅ Correct
)
```

## 📈 Performance

- **Connection Pooling**: Reuses clients for same token/base_url
- **Pagination**: All list operations support `per_page` parameter
- **Lazy Loading**: PyGithub uses lazy loading for API calls
- **Caching**: TTL-based cache reduces redundant API calls

## 🧪 Testing

```bash
# Run the server in dev mode
fastmcp dev server.py

# Test individual tools
python -c "
from tools.repositories import list_repositories
result = list_repositories('ghp_xxx', user='octocat')
print(result)
"
```

## 📝 Notes

- **Pull Requests vs Issues**: GitHub treats PRs as a special type of issue in the API
- **File Updates**: Always get current SHA before updating/deleting files
- **Branch Protection**: Some operations require admin privileges
- **Search Limits**: GitHub search API has rate limits and result caps

## 🚀 Roadmap

Future enhancements being considered:

- [ ] GitHub Actions workflows management
- [ ] Release management tools
- [ ] Organization management tools
- [ ] Webhook configuration
- [ ] GitHub Apps integration
- [ ] GraphQL API support

## 📖 API Documentation

- [PyGithub Documentation](https://pygithub.readthedocs.io/)
- [GitHub REST API](https://docs.github.com/en/rest)
- [FastMCP Documentation](https://github.com/jlowin/fastmcp)

## 🤝 Integration with CopilotKit

This MCP server is designed to be registered via the UI in the CopilotKit backend. It receives user credentials per-request from the frontend via copilot context, eliminating the need for backend credential storage.

## ✅ Summary

- **62 comprehensive tools** for complete GitHub workflow automation
- **Production-ready** with connection pooling and type safety
- **Flexible authentication** with PAT and fine-grained tokens
- **GitHub Enterprise support** for enterprise deployments
- **Agent-optimized** for AI-powered workflows
- **Well-documented** with examples for every tool category

---

**Ready to automate your GitHub workflows! 🚀**

