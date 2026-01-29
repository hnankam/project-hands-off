"""
Unity Catalog Volumes Management Tools

This module provides comprehensive volume management operations for Unity Catalog,
enabling file storage for unstructured data, ML artifacts, libraries, and ETL workloads.
"""

from typing import Optional
from itertools import islice
from cache import get_workspace_client
from models import (
    VolumeInfoModel,
    EncryptionDetailsModel,
    ListVolumesResponse,
    CreateVolumeResponse,
    DeleteVolumeResponse,
    UpdateVolumeResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_volume_to_model(volume) -> VolumeInfoModel:
    """Convert SDK VolumeInfo to Pydantic model."""
    encryption_details = None
    if volume.encryption_details:
        encryption_details = EncryptionDetailsModel(
            sse_encryption_details=volume.encryption_details.as_dict() if hasattr(volume.encryption_details, 'as_dict') else None
        )
    
    return VolumeInfoModel(
        name=volume.name,
        full_name=volume.full_name,
        catalog_name=volume.catalog_name,
        schema_name=volume.schema_name,
        volume_id=volume.volume_id,
        volume_type=volume.volume_type.value if volume.volume_type else None,
        storage_location=volume.storage_location,
        comment=volume.comment,
        owner=volume.owner,
        created_at=volume.created_at,
        created_by=volume.created_by,
        updated_at=volume.updated_at,
        updated_by=volume.updated_by,
        metastore_id=volume.metastore_id,
        access_point=volume.access_point,
        encryption_details=encryption_details,
        browse_only=volume.browse_only,
    )


# ============================================================================
# Volume Discovery and Inspection
# ============================================================================

def list_volumes(
    host_credential_key: str,
    token_credential_key: str,
    catalog_name: str,
    schema_name: str,
    limit: int = 25,
    page: int = 0,
    include_browse: Optional[bool] = None,
) -> ListVolumesResponse:
    """
    Retrieve a paginated list of volumes within a Unity Catalog schema.
    
    This function returns volume metadata for all accessible volumes in the specified catalog
    and schema. Volumes are managed storage locations for files (not tables). Use this to
    discover available storage volumes, check volume types (managed/external), or list file assets.
    
    Access Behavior: Results automatically filtered based on caller's privileges. Only volumes
    the user has permission to access are returned.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        catalog_name: Name of the Unity Catalog containing the schema. Required. Must be exact match
        schema_name: Name of the schema containing the volumes. Required. Must be exact match
        limit: Number of volumes to return in a single request. Must be positive integer. Default: 25. Maximum: 20 when include_browse=True
        page: Zero-indexed page number for pagination. Default: 0
        include_browse: Boolean flag to include volumes where user has only browse permission (no READ_VOLUME). Default: None (excluded)
        
    Returns:
        ListVolumesResponse with list of volumes and pagination info
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Cap limit at 20 when include_browse is True to reduce response size
        effective_limit = min(limit, 20) if include_browse else limit
    
        response = client.volumes.list(
            catalog_name=catalog_name,
            schema_name=schema_name,
            include_browse=include_browse,
        )
    
        skip = page * effective_limit
        volumes_iterator = islice(response, skip, skip + effective_limit)
    
        volumes_list = []
        for volume in volumes_iterator:
            volumes_list.append(_convert_volume_to_model(volume))
    
        # Check for more results
        has_more = False
        try:
            next(response)
            has_more = True

        except StopIteration:
            has_more = False
        
        return ListVolumesResponse(
            volumes=volumes_list,
            count=len(volumes_list),
            has_more=has_more,
        )
    except Exception as e:
        return ListVolumesResponse(
            volumes=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list volumes: {str(e)}",
        )


def get_volume(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    include_browse: Optional[bool] = None,
) -> Optional[VolumeInfoModel]:
    """
    Get volume details.
    
    Gets a volume from the metastore for a specific catalog and schema,
    including storage location, type, owner, and metadata.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Full name of the volume (catalog.schema.volume)
        include_browse: Include volumes with browse-only access
        
    Returns:
        VolumeInfoModel with complete volume details
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        volume = client.volumes.read(
            name=name,
            include_browse=include_browse,
        )
    
        return _convert_volume_to_model(volume)

    except Exception as e:
        return VolumeInfoModel(
            full_name=name,
            error_message=f"Failed to get volume: {str(e)}",
        )


# ============================================================================
# Volume Management
# ============================================================================

def create_volume(
    host_credential_key: str,
    token_credential_key: str,
    catalog_name: str,
    schema_name: str,
    name: str,
    volume_type: str,
    comment: Optional[str] = None,
    storage_location: Optional[str] = None,
) -> CreateVolumeResponse:
    """
    Create a new volume.
    
    Creates either an external volume (in specified location) or a managed
    volume (in default location). The user must have CREATE VOLUME privilege
    on the parent schema.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        catalog_name: Name of parent catalog
        schema_name: Name of parent schema
        name: Name of the volume (not full name)
        volume_type: Type of volume ("MANAGED" or "EXTERNAL")
        comment: User-provided description
        storage_location: Cloud storage location (required for EXTERNAL volumes)
        
    Returns:
        CreateVolumeResponse with created volume information
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        from databricks.sdk.service.catalog import VolumeType
    
        volume = client.volumes.create(
            catalog_name=catalog_name,
            schema_name=schema_name,
            name=name,
            volume_type=VolumeType(volume_type),
            comment=comment,
            storage_location=storage_location,
        )
    
        return CreateVolumeResponse(
            volume_info=_convert_volume_to_model(volume),
        )

    except Exception as e:
        return CreateVolumeResponse(
            volume_info=None,
            error_message=f"Failed to create volume: {str(e)}",
        )


def delete_volume(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
) -> DeleteVolumeResponse:
    """
    Delete a volume.
    
    Deletes a volume from the specified parent catalog and schema. The caller
    must be a metastore admin or owner of the volume.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Full name of the volume (catalog.schema.volume)
        
    Returns:
        DeleteVolumeResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.volumes.delete(name=name)
    
        return DeleteVolumeResponse(name=name)

    except Exception as e:
        return DeleteVolumeResponse(
            name=name,
            error_message=f"Failed to delete volume: {str(e)}",
        )


def update_volume(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    new_name: Optional[str] = None,
    comment: Optional[str] = None,
    owner: Optional[str] = None,
) -> UpdateVolumeResponse:
    """
    Update volume metadata.
    
    Updates the specified volume under the specified parent catalog and schema.
    Currently only the name, owner, or comment can be updated.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Full name of the volume (catalog.schema.volume)
        new_name: New name for the volume (not full name)
        comment: New description for the volume
        owner: New owner username
        
    Returns:
        UpdateVolumeResponse with updated volume information
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        volume = client.volumes.update(
            name=name,
            new_name=new_name,
            comment=comment,
            owner=owner,
        )
    
        return UpdateVolumeResponse(
            volume_info=_convert_volume_to_model(volume),
        )

    except Exception as e:
        return UpdateVolumeResponse(
            volume_info=None,
            error_message=f"Failed to update volume: {str(e)}",
        )

