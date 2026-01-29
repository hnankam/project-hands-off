"""Secret management tools for secure credential storage."""

from typing import Optional, List
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.workspace import ScopeBackendType, AclPermission
from cache import get_workspace_client
from models import (
    SecretScopeInfo,
    ListSecretScopesResponse,
    CreateSecretScopeResponse,
    DeleteSecretScopeResponse,
    SecretMetadataInfo,
    ListSecretsResponse,
    PutSecretResponse,
    DeleteSecretResponse,
    AclInfo,
    ListAclsResponse,
    PutAclResponse,
    DeleteAclResponse,
)


# ============================================================================
# Secret Scope Management
# ============================================================================

def list_secret_scopes(
    host_credential_key: str,
    token_credential_key: str,
    limit: int = 25,
    page: int = 0,
) -> ListSecretScopesResponse:
    """
    Retrieve a paginated list of secret scopes in the workspace.
    
    Secret scopes are containers for secrets used to store sensitive credentials
    like API keys, passwords, and tokens for external data sources.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        limit: Number of scopes to return in a single request. Must be positive integer. Default: 25
        page: Zero-indexed page number for pagination. Default: 0
    
    Returns:
        ListSecretScopesResponse containing:
        - scopes: List of SecretScopeInfo objects with scope metadata
        - count: Integer number of scopes returned in this page (0 to limit)
        - has_more: Boolean indicating if additional scopes exist beyond this page
        
    Pagination:
        - Returns up to `limit` scopes per call
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available
    """
    try:

        from itertools import islice
    
        client = get_workspace_client(host_credential_key, token_credential_key)
    
        response = client.secrets.list_scopes()
    
        skip = page * limit
        scopes_iterator = islice(response, skip, skip + limit)
    
        scopes = []
        for scope in scopes_iterator:
            scope_dict = scope.as_dict()
            scopes.append(SecretScopeInfo(
                name=scope_dict.get('name'),
                backend_type=scope_dict.get('backend_type'),
                keyvault_metadata=scope_dict.get('keyvault_metadata')
            ))
    
        # Check for more results
        has_more = False
        try:
            next(response)
            has_more = True

        except StopIteration:
            has_more = False
        
        return ListSecretScopesResponse(
            scopes=scopes,
            count=len(scopes),
            has_more=has_more,
        )
    except Exception as e:
        return ListSecretScopesResponse(
            scopes=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list secret scopes: {str(e)}",
        )


def create_secret_scope(
    host_credential_key: str,
    token_credential_key: str,
    scope: str,
    backend_type: Optional[str] = "DATABRICKS",
    initial_manage_principal: Optional[str] = None
) -> CreateSecretScopeResponse:
    """
    Create a new secret scope.
    
    Creates a container for storing secrets. The scope name must consist of
    alphanumeric characters, dashes, underscores, and periods (max 128 characters).
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        scope: Scope name (unique, alphanumeric with -_. allowed, max 128 chars)
        backend_type: Backend type (DATABRICKS or AZURE_KEYVAULT, default: DATABRICKS)
        initial_manage_principal: Initial principal with MANAGE permission (e.g., "users")
    
    Returns:
        CreateSecretScopeResponse confirming creation
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.secrets.create_scope(
            scope=scope,
            scope_backend_type=ScopeBackendType(backend_type) if backend_type else None,
            initial_manage_principal=initial_manage_principal
        )
    
        return CreateSecretScopeResponse(
            scope=scope,
            backend_type=backend_type,
            message=f"Secret scope '{scope}' created successfully"
        )

    except Exception as e:
        return CreateSecretScopeResponse(
            scope=scope,
            backend_type=backend_type,
            error_message=f"Failed to create secret scope: {str(e)}",
        )


def delete_secret_scope(
    host_credential_key: str,
    token_credential_key: str,
    scope: str
) -> DeleteSecretScopeResponse:
    """
    Delete a secret scope.
    
    Permanently deletes the scope and all secrets within it.
    Use with caution - this cannot be undone.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        scope: Name of the scope to delete
    
    Returns:
        DeleteSecretScopeResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
        client.secrets.delete_scope(scope=scope)
    
        return DeleteSecretScopeResponse(
            scope=scope,
            message=f"Secret scope '{scope}' deleted successfully"
        )

    except Exception as e:
        return DeleteSecretScopeResponse(
            scope=scope,
            error_message=f"Failed to delete secret scope: {str(e)}",
        )


# ============================================================================
# Secret Management
# ============================================================================

def list_secrets(
    host_credential_key: str,
    token_credential_key: str,
    scope: str,
    limit: int = 25,
    page: int = 0,
) -> ListSecretsResponse:
    """
    Retrieve a paginated list of secret keys in a scope (metadata only, NOT values).
    
    Returns secret key names and last updated timestamps.
    Secret values cannot be retrieved via this API (only from DBUtils in notebooks).
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        scope: Scope name to list secrets from. Required. Must be exact match
        limit: Number of secrets to return in a single request. Must be positive integer. Default: 25
        page: Zero-indexed page number for pagination. Default: 0
    
    Returns:
        ListSecretsResponse containing:
        - secrets: List of SecretMetadataInfo objects with secret key metadata
        - count: Integer number of secrets returned in this page (0 to limit)
        - has_more: Boolean indicating if additional secrets exist beyond this page
        
    Pagination:
        - Returns up to `limit` secrets per call
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available
        - Maximum 1000 secrets per scope (Databricks limit)
    """
    try:

        from itertools import islice
    
        client = get_workspace_client(host_credential_key, token_credential_key)
    
        response = client.secrets.list_secrets(scope=scope)
    
        skip = page * limit
        secrets_iterator = islice(response, skip, skip + limit)
    
        secrets = []
        for secret in secrets_iterator:
            secret_dict = secret.as_dict()
            secrets.append(SecretMetadataInfo(
                key=secret_dict.get('key'),
                last_updated_timestamp=secret_dict.get('last_updated_timestamp')
            ))
    
        # Check for more results
        has_more = False
        try:
            next(response)
            has_more = True

        except StopIteration:
            has_more = False
        
        return ListSecretsResponse(
            scope=scope,
            secrets=secrets,
            count=len(secrets),
            has_more=has_more,
        )
    except Exception as e:
        return ListSecretsResponse(
            scope=scope,
            secrets=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list secrets: {str(e)}",
        )


def put_secret(
    host_credential_key: str,
    token_credential_key: str,
    scope: str,
    key: str,
    string_value: Optional[str] = None,
    bytes_value: Optional[str] = None
) -> PutSecretResponse:
    """
    Store or update a secret.
    
    Inserts/updates a secret in the specified scope. The server encrypts the secret
    before storing it. Max 128 characters for key, 128 KB for value, 1000 secrets per scope.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        scope: Scope name
        key: Secret key (alphanumeric with -_. allowed, max 128 chars)
        string_value: String value to store (use this OR bytes_value, not both)
        bytes_value: Bytes value to store (base64 encoded)
    
    Returns:
        PutSecretResponse confirming storage
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        if not string_value and not bytes_value:
                return PutSecretResponse(
                    scope=scope,
                    key=key,
                    error_message="Either string_value or bytes_value must be provided",
                )
        if string_value and bytes_value:
                return PutSecretResponse(
                    scope=scope,
                    key=key,
                    error_message="Only one of string_value or bytes_value can be provided",
                )
    
        client.secrets.put_secret(
            scope=scope,
            key=key,
            string_value=string_value,
            bytes_value=bytes_value
        )
    
        return PutSecretResponse(
            scope=scope,
            key=key,
            message=f"Secret '{key}' stored successfully in scope '{scope}'"
        )

    except Exception as e:
        return PutSecretResponse(
            scope=scope,
            key=key,
            error_message=f"Failed to put secret: {str(e)}",
        )


def delete_secret(
    host_credential_key: str,
    token_credential_key: str,
    scope: str,
    key: str
) -> DeleteSecretResponse:
    """
    Delete a secret from a scope.
    
    Permanently removes the secret. Cannot be undone.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        scope: Scope name
        key: Secret key to delete
    
    Returns:
        DeleteSecretResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
        client.secrets.delete_secret(scope=scope, key=key)
    
        return DeleteSecretResponse(
            scope=scope,
            key=key,
            message=f"Secret '{key}' deleted from scope '{scope}'"
        )

    except Exception as e:
        return DeleteSecretResponse(
            scope=scope,
            key=key,
            error_message=f"Failed to delete secret: {str(e)}",
        )


# ============================================================================
# Access Control (ACLs)
# ============================================================================

def list_secret_acls(
    host_credential_key: str,
    token_credential_key: str,
    scope: str,
    limit: int = 25,
    page: int = 0,
) -> ListAclsResponse:
    """
    Retrieve a paginated list of ACLs (access control lists) on a secret scope.
    
    Shows which principals (users/groups) have what permissions on the scope.
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        scope: Scope name. Required. Must be exact match
        limit: Number of ACLs to return in a single request. Must be positive integer. Default: 25
        page: Zero-indexed page number for pagination. Default: 0
    
    Returns:
        ListAclsResponse containing:
        - acls: List of AclInfo objects with principal and permission data
        - count: Integer number of ACLs returned in this page (0 to limit)
        - has_more: Boolean indicating if additional ACLs exist beyond this page
        
    Pagination:
        - Returns up to `limit` ACLs per call
        - Set page=0 for first results, increment page by 1 for subsequent calls
        - has_more=True indicates more results available
    """
    try:

        from itertools import islice
    
        client = get_workspace_client(host_credential_key, token_credential_key)
    
        response = client.secrets.list_acls(scope=scope)
    
        skip = page * limit
        acls_iterator = islice(response, skip, skip + limit)
    
        acls = []
        for acl in acls_iterator:
            acl_dict = acl.as_dict()
            acls.append(AclInfo(
                principal=acl_dict.get('principal'),
                permission=acl_dict.get('permission')
            ))
    
        # Check for more results
        has_more = False
        try:
            next(response)
            has_more = True

        except StopIteration:
            has_more = False
        
        return ListAclsResponse(
            scope=scope,
            acls=acls,
            count=len(acls),
            has_more=has_more,
        )
    except Exception as e:
        return ListAclsResponse(
            scope=scope,
            acls=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list secret ACLs: {str(e)}",
        )


def get_secret_acl(
    host_credential_key: str,
    token_credential_key: str,
    scope: str,
    principal: str
) -> Optional[AclInfo]:
    """
    Get ACL for a specific principal on a scope.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        scope: Scope name
        principal: Principal (user or group name)
    
    Returns:
        AclInfo with permission details
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
        acl = client.secrets.get_acl(scope=scope, principal=principal)
        acl_dict = acl.as_dict()
    
        return AclInfo(
            principal=acl_dict.get('principal'),
            permission=acl_dict.get('permission')
        )

    except Exception as e:
        print(f"Error getting secret ACL: {e}")
        return None


def put_secret_acl(
    host_credential_key: str,
    token_credential_key: str,
    scope: str,
    principal: str,
    permission: str
) -> PutAclResponse:
    """
    Create or update ACL for a principal on a scope.
    
    Sets permissions for a user or group. Permissions are hierarchical:
    - MANAGE: Change ACLs, read and write secrets
    - WRITE: Read and write secrets
    - READ: Read secrets only
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        scope: Scope name
        principal: Principal (user or group name)
        permission: Permission level (MANAGE, WRITE, READ)
    
    Returns:
        PutAclResponse confirming update
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.secrets.put_acl(
            scope=scope,
            principal=principal,
            permission=AclPermission(permission)
        )
    
        return PutAclResponse(
            scope=scope,
            principal=principal,
            permission=permission,
            message=f"ACL updated: '{principal}' has '{permission}' permission on scope '{scope}'"
        )

    except Exception as e:
        return PutAclResponse(
            scope=scope,
            principal=principal,
            permission=permission,
            error_message=f"Failed to put secret ACL: {str(e)}",
        )


def delete_secret_acl(
    host_credential_key: str,
    token_credential_key: str,
    scope: str,
    principal: str
) -> DeleteAclResponse:
    """
    Delete ACL for a principal on a scope.
    
    Removes all permissions for the specified principal.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token_credential_key: Credential key for access token
        scope: Scope name
        principal: Principal (user or group name)
    
    Returns:
        DeleteAclResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
        client.secrets.delete_acl(scope=scope, principal=principal)
    
        return DeleteAclResponse(
            scope=scope,
            principal=principal,
            message=f"ACL deleted: '{principal}' no longer has access to scope '{scope}'"
        )

    except Exception as e:
        return DeleteAclResponse(
            scope=scope,
            principal=principal,
            error_message=f"Failed to delete secret ACL: {str(e)}",
        )

