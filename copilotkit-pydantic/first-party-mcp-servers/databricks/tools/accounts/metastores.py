"""
Account Metastores Tools

This module provides tools for managing Unity Catalog metastores at the account level.
Metastores contain catalogs that can be associated with workspaces. These are account-level
operations that require AccountClient authentication.

All credential parameters use credential keys (globally unique identifiers) that are resolved
server-side from the workspace_credentials table.
"""

from typing import Optional, Dict, Any
from cache import get_account_client
from models import (
    AccountMetastoreInfoModel,
    CreateAccountMetastoreResponse,
    GetAccountMetastoreResponse,
    ListAccountMetastoresResponse,
    UpdateAccountMetastoreResponse,
    DeleteAccountMetastoreResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_to_metastore_info(metastore) -> AccountMetastoreInfoModel:
    """Convert SDK MetastoreInfo to Pydantic model."""
    return AccountMetastoreInfoModel(
        metastore_id=metastore.metastore_id if hasattr(metastore, 'metastore_id') else None,
        name=metastore.name if hasattr(metastore, 'name') else None,
        storage_root=metastore.storage_root if hasattr(metastore, 'storage_root') else None,
        region=metastore.region if hasattr(metastore, 'region') else None,
        cloud=metastore.cloud if hasattr(metastore, 'cloud') else None,
        owner=metastore.owner if hasattr(metastore, 'owner') else None,
        created_at=metastore.created_at if hasattr(metastore, 'created_at') else None,
        created_by=metastore.created_by if hasattr(metastore, 'created_by') else None,
        updated_at=metastore.updated_at if hasattr(metastore, 'updated_at') else None,
        updated_by=metastore.updated_by if hasattr(metastore, 'updated_by') else None,
        global_metastore_id=metastore.global_metastore_id if hasattr(metastore, 'global_metastore_id') else None,
        delta_sharing_scope=metastore.delta_sharing_scope if hasattr(metastore, 'delta_sharing_scope') else None,
        delta_sharing_recipient_token_lifetime_in_seconds=metastore.delta_sharing_recipient_token_lifetime_in_seconds if hasattr(metastore, 'delta_sharing_recipient_token_lifetime_in_seconds') else None,
        delta_sharing_organization_name=metastore.delta_sharing_organization_name if hasattr(metastore, 'delta_sharing_organization_name') else None,
    )


# ============================================================================
# Account Metastore Management
# ============================================================================

def create_account_metastore(
    host_credential_key: str,
    account_id_credential_key: str,
    token_credential_key: str,
    metastore_config: Dict[str, Any],
) -> CreateAccountMetastoreResponse:
    """
    Create a Unity Catalog metastore.
    
    Creates a new Unity Catalog metastore at the account level. Metastores
    contain catalogs that can be associated with workspaces.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks account console URL
        account_id_credential_key: Globally unique key for the credential containing Databricks account ID
        token_credential_key: Globally unique key for the credential containing authentication token
        metastore_config: Metastore configuration dictionary
        
    Returns:
        CreateAccountMetastoreResponse with created metastore info
        
    Example:
        # Create a new metastore
        response = create_account_metastore(
            host_credential_key=host_credential_key,
            account_id_credential_key=account_id_credential_key,
            token_credential_key=token_credential_key,
            metastore_config={
                "name": "my-metastore",
                "storage_root": "s3://my-bucket/metastore",
                "region": "us-west-2"
            }
        )
        print(f"Created metastore: {response.metastore.metastore_id}")
        
    Note:
        - Metastore names must be unique within an account
        - Storage root must be a valid cloud storage path
        - Region must match the cloud provider region format
    """
    client = get_account_client(host_credential_key, account_id_credential_key, token_credential_key)
    
    from databricks.sdk.service.catalog import CreateAccountsMetastore
    
    # Create metastore spec from config
    metastore_spec = CreateAccountsMetastore.from_dict(metastore_config)
    
    # Create the metastore
    response = client.metastores.create(metastore_info=metastore_spec)
    
    # Extract metastore info from response
    metastore_info = response.metastore_info if hasattr(response, 'metastore_info') else response
    
    return CreateAccountMetastoreResponse(
        metastore=_convert_to_metastore_info(metastore_info),
    )


def get_account_metastore(
    host_credential_key: str,
    account_id_credential_key: str,
    token_credential_key: str,
    metastore_id: str,
) -> GetAccountMetastoreResponse:
    """
    Get a Unity Catalog metastore.
    
    Retrieves detailed information about a specific metastore.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks account console URL
        account_id_credential_key: Globally unique key for the credential containing Databricks account ID
        token_credential_key: Globally unique key for the credential containing authentication token
        metastore_id: Unity Catalog metastore ID
        
    Returns:
        GetAccountMetastoreResponse with metastore details
        
    Example:
        response = get_account_metastore(
            host_credential_key=host_credential_key,
            account_id_credential_key=account_id_credential_key,
            token_credential_key=token_credential_key,
            metastore_id="metastore-123"
        )
        print(f"Metastore: {response.metastore.name}")
    """
    client = get_account_client(host_credential_key, account_id_credential_key, token_credential_key)
    
    # Get the metastore
    response = client.metastores.get(metastore_id=metastore_id)
    
    # Extract metastore info from response
    metastore_info = response.metastore_info if hasattr(response, 'metastore_info') else response
    
    return GetAccountMetastoreResponse(
        metastore=_convert_to_metastore_info(metastore_info),
    )


def list_account_metastores(
    host_credential_key: str,
    account_id_credential_key: str,
    token_credential_key: str,
) -> ListAccountMetastoresResponse:
    """
    List all Unity Catalog metastores.
    
    Retrieves all metastores associated with the account.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks account console URL
        account_id_credential_key: Globally unique key for the credential containing Databricks account ID
        token_credential_key: Globally unique key for the credential containing authentication token
        
    Returns:
        ListAccountMetastoresResponse with list of metastores
        
    Example:
        response = list_account_metastores(
            host_credential_key=host_credential_key,
            account_id_credential_key=account_id_credential_key,
            token_credential_key=token_credential_key
        )
        
        print(f"Total metastores: {len(response.metastores)}")
        for metastore in response.metastores:
            print(f"Metastore: {metastore.name} ({metastore.metastore_id})")
    """
    client = get_account_client(host_credential_key, account_id_credential_key, token_credential_key)
    
    # List all metastores
    metastores = []
    for metastore in client.metastores.list():
        metastores.append(_convert_to_metastore_info(metastore))
    
    return ListAccountMetastoresResponse(
        metastores=metastores,
    )


def update_account_metastore(
    host_credential_key: str,
    account_id_credential_key: str,
    token_credential_key: str,
    metastore_id: str,
    metastore_config: Dict[str, Any],
) -> UpdateAccountMetastoreResponse:
    """
    Update a Unity Catalog metastore.
    
    Updates properties of an existing metastore.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks account console URL
        account_id_credential_key: Globally unique key for the credential containing Databricks account ID
        token_credential_key: Globally unique key for the credential containing authentication token
        metastore_id: Unity Catalog metastore ID
        metastore_config: Properties to update
        
    Returns:
        UpdateAccountMetastoreResponse with updated metastore info
        
    Example:
        response = update_account_metastore(
            host_credential_key=host_credential_key,
            account_id_credential_key=account_id_credential_key,
            token_credential_key=token_credential_key,
            metastore_id="metastore-123",
            metastore_config={
                "name": "updated-metastore-name",
                "owner": "admin@company.com"
            }
        )
        print(f"Updated: {response.metastore.name}")
    """
    client = get_account_client(host_credential_key, account_id_credential_key, token_credential_key)
    
    from databricks.sdk.service.catalog import UpdateAccountsMetastore
    
    # Create update spec from config
    update_spec = UpdateAccountsMetastore.from_dict(metastore_config)
    
    # Update the metastore
    response = client.metastores.update(
        metastore_id=metastore_id,
        metastore_info=update_spec,
    )
    
    # Extract metastore info from response
    metastore_info = response.metastore_info if hasattr(response, 'metastore_info') else response
    
    return UpdateAccountMetastoreResponse(
        metastore=_convert_to_metastore_info(metastore_info),
    )


def delete_account_metastore(
    host_credential_key: str,
    account_id_credential_key: str,
    token_credential_key: str,
    metastore_id: str,
    force: Optional[bool] = False,
) -> DeleteAccountMetastoreResponse:
    """
    Delete a Unity Catalog metastore.
    
    Deletes a metastore. Use with caution as this is a destructive operation.
    
    Args:
        host_credential_key: Globally unique key for the credential containing Databricks account console URL
        account_id_credential_key: Globally unique key for the credential containing Databricks account ID
        token_credential_key: Globally unique key for the credential containing authentication token
        metastore_id: Unity Catalog metastore ID
        force: Force deletion even if not empty (default: False)
        
    Returns:
        DeleteAccountMetastoreResponse confirming deletion
        
    Example:
        response = delete_account_metastore(
            host_credential_key=host_credential_key,
            account_id_credential_key=account_id_credential_key,
            token_credential_key=token_credential_key,
            metastore_id="metastore-123",
            force=False
        )
        print(response.message)
        
    Warning:
        - This is a destructive operation
        - Set force=True to delete non-empty metastores
        - All catalogs, schemas, and tables in the metastore will be deleted
        - This operation cannot be undone
    """
    client = get_account_client(host_credential_key, account_id_credential_key, token_credential_key)
    
    # Delete the metastore
    client.metastores.delete(
        metastore_id=metastore_id,
        force=force,
    )
    
    return DeleteAccountMetastoreResponse(
        metastore_id=metastore_id,
    )
