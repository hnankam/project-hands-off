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
    limit: Optional[int] = 10,
    offset: int = 0,
    count_only: bool = False
) -> List[Dict[str, Any]] | int:
    """Search user's files by name or content with pagination.
    
    Args:
        user_id: User ID
        query: Search query (use '*' or empty string to get all files)
        limit: Maximum results (None for count_only)
        offset: Number of results to skip
        count_only: If True, return only count
        
    Returns:
        List of matching files or count
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            # If query is wildcard or empty, return all files
            if not query or query.strip() in ('*', ''):
                if count_only:
                    await cur.execute("""
                        SELECT COUNT(*) as count
                        FROM workspace_files
                        WHERE user_id = %s
                          AND file_name != '.folder'
                    """, (user_id,))
                    
                    row = await cur.fetchone()
                    return row['count'] if row else 0
                
                await cur.execute("""
                    SELECT id, file_name, file_type, file_size, 
                           folder, tags, description, created_at
                    FROM workspace_files
                    WHERE user_id = %s
                      AND file_name != '.folder'
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                """, (user_id, limit, offset))
                
                rows = await cur.fetchall()
                return [dict(row) for row in rows]
            
            # Use search for specific queries
            if count_only:
                # Get total count
                await cur.execute("""
                    SELECT COUNT(*) as count
                    FROM workspace_files
                    WHERE user_id = %s
                      AND file_name != '.folder'
                      AND (
                          file_name ILIKE %s
                          OR to_tsvector('english', COALESCE(extracted_text, '')) @@ plainto_tsquery('english', %s)
                      )
                """, (user_id, f'%{query}%', query))
                
                row = await cur.fetchone()
                return row['count'] if row else 0
            
            # Get paginated results
            await cur.execute("""
                SELECT id, file_name, file_type, file_size, 
                       folder, tags, description, created_at,
                       ts_rank(
                           to_tsvector('english', file_name || ' ' || COALESCE(extracted_text, '')),
                           plainto_tsquery('english', %s)
                       ) as rank
                FROM workspace_files
                WHERE user_id = %s
                  AND file_name != '.folder'
                  AND (
                      file_name ILIKE %s
                      OR to_tsvector('english', COALESCE(extracted_text, '')) @@ plainto_tsquery('english', %s)
                  )
                ORDER BY rank DESC, created_at DESC
                LIMIT %s OFFSET %s
            """, (query, user_id, f'%{query}%', query, limit, offset))
            
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
                SELECT file_name, file_type, file_size, folder, extracted_text, storage_url
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
        query: Search query (use '*' or empty string to get all notes)
        limit: Maximum results
        
    Returns:
        List of matching notes
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            # If query is wildcard or empty, return all notes
            if not query or query.strip() in ('*', ''):
                await cur.execute("""
                    SELECT id, title, content, folder, tags, created_at, updated_at
                    FROM workspace_notes
                    WHERE user_id = %s
                    ORDER BY updated_at DESC
                    LIMIT %s
                """, (user_id, limit))
            else:
                # Use full-text search for specific queries
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


# ============================================================================
# Folder Management Functions
# ============================================================================

async def list_folders(user_id: str) -> List[Dict[str, Any]]:
    """List all folders for a user.
    
    Args:
        user_id: User ID
        
    Returns:
        List of folder information with file counts (excluding .folder placeholders)
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            # Get distinct folders with file counts (excluding .folder placeholders)
            await cur.execute("""
                SELECT 
                    folder as path,
                    COALESCE(SUBSTRING(folder FROM '[^/]+$'), folder) as name,
                    COUNT(CASE WHEN file_name != '.folder' THEN 1 END) as file_count,
                    MIN(created_at) as created
                FROM workspace_files
                WHERE user_id = %s AND folder IS NOT NULL AND folder != ''
                GROUP BY folder
                ORDER BY folder
            """, (user_id,))
            
            rows = await cur.fetchall()
            return [dict(row) for row in rows]


async def create_folder(
    user_id: str,
    folder_name: str,
    parent_path: Optional[str] = None
) -> Dict[str, Any]:
    """Create a folder by adding a hidden placeholder file.
    
    Creates a virtual folder by inserting a hidden .folder placeholder file.
    This ensures empty folders are visible in the UI.
    
    Args:
        user_id: User ID
        folder_name: Name of folder to create
        parent_path: Optional parent folder path
        
    Returns:
        Dictionary with folder path information
    """
    # Validate folder name
    if not folder_name or '/' in folder_name:
        raise ValueError("Folder name cannot be empty or contain '/'")
    
    # Build full path
    if parent_path:
        full_path = f"{parent_path.strip('/')}/{folder_name}"
    else:
        full_path = folder_name
    
    # Check if folder already exists (has any files)
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT COUNT(*) as count
                FROM workspace_files
                WHERE user_id = %s AND folder = %s
            """, (user_id, full_path))
            
            row = await cur.fetchone()
            exists = row['count'] > 0 if row else False
            
            if exists:
                # Folder already exists
                return {
                    'path': full_path,
                    'name': folder_name,
                    'exists': True,
                    'created': None  # Already existed
                }
            
            # Create hidden placeholder file using create_text_file
            result = await create_text_file(
                user_id=user_id,
                file_name='.folder',
                content='',
                folder=full_path,
                file_type='application/x-folder-placeholder',
                description='Placeholder file to maintain empty folder structure'
            )
    
    return {
        'path': full_path,
        'name': folder_name,
        'exists': True,
        'created': result['created_at'].isoformat() if result else datetime.now().isoformat()
    }


async def rename_folder(
    user_id: str,
    old_name: str,
    new_name: str
) -> Dict[str, Any]:
    """Rename a folder by updating all files in it.
    
    Args:
        user_id: User ID
        old_name: Current folder path
        new_name: New folder name (just the name, not full path)
        
    Returns:
        Dictionary with new folder path
    """
    # Validate new name
    if not new_name or '/' in new_name:
        raise ValueError("New folder name cannot be empty or contain '/'")
    
    # Calculate new path (preserve parent path if exists)
    if '/' in old_name:
        parent_path = old_name.rsplit('/', 1)[0]
        new_path = f"{parent_path}/{new_name}"
    else:
        new_path = new_name
    
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            # Update all files in the folder
            await cur.execute("""
                UPDATE workspace_files
                SET folder = %s, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = %s AND folder = %s
            """, (new_path, user_id, old_name))
            
            rows_updated = cur.rowcount
            await conn.commit()
    
    if rows_updated == 0:
        raise ValueError(f"Folder '{old_name}' not found or is empty")
    
    return {
        'path': new_path,
        'name': new_name,
        'files_updated': rows_updated
    }


async def delete_folder(
    user_id: str,
    folder_name: str,
    delete_files: bool = False
) -> Dict[str, Any]:
    """Delete a folder.
    
    Always deletes placeholder files. If delete_files=False and folder contains real files,
    moves real files to root. If delete_files=True, deletes everything.
    
    Args:
        user_id: User ID
        folder_name: Folder path to delete
        delete_files: Whether to delete files in folder (default: False)
        
    Returns:
        Dictionary with deletion result
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            # Check file count (excluding placeholder)
            await cur.execute("""
                SELECT COUNT(*) as count
                FROM workspace_files
                WHERE user_id = %s AND folder = %s AND file_name != '.folder'
            """, (user_id, folder_name))
            
            row = await cur.fetchone()
            real_file_count = row['count'] if row else 0
            
            # Always delete placeholder files
            await cur.execute("""
                DELETE FROM workspace_files
                WHERE user_id = %s AND folder = %s AND file_name = '.folder'
            """, (user_id, folder_name))
            
            # If folder only had placeholders, we're done
            if real_file_count == 0:
                await conn.commit()
                return {
                    'success': True,
                    'message': 'Empty folder deleted',
                    'files_deleted': 0
                }
            
            if delete_files:
                # Delete all real files
                await cur.execute("""
                    DELETE FROM workspace_files
                    WHERE user_id = %s AND folder = %s AND file_name != '.folder'
                """, (user_id, folder_name))
                
                await conn.commit()
                
                return {
                    'success': True,
                    'message': f'Folder and {real_file_count} file(s) deleted',
                    'files_deleted': real_file_count
                }
            else:
                # Move real files to root
                await cur.execute("""
                    UPDATE workspace_files
                    SET folder = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s AND folder = %s AND file_name != '.folder'
                """, (user_id, folder_name))
                
                await conn.commit()
                
                return {
                    'success': True,
                    'message': f'Folder deleted, moved {real_file_count} file(s) to root',
                    'files_deleted': 0,
                    'files_moved': real_file_count
                }


# ============================================================================
# File Management Functions
# ============================================================================

async def list_files(
    user_id: str,
    folder: Optional[str] = None,
    limit: Optional[int] = 50,
    offset: int = 0,
    count_only: bool = False
) -> List[Dict[str, Any]] | int:
    """List files in a specific folder with pagination.
    
    Filters out hidden placeholder files (.folder) used for virtual folder structure.
    
    Args:
        user_id: User ID
        folder: Folder path (None for root/unorganized)
        limit: Maximum number of files (None for count_only)
        offset: Number of files to skip
        count_only: If True, return only count
        
    Returns:
        List of files in folder or count
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            if folder is None:
                # Root folder (NULL or empty folder)
                if count_only:
                    await cur.execute("""
                        SELECT COUNT(*) as count
                        FROM workspace_files
                        WHERE user_id = %s 
                          AND (folder IS NULL OR folder = '')
                          AND file_name != '.folder'
                    """, (user_id,))
                    
                    row = await cur.fetchone()
                    return row['count'] if row else 0
                
                await cur.execute("""
                    SELECT id, file_name, file_type, file_size,
                           folder, tags, description, created_at, updated_at
                    FROM workspace_files
                    WHERE user_id = %s 
                      AND (folder IS NULL OR folder = '')
                      AND file_name != '.folder'
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                """, (user_id, limit, offset))
            else:
                # Specific folder
                if count_only:
                    await cur.execute("""
                        SELECT COUNT(*) as count
                        FROM workspace_files
                        WHERE user_id = %s 
                          AND folder = %s
                          AND file_name != '.folder'
                    """, (user_id, folder))
                    
                    row = await cur.fetchone()
                    return row['count'] if row else 0
                
                await cur.execute("""
                    SELECT id, file_name, file_type, file_size,
                           folder, tags, description, created_at, updated_at
                    FROM workspace_files
                    WHERE user_id = %s 
                      AND folder = %s
                      AND file_name != '.folder'
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                """, (user_id, folder, limit, offset))
            
            rows = await cur.fetchall()
            return [dict(row) for row in rows]


async def list_files_recursive(
    user_id: str,
    root_folder: Optional[str] = None,
    max_depth: int = 10,
    limit: Optional[int] = 100,
    offset: int = 0,
    count_only: bool = False
) -> List[Dict[str, Any]] | int:
    """List files recursively across all subfolders.
    
    Filters out hidden placeholder files (.folder) used for virtual folder structure.
    
    Args:
        user_id: User ID
        root_folder: Starting folder path (None for all)
        max_depth: Maximum folder depth to traverse
        limit: Maximum number of files (None for count_only)
        offset: Number of files to skip
        count_only: If True, return only count
        
    Returns:
        List of files or count
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            if root_folder is None:
                # All files
                if count_only:
                    await cur.execute("""
                        SELECT COUNT(*) as count
                        FROM workspace_files
                        WHERE user_id = %s
                          AND file_name != '.folder'
                    """, (user_id,))
                    
                    row = await cur.fetchone()
                    return row['count'] if row else 0
                
                await cur.execute("""
                    SELECT id, file_name, file_type, file_size,
                           folder, tags, description, created_at, updated_at
                    FROM workspace_files
                    WHERE user_id = %s
                      AND file_name != '.folder'
                    ORDER BY folder ASC NULLS FIRST, created_at DESC
                    LIMIT %s OFFSET %s
                """, (user_id, limit, offset))
            else:
                # Files in folder and subfolders (using pattern matching)
                folder_pattern = f"{root_folder}%"
                
                if count_only:
                    await cur.execute("""
                        SELECT COUNT(*) as count
                        FROM workspace_files
                        WHERE user_id = %s 
                          AND (folder = %s OR folder LIKE %s)
                          AND file_name != '.folder'
                    """, (user_id, root_folder, folder_pattern))
                    
                    row = await cur.fetchone()
                    return row['count'] if row else 0
                
                await cur.execute("""
                    SELECT id, file_name, file_type, file_size,
                           folder, tags, description, created_at, updated_at
                    FROM workspace_files
                    WHERE user_id = %s 
                      AND (folder = %s OR folder LIKE %s)
                      AND file_name != '.folder'
                    ORDER BY folder ASC, created_at DESC
                    LIMIT %s OFFSET %s
                """, (user_id, root_folder, folder_pattern, limit, offset))
            
            rows = await cur.fetchall()
            return [dict(row) for row in rows]


async def delete_file(user_id: str, file_id: str) -> None:
    """Delete a file from workspace.
    
    Args:
        user_id: User ID
        file_id: File UUID
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                DELETE FROM workspace_files
                WHERE id = %s AND user_id = %s
            """, (file_id, user_id))
            
            if cur.rowcount == 0:
                raise ValueError(f"File not found or access denied (file_id: {file_id})")
            
            await conn.commit()


async def rename_file(
    user_id: str,
    file_id: str,
    new_name: str
) -> Dict[str, Any]:
    """Rename a file.
    
    Args:
        user_id: User ID
        file_id: File UUID
        new_name: New file name
        
    Returns:
        Dictionary with updated file info
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                UPDATE workspace_files
                SET file_name = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND user_id = %s
                RETURNING file_name, folder
            """, (new_name, file_id, user_id))
            
            row = await cur.fetchone()
            
            if not row:
                raise ValueError(f"File not found or access denied (file_id: {file_id})")
            
            await conn.commit()
            return dict(row)


async def move_file(
    user_id: str,
    file_id: str,
    target_folder: Optional[str]
) -> Dict[str, Any]:
    """Move a file to a different folder.
    
    Args:
        user_id: User ID
        file_id: File UUID
        target_folder: Target folder path (None for root)
        
    Returns:
        Dictionary with updated file info
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                UPDATE workspace_files
                SET folder = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND user_id = %s
                RETURNING file_name, folder
            """, (target_folder, file_id, user_id))
            
            row = await cur.fetchone()
            
            if not row:
                raise ValueError(f"File not found or access denied (file_id: {file_id})")
            
            await conn.commit()
            return dict(row)


async def update_file_tags(
    user_id: str,
    file_id: str,
    tags: List[str],
    operation: str = "replace"
) -> Dict[str, Any]:
    """Update file tags.
    
    Args:
        user_id: User ID
        file_id: File UUID
        tags: List of tags
        operation: One of 'replace', 'add', 'remove'
        
    Returns:
        Dictionary with updated tags
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            if operation == "replace":
                # Replace all tags
                await cur.execute("""
                    UPDATE workspace_files
                    SET tags = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND user_id = %s
                    RETURNING tags
                """, (tags, file_id, user_id))
            
            elif operation == "add":
                # Add tags (append to existing)
                await cur.execute("""
                    UPDATE workspace_files
                    SET tags = ARRAY(SELECT DISTINCT unnest(tags || %s::text[])),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND user_id = %s
                    RETURNING tags
                """, (tags, file_id, user_id))
            
            elif operation == "remove":
                # Remove tags
                await cur.execute("""
                    UPDATE workspace_files
                    SET tags = ARRAY(SELECT unnest(tags) EXCEPT SELECT unnest(%s::text[])),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND user_id = %s
                    RETURNING tags
                """, (tags, file_id, user_id))
            
            else:
                raise ValueError(f"Invalid operation: {operation}")
            
            row = await cur.fetchone()
            
            if not row:
                raise ValueError(f"File not found or access denied (file_id: {file_id})")
            
            await conn.commit()
            return dict(row)


async def get_file_metadata(user_id: str, file_id: str) -> Optional[Dict[str, Any]]:
    """Get file metadata without content.
    
    Args:
        user_id: User ID
        file_id: File UUID
        
    Returns:
        File metadata or None
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT id, file_name, file_type, file_size,
                       folder, tags, description, 
                       (extracted_text IS NOT NULL AND extracted_text != '') as has_text_content,
                       created_at, updated_at
                FROM workspace_files
                WHERE id = %s AND user_id = %s
            """, (file_id, user_id))
            
            row = await cur.fetchone()
            return dict(row) if row else None


async def create_text_file(
    user_id: str,
    file_name: str,
    content: str,
    folder: Optional[str] = None,
    tags: Optional[List[str]] = None,
    description: str = "",
    file_type: Optional[str] = None
) -> Dict[str, Any]:
    """Create a new text file in workspace.
    
    Args:
        user_id: User ID
        file_name: File name with extension
        content: Text content
        folder: Optional folder path
        tags: Optional list of tags
        description: Optional description
        file_type: Optional explicit file type (if not provided, auto-detected)
        
    Returns:
        Dictionary with created file info
    """
    if tags is None:
        tags = []
    
    # Detect MIME type from extension if not explicitly provided
    if file_type is None:
        file_type_map = {
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.json': 'application/json',
            '.csv': 'text/csv',
            '.xml': 'text/xml',
            '.html': 'text/html',
            '.yaml': 'text/yaml',
            '.yml': 'text/yaml',
            '.log': 'text/plain',
        }
        
        file_ext = '.' + file_name.rsplit('.', 1)[-1].lower() if '.' in file_name else '.txt'
        file_type = file_type_map.get(file_ext, 'text/plain')
    
    file_size = len(content.encode('utf-8'))
    
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            # For text files, we store content as extracted_text
            # storage_url can be a data URI or generated later
            storage_url = f"data:text/plain;base64,{content[:100]}"  # Placeholder
            
            await cur.execute("""
                INSERT INTO workspace_files 
                (user_id, file_name, file_type, file_size, storage_url, 
                 extracted_text, folder, tags, description)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, file_name, file_type, file_size, folder, tags, created_at
            """, (
                user_id, file_name, file_type, file_size, storage_url,
                content, folder, tags, description
            ))
            
            row = await cur.fetchone()
            await conn.commit()
            
            return dict(row) if row else None


async def update_file_content(
    user_id: str,
    file_id: str,
    content: str,
    append: bool = False
) -> Dict[str, Any]:
    """Update content of a text file.
    
    Args:
        user_id: User ID
        file_id: File UUID
        content: New content or content to append
        append: Whether to append to existing content
        
    Returns:
        Dictionary with updated file info
    """
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            if append:
                # Append to existing content
                await cur.execute("""
                    UPDATE workspace_files
                    SET extracted_text = COALESCE(extracted_text, '') || %s,
                        file_size = LENGTH(COALESCE(extracted_text, '') || %s),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND user_id = %s
                    RETURNING id, file_name, file_type, file_size, folder
                """, (content, content, file_id, user_id))
            else:
                # Replace content
                new_size = len(content.encode('utf-8'))
                await cur.execute("""
                    UPDATE workspace_files
                    SET extracted_text = %s,
                        file_size = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND user_id = %s
                    RETURNING id, file_name, file_type, file_size, folder
                """, (content, new_size, file_id, user_id))
            
            row = await cur.fetchone()
            
            if not row:
                raise ValueError(f"File not found or access denied (file_id: {file_id})")
            
            await conn.commit()
            return dict(row)

