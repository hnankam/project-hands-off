"""
Unity Catalog Functions Management Tools

This module provides comprehensive function (UDF) management operations for Unity Catalog,
including creating, listing, updating, and managing function metadata.
"""

from typing import Optional, List, Dict, Any
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
    max_results: Optional[int] = None,
    page_token: Optional[str] = None,
    include_browse: Optional[bool] = None,
) -> ListFunctionsResponse:
    """
    List functions in a schema.
    
    Lists all functions within the specified parent catalog and schema. If the
    user is a metastore admin, all functions are returned. Otherwise, the user
    must have the USE_CATALOG privilege on the catalog and the USE_SCHEMA
    privilege on the schema.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        catalog_name: Name of parent catalog
        schema_name: Parent schema of functions
        max_results: Maximum number of functions to return (0 for server default)
        page_token: Opaque token for next page of results
        include_browse: Include functions with browse-only access
        
    Returns:
        ListFunctionsResponse with list of functions and pagination info
        
    Example:
        # List all functions in a schema
        functions = list_functions(
            host, token,
            catalog_name="main",
            schema_name="default"
        )
        for func in functions.functions:
            print(f"{func.full_name}")
            print(f"  Owner: {func.owner}")
            print(f"  Return Type: {func.data_type}")
            print(f"  Routine Body: {func.routine_body}")
        
        # List with pagination
        functions = list_functions(
            host, token,
            catalog_name="main",
            schema_name="default",
            max_results=50
        )
        print(f"Found {functions.count} functions")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    functions_list = []
    next_token = None
    
    for function in client.functions.list(
        catalog_name=catalog_name,
        schema_name=schema_name,
        max_results=max_results,
        page_token=page_token,
        include_browse=include_browse,
    ):
        functions_list.append(_convert_function_to_model(function))
    
    return ListFunctionsResponse(
        functions=functions_list,
        count=len(functions_list),
        next_page_token=next_token,
    )


def get_function(
    host_credential_key: str,
    token_credential_key: str,
    name: str,
    include_browse: Optional[bool] = None,
) -> FunctionInfoModel:
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
        
    Example:
        # Get full function details
        func = get_function(
            host, token,
            name="main.default.my_udf"
        )
        print(f"Function: {func.full_name}")
        print(f"Owner: {func.owner}")
        print(f"Return Type: {func.data_type}")
        print(f"Deterministic: {func.is_deterministic}")
        print(f"Definition: {func.routine_definition}")
        
        # Print input parameters
        if func.input_params:
            print("Parameters:")
            for param in func.input_params:
                print(f"  {param.name}: {param.type_text}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    function = client.functions.get(
        name=name,
        include_browse=include_browse,
    )
    
    return _convert_function_to_model(function)


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
        
    Example:
        # Create a simple SQL UDF
        result = create_function(
            host, token,
            name="add_numbers",
            catalog_name="main",
            schema_name="default",
            input_params=[
                {"name": "a", "type_text": "INT", "type_name": "INT", "type_json": '{"name":"INT","type":"primitive"}', "position": 0},
                {"name": "b", "type_text": "INT", "type_name": "INT", "type_json": '{"name":"INT","type":"primitive"}', "position": 1}
            ],
            data_type="INT",
            full_data_type="INT",
            routine_body="SQL",
            routine_definition="RETURN a + b",
            parameter_style="S",
            is_deterministic=True,
            sql_data_access="NO_SQL",
            is_null_call=False,
            security_type="DEFINER",
            specific_name="add_numbers",
            comment="Adds two integers"
        )
        print(f"Created function: {result.function_info.full_name}")
        
        # Create a string manipulation UDF
        result = create_function(
            host, token,
            name="uppercase_string",
            catalog_name="main",
            schema_name="default",
            input_params=[
                {"name": "input_str", "type_text": "STRING", "type_name": "STRING", "type_json": '{"name":"STRING","type":"primitive"}', "position": 0}
            ],
            data_type="STRING",
            full_data_type="STRING",
            routine_body="SQL",
            routine_definition="RETURN UPPER(input_str)",
            parameter_style="S",
            is_deterministic=True,
            sql_data_access="NO_SQL",
            is_null_call=False,
            security_type="DEFINER",
            specific_name="uppercase_string",
            comment="Converts string to uppercase"
        )
    """
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
        
    Example:
        # Delete a function
        result = delete_function(
            host, token,
            name="main.default.old_udf"
        )
        print(result.message)
        
        # Force delete
        result = delete_function(
            host, token,
            name="main.default.temp_func",
            force=True
        )
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    client.functions.delete(
        name=name,
        force=force,
    )
    
    return DeleteFunctionResponse(name=name)


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
        
    Example:
        # Transfer function ownership
        result = update_function_owner(
            host, token,
            name="main.default.my_udf",
            owner="data-engineer@company.com"
        )
        print(f"New owner: {result.function_info.owner}")
        
        # Bulk ownership transfer
        functions = list_functions(host, token, catalog_name="main", schema_name="default")
        new_owner = "analytics-team@company.com"
        for func in functions.functions:
            if func.owner == "old-owner@company.com":
                update_function_owner(
                    host, token,
                    name=func.full_name,
                    owner=new_owner
                )
                print(f"Transferred {func.full_name}")
    """
    client = get_workspace_client(host_credential_key, token_credential_key)
    
    function = client.functions.update(
        name=name,
        owner=owner,
    )
    
    return UpdateFunctionResponse(
        function_info=_convert_function_to_model(function),
    )

