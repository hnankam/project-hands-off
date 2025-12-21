"""Workspace tools for AI agent to access user's personal resources."""

from typing import List, Optional
from pydantic import BaseModel, Field
from pydantic_ai import RunContext

from core.models import UnifiedDeps
from services.workspace_manager import (
    search_workspace_files as _search_files_service,
    get_file_content as _get_file_content_service,
    search_workspace_notes as _search_notes_service,
    get_note_content as _get_note_content_service,
    create_folder as _create_folder_service,
    rename_folder as _rename_folder_service,
    delete_folder as _delete_folder_service,
    list_folders as _list_folders_service,
    delete_file as _delete_file_service,
    rename_file as _rename_file_service,
    move_file as _move_file_service,
    list_files as _list_files_service,
    list_files_recursive as _list_files_recursive_service,
    create_text_file as _create_text_file_service,
    update_file_content as _update_file_content_service,
    get_file_metadata as _get_file_metadata_service,
)
from config import logger


# ============================================================================
# Output Models
# ============================================================================

class FileSearchItem(BaseModel):
    """Individual file in search results."""
    id: str = Field(description="Unique file identifier")
    name: str = Field(description="File name")
    type: str = Field(description="MIME type")
    size_bytes: int = Field(description="File size in bytes")
    folder: Optional[str] = Field(default=None, description="Folder path")
    tags: List[str] = Field(default_factory=list, description="File tags")
    uploaded: str = Field(description="Upload timestamp (ISO 8601)")


class FileSearchResult(BaseModel):
    """Search results for workspace files."""
    found: int = Field(description="Number of files found")
    files: List[FileSearchItem] = Field(description="List of matching files")


class FileContent(BaseModel):
    """Full content of a workspace file."""
    file_name: str = Field(description="File name")
    file_type: str = Field(description="MIME type")
    folder: Optional[str] = Field(default=None, description="Folder path")
    size_bytes: int = Field(description="Original file size")
    content: str = Field(description="Extracted text content")
    content_length: int = Field(description="Length of extracted content in characters")


class NoteSearchItem(BaseModel):
    """Individual note in search results."""
    id: str = Field(description="Unique note identifier")
    title: str = Field(description="Note title")
    preview: str = Field(description="Content preview (first 200 characters)")
    folder: Optional[str] = Field(default=None, description="Folder path")
    tags: List[str] = Field(default_factory=list, description="Note tags")
    created: str = Field(description="Creation timestamp (ISO 8601)")
    updated: str = Field(description="Last update timestamp (ISO 8601)")


class NoteSearchResult(BaseModel):
    """Search results for workspace notes."""
    found: int = Field(description="Number of notes found")
    notes: List[NoteSearchItem] = Field(description="List of matching notes")


class NoteContent(BaseModel):
    """Full content of a workspace note."""
    title: str = Field(description="Note title")
    folder: Optional[str] = Field(default=None, description="Folder path")
    tags: List[str] = Field(default_factory=list, description="Note tags")
    content: str = Field(description="Full note content")
    content_length: int = Field(description="Length of content in characters")
    created: str = Field(description="Creation timestamp (ISO 8601)")
    updated: str = Field(description="Last update timestamp (ISO 8601)")


class ErrorResponse(BaseModel):
    """Error response for tool failures."""
    error: str = Field(description="Error type or message")
    details: Optional[str] = Field(default=None, description="Additional error details")


class FolderItem(BaseModel):
    """Individual folder information."""
    name: str = Field(description="Folder name")
    path: str = Field(description="Full folder path")
    file_count: int = Field(default=0, description="Number of files in folder")
    created: Optional[str] = Field(default=None, description="Creation timestamp (ISO 8601)")


class FolderListResult(BaseModel):
    """List of folders in workspace."""
    count: int = Field(description="Number of folders")
    folders: List[FolderItem] = Field(description="List of folders")


class FolderOperationResult(BaseModel):
    """Result of folder operation (create, rename, delete)."""
    success: bool = Field(description="Whether operation succeeded")
    message: str = Field(description="Success or error message")
    folder_name: Optional[str] = Field(default=None, description="Folder name")
    folder_path: Optional[str] = Field(default=None, description="Full folder path")


class FileListResult(BaseModel):
    """List of files in a folder."""
    count: int = Field(description="Number of files")
    folder: str = Field(description="Folder path")
    files: List[FileSearchItem] = Field(description="List of files")


class FileOperationResult(BaseModel):
    """Result of file operation (delete, rename, move, update tags)."""
    success: bool = Field(description="Whether operation succeeded")
    message: str = Field(description="Success or error message")
    file_id: Optional[str] = Field(default=None, description="File ID")
    file_name: Optional[str] = Field(default=None, description="File name")
    new_path: Optional[str] = Field(default=None, description="New file path (for move/rename)")


class PaginationInfo(BaseModel):
    """Pagination metadata."""
    total: int = Field(description="Total number of items")
    page: int = Field(description="Current page number (1-indexed)")
    page_size: int = Field(description="Number of items per page")
    total_pages: int = Field(description="Total number of pages")
    has_next: bool = Field(description="Whether there is a next page")
    has_prev: bool = Field(description="Whether there is a previous page")


class FileSearchResultPaginated(BaseModel):
    """Paginated search results for workspace files."""
    found: int = Field(description="Number of files found")
    files: List[FileSearchItem] = Field(description="List of matching files")
    pagination: PaginationInfo = Field(description="Pagination information")


class FileListResultPaginated(BaseModel):
    """Paginated list of files in a folder."""
    count: int = Field(description="Number of files in this page")
    total: int = Field(description="Total number of files")
    folder: str = Field(description="Folder path")
    files: List[FileSearchItem] = Field(description="List of files")
    pagination: PaginationInfo = Field(description="Pagination information")


class FileMetadata(BaseModel):
    """File metadata without content."""
    id: str = Field(description="File ID")
    file_name: str = Field(description="File name")
    file_type: str = Field(description="MIME type")
    size_bytes: int = Field(description="File size in bytes")
    folder: Optional[str] = Field(default=None, description="Folder path")
    tags: List[str] = Field(default_factory=list, description="File tags")
    description: Optional[str] = Field(default=None, description="File description")
    has_text_content: bool = Field(description="Whether file has extracted text")
    created: str = Field(description="Creation timestamp (ISO 8601)")
    updated: str = Field(description="Last update timestamp (ISO 8601)")


class FileWriteResult(BaseModel):
    """Result of file write operation."""
    success: bool = Field(description="Whether operation succeeded")
    message: str = Field(description="Success or error message")
    file_id: str = Field(description="File ID")
    file_name: str = Field(description="File name")
    file_path: Optional[str] = Field(default=None, description="Full file path")
    size_bytes: int = Field(description="File size in bytes")


async def search_workspace_files(
    ctx: RunContext[UnifiedDeps],
    query: str,
    page: int = 1,
    page_size: int = 20
) -> str:
    """Search user's uploaded files by name or content with pagination.
    
    Use this when the user asks about their files, documents, or uploaded content.
    Use "*" or empty string to list all files. Supports pagination for large result sets.
    
    Args:
        query: Search query (matches filename or extracted text, use "*" to get all files)
        page: Page number (1-indexed, default: 1)
        page_size: Number of results per page (default: 20, max: 100)
    
    Returns:
        JSON string with paginated matching files (structured as FileSearchResultPaginated)
    
    Examples:
        - User: "Find my project proposal"
        - User: "Do I have any PDFs about machine learning?"
        - User: "Show me all my files" (query: "*")
        - User: "Show me more results" (page: 2)
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        # Validate and cap page_size
        page_size = min(max(1, page_size), 100)
        page = max(1, page)
        offset = (page - 1) * page_size
        
        # Get total count
        total_results = await _search_files_service(user_id, query, limit=None, count_only=True)
        total_count = total_results if isinstance(total_results, int) else 0
        
        # Get paginated results
        results = await _search_files_service(user_id, query, limit=page_size, offset=offset)
        
        if not results:
            # Return empty result set
            pagination = PaginationInfo(
                total=0,
                page=1,
                page_size=page_size,
                total_pages=0,
                has_next=False,
                has_prev=False
            )
            result = FileSearchResultPaginated(found=0, files=[], pagination=pagination)
            return result.model_dump_json(indent=2)
        
        # Format results with Pydantic models
        files = []
        for row in results:
            uploaded_str = row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else str(row['created_at'])
            file_item = FileSearchItem(
                id=str(row['id']),
                name=row['file_name'],
                type=row['file_type'],
                size_bytes=row['file_size'],
                folder=row.get('folder'),
                tags=row.get('tags') or [],
                uploaded=uploaded_str
            )
            files.append(file_item)
        
        # Calculate pagination info
        total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 0
        pagination = PaginationInfo(
            total=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1
        )
        
        result = FileSearchResultPaginated(found=total_count, files=files, pagination=pagination)
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error searching workspace files: {e}", exc_info=True)
        error = ErrorResponse(error="search_failed", details=str(e))
        return error.model_dump_json(indent=2)


async def get_file_content(
    ctx: RunContext[UnifiedDeps],
    file_id: str
) -> str:
    """Get full text content from an uploaded file.
    
    Use this after searching for files to read the actual content.
    Works for all text-based files (JSON, XML, TXT, MD, etc.) and files with extracted text (PDFs, documents).
    
    Args:
        file_id: UUID of the file (from search_workspace_files results)
    
    Returns:
        JSON string with full file content (structured as FileContent)
    
    Examples:
        - After user asks "What's in my project proposal PDF?"
        - After finding relevant files and needing to read them
        - After user asks "Show me the contents of that JSON file"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        file_data = await _get_file_content_service(user_id, file_id)
        
        if not file_data:
            error = ErrorResponse(
                error="file_not_found",
                details=f"File not found or access denied (file_id: {file_id})"
            )
            return error.model_dump_json(indent=2)
        
        content = file_data.get('extracted_text', '')
        
        # If no extracted text, check if it's a text-based file and try to fetch from storage
        if not content:
            file_type = file_data.get('file_type', '').lower()
            storage_url = file_data.get('storage_url', '')
            
            # List of text-based MIME types
            text_based_types = [
                'text/', 'application/json', 'application/xml', 'application/yaml',
                'application/x-yaml', 'application/javascript', 'application/typescript',
                'application/x-sh', 'application/x-python', 'application/sql'
            ]
            
            is_text_file = any(file_type.startswith(t) for t in text_based_types)
            
            if is_text_file and storage_url:
                try:
                    # Fetch content from storage URL using requests (same pattern as Firebase upload)
                    # Run in thread pool to avoid blocking async event loop
                    import requests
                    import asyncio
                    
                    def fetch_text():
                        response = requests.get(storage_url, timeout=30)
                        if response.status_code == 200:
                            return response.text
                        else:
                            raise Exception(f"HTTP {response.status_code}")
                    
                    content = await asyncio.to_thread(fetch_text)
                    
                except Exception as fetch_error:
                    logger.error(f"Error fetching file content from {storage_url}: {fetch_error}")
                    error = ErrorResponse(
                        error="fetch_failed",
                        details=f"Unable to fetch file content from storage: {str(fetch_error)}"
                    )
                    return error.model_dump_json(indent=2)
            else:
                # Not a text file and no extracted text
                error = ErrorResponse(
                    error="no_text_content",
                    details=f"File '{file_data['file_name']}' is a {file_type} with no extracted text content. It may be an image or binary file."
                )
                return error.model_dump_json(indent=2)
        
        # Return full content without truncation
        result = FileContent(
            file_name=file_data['file_name'],
            file_type=file_data['file_type'],
            folder=file_data.get('folder'),
            size_bytes=file_data.get('file_size', 0),
            content=content,
            content_length=len(content)
        )
        
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error getting file content for {file_id}: {e}", exc_info=True)
        error = ErrorResponse(error="retrieval_failed", details="Unable to retrieve file content")
        return error.model_dump_json(indent=2)


async def search_workspace_notes(
    ctx: RunContext[UnifiedDeps],
    query: str,
    limit: int = 10
) -> str:
    """Search user's personal notes.
    
    Use this when the user asks about their notes or saved information.
    Use "*" or empty string to list all notes.
    
    Args:
        query: Search query (matches title or content, use "*" to get all notes)
        limit: Maximum number of results (default 10, max 50)
    
    Returns:
        JSON string with matching notes (structured as NoteSearchResult, includes preview)
    
    Examples:
        - User: "Find my meeting notes"
        - User: "What notes do I have about the project?"
        - User: "Search my notes for todo items"
        - User: "Show me all my notes" (query: "*")
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        # Limit to max 50 results
        limit = min(limit, 50)
        
        results = await _search_notes_service(user_id, query, limit)
        
        if not results:
            # Return empty result set
            result = NoteSearchResult(found=0, notes=[])
            return result.model_dump_json(indent=2)
        
        # Format results with Pydantic models
        notes = []
        for row in results:
            # Create preview (first 200 characters)
            content_preview = row['content'][:200] + '...' if len(row['content']) > 200 else row['content']
            
            created_str = row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else str(row['created_at'])
            updated_str = row['updated_at'].isoformat() if hasattr(row['updated_at'], 'isoformat') else str(row['updated_at'])
            
            note_item = NoteSearchItem(
                id=str(row['id']),
                title=row['title'],
                preview=content_preview,
                folder=row.get('folder'),
                tags=row.get('tags') or [],
                created=created_str,
                updated=updated_str
            )
            notes.append(note_item)
        
        result = NoteSearchResult(found=len(notes), notes=notes)
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error searching workspace notes: {e}", exc_info=True)
        error = ErrorResponse(error="search_failed", details=str(e))
        return error.model_dump_json(indent=2)


async def get_note_content(
    ctx: RunContext[UnifiedDeps],
    note_id: str
) -> str:
    """Get full content of a personal note.
    
    Use this after searching for notes to read the complete content.
    
    Args:
        note_id: UUID of the note (from search_workspace_notes results)
    
    Returns:
        JSON string with full note content (structured as NoteContent)
    
    Examples:
        - After user asks "Read my meeting notes from yesterday"
        - After finding relevant notes and needing full content
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        note_data = await _get_note_content_service(user_id, note_id)
        
        if not note_data:
            error = ErrorResponse(
                error="note_not_found",
                details=f"Note not found or access denied (note_id: {note_id})"
            )
            return error.model_dump_json(indent=2)
        
        # Return full content without truncation
        content = note_data['content']
        
        created_str = note_data['created_at'].isoformat() if hasattr(note_data['created_at'], 'isoformat') else str(note_data['created_at'])
        updated_str = note_data['updated_at'].isoformat() if hasattr(note_data['updated_at'], 'isoformat') else str(note_data['updated_at'])
        
        result = NoteContent(
            title=note_data['title'],
            folder=note_data.get('folder'),
            tags=note_data.get('tags') or [],
            content=content,
            content_length=len(content),
            created=created_str,
            updated=updated_str
        )
        
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error getting note content for {note_id}: {e}", exc_info=True)
        error = ErrorResponse(error="retrieval_failed", details="Unable to retrieve note content")
        return error.model_dump_json(indent=2)


# ============================================================================
# Folder Management Tools
# ============================================================================

async def list_folders(
    ctx: RunContext[UnifiedDeps]
) -> str:
    """List all folders in user's workspace.
    
    Use this to see the folder structure and available folders.
    
    Returns:
        JSON string with list of folders (structured as FolderListResult)
    
    Examples:
        - User: "What folders do I have?"
        - User: "Show me my workspace organization"
        - User: "List all my folders"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        folders_data = await _list_folders_service(user_id)
        
        folders = []
        for folder_info in folders_data:
            folder_item = FolderItem(
                name=folder_info['name'],
                path=folder_info['path'],
                file_count=folder_info.get('file_count', 0),
                created=folder_info.get('created')
            )
            folders.append(folder_item)
        
        result = FolderListResult(count=len(folders), folders=folders)
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error listing folders: {e}", exc_info=True)
        error = ErrorResponse(error="list_failed", details=str(e))
        return error.model_dump_json(indent=2)


async def create_folder(
    ctx: RunContext[UnifiedDeps],
    folder_name: str,
    parent_path: Optional[str] = None
) -> str:
    """Create a new folder in user's workspace.
    
    Use this when user wants to organize files into a new folder.
    
    Args:
        folder_name: Name of the folder to create
        parent_path: Optional parent folder path (e.g., "projects/2024")
    
    Returns:
        JSON string with operation result (structured as FolderOperationResult)
    
    Examples:
        - User: "Create a folder called 'meeting-notes'"
        - User: "Make a new folder for my project documents"
        - User: "Create a subfolder 'Q1' in 'reports'"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        result_data = await _create_folder_service(user_id, folder_name, parent_path)
        
        result = FolderOperationResult(
            success=True,
            message=f"Folder '{folder_name}' created successfully",
            folder_name=folder_name,
            folder_path=result_data.get('path', folder_name)
        )
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error creating folder '{folder_name}': {e}", exc_info=True)
        error = ErrorResponse(error="create_failed", details=str(e))
        return error.model_dump_json(indent=2)


async def rename_folder(
    ctx: RunContext[UnifiedDeps],
    old_name: str,
    new_name: str
) -> str:
    """Rename an existing folder in user's workspace.
    
    Use this when user wants to rename a folder.
    
    Args:
        old_name: Current folder name or path
        new_name: New folder name
    
    Returns:
        JSON string with operation result (structured as FolderOperationResult)
    
    Examples:
        - User: "Rename the 'temp' folder to 'archive'"
        - User: "Change folder name from 'old-project' to 'new-project'"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        result_data = await _rename_folder_service(user_id, old_name, new_name)
        
        result = FolderOperationResult(
            success=True,
            message=f"Folder renamed from '{old_name}' to '{new_name}'",
            folder_name=new_name,
            folder_path=result_data.get('path', new_name)
        )
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error renaming folder '{old_name}' to '{new_name}': {e}", exc_info=True)
        error = ErrorResponse(error="rename_failed", details=str(e))
        return error.model_dump_json(indent=2)


async def delete_folder(
    ctx: RunContext[UnifiedDeps],
    folder_name: str,
    delete_files: bool = False
) -> str:
    """Delete a folder from user's workspace.
    
    Use this when user wants to remove a folder.
    IMPORTANT: By default, only empty folders can be deleted.
    Set delete_files=True to delete folder with its contents.
    
    Args:
        folder_name: Name or path of the folder to delete
        delete_files: Whether to delete files inside folder (default: False)
    
    Returns:
        JSON string with operation result (structured as FolderOperationResult)
    
    Examples:
        - User: "Delete the empty 'temp' folder"
        - User: "Remove the 'archive' folder and all its files"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        await _delete_folder_service(user_id, folder_name, delete_files)
        
        result = FolderOperationResult(
            success=True,
            message=f"Folder '{folder_name}' deleted successfully",
            folder_name=folder_name
        )
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error deleting folder '{folder_name}': {e}", exc_info=True)
        error = ErrorResponse(error="delete_failed", details=str(e))
        return error.model_dump_json(indent=2)


# ============================================================================
# File Management Tools
# ============================================================================

async def list_files(
    ctx: RunContext[UnifiedDeps],
    folder: Optional[str] = None,
    recursive: bool = False,
    max_depth: int = 10,
    page: int = 1,
    page_size: int = 50
) -> str:
    """List files in a folder with pagination and optional recursive traversal.
    
    Use this to browse files in your workspace. Can list files in a specific folder
    or recursively across all subfolders.
    
    Args:
        folder: Folder path (None or 'root' for root folder, omit for entire workspace)
        recursive: If True, include files from all subfolders (default: False)
        max_depth: Maximum folder depth when recursive=True (default: 10, max: 20)
        page: Page number (1-indexed, default: 1)
        page_size: Number of files per page (default: 50, max: 500)
    
    Returns:
        JSON string with paginated files list (structured as FileListResultPaginated)
    
    Examples:
        - User: "Show me files in the 'projects' folder"
        - User: "What's in my root folder?"
        - User: "List all files in my workspace" (recursive=True)
        - User: "Show me all files in 'documents' and its subfolders" (recursive=True)
        - User: "Show me more files" (page: 2)
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        # Normalize folder name
        folder_path = folder if folder and folder.lower() != 'root' else None
        
        # Validate and cap parameters
        page_size = min(max(1, page_size), 500)
        page = max(1, page)
        offset = (page - 1) * page_size
        
        if recursive:
            # Recursive listing
            max_depth = min(max(1, max_depth), 20)
            
            # Get total count
            total_count = await _list_files_recursive_service(
                user_id, folder_path, max_depth, 
                limit=None, offset=0, count_only=True
            )
            
            # Get paginated results
            files_data = await _list_files_recursive_service(
                user_id, folder_path, max_depth,
                limit=page_size, offset=offset
            )
            
            folder_display = f"{folder_path or 'workspace'} (recursive)"
        else:
            # Single folder listing
            # Get total count
            total_count = await _list_files_service(user_id, folder_path, limit=None, offset=0, count_only=True)
            
            # Get paginated results
            files_data = await _list_files_service(user_id, folder_path, limit=page_size, offset=offset)
            
            folder_display = folder_path or 'root'
        
        # Format results
        files = []
        for file_info in files_data:
            uploaded_str = file_info['created_at'].isoformat() if hasattr(file_info['created_at'], 'isoformat') else str(file_info['created_at'])
            file_item = FileSearchItem(
                id=str(file_info['id']),
                name=file_info['file_name'],
                type=file_info['file_type'],
                size_bytes=file_info['file_size'],
                folder=file_info.get('folder'),
                tags=file_info.get('tags') or [],
                uploaded=uploaded_str
            )
            files.append(file_item)
        
        # Calculate pagination info
        total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 0
        pagination = PaginationInfo(
            total=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1
        )
        
        result = FileListResultPaginated(
            count=len(files),
            total=total_count,
            folder=folder_display,
            files=files,
            pagination=pagination
        )
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error listing files in folder '{folder}' (recursive={recursive}): {e}", exc_info=True)
        error = ErrorResponse(error="list_failed", details=str(e))
        return error.model_dump_json(indent=2)


async def delete_file(
    ctx: RunContext[UnifiedDeps],
    file_id: str
) -> str:
    """Delete a file from user's workspace.
    
    Use this when user wants to remove a file permanently.
    IMPORTANT: This action cannot be undone.
    
    Args:
        file_id: UUID of the file to delete
    
    Returns:
        JSON string with operation result (structured as FileOperationResult)
    
    Examples:
        - User: "Delete that old report file"
        - User: "Remove the duplicate document"
        - User: "Delete file abc-123"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        await _delete_file_service(user_id, file_id)
        
        result = FileOperationResult(
            success=True,
            message=f"File deleted successfully",
            file_id=file_id
        )
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error deleting file {file_id}: {e}", exc_info=True)
        error = ErrorResponse(error="delete_failed", details=str(e))
        return error.model_dump_json(indent=2)


async def rename_file(
    ctx: RunContext[UnifiedDeps],
    file_id: str,
    new_name: str
) -> str:
    """Rename a file in user's workspace.
    
    Use this when user wants to change a file's name.
    
    Args:
        file_id: UUID of the file to rename
        new_name: New file name (including extension)
    
    Returns:
        JSON string with operation result (structured as FileOperationResult)
    
    Examples:
        - User: "Rename that file to 'final-report.pdf'"
        - User: "Change the document name to 'presentation-v2.pptx'"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        result_data = await _rename_file_service(user_id, file_id, new_name)
        
        result = FileOperationResult(
            success=True,
            message=f"File renamed to '{new_name}'",
            file_id=file_id,
            file_name=new_name
        )
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error renaming file {file_id} to '{new_name}': {e}", exc_info=True)
        error = ErrorResponse(error="rename_failed", details=str(e))
        return error.model_dump_json(indent=2)


async def move_file(
    ctx: RunContext[UnifiedDeps],
    file_id: str,
    target_folder: str
) -> str:
    """Move a file to a different folder.
    
    Use this when user wants to reorganize files into folders.
    
    Args:
        file_id: UUID of the file to move
        target_folder: Target folder path (use 'root' or None for root folder)
    
    Returns:
        JSON string with operation result (structured as FileOperationResult)
    
    Examples:
        - User: "Move that PDF to the 'archive' folder"
        - User: "Put this file in 'projects/2024'"
        - User: "Move the document to root"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        # Normalize folder name
        folder_path = target_folder if target_folder and target_folder.lower() != 'root' else None
        
        result_data = await _move_file_service(user_id, file_id, folder_path)
        
        result = FileOperationResult(
            success=True,
            message=f"File moved to '{folder_path or 'root'}' folder",
            file_id=file_id,
            new_path=folder_path or 'root'
        )
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error moving file {file_id} to '{target_folder}': {e}", exc_info=True)
        error = ErrorResponse(error="move_failed", details=str(e))
        return error.model_dump_json(indent=2)


async def get_file_metadata(
    ctx: RunContext[UnifiedDeps],
    file_id: str
) -> str:
    """Get file metadata without downloading full content.
    
    Use this to check file properties before reading content.
    Faster than get_file_content_tool for metadata-only queries.
    
    Args:
        file_id: UUID of the file
    
    Returns:
        JSON string with file metadata (structured as FileMetadata)
    
    Examples:
        - User: "What type of file is that?"
        - User: "When was this file uploaded?"
        - User: "Check the file size"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        metadata = await _get_file_metadata_service(user_id, file_id)
        
        if not metadata:
            error = ErrorResponse(
                error="file_not_found",
                details=f"File not found or access denied (file_id: {file_id})"
            )
            return error.model_dump_json(indent=2)
        
        created_str = metadata['created_at'].isoformat() if hasattr(metadata['created_at'], 'isoformat') else str(metadata['created_at'])
        updated_str = metadata['updated_at'].isoformat() if hasattr(metadata['updated_at'], 'isoformat') else str(metadata['updated_at'])
        
        result = FileMetadata(
            id=str(metadata['id']),
            file_name=metadata['file_name'],
            file_type=metadata['file_type'],
            size_bytes=metadata['file_size'],
            folder=metadata.get('folder'),
            tags=metadata.get('tags') or [],
            description=metadata.get('description'),
            has_text_content=bool(metadata.get('has_text_content')),
            created=created_str,
            updated=updated_str
        )
        
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error getting file metadata for {file_id}: {e}", exc_info=True)
        error = ErrorResponse(error="metadata_failed", details="Unable to retrieve file metadata")
        return error.model_dump_json(indent=2)


# ============================================================================
# File Read/Write Tools
# ============================================================================

async def create_text_file(
    ctx: RunContext[UnifiedDeps],
    file_name: str,
    content: str,
    folder: Optional[str] = None,
    tags: Optional[List[str]] = None,
    description: Optional[str] = None
) -> str:
    """Create a new text file in user's workspace.
    
    Use this to save text content, notes, or generated documents.
    Supports plain text, markdown, JSON, CSV, and other text formats.
    
    Args:
        file_name: Name of the file (must include extension, e.g., 'notes.txt', 'data.json')
        content: Text content to write
        folder: Optional folder path to save file in
        tags: Optional list of tags
        description: Optional file description
    
    Returns:
        JSON string with creation result (structured as FileWriteResult)
    
    Examples:
        - User: "Create a file called 'meeting-summary.txt' with my notes"
        - User: "Save this data as 'results.json' in the 'analysis' folder"
        - User: "Write a markdown file with the documentation"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        # Normalize folder
        folder_path = folder if folder and folder.lower() != 'root' else None
        
        # Validate file name
        if not file_name or '/' in file_name:
            error = ErrorResponse(
                error="invalid_filename",
                details="File name cannot be empty or contain '/'"
            )
            return error.model_dump_json(indent=2)
        
        # Create file
        result_data = await _create_text_file_service(
            user_id=user_id,
            file_name=file_name,
            content=content,
            folder=folder_path,
            tags=tags or [],
            description=description or ""
        )
        
        result = FileWriteResult(
            success=True,
            message=f"File '{file_name}' created successfully",
            file_id=str(result_data['id']),
            file_name=result_data['file_name'],
            file_path=result_data.get('folder'),
            size_bytes=result_data['file_size']
        )
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error creating text file '{file_name}': {e}", exc_info=True)
        error = ErrorResponse(error="create_failed", details=str(e))
        return error.model_dump_json(indent=2)


async def update_file_content(
    ctx: RunContext[UnifiedDeps],
    file_id: str,
    content: str,
    append: bool = False,
    file_name: str = ""
) -> str:
    """Update content of an existing text file.
    
    Use this to modify or append to text files in the workspace.
    Only works with text files (plain text, markdown, JSON, CSV, etc.).
    
    Args:
        file_id: UUID of the file to update
        content: New content or content to append
        append: If True, append to existing content; if False, replace (default: False)
        file_name: Optional filename for display (if you know the filename, provide it for better UI feedback)
    
    Returns:
        JSON string with update result (structured as FileWriteResult)
    
    Examples:
        - User: "Update that text file with the new information"
        - User: "Append this log entry to the file"
        - User: "Replace the content of notes.txt"
    """
    user_id = ctx.deps.user_id
    if not user_id:
        error = ErrorResponse(error="authentication_required", details="User ID not available")
        return error.model_dump_json(indent=2)
    
    try:
        result_data = await _update_file_content_service(
            user_id=user_id,
            file_id=file_id,
            content=content,
            append=append
        )
        
        result = FileWriteResult(
            success=True,
            message=f"File {'updated' if not append else 'appended'} successfully",
            file_id=str(result_data['id']),
            file_name=result_data['file_name'],
            file_path=result_data.get('folder'),
            size_bytes=result_data['file_size']
        )
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error updating file content for {file_id}: {e}", exc_info=True)
        error = ErrorResponse(error="update_failed", details=str(e))
        return error.model_dump_json(indent=2)