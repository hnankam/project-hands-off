"""GitHub Issue Management Operations.

This module provides tools for issue operations:
- List, get, create, update, close issues
- Issue comments, labels, and assignments
- Issue search
"""

from typing import Any, Optional, List, Dict
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_github_client
from models import (
    ListIssuesResponse,
    GetIssueResponse,
    CreateIssueResponse,
    UpdateIssueResponse,
    IssueInfo,
)


def list_issues(
    token: str,
    repo: str,
    state: str = "open",
    labels: Optional[List[str]] = None,
    assignee: Optional[str] = None,
    creator: Optional[str] = None,
    mentioned: Optional[str] = None,
    since: Optional[str] = None,
    sort: str = "created",
    direction: str = "desc",
    page: int = 0,
    per_page: int = 30,
    base_url: str = "https://api.github.com",
) -> ListIssuesResponse:
    """
    List repository issues.

    Lists issues in a repository with optional filters and pagination support.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        state: Issue state ("open", "closed", "all")
        labels: Filter by labels (optional)
        assignee: Filter by assignee username (optional)
        creator: Filter by creator username (optional)
        mentioned: Filter by mentioned username (optional)
        since: Only issues after this date (ISO 8601 format, optional)
        sort: Sort by ("created", "updated", "comments")
        direction: Sort direction ("asc" or "desc")
        page: Page number to retrieve (0-indexed, default: 0)
        per_page: Results per page (max 100, default: 30)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        ListIssuesResponse with issues and pagination metadata

    Example:
        # List open issues
        response = list_issues(
            token="ghp_xxx",
            repo="octocat/Hello-World"
        )
        for issue in response.issues:
            print(f"#{issue.number}: {issue.title}")
        
        # Get next page
        if response.has_next_page:
            response = list_issues(token="ghp_xxx", repo="octocat/Hello-World", page=1)

        # List closed bugs
        response = list_issues(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            state="closed",
            labels=["bug"]
        )
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    # Build query parameters
    kwargs = {
        "state": state,
        "sort": sort,
        "direction": direction,
    }
    if labels:
        kwargs['labels'] = labels
    if assignee:
        kwargs['assignee'] = assignee
    if creator:
        kwargs['creator'] = creator
    if mentioned:
        kwargs['mentioned'] = mentioned
    if since:
        kwargs['since'] = since
    
    # Get paginated issues
    issues_paginated = repo_obj.get_issues(**kwargs)
    issues_page = issues_paginated.get_page(page)
    
    issues_list = []
    for issue in issues_page:
        # Skip pull requests (GitHub API returns PRs as issues)
        if issue.pull_request:
            continue
            
        issues_list.append(IssueInfo(
            id=issue.id,
            number=issue.number,
            title=issue.title,
            body=issue.body,
            state=issue.state,
            user={"login": issue.user.login, "id": issue.user.id} if issue.user else None,
            assignees=[{"login": a.login, "id": a.id} for a in issue.assignees] if issue.assignees else [],
            labels=[{"name": label.name, "color": label.color} for label in issue.labels] if issue.labels else [],
            created_at=issue.created_at.isoformat() if issue.created_at else "",
            updated_at=issue.updated_at.isoformat() if issue.updated_at else "",
            closed_at=issue.closed_at.isoformat() if issue.closed_at else None,
            html_url=issue.html_url,
        ))
    
    total_count = issues_paginated.totalCount
    has_next = (page + 1) * per_page < total_count
    
    return ListIssuesResponse(
        repo_name=repo,
        issues=issues_list,
        total=total_count,
        page=page,
        per_page=per_page,
        has_next_page=has_next
    )


def get_issue(
    token: str,
    repo: str,
    issue_number: int,
    base_url: str = "https://api.github.com",
) -> GetIssueResponse:
    """
    Get issue details.

    Retrieves detailed information about a specific issue.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        GetIssueResponse with issue details

    Example:
        response = get_issue(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            issue_number=42
        )
        print(f"Title: {response.issue['title']}")
        print(f"State: {response.issue['state']}")
        print(f"Comments: {response.issue['comments']}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    issue = repo_obj.get_issue(issue_number)
    
    issue_data = {
        "id": issue.id,
        "number": issue.number,
        "title": issue.title,
        "body": issue.body,
        "state": issue.state,
        "user": {
            "login": issue.user.login,
            "id": issue.user.id,
            "avatar_url": issue.user.avatar_url
        } if issue.user else None,
        "assignees": [
            {"login": a.login, "id": a.id, "avatar_url": a.avatar_url}
            for a in issue.assignees
        ] if issue.assignees else [],
        "labels": [
            {"name": label.name, "color": label.color, "description": label.description}
            for label in issue.labels
        ] if issue.labels else [],
        "milestone": {
            "title": issue.milestone.title,
            "number": issue.milestone.number,
            "state": issue.milestone.state,
        } if issue.milestone else None,
        "comments": issue.comments,
        "created_at": issue.created_at.isoformat() if issue.created_at else None,
        "updated_at": issue.updated_at.isoformat() if issue.updated_at else None,
        "closed_at": issue.closed_at.isoformat() if issue.closed_at else None,
        "closed_by": {"login": issue.closed_by.login} if issue.closed_by else None,
        "html_url": issue.html_url,
    }
    
    return GetIssueResponse(
        repo_name=repo,
        issue=issue_data
    )


def create_issue(
    token: str,
    repo: str,
    title: str,
    body: Optional[str] = None,
    assignees: Optional[List[str]] = None,
    labels: Optional[List[str]] = None,
    milestone: Optional[int] = None,
    base_url: str = "https://api.github.com",
) -> CreateIssueResponse:
    """
    Create an issue.

    Creates a new issue in a repository.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        title: Issue title
        body: Issue description (optional)
        assignees: List of usernames to assign (optional)
        labels: List of label names (optional)
        milestone: Milestone number (optional)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        CreateIssueResponse with created issue

    Example:
        response = create_issue(
            token="ghp_xxx",
            repo="myuser/myrepo",
            title="Bug: Application crashes on startup",
            body="Description of the bug...",
            labels=["bug", "high-priority"],
            assignees=["username"]
        )
        print(f"Created issue #{response.issue.number}: {response.issue.html_url}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    
    # Build issue parameters
    kwargs = {
        "title": title,
        "body": body or "",
    }
    if assignees:
        kwargs['assignees'] = assignees
    if labels:
        kwargs['labels'] = labels
    if milestone:
        kwargs['milestone'] = repo_obj.get_milestone(milestone)
    
    issue = repo_obj.create_issue(**kwargs)
    
    issue_info = IssueInfo(
        id=issue.id,
        number=issue.number,
        title=issue.title,
        body=issue.body,
        state=issue.state,
        user={"login": issue.user.login, "id": issue.user.id} if issue.user else None,
        assignees=[{"login": a.login, "id": a.id} for a in issue.assignees] if issue.assignees else [],
        labels=[{"name": label.name, "color": label.color} for label in issue.labels] if issue.labels else [],
        created_at=issue.created_at.isoformat() if issue.created_at else "",
        updated_at=issue.updated_at.isoformat() if issue.updated_at else "",
        closed_at=issue.closed_at.isoformat() if issue.closed_at else None,
        html_url=issue.html_url,
    )
    
    return CreateIssueResponse(
        issue=issue_info,
        message=f"Successfully created issue #{issue.number}"
    )


def update_issue(
    token: str,
    repo: str,
    issue_number: int,
    title: Optional[str] = None,
    body: Optional[str] = None,
    state: Optional[str] = None,
    labels: Optional[List[str]] = None,
    assignees: Optional[List[str]] = None,
    milestone: Optional[int] = None,
    base_url: str = "https://api.github.com",
) -> UpdateIssueResponse:
    """
    Update an issue.

    Updates an existing issue.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        title: New title (optional)
        body: New description (optional)
        state: New state ("open" or "closed", optional)
        labels: New labels list (optional, replaces existing)
        assignees: New assignees list (optional, replaces existing)
        milestone: Milestone number (optional)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        UpdateIssueResponse with confirmation

    Example:
        response = update_issue(
            token="ghp_xxx",
            repo="myuser/myrepo",
            issue_number=42,
            title="Updated title",
            labels=["bug", "in-progress"]
        )
        print(response.message)
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    issue = repo_obj.get_issue(issue_number)
    
    # Build update dict
    updates = {}
    if title is not None:
        updates['title'] = title
    if body is not None:
        updates['body'] = body
    if state is not None:
        updates['state'] = state
    if labels is not None:
        updates['labels'] = labels
    if assignees is not None:
        updates['assignees'] = assignees
    if milestone is not None:
        updates['milestone'] = repo_obj.get_milestone(milestone)
    
    issue.edit(**updates)
    
    return UpdateIssueResponse(
        repo_name=repo,
        issue_number=issue_number,
        message=f"Successfully updated issue #{issue_number}"
    )


def close_issue(
    token: str,
    repo: str,
    issue_number: int,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Close an issue.

    Closes an issue.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with confirmation

    Example:
        response = close_issue(
            token="ghp_xxx",
            repo="myuser/myrepo",
            issue_number=42
        )
        print(response['message'])
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    issue = repo_obj.get_issue(issue_number)
    
    issue.edit(state="closed")
    
    return {
        "repo": repo,
        "issue_number": issue_number,
        "state": "closed",
        "message": f"Successfully closed issue #{issue_number}"
    }


def add_issue_comment(
    token: str,
    repo: str,
    issue_number: int,
    body: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Add an issue comment.

    Adds a comment to an issue.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        body: Comment text
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with created comment

    Example:
        response = add_issue_comment(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            issue_number=42,
            body="Thanks for reporting this!"
        )
        print(f"Comment added: {response['id']}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    issue = repo_obj.get_issue(issue_number)
    
    comment = issue.create_comment(body)
    
    return {
        "repo": repo,
        "issue_number": issue_number,
        "id": comment.id,
        "body": comment.body,
        "user": comment.user.login if comment.user else None,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "html_url": comment.html_url,
    }


def list_issue_comments(
    token: str,
    repo: str,
    issue_number: int,
    per_page: int = 30,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    List issue comments.

    Lists all comments on an issue.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        per_page: Results per page (max 100)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with comments list

    Example:
        response = list_issue_comments(
            token="ghp_xxx",
            repo="octocat/Hello-World",
            issue_number=42
        )
        for comment in response['comments']:
            print(f"{comment['user']}: {comment['body']}")
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    issue = repo_obj.get_issue(issue_number)
    
    comments = []
    for comment in issue.get_comments()[:per_page]:
        comments.append({
            "id": comment.id,
            "body": comment.body,
            "user": comment.user.login if comment.user else None,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
            "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
            "html_url": comment.html_url,
        })
    
    return {
        "repo": repo,
        "issue_number": issue_number,
        "comments": comments,
        "total": len(comments)
    }


def add_issue_labels(
    token: str,
    repo: str,
    issue_number: int,
    labels: List[str],
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Add labels to an issue.

    Adds one or more labels to an issue.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        labels: List of label names to add
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with confirmation

    Example:
        response = add_issue_labels(
            token="ghp_xxx",
            repo="myuser/myrepo",
            issue_number=42,
            labels=["bug", "urgent"]
        )
        print(response['message'])
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    issue = repo_obj.get_issue(issue_number)
    
    issue.add_to_labels(*labels)
    
    return {
        "repo": repo,
        "issue_number": issue_number,
        "labels_added": labels,
        "message": f"Successfully added {len(labels)} label(s) to issue #{issue_number}"
    }


def remove_issue_label(
    token: str,
    repo: str,
    issue_number: int,
    label: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Remove a label from an issue.

    Removes a label from an issue.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        label: Label name to remove
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with confirmation

    Example:
        response = remove_issue_label(
            token="ghp_xxx",
            repo="myuser/myrepo",
            issue_number=42,
            label="bug"
        )
        print(response['message'])
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    issue = repo_obj.get_issue(issue_number)
    
    issue.remove_from_labels(label)
    
    return {
        "repo": repo,
        "issue_number": issue_number,
        "label_removed": label,
        "message": f"Successfully removed label '{label}' from issue #{issue_number}"
    }


def assign_issue(
    token: str,
    repo: str,
    issue_number: int,
    assignees: List[str],
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Assign users to an issue.

    Assigns one or more users to an issue.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        assignees: List of usernames to assign
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with confirmation

    Example:
        response = assign_issue(
            token="ghp_xxx",
            repo="myuser/myrepo",
            issue_number=42,
            assignees=["user1", "user2"]
        )
        print(response['message'])
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    issue = repo_obj.get_issue(issue_number)
    
    # Add assignees
    issue.edit(assignees=assignees)
    
    return {
        "repo": repo,
        "issue_number": issue_number,
        "assignees_added": assignees,
        "message": f"Successfully assigned {len(assignees)} user(s) to issue #{issue_number}"
    }


def unassign_issue(
    token: str,
    repo: str,
    issue_number: int,
    assignee: str,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Unassign a user from an issue.

    Removes a user assignment from an issue.

    Args:
        token: GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        assignee: Username to unassign
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with confirmation

    Example:
        response = unassign_issue(
            token="ghp_xxx",
            repo="myuser/myrepo",
            issue_number=42,
            assignee="user1"
        )
        print(response['message'])
    """
    client = get_github_client(token, base_url)
    repo_obj = client.get_repo(repo)
    issue = repo_obj.get_issue(issue_number)
    
    # Get current assignees and remove the specified one
    current_assignees = [a.login for a in issue.assignees if a.login != assignee]
    issue.edit(assignees=current_assignees)
    
    return {
        "repo": repo,
        "issue_number": issue_number,
        "assignee_removed": assignee,
        "message": f"Successfully unassigned '{assignee}' from issue #{issue_number}"
    }


def search_issues(
    token: str,
    query: str,
    repo: Optional[str] = None,
    sort: str = "created",
    order: str = "desc",
    per_page: int = 30,
    base_url: str = "https://api.github.com",
) -> Dict[str, Any]:
    """
    Search issues.

    Searches for issues across repositories or within a specific repository.

    Args:
        token: GitHub Personal Access Token
        query: Search query (e.g., "bug", "is:open label:bug")
        repo: Repository name in format "owner/repo" (optional, searches all if omitted)
        sort: Sort by ("created", "updated", "comments")
        order: Sort order ("asc" or "desc")
        per_page: Results per page (max 100)
        base_url: GitHub API base URL (for GitHub Enterprise)

    Returns:
        Dictionary with search results

    Example:
        # Search issues in all repositories
        response = search_issues(
            token="ghp_xxx",
            query="is:open label:bug"
        )

        # Search issues in specific repository
        response = search_issues(
            token="ghp_xxx",
            query="is:closed",
            repo="octocat/Hello-World"
        )
    """
    client = get_github_client(token, base_url)
    
    # Add repo to query if specified
    full_query = query
    if repo:
        full_query = f"{query} repo:{repo}"
    
    # Add is:issue to exclude PRs
    if "is:issue" not in full_query and "is:pr" not in full_query:
        full_query = f"{full_query} is:issue"
    
    issues = client.search_issues(query=full_query, sort=sort, order=order)
    
    issues_list = []
    for issue in list(issues)[:per_page]:
        issues_list.append({
            "number": issue.number,
            "title": issue.title,
            "body": issue.body,
            "state": issue.state,
            "user": issue.user.login if issue.user else None,
            "labels": [label.name for label in issue.labels] if issue.labels else [],
            "repository": issue.repository.full_name if issue.repository else None,
            "created_at": issue.created_at.isoformat() if issue.created_at else None,
            "html_url": issue.html_url,
        })
    
    return {
        "query": query,
        "repo": repo,
        "issues": issues_list,
        "total": len(issues_list)
    }

