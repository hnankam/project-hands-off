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
    host: str,
    token: str
) -> ListSecretScopesResponse:
    """
    List all secret scopes in the workspace.
    
    Secret scopes are containers for secrets used to store sensitive credentials
    like API keys, passwords, and tokens for external data sources.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
    
    Returns:
        ListSecretScopesResponse with all scopes
    
    Example:
        # List all secret scopes
        response = list_secret_scopes(host, token)
        
        for scope in response.scopes:
            print(f"{scope.name} ({scope.backend_type})")
    """
    client = get_workspace_client(host, token)
    
    scopes = []
    for scope in client.secrets.list_scopes():
        scope_dict = scope.as_dict()
        scopes.append(SecretScopeInfo(
            name=scope_dict.get('name'),
            backend_type=scope_dict.get('backend_type'),
            keyvault_metadata=scope_dict.get('keyvault_metadata')
        ))
    
    return ListSecretScopesResponse(
        scopes=scopes,
        count=len(scopes)
    )


def create_secret_scope(
    host: str,
    token: str,
    scope: str,
    backend_type: Optional[str] = "DATABRICKS",
    initial_manage_principal: Optional[str] = None
) -> CreateSecretScopeResponse:
    """
    Create a new secret scope.
    
    Creates a container for storing secrets. The scope name must consist of
    alphanumeric characters, dashes, underscores, and periods (max 128 characters).
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        scope: Scope name (unique, alphanumeric with -_. allowed, max 128 chars)
        backend_type: Backend type (DATABRICKS or AZURE_KEYVAULT, default: DATABRICKS)
        initial_manage_principal: Initial principal with MANAGE permission (e.g., "users")
    
    Returns:
        CreateSecretScopeResponse confirming creation
    
    Example:
        # Create a scope for database credentials
        response = create_secret_scope(
            host, token,
            scope="jdbc-credentials",
            initial_manage_principal="users"
        )
        print(response.message)
        
        # Create scope for production secrets
        response = create_secret_scope(
            host, token,
            scope="prod-api-keys"
        )
    """
    client = get_workspace_client(host, token)
    
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


def delete_secret_scope(
    host: str,
    token: str,
    scope: str
) -> DeleteSecretScopeResponse:
    """
    Delete a secret scope.
    
    Permanently deletes the scope and all secrets within it.
    Use with caution - this cannot be undone.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        scope: Name of the scope to delete
    
    Returns:
        DeleteSecretScopeResponse confirming deletion
    
    Example:
        # Delete a scope
        response = delete_secret_scope(host, token, "temp-credentials")
        print(response.message)
    """
    client = get_workspace_client(host, token)
    client.secrets.delete_scope(scope=scope)
    
    return DeleteSecretScopeResponse(
        scope=scope,
        message=f"Secret scope '{scope}' deleted successfully"
    )


# ============================================================================
# Secret Management
# ============================================================================

def list_secrets(
    host: str,
    token: str,
    scope: str
) -> ListSecretsResponse:
    """
    List secret keys in a scope (metadata only, NOT values).
    
    Returns secret key names and last updated timestamps.
    Secret values cannot be retrieved via this API (only from DBUtils in notebooks).
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        scope: Scope name to list secrets from
    
    Returns:
        ListSecretsResponse with secret metadata
    
    Example:
        # List secrets in a scope
        response = list_secrets(host, token, "jdbc-credentials")
        
        for secret in response.secrets:
            print(f"{secret.key} (last updated: {secret.last_updated_timestamp})")
    """
    client = get_workspace_client(host, token)
    
    secrets = []
    for secret in client.secrets.list_secrets(scope=scope):
        secret_dict = secret.as_dict()
        secrets.append(SecretMetadataInfo(
            key=secret_dict.get('key'),
            last_updated_timestamp=secret_dict.get('last_updated_timestamp')
        ))
    
    return ListSecretsResponse(
        scope=scope,
        secrets=secrets,
        count=len(secrets)
    )


def put_secret(
    host: str,
    token: str,
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
        host: Databricks workspace URL
        token: Personal Access Token
        scope: Scope name
        key: Secret key (alphanumeric with -_. allowed, max 128 chars)
        string_value: String value to store (use this OR bytes_value, not both)
        bytes_value: Bytes value to store (base64 encoded)
    
    Returns:
        PutSecretResponse confirming storage
    
    Example:
        # Store database password
        response = put_secret(
            host, token,
            scope="jdbc-credentials",
            key="db-password",
            string_value="secretpassword123"
        )
        
        # Store API key
        response = put_secret(
            host, token,
            scope="api-keys",
            key="external-api-token",
            string_value="sk-1234567890abcdef"
        )
        
        # Reference in SQL (executed on cluster):
        # ${secrets/jdbc-credentials/db-password}
    """
    client = get_workspace_client(host, token)
    
    if not string_value and not bytes_value:
        raise ValueError("Either string_value or bytes_value must be provided")
    if string_value and bytes_value:
        raise ValueError("Only one of string_value or bytes_value can be provided")
    
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


def delete_secret(
    host: str,
    token: str,
    scope: str,
    key: str
) -> DeleteSecretResponse:
    """
    Delete a secret from a scope.
    
    Permanently removes the secret. Cannot be undone.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        scope: Scope name
        key: Secret key to delete
    
    Returns:
        DeleteSecretResponse confirming deletion
    
    Example:
        # Delete a secret
        response = delete_secret(
            host, token,
            scope="temp-credentials",
            key="old-api-key"
        )
        print(response.message)
    """
    client = get_workspace_client(host, token)
    client.secrets.delete_secret(scope=scope, key=key)
    
    return DeleteSecretResponse(
        scope=scope,
        key=key,
        message=f"Secret '{key}' deleted from scope '{scope}'"
    )


# ============================================================================
# Access Control (ACLs)
# ============================================================================

def list_secret_acls(
    host: str,
    token: str,
    scope: str
) -> ListAclsResponse:
    """
    List all ACLs (access control lists) on a secret scope.
    
    Shows which principals (users/groups) have what permissions on the scope.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        scope: Scope name
    
    Returns:
        ListAclsResponse with ACL information
    
    Example:
        # List who has access
        response = list_secret_acls(host, token, "production-secrets")
        
        for acl in response.acls:
            print(f"{acl.principal}: {acl.permission}")
    """
    client = get_workspace_client(host, token)
    
    acls = []
    for acl in client.secrets.list_acls(scope=scope):
        acl_dict = acl.as_dict()
        acls.append(AclInfo(
            principal=acl_dict.get('principal'),
            permission=acl_dict.get('permission')
        ))
    
    return ListAclsResponse(
        scope=scope,
        acls=acls,
        count=len(acls)
    )


def get_secret_acl(
    host: str,
    token: str,
    scope: str,
    principal: str
) -> AclInfo:
    """
    Get ACL for a specific principal on a scope.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        scope: Scope name
        principal: Principal (user or group name)
    
    Returns:
        AclInfo with permission details
    
    Example:
        # Check permission for a group
        acl = get_secret_acl(
            host, token,
            scope="jdbc-credentials",
            principal="data-scientists"
        )
        print(f"Permission: {acl.permission}")
    """
    client = get_workspace_client(host, token)
    acl = client.secrets.get_acl(scope=scope, principal=principal)
    acl_dict = acl.as_dict()
    
    return AclInfo(
        principal=acl_dict.get('principal'),
        permission=acl_dict.get('permission')
    )


def put_secret_acl(
    host: str,
    token: str,
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
        host: Databricks workspace URL
        token: Personal Access Token
        scope: Scope name
        principal: Principal (user or group name)
        permission: Permission level (MANAGE, WRITE, READ)
    
    Returns:
        PutAclResponse confirming update
    
    Example:
        # Grant read access to data scientists
        response = put_secret_acl(
            host, token,
            scope="jdbc-credentials",
            principal="data-scientists",
            permission="READ"
        )
        
        # Grant manage access to admins
        response = put_secret_acl(
            host, token,
            scope="production-secrets",
            principal="admins",
            permission="MANAGE"
        )
    """
    client = get_workspace_client(host, token)
    
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


def delete_secret_acl(
    host: str,
    token: str,
    scope: str,
    principal: str
) -> DeleteAclResponse:
    """
    Delete ACL for a principal on a scope.
    
    Removes all permissions for the specified principal.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        scope: Scope name
        principal: Principal (user or group name)
    
    Returns:
        DeleteAclResponse confirming deletion
    
    Example:
        # Remove access for a user
        response = delete_secret_acl(
            host, token,
            scope="temp-credentials",
            principal="former-employee"
        )
        print(response.message)
    """
    client = get_workspace_client(host, token)
    client.secrets.delete_acl(scope=scope, principal=principal)
    
    return DeleteAclResponse(
        scope=scope,
        principal=principal,
        message=f"ACL deleted: '{principal}' no longer has access to scope '{scope}'"
    )

