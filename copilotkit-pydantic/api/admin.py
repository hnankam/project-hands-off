"""Admin API endpoints for MCP server management."""

import asyncio
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pydantic_ai.mcp import MCPServerStdio, MCPServerSSE, MCPServerStreamableHTTP

from config import logger


# Pydantic models for request/response
class ServerConfig(BaseModel):
    transport: str
    command: Optional[str] = None
    args: Optional[list[str]] = None
    url: Optional[str] = None
    env: Optional[Dict[str, str]] = None


class TestServerRequest(BaseModel):
    serverConfig: ServerConfig


class TestServerResponse(BaseModel):
    message: str
    serverInfo: Optional[Dict[str, Any]] = None


class LoadToolsRequest(BaseModel):
    serverConfig: ServerConfig


class LoadToolsResponse(BaseModel):
    tools: list[Dict[str, Any]]


# Create router
router = APIRouter(prefix="/api/admin/mcp-servers", tags=["admin"])


@router.post("/test", response_model=TestServerResponse)
async def test_mcp_server_connectivity(request: TestServerRequest):
    """Test connectivity to an MCP server.
    
    Args:
        request: Server configuration to test
        
    Returns:
        TestServerResponse with connection status and server info
        
    Raises:
        HTTPException: If connection fails
    """
    try:
        config_dict = request.serverConfig.model_dump(exclude_none=True)
        transport = config_dict.get("transport", "stdio")
        
        logger.info(f"Testing MCP server connectivity: transport={transport}")
        
        # Create the appropriate MCP server instance based on transport
        mcp_server = None
        
        if transport == "stdio":
            command = config_dict.get("command")
            if not command:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "command is required for stdio transport"}
                )
            
            args = config_dict.get("args", [])
            env = config_dict.get("env", {})
            
            mcp_server = MCPServerStdio(
                command=command,
                args=args,
                env=env if env else None,
            )
            
        elif transport == "sse":
            url = config_dict.get("url")
            if not url:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "url is required for sse transport"}
                )
            
            mcp_server = MCPServerSSE(url=url)
            
        elif transport == "http":
            url = config_dict.get("url")
            if not url:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "url is required for http transport"}
                )
            
            mcp_server = MCPServerStreamableHTTP(url=url)
            
        else:
            raise HTTPException(
                status_code=400,
                detail={"error": f"Unsupported transport type: {transport}. Supported types: stdio, sse, http"}
            )
        
        # Test connectivity by listing tools with timeout
        try:
            tools_future = mcp_server.list_tools()
            await asyncio.wait_for(tools_future, timeout=5.0)
            
            server_info = {
                "transport": transport,
                "status": "connected",
            }
            
            logger.info(f"Successfully connected to MCP server")
            return TestServerResponse(
                message="Successfully connected to MCP server",
                serverInfo=server_info
            )
            
        except asyncio.TimeoutError:
            logger.error(f"MCP server connection timeout")
            raise HTTPException(
                status_code=504,
                detail={
                    "error": "Connection timeout",
                    "details": "Server did not respond within 5 seconds"
                }
            )
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test MCP server connectivity: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to connect to MCP server",
                "details": str(e)
            }
        )


@router.post("/{server_id}/tools", response_model=LoadToolsResponse)
async def load_mcp_server_tools(server_id: str, request: LoadToolsRequest):
    """Load all available tools from an MCP server.
    
    Args:
        server_id: The server ID (for logging purposes)
        request: Server configuration
        
    Returns:
        LoadToolsResponse with list of available tools
        
    Raises:
        HTTPException: If loading tools fails
    """
    try:
        config_dict = request.serverConfig.model_dump(exclude_none=True)
        transport = config_dict.get("transport", "stdio")
        
        logger.info(f"Loading tools from MCP server: {server_id}")
        
        # Create the appropriate MCP server instance based on transport
        mcp_server = None
        
        if transport == "stdio":
            command = config_dict.get("command")
            if not command:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "command is required for stdio transport"}
                )
            
            args = config_dict.get("args", [])
            env = config_dict.get("env", {})
            
            mcp_server = MCPServerStdio(
                command=command,
                args=args,
                env=env if env else None,
            )
            
        elif transport == "sse":
            url = config_dict.get("url")
            if not url:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "url is required for sse transport"}
                )
            
            mcp_server = MCPServerSSE(url=url)
            
        elif transport == "http":
            url = config_dict.get("url")
            if not url:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "url is required for http transport"}
                )
            
            mcp_server = MCPServerStreamableHTTP(url=url)
            
        else:
            raise HTTPException(
                status_code=400,
                detail={"error": f"Unsupported transport type: {transport}. Supported types: stdio, sse, http"}
            )
        
        # List tools with timeout
        try:
            tools_result = await asyncio.wait_for(
                mcp_server.list_tools(),
                timeout=10.0
            )
            
            logger.info(f"Tools result type: {type(tools_result)}, has tools attr: {hasattr(tools_result, 'tools')}")
            
            # Handle both list and object with tools attribute
            tools_to_process = []
            if isinstance(tools_result, list):
                tools_to_process = tools_result
                logger.info(f"Got direct list with {len(tools_result)} tools")
            elif hasattr(tools_result, 'tools'):
                tools_to_process = tools_result.tools or []
                logger.info(f"Got object with tools attribute containing {len(tools_to_process)} tools")
            else:
                logger.warning(f"Unexpected tools_result type: {type(tools_result)}")
            
            # Convert tools to dict format
            tools_list = []
            for tool in tools_to_process:
                logger.info(f"Processing tool: {tool.name}")
                tool_dict = {
                    "name": tool.name,
                    "description": tool.description or "",
                }
                
                # Add input schema if available
                if hasattr(tool, 'inputSchema'):
                    tool_dict["inputSchema"] = tool.inputSchema
                elif hasattr(tool, 'input_schema'):
                    tool_dict["inputSchema"] = tool.input_schema
                
                tools_list.append(tool_dict)
            
            logger.info(f"Loaded {len(tools_list)} tools from MCP server {server_id}")
            return LoadToolsResponse(tools=tools_list)
            
        except asyncio.TimeoutError:
            logger.error(f"Timeout loading tools from MCP server {server_id}")
            raise HTTPException(
                status_code=504,
                detail={
                    "error": "Timeout loading tools from MCP server",
                    "details": "The server took too long to respond"
                }
            )
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to load MCP server tools: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to load tools from MCP server",
                "details": str(e)
            }
        )


def register_admin_routes(app):
    """Register admin routes with the FastAPI app."""
    app.include_router(router)

