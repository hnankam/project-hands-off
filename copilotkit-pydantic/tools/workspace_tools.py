"""Workspace tools for AI agent to access user's personal resources."""

import json
from typing import Any
from pydantic_ai import RunContext

from core.models import UnifiedDeps
from services.workspace_manager import (
    search_workspace_files,
    get_file_content,
    search_workspace_notes,
    get_note_content,
    get_user_connection,
    update_connection_last_used
)
from config import logger


async def search_workspace_files_tool(
    ctx: RunContext[UnifiedDeps],
    query: str,
    limit: int = 10
) -> str:
    """Search user's uploaded files by name or content.
    
    Use this when the user asks about their files, documents, or uploaded content.
    
    Args:
        query: Search query (matches filename or extracted text)
        limit: Maximum number of results (default 10, max 20)
    
    Returns:
        JSON string with list of matching files
    
    Examples:
        - User: "Find my project proposal"
        - User: "Do I have any PDFs about machine learning?"
        - User: "What files did I upload yesterday?"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        return "Error: User ID not available"
    
    try:
        # Limit to max 20 results
        limit = min(limit, 20)
        
        results = await search_workspace_files(user_id, query, limit)
        
        if not results:
            return f"No files found matching '{query}'. User may need to upload files in Workspace tab first."
        
        # Format results for display
        formatted_results = []
        for row in results:
            formatted_results.append({
                'id': row['id'],
                'name': row['file_name'],
                'type': row['file_type'],
                'size_bytes': row['file_size'],
                'folder': row['folder'],
                'tags': row['tags'] or [],
                'uploaded': row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else str(row['created_at'])
            })
        
        return json.dumps({
            'found': len(formatted_results),
            'files': formatted_results
        }, indent=2)
        
    except Exception as e:
        logger.error(f"Error searching workspace files: {e}")
        return f"Error searching files: {str(e)}"


async def get_file_content_tool(
    ctx: RunContext[UnifiedDeps],
    file_id: str
) -> str:
    """Get full text content from an uploaded file.
    
    Use this after searching for files to read the actual content.
    Only works for files with extracted text (PDFs, documents, text files).
    
    Args:
        file_id: UUID of the file (from search_workspace_files results)
    
    Returns:
        Extracted text content of the file
    
    Examples:
        - After user asks "What's in my project proposal PDF?"
        - After finding relevant files and needing to read them
    """
    user_id = ctx.deps.user_id
    if not user_id:
        return "Error: User ID not available"
    
    try:
        file_data = await get_file_content(user_id, file_id)
        
        if not file_data:
            return f"Error: File not found or access denied (file_id: {file_id})"
        
        if not file_data['extracted_text']:
            return f"File '{file_data['file_name']}' is a {file_data['file_type']} with no extracted text content. It may be an image or binary file."
        
        # Return file name and content
        content = file_data['extracted_text']
        
        # Truncate very long content (keep first 10000 chars)
        if len(content) > 10000:
            content = content[:10000] + f"\n\n[Content truncated - file has {len(file_data['extracted_text'])} total characters]"
        
        return f"File: {file_data['file_name']}\nType: {file_data['file_type']}\n\n{content}"
        
    except Exception as e:
        logger.error(f"Error getting file content: {e}")
        return f"Error retrieving file: {str(e)}"


async def search_workspace_notes_tool(
    ctx: RunContext[UnifiedDeps],
    query: str,
    limit: int = 10
) -> str:
    """Search user's personal notes.
    
    Use this when the user asks about their notes or saved information.
    
    Args:
        query: Search query (matches title or content)
        limit: Maximum number of results (default 10, max 20)
    
    Returns:
        JSON string with matching notes (includes preview)
    
    Examples:
        - User: "Find my meeting notes"
        - User: "What notes do I have about the project?"
        - User: "Search my notes for todo items"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        return "Error: User ID not available"
    
    try:
        # Limit to max 20 results
        limit = min(limit, 20)
        
        results = await search_workspace_notes(user_id, query, limit)
        
        if not results:
            return f"No notes found matching '{query}'. User may need to create notes in Workspace tab first."
        
        # Format results with content preview
        formatted_results = []
        for row in results:
            content_preview = row['content'][:200] + '...' if len(row['content']) > 200 else row['content']
            formatted_results.append({
                'id': row['id'],
                'title': row['title'],
                'preview': content_preview,
                'folder': row['folder'],
                'tags': row['tags'] or [],
                'created': row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else str(row['created_at']),
                'updated': row['updated_at'].isoformat() if hasattr(row['updated_at'], 'isoformat') else str(row['updated_at'])
            })
        
        return json.dumps({
            'found': len(formatted_results),
            'notes': formatted_results
        }, indent=2)
        
    except Exception as e:
        logger.error(f"Error searching workspace notes: {e}")
        return f"Error searching notes: {str(e)}"


async def get_note_content_tool(
    ctx: RunContext[UnifiedDeps],
    note_id: str
) -> str:
    """Get full content of a personal note.
    
    Use this after searching for notes to read the complete content.
    
    Args:
        note_id: UUID of the note (from search_workspace_notes results)
    
    Returns:
        Full note content
    
    Examples:
        - After user asks "Read my meeting notes from yesterday"
        - After finding relevant notes and needing full content
    """
    user_id = ctx.deps.user_id
    if not user_id:
        return "Error: User ID not available"
    
    try:
        note_data = await get_note_content(user_id, note_id)
        
        if not note_data:
            return f"Error: Note not found or access denied (note_id: {note_id})"
        
        # Return note title and full content
        content = note_data['content']
        
        # Truncate very long notes (keep first 10000 chars)
        if len(content) > 10000:
            content = content[:10000] + f"\n\n[Content truncated - note has {len(note_data['content'])} total characters]"
        
        return f"Note: {note_data['title']}\nFolder: {note_data['folder']}\nTags: {', '.join(note_data['tags']) if note_data['tags'] else 'None'}\n\n{content}"
        
    except Exception as e:
        logger.error(f"Error getting note content: {e}")
        return f"Error retrieving note: {str(e)}"


async def search_user_emails_tool(
    ctx: RunContext[UnifiedDeps],
    query: str,
    limit: int = 10
) -> str:
    """Search user's Gmail emails.
    
    Use this when user asks about their emails or email threads.
    Requires user to have connected their Gmail account in Workspace.
    
    Args:
        query: Search query (supports Gmail search syntax like 'from:email@domain.com subject:project')
        limit: Maximum number of results (default 10, max 25)
    
    Returns:
        JSON string with matching email threads
    
    Examples:
        - User: "Search my emails for project alpha"
        - User: "Find emails from john@example.com about the proposal"
        - User: "What emails did I get yesterday about the meeting?"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        return "Error: User ID not available"
    
    try:
        # Check if user has Gmail connected
        connection = await get_user_connection(user_id, 'gmail')
        
        if not connection:
            return "Gmail not connected. User needs to connect Gmail in Workspace > Connections tab first."
        
        # TODO: Implement Gmail API integration
        # For now, return placeholder
        return json.dumps({
            'status': 'not_implemented',
            'message': 'Gmail integration coming soon. User can manually copy-paste email content for now.'
        }, indent=2)
        
    except Exception as e:
        logger.error(f"Error searching emails: {e}")
        return f"Error searching emails: {str(e)}"


async def search_user_slack_tool(
    ctx: RunContext[UnifiedDeps],
    query: str,
    limit: int = 10
) -> str:
    """Search user's Slack messages and threads.
    
    Use this when user asks about Slack conversations or messages.
    Requires user to have connected their Slack workspace in Workspace.
    
    Args:
        query: Search query (searches message text)
        limit: Maximum number of results (default 10, max 25)
    
    Returns:
        JSON string with matching Slack messages
    
    Examples:
        - User: "Search my Slack for project updates"
        - User: "Find that Slack thread about the bug fix"
        - User: "What did the team say about the deadline?"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        return "Error: User ID not available"
    
    try:
        # Check if user has Slack connected
        connection = await get_user_connection(user_id, 'slack')
        
        if not connection:
            return "Slack not connected. User needs to connect Slack in Workspace > Connections tab first."
        
        # TODO: Implement Slack API integration
        # For now, return placeholder
        return json.dumps({
            'status': 'not_implemented',
            'message': 'Slack integration coming soon. User can manually copy-paste Slack content for now.'
        }, indent=2)
        
    except Exception as e:
        logger.error(f"Error searching Slack: {e}")
        return f"Error searching Slack: {str(e)}"

