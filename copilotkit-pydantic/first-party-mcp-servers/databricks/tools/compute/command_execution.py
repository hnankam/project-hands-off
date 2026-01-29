"""
Command Execution Tools

This module provides tools for executing Python, SQL, Scala, and R code on running 
Databricks clusters. Enables interactive data exploration and analysis workflows.
"""

from typing import Optional
from cache import get_workspace_client
from models import (
    CommandStatusModel,
    ContextStatusModel,
    CommandResultsModel,
    CreateExecutionContextResponse,
    ExecuteCommandResponse,
    CancelCommandResponse,
    DestroyContextResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================

def _convert_results_to_model(results) -> Optional[CommandResultsModel]:
    """Convert SDK Results to Pydantic model."""
    if not results:
        return None
    
    return CommandResultsModel(
        result_type=results.result_type.value if results.result_type else None,
        data=results.data,
        summary=results.summary,
        cause=results.cause,
        table_schema=results.schema,
        truncated=results.truncated,
        is_json_schema=results.is_json_schema,
        file_name=results.file_name,
        file_names=results.file_names,
        pos=results.pos,
    )


def _convert_command_status_to_model(command_status) -> CommandStatusModel:
    """Convert SDK CommandStatusResponse to Pydantic model."""
    return CommandStatusModel(
        id=command_status.id,
        status=command_status.status.value if command_status.status else None,
        results=_convert_results_to_model(command_status.results),
    )


def _convert_context_status_to_model(context_status) -> ContextStatusModel:
    """Convert SDK ContextStatusResponse to Pydantic model."""
    return ContextStatusModel(
        id=context_status.id,
        status=context_status.status.value if context_status.status else None,
    )


# ============================================================================
# Execution Context Management
# ============================================================================

def create_execution_context(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
    language: str = "python",
) -> CreateExecutionContextResponse:
    """
    Create an execution context for running commands on a cluster.
    
    Creates an isolated execution environment on a running cluster. The context
    maintains state between command executions, allowing for interactive workflows.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        cluster_id: ID of running cluster
        language: Language for the context ("python", "sql", "scala", "r")
        
    Returns:
        CreateExecutionContextResponse with context information
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        from databricks.sdk.service.compute import Language
    
        # Wait for context to be running
        context_status = client.command_execution.create_and_wait(
            cluster_id=cluster_id,
            language=Language(language),
        )
    
        return CreateExecutionContextResponse(
            context=_convert_context_status_to_model(context_status),
        )

    except Exception as e:
        return CreateExecutionContextResponse(
            context=None,
            error_message=f"Failed to create execution context: {str(e)}",
        )


def get_context_status(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
    context_id: str,
) -> ContextStatusModel:
    """
    Get the status of an execution context.
    
    Retrieves the current status of an execution context to check if it's
    ready to accept commands.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        cluster_id: ID of cluster
        context_id: ID of execution context
        
    Returns:
        ContextStatusModel with context status
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        context_status = client.command_execution.context_status(
            cluster_id=cluster_id,
            context_id=context_id,
        )
    
        return _convert_context_status_to_model(context_status)

    except Exception as e:
        return None


def destroy_execution_context(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
    context_id: str,
) -> DestroyContextResponse:
    """
    Destroy an execution context.
    
    Deletes an execution context and releases its resources. Should be called
    when done with command execution to clean up.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        cluster_id: ID of cluster
        context_id: ID of execution context
        
    Returns:
        DestroyContextResponse confirming deletion
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        client.command_execution.destroy(
            cluster_id=cluster_id,
            context_id=context_id,
        )
    
        return DestroyContextResponse(
            cluster_id=cluster_id,
            context_id=context_id,
        )

    except Exception as e:
        return DestroyContextResponse(
            cluster_id=cluster_id,
            context_id=context_id,
            error_message=f"Failed to destroy execution context: {str(e)}",
        )


# ============================================================================
# Command Execution
# ============================================================================

def execute_command(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
    context_id: str,
    command: str,
    language: str = "python",
) -> ExecuteCommandResponse:
    """
    Execute a command in an execution context.
    
    Runs code (Python, SQL, Scala, or R) on a cluster and returns the results.
    This is a synchronous operation that waits for command completion.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        cluster_id: ID of cluster
        context_id: ID of execution context
        command: Code to execute
        language: Language ("python", "sql", "scala", "r")
        
    Returns:
        ExecuteCommandResponse with command status and results
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        from databricks.sdk.service.compute import Language
    
        # Wait for command to finish
        command_status = client.command_execution.execute_and_wait(
            cluster_id=cluster_id,
            context_id=context_id,
            command=command,
            language=Language(language),
        )
    
        return ExecuteCommandResponse(
            command=_convert_command_status_to_model(command_status),
        )

    except Exception as e:
        return ExecuteCommandResponse(
            command=None,
            error_message=f"Failed to execute command: {str(e)}",
        )


def get_command_status(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
    context_id: str,
    command_id: str,
) -> CommandStatusModel:
    """
    Get the status and results of a command execution.
    
    Retrieves the current status of a running or completed command, including
    results if the command has finished.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        cluster_id: ID of cluster
        context_id: ID of execution context
        command_id: ID of command
        
    Returns:
        CommandStatusModel with command status and results
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        command_status = client.command_execution.command_status(
            cluster_id=cluster_id,
            context_id=context_id,
            command_id=command_id,
        )
    
        return _convert_command_status_to_model(command_status)

    except Exception as e:
        return None


def cancel_command(
    host_credential_key: str,
    token_credential_key: str,
    cluster_id: str,
    context_id: str,
    command_id: str,
) -> CancelCommandResponse:
    """
    Cancel a running command.
    
    Cancels a currently executing command. Useful for stopping long-running
    queries or computations.
    
    Args:
        host_credential_key: Credential key for workspace URL
        token: Authentication token
        cluster_id: ID of cluster
        context_id: ID of execution context
        command_id: ID of command to cancel
        
    Returns:
        CancelCommandResponse with cancellation status
    """
    try:

        client = get_workspace_client(host_credential_key, token_credential_key)
    
        # Wait for cancellation to complete
        command_status = client.command_execution.cancel_and_wait(
            cluster_id=cluster_id,
            context_id=context_id,
            command_id=command_id,
        )
    
        return CancelCommandResponse(
            command=_convert_command_status_to_model(command_status),
        )

    except Exception as e:
        return CancelCommandResponse(
            command=None,
            error_message=f"Failed to cancel command: {str(e)}",
        )

