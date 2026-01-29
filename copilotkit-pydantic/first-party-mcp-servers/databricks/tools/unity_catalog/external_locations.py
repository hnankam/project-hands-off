"""
External Locations Tools

This module provides tools for managing external locations in Unity Catalog.
External locations combine cloud storage paths with storage credentials for
secure access control.
"""

from typing import Optional
from itertools import islice
from cache import get_workspace_client
from models import (
    ExternalLocationInfoModel,
    ListExternalLocationsResponse,
    CreateExternalLocationResponse,
    UpdateExternalLocationResponse,
    DeleteExternalLocationResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_external_location_model(external_location) -> ExternalLocationInfoModel:
    """Convert SDK ExternalLocationInfo to Pydantic model."""
    return ExternalLocationInfoModel(
        name=external_location.name,
        url=external_location.url,
        credential_name=external_location.credential_name,
        comment=external_location.comment,
        owner=external_location.owner,
        read_only=external_location.read_only,
        created_at=external_location.created_at,
        created_by=external_location.created_by,
        updated_at=external_location.updated_at,
        updated_by=external_location.updated_by,
        metastore_id=external_location.metastore_id,
        enable_file_events=external_location.enable_file_events,
        fallback=external_location.fallback,
        isolation_mode=external_location.isolation_mode.value if external_location.isolation_mode else None,
    )


# ============================================================================
# External Location Management
# ============================================================================

def list_external_locations(
    host_credential_key: str,
    token_credential_key: str,
    limit: int = 25,
    page: int = 0,
    include_browse: bool = False,
    include_unbound: bool = False,
) -> ListExternalLocationsResponse:
    """
    List external locations in Unity Catalog.
    
    Gets an array of external locations from the metastore. The caller must be a
    metastore admin, the owner of the external location, or a user that has some
    privilege on the external location.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Authentication token
        limit: Number of external locations to return. Default: 25. Capped at 20 when include_browse or include_unbound is True
        page: Zero-indexed page number for pagination. Default: 0
        include_browse: Whether to include locations with selective metadata access
        include_unbound: Whether to include locations not bound to workspace
        
    Returns:
        ListExternalLocationsResponse with external locations and pagination info
    """
    try:
        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Cap limit at 20 when expand options are True to reduce response size
        effective_limit = min(limit, 20) if (include_browse or include_unbound) else limit
    
        response = client.external_locations.list(
            include_browse=include_browse,
            include_unbound=include_unbound,
        )
    
        skip = page * effective_limit
        locations_iterator = islice(response, skip, skip + effective_limit)
    
        locations = []
        for location in locations_iterator:
            locations.append(_convert_to_external_location_model(location))
    
        # Check for more results
        has_more = False
        try:
            next(response)
            has_more = True
        except StopIteration:
            has_more = False
        
        return ListExternalLocationsResponse(
            external_locations=locations,
            count=len(locations),
            has_more=has_more,
        )
    except Exception as e:
        return ListExternalLocationsResponse(
            external_locations=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list external locations: {str(e)}",
        )


def get_external_location(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    include_browse: bool = False,
) -> Optional[ExternalLocationInfoModel]:
    """
    Get an external location from Unity Catalog.
    
    Retrieves details of a specific external location. The caller must be either a
    metastore admin, the owner of the external location, or a user that has some
    privilege on the external location.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Name of the external location
        include_browse: Whether to include selective metadata if limited access
        
    Returns:
        ExternalLocationInfoModel with location details
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        location = client.external_locations.get(
            name=name,
            include_browse=include_browse,
        )
    
        return _convert_to_external_location_model(location)

    except Exception as e:
        return ExternalLocationInfoModel(
            name=name,
            error_message=f"Failed to get external location: {str(e)}",
        )


def create_external_location(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    url: str,
    credential_name: str,
    comment: Optional[str] = None,
    read_only: bool = False,
    skip_validation: bool = False,
    enable_file_events: bool = False,
    fallback: bool = False,
) -> CreateExternalLocationResponse:
    """
    Create a new external location in Unity Catalog.
    
    Creates a new external location entry in the metastore. The caller must be a
    metastore admin or have the CREATE_EXTERNAL_LOCATION privilege on both the
    metastore and the associated storage credential.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Name of the external location
        url: Path URL of the external location (e.g., s3://bucket/path)
        credential_name: Name of the storage credential to use
        comment: User-provided description
        read_only: Whether the external location is read-only
        skip_validation: Skip validation of the storage credential
        enable_file_events: Whether to enable file events
        fallback: Enable fallback to cluster credentials if UC credentials insufficient
        
    Returns:
        CreateExternalLocationResponse with created location
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        location = client.external_locations.create(
            name=name,
            url=url,
            credential_name=credential_name,
            comment=comment,
            read_only=read_only,
            skip_validation=skip_validation,
            enable_file_events=enable_file_events,
            fallback=fallback,
        )
    
        return CreateExternalLocationResponse(
            external_location=_convert_to_external_location_model(location),
        )

    except Exception as e:
        return CreateExternalLocationResponse(
            external_location=None,
            error_message=f"Failed to create external location: {str(e)}",
        )


def update_external_location(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    new_name: Optional[str] = None,
    url: Optional[str] = None,
    credential_name: Optional[str] = None,
    comment: Optional[str] = None,
    owner: Optional[str] = None,
    read_only: Optional[bool] = None,
    skip_validation: bool = False,
    force: bool = False,
    enable_file_events: Optional[bool] = None,
    fallback: Optional[bool] = None,
) -> UpdateExternalLocationResponse:
    """
    Update an external location in Unity Catalog.
    
    Updates an external location in the metastore. The caller must be the owner of
    the external location, or be a metastore admin. Admins can only update the name.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Current name of the external location
        new_name: New name for the external location
        url: New path URL of the external location
        credential_name: New storage credential name
        comment: New description
        owner: New owner of the external location
        read_only: Whether the external location should be read-only
        skip_validation: Skip validation of the storage credential
        force: Force update even if changing url invalidates dependent tables
        enable_file_events: Whether to enable file events
        fallback: Enable fallback to cluster credentials
        
    Returns:
        UpdateExternalLocationResponse with updated location
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        location = client.external_locations.update(
            name=name,
            new_name=new_name,
            url=url,
            credential_name=credential_name,
            comment=comment,
            owner=owner,
            read_only=read_only,
            skip_validation=skip_validation,
            force=force,
            enable_file_events=enable_file_events,
            fallback=fallback,
        )
    
        return UpdateExternalLocationResponse(
            external_location=_convert_to_external_location_model(location),
        )

    except Exception as e:
        return UpdateExternalLocationResponse(
            external_location=None,
            error_message=f"Failed to update external location: {str(e)}",
        )


def delete_external_location(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    force: bool = False,
) -> DeleteExternalLocationResponse:
    """
    Delete an external location from Unity Catalog.
    
    Deletes the specified external location from the metastore. The caller must be
    the owner of the external location.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Name of the external location
        force: Force deletion even if there are dependent external tables or mounts
        
    Returns:
        DeleteExternalLocationResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.external_locations.delete(
            name=name,
            force=force,
        )
    
        return DeleteExternalLocationResponse(
            name=name,
        )

    except Exception as e:
        return DeleteExternalLocationResponse(
            name=name,
            error_message=f"Failed to delete external location: {str(e)}",
        )

