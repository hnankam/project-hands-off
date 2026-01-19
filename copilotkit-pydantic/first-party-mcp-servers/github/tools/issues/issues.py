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
    token_credential_key: str,
    repo: str,
    base_url_credential_key: str = "",
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
) -> ListIssuesResponse:
    """
    List issues in a repository with optional filters and pagination support.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
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

    Returns:
        ListIssuesResponse with issues and pagination metadata
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return ListIssuesResponse(
            repo_name=repo,
            issues=[],
            total=0,
            page=page,
            per_page=per_page,
            has_next_page=False,
            error_message=f"Failed to list issues: {str(e)}",
        )


def get_issue(
    token_credential_key: str,
    repo: str,
    issue_number: int,
    base_url_credential_key: str = "",
) -> GetIssueResponse:
    """
    Get detailed information about a specific issue.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        GetIssueResponse with issue details (title, body, state, labels, assignees, etc.)
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return GetIssueResponse(
            repo_name=repo,
            issue=None,
            error_message=f"Failed to get issue #{issue_number}: {str(e)}",
        )


def create_issue(
    token_credential_key: str,
    repo: str,
    title: str,
    base_url_credential_key: str = "",
    body: Optional[str] = None,
    assignees: Optional[List[str]] = None,
    labels: Optional[List[str]] = None,
    milestone: Optional[int] = None,
) -> CreateIssueResponse:
    """
    Create a new issue in a repository.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        title: Issue title
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        body: Issue description (optional)
        assignees: List of usernames to assign (optional)
        labels: List of label names (optional)
        milestone: Milestone number (optional)

    Returns:
        CreateIssueResponse with created issue details
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return CreateIssueResponse(
            issue=None,
            message=None,
            error_message=f"Failed to create issue: {str(e)}",
        )


def update_issue(
    token_credential_key: str,
    repo: str,
    issue_number: int,
    base_url_credential_key: str = "",
    title: Optional[str] = None,
    body: Optional[str] = None,
    state: Optional[str] = None,
    labels: Optional[List[str]] = None,
    assignees: Optional[List[str]] = None,
    milestone: Optional[int] = None,
) -> UpdateIssueResponse:
    """
    Update an existing issue.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        title: New title (optional)
        body: New description (optional)
        state: New state ("open" or "closed", optional)
        labels: New labels list (optional, replaces existing)
        assignees: New assignees list (optional, replaces existing)
        milestone: Milestone number (optional)

    Returns:
        UpdateIssueResponse with confirmation message
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return UpdateIssueResponse(
            repo_name=repo,
            issue_number=issue_number,
            message=None,
            error_message=f"Failed to update issue #{issue_number}: {str(e)}",
        )


def close_issue(
    token_credential_key: str,
    repo: str,
    issue_number: int,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Close an issue.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with confirmation message
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        issue = repo_obj.get_issue(issue_number)
        
        issue.edit(state="closed")
        
        return {
            "repo": repo,
            "issue_number": issue_number,
            "state": "closed",
            "message": f"Successfully closed issue #{issue_number}"
        }
    except Exception as e:
        return {
            "repo": repo,
            "issue_number": issue_number,
            "state": None,
            "message": None,
            "error": f"Failed to close issue #{issue_number}: {str(e)}"
        }


def add_issue_comment(
    token_credential_key: str,
    repo: str,
    issue_number: int,
    body: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Add a comment to an issue.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        body: Comment text
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with created comment details
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return {
            "repo": repo,
            "issue_number": issue_number,
            "id": None,
            "body": None,
            "user": None,
            "created_at": None,
            "html_url": None,
            "error": f"Failed to add issue comment: {str(e)}"
        }


def list_issue_comments(
    token_credential_key: str,
    repo: str,
    issue_number: int,
    base_url_credential_key: str = "",
    per_page: int = 30,
) -> Dict[str, Any]:
    """
    List all comments on an issue.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        per_page: Results per page (max 100, default: 30)

    Returns:
        Dictionary with comments list and total count
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return {
            "repo": repo,
            "issue_number": issue_number,
            "comments": [],
            "total": 0,
            "error": f"Failed to list issue comments: {str(e)}"
        }


def add_issue_labels(
    token_credential_key: str,
    repo: str,
    issue_number: int,
    labels: List[str],
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Add one or more labels to an issue.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        labels: List of label names to add
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with confirmation message and labels added
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        issue = repo_obj.get_issue(issue_number)
        
        issue.add_to_labels(*labels)
        
        return {
            "repo": repo,
            "issue_number": issue_number,
            "labels_added": labels,
            "message": f"Successfully added {len(labels)} label(s) to issue #{issue_number}"
        }
    except Exception as e:
        return {
            "repo": repo,
            "issue_number": issue_number,
            "labels_added": [],
            "message": None,
            "error": f"Failed to add issue labels: {str(e)}"
        }


def remove_issue_label(
    token_credential_key: str,
    repo: str,
    issue_number: int,
    label: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Remove a label from an issue.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        label: Label name to remove
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with confirmation message and label removed
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        repo_obj = client.get_repo(repo)
        issue = repo_obj.get_issue(issue_number)
        
        issue.remove_from_labels(label)
        
        return {
            "repo": repo,
            "issue_number": issue_number,
            "label_removed": label,
            "message": f"Successfully removed label '{label}' from issue #{issue_number}"
        }
    except Exception as e:
        return {
            "repo": repo,
            "issue_number": issue_number,
            "label_removed": None,
            "message": None,
            "error": f"Failed to remove issue label: {str(e)}"
        }


def assign_issue(
    token_credential_key: str,
    repo: str,
    issue_number: int,
    assignees: List[str],
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Assign one or more users to an issue.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        assignees: List of usernames to assign
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with confirmation message and assignees added
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return {
            "repo": repo,
            "issue_number": issue_number,
            "assignees_added": [],
            "message": None,
            "error": f"Failed to assign issue: {str(e)}"
        }


def unassign_issue(
    token_credential_key: str,
    repo: str,
    issue_number: int,
    assignee: str,
    base_url_credential_key: str = "",
) -> Dict[str, Any]:
    """
    Remove a user assignment from an issue.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        repo: Repository name in format "owner/repo"
        issue_number: Issue number
        assignee: Username to unassign
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)

    Returns:
        Dictionary with confirmation message and assignee removed
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
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
    except Exception as e:
        return {
            "repo": repo,
            "issue_number": issue_number,
            "assignee_removed": None,
            "message": None,
            "error": f"Failed to unassign issue: {str(e)}"
        }


def search_issues(
    token_credential_key: str,
    query: str,
    base_url_credential_key: str = "",
    repo: Optional[str] = None,
    sort: str = "created",
    order: str = "desc",
    per_page: int = 30,
) -> Dict[str, Any]:
    """
    Search for issues across repositories or within a specific repository.

    Args:
        token_credential_key: Credential key for GitHub Personal Access Token
        query: Search query (e.g., "bug", "is:open label:bug")
        base_url_credential_key: Credential key for GitHub API base URL (optional, defaults to public GitHub)
        repo: Repository name in format "owner/repo" (optional, searches all if omitted)
        sort: Sort by ("created", "updated", "comments", default: "created")
        order: Sort order ("asc" or "desc", default: "desc")
        per_page: Results per page (max 100, default: 30)

    Returns:
        Dictionary with search results (issues list and total count)
    """
    try:
        client = get_github_client(token_credential_key, base_url_credential_key)
        
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
    except Exception as e:
        return {
            "query": query,
            "repo": repo,
            "issues": [],
            "total": 0,
            "error": f"Failed to search issues: {str(e)}"
        }

