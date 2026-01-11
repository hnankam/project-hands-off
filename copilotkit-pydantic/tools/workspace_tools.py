"""Workspace tools for AI agent to access user's personal resources."""

from typing import List, Optional, Any
from functools import wraps
from pydantic import BaseModel, Field, field_validator
from pydantic_ai import RunContext
import httpx

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
# Constants
# ============================================================================

# Content limits
MAX_CONTENT_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_CONTENT_WARNING_BYTES = 10 * 1024 * 1024  # 10 MB (warn but allow)
NOTE_PREVIEW_LENGTH = 200

# Pagination limits
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE_SEARCH = 100
MAX_PAGE_SIZE_LIST = 500
DEFAULT_FILE_LIST_PAGE_SIZE = 50

# Tag and description limits
MAX_TAGS = 3
MAX_DESCRIPTION_LENGTH = 50

# Request timeout
HTTP_TIMEOUT_SECONDS = 30

# Edit and grep limits
MAX_EDIT_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_GREP_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_GREP_FILES = 50
MAX_GREP_MATCHES_PER_FILE = 100
REGEX_TIMEOUT_SECONDS = 2.0
MAX_REGEX_PATTERN_LENGTH = 200


# ============================================================================
# Base Models (used by helpers)
# ============================================================================

class ErrorResponse(BaseModel):
    """Error response for tool failures."""
    error: str = Field(description="Error type or message")
    details: Optional[str] = Field(default=None, description="Additional error details")


# ============================================================================
# Helper Functions
# ============================================================================

def format_timestamp(dt: Any) -> str:
    """Convert a datetime object to ISO 8601 string format.
    
    Args:
        dt: Datetime object or string
        
    Returns:
        ISO 8601 formatted string
    """
    return dt.isoformat() if hasattr(dt, 'isoformat') else str(dt)


def require_auth(func):
    """Decorator to check authentication before executing function.
    
    Returns error response if user is not authenticated.
    """
    @wraps(func)
    async def wrapper(ctx: RunContext[UnifiedDeps], *args, **kwargs):
        user_id = ctx.deps.user_id
        if not user_id:
            error = ErrorResponse(
                error="authentication_required",
                details="User ID not available"
            )
            return error.model_dump_json(indent=2)
        return await func(ctx, *args, **kwargs)
    return wrapper


def handle_errors(error_type: str = "operation_failed"):
    """Decorator to handle exceptions and return consistent error responses.
    
    Args:
        error_type: Default error type for generic exceptions
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                # Get function name for logging
                func_name = func.__name__
                logger.error(f"Error in {func_name}: {e}", exc_info=True)
                
                error = ErrorResponse(error=error_type, details=str(e))
                return error.model_dump_json(indent=2)
        return wrapper
    return decorator


def validate_tags(tags: Optional[List[str]]) -> List[str]:
    """Validate and limit tags list.
    
    Args:
        tags: Optional list of tags
        
    Returns:
        Validated tags list (max MAX_TAGS items)
    """
    if not tags:
        return []
    
    # Limit to MAX_TAGS and filter empty strings
    validated = [tag.strip() for tag in tags if tag and tag.strip()][:MAX_TAGS]
    return validated


def validate_description(description: Optional[str]) -> str:
    """Validate and truncate description.
    
    Args:
        description: Optional description string
        
    Returns:
        Validated description (max MAX_DESCRIPTION_LENGTH chars)
    """
    if not description:
        return ""
    
    desc = description.strip()
    if len(desc) > MAX_DESCRIPTION_LENGTH:
        logger.warning(f"Description truncated from {len(desc)} to {MAX_DESCRIPTION_LENGTH} chars")
        return desc[:MAX_DESCRIPTION_LENGTH]
    
    return desc


async def fetch_from_storage_url(storage_url: str) -> str:
    """Fetch text content from storage URL using async HTTP client.
    
    Args:
        storage_url: URL to fetch from
        
    Returns:
        Text content from URL
        
    Raises:
        Exception: If fetch fails or URL is invalid
    """
    # Basic URL validation (ensure it's a reasonable URL)
    if not storage_url.startswith(('http://', 'https://')):
        raise ValueError(f"Invalid storage URL protocol: {storage_url}")
    
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.get(storage_url)
        response.raise_for_status()
        return response.text


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


class FileContentWithLines(BaseModel):
    """File content with line number information."""
    file_name: str = Field(description="File name")
    file_type: str = Field(description="MIME type")
    folder: Optional[str] = Field(default=None, description="Folder path")
    size_bytes: int = Field(description="Original file size")
    content: str = Field(description="Full text content")
    lines: List[str] = Field(description="Content split by lines")
    line_count: int = Field(description="Total number of lines")
    content_length: int = Field(description="Length of content in characters")


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


class FolderItem(BaseModel):
    """Individual folder information."""
    name: str = Field(description="Folder name")
    path: str = Field(description="Full folder path")
    file_count: int = Field(default=0, description="Number of files in folder")
    folder_count: int = Field(default=0, description="Number of subfolders in folder")
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


class EditResult(BaseModel):
    """Result of file edit operation."""
    success: bool = Field(description="Whether edit succeeded")
    message: str = Field(description="Success or error message")
    file_id: str = Field(description="File ID")
    file_name: str = Field(description="File name")
    matches_found: int = Field(description="Number of matches found")
    replacements_made: int = Field(description="Number of replacements made")
    size_bytes: int = Field(description="New file size in bytes")
    preview: str = Field(description="Preview of modified content (first 200 chars)")


class GrepMatch(BaseModel):
    """Individual match in grep results."""
    line_number: int = Field(description="Line number (1-indexed)")
    line_content: str = Field(description="Full line content")
    match_position: int = Field(description="Character position in line where match starts")
    before_context: List[str] = Field(default_factory=list, description="Lines before match")
    after_context: List[str] = Field(default_factory=list, description="Lines after match")


class GrepFileResult(BaseModel):
    """Grep results for a single file."""
    file_id: str = Field(description="File UUID")
    file_name: str = Field(description="File name")
    folder: Optional[str] = Field(default=None, description="Folder path")
    match_count: int = Field(description="Number of matches in this file")
    matches: List[GrepMatch] = Field(description="List of matches with context")


class GrepResult(BaseModel):
    """Aggregated grep search results."""
    total_files_searched: int = Field(description="Total files searched")
    files_with_matches: int = Field(description="Files containing matches")
    total_matches: int = Field(description="Total matches found across all files")
    results: List[GrepFileResult] = Field(description="Per-file results")
    truncated: bool = Field(description="Whether results were truncated due to limits")


@require_auth
async def search_workspace_files(
    ctx: RunContext[UnifiedDeps],
    query: str,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE
) -> str:
    """Search user's uploaded files by name or content.
    
    WHEN TO USE:
    - User requests to find, search, or locate their files
    - User asks about existence of documents
    - User wants to list all their files (use query="*")
    
    PARAMETERS:
    - query (required): Search text matching filename or content. Use "*" for all files.
    - page (optional): Page number starting at 1. Default: 1
    - page_size (optional): Results per page, 1-100. Default: 20
    
    RETURNS:
    JSON with found files count, file list (id, name, type, size_bytes, folder, tags, uploaded), 
    and pagination info (total, page, page_size, total_pages, has_next, has_prev).
    
    PAGINATION:
    - Check has_next=true to fetch more results
    - Increment page parameter to get next page
    - Total items available in pagination.total
    """
    user_id = ctx.deps.user_id
    
    try:
        # Validate and cap page_size
        page_size = min(max(1, page_size), MAX_PAGE_SIZE_SEARCH)
        page = max(1, page)
        offset = (page - 1) * page_size
        
        # NOTE: Service layer optimization opportunity - combine count and results
        # in a single query using SQL window function COUNT(*) OVER()
        # to reduce database round trips
        
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
            file_item = FileSearchItem(
                id=str(row['id']),
                name=row['file_name'],
                type=row['file_type'],
                size_bytes=row['file_size'],
                folder=row.get('folder'),
                tags=row.get('tags') or [],
                uploaded=format_timestamp(row['created_at'])
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


@require_auth
async def get_file_content(
    ctx: RunContext[UnifiedDeps],
    file_id: str
) -> str:
    """Retrieve full text content from a file.
    
    WHEN TO USE:
    - After search_workspace_files to read file contents
    - User asks "what's in" or "show me contents of" a file
    - Need to analyze or process file data
    
    PARAMETERS:
    - file_id (required): File UUID from search results
    
    RETURNS:
    JSON with file_name, file_type, folder, size_bytes, content (full text), content_length.
    
    CONTENT SIZE LIMITS:
    - Files >50MB: Rejected with error "content_too_large"
    - Files >10MB: Warning logged but returned
    - Text-based files (JSON, XML, TXT, MD, etc.): Direct content
    - Binary files with extraction (PDF, DOCX): Extracted text
    
    ERROR CASES:
    - file_not_found: Invalid file_id or access denied
    - no_text_content: Binary file without extracted text
    - fetch_failed: Cannot retrieve from storage
    - content_too_large: Exceeds 50MB limit
    """
    user_id = ctx.deps.user_id
    
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
                    # Fetch content from storage URL using async HTTP client
                    content = await fetch_from_storage_url(storage_url)
                    
                except Exception as fetch_error:
                    logger.error(f"Error fetching file content: {fetch_error}")
                    error = ErrorResponse(
                        error="fetch_failed",
                        details="Unable to fetch file content from storage"
                    )
                    return error.model_dump_json(indent=2)
            else:
                # Not a text file and no extracted text
                error = ErrorResponse(
                    error="no_text_content",
                    details=f"File '{file_data['file_name']}' is a {file_type} with no extracted text content. It may be an image or binary file."
                )
                return error.model_dump_json(indent=2)
        
        # Check content size and warn if large
        content_size = len(content.encode('utf-8'))
        if content_size > MAX_CONTENT_SIZE_BYTES:
            error = ErrorResponse(
                error="content_too_large",
                details=f"File content exceeds maximum size limit ({MAX_CONTENT_SIZE_BYTES / (1024*1024):.0f}MB)"
            )
            return error.model_dump_json(indent=2)
        elif content_size > MAX_CONTENT_WARNING_BYTES:
            logger.warning(
                f"Large file content returned: {content_size / (1024*1024):.1f}MB "
                f"for file {file_id}"
            )
        
        # Return full content
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


@require_auth
async def read_file(
    ctx: RunContext[UnifiedDeps],
    file_id: str,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None
) -> str:
    """Read file content with line numbers and optional range.
    
    WHEN TO USE:
    - User requests to read or view file with line numbers
    - Need specific line range from file
    - Want structured line-by-line content
    
    PARAMETERS:
    - file_id (required): File UUID from search or list results
    - start_line (optional): First line to return (1-indexed). Default: 1
    - end_line (optional): Last line to return (inclusive). Default: last line
    
    RETURNS:
    JSON with file_name, file_type, folder, size_bytes, content (full text),
    lines array (each line as string), line_count (total lines).
    
    LINE RANGE:
    - start_line=10, end_line=20: Returns lines 10-20 (inclusive)
    - start_line=10, end_line=None: Returns from line 10 to end
    - start_line=None, end_line=50: Returns first 50 lines
    - Both None: Returns all lines
    
    CONTENT SIZE LIMITS:
    - Files >50MB: Rejected with error
    - Files >10MB: Warning logged
    
    ERROR CASES:
    - file_not_found: Invalid file_id or access denied
    - no_text_content: Binary file without extracted text
    - invalid_range: start_line > end_line or out of bounds
    """
    user_id = ctx.deps.user_id
    
    try:
        file_data = await _get_file_content_service(user_id, file_id)
        
        if not file_data:
            error = ErrorResponse(
                error="file_not_found",
                details=f"File not found or access denied (file_id: {file_id})"
            )
            return error.model_dump_json(indent=2)
        
        content = file_data.get('extracted_text', '')
        
        # If no extracted text, try to fetch from storage
        if not content:
            file_type = file_data.get('file_type', '').lower()
            storage_url = file_data.get('storage_url', '')
            
            text_based_types = [
                'text/', 'application/json', 'application/xml', 'application/yaml',
                'application/x-yaml', 'application/javascript', 'application/typescript',
                'application/x-sh', 'application/x-python', 'application/sql'
            ]
            
            is_text_file = any(file_type.startswith(t) for t in text_based_types)
            
            if is_text_file and storage_url:
                try:
                    content = await fetch_from_storage_url(storage_url)
                except Exception as fetch_error:
                    logger.error(f"Error fetching file content: {fetch_error}")
                    error = ErrorResponse(
                        error="fetch_failed",
                        details="Unable to fetch file content from storage"
                    )
                    return error.model_dump_json(indent=2)
            else:
                error = ErrorResponse(
                    error="no_text_content",
                    details=f"File '{file_data['file_name']}' is a {file_type} with no extracted text content."
                )
                return error.model_dump_json(indent=2)
        
        # Check content size
        content_size = len(content.encode('utf-8'))
        if content_size > MAX_CONTENT_SIZE_BYTES:
            error = ErrorResponse(
                error="content_too_large",
                details=f"File content exceeds maximum size limit ({MAX_CONTENT_SIZE_BYTES / (1024*1024):.0f}MB)"
            )
            return error.model_dump_json(indent=2)
        elif content_size > MAX_CONTENT_WARNING_BYTES:
            logger.warning(f"Large file content returned: {content_size / (1024*1024):.1f}MB for file {file_id}")
        
        # Split into lines
        lines = content.splitlines()
        total_lines = len(lines)
        
        # Validate and apply line range
        if start_line is not None or end_line is not None:
            # Convert to 0-indexed
            start_idx = (start_line - 1) if start_line is not None else 0
            end_idx = end_line if end_line is not None else total_lines
            
            # Validate range
            if start_idx < 0 or end_idx < 0:
                error = ErrorResponse(
                    error="invalid_range",
                    details="Line numbers must be positive"
                )
                return error.model_dump_json(indent=2)
            
            if start_line is not None and end_line is not None and start_line > end_line:
                error = ErrorResponse(
                    error="invalid_range",
                    details=f"start_line ({start_line}) cannot be greater than end_line ({end_line})"
                )
                return error.model_dump_json(indent=2)
            
            # Apply range
            lines = lines[start_idx:end_idx]
        
        # Return with line information
        result = FileContentWithLines(
            file_name=file_data['file_name'],
            file_type=file_data['file_type'],
            folder=file_data.get('folder'),
            size_bytes=file_data.get('file_size', 0),
            content=content,
            lines=lines,
            line_count=total_lines,
            content_length=len(content)
        )
        
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error reading file {file_id}: {e}", exc_info=True)
        error = ErrorResponse(error="retrieval_failed", details="Unable to read file")
        return error.model_dump_json(indent=2)


@require_auth
async def glob_files(
    ctx: RunContext[UnifiedDeps],
    pattern: str,
    folder: Optional[str] = None,
    case_sensitive: bool = False,
    page: int = 1,
    page_size: int = DEFAULT_FILE_LIST_PAGE_SIZE
) -> str:
    """Find files matching glob pattern.
    
    WHEN TO USE:
    - User wants files matching pattern (*.py, **/*.json, test_*)
    - Need to select multiple files by name pattern
    - Want to filter files before operations
    
    PARAMETERS:
    - pattern (required): Glob pattern to match filenames
      * "*": Matches any characters except /
      * "**": Matches any characters including / (recursive)
      * "?": Matches single character
      * "[abc]": Matches any character in brackets
      * "[!abc]": Matches any character NOT in brackets
    - folder (optional): Root folder to search. None for all folders.
    - case_sensitive (optional): Case-sensitive matching. Default: False
    - page (optional): Page number starting at 1. Default: 1
    - page_size (optional): Results per page, 1-500. Default: 50
    
    RETURNS:
    JSON with count, total, folder, files array (id, name, type, size_bytes, folder, tags, uploaded),
    pagination info (total, page, page_size, total_pages, has_next, has_prev).
    
    PATTERN EXAMPLES:
    - "*.py": All Python files in specified folder
    - "**/*.json": All JSON files recursively
    - "test_*.py": Python files starting with "test_"
    - "data/[0-9]*.csv": CSV files starting with digit in data folder
    - "**/*[!test].js": JS files NOT ending with "test"
    
    PERFORMANCE:
    - Simple patterns (*.ext) are optimized with SQL
    - Complex patterns require full scan and filtering
    - Recursive patterns (**) scan entire subtree
    
    ERROR CASES:
    - invalid_pattern: Malformed glob pattern
    """
    user_id = ctx.deps.user_id
    
    try:
        import fnmatch
        from pathlib import Path
        
        # Validate pattern
        if not pattern or not pattern.strip():
            error = ErrorResponse(
                error="invalid_pattern",
                details="Pattern cannot be empty"
            )
            return error.model_dump_json(indent=2)
        
        # Normalize folder
        folder_path = folder if folder and folder.lower() != 'root' else None
        
        # Validate and cap parameters
        page_size = min(max(1, page_size), MAX_PAGE_SIZE_LIST)
        page = max(1, page)
        
        # Determine if recursive search is needed
        is_recursive = '**' in pattern
        
        # Get files to search
        if is_recursive:
            # Recursive search
            files_data = await _list_files_recursive_service(
                user_id, folder_path, max_depth=20,
                limit=None, offset=0
            )
        else:
            # Single folder search
            files_data = await _list_files_service(
                user_id, folder_path,
                limit=None, offset=0
            )
        
        # Filter files by glob pattern
        matched_files = []
        for file_info in files_data:
            file_name = file_info['file_name']
            file_folder = file_info.get('folder', '')
            
            # Construct full path for matching
            if file_folder:
                full_path = f"{file_folder}/{file_name}"
            else:
                full_path = file_name
            
            # Apply glob matching
            if case_sensitive:
                matches = fnmatch.fnmatch(full_path, pattern) or fnmatch.fnmatch(file_name, pattern)
            else:
                matches = (
                    fnmatch.fnmatch(full_path.lower(), pattern.lower()) or
                    fnmatch.fnmatch(file_name.lower(), pattern.lower())
                )
            
            if matches:
                matched_files.append(file_info)
        
        total_count = len(matched_files)
        
        # Apply pagination
        offset = (page - 1) * page_size
        paginated_files = matched_files[offset:offset + page_size]
        
        # Format results
        files = []
        for file_info in paginated_files:
            file_item = FileSearchItem(
                id=str(file_info['id']),
                name=file_info['file_name'],
                type=file_info['file_type'],
                size_bytes=file_info['file_size'],
                folder=file_info.get('folder'),
                tags=file_info.get('tags') or [],
                uploaded=format_timestamp(file_info['created_at'])
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
        
        folder_display = f"{folder_path or 'workspace'} (pattern: {pattern})"
        
        result = FileListResultPaginated(
            count=len(files),
            total=total_count,
            folder=folder_display,
            files=files,
            pagination=pagination
        )
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error in glob_files with pattern '{pattern}': {e}", exc_info=True)
        error = ErrorResponse(error="glob_failed", details=str(e))
        return error.model_dump_json(indent=2)


@require_auth
async def grep_files(
    ctx: RunContext[UnifiedDeps],
    pattern: str,
    file_ids: Optional[List[str]] = None,
    glob_pattern: Optional[str] = None,
    regex: bool = False,
    case_sensitive: bool = False,
    context_lines: int = 0,
    max_matches_per_file: int = MAX_GREP_MATCHES_PER_FILE,
    max_files: int = MAX_GREP_FILES
) -> str:
    """Search for text pattern across files.
    
    WHEN TO USE:
    - User wants to find text across multiple files
    - Need line numbers and context for matches
    - Search specific files or file pattern
    
    PARAMETERS:
    - pattern (required): Search text or regex pattern
    - file_ids (optional): Specific file UUIDs to search
    - glob_pattern (optional): File pattern to search (*.py, **/*.json)
    - regex (optional): Treat pattern as regex. Default: False
    - case_sensitive (optional): Case-sensitive search. Default: False
    - context_lines (optional): Lines before/after match, 0-10. Default: 0
    - max_matches_per_file (optional): Limit per file. Default: 100
    - max_files (optional): Max files to search. Default: 50
    
    RETURNS:
    JSON with total_files_searched, files_with_matches, total_matches,
    results array (per file: file_id, file_name, folder, match_count, matches),
    truncated boolean (if limits were hit).
    
    Each match includes: line_number (1-indexed), line_content, match_position,
    before_context array, after_context array.
    
    SEARCH MODES:
    - Specify file_ids: Search only those files
    - Specify glob_pattern: Search files matching pattern
    - Must provide either file_ids OR glob_pattern
    
    LIMITS:
    - Max 50 files searched
    - Max 100 matches per file
    - Max 5MB file size
    - Pattern timeout: 2 seconds (regex only)
    
    ERROR CASES:
    - invalid_parameters: Must provide file_ids or glob_pattern
    - invalid_pattern: Malformed regex pattern
    - pattern_timeout: Regex took too long
    """
    user_id = ctx.deps.user_id
    
    try:
        import re
        
        # Validate parameters
        if not file_ids and not glob_pattern:
            error = ErrorResponse(
                error="invalid_parameters",
                details="Must provide either file_ids or glob_pattern"
            )
            return error.model_dump_json(indent=2)
        
        if not pattern or not pattern.strip():
            error = ErrorResponse(
                error="invalid_pattern",
                details="Pattern cannot be empty"
            )
            return error.model_dump_json(indent=2)
        
        # Validate context_lines
        context_lines = min(max(0, context_lines), 10)
        
        # Compile regex pattern if needed
        compiled_pattern = None
        if regex:
            if len(pattern) > MAX_REGEX_PATTERN_LENGTH:
                error = ErrorResponse(
                    error="invalid_pattern",
                    details=f"Regex pattern too long (max {MAX_REGEX_PATTERN_LENGTH} chars)"
                )
                return error.model_dump_json(indent=2)
            
            try:
                flags = 0 if case_sensitive else re.IGNORECASE
                compiled_pattern = re.compile(pattern, flags)
            except re.error as e:
                error = ErrorResponse(
                    error="invalid_pattern",
                    details=f"Invalid regex pattern: {str(e)}"
                )
                return error.model_dump_json(indent=2)
        
        # Get file list
        files_to_search = []
        
        if file_ids:
            # Search specific files
            for file_id in file_ids[:max_files]:
                try:
                    metadata = await _get_file_metadata_service(user_id, file_id)
                    if metadata:
                        files_to_search.append({
                            'id': metadata['id'],
                            'file_name': metadata['file_name'],
                            'folder': metadata.get('folder'),
                            'file_type': metadata['file_type'],
                            'file_size': metadata['file_size']
                        })
                except Exception as e:
                    logger.warning(f"Could not get metadata for file {file_id}: {e}")
                    continue
        
        elif glob_pattern:
            # Use glob to find files
            all_files = await _list_files_recursive_service(
                user_id, None, max_depth=20,
                limit=None, offset=0
            )
            
            import fnmatch
            matched_count = 0
            for file_info in all_files:
                if matched_count >= max_files:
                    break
                
                file_name = file_info['file_name']
                file_folder = file_info.get('folder', '')
                full_path = f"{file_folder}/{file_name}" if file_folder else file_name
                
                if case_sensitive:
                    matches = fnmatch.fnmatch(full_path, glob_pattern) or fnmatch.fnmatch(file_name, glob_pattern)
                else:
                    matches = (
                        fnmatch.fnmatch(full_path.lower(), glob_pattern.lower()) or
                        fnmatch.fnmatch(file_name.lower(), glob_pattern.lower())
                    )
                
                if matches:
                    files_to_search.append({
                        'id': file_info['id'],
                        'file_name': file_info['file_name'],
                        'folder': file_info.get('folder'),
                        'file_type': file_info['file_type'],
                        'file_size': file_info['file_size']
                    })
                    matched_count += 1
        
        # Search files
        results = []
        total_matches = 0
        files_with_matches = 0
        truncated = False
        
        for file_info in files_to_search:
            # Skip large files
            if file_info['file_size'] > MAX_GREP_FILE_SIZE:
                logger.warning(f"Skipping large file {file_info['file_name']}: {file_info['file_size']} bytes")
                continue
            
            # Skip binary files
            file_type = file_info['file_type'].lower()
            text_based_types = [
                'text/', 'application/json', 'application/xml', 'application/yaml',
                'application/x-yaml', 'application/javascript', 'application/typescript',
                'application/x-sh', 'application/x-python', 'application/sql'
            ]
            if not any(file_type.startswith(t) for t in text_based_types):
                continue
            
            # Get file content
            try:
                file_data = await _get_file_content_service(user_id, str(file_info['id']))
                if not file_data:
                    continue
                
                content = file_data.get('extracted_text', '')
                
                # Try fetching from storage if no extracted text
                if not content:
                    storage_url = file_data.get('storage_url', '')
                    if storage_url:
                        try:
                            content = await fetch_from_storage_url(storage_url)
                        except:
                            continue
                
                if not content:
                    continue
                
                # Split into lines
                lines = content.splitlines()
                
                # Search for pattern
                file_matches = []
                for line_idx, line in enumerate(lines):
                    if len(file_matches) >= max_matches_per_file:
                        truncated = True
                        break
                    
                    line_number = line_idx + 1
                    match_found = False
                    match_pos = -1
                    
                    if regex:
                        # Regex search
                        try:
                            match = compiled_pattern.search(line)
                            if match:
                                match_found = True
                                match_pos = match.start()
                        except Exception as e:
                            logger.warning(f"Regex search failed on line {line_number}: {e}")
                            continue
                    else:
                        # Simple string search
                        if case_sensitive:
                            match_pos = line.find(pattern)
                        else:
                            match_pos = line.lower().find(pattern.lower())
                        
                        match_found = match_pos >= 0
                    
                    if match_found:
                        # Get context lines
                        before_ctx = []
                        after_ctx = []
                        
                        if context_lines > 0:
                            start_idx = max(0, line_idx - context_lines)
                            before_ctx = lines[start_idx:line_idx]
                            
                            end_idx = min(len(lines), line_idx + context_lines + 1)
                            after_ctx = lines[line_idx + 1:end_idx]
                        
                        file_matches.append(GrepMatch(
                            line_number=line_number,
                            line_content=line,
                            match_position=match_pos,
                            before_context=before_ctx,
                            after_context=after_ctx
                        ))
                
                if file_matches:
                    results.append(GrepFileResult(
                        file_id=str(file_info['id']),
                        file_name=file_info['file_name'],
                        folder=file_info.get('folder'),
                        match_count=len(file_matches),
                        matches=file_matches
                    ))
                    files_with_matches += 1
                    total_matches += len(file_matches)
            
            except Exception as e:
                logger.warning(f"Error searching file {file_info['file_name']}: {e}")
                continue
        
        result = GrepResult(
            total_files_searched=len(files_to_search),
            files_with_matches=files_with_matches,
            total_matches=total_matches,
            results=results,
            truncated=truncated
        )
        
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error in grep_files: {e}", exc_info=True)
        error = ErrorResponse(error="grep_failed", details=str(e))
        return error.model_dump_json(indent=2)


@require_auth
async def search_workspace_notes(
    ctx: RunContext[UnifiedDeps],
    query: str,
    limit: int = 10
) -> str:
    """Search user's personal notes by title or content.
    
    WHEN TO USE:
    - User requests to find or search their notes
    - User asks about saved information or personal documentation
    - User wants to list all notes (use query="*")
    
    PARAMETERS:
    - query (required): Search text matching title or content. Use "*" for all notes.
    - limit (optional): Max results to return, 1-50. Default: 10
    
    RETURNS:
    JSON with found count and notes list. Each note includes:
    - id: Note UUID
    - title: Note title
    - preview: First 200 characters of content
    - folder: Organization path (optional)
    - tags: Associated tags array
    - created: ISO 8601 timestamp
    - updated: ISO 8601 timestamp
    
    NOTE: Preview is truncated. Use get_note_content to retrieve full text.
    """
    user_id = ctx.deps.user_id
    
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
            # Create preview
            content = row['content']
            content_preview = content[:NOTE_PREVIEW_LENGTH] + '...' if len(content) > NOTE_PREVIEW_LENGTH else content
            
            note_item = NoteSearchItem(
                id=str(row['id']),
                title=row['title'],
                preview=content_preview,
                folder=row.get('folder'),
                tags=row.get('tags') or [],
                created=format_timestamp(row['created_at']),
                updated=format_timestamp(row['updated_at'])
            )
            notes.append(note_item)
        
        result = NoteSearchResult(found=len(notes), notes=notes)
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error searching workspace notes: {e}", exc_info=True)
        error = ErrorResponse(error="search_failed", details=str(e))
        return error.model_dump_json(indent=2)


@require_auth
async def get_note_content(
    ctx: RunContext[UnifiedDeps],
    note_id: str
) -> str:
    """Retrieve full content of a note.
    
    WHEN TO USE:
    - After search_workspace_notes to read full note text
    - User requests to read or view a specific note
    - Preview from search is insufficient
    
    PARAMETERS:
    - note_id (required): Note UUID from search results
    
    RETURNS:
    JSON with title, folder, tags array, content (full text), content_length, 
    created timestamp, updated timestamp.
    
    ERROR CASES:
    - note_not_found: Invalid note_id or access denied
    """
    user_id = ctx.deps.user_id
    
    try:
        note_data = await _get_note_content_service(user_id, note_id)
        
        if not note_data:
            error = ErrorResponse(
                error="note_not_found",
                details=f"Note not found or access denied (note_id: {note_id})"
            )
            return error.model_dump_json(indent=2)
        
        # Return full content
        result = NoteContent(
            title=note_data['title'],
            folder=note_data.get('folder'),
            tags=note_data.get('tags') or [],
            content=note_data['content'],
            content_length=len(note_data['content']),
            created=format_timestamp(note_data['created_at']),
            updated=format_timestamp(note_data['updated_at'])
        )
        
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error getting note content for {note_id}: {e}", exc_info=True)
        error = ErrorResponse(error="retrieval_failed", details="Unable to retrieve note content")
        return error.model_dump_json(indent=2)


@require_auth
async def edit_file(
    ctx: RunContext[UnifiedDeps],
    file_id: str,
    search: str,
    replace: str,
    all_occurrences: bool = True,
    regex: bool = False,
    case_sensitive: bool = True
) -> str:
    """Replace text patterns in a file.
    
    WHEN TO USE:
    - User requests to replace, change, or substitute text in a file
    - Need to make specific edits without rewriting entire file
    - Want to update multiple occurrences at once
    
    PARAMETERS:
    - file_id (required): File UUID from search or list results
    - search (required): Text or pattern to find
    - replace (required): Replacement text
    - all_occurrences (optional): Replace all matches or just first. Default: True
    - regex (optional): Treat search as regex pattern. Default: False
    - case_sensitive (optional): Case-sensitive matching. Default: True
    
    RETURNS:
    JSON with success boolean, message, file_id, file_name, matches_found,
    replacements_made, size_bytes (new size), preview (first 200 chars).
    
    BEHAVIOR:
    - all_occurrences=True: Replaces all matches in file
    - all_occurrences=False: Replaces only first match
    - Validates structured files (JSON, YAML) after editing
    - Rolls back changes if validation fails
    
    FILE SIZE LIMIT:
    - Max 10MB for edit operations
    - Larger files rejected with error
    
    VALIDATION:
    - JSON files: Validates JSON syntax after edit
    - YAML files: Validates YAML syntax after edit
    - Prevents corruption of structured files
    
    ERROR CASES:
    - file_not_found: Invalid file_id or access denied
    - file_too_large: Exceeds 10MB limit
    - validation_failed: Edit would corrupt file structure
    - no_matches: Search pattern not found in file
    - invalid_pattern: Malformed regex pattern
    """
    user_id = ctx.deps.user_id
    
    try:
        import re
        import json
        
        # Get file metadata
        file_data = await _get_file_content_service(user_id, file_id)
        
        if not file_data:
            error = ErrorResponse(
                error="file_not_found",
                details=f"File not found or access denied (file_id: {file_id})"
            )
            return error.model_dump_json(indent=2)
        
        # Check file size
        file_size = file_data.get('file_size', 0)
        if file_size > MAX_EDIT_FILE_SIZE:
            error = ErrorResponse(
                error="file_too_large",
                details=f"File size ({file_size / (1024*1024):.1f}MB) exceeds edit limit ({MAX_EDIT_FILE_SIZE / (1024*1024):.0f}MB)"
            )
            return error.model_dump_json(indent=2)
        
        # Get current content
        content = file_data.get('extracted_text', '')
        
        if not content:
            file_type = file_data.get('file_type', '').lower()
            storage_url = file_data.get('storage_url', '')
            
            text_based_types = [
                'text/', 'application/json', 'application/xml', 'application/yaml',
                'application/x-yaml', 'application/javascript', 'application/typescript',
                'application/x-sh', 'application/x-python', 'application/sql'
            ]
            
            is_text_file = any(file_type.startswith(t) for t in text_based_types)
            
            if is_text_file and storage_url:
                try:
                    content = await fetch_from_storage_url(storage_url)
                except Exception as fetch_error:
                    logger.error(f"Error fetching file content: {fetch_error}")
                    error = ErrorResponse(
                        error="fetch_failed",
                        details="Unable to fetch file content from storage"
                    )
                    return error.model_dump_json(indent=2)
            else:
                error = ErrorResponse(
                    error="no_text_content",
                    details=f"File '{file_data['file_name']}' cannot be edited (not a text file)"
                )
                return error.model_dump_json(indent=2)
        
        # Perform search and replace
        matches_found = 0
        replacements_made = 0
        modified_content = content
        
        if regex:
            # Regex-based replacement
            if len(search) > MAX_REGEX_PATTERN_LENGTH:
                error = ErrorResponse(
                    error="invalid_pattern",
                    details=f"Regex pattern too long (max {MAX_REGEX_PATTERN_LENGTH} chars)"
                )
                return error.model_dump_json(indent=2)
            
            try:
                flags = 0 if case_sensitive else re.IGNORECASE
                compiled_pattern = re.compile(search, flags)
                
                # Count matches
                matches = list(compiled_pattern.finditer(content))
                matches_found = len(matches)
                
                if matches_found == 0:
                    error = ErrorResponse(
                        error="no_matches",
                        details=f"Pattern '{search}' not found in file"
                    )
                    return error.model_dump_json(indent=2)
                
                # Perform replacement
                if all_occurrences:
                    modified_content = compiled_pattern.sub(replace, content)
                    replacements_made = matches_found
                else:
                    modified_content = compiled_pattern.sub(replace, content, count=1)
                    replacements_made = 1
                    
            except re.error as e:
                error = ErrorResponse(
                    error="invalid_pattern",
                    details=f"Invalid regex pattern: {str(e)}"
                )
                return error.model_dump_json(indent=2)
        else:
            # Simple string replacement
            if case_sensitive:
                matches_found = content.count(search)
            else:
                matches_found = content.lower().count(search.lower())
            
            if matches_found == 0:
                error = ErrorResponse(
                    error="no_matches",
                    details=f"Text '{search}' not found in file"
                )
                return error.model_dump_json(indent=2)
            
            # Perform replacement
            if all_occurrences:
                if case_sensitive:
                    modified_content = content.replace(search, replace)
                else:
                    # Case-insensitive replacement
                    import re
                    pattern = re.compile(re.escape(search), re.IGNORECASE)
                    modified_content = pattern.sub(replace, content)
                replacements_made = matches_found
            else:
                if case_sensitive:
                    modified_content = content.replace(search, replace, 1)
                else:
                    pattern = re.compile(re.escape(search), re.IGNORECASE)
                    modified_content = pattern.sub(replace, content, count=1)
                replacements_made = 1
        
        # Validate structured files
        file_name = file_data['file_name']
        file_type = file_data.get('file_type', '').lower()
        
        if file_name.endswith('.json') or 'application/json' in file_type:
            try:
                json.loads(modified_content)
            except json.JSONDecodeError as e:
                error = ErrorResponse(
                    error="validation_failed",
                    details=f"Edit would create invalid JSON: {str(e)}"
                )
                return error.model_dump_json(indent=2)
        
        elif file_name.endswith(('.yaml', '.yml')) or 'yaml' in file_type:
            try:
                import yaml
                yaml.safe_load(modified_content)
            except Exception as e:
                error = ErrorResponse(
                    error="validation_failed",
                    details=f"Edit would create invalid YAML: {str(e)}"
                )
                return error.model_dump_json(indent=2)
        
        # Update file content via service
        result_data = await _update_file_content_service(
            user_id=user_id,
            file_id=file_id,
            content=modified_content,
            append=False
        )
        
        # Generate preview
        preview = modified_content[:200] + ('...' if len(modified_content) > 200 else '')
        
        result = EditResult(
            success=True,
            message=f"File edited successfully: {replacements_made} replacement(s) made",
            file_id=file_id,
            file_name=file_name,
            matches_found=matches_found,
            replacements_made=replacements_made,
            size_bytes=result_data['file_size'],
            preview=preview
        )
        
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error editing file {file_id}: {e}", exc_info=True)
        error = ErrorResponse(error="edit_failed", details=str(e))
        return error.model_dump_json(indent=2)


# ============================================================================
# Folder Management Tools
# ============================================================================

@require_auth
async def list_folders(
    ctx: RunContext[UnifiedDeps],
    parent_folder: Optional[str] = None
) -> str:
    """List folders in workspace.
    
    WHEN TO USE:
    - User asks about folder structure or organization
    - User requests to list folders or see available folders
    - Need to understand workspace hierarchy before file operations
    
    PARAMETERS:
    - parent_folder (optional): Parent path to list children only. 
      Use None or "root" for top-level folders.
      Example: "projects" returns "projects/2024", "projects/docs"
    
    RETURNS:
    JSON with count and folders array. Each folder includes:
    - name: Folder name (leaf name only)
    - path: Full folder path
    - file_count: Number of files in folder
    - folder_count: Number of subfolders
    - created: ISO 8601 timestamp (optional)
    
    BEHAVIOR:
    - Without parent_folder: Lists all folders at all levels
    - With parent_folder: Lists only immediate children of that folder
    """
    user_id = ctx.deps.user_id
    
    try:
        # Normalize parent folder (handle 'root' as None)
        parent_path = parent_folder if parent_folder and parent_folder.lower() != 'root' else None
        folders_data = await _list_folders_service(user_id, parent_path)
        
        folders = []
        for folder_info in folders_data:
            created_value = folder_info.get('created')
            folder_item = FolderItem(
                name=folder_info['name'],
                path=folder_info['path'],
                file_count=folder_info.get('file_count', 0),
                folder_count=folder_info.get('folder_count', 0),
                created=format_timestamp(created_value) if created_value else None
            )
            folders.append(folder_item)
        
        result = FolderListResult(count=len(folders), folders=folders)
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error listing folders: {e}", exc_info=True)
        error = ErrorResponse(error="list_failed", details=str(e))
        return error.model_dump_json(indent=2)


@require_auth
async def create_folder(
    ctx: RunContext[UnifiedDeps],
    folder_name: str,
    parent_path: Optional[str] = None
) -> str:
    """Create new folder in workspace.
    
    WHEN TO USE:
    - User requests to create, make, or add a folder
    - User wants to organize files into new location
    - Need folder structure before file operations
    
    PARAMETERS:
    - folder_name (required): Name for new folder (no slashes)
    - parent_path (optional): Parent folder path. Use None for root level.
      Example: parent_path="projects" creates "projects/folder_name"
    
    RETURNS:
    JSON with success boolean, message, folder_name, folder_path (full path).
    
    ERROR CASES:
    - Folder name already exists
    - Invalid characters in folder_name
    - Parent path does not exist
    """
    user_id = ctx.deps.user_id
    
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


@require_auth
async def rename_folder(
    ctx: RunContext[UnifiedDeps],
    old_name: str,
    new_name: str
) -> str:
    """Rename existing folder.
    
    WHEN TO USE:
    - User requests to rename or change folder name
    - User wants to reorganize folder structure
    
    PARAMETERS:
    - old_name (required): Current folder name or full path
    - new_name (required): New folder name (leaf name only, no path)
    
    RETURNS:
    JSON with success boolean, message, folder_name (new), folder_path (new full path).
    
    ERROR CASES:
    - Folder not found
    - New name already exists
    - Invalid characters in new_name
    
    NOTE: Renaming preserves folder contents and updates all file paths automatically.
    """
    user_id = ctx.deps.user_id
    
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


@require_auth
async def delete_folder(
    ctx: RunContext[UnifiedDeps],
    folder_name: str,
    delete_files: bool = False
) -> str:
    """Delete folder from workspace.
    
    WHEN TO USE:
    - User requests to delete, remove, or clean up a folder
    - User wants to reorganize workspace structure
    
    PARAMETERS:
    - folder_name (required): Folder name or full path to delete
    - delete_files (optional): Delete folder contents. Default: False
    
    RETURNS:
    JSON with success boolean, message, folder_name.
    
    BEHAVIOR:
    - delete_files=False: Only deletes empty folders. Error if folder contains files.
    - delete_files=True: Deletes folder and all contents recursively.
    
    ERROR CASES:
    - Folder not found
    - Folder not empty (when delete_files=False)
    - Permission denied
    
    CAUTION: This operation is irreversible. Deleted files cannot be recovered.
    """
    user_id = ctx.deps.user_id
    
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

@require_auth
async def list_files(
    ctx: RunContext[UnifiedDeps],
    folder: Optional[str] = None,
    recursive: bool = False,
    max_depth: int = 10,
    page: int = 1,
    page_size: int = DEFAULT_FILE_LIST_PAGE_SIZE
) -> str:
    """List files in folder with pagination.
    
    WHEN TO USE:
    - User asks to list, show, or browse files in a folder
    - User wants to see folder contents
    - Need to enumerate files before operations
    
    PARAMETERS:
    - folder (optional): Folder path. Use None or "root" for root folder.
    - recursive (optional): Include subfolders. Default: False
    - max_depth (optional): Max subfolder depth when recursive=True, 1-20. Default: 10
    - page (optional): Page number starting at 1. Default: 1
    - page_size (optional): Results per page, 1-500. Default: 50
    
    RETURNS:
    JSON with count (current page), total (all files), folder (display name), 
    files array (id, name, type, size_bytes, folder, tags, uploaded), 
    pagination info (total, page, page_size, total_pages, has_next, has_prev).
    
    BEHAVIOR:
    - recursive=False: Lists only files directly in specified folder
    - recursive=True: Lists files in folder and all subfolders up to max_depth
    - folder=None with recursive=False: Lists root folder only
    - folder=None with recursive=True: Lists all workspace files
    
    PAGINATION:
    - Check has_next=true to fetch more results
    - Increment page parameter for next page
    """
    user_id = ctx.deps.user_id
    
    try:
        # Normalize folder name
        folder_path = folder if folder and folder.lower() != 'root' else None
        
        # Validate and cap parameters
        page_size = min(max(1, page_size), MAX_PAGE_SIZE_LIST)
        page = max(1, page)
        offset = (page - 1) * page_size
        
        # NOTE: Service layer optimization opportunity - combine count and results
        # in a single query using SQL window function COUNT(*) OVER()
        
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
            file_item = FileSearchItem(
                id=str(file_info['id']),
                name=file_info['file_name'],
                type=file_info['file_type'],
                size_bytes=file_info['file_size'],
                folder=file_info.get('folder'),
                tags=file_info.get('tags') or [],
                uploaded=format_timestamp(file_info['created_at'])
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


@require_auth
async def delete_file(
    ctx: RunContext[UnifiedDeps],
    file_id: str
) -> str:
    """Delete file from workspace.
    
    WHEN TO USE:
    - User requests to delete, remove, or clean up a file
    - User wants to free up space or remove outdated content
    
    PARAMETERS:
    - file_id (required): File UUID from search or list results
    
    RETURNS:
    JSON with success boolean, message, file_id.
    
    CAUTION: This operation is permanent and irreversible. Deleted files cannot be recovered.
    
    ERROR CASES:
    - File not found
    - Access denied
    """
    user_id = ctx.deps.user_id
    
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


@require_auth
async def rename_file(
    ctx: RunContext[UnifiedDeps],
    file_id: str,
    new_name: str
) -> str:
    """Rename file in workspace.
    
    WHEN TO USE:
    - User requests to rename or change file name
    - User wants to update file naming for organization
    
    PARAMETERS:
    - file_id (required): File UUID from search or list results
    - new_name (required): New filename including extension (e.g., "report.pdf")
    
    RETURNS:
    JSON with success boolean, message, file_id, file_name (new name).
    
    ERROR CASES:
    - File not found
    - New name already exists in same folder
    - Invalid characters in new_name
    
    NOTE: Include file extension in new_name to preserve file type.
    """
    user_id = ctx.deps.user_id
    
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


@require_auth
async def move_file(
    ctx: RunContext[UnifiedDeps],
    file_id: str,
    target_folder: str
) -> str:
    """Move file to different folder.
    
    WHEN TO USE:
    - User requests to move, relocate, or transfer a file
    - User wants to reorganize file structure
    
    PARAMETERS:
    - file_id (required): File UUID from search or list results
    - target_folder (required): Destination folder path. Use "root" or None for root folder.
    
    RETURNS:
    JSON with success boolean, message, file_id, new_path (destination folder).
    
    ERROR CASES:
    - File not found
    - Target folder does not exist
    - File with same name exists in target folder
    - Access denied
    
    NOTE: File name is preserved. Only folder location changes.
    """
    user_id = ctx.deps.user_id
    
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


@require_auth
async def get_file_metadata(
    ctx: RunContext[UnifiedDeps],
    file_id: str
) -> str:
    """Retrieve file metadata without content.
    
    WHEN TO USE:
    - User asks about file properties (type, size, date)
    - Need to check file details before reading content
    - Want file info without downloading full content
    
    PARAMETERS:
    - file_id (required): File UUID from search or list results
    
    RETURNS:
    JSON with id, file_name, file_type (MIME), size_bytes, folder, tags array, 
    description, has_text_content boolean, created timestamp, updated timestamp.
    
    PERFORMANCE:
    Faster than get_file_content when only metadata is needed (no content download).
    
    ERROR CASES:
    - file_not_found: Invalid file_id or access denied
    """
    user_id = ctx.deps.user_id
    
    try:
        metadata = await _get_file_metadata_service(user_id, file_id)
        
        if not metadata:
            error = ErrorResponse(
                error="file_not_found",
                details=f"File not found or access denied (file_id: {file_id})"
            )
            return error.model_dump_json(indent=2)
        
        result = FileMetadata(
            id=str(metadata['id']),
            file_name=metadata['file_name'],
            file_type=metadata['file_type'],
            size_bytes=metadata['file_size'],
            folder=metadata.get('folder'),
            tags=metadata.get('tags') or [],
            description=metadata.get('description'),
            has_text_content=bool(metadata.get('has_text_content')),
            created=format_timestamp(metadata['created_at']),
            updated=format_timestamp(metadata['updated_at'])
        )
        
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(f"Error getting file metadata for {file_id}: {e}", exc_info=True)
        error = ErrorResponse(error="metadata_failed", details="Unable to retrieve file metadata")
        return error.model_dump_json(indent=2)


# ============================================================================
# File Read/Write Tools
# ============================================================================

@require_auth
async def create_text_file(
    ctx: RunContext[UnifiedDeps],
    file_name: str,
    content: Optional[str] = "",
    folder: Optional[str] = None,
    tags: Optional[List[str]] = None,
    description: Optional[str] = None
) -> str:
    """Create new text file in workspace.
    
    WHEN TO USE:
    - User asks to create, save, or write a file
    - Need to persist generated content (reports, data, notes)
    - User wants to store text in workspace
    
    PARAMETERS:
    - file_name (required): Filename with extension. Keep concise (e.g., "notes.txt", "data.json")
    - content (optional): Text content to write. Default: empty string
    - folder (optional): Destination folder path. Use None for root folder.
    - tags (optional): Tag array for organization. Max 3 tags (excess ignored).
    - description (optional): Short file description. Max 50 chars (excess truncated).
    
    RETURNS:
    JSON with success boolean, message, file_id (UUID), file_name, 
    file_path (folder), size_bytes.
    
    SUPPORTED FORMATS:
    Text-based files: .txt, .md, .json, .csv, .xml, .yaml, .js, .ts, .py, .sql, etc.
    
    VALIDATION:
    - file_name cannot be empty or contain '/'
    - Tags limited to 3 (extras silently dropped)
    - Description truncated to 50 chars (with warning log)
    
    NAMING GUIDELINES:
    - Good: "report.pdf", "data.csv", "notes.txt"
    - Bad: "A_B_Test_Daily_Tracking_Template_With_Statistics.csv" (too verbose)
    
    ERROR CASES:
    - invalid_filename: Empty name or contains '/'
    - Folder does not exist
    - File already exists with same name in folder
    """
    user_id = ctx.deps.user_id
    
    logger.info(
        f"[create_text_file] 📝 Called with: file_name='{file_name}', "
        f"folder='{folder}', content_length={len(content) if content else 0}, "
        f"tags={tags}, description='{description}'"
    )

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
        
        # Validate and sanitize tags and description
        validated_tags = validate_tags(tags)
        validated_description = validate_description(description)
        
        # Create file
        result_data = await _create_text_file_service(
            user_id=user_id,
            file_name=file_name,
            content=content or "",
            folder=folder_path,
            tags=validated_tags,
            description=validated_description
        )
        
        result = FileWriteResult(
            success=True,
            message=f"File '{file_name}' created successfully",
            file_id=str(result_data['id']),
            file_name=result_data['file_name'],
            file_path=result_data.get('folder'),
            size_bytes=result_data['file_size']
        )
        
        result_json = result.model_dump_json(indent=2)
        logger.info(
            f"[create_text_file] 📤 File created: {file_name} "
            f"({result_data['file_size']} bytes)"
        )
        return result_json
        
    except Exception as e:
        logger.error(
            f"[create_text_file] ❌ Error creating text file '{file_name}': {e}", 
            exc_info=True
        )
        error = ErrorResponse(error="create_failed", details=str(e))
        return error.model_dump_json(indent=2)


@require_auth
async def update_file_content(
    ctx: RunContext[UnifiedDeps],
    file_id: str,
    content: str,
    append: Optional[bool] = False,
    file_name: Optional[str] = None
) -> str:
    """Update existing text file content.
    
    WHEN TO USE:
    - User requests to update, modify, edit, or change file content
    - User wants to append new content to existing file
    - Need to replace file content with new data
    
    PARAMETERS:
    - file_id (required): File UUID from search or list results
    - content (required): New content to write or append
    - append (optional): Operation mode. Default: False
      * False: Replace entire file content
      * True: Append to end of existing content
    - file_name (optional): Filename for logging (informational only)
    
    RETURNS:
    JSON with success boolean, message, file_id, file_name, file_path, size_bytes (new size).
    
    BEHAVIOR:
    - append=False: Overwrites all existing content with new content
    - append=True: Adds new content to end, preserves existing content
    
    SUPPORTED FILES:
    Only text-based files (.txt, .md, .json, .csv, .xml, .yaml, etc.)
    
    ERROR CASES:
    - File not found
    - File is not text-based (binary files not supported)
    - Access denied
    - update_failed: General update error
    """
    user_id = ctx.deps.user_id
    
    logger.info(
        f"[update_file_content] 📝 Called with: file_id='{file_id}', "
        f"content_length={len(content)}, append={append}, file_name='{file_name}'"
    )
    
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
        
        logger.info(
            f"[update_file_content] 📤 File {'updated' if not append else 'appended'}: "
            f"{result_data['file_name']} ({result_data['file_size']} bytes)"
        )
        return result.model_dump_json(indent=2)
        
    except Exception as e:
        logger.error(
            f"[update_file_content] ❌ Error updating file content for {file_id}: {e}", 
            exc_info=True
        )
        error = ErrorResponse(error="update_failed", details=str(e))
        return error.model_dump_json(indent=2)