"""
Unity Catalog Functions Management Tools

This module provides comprehensive function (UDF) management operations for Unity Catalog,
including creating, listing, updating, and managing function metadata.
"""

from typing import Optional, List, Dict, Any
from itertools import islice
from cache import get_workspace_client
from models import (
    FunctionInfoModel,
    FunctionParameterInfoModel,
    ListFunctionsResponse,
    CreateFunctionResponse,
    DeleteFunctionResponse,
    UpdateFunctionResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_function_to_model(function) -> FunctionInfoModel:
    """Convert SDK FunctionInfo to Pydantic model."""
    # Extract input parameters
    input_params = None
    if function.input_params and function.input_params.parameters:
        input_params = [
            FunctionParameterInfoModel(
                name=param.name,
                type_text=param.type_text,
                type_name=param.type_name.value if param.type_name else None,
                type_json=param.type_json,
                position=param.position,
                parameter_mode=param.parameter_mode.value if param.parameter_mode else None,
                parameter_type=param.parameter_type.value if param.parameter_type else None,
                parameter_default=param.parameter_default,
                comment=param.comment,
            )
            for param in function.input_params.parameters
        ]
    
    # Extract return parameters
    return_params = None
    if function.return_params and function.return_params.parameters:
        return_params = [
            FunctionParameterInfoModel(
                name=param.name,
                type_text=param.type_text,
                type_name=param.type_name.value if param.type_name else None,
                type_json=param.type_json,
                position=param.position,
                parameter_mode=param.parameter_mode.value if param.parameter_mode else None,
                parameter_type=param.parameter_type.value if param.parameter_type else None,
                parameter_default=param.parameter_default,
                comment=param.comment,
            )
            for param in function.return_params.parameters
        ]
    
    return FunctionInfoModel(
        name=function.name,
        full_name=function.full_name,
        catalog_name=function.catalog_name,
        schema_name=function.schema_name,
        function_id=function.function_id,
        comment=function.comment,
        owner=function.owner,
        created_at=function.created_at,
        created_by=function.created_by,
        updated_at=function.updated_at,
        updated_by=function.updated_by,
        metastore_id=function.metastore_id,
        data_type=function.data_type.value if function.data_type else None,
        full_data_type=function.full_data_type,
        routine_body=function.routine_body.value if function.routine_body else None,
        routine_definition=function.routine_definition,
        routine_dependencies=function.routine_dependencies.as_dict() if function.routine_dependencies else None,
        parameter_style=function.parameter_style.value if function.parameter_style else None,
        is_deterministic=function.is_deterministic,
        is_null_call=function.is_null_call,
        security_type=function.security_type.value if function.security_type else None,
        sql_data_access=function.sql_data_access.value if function.sql_data_access else None,
        sql_path=function.sql_path,
        specific_name=function.specific_name,
        external_language=function.external_language,
        external_name=function.external_name,
        properties=function.properties,
        input_params=input_params,
        return_params=return_params,
        browse_only=function.browse_only,
    )


# ============================================================================
# Function Discovery and Inspection
# ============================================================================

def list_functions(
    host_credential_key: str,
    token_credential_key: str,
    catalog_name: str,
    schema_name: str,
    limit: int = 25,
    page: int = 0,
    include_browse: Optional[bool] = None,
) -> ListFunctionsResponse:
    """
    Retrieve a paginated list of user-defined functions (UDFs) within a Unity Catalog schema.
    
    This function returns function metadata for all accessible UDFs in the specified catalog
    and schema. Use this to discover available functions, check function signatures, or list
    callable data transformations.
    
    Access Requirements:
    - Metastore admins receive all functions in the schema
    - Other users must have USE_CATALOG privilege on catalog AND USE_SCHEMA privilege on schema
    - Results filtered based on caller's permissions automatically
    
    Args:
        host_credential_key: Globally unique key identifying the Databricks workspace host credential
        token_credential_key: Globally unique key identifying the access token credential
        catalog_name: Name of the Unity Catalog containing the schema. Required. Must be exact match
        schema_name: Name of the schema containing the functions. Required. Must be exact match
        limit: Number of functions to return in a single request. Must be positive integer. Default: 25. Maximum: 20 when include_browse=True
        page: Zero-indexed page number for pagination. Default: 0
        include_browse: Boolean flag to include functions where user has only browse permission (no EXECUTE). Default: None (excluded)
        
    Returns:
        ListFunctionsResponse with list of functions and pagination info
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    # Cap limit at 20 when include_browse is True to reduce response size
    effective_limit = min(limit, 20) if include_browse else limit
    
    response = client.functions.list(
        catalog_name=catalog_name,
        schema_name=schema_name,
        include_browse=include_browse,
    )
    
    skip = page * effective_limit
    functions_iterator = islice(response, skip, skip + effective_limit)
    
    functions_list = []
    for function in functions_iterator:
        functions_list.append(_convert_function_to_model(function))
    
    # Check for more results
    has_more = False
    try:
        next(response)
        has_more = True
    except StopIteration:
        has_more = False
    
    return ListFunctionsResponse(
        functions=functions_list,
        count=len(functions_list),
        has_more=has_more,
    )
    except Exception as e:
        return ListFunctionsResponse(
            functions=[],
            count=0,
            has_more=False,
            error_message=f"Failed to list functions: {str(e)}",
        )


def get_function(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    include_browse: Optional[bool] = None,
) -> Optional[FunctionInfoModel]:
    """
    Get function details.
    
    Returns detailed information about a specific function including parameters,
    return type, and implementation.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Full name of the function (catalog.schema.function)
        include_browse: Include functions with browse-only access
        
    Returns:
        FunctionInfoModel with complete function details
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    function = client.functions.get(
        name=name,
        include_browse=include_browse,
    )
    
    return _convert_function_to_model(function)
    except Exception as e:
        return FunctionInfoModel(
            full_name=name,
            error_message=f"Failed to get function: {str(e)}",
        )


# ============================================================================
# Function Management
# ============================================================================

def create_function(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    catalog_name: str,
    schema_name: str,
    input_params: List[Dict[str, Any]],
    data_type: str,
    full_data_type: str,
    routine_body: str,
    routine_definition: str,
    parameter_style: str,
    is_deterministic: bool,
    sql_data_access: str,
    is_null_call: bool,
    security_type: str,
    specific_name: str,
    comment: Optional[str] = None,
    external_language: Optional[str] = None,
    external_name: Optional[str] = None,
    properties: Optional[str] = None,
    return_params: Optional[List[Dict[str, Any]]] = None,
    sql_path: Optional[str] = None,
) -> CreateFunctionResponse:
    """
    Create a new function (UDF).
    
    Creates a new User-Defined Function in Unity Catalog. The user must have
    the USE_CATALOG privilege on the parent catalog, and the USE_SCHEMA and
    CREATE_FUNCTION privileges on the parent schema.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Name of function, relative to parent schema
        catalog_name: Name of parent catalog
        schema_name: Name of parent schema
        input_params: List of input parameter dicts with keys: name, type_text, type_name, type_json, position
        data_type: Return data type name (e.g., "INT", "STRING")
        full_data_type: Full return data type specification
        routine_body: Function body type ("SQL" or "EXTERNAL")
        routine_definition: Function definition/implementation (SQL or external reference)
        parameter_style: Parameter style ("S" for SQL)
        is_deterministic: Whether function always returns same result for same input
        sql_data_access: SQL data access type ("CONTAINS_SQL", "READS_SQL_DATA", "MODIFIES_SQL_DATA", "NO_SQL")
        is_null_call: Whether function is called on NULL input
        security_type: Security type ("DEFINER")
        specific_name: Specific name of function
        comment: User-provided free-form text description
        external_language: External language for external functions (e.g., "python", "scala")
        external_name: External name for external functions
        properties: JSON-encoded key-value properties
        return_params: List of return parameter dicts (for table functions)
        sql_path: SQL path
        
    Returns:
        CreateFunctionResponse with created function information
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    from databricks.sdk.service.catalog import (
        CreateFunction, FunctionParameterInfos, FunctionParameterInfo,
        ColumnTypeName, CreateFunctionRoutineBody, CreateFunctionParameterStyle,
        CreateFunctionSqlDataAccess, CreateFunctionSecurityType
    )
    
    # Convert input_params to SDK objects
    input_params_obj = FunctionParameterInfos(
        parameters=[
            FunctionParameterInfo(
                name=param["name"],
                type_text=param["type_text"],
                type_name=ColumnTypeName(param["type_name"]),
                type_json=param.get("type_json"),
                position=param["position"],
                comment=param.get("comment"),
            )
            for param in input_params
        ]
    )
    
    # Convert return_params to SDK objects if provided
    return_params_obj = None
    if return_params:
        return_params_obj = FunctionParameterInfos(
            parameters=[
                FunctionParameterInfo(
                    name=param["name"],
                    type_text=param["type_text"],
                    type_name=ColumnTypeName(param["type_name"]),
                    type_json=param.get("type_json"),
                    position=param["position"],
                    comment=param.get("comment"),
                )
                for param in return_params
            ]
        )
    
    function_info = CreateFunction(
        name=name,
        catalog_name=catalog_name,
        schema_name=schema_name,
        input_params=input_params_obj,
        data_type=ColumnTypeName(data_type),
        full_data_type=full_data_type,
        routine_body=CreateFunctionRoutineBody(routine_body),
        routine_definition=routine_definition,
        parameter_style=CreateFunctionParameterStyle(parameter_style),
        is_deterministic=is_deterministic,
        sql_data_access=CreateFunctionSqlDataAccess(sql_data_access),
        is_null_call=is_null_call,
        security_type=CreateFunctionSecurityType(security_type),
        specific_name=specific_name,
        comment=comment,
        external_language=external_language,
        external_name=external_name,
        properties=properties,
        return_params=return_params_obj,
        sql_path=sql_path,
    )
    
    function = client.functions.create(function_info=function_info)
    
    return CreateFunctionResponse(
        function_info=_convert_function_to_model(function),
    )
    except Exception as e:
        return CreateFunctionResponse(
            function_info=None,
            error_message=f"Failed to create function: {str(e)}",
        )


def delete_function(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    force: Optional[bool] = None,
) -> DeleteFunctionResponse:
    """
    Delete a function.
    
    Deletes the function that matches the supplied name. For the deletion to
    succeed, the user must be the owner of the function or have appropriate
    privileges.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Full name of the function (catalog.schema.function)
        force: Force deletion even if the function is not empty
        
    Returns:
        DeleteFunctionResponse confirming deletion
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.functions.delete(
        name=name,
        force=force,
    )
    
    return DeleteFunctionResponse(name=name)
    except Exception as e:
        return DeleteFunctionResponse(
            name=name,
            error_message=f"Failed to delete function: {str(e)}",
        )


def update_function_owner(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    owner: str,
) -> UpdateFunctionResponse:
    """
    Update function owner.
    
    Updates the owner of the function. Only the owner can be updated. The user
    must be a metastore admin or meet specific privilege requirements.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        name: Full name of the function (catalog.schema.function)
        owner: New owner username
        
    Returns:
        UpdateFunctionResponse with updated function information
    """
    try:
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    function = client.functions.update(
        name=name,
        owner=owner,
    )
    
    return UpdateFunctionResponse(
        function_info=_convert_function_to_model(function),
    )
    except Exception as e:
        return UpdateFunctionResponse(
            function_info=None,
            error_message=f"Failed to update function owner: {str(e)}",
        )

