"""
Unity Catalog External Lineage Management Tools

This module provides tools for defining and managing lineage relationships between 
Databricks objects and external systems, enabling comprehensive data flow tracking
and column-level lineage mappings.
"""

from typing import Optional, List, Dict, Any
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
    """Convert dictionary representation to SDK ExternalLineageObject."""
    from databricks.sdk.service.catalog import (
        ExternalLineageObject,
        ExternalLineageTable,
        ExternalLineagePath,
        ExternalLineageModelVersion,
        ExternalLineageExternalMetadata,
    )
    
    kwargs = {}
    
    if 'table' in obj_dict and obj_dict['table']:
        kwargs['table'] = ExternalLineageTable(name=obj_dict['table'].get('name'))
    
    if 'path' in obj_dict and obj_dict['path']:
        kwargs['path'] = ExternalLineagePath(url=obj_dict['path'].get('url'))
    
    if 'model_version' in obj_dict and obj_dict['model_version']:
        kwargs['model_version'] = ExternalLineageModelVersion(
            name=obj_dict['model_version'].get('name'),
            version=obj_dict['model_version'].get('version')
        )
    
    if 'external_metadata' in obj_dict and obj_dict['external_metadata']:
        kwargs['external_metadata'] = ExternalLineageExternalMetadata(
            name=obj_dict['external_metadata'].get('name')
        )
    
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
    """Convert object dict to readable string."""
    if obj_dict.get('table'):
        return f"table:{obj_dict['table'].get('name', 'unknown')}"
    elif obj_dict.get('path'):
        return f"path:{obj_dict['path'].get('url', 'unknown')}"
    elif obj_dict.get('model_version'):
        mv = obj_dict['model_version']
        return f"model:{mv.get('name', 'unknown')}@{mv.get('version', 'unknown')}"
    elif obj_dict.get('external_metadata'):
        return f"external:{obj_dict['external_metadata'].get('name', 'unknown')}"
    return "unknown"


# ============================================================================
# External Lineage Discovery
# ============================================================================

def list_external_lineage(
    host_credential_key: str,
    token_credential_key: str,
    object_info: Dict[str, Any],
    lineage_direction: str,
    page_size: Optional[int] = None,
    page_token: Optional[str] = None,
) -> ListExternalLineageResponse:
    """
    List external lineage relationships.
    
    Lists external lineage relationships of a Databricks object or external 
    metadata given a supplied direction (upstream or downstream).
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        object_info: Object to query lineage for (dict with 'table', 'path', 'model_version', or 'external_metadata')
        lineage_direction: Direction to query ("UPSTREAM" or "DOWNSTREAM")
        page_size: Maximum number of relationships to return (max 1000)
        page_token: Opaque token for next page of results
        
    Returns:
        ListExternalLineageResponse with list of lineage relationships
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.catalog import LineageDirection
    
    # Convert object_info dict to SDK object
    obj = _convert_object_dict_to_sdk(object_info)
    direction = LineageDirection(lineage_direction)
    
    relationships = []
    
    for lineage_info in client.external_lineage.list_external_lineage_relationships(
        object_info=obj,
        lineage_direction=direction,
        page_size=page_size,
        page_token=page_token,
    ):
        # Convert to dict for response
        rel_dict = lineage_info.as_dict() if hasattr(lineage_info, 'as_dict') else {}
        relationships.append(rel_dict)
    
    return ListExternalLineageResponse(
        lineage_relationships=relationships,
        count=len(relationships),
        next_page_token=None,  # SDK handles pagination internally
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
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        source: Source object (dict with 'table', 'path', 'model_version', or 'external_metadata')
        target: Target object (dict with 'table', 'path', 'model_version', or 'external_metadata')
        id: Optional unique identifier for the relationship
        columns: Optional column-level lineage mappings (list of {"source": "col1", "target": "col2"})
        properties: Optional custom properties (key-value pairs)
        
    Returns:
        CreateExternalLineageResponse with created relationship
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.catalog import (
        CreateRequestExternalLineage,
        ColumnRelationship,
    )
    
    # Convert source and target to SDK objects
    source_obj = _convert_object_dict_to_sdk(source)
    target_obj = _convert_object_dict_to_sdk(target)
    
    # Convert column relationships if provided
    column_rels = None
    if columns:
        column_rels = [
            ColumnRelationship(source=col.get('source'), target=col.get('target'))
            for col in columns
        ]
    
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
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        source: Source object (dict with 'table', 'path', 'model_version', or 'external_metadata')
        target: Target object (dict with 'table', 'path', 'model_version', or 'external_metadata')
        id: Optional unique identifier for the relationship
        
    Returns:
        DeleteExternalLineageResponse confirming deletion
    """
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
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        source: Source object (dict with 'table', 'path', 'model_version', or 'external_metadata')
        target: Target object (dict with 'table', 'path', 'model_version', or 'external_metadata')
        update_mask: Field mask specifying which fields to update (comma-separated, e.g. "columns,properties")
        id: Optional unique identifier for the relationship
        columns: Optional new column-level lineage mappings
        properties: Optional new custom properties
        
    Returns:
        UpdateExternalLineageResponse with updated relationship
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.catalog import (
        UpdateRequestExternalLineage,
        ColumnRelationship,
    )
    
    # Convert source and target to SDK objects
    source_obj = _convert_object_dict_to_sdk(source)
    target_obj = _convert_object_dict_to_sdk(target)
    
    # Convert column relationships if provided
    column_rels = None
    if columns:
        column_rels = [
            ColumnRelationship(source=col.get('source'), target=col.get('target'))
            for col in columns
        ]
    
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

