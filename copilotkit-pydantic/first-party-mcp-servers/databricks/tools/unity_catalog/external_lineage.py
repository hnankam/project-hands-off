"""
Unity Catalog External Lineage Management Tools

This module provides tools for defining and managing lineage relationships between 
Databricks objects and external systems, enabling comprehensive data flow tracking
and column-level lineage mappings.
"""

from typing import Optional, List, Dict, Any
from itertools import islice
from cache import get_workspace_client
from models import (
    ExternalLineageRelationshipModel,
    ExternalLineageObjectModel,
    ExternalLineageTableModel,
    ExternalLineagePathModel,
    ExternalLineageModelVersionModel,
    ExternalLineageExternalMetadataModel,
    ColumnRelationshipModel,
    ListExternalLineageResponse,
    CreateExternalLineageResponse,
    DeleteExternalLineageResponse,
    UpdateExternalLineageResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_object_dict_to_sdk(obj_dict: Dict[str, Any]):
    """Convert dictionary representation to SDK ExternalLineageObject.
    
    Expected format:
    - Table: {"table": {"name": "catalog.schema.table"}}
    - Path: {"path": {"url": "s3://bucket/path"}}
    - Model Version: {"model_version": {"name": "model_name", "version": "1"}}
    - External Metadata: {"external_metadata": {"name": "system.object"}}
    """
    from databricks.sdk.service.catalog import (
        ExternalLineageObject,
        ExternalLineageTable,
        ExternalLineagePath,
        ExternalLineageModelVersion,
        ExternalLineageExternalMetadata,
    )
    
    kwargs = {}
    
    if 'table' in obj_dict and obj_dict['table']:
        kwargs['table'] = ExternalLineageTable(name=obj_dict['table']['name'])
    
    if 'path' in obj_dict and obj_dict['path']:
        kwargs['path'] = ExternalLineagePath(url=obj_dict['path']['url'])
    
    if 'model_version' in obj_dict and obj_dict['model_version']:
        mv = obj_dict['model_version']
        kwargs['model_version'] = ExternalLineageModelVersion(name=mv['name'], version=mv['version'])
    
    if 'external_metadata' in obj_dict and obj_dict['external_metadata']:
        kwargs['external_metadata'] = ExternalLineageExternalMetadata(name=obj_dict['external_metadata']['name'])
    
    return ExternalLineageObject(**kwargs)


def _convert_object_to_model(obj) -> ExternalLineageObjectModel:
    """Convert SDK ExternalLineageObject to Pydantic model."""
    kwargs = {}
    
    if obj.table:
        kwargs['table'] = ExternalLineageTableModel(name=obj.table.name)
    
    if obj.path:
        kwargs['path'] = ExternalLineagePathModel(url=obj.path.url)
    
    if obj.model_version:
        kwargs['model_version'] = ExternalLineageModelVersionModel(
            name=obj.model_version.name,
            version=obj.model_version.version
        )
    
    if obj.external_metadata:
        kwargs['external_metadata'] = ExternalLineageExternalMetadataModel(
            name=obj.external_metadata.name
        )
    
    return ExternalLineageObjectModel(**kwargs)


def _convert_relationship_to_model(rel) -> ExternalLineageRelationshipModel:
    """Convert SDK ExternalLineageRelationship to Pydantic model."""
    columns = None
    if rel.columns:
        columns = [
            ColumnRelationshipModel(source=col.source, target=col.target)
            for col in rel.columns
        ]
    
    return ExternalLineageRelationshipModel(
        source=_convert_object_to_model(rel.source),
        target=_convert_object_to_model(rel.target),
        id=rel.id,
        columns=columns,
        properties=rel.properties,
    )


def _object_to_string(obj_dict: Dict[str, Any]) -> str:
    """Convert object dict to readable string.
    
    Expects nested dictionary format:
    - {"table": {"name": "..."}}
    - {"path": {"url": "..."}}
    - {"model_version": {"name": "...", "version": "..."}}
    - {"external_metadata": {"name": "..."}}
    """
    if obj_dict.get('table'):
        table_val = obj_dict['table']
        if isinstance(table_val, dict):
            return f"table:{table_val.get('name', 'unknown')}"
        else:
            # Fallback for backward compatibility in error messages
            return f"table:{table_val}"
    elif obj_dict.get('path'):
        path_val = obj_dict['path']
        if isinstance(path_val, dict):
            return f"path:{path_val.get('url', 'unknown')}"
        else:
            return f"path:{path_val}"
    elif obj_dict.get('model_version'):
        mv = obj_dict['model_version']
        if isinstance(mv, dict):
            return f"model:{mv.get('name', 'unknown')}@{mv.get('version', 'unknown')}"
        else:
            return f"model:{mv}"
    elif obj_dict.get('external_metadata'):
        em_val = obj_dict['external_metadata']
        if isinstance(em_val, dict):
            return f"external:{em_val.get('name', 'unknown')}"
        else:
            return f"external:{em_val}"
    return "unknown"


# ============================================================================
# External Lineage Discovery
# ============================================================================

def list_external_lineage(
    host_credential_key: str,
    token_credential_key: str,
    object_info: Dict[str, Any],
    lineage_direction: str,
    limit: int = 25,
    page: int = 0,
) -> ListExternalLineageResponse:
    """
    List external lineage relationships.
    
    Lists external lineage relationships of a Databricks object or external 
    metadata given a supplied direction (upstream or downstream).
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        object_info: Object to query lineage for. Must use nested dictionary format:
            - Table: {"table": {"name": "catalog.schema.table"}}
            - Path: {"path": {"url": "s3://bucket/path"}}
            - Model Version: {"model_version": {"name": "model_name", "version": "1"}}
            - External Metadata: {"external_metadata": {"name": "system.object"}}
        lineage_direction: Direction to query. Must be "UPSTREAM" or "DOWNSTREAM"
        limit: Number of relationships to return in a single request. Must be positive integer. Default: 25
        page: Zero-indexed page number for pagination. Default: 0
        
    Returns:
        ListExternalLineageResponse containing:
        - lineage_relationships: List of lineage relationship objects with source, target, and column mappings
        - count: Integer number of relationships returned in this page (0 to limit)
        - has_more: Boolean indicating if additional relationships exist beyond this page
        
    Pagination:
        - Returns up to `limit` relationships per call
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available
    """
    try:
        import traceback
        
        client = get_workspace_client(host_credential_key, token_credential_key)
    
        from databricks.sdk.service.catalog import LineageDirection
        
        # Convert object_info dict to SDK object
        obj = _convert_object_dict_to_sdk(object_info)
        direction = LineageDirection(lineage_direction)
    
        # Get iterator of all relationships
        response = client.external_lineage.list_external_lineage_relationships(
            object_info=obj,
            lineage_direction=direction,
        )
        
        # Apply pagination using islice
        skip = page * limit
        relationships_iterator = islice(response, skip, skip + limit)
    
        relationships = []
        for lineage_info in relationships_iterator:
            # Convert to dict for response
            rel_dict = lineage_info.as_dict() if hasattr(lineage_info, 'as_dict') else {}
            relationships.append(rel_dict)
    
        # Check for more results
        has_more = False
        try:
            next(response)
            has_more = True
        except StopIteration:
            has_more = False
        
        return ListExternalLineageResponse(
            lineage_relationships=relationships,
            count=len(relationships),
            has_more=has_more,
        )

    except Exception as e:
        error_trace = traceback.format_exc()
        return ListExternalLineageResponse(
            lineage_relationships=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list external lineage: {str(e)}\n\nTraceback:\n{error_trace}",
        )


# ============================================================================
# External Lineage Management
# ============================================================================

def create_external_lineage(
    host_credential_key: str,
    token_credential_key: str,
    source: Dict[str, Any],
    target: Dict[str, Any],
    id: Optional[str] = None,
    columns: Optional[List[Dict[str, str]]] = None,
    properties: Optional[Dict[str, str]] = None,
) -> CreateExternalLineageResponse:
    """
    Create external lineage relationship.
    
    Creates a lineage relationship between a Databricks or external metadata 
    object and another external metadata object. Supports column-level lineage.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        source: Source object. Must use nested dictionary format:
            - Table: {"table": {"name": "catalog.schema.table"}}
            - Path: {"path": {"url": "s3://bucket/path"}}
            - Model Version: {"model_version": {"name": "model_name", "version": "1"}}
            - External Metadata: {"external_metadata": {"name": "system.object"}}
        target: Target object. Must use nested dictionary format (same options as source)
        id: Optional unique identifier for the relationship
        columns: Optional column-level lineage mappings (list of {"source": "col1", "target": "col2"})
        properties: Optional custom properties (key-value pairs)
        
    Returns:
        CreateExternalLineageResponse with created relationship
    """
    try:
        import traceback
        
        client = get_workspace_client(host_credential_key, token_credential_key)
    
        from databricks.sdk.service.catalog import (
            CreateRequestExternalLineage,
            ColumnRelationship,
        )
        
        # Convert source and target to SDK objects
        source_obj = _convert_object_dict_to_sdk(source)
        target_obj = _convert_object_dict_to_sdk(target)
    
        # Convert column relationships if provided
        column_rels = [ColumnRelationship(source=col['source'], target=col['target']) for col in columns] if columns else None
    
        # Create the lineage request
        lineage_req = CreateRequestExternalLineage(
            source=source_obj,
            target=target_obj,
            id=id,
            columns=column_rels,
            properties=properties,
        )
    
        relationship = client.external_lineage.create_external_lineage_relationship(
            external_lineage_relationship=lineage_req
        )
    
        return CreateExternalLineageResponse(
            relationship=_convert_relationship_to_model(relationship),
        )

    except Exception as e:
        error_trace = traceback.format_exc()
        return CreateExternalLineageResponse(
            relationship=None,
            error_message=f"Failed to create external lineage: {str(e)}\n\nTraceback:\n{error_trace}",
        )


def delete_external_lineage(
    host_credential_key: str,
    token_credential_key: str,
    source: Dict[str, Any],
    target: Dict[str, Any],
    id: Optional[str] = None,
) -> DeleteExternalLineageResponse:
    """
    Delete external lineage relationship.
    
    Deletes a lineage relationship between a Databricks or external metadata 
    object and another external metadata object.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        source: Source object. Must use nested dictionary format:
            - Table: {"table": {"name": "catalog.schema.table"}}
            - Path: {"path": {"url": "s3://bucket/path"}}
            - Model Version: {"model_version": {"name": "model_name", "version": "1"}}
            - External Metadata: {"external_metadata": {"name": "system.object"}}
        target: Target object. Must use nested dictionary format (same options as source)
        id: Optional unique identifier for the relationship
        
    Returns:
        DeleteExternalLineageResponse confirming deletion
    """
    try:
        import traceback
        
        client = get_workspace_client(host_credential_key, token_credential_key)
    
        from databricks.sdk.service.catalog import DeleteRequestExternalLineage
        
        # Convert source and target to SDK objects
        source_obj = _convert_object_dict_to_sdk(source)
        target_obj = _convert_object_dict_to_sdk(target)
    
        # Create the delete request
        delete_req = DeleteRequestExternalLineage(
            source=source_obj,
            target=target_obj,
            id=id,
        )
    
        client.external_lineage.delete_external_lineage_relationship(
            external_lineage_relationship=delete_req
        )
    
        return DeleteExternalLineageResponse(
            source=_object_to_string(source),
            target=_object_to_string(target),
        )

    except Exception as e:
        error_trace = traceback.format_exc()
        return DeleteExternalLineageResponse(
            source=_object_to_string(source) if isinstance(source, dict) else str(source),
            target=_object_to_string(target) if isinstance(target, dict) else str(target),
            error_message=f"Failed to delete external lineage: {str(e)}\n\nTraceback:\n{error_trace}",
        )


def update_external_lineage(
    host_credential_key: str,
    token_credential_key: str,
    source: Dict[str, Any],
    target: Dict[str, Any],
    update_mask: str,
    id: Optional[str] = None,
    columns: Optional[List[Dict[str, str]]] = None,
    properties: Optional[Dict[str, str]] = None,
) -> UpdateExternalLineageResponse:
    """
    Update external lineage relationship.
    
    Updates a lineage relationship between a Databricks or external metadata 
    object and another external metadata object.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        source: Source object. Must use nested dictionary format:
            - Table: {"table": {"name": "catalog.schema.table"}}
            - Path: {"path": {"url": "s3://bucket/path"}}
            - Model Version: {"model_version": {"name": "model_name", "version": "1"}}
            - External Metadata: {"external_metadata": {"name": "system.object"}}
        target: Target object. Must use nested dictionary format (same options as source)
        update_mask: Field mask specifying which fields to update (comma-separated, e.g. "columns,properties")
        id: Optional unique identifier for the relationship
        columns: Optional new column-level lineage mappings (list of {"source": "col1", "target": "col2"})
        properties: Optional new custom properties (key-value pairs)
        
    Returns:
        UpdateExternalLineageResponse with updated relationship
    """
    try:
        import traceback
        
        client = get_workspace_client(host_credential_key, token_credential_key)
    
        from databricks.sdk.service.catalog import (
            UpdateRequestExternalLineage,
            ColumnRelationship,
        )
        
        # Convert source and target to SDK objects
        source_obj = _convert_object_dict_to_sdk(source)
        target_obj = _convert_object_dict_to_sdk(target)
    
        # Convert column relationships if provided
        column_rels = [ColumnRelationship(source=col['source'], target=col['target']) for col in columns] if columns else None
    
        # Create the update request
        update_req = UpdateRequestExternalLineage(
            source=source_obj,
            target=target_obj,
            id=id,
            columns=column_rels,
            properties=properties,
        )
    
        relationship = client.external_lineage.update_external_lineage_relationship(
            external_lineage_relationship=update_req,
            update_mask=update_mask,
        )
    
        return UpdateExternalLineageResponse(
            relationship=_convert_relationship_to_model(relationship),
        )

    except Exception as e:
        error_trace = traceback.format_exc()
        return UpdateExternalLineageResponse(
            relationship=None,
            error_message=f"Failed to update external lineage: {str(e)}\n\nTraceback:\n{error_trace}",
        )

