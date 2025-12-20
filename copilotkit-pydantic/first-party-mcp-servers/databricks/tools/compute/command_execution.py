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
    host: str,
    token: str,
    cluster_id: str,
    language: str = "python",
) -> CreateExecutionContextResponse:
    """
    Create an execution context for running commands on a cluster.
    
    Creates an isolated execution environment on a running cluster. The context
    maintains state between command executions, allowing for interactive workflows.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: ID of running cluster
        language: Language for the context ("python", "sql", "scala", "r")
        
    Returns:
        CreateExecutionContextResponse with context information
        
    Example:
        # Create Python execution context
        context = create_execution_context(
            host, token,
            cluster_id="1234-567890-abcdef12",
            language="python"
        )
        print(f"Context ID: {context.context.id}")
        print(f"Status: {context.context.status}")
        
        # Create SQL execution context
        context = create_execution_context(
            host, token,
            cluster_id="1234-567890-abcdef12",
            language="sql"
        )
        
        # Use context for multiple commands (state is preserved)
        # - Variables defined in one command persist to the next
        # - Imports and configuration carry over
        # - Database connections remain open
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.compute import Language
    
    # Wait for context to be running
    context_status = client.command_execution.create_and_wait(
        cluster_id=cluster_id,
        language=Language(language),
    )
    
    return CreateExecutionContextResponse(
        context=_convert_context_status_to_model(context_status),
    )


def get_context_status(
    host: str,
    token: str,
    cluster_id: str,
    context_id: str,
) -> ContextStatusModel:
    """
    Get the status of an execution context.
    
    Retrieves the current status of an execution context to check if it's
    ready to accept commands.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: ID of cluster
        context_id: ID of execution context
        
    Returns:
        ContextStatusModel with context status
        
    Example:
        # Check context status
        status = get_context_status(
            host, token,
            cluster_id="1234-567890-abcdef12",
            context_id="ctx-123456"
        )
        print(f"Status: {status.status}")
        
        # Wait for context to be ready
        if status.status == "Pending":
            print("Context is starting...")
        elif status.status == "Running":
            print("Context is ready!")
        elif status.status == "Error":
            print("Context failed to start")
    """
    client = get_workspace_client(host, token)
    
    context_status = client.command_execution.context_status(
        cluster_id=cluster_id,
        context_id=context_id,
    )
    
    return _convert_context_status_to_model(context_status)


def destroy_execution_context(
    host: str,
    token: str,
    cluster_id: str,
    context_id: str,
) -> DestroyContextResponse:
    """
    Destroy an execution context.
    
    Deletes an execution context and releases its resources. Should be called
    when done with command execution to clean up.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: ID of cluster
        context_id: ID of execution context
        
    Returns:
        DestroyContextResponse confirming deletion
        
    Example:
        # Clean up context after use
        result = destroy_execution_context(
            host, token,
            cluster_id="1234-567890-abcdef12",
            context_id="ctx-123456"
        )
        print(result.message)
        
        # Typical workflow pattern
        # 1. Create context
        context = create_execution_context(host, token, cluster_id, "python")
        
        # 2. Execute commands
        result = execute_command(host, token, cluster_id, context.context.id, "print('Hello')", "python")
        
        # 3. Clean up
        destroy_execution_context(host, token, cluster_id, context.context.id)
    """
    client = get_workspace_client(host, token)
    
    client.command_execution.destroy(
        cluster_id=cluster_id,
        context_id=context_id,
    )
    
    return DestroyContextResponse(
        cluster_id=cluster_id,
        context_id=context_id,
    )


# ============================================================================
# Command Execution
# ============================================================================

def execute_command(
    host: str,
    token: str,
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
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: ID of cluster
        context_id: ID of execution context
        command: Code to execute
        language: Language ("python", "sql", "scala", "r")
        
    Returns:
        ExecuteCommandResponse with command status and results
        
    Example:
        # Execute Python code
        result = execute_command(
            host, token,
            cluster_id="1234-567890-abcdef12",
            context_id="ctx-123456",
            command="print(2 + 2)",
            language="python"
        )
        print(f"Status: {result.command.status}")
        if result.command.results:
            print(f"Output: {result.command.results.data}")
        
        # Execute SQL query
        result = execute_command(
            host, token,
            cluster_id="1234-567890-abcdef12",
            context_id="ctx-sql-789",
            command="SELECT COUNT(*) FROM sales.orders WHERE date > '2024-01-01'",
            language="sql"
        )
        if result.command.results.result_type == "table":
            print(f"Schema: {result.command.results.table_schema}")
            print(f"Data: {result.command.results.data}")
        
        # Multi-step analysis
        # Step 1: Load data
        execute_command(host, token, cluster_id, context_id,
            "df = spark.read.table('sales.orders')", "python")
        
        # Step 2: Transform (state preserved from step 1)
        execute_command(host, token, cluster_id, context_id,
            "result = df.groupBy('region').sum('amount')", "python")
        
        # Step 3: Display
        result = execute_command(host, token, cluster_id, context_id,
            "display(result)", "python")
        print(result.command.results.data)
    """
    client = get_workspace_client(host, token)
    
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


def get_command_status(
    host: str,
    token: str,
    cluster_id: str,
    context_id: str,
    command_id: str,
) -> CommandStatusModel:
    """
    Get the status and results of a command execution.
    
    Retrieves the current status of a running or completed command, including
    results if the command has finished.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: ID of cluster
        context_id: ID of execution context
        command_id: ID of command
        
    Returns:
        CommandStatusModel with command status and results
        
    Example:
        # Check command status
        status = get_command_status(
            host, token,
            cluster_id="1234-567890-abcdef12",
            context_id="ctx-123456",
            command_id="cmd-789"
        )
        
        print(f"Status: {status.status}")
        
        if status.status == "Finished":
            print(f"Result type: {status.results.result_type}")
            print(f"Data: {status.results.data}")
        elif status.status == "Error":
            print(f"Error: {status.results.cause}")
        elif status.status in ["Queued", "Running"]:
            print("Command still executing...")
        
        # Poll for completion
        import time
        while status.status in ["Queued", "Running"]:
            time.sleep(1)
            status = get_command_status(host, token, cluster_id, context_id, command_id)
        
        # Process results
        if status.results:
            if status.results.result_type == "text":
                print(status.results.data)
            elif status.results.result_type == "table":
                print("Columns:", [col['name'] for col in status.results.table_schema])
                print("Rows:", status.results.data)
    """
    client = get_workspace_client(host, token)
    
    command_status = client.command_execution.command_status(
        cluster_id=cluster_id,
        context_id=context_id,
        command_id=command_id,
    )
    
    return _convert_command_status_to_model(command_status)


def cancel_command(
    host: str,
    token: str,
    cluster_id: str,
    context_id: str,
    command_id: str,
) -> CancelCommandResponse:
    """
    Cancel a running command.
    
    Cancels a currently executing command. Useful for stopping long-running
    queries or computations.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        cluster_id: ID of cluster
        context_id: ID of execution context
        command_id: ID of command to cancel
        
    Returns:
        CancelCommandResponse with cancellation status
        
    Example:
        # Cancel a long-running query
        result = cancel_command(
            host, token,
            cluster_id="1234-567890-abcdef12",
            context_id="ctx-123456",
            command_id="cmd-789"
        )
        print(f"Status: {result.command.status}")
        
        # Cancel if taking too long
        import time
        import threading
        
        # Start command
        result = execute_command_async(host, token, cluster_id, context_id,
            "SELECT * FROM huge_table", "sql")
        command_id = result.command.id
        
        # Wait with timeout
        timeout = 30  # seconds
        start_time = time.time()
        
        while True:
            status = get_command_status(host, token, cluster_id, context_id, command_id)
            if status.status in ["Finished", "Error", "Cancelled"]:
                break
            if time.time() - start_time > timeout:
                print("Command taking too long, canceling...")
                cancel_command(host, token, cluster_id, context_id, command_id)
                break
            time.sleep(1)
    """
    client = get_workspace_client(host, token)
    
    # Wait for cancellation to complete
    command_status = client.command_execution.cancel_and_wait(
        cluster_id=cluster_id,
        context_id=context_id,
        command_id=command_id,
    )
    
    return CancelCommandResponse(
        command=_convert_command_status_to_model(command_status),
    )

