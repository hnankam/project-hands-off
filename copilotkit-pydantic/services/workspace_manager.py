"""Workspace management service for personal resources."""

from typing import Optional, List, Dict, Any
from datetime import datetime
import json

from database.connection import get_db_connection
from config import logger
from core.workspace_models import WorkspaceFile, WorkspaceNote, WorkspaceConnection


async def get_user_workspace_summary(user_id: str) -> Dict[str, Any]:
    """Get summary of user's workspace for context.
    
    Args:
        user_id: User ID
        
    Returns:
        Dictionary with counts and recent items
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            # Get counts
            await cur.execute("""
                SELECT
                    (SELECT COUNT(*) FROM workspace_files WHERE user_id = %s) as file_count,
                    (SELECT COUNT(*) FROM workspace_notes WHERE user_id = %s) as note_count,
                    (SELECT COUNT(*) FROM workspace_connections WHERE user_id = %s AND status = 'active') as connection_count,
                    (SELECT COALESCE(SUM(file_size), 0) FROM workspace_files WHERE user_id = %s) as total_size
            """, (user_id, user_id, user_id, user_id))
            
            stats = await cur.fetchone()
            
            # Get recent files
            await cur.execute("""
                SELECT id, file_name, file_type, file_size, folder, tags, created_at
                FROM workspace_files
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT 10
            """, (user_id,))
            
            recent_files = await cur.fetchall()
            
            # Get recent notes
            await cur.execute("""
                SELECT id, title, folder, tags, created_at, updated_at
                FROM workspace_notes
                WHERE user_id = %s
                ORDER BY updated_at DESC
                LIMIT 10
            """, (user_id,))
            
            recent_notes = await cur.fetchall()
            
            # Get active connections
            await cur.execute("""
                SELECT id, connection_name, service_name, connection_type, 
                       status, last_used_at, created_at
                FROM workspace_connections
                WHERE user_id = %s AND status = 'active'
                ORDER BY last_used_at DESC NULLS LAST
            """, (user_id,))
            
            active_connections = await cur.fetchall()
    
    return {
        'stats': dict(stats) if stats else {},
        'recent_files': [dict(row) for row in recent_files],
        'recent_notes': [dict(row) for row in recent_notes],
        'active_connections': [dict(row) for row in active_connections]
    }


async def search_workspace_files(
    user_id: str,
    query: str,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """Search user's files by name or content.
    
    Args:
        user_id: User ID
        query: Search query
        limit: Maximum results
        
    Returns:
        List of matching files
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT id, file_name, file_type, file_size, 
                       folder, tags, description, created_at,
                       ts_rank(
                           to_tsvector('english', file_name || ' ' || COALESCE(extracted_text, '')),
                           plainto_tsquery('english', %s)
                       ) as rank
                FROM workspace_files
                WHERE user_id = %s
                  AND (
                      file_name ILIKE %s
                      OR to_tsvector('english', COALESCE(extracted_text, '')) @@ plainto_tsquery('english', %s)
                  )
                ORDER BY rank DESC, created_at DESC
                LIMIT %s
            """, (query, user_id, f'%{query}%', query, limit))
            
            rows = await cur.fetchall()
            return [dict(row) for row in rows]


async def get_file_content(user_id: str, file_id: str) -> Optional[Dict[str, Any]]:
    """Get file content by ID.
    
    Args:
        user_id: User ID
        file_id: File UUID
        
    Returns:
        File data with extracted text or None
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT file_name, file_type, extracted_text, storage_url
                FROM workspace_files
                WHERE id = %s AND user_id = %s
            """, (file_id, user_id))
            
            row = await cur.fetchone()
            return dict(row) if row else None


async def register_workspace_file(
    user_id: str,
    file_name: str,
    file_type: str,
    file_size: int,
    storage_url: str,
    folder: str = 'generated',
    extracted_text: Optional[str] = None,
    page_count: Optional[int] = None,
    tags: Optional[List[str]] = None,
    description: str = ''
) -> Optional[Dict[str, Any]]:
    """Register a file in the user's workspace.
    
    Args:
        user_id: User ID
        file_name: Name of the file
        file_type: MIME type of the file
        file_size: Size of the file in bytes
        storage_url: URL to the file in Firebase Storage
        folder: Folder category (default: 'generated')
        extracted_text: Optional extracted text content
        page_count: Optional number of pages (for documents)
        tags: Optional list of tags
        description: Optional description
        
    Returns:
        Dictionary with the created file record or None on failure
    """
    if tags is None:
        tags = []
    
    try:
        async with get_db_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO workspace_files 
                    (user_id, file_name, file_type, file_size, storage_url, 
                     extracted_text, page_count, folder, tags, description)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, file_name, file_type, file_size, storage_url, 
                              folder, tags, created_at
                """, (
                    user_id, file_name, file_type, file_size, storage_url,
                    extracted_text, page_count, folder, tags, description
                ))
                
                row = await cur.fetchone()
                await conn.commit()
                
                return dict(row) if row else None
    except Exception as e:
        logger.error(f"Failed to register workspace file: {e}")
        return None


async def search_workspace_notes(
    user_id: str,
    query: str,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """Search user's notes by title or content.
    
    Args:
        user_id: User ID
        query: Search query
        limit: Maximum results
        
    Returns:
        List of matching notes
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT id, title, content, folder, tags, created_at, updated_at,
                       ts_rank(
                           to_tsvector('english', title || ' ' || content),
                           plainto_tsquery('english', %s)
                       ) as rank
                FROM workspace_notes
                WHERE user_id = %s
                  AND to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', %s)
                ORDER BY rank DESC, updated_at DESC
                LIMIT %s
            """, (query, user_id, query, limit))
            
            rows = await cur.fetchall()
            return [dict(row) for row in rows]


async def get_note_content(user_id: str, note_id: str) -> Optional[Dict[str, Any]]:
    """Get note content by ID.
    
    Args:
        user_id: User ID
        note_id: Note UUID
        
    Returns:
        Note data or None
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT id, title, content, folder, tags, created_at, updated_at
                FROM workspace_notes
                WHERE id = %s AND user_id = %s
            """, (note_id, user_id))
            
            row = await cur.fetchone()
            return dict(row) if row else None


async def get_user_connection(
    user_id: str,
    service_name: str
) -> Optional[Dict[str, Any]]:
    """Get user's connection for a service.
    
    Args:
        user_id: User ID
        service_name: Service name (gmail, slack)
        
    Returns:
        Connection data (with encrypted credentials) or None
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT id, connection_name, connection_type, service_name,
                       encrypted_credentials, token_expires_at, scopes,
                       status, last_used_at, metadata
                FROM workspace_connections
                WHERE user_id = %s AND service_name = %s AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
            """, (user_id, service_name))
            
            row = await cur.fetchone()
            return dict(row) if row else None


async def update_connection_last_used(connection_id: str) -> None:
    """Update last_used_at timestamp for a connection.
    
    Args:
        connection_id: Connection UUID
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                UPDATE workspace_connections
                SET last_used_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (connection_id,))
        await conn.commit()


async def list_user_connections(user_id: str) -> List[Dict[str, Any]]:
    """List all active connections for user.
    
    Args:
        user_id: User ID
        
    Returns:
        List of connections (without encrypted credentials)
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT id, connection_name, connection_type, service_name,
                       status, token_expires_at, scopes, last_used_at,
                       last_sync_at, description, created_at, updated_at
                FROM workspace_connections
                WHERE user_id = %s
                ORDER BY created_at DESC
            """, (user_id,))
            
            rows = await cur.fetchall()
            return [dict(row) for row in rows]

