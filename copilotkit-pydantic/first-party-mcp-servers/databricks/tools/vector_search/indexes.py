"""
Vector Search Indexes Tools

This module provides tools for managing vector search indexes in Databricks.
Vector search indexes enable semantic search and similarity matching through
efficient approximate nearest neighbor (ANN) queries on embedding vectors.

There are two types of indexes:
- Delta Sync Index: Auto-syncs with a Delta Table
- Direct Vector Access Index: Direct read/write via REST/SDK APIs
"""

from typing import Optional, List, Dict, Any
import json
from cache import get_workspace_client
from models import (
    VectorIndexModel,
    MiniVectorIndexModel,
    ListIndexesResponse,
    CreateIndexResponse,
    DeleteIndexResponse,
    QueryVectorIndexResponse,
    QueryResultRow,
    UpsertDataResponse,
    DeleteDataResponse,
    SyncIndexResponse,
    ScanVectorIndexResponse,
    ScanResultRow,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_vector_index(index) -> VectorIndexModel:
    """Convert SDK VectorIndex to Pydantic model."""
    return VectorIndexModel(
        name=index.name if hasattr(index, 'name') else None,
        endpoint_name=index.endpoint_name if hasattr(index, 'endpoint_name') else None,
        index_type=index.index_type.value if hasattr(index, 'index_type') and index.index_type else None,
        primary_key=index.primary_key if hasattr(index, 'primary_key') else None,
        creator=index.creator if hasattr(index, 'creator') else None,
        status=index.status.value if hasattr(index, 'status') and index.status else None,
        creation_timestamp=index.creation_timestamp if hasattr(index, 'creation_timestamp') else None,
        last_updated_timestamp=index.last_updated_timestamp if hasattr(index, 'last_updated_timestamp') else None,
    )


def _convert_to_mini_vector_index(index) -> MiniVectorIndexModel:
    """Convert SDK MiniVectorIndex to Pydantic model."""
    return MiniVectorIndexModel(
        name=index.name if hasattr(index, 'name') else None,
        endpoint_name=index.endpoint_name if hasattr(index, 'endpoint_name') else None,
        index_type=index.index_type.value if hasattr(index, 'index_type') and index.index_type else None,
        primary_key=index.primary_key if hasattr(index, 'primary_key') else None,
    )


# ============================================================================
# Vector Search Index Management
# ============================================================================

def list_vector_search_indexes(
    host_credential_key: str,
    token_credential_key: str,
    endpoint_name: str,
    page_token: Optional[str] = None,
) -> ListIndexesResponse:
    """
    List all vector search indexes.
    
    Retrieves all vector search indexes hosted on a specific endpoint.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        endpoint_name: Endpoint name to list indexes from
        page_token: Pagination token (optional)
        
    Returns:
        ListIndexesResponse with indexes
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    indexes = []
    next_token = None
    
    for index in client.vector_search_indexes.list_indexes(
        endpoint_name=endpoint_name,
        page_token=page_token,
    ):
        indexes.append(_convert_to_mini_vector_index(index))
    
    return ListIndexesResponse(
        indexes=indexes,
        next_page_token=next_token,
    )


def get_vector_search_index(
    host_credential_key: str,
    token_credential_key: str,
    index_name: str,
    ensure_reranker_compatible: Optional[bool] = None,
) -> VectorIndexModel:
    """
    Get a vector search index.
    
    Retrieves detailed information about a specific vector search index.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        index_name: Full index name (catalog.schema.index_name)
        ensure_reranker_compatible: Ensure URL is reranker-compatible (optional)
        
    Returns:
        VectorIndexModel with index details
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    index = client.vector_search_indexes.get_index(
        index_name=index_name,
        ensure_reranker_compatible=ensure_reranker_compatible,
    )
    
    return _convert_to_vector_index(index)


def create_vector_search_index(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    endpoint_name: str,
    primary_key: str,
    index_type: str,
    delta_sync_spec: Optional[Dict[str, Any]] = None,
    direct_access_spec: Optional[Dict[str, Any]] = None,
) -> CreateIndexResponse:
    """
    Create a vector search index.
    
    Creates a new vector search index. There are two types:
    - Delta Sync Index: Auto-syncs with a Delta Table
    - Direct Vector Access Index: Direct read/write via API
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Full index name (catalog.schema.index_name)
        endpoint_name: Endpoint to host the index
        primary_key: Primary key column name
        index_type: Index type ("DELTA_SYNC" or "DIRECT_ACCESS")
        delta_sync_spec: Delta Sync Index spec (required if DELTA_SYNC)
        direct_access_spec: Direct Access Index spec (required if DIRECT_ACCESS)
        
    Returns:
        CreateIndexResponse with created index
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.vectorsearch import (
        VectorIndexType,
        DeltaSyncVectorIndexSpecRequest,
        DirectAccessVectorIndexSpec,
    )
    
    # Convert string to enum
    index_type_enum = VectorIndexType[index_type.upper()]
    
    # Build spec objects based on index type
    delta_spec_obj = None
    direct_spec_obj = None
    
    if index_type_enum == VectorIndexType.DELTA_SYNC and delta_sync_spec:
        # Create DeltaSyncVectorIndexSpecRequest from dict
        delta_spec_obj = DeltaSyncVectorIndexSpecRequest.from_dict(delta_sync_spec)
    
    if index_type_enum == VectorIndexType.DIRECT_ACCESS and direct_access_spec:
        # Create DirectAccessVectorIndexSpec from dict
        direct_spec_obj = DirectAccessVectorIndexSpec.from_dict(direct_access_spec)
    
    # Create the index
    index = client.vector_search_indexes.create_index(
        name=name,
        endpoint_name=endpoint_name,
        primary_key=primary_key,
        index_type=index_type_enum,
        delta_sync_index_spec=delta_spec_obj,
        direct_access_index_spec=direct_spec_obj,
    )
    
    return CreateIndexResponse(
        index=_convert_to_vector_index(index),
    )


def delete_vector_search_index(
    host_credential_key: str,
    token_credential_key: str,
    index_name: str,
) -> DeleteIndexResponse:
    """
    Delete a vector search index.
    
    Deletes a vector search index. This operation is irreversible.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        index_name: Full index name to delete
        
    Returns:
        DeleteIndexResponse confirming deletion
        
    
        
    Note:
        - This operation is irreversible
        - The underlying Delta Table (for Delta Sync) is not deleted
        - Index deletion may take several minutes
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.vector_search_indexes.delete_index(index_name=index_name)
    
    return DeleteIndexResponse(
        index_name=index_name,
    )


# ============================================================================
# Vector Search Query Operations
# ============================================================================

def query_vector_search_index(
    host_credential_key: str,
    token_credential_key: str,
    index_name: str,
    columns: List[str],
    query_text: Optional[str] = None,
    query_vector: Optional[List[float]] = None,
    num_results: int = 10,
    query_type: str = "ANN",
    filters_json: Optional[str] = None,
    score_threshold: Optional[float] = None,
) -> QueryVectorIndexResponse:
    """
    Query a vector search index.
    
    Performs semantic similarity search on a vector index using either text
    (for Delta Sync with model endpoint) or vector embeddings.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        index_name: Full index name to query
        columns: List of columns to return in results
        query_text: Query text (for Delta Sync with model endpoint)
        query_vector: Query embedding vector (for Direct Access or self-managed)
        num_results: Number of results to return (default: 10)
        query_type: Query type - "ANN", "HYBRID", or "FULL_TEXT" (default: "ANN")
        filters_json: JSON string for filtering (optional)
        score_threshold: Minimum similarity score threshold (optional)
        
    Returns:
        QueryVectorIndexResponse with search results
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    result = client.vector_search_indexes.query_index(
        index_name=index_name,
        columns=columns,
        query_text=query_text,
        query_vector=query_vector,
        num_results=num_results,
        query_type=query_type,
        filters_json=filters_json,
        score_threshold=score_threshold,
    )
    
    # Convert results to Pydantic models
    query_results = []
    if hasattr(result, 'result') and result.result:
        if hasattr(result.result, 'data_array') and result.result.data_array:
            for row in result.result.data_array:
                # Each row is a list of values corresponding to columns
                row_dict = {}
                if hasattr(result.result, 'row_count') and result.result.row_count > 0:
                    # Try to map columns to values
                    row_dict = {"data": row}
                
                query_results.append(QueryResultRow(
                    score=row[0] if isinstance(row, list) and len(row) > 0 and isinstance(row[0], (int, float)) else None,
                    metadata=row_dict if row_dict else {"data": row},
                ))
    
    next_token = result.next_page_token if hasattr(result, 'next_page_token') else None
    
    return QueryVectorIndexResponse(
        index_name=index_name,
        results=query_results,
        next_page_token=next_token,
    )


def query_vector_search_next_page(
    host_credential_key: str,
    token_credential_key: str,
    index_name: str,
    page_token: str,
    endpoint_name: Optional[str] = None,
) -> QueryVectorIndexResponse:
    """
    Get next page of query results.
    
    Retrieves the next page of results from a previous query using the
    page token returned.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        index_name: Full index name
        page_token: Page token from previous query
        endpoint_name: Endpoint name (optional)
        
    Returns:
        QueryVectorIndexResponse with next page of results
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    result = client.vector_search_indexes.query_next_page(
        index_name=index_name,
        page_token=page_token,
        endpoint_name=endpoint_name,
    )
    
    # Convert results (same as query_index)
    query_results = []
    if hasattr(result, 'result') and result.result:
        if hasattr(result.result, 'data_array') and result.result.data_array:
            for row in result.result.data_array:
                row_dict = {}
                if hasattr(result.result, 'row_count') and result.result.row_count > 0:
                    row_dict = {"data": row}
                
                query_results.append(QueryResultRow(
                    score=row[0] if isinstance(row, list) and len(row) > 0 and isinstance(row[0], (int, float)) else None,
                    metadata=row_dict if row_dict else {"data": row},
                ))
    
    next_token = result.next_page_token if hasattr(result, 'next_page_token') else None
    
    return QueryVectorIndexResponse(
        index_name=index_name,
        results=query_results,
        next_page_token=next_token,
    )


def scan_vector_search_index(
    host_credential_key: str,
    token_credential_key: str,
    index_name: str,
    num_results: int = 10,
    last_primary_key: Optional[str] = None,
) -> ScanVectorIndexResponse:
    """
    Scan a vector search index.
    
    Scans the index and returns entries sequentially, useful for iterating
    through all vectors in the index.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        index_name: Full index name to scan
        num_results: Number of results to return (default: 10)
        last_primary_key: Last primary key for pagination (optional)
        
    Returns:
        ScanVectorIndexResponse with scan results
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    result = client.vector_search_indexes.scan_index(
        index_name=index_name,
        num_results=num_results,
        last_primary_key=last_primary_key,
    )
    
    # Convert results
    scan_results = []
    if hasattr(result, 'data_array') and result.data_array:
        for row in result.data_array:
            scan_results.append(ScanResultRow(
                metadata={"data": row},
            ))
    
    last_key = result.last_primary_key if hasattr(result, 'last_primary_key') else None
    
    return ScanVectorIndexResponse(
        index_name=index_name,
        results=scan_results,
        last_primary_key=last_key,
    )


# ============================================================================
# Direct Vector Access Index Operations
# ============================================================================

def upsert_vector_search_data(
    host_credential_key: str,
    token_credential_key: str,
    index_name: str,
    inputs_json: str,
) -> UpsertDataResponse:
    """
    Upsert data to a Direct Vector Access Index.
    
    Inserts or updates vectors and metadata in a Direct Vector Access Index.
    This operation is only available for Direct Access indexes.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        index_name: Full index name (must be Direct Access type)
        inputs_json: JSON string with vectors and metadata
        
    Returns:
        UpsertDataResponse confirming upsert
        
    
        
    Note:
        - Only works with Direct Vector Access indexes
        - Vectors must match the dimension specified at index creation
        - Primary key values are used for upsert logic
        - Existing records with same primary key are updated
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    result = client.vector_search_indexes.upsert_data_vector_index(
        index_name=index_name,
        inputs_json=inputs_json,
    )
    
    upserted = result.upserted_count if hasattr(result, 'upserted_count') else None
    
    return UpsertDataResponse(
        index_name=index_name,
        upserted_count=upserted,
    )


def delete_vector_search_data(
    host_credential_key: str,
    token_credential_key: str,
    index_name: str,
    primary_keys: List[str],
) -> DeleteDataResponse:
    """
    Delete data from a Direct Vector Access Index.
    
    Deletes specific vectors from a Direct Vector Access Index by primary key.
    This operation is only available for Direct Access indexes.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        index_name: Full index name (must be Direct Access type)
        primary_keys: List of primary key values to delete
        
    Returns:
        DeleteDataResponse confirming deletion
        
    
        
    Note:
        - Only works with Direct Vector Access indexes
        - Non-existent primary keys are silently ignored
        - Deletion is permanent and cannot be undone
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    result = client.vector_search_indexes.delete_data_vector_index(
        index_name=index_name,
        primary_keys=primary_keys,
    )
    
    deleted = result.deleted_count if hasattr(result, 'deleted_count') else None
    
    return DeleteDataResponse(
        index_name=index_name,
        deleted_count=deleted,
    )


# ============================================================================
# Delta Sync Index Operations
# ============================================================================

def sync_vector_search_index(
    host_credential_key: str,
    token_credential_key: str,
    index_name: str,
) -> SyncIndexResponse:
    """
    Trigger sync for a Delta Sync Index.
    
    Manually triggers synchronization for a Delta Sync Index to update the
    index with the latest data from the source Delta Table.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        index_name: Full index name (must be Delta Sync type)
        
    Returns:
        SyncIndexResponse confirming sync trigger
        
    
        
    Note:
        - Only works with Delta Sync indexes
        - For TRIGGERED pipeline type, this starts a sync
        - For CONTINUOUS pipeline type, sync happens automatically
        - Sync process may take several minutes depending on data size
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.vector_search_indexes.sync_index(index_name=index_name)
    
    return SyncIndexResponse(
        index_name=index_name,
    )

