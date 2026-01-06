"""
Unity Catalog Volumes Management Tools

This module provides comprehensive volume management operations for Unity Catalog,
enabling file storage for unstructured data, ML artifacts, libraries, and ETL workloads.
"""

from typing import Optional
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
    max_results: Optional[int] = None,
    page_token: Optional[str] = None,
    include_browse: Optional[bool] = None,
) -> ListVolumesResponse:
    """
    List volumes in a schema.
    
    Gets an array of volumes for the current metastore under the parent catalog
    and schema. The returned volumes are filtered based on the privileges of the
    calling user.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        catalog_name: Name of parent catalog
        schema_name: Parent schema of volumes
        max_results: Maximum number of volumes to return (0 for server default)
        page_token: Opaque token for next page of results
        include_browse: Include volumes with browse-only access
        
    Returns:
        ListVolumesResponse with list of volumes and pagination info
        
    Example:
        # List all volumes in a schema
        volumes = list_volumes(
            host, token,
            catalog_name="main",
            schema_name="default"
        )
        for vol in volumes.volumes:
            print(f"{vol.full_name}")
            print(f"  Type: {vol.volume_type}")
            print(f"  Owner: {vol.owner}")
            print(f"  Location: {vol.storage_location}")
        
        # List with pagination
        volumes = list_volumes(
            host, token,
            catalog_name="main",
            schema_name="ml_datasets",
            max_results=50
        )
        print(f"Found {volumes.count} volumes")
        
        # List managed volumes only
        volumes = list_volumes(host, token, "main", "default")
        managed = [v for v in volumes.volumes if v.volume_type == "MANAGED"]
        print(f"Managed volumes: {len(managed)}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    volumes_list = []
    next_token = None
    
    for volume in client.volumes.list(
        catalog_name=catalog_name,
        schema_name=schema_name,
        max_results=max_results,
        page_token=page_token,
        include_browse=include_browse,
    ):
        volumes_list.append(_convert_volume_to_model(volume))
    
    return ListVolumesResponse(
        volumes=volumes_list,
        count=len(volumes_list),
        next_page_token=next_token,
    )


def get_volume(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    include_browse: Optional[bool] = None,
) -> VolumeInfoModel:
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
        
    Example:
        # Get full volume details
        vol = get_volume(
            host, token,
            name="main.default.ml_data"
        )
        print(f"Volume: {vol.full_name}")
        print(f"Type: {vol.volume_type}")
        print(f"Owner: {vol.owner}")
        print(f"Storage: {vol.storage_location}")
        print(f"Created: {vol.created_at}")
        
        # Check if volume is managed or external
        vol = get_volume(host, token, "main.ml.training_data")
        if vol.volume_type == "MANAGED":
            print("Volume is managed by Databricks")
        elif vol.volume_type == "EXTERNAL":
            print(f"External volume at: {vol.storage_location}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    volume = client.volumes.read(
        name=name,
        include_browse=include_browse,
    )
    
    return _convert_volume_to_model(volume)


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
        
    Example:
        # Create managed volume for ML artifacts
        result = create_volume(
            host, token,
            catalog_name="main",
            schema_name="ml",
            name="model_artifacts",
            volume_type="MANAGED",
            comment="ML model artifacts storage"
        )
        print(f"Created: {result.volume_info.full_name}")
        print(f"Location: {result.volume_info.storage_location}")
        
        # Create external volume for shared data
        result = create_volume(
            host, token,
            catalog_name="main",
            schema_name="data",
            name="external_datasets",
            volume_type="EXTERNAL",
            storage_location="s3://my-bucket/datasets/",
            comment="External datasets from S3"
        )
        print(f"External volume: {result.volume_info.full_name}")
        
        # Create volume for unstructured data
        result = create_volume(
            host, token,
            catalog_name="main",
            schema_name="analytics",
            name="images",
            volume_type="MANAGED",
            comment="Image data for computer vision"
        )
    """
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
        
    Example:
        # Delete a volume
        result = delete_volume(
            host, token,
            name="main.default.old_data"
        )
        print(result.message)
        
        # Delete temporary volume
        result = delete_volume(
            host, token,
            name="main.ml.temp_artifacts"
        )
        
        # Clean up all test volumes
        volumes = list_volumes(host, token, "main", "test")
        for vol in volumes.volumes:
            if vol.name.startswith("test_"):
                delete_volume(host, token, vol.full_name)
                print(f"Deleted: {vol.full_name}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.volumes.delete(name=name)
    
    return DeleteVolumeResponse(name=name)


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
        
    Example:
        # Update volume comment
        result = update_volume(
            host, token,
            name="main.default.ml_data",
            comment="Updated: ML training datasets"
        )
        print(f"Updated comment: {result.volume_info.comment}")
        
        # Transfer volume ownership
        result = update_volume(
            host, token,
            name="main.ml.artifacts",
            owner="data-engineer@company.com"
        )
        print(f"New owner: {result.volume_info.owner}")
        
        # Rename volume
        result = update_volume(
            host, token,
            name="main.default.old_name",
            new_name="new_name"
        )
        print(f"Renamed to: {result.volume_info.full_name}")
        
        # Bulk ownership transfer
        volumes = list_volumes(host, token, "main", "default")
        new_owner = "analytics-team@company.com"
        for vol in volumes.volumes:
            if vol.owner == "old-owner@company.com":
                update_volume(
                    host, token,
                    name=vol.full_name,
                    owner=new_owner
                )
                print(f"Transferred {vol.full_name}")
    """
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

